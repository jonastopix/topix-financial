import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { byggTjekliste, type Tjekliste, type TjeklisteInput } from "@/lib/onboardingTjekliste";

/**
 * Datalaget for onboarding-tjeklisten: henter de seks datastykker for den
 * indloggede bruger og kører motoren (src/lib/onboardingTjekliste.ts).
 * Fladen regner INTET selv — den viser det motoren afgør.
 *
 * Samme mønster som useAkademiData: react-query, nøgle pr. bruger, kun
 * aktiv når der er en bruger. De seks opslag kører samlet i ÉN queryFn med
 * Promise.all (Members.tsx-mønstret), så boksen ikke tegner sig i seks
 * trin.
 *
 * RÅDGIVERE HENTER IKKE: tjeklisten er medlemmets, og en rådgiver med
 * virksomheds-override ville ellers få et medlems tal blandet med sin
 * egen profil. `enabled` er false for dem, og hooken svarer null.
 *
 * Kilderne (målt 2/9, recon-onboarding-tjekliste.md §1):
 *   profiles.velkomstvideo_set_at, avatar_url   — self-only RLS
 *   member_profiles.ask_me_about                — rækken findes ikke før første gem → null
 *   companies.website, industry_label, cvr_number — brugerens egen virksomhed (companyId)
 *   financial_reports: count, deleted_at is null — virksomhedens
 *   handouts: count, status = 'completed', user_id = mig
 *   conversations.last_member_message_at, member_id = mig — sat af triggeren
 *     på messages KUN for ikke-rådgivere (migration 20260311043341)
 *
 * velkomstvideo_set_at er ikke i de genererede typer endnu (kolonnen er
 * kørt 2/9, migration 20260902170000) — derfor `as any` på det ene opslag,
 * samme mønster som FornyelsesSektion bruger for company_fornyelse.
 */

export const TJEKLISTE_QUERY_KEY = "onboarding-tjekliste";

export interface OnboardingTjeklisteResultat {
  /** null indtil data er hentet, og altid null for rådgivere. */
  tjekliste: Tjekliste | null;
  /** Rå værdi, så fladen kan afgøre om velkomsten skal vises. */
  velkomstvideoSetAt: string | null;
  isLoading: boolean;
  isError: boolean;
  /** Stempler profiles.velkomstvideo_set_at = now() og genindlæser. */
  markerVelkomstSet: () => Promise<void>;
  refetch: () => Promise<unknown>;
}

async function hentInput(userId: string, companyId: string): Promise<{ input: TjeklisteInput; velkomstvideoSetAt: string | null }> {
  const [profilRes, memberProfilRes, companyRes, rapporterRes, handoutsRes, samtaleRes] = await Promise.all([
    // velkomstvideo_set_at er ikke i de genererede typer endnu (se filhovedet).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("profiles") as any)
      .select("avatar_url, velkomstvideo_set_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("member_profiles").select("ask_me_about").eq("user_id", userId).maybeSingle(),
    supabase.from("companies").select("website, industry_label, cvr_number").eq("id", companyId).maybeSingle(),
    supabase
      .from("financial_reports")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    supabase
      .from("handouts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed"),
    supabase
      .from("conversations")
      .select("last_member_message_at")
      .eq("member_id", userId)
      .not("last_member_message_at", "is", null)
      .order("last_member_message_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Fejl i ét opslag vælter hele hentningen — en tjekliste med et gættet
  // punkt er værre end ingen tjekliste (samme holdning som FornyelsesSektion).
  const fejl = [profilRes, memberProfilRes, companyRes, rapporterRes, handoutsRes, samtaleRes].find((r) => r.error);
  if (fejl?.error) throw new Error(fejl.error.message);

  const profil = (profilRes.data ?? null) as { avatar_url: string | null; velkomstvideo_set_at: string | null } | null;
  const velkomstvideoSetAt = profil?.velkomstvideo_set_at ?? null;

  return {
    velkomstvideoSetAt,
    input: {
      velkomstvideo_set_at: velkomstvideoSetAt,
      avatar_url: profil?.avatar_url ?? null,
      ask_me_about: memberProfilRes.data?.ask_me_about ?? null,
      website: companyRes.data?.website ?? null,
      industry_label: companyRes.data?.industry_label ?? null,
      cvr_number: companyRes.data?.cvr_number ?? null,
      antal_rapporter: rapporterRes.count ?? 0,
      antal_udfyldte_handouts: handoutsRes.count ?? 0,
      last_member_message_at: samtaleRes.data?.last_member_message_at ?? null,
    },
  };
}

export function useOnboardingTjekliste(): OnboardingTjeklisteResultat {
  const { user, isAdvisor, companyId } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";
  const aktiv = Boolean(userId) && !isAdvisor && Boolean(companyId);

  const query = useQuery({
    queryKey: [TJEKLISTE_QUERY_KEY, userId, companyId],
    queryFn: () => hentInput(userId, companyId as string),
    enabled: aktiv,
    staleTime: 60_000,
  });

  const stempel = useMutation({
    mutationFn: async () => {
      // profiles er nøglet på user_id (ikke id) — samme filter som Settings.
      // .select() bagefter, så et kald der rammer NUL rækker (RLS-filtreret,
      // forkert bruger, tom userId) ikke passerer som succes — husets kendte
      // fælde (FornyelsesSektion:134). Uden det ville stemplet «lykkes» uden
      // at noget blev skrevet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("profiles") as any)
        .update({ velkomstvideo_set_at: new Date().toISOString() })
        .eq("user_id", userId)
        .select("user_id, velkomstvideo_set_at");
      if (error) {
        console.error("[useOnboardingTjekliste] velkomstvideo_set_at kunne ikke skrives:", error);
        throw new Error(error.message);
      }
      if (!data || data.length === 0) {
        console.error(`[useOnboardingTjekliste] velkomstvideo_set_at ramte nul rækker for user ${userId} — intet gemt (RLS?)`);
        throw new Error("Stemplet ramte nul rækker — intet gemt.");
      }
    },
    onSuccess: async () => {
      // Ventes på, så boksen viser det nye punkt som gjort FØR overlejringen
      // lukker — ellers står velkomstvideoSetAt som null i et render til.
      await queryClient.invalidateQueries({ queryKey: [TJEKLISTE_QUERY_KEY, userId, companyId] });
    },
  });

  return {
    tjekliste: aktiv && query.data ? byggTjekliste(query.data.input) : null,
    velkomstvideoSetAt: query.data?.velkomstvideoSetAt ?? null,
    isLoading: aktiv && query.isLoading,
    isError: query.isError,
    markerVelkomstSet: () => stempel.mutateAsync(),
    refetch: () => query.refetch(),
  };
}
