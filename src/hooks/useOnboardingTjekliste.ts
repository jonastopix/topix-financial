import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCommunityGaest } from "@/hooks/communityAdgang";
import { useAuth } from "@/hooks/useAuth";
import { byggTjekliste, type MaalTilTjekliste, type Tjekliste, type TjeklisteInput } from "@/lib/onboardingTjekliste";
import { harVelkomstvideo as doemVelkomstvideo } from "@/lib/appConfig";
import { KILDE_PRAESENTATION } from "@/lib/hjemmebane/praesentation";
import { RETNING_MODUL } from "@/lib/hjemmebane/oevelse";
import { erManglendeKolonne } from "@/lib/manglendeTabel";
import { getEffectiveReportPeriodKey, type ReportData } from "@/lib/financialUtils";

/**
 * Datalaget for onboarding-tjeklisten: henter datastykkerne for den
 * indloggede bruger og kører motoren (src/lib/onboardingTjekliste.ts —
 * seks punkter, seks steder, 2/10). Fladen regner INTET selv — den viser
 * det motoren afgør.
 *
 * Samme mønster som useAkademiData: react-query, nøgle pr. bruger, kun
 * aktiv når der er en bruger. Opslagene kører samlet i ÉN queryFn med
 * Promise.all (Members.tsx-mønstret), så boksen ikke tegner sig i trin.
 *
 * RÅDGIVERE HENTER IKKE: tjeklisten er medlemmets, og en rådgiver med
 * virksomheds-override ville ellers få et medlems tal blandet med sin
 * egen profil. `enabled` er false for dem, og hooken svarer null.
 *
 * Kilderne (målt 2/9, recon-onboarding-tjekliste.md §1):
 *   profiles.velkomstvideo_set_at               — self-only RLS
 *   profiles.avatar_url                          — samme opslag (17/9, Jonas «C»): fotoet er
 *     en del af «Din profil» (profilUdfyldt: tekst OG foto).
 *   profiles.created_at                          — samme opslag (14/9): grænsen
 *     for mål-punktet (kun medlemmer fra MAAL_PUNKT_FRA, 2/10 — før: delings-
 *     punktet, som udgik 2/10; deling_hentet_at læses ikke længere her).
 *   milestones: status, bekraeftet_at            — virksomhedens mål (2/10, punkt 4
 *     «Sæt dit første mål»). FAIL-SOFT som Dine mål (dineMaalGrundlag.
 *     hentMaalMedTal): mangler kolonnen bekraeftet_at (42703/PGRST204 —
 *     migration 20261002100000 ikke kørt), læses status alene, og
 *     bekraeftet_at er undefined på rækkerne = bekræftet (maalBekraeft.
 *     erBekraeftet). Enhver anden fejl er fatal som de andre opslag.
 *   member_profiles.ask_me_about                — rækken findes ikke før første gem → null
 *   companies.website, industry_label, cvr_number — brugerens egen virksomhed (companyId)
 *   financial_reports: report_period, manual_report_period_key,
 *     manual_override_status, deleted_at is null — virksomhedens uploads MED
 *     effektiv periode (instruks F, 16/9): tjeklisten skelner «kun måneder
 *     der ikke er omme» fra «en afsluttet måned der venter på godkendelse».
 *   financial_report_facts: count — virksomhedens GODKENDTE tal (9/9: punktet
 *     «Dine tal» er først gjort ved godkendelse, ikke ved upload)
 *   handouts: count, status = 'completed', user_id = mig, module <>
 *     'overordnet' (2/10, rådets fund 11: punktet hedder «Din første øvelse»,
 *     og overordnet er ikke en øvelse — retningen bor i Dine mål; et gammelt
 *     udfyldt «Målsætning 12 mdr.» må ikke krydse punktet af)
 *   conversations.last_member_message_at, member_id = mig — sat af triggeren
 *     på messages KUN for ikke-rådgivere (migration 20260311043341)
 *   app_config.velkomstvideo_guid — «Anyone authenticated can read config»
 *     (RLS USING true); tom/manglende = ingen video = velkomst udgår
 *   community_traade: count, forfatter_id = mig, kilde_type =
 *     'praesentation', status = 'aktiv' (11/9, kort 60). AKTIV, ikke blot
 *     «ikke slettet»: punktets formål er at medlemmet bliver set af de
 *     andre, og en tråd skjult af en rådgiver ses ikke. Medlemmets
 *     SELECT-policy viser i forvejen kun status = 'aktiv'
 *     (20260811160000:66-69), så dommen og RLS siger det samme. Fejl
 *     kaster (kraevRaekker-ånden).
 *
 * TRÅDRETTEN (kan_oprette_traad) er klientens sammensatte Community-dom:
 * !isLegat && membershipTier === "full" — MemberRoute (App.tsx:102-109)
 * plus abonnent-udelukkelsen (hbNav.ts:97) — OG ikke gæst (2/10-2026,
 * Jonas 14/9: «En gæst ser Community, men skriver ikke»; hooks/
 * communityAdgang.ts: vis_i_netvaerk = false uden slutdato giver tier
 * «full» i useAuth, men ingen skriveret i databasen). Der findes ingen
 * klient-funktion der svarer 1:1 til har_aktivt_medlemskab (målt 11/9).
 * Hooken venter på at tier OG gæstedommen er afgjort (null = uafgjort),
 * så punktet ikke dukker op midt i listen.
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
  /** profiles.created_at — personens dag 0 (TjeklisteInput.medlem_siden).
      Forsiden og skallen dømmer «erfarent medlem» på den
      (tjeklistenStyrerForsiden i lib/hjemmebane/ankomst.ts). null indtil
      hentet, og altid for rådgivere. */
  medlemSiden: string | null;
  isLoading: boolean;
  isError: boolean;
  /** Stempler profiles.velkomstvideo_set_at = now() og genindlæser. */
  markerVelkomstSet: () => Promise<void>;
  refetch: () => Promise<unknown>;
}

async function hentInput(
  userId: string,
  companyId: string,
  kanOpretteTraad: boolean,
): Promise<{ input: TjeklisteInput; velkomstvideoSetAt: string | null }> {
  const [profilRes, memberProfilRes, companyRes, rapporterRes, godkendteRes, handoutsRes, samtaleRes, velkomstRes, praesentationRes, maalRes] = await Promise.all([
    // velkomstvideo_set_at er ikke i de genererede typer endnu (se filhovedet).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("profiles") as any)
      .select("velkomstvideo_set_at, created_at, avatar_url")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("member_profiles").select("ask_me_about").eq("user_id", userId).maybeSingle(),
    supabase.from("companies").select("website, industry_label, cvr_number").eq("id", companyId).maybeSingle(),
    // Uploads med effektiv periode (instruks F, 16/9) — samme nøgle som
    // rapporteringssiden (getEffectiveReportPeriodKey: anvendt manuel
    // override vinder over den parsede periode-tekst).
    supabase
      .from("financial_reports")
      .select("report_period, manual_report_period_key, manual_override_status")
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
      .eq("status", "completed")
      .neq("module", RETNING_MODUL),
    supabase
      .from("conversations")
      .select("last_member_message_at")
      .eq("member_id", userId)
      .not("last_member_message_at", "is", null)
      .order("last_member_message_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("app_config").select("config_value").eq("config_key", "velkomstvideo_guid").maybeSingle(),
    // Præsentationen (11/9): én eksistens-tælling. status = 'aktiv' — en
    // skjult tråd ses ikke af de andre, og det er det punktet handler om
    // (se filhovedet). Samme dom som medlemmets SELECT-policy.
    supabase
      .from("community_traade")
      .select("id", { count: "exact", head: true })
      .eq("forfatter_id", userId)
      .eq("kilde_type", KILDE_PRAESENTATION)
      .eq("status", "aktiv"),
    // Målene (2/10, punkt 4): fail-soft på kolonnen bekraeftet_at — se filhovedet og hentMaal.
    hentMaal(companyId),
  ]);

  // Fejl i ét opslag vælter hele hentningen — en tjekliste med et gættet
  // punkt er værre end ingen tjekliste (samme holdning som FornyelsesSektion).
  const fejl = [profilRes, memberProfilRes, companyRes, rapporterRes, godkendteRes, handoutsRes, samtaleRes, velkomstRes, praesentationRes].find((r) => r.error);
  if (fejl?.error) throw new Error(fejl.error.message);

  const profil = (profilRes.data ?? null) as { velkomstvideo_set_at: string | null; created_at: string | null; avatar_url: string | null } | null;
  const velkomstvideoSetAt = profil?.velkomstvideo_set_at ?? null;
  // config_value er JSON (jsonb), ikke text: '""'::json er en TOM streng —
  // parset "" (nul tegn), rå «""» (to tegn). Begge skal give «ingen video»,
  // ellers vises en tom overlejring og punktet tælles med. Dommen er den
  // rene, testede funktion i src/lib/appConfig.ts (appConfigVelkomstvideo.test).
  const harVelkomstvideo = doemVelkomstvideo(velkomstRes.data?.config_value);
  const uploads = (rapporterRes.data ?? []) as { report_period: string | null; manual_report_period_key: string | null; manual_override_status: string | null }[];

  return {
    velkomstvideoSetAt,
    input: {
      har_velkomstvideo: harVelkomstvideo,
      velkomstvideo_set_at: velkomstvideoSetAt,
      kan_oprette_traad: kanOpretteTraad,
      har_praesentation: (praesentationRes.count ?? 0) > 0,
      ask_me_about: memberProfilRes.data?.ask_me_about ?? null,
      // Fotoet (17/9, Jonas «C»): profiles.avatar_url — self-only RLS, samme opslag som velkomsten.
      avatar_url: profil?.avatar_url ?? null,
      website: companyRes.data?.website ?? null,
      industry_label: companyRes.data?.industry_label ?? null,
      cvr_number: companyRes.data?.cvr_number ?? null,
      antal_rapporter: uploads.length,
      upload_perioder: uploads.map((r) => getEffectiveReportPeriodKey(r as unknown as ReportData)),
      antal_godkendte: godkendteRes.count ?? 0,
      antal_udfyldte_handouts: handoutsRes.count ?? 0,
      last_member_message_at: samtaleRes.data?.last_member_message_at ?? null,
      medlem_siden: profil?.created_at ?? null,
      maal: maalRes,
    },
  };
}

/**
 * Virksomhedens mål til punkt 4 — status og bekraeftet_at. Samme fail-soft
 * som Dine mål (dineMaalGrundlag.hentMaalMedTal, to lag her): svarer
 * databasen «kolonnen findes ikke» på bekraeftet_at, læses status alene, og
 * rækkerne bærer INGEN bekraeftet_at (undefined = modellen slået fra =
 * bekræftet, maalBekraeft.erBekraeftet). Enhver anden fejl kaster — en
 * tjekliste med et gættet punkt er værre end ingen (filhovedet). Kolonnen
 * står ikke i de genererede typer før migrationen — derfor `as unknown`.
 */
async function hentMaal(companyId: string): Promise<MaalTilTjekliste[]> {
  const medBekraeftelse = await supabase.from("milestones").select("status, bekraeftet_at").eq("company_id", companyId);
  if (!medBekraeftelse.error) {
    const raekker = (medBekraeftelse.data ?? []) as unknown as { status: string; bekraeftet_at: string | null }[];
    return raekker.map((m) => ({ status: m.status, bekraeftet_at: m.bekraeftet_at ?? null }));
  }
  if (!erManglendeKolonne(medBekraeftelse.error)) throw new Error(medBekraeftelse.error.message);
  const kunStatus = await supabase.from("milestones").select("status").eq("company_id", companyId);
  if (kunStatus.error) throw new Error(kunStatus.error.message);
  return (kunStatus.data ?? []).map((m) => ({ status: m.status }));
}

export function useOnboardingTjekliste(): OnboardingTjeklisteResultat {
  const { user, isAdvisor, isLegat, membershipTier, companyId } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";
  // Gæsten (2/10): null = uafgjort, true = gæst — «Præsentér dig» udgår (døren er lukket i datalaget).
  const gaest = useCommunityGaest();
  // Trådretten — klientens sammensatte Community-dom (se filhovedet).
  const kanOpretteTraad = !isLegat && membershipTier === "full" && gaest === false;
  // Tier null = uafgjort (useAuth henter den en runde efter companyId), og gæstedommen null = uafgjort:
  // ventes på, så præsentations-punktet ikke dukker op midt i listen.
  const aktiv = Boolean(userId) && !isAdvisor && Boolean(companyId) && membershipTier !== null && gaest !== null;

  const query = useQuery({
    queryKey: [TJEKLISTE_QUERY_KEY, userId, companyId, kanOpretteTraad],
    queryFn: () => hentInput(userId, companyId as string, kanOpretteTraad),
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
    medlemSiden: aktiv ? (query.data?.input.medlem_siden ?? null) : null,
    isLoading: aktiv && query.isLoading,
    isError: query.isError,
    markerVelkomstSet: () => stempel.mutateAsync(),
    refetch: () => query.refetch(),
  };
}
