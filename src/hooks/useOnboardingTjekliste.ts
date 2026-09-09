import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { byggTjekliste, type Tjekliste, type TjeklisteInput } from "@/lib/onboardingTjekliste";
import { harVelkomstvideo as doemVelkomstvideo } from "@/lib/appConfig";

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
 *   profiles.velkomstvideo_set_at               — self-only RLS
 *   member_profiles.ask_me_about                — rækken findes ikke før første gem → null
 *   companies.website, industry_label, cvr_number — brugerens egen virksomhed (companyId)
 *   financial_reports: count, deleted_at is null — virksomhedens uploads
 *   financial_report_facts: count — virksomhedens GODKENDTE tal (9/9: punktet
 *     «Dine tal» er først gjort ved godkendelse, ikke ved upload)
 *   handouts: count, status = 'completed', user_id = mig
 *   conversations.last_member_message_at, member_id = mig — sat af triggeren
 *     på messages KUN for ikke-rådgivere (migration 20260311043341)
 *   app_config.velkomstvideo_guid — «Anyone authenticated can read config»
 *     (RLS USING true); tom/manglende = ingen video = velkomst udgår
 *
 * velkomstvideo_set_at er ikke i de genererede typer endnu (kolonnen er
 * kørt 2/9, migration 20260902170000) — derfor `as any` på det ene opslag,
 * samme mønster som FornyelsesSektion bruger for company_fornyelse.
 */

export const TJEKLISTE_QUERY_KEY = "onboarding-tjekliste";

export interface OnboardingTjeklisteResultat {
  /** null indtil data er hentet, og altid null for rådgivere. */
  tjekliste: Tjekliste | null;
  /** Er der sat en velkomstvideo i platformconfig? Uden den vises overlejringen aldrig. */
  harVelkomstvideo: boolean;
  /** Rå værdi, så fladen kan afgøre om velkomsten skal vises. */
  velkomstvideoSetAt: string | null;
  isLoading: boolean;
  isError: boolean;
  /** Stempler profiles.velkomstvideo_set_at = now() og genindlæser. */
  markerVelkomstSet: () => Promise<void>;
  refetch: () => Promise<unknown>;
}

async function hentInput(userId: string, companyId: string): Promise<{ input: TjeklisteInput; velkomstvideoSetAt: string | null }> {
  const [profilRes, memberProfilRes, companyRes, rapporterRes, godkendteRes, handoutsRes, samtaleRes, velkomstRes] = await Promise.all([
    // velkomstvideo_set_at er ikke i de genererede typer endnu (se filhovedet).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("profiles") as any)
      .select("velkomstvideo_set_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("member_profiles").select("ask_me_about").eq("user_id", userId).maybeSingle(),
    supabase.from("companies").select("website, industry_label, cvr_number").eq("id", companyId).maybeSingle(),
    supabase
      .from("financial_reports")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    // Godkendte tal: én facts-række er nok — handlingen er medlemmets klik
    // «Gennemgå og godkend» (commit_report_facts). Company-scoped RLS.
    // data_basis-undtagelse: eksistens-tælling (head/count) — tjeklisten spørger om medlemmet HAR godkendt, ikke om tallet er målt; ingen talværdi læses
    supabase
      .from("financial_report_facts")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId),
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
    supabase.from("app_config").select("config_value").eq("config_key", "velkomstvideo_guid").maybeSingle(),
  ]);

  // Fejl i ét opslag vælter hele hentningen — en tjekliste med et gættet
  // punkt er værre end ingen tjekliste (samme holdning som FornyelsesSektion).
  const fejl = [profilRes, memberProfilRes, companyRes, rapporterRes, godkendteRes, handoutsRes, samtaleRes, velkomstRes].find((r) => r.error);
  if (fejl?.error) throw new Error(fejl.error.message);

  const profil = (profilRes.data ?? null) as { velkomstvideo_set_at: string | null } | null;
  const velkomstvideoSetAt = profil?.velkomstvideo_set_at ?? null;
  // config_value er JSON (jsonb), ikke text: '""'::json er en TOM streng —
  // parset "" (nul tegn), rå «""» (to tegn). Begge skal give «ingen video»,
  // ellers vises en tom overlejring og punktet tælles med. Dommen er den
  // rene, testede funktion i src/lib/appConfig.ts (appConfigVelkomstvideo.test).
  const harVelkomstvideo = doemVelkomstvideo(velkomstRes.data?.config_value);

  return {
    velkomstvideoSetAt,
    input: {
      har_velkomstvideo: harVelkomstvideo,
      velkomstvideo_set_at: velkomstvideoSetAt,
      ask_me_about: memberProfilRes.data?.ask_me_about ?? null,
      website: companyRes.data?.website ?? null,
      industry_label: companyRes.data?.industry_label ?? null,
      cvr_number: companyRes.data?.cvr_number ?? null,
      antal_rapporter: rapporterRes.count ?? 0,
      antal_godkendte: godkendteRes.count ?? 0,
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
    harVelkomstvideo: query.data?.input.har_velkomstvideo ?? false,
    velkomstvideoSetAt: query.data?.velkomstvideoSetAt ?? null,
    isLoading: aktiv && query.isLoading,
    isError: query.isError,
    markerVelkomstSet: () => stempel.mutateAsync(),
    refetch: () => query.refetch(),
  };
}
