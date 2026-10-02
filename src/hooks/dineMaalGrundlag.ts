/**
 * dineMaalGrundlag — hentning og skrivning bag det nye «Dine mål» (1/10-2026,
 * Jonas 21:04 ja til designet; docs/dine-maal-design.md). Motoren er ren
 * (lib/hjemmebane/maalTal.ts); denne fil henter og skriver, så fladen
 * bagefter KUN tegner.
 *
 * Fire kilder:
 *   1. Månederne: SAMME query som Boardroom Score (boardroomScoreKey +
 *      hentScoreGrundlag) — react-query deler cachen på nøglen, så forsiden,
 *      hvor Score-kortet og «Dine mål» står sammen, henter facts ÉN gang.
 *      kontraktStart (tidslinjens start) kommer med derfra. Står Score
 *      «afventer_migration» (maaned_foerste_godkendelse findes ikke), ELLER
 *      FEJLER Score-hentningen (rådets fund 7), er månederne null, og
 *      tal-målene siger «Tallet kan ikke læses endnu» — siden vælter ikke.
 *      KUN en fejl i mål- eller skridt-hentningen er en sidefejl (isError).
 *   2. Målene: milestones med de nye kolonner (migration 20261001190000).
 *      FAIL-SOFT: svarer databasen «kolonnen findes ikke» (42703/PGRST204,
 *      lib/manglendeTabel.erManglendeKolonne), læses de gamle kolonner, de
 *      nye sættes til null, og `afventerMigration` er sand — alle mål står så
 *      som «Gør målet skarpt», og en skrivning af de nye felter afvises med
 *      grunden. Enhver ANDEN fejl kaster HentningsFejl (en fejl er ikke «ingen mål»).
 *   3. Skridtene: company_actions under de AKTUELLE mål-id'er (rådets fund 12:
 *      `.in("maal_id", …)` i bidder á 200 — ikke «de 500 ældste» for hele
 *      virksomheden), alle statusser (gjorte er historik og tidslinjens
 *      punkter), med created_at og expires_at (naesteSkridt: nyeste forslag;
 *      udløbne forslag sorteres fra). Nøglen står under «dine-maal», så
 *      invalidateQueries(["dine-maal"]) også rammer den.
 *   4. «Jeres retning» (Jonas 1/10 22:37): de tre svar fra handoutet
 *      'overordnet' (handouts.responses, nyeste række — hentRetning). Egen
 *      query under «dine-maal»; en fejl giver retningFejlede, ikke en sidefejl.
 *
 * SKIVE 3 (2/10-2026, Jonas' svar 1/10 kl. 22:04–22:09; lib/hjemmebane/
 * maalBekraeft.ts; migration 20261002100000): målene læses også med
 * `bekraeftet_at` og `source` (MAAL_KOLONNER_SKIVE3) — fail-soft i TRE lag:
 * skive 3 → skive 2 (art m.fl.) → de gamle. Mangler skive 3-kolonnerne, er
 * `bekraeftet_at` undefined på rækkerne, og bekræftelsesmodellen er slået
 * fra (alle mål tæller som i dag; `bekraeftelseAfventer` er sand). Kortene
 * er KUN de bekræftede aktive mål; de ubekræftede står i `bekraeftelser`
 * (forslag/gamle). Kvartalstjekkene læses af `maal_kvartalstjek`
 * (fail-soft: en manglende tabel er en tom liste — kvartalstjekFejlede for
 * enhver anden fejl) og dømmes af ventendeKvartalstjekAlle.
 *
 * SKRIVNINGEN går gennem den EKSISTERENDE vej: medlemmets klientskrivning på
 * milestones (som useMilestones — RLS uændret, politikkerne er på rækken;
 * migrationens filhoved). Rådgiveren skriver gennem maal-skriv, som IKKE kender
 * de nye felter endnu — den udvidelse kræver eksplicit udrulning og er ikke en
 * del af motoren. Ingen ny edge function. Efter en skrivning invalideres
 * «dine-maal», virksomhedssiden (["virksomhed", companyId]) og pulsens mål
 * (["pulse-milestones", companyId]) — invaliderEfterMaalSkrivning. useMilestones
 * (den gamle /milestones-liste) har INGEN react-query-nøgle (useState +
 * genhent); fladen kalder dens genhent selv (useDineMaalSkrivning's `efter`).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { boardroomScoreKey, GRUNDLAG_GENHENT_MS, DOM_UR_MS, hentScoreGrundlag, type ScoreHentning } from "@/hooks/useBoardroomScore";
import { kraevRaekke, kraevRaekker } from "@/lib/kraevRaekker";
import { erManglendeKolonne, erManglendeTabel } from "@/lib/manglendeTabel";
import { markerMaalNaaetKlik } from "@/hooks/maalNaaetKlik";
import { maalFejlTekst } from "@/lib/hjemmebane/maalFejl";
import { doemMaalFristModSkridt } from "@/lib/hjemmebane/skridtForslag";
import type { ScoreMaaned } from "@/lib/boardroomScore";
import type { TablesUpdate } from "@/integrations/supabase/types";
import {
  doemNytMaal,
  laesNoegle,
  maalKort,
  nuvaerendeTal,
  tidslinje,
  tidslinjeStart,
  type MaalKort,
  type MaalMedTal,
  type NytMaalInput,
  type SkridtTilMaal,
  type TalDom,
  type TidslinjeDom,
} from "@/lib/hjemmebane/maalTal";
import {
  delBekraeftelser,
  erBekraeftet,
  laesKvartalValg,
  ventendeKvartalstjekAlle,
  type BekraeftelsesDeling,
  type Kvartal,
  type KvartalstjekRaekke,
  type KvartalValg,
  type VentendeKvartalstjek,
} from "@/lib/hjemmebane/maalBekraeft";
import {
  RETNING_MODUL,
  RETNING_NOEGLER,
  retningFraHandout,
  retningStatus,
  retningTilResponses,
  vaelgRetningsRaekke,
  type Retning,
  type RetningNoegle,
  type RetningsRaekke,
} from "@/lib/hjemmebane/maalRetning";

/** Kolonnerne FØR migrationen — dem, alle mål har i dag. */
export const MAAL_KOLONNER_GAMLE = "id, title, status, deadline, created_at, target_value, current_value, unit";
/** Kolonnerne EFTER migrationen 20261001190000 (skive 2, KØRT 1/10). */
export const MAAL_KOLONNER_NYE = `${MAAL_KOLONNER_GAMLE}, art, maal_noegle, udgangspunkt, udgangspunkt_dato`;
/** Kolonnerne EFTER migrationen 20261002100000 (skive 3: bekræftelsen; source er gammel, men læses først her). */
export const MAAL_KOLONNER_SKIVE3 = `${MAAL_KOLONNER_NYE}, bekraeftet_at, bekraeftet_af, source`;
/** Kvartalstjekkets kolonner (maal_kvartalstjek, migration 20261002100000). */
export const KVARTALSTJEK_KOLONNER = "milestone_id, kvartal, valg, valgt_at";
/** source_type (fladen 1/10): «foreslået af …» under det næste skridt — maalTal.skridtKilde. */
export const SKRIDT_KOLONNER = "id, title, status, due_date, maal_id, closed_at, created_at, expires_at, source_type";
/** Mål-id'er pr. `.in("maal_id", …)` — URL'en holdes kort (200 uuid'er ≈ 7,4 kB). */
export const MAAL_ID_BID = 200;

export const dineMaalMaalKey = (companyId: string | undefined | null) => ["dine-maal", "maal-med-tal", companyId] as const;
/** Nøglen bærer mål-id'erne (sorteret), så et nyt mål giver en ny hentning af skridtene. */
export const dineMaalSkridtKey = (companyId: string | undefined | null, maalIds: readonly string[] = []) =>
  ["dine-maal", "skridt-til-maal", companyId, [...maalIds].sort().join(",")] as const;

export interface MaalHentning {
  maal: MaalMedTal[];
  /** Migrationen 20261001190000 er ikke kørt: de nye kolonner findes ikke (læst som null). */
  afventerMigration: boolean;
  /** Migrationen 20261002100000 (skive 3) er ikke kørt: bekraeftet_at er undefined på rækkerne — modellen er slået fra. */
  bekraeftelseAfventer: boolean;
}

type Raekke = Partial<MaalMedTal> & { id: string; title: string; status: string; created_at: string };

function tilMaal(r: Raekke): MaalMedTal {
  const m: MaalMedTal = {
    id: r.id,
    title: r.title,
    status: r.status,
    deadline: r.deadline ?? null,
    created_at: r.created_at,
    target_value: r.target_value ?? null,
    current_value: r.current_value ?? null,
    unit: r.unit ?? null,
    art: r.art ?? null,
    maal_noegle: r.maal_noegle ?? null,
    udgangspunkt: r.udgangspunkt ?? null,
    udgangspunkt_dato: r.udgangspunkt_dato ?? null,
  };
  // Skive 3: KUN når kolonnen er læst — undefined betyder «modellen er slået fra» (maalBekraeft.erBekraeftet).
  if ("bekraeftet_at" in r) m.bekraeftet_at = r.bekraeftet_at ?? null;
  if ("source" in r) m.source = r.source ?? null;
  return m;
}

/**
 * Virksomhedens mål — fail-soft i tre lag (skive 3 → skive 2 → de gamle):
 * mangler skive 3-kolonnerne (42703/PGRST204), læses skive 2's, og
 * `bekraeftelseAfventer` er sand; mangler også de, læses de gamle, og
 * `afventerMigration` er sand. Enhver ANDEN fejl kaster.
 */
export async function hentMaalMedTal(companyId: string): Promise<MaalHentning> {
  const hent = (kolonner: string) => supabase.from("milestones").select(kolonner).eq("company_id", companyId).order("created_at", { ascending: true });
  const skive3 = await hent(MAAL_KOLONNER_SKIVE3);
  if (!(skive3.error && erManglendeKolonne(skive3.error))) {
    const raekker = kraevRaekker(skive3 as unknown as { data: Raekke[] | null; error: { message: string } | null }, "milestones");
    return { maal: raekker.map(tilMaal), afventerMigration: false, bekraeftelseAfventer: false };
  }
  const ny = await hent(MAAL_KOLONNER_NYE);
  if (ny.error && erManglendeKolonne(ny.error)) {
    const gammel = await hent(MAAL_KOLONNER_GAMLE);
    const raekker = kraevRaekker(gammel as unknown as { data: Raekke[] | null; error: { message: string } | null }, "milestones");
    return { maal: raekker.map(tilMaal), afventerMigration: true, bekraeftelseAfventer: true };
  }
  const raekker = kraevRaekker(ny as unknown as { data: Raekke[] | null; error: { message: string } | null }, "milestones");
  return { maal: raekker.map(tilMaal), afventerMigration: false, bekraeftelseAfventer: true };
}

export const dineMaalKvartalstjekKey = (companyId: string | undefined | null) => ["dine-maal", "kvartalstjek", companyId] as const;

/**
 * Virksomhedens registrerede kvartalstjek (maal_kvartalstjek). FAIL-SOFT:
 * findes tabellen ikke (PGRST205/42P01), er svaret tomt — ingen tjek venter,
 * før migrationen er kørt. Enhver anden fejl kaster.
 */
export async function hentKvartalstjek(companyId: string): Promise<KvartalstjekRaekke[]> {
  // Tabellen er født i 20261002100000 og står ikke i types.ts endnu — derfor `as any`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (supabase.from("maal_kvartalstjek" as any).select(KVARTALSTJEK_KOLONNER).eq("company_id", companyId) as any);
  if (res?.error && erManglendeTabel(res.error)) return [];
  return kraevRaekker(res as { data: KvartalstjekRaekke[] | null; error: { message: string } | null }, "maal_kvartalstjek");
}

/** Bidder á `stoerrelse` — ren. */
export function iBidder<T>(liste: readonly T[], stoerrelse: number = MAAL_ID_BID): T[][] {
  const ud: T[][] = [];
  for (let i = 0; i < liste.length; i += stoerrelse) ud.push(liste.slice(i, i + stoerrelse));
  return ud;
}

/**
 * Skridtene under de givne mål (alle statusser) — `.in("maal_id", bid)` pr.
 * bid á 200 (fund 12). Ingen mål → ingen kald. Ældste først (created_at).
 */
export async function hentSkridtTilMaal(companyId: string, maalIds: readonly string[]): Promise<SkridtTilMaal[]> {
  const ider = [...new Set(maalIds)];
  if (ider.length === 0) return [];
  const svar = await Promise.all(
    iBidder(ider).map((bid) =>
      supabase.from("company_actions").select(SKRIDT_KOLONNER).eq("company_id", companyId).in("maal_id", bid).order("created_at", { ascending: true }),
    ),
  );
  const alle = svar.flatMap((res) => kraevRaekker(res as unknown as { data: SkridtTilMaal[] | null; error: { message: string } | null }, "company_actions"));
  return alle.sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? -1 : (a.created_at ?? "") > (b.created_at ?? "") ? 1 : 0));
}

// ── «Jeres retning» (Jonas 1/10 22:37): de tre svar fra handoutet 'overordnet' ──

export const RETNING_KOLONNER = "id, user_id, module, responses, updated_at, status";
export const dineMaalRetningKey = (companyId: string | undefined | null) => ["dine-maal", "retning", companyId] as const;

/**
 * Virksomhedens 'overordnet'-handout(s) — den nyeste vælges af
 * maalRetning.vaelgRetningsRaekke. RLS (KODELÆST i migrationshistorikken,
 * ikke målt i pg_policy): SELECT «Users can view own handouts» (auth.uid() =
 * user_id, 20260224071122) og «Advisors can view all handouts» (has_role
 * advisor); virksomhedspolitikkerne fra 20260224222456 blev DROPPET i
 * 20260310194637 (Security Patch 7). Et MEDLEM ser derfor kun sin EGEN række —
 * en medejers svar ses ikke; en RÅDGIVER ser alle virksomhedens. Filtret på
 * company_id er vores (rådgiveren ser alle virksomheder). Kaster ved fejl.
 */
export async function hentRetning(companyId: string): Promise<Retning> {
  const res = await supabase
    .from("handouts")
    .select(RETNING_KOLONNER)
    .eq("company_id", companyId)
    .eq("module", RETNING_MODUL)
    .order("updated_at", { ascending: false });
  const raekker = kraevRaekker(res as unknown as { data: RetningsRaekke[] | null; error: { message: string } | null }, "handouts");
  return retningFraHandout(vaelgRetningsRaekke(raekker));
}

export interface DineMaalGrundlag {
  maal: MaalMedTal[];
  skridt: SkridtTilMaal[];
  /** Registrerede kvartalstjek (skive 3); tom før migrationen. */
  kvartalstjek: KvartalstjekRaekke[];
  /** De målte måneder fra Score-grundlaget; null mens Score afventer sin migration, eller når Score-hentningen fejlede. */
  maaneder: ScoreMaaned[] | null;
  kontraktStart: string | null;
  afventerMigration: boolean;
  bekraeftelseAfventer: boolean;
}

export interface DineMaalSvar {
  grundlag: DineMaalGrundlag | undefined;
  /** Ét kort pr. AKTIVT, BEKRÆFTET mål (højst tre vises af fladen — MAX_AKTIVE_MAAL), ældste først. */
  kort: MaalKort[];
  /** Skive 3: de ubekræftede aktive mål — nye forslag og gamle mål (maalBekraeft.delBekraeftelser). */
  bekraeftelser: BekraeftelsesDeling;
  /** Skive 3: ventende kvartalstjek, ældste forfaldne først. */
  kvartalstjek: VentendeKvartalstjek[];
  /** Skive 3-migrationen er ikke kørt: bekræftelsesmodellen er slået fra (alle mål tæller som i dag). */
  bekraeftelseAfventer: boolean;
  /** Kvartalstjek-hentningen fejlede (ikke «tabellen mangler») — ikke en sidefejl. */
  kvartalstjekFejlede: boolean;
  tidslinje: TidslinjeDom | null;
  afventerMigration: boolean;
  /** Score-hentningen fejlede: tal-målene står «Tallet kan ikke læses endnu» — IKKE en sidefejl. */
  tallenFejlede: boolean;
  isLoading: boolean;
  /** KUN mål- eller skridt-hentningen (fund 7). */
  isError: boolean;
  error: unknown;
  /** «Jeres retning» — null mens den henter, eller når hentningen fejlede. */
  retning: Retning | null;
  /** Retnings-hentningen fejlede — som Score: ikke en sidefejl. */
  retningFejlede: boolean;
  /** Retningen henter stadig (rådets fund 6): fladen må ikke åbne en tom kladde oven på et svar, den endnu ikke har set. */
  retningHenter: boolean;
  /** Hookets tikkende ur (DOM_UR_MS) — fladens «nu» (fund 16), så eyebrow og frister ikke fryser ved mount. */
  nu: Date;
}

/**
 * Den rene samling: kort for de aktive, BEKRÆFTEDE mål (skive 3 — et ubekræftet
 * mål er et forslag, ikke et kort), de ubekræftede delt i forslag/gamle,
 * kvartalstjekkene og tidslinjen. Eksporteret, så den kan prøves uden React.
 */
export function byggDineMaal(g: DineMaalGrundlag, nu: Date): { kort: MaalKort[]; bekraeftelser: BekraeftelsesDeling; kvartalstjek: VentendeKvartalstjek[]; tidslinje: TidslinjeDom } {
  const aktive = g.maal.filter((m) => m.status === "active" && erBekraeftet(m));
  return {
    kort: aktive.map((m) => maalKort(m, g.skridt, g.maaneder, nu)),
    bekraeftelser: delBekraeftelser(g.maal),
    kvartalstjek: ventendeKvartalstjekAlle(g.maal, g.kvartalstjek, nu),
    tidslinje: tidslinje(g.maal, g.skridt, tidslinjeStart(g.kontraktStart, g.maal, nu), nu),
  };
}

/**
 * Grundlaget af de tre hentninger (ren — fund 7): mål og skridt SKAL være
 * hentet; Score må mangle, når den har FEJLET (så er månederne og
 * kontraktstarten null), men venter, mens den henter.
 */
export function samlGrundlag(
  maal: MaalHentning | undefined,
  skridt: SkridtTilMaal[] | undefined,
  score: { data: ScoreHentning | undefined; isError: boolean },
  // Skive 3: kvartalstjekkene må mangle, når hentningen har FEJLET (tom liste — intet tjek vises); venter, mens den henter.
  kvartalstjek: { data: KvartalstjekRaekke[] | undefined; isError: boolean } = { data: [], isError: false },
): DineMaalGrundlag | undefined {
  if (!maal || !skridt) return undefined;
  if (!score.data && !score.isError) return undefined;
  if (!kvartalstjek.data && !kvartalstjek.isError) return undefined;
  const klar = score.data?.tilstand === "klar" ? score.data.grundlag : null;
  return {
    maal: maal.maal,
    skridt,
    kvartalstjek: kvartalstjek.data ?? [],
    maaneder: klar ? [...klar.maaneder] : null,
    kontraktStart: klar?.kontraktStart ?? null,
    afventerMigration: maal.afventerMigration,
    bekraeftelseAfventer: maal.bekraeftelseAfventer,
  };
}

export function useDineMaalGrundlag(overrideCompanyId?: string): DineMaalSvar {
  const { user, companyId: authCompanyId } = useAuth();
  const companyId = overrideCompanyId ?? authCompanyId;
  const aktiv = !!user && !!companyId;

  // Samme nøgle og samme hentning som useBoardroomScore — én facts-hentning pr. side.
  const score = useQuery({
    queryKey: boardroomScoreKey(companyId ?? undefined),
    queryFn: () => hentScoreGrundlag(companyId!, new Date()),
    enabled: aktiv,
    staleTime: GRUNDLAG_GENHENT_MS,
    refetchInterval: GRUNDLAG_GENHENT_MS,
  });
  const maal = useQuery({ queryKey: dineMaalMaalKey(companyId), queryFn: () => hentMaalMedTal(companyId!), enabled: aktiv, staleTime: 60_000 });
  const maalIds = useMemo(() => (maal.data ? maal.data.maal.map((m) => m.id) : []), [maal.data]);
  const skridt = useQuery({
    queryKey: dineMaalSkridtKey(companyId, maalIds),
    queryFn: () => hentSkridtTilMaal(companyId!, maalIds),
    enabled: aktiv && !!maal.data,
    staleTime: 60_000,
  });
  const retning = useQuery({ queryKey: dineMaalRetningKey(companyId), queryFn: () => hentRetning(companyId!), enabled: aktiv, staleTime: 60_000 });
  // Skive 3: kvartalstjekkene — egen nøgle under «dine-maal»; fail-soft (tabellen mangler → tom).
  const kvartalstjek = useQuery({ queryKey: dineMaalKvartalstjekKey(companyId), queryFn: () => hentKvartalstjek(companyId!), enabled: aktiv, staleTime: 60_000 });

  // Uret (som Score): sporet og fristerne afhænger af `nu`.
  const [nuMs, setNuMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNuMs(Date.now()), DOM_UR_MS);
    return () => window.clearInterval(id);
  }, []);

  const grundlag = useMemo(
    () => samlGrundlag(maal.data, skridt.data, { data: score.data, isError: score.isError }, { data: kvartalstjek.data, isError: kvartalstjek.isError }),
    [maal.data, skridt.data, score.data, score.isError, kvartalstjek.data, kvartalstjek.isError],
  );

  const nu = useMemo(() => new Date(nuMs), [nuMs]);
  const bygget = useMemo(() => (grundlag ? byggDineMaal(grundlag, nu) : null), [grundlag, nu]);

  return {
    grundlag,
    kort: bygget?.kort ?? [],
    bekraeftelser: bygget?.bekraeftelser ?? { forslag: [], gamle: [] },
    kvartalstjek: bygget?.kvartalstjek ?? [],
    bekraeftelseAfventer: maal.data?.bekraeftelseAfventer ?? false,
    kvartalstjekFejlede: kvartalstjek.isError,
    tidslinje: bygget?.tidslinje ?? null,
    afventerMigration: maal.data?.afventerMigration ?? false,
    tallenFejlede: score.isError,
    isLoading: (score.isLoading && !score.isError) || maal.isLoading || (!!maal.data && skridt.isLoading) || (kvartalstjek.isLoading && !kvartalstjek.isError),
    isError: maal.isError || skridt.isError,
    error: maal.error ?? skridt.error,
    retning: retning.data ?? null,
    retningFejlede: retning.isError,
    retningHenter: retning.isLoading,
    nu,
  };
}

// ── Skrivning (medlemmets klientvej, som useMilestones) ──────────────────────

export type SkriveSvar = { ok: true; id: string | null } | { ok: false; grund: string; afventerMigration: boolean };

export const AFVENTER_MIGRATION_TEKST = "Målene kan ikke gemmes med tal endnu — opdateringen er på vej.";
export const IKKE_AKTIVT_TEKST = "Kun et aktivt mål kan gøres skarpt — aktivér målet først.";
export const ALLEREDE_SKARPT_TEKST = "Målet er allerede gjort skarpt — genindlæs siden.";
export const MAAL_FINDES_IKKE_TEKST = "Målet findes ikke længere — genindlæs siden.";
export const SKARPT_NUL_RAEKKER_TEKST = "Målet blev ikke gjort skarpt — det er allerede skarpt, ikke længere aktivt, eller du har ikke adgang til det.";

function fejlSvar(error: { code?: string | null; message?: string | null }, ellers: string): SkriveSvar {
  if (erManglendeKolonne(error)) return { ok: false, grund: AFVENTER_MIGRATION_TEKST, afventerMigration: true };
  return { ok: false, grund: maalFejlTekst(error, ellers), afventerMigration: false };
}

/**
 * Det nuværende tal, dommen sammenligner udgangspunktet med (fund 15): for en
 * husnøgle regnet af de godkendte måneder; for andet_tal/begivenhed intet.
 * Månederne null (Score afventer/fejlede) → null → dommen afviser en husnøgle.
 */
export function nuvaerendeForInput(input: NytMaalInput, maaneder: readonly ScoreMaaned[] | null, nu: Date): TalDom | null {
  const noegle = input.art === "tal" ? laesNoegle(input.noegle) : null;
  if (!noegle || noegle === "andet_tal" || maaneder === null) return null;
  return nuvaerendeTal(noegle, maaneder, nu);
}

/**
 * Opret et mål fra guiden. Dommen (doemNytMaal) først — fail-closed, med
 * det nuværende tal regnet af SAMME måneder som kortet; derefter ÉN insert
 * gennem medlemmets RLS. «Højst tre aktive» dømmes af databasen (trigger
 * 20260917150000) og oversættes af maalFejlTekst.
 */
export async function opretMaalMedTal(args: {
  companyId: string;
  userId: string;
  input: NytMaalInput;
  nu: Date;
  maaneder: readonly ScoreMaaned[] | null;
}): Promise<SkriveSvar> {
  const dom = doemNytMaal(args.input, args.nu, nuvaerendeForInput(args.input, args.maaneder, args.nu));
  if (dom.ok === false) return { ok: false, grund: dom.grund, afventerMigration: false };
  const payload = {
    ...dom.felter,
    company_id: args.companyId,
    user_id: args.userId,
    source: "manual",
    category: "other",
    progress: 0,
    status: "active",
  };
  // Skive 3: et mål, medlemmet selv sætter, er bekræftet fra fødslen (bekraeftet_at = nu, bekraeftet_af =
  // medlemmet). Mangler kolonnerne (migrationen ikke kørt: PGRST204), skrives målet UDEN dem — som i dag.
  const medBekraeftelse = { ...payload, bekraeftet_at: args.nu.toISOString(), bekraeftet_af: args.userId };
  let svar = await supabase.from("milestones").insert(medBekraeftelse as never).select("id").maybeSingle();
  if (svar.error && erManglendeKolonne(svar.error)) svar = await supabase.from("milestones").insert(payload).select("id").maybeSingle();
  const { data, error } = svar;
  if (error) return fejlSvar(error, "Kunne ikke oprette målet");
  return { ok: true, id: (data as { id: string } | null)?.id ?? null };
}

// ── Skive 3: bekræftelsen, slip og kvartalstjekket (medlemmets klientvej, samme RLS) ──

export const BEKRAEFT_NUL_RAEKKER_TEKST = "Målet blev ikke bekræftet — det er allerede bekræftet, ikke længere aktivt, eller du har ikke adgang til det.";
export const SLIP_NUL_RAEKKER_TEKST = "Målet blev ikke parkeret — det er ikke længere aktivt, eller du har ikke adgang til det.";
export const KVARTALSTJEK_UGYLDIG_TEKST = "Kvartalstjekket kunne ikke registreres — ugyldigt valg.";
export const KVARTALSTJEK_IKKE_GEMT_TEKST = "Valget er gemt, men kvartalstjekket blev ikke registreret — det vises igen næste gang.";

/**
 * «Det er vores mål» / «Behold»: bekraeftet_at = nu, bekraeftet_af = medlemmet.
 * Gennem den eksisterende RLS («Company members can update company milestones»
 * dækker også et mål, en rådgiver skrev). UPDATE guardet på
 * `.is("bekraeftet_at", null).eq("status", "active")` — nul rækker er en
 * tydelig fejl, aldrig en stille overskrivning.
 */
export async function bekraeftMaal(args: { maalId: string; userId: string; nu: Date }): Promise<SkriveSvar> {
  const { data, error } = await supabase
    .from("milestones")
    .update({ bekraeftet_at: args.nu.toISOString(), bekraeftet_af: args.userId } as never)
    .eq("id", args.maalId)
    .is("bekraeftet_at" as never, null)
    .eq("status", "active")
    .select("id");
  if (error) return fejlSvar(error, "Kunne ikke bekræfte målet");
  if (!data || (data as unknown[]).length === 0) return { ok: false, grund: BEKRAEFT_NUL_RAEKKER_TEKST, afventerMigration: false };
  return { ok: true, id: args.maalId };
}

/** «Ikke nu» / «Slip» / kvartalstjekkets «Parkér»: status 'parked' — SLET aldrig. Guardet på status 'active'. */
export async function slipMaal(args: { maalId: string }): Promise<SkriveSvar> {
  const { data, error } = await supabase.from("milestones").update({ status: "parked" }).eq("id", args.maalId).eq("status", "active").select("id");
  if (error) return fejlSvar(error, "Kunne ikke parkere målet");
  if (!data || (data as unknown[]).length === 0) return { ok: false, grund: SLIP_NUL_RAEKKER_TEKST, afventerMigration: false };
  return { ok: true, id: args.maalId };
}

/**
 * Registrér et kvartalstjek: én række i maal_kvartalstjek (RLS: medlem af
 * virksomheden, valgt_af = auth.uid(), målet hører til virksomheden). Kaldes
 * EFTER handlingen (behold: ingen; justeret: efter gemt; parkeret/naaet: efter
 * statusskrivningen) — fejler rækken, står kortet igen næste gang (harmløst);
 * UNIQUE (milestone_id, kvartal) gør en gentagelse til 23505, som også er «ikke gemt».
 */
export async function registrerKvartalstjek(args: { maalId: string; companyId: string; userId: string; kvartal: Kvartal; valg: KvartalValg }): Promise<SkriveSvar> {
  if (laesKvartalValg(args.valg) === null) return { ok: false, grund: KVARTALSTJEK_UGYLDIG_TEKST, afventerMigration: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (supabase.from("maal_kvartalstjek" as any).insert({ milestone_id: args.maalId, company_id: args.companyId, kvartal: args.kvartal, valg: args.valg, valgt_af: args.userId }).select("id").maybeSingle() as any);
  if (res?.error) {
    if (erManglendeTabel(res.error)) return { ok: false, grund: AFVENTER_MIGRATION_TEKST, afventerMigration: true };
    return { ok: false, grund: KVARTALSTJEK_IKKE_GEMT_TEKST, afventerMigration: false };
  }
  return { ok: true, id: (res?.data as { id: string } | null)?.id ?? null };
}

/**
 * «Gør målet skarpt»: et eksisterende mål får art, nøgle, tal og frist —
 * samme dom som oprettelsen, plus (rådets fund 3 og 4):
 *   1. dommen over input (doemNytMaal) — fail-closed, ingen databasekald ved nej;
 *   2. målet slås op: findes det ikke → nej; status SKAL være 'active'; art SKAL
 *      være NULL (et skarpt mål gøres ikke skarpt igen);
 *   3. den nye frist dømmes mod målets ÅBNE skridt (active/proposed) med
 *      doemMaalFristModSkridt — SAMME dom som medlemmets flade og maal-skriv
 *      «rediger» — FØR skrivningen;
 *   4. UPDATE guardet på den forventede nuværende tilstand
 *      (`.is("art", null).eq("status", "active")`): et mål, der imens er gjort
 *      skarpt eller parkeret, rammer NUL rækker → tydelig fejl, aldrig en
 *      stille overskrivning;
 *   5. de gamle tal NULSTILLES IKKE: current_value skrives aldrig (bevares),
 *      og et begivenhedsmål skriver heller ikke target_value (artens måltal 1
 *      læses ikke af noget). Guiden har fået de gamle tal som forslag
 *      (maalTal.skarptForslag).
 * Status, progress og skridt røres ikke.
 */
export async function goerMaalSkarpt(args: {
  maalId: string;
  input: NytMaalInput;
  nu: Date;
  maaneder: readonly ScoreMaaned[] | null;
}): Promise<SkriveSvar> {
  const dom = doemNytMaal(args.input, args.nu, nuvaerendeForInput(args.input, args.maaneder, args.nu));
  if (dom.ok === false) return { ok: false, grund: dom.grund, afventerMigration: false };

  const maalRes = await supabase.from("milestones").select("id, status, art").eq("id", args.maalId).maybeSingle();
  if (maalRes.error) return fejlSvar(maalRes.error, "Kunne ikke læse målet");
  const maal = kraevRaekke(maalRes as unknown as { data: { id: string; status: string; art: string | null } | null; error: null }, "milestones");
  if (!maal) return { ok: false, grund: MAAL_FINDES_IKKE_TEKST, afventerMigration: false };
  if (maal.status !== "active") return { ok: false, grund: IKKE_AKTIVT_TEKST, afventerMigration: false };
  if (maal.art !== null && maal.art !== undefined) return { ok: false, grund: ALLEREDE_SKARPT_TEKST, afventerMigration: false };

  const skridtRes = await supabase
    .from("company_actions")
    .select("id, title, status, due_date")
    .eq("maal_id", args.maalId)
    .in("status", ["active", "proposed"]);
  if (skridtRes.error) return { ok: false, grund: "Kunne ikke læse målets skridt — prøv igen", afventerMigration: false };
  const fristDom = doemMaalFristModSkridt(dom.felter.deadline, (skridtRes.data ?? []) as { status: string; due_date: string | null; title: string }[]);
  if (fristDom.ok === false) return { ok: false, grund: fristDom.grund, afventerMigration: false };

  const payload = skarpPayload(dom.felter);
  const { data, error } = await supabase.from("milestones").update(payload).eq("id", args.maalId).is("art", null).eq("status", "active").select("id");
  if (error) return fejlSvar(error, "Kunne ikke gemme målet");
  // RLS eller guarden kan afvise en UPDATE med NUL rækker uden fejl — det er ikke et «gemt».
  if (!data || (data as unknown[]).length === 0) return { ok: false, grund: SKARPT_NUL_RAEKKER_TEKST, afventerMigration: false };
  return { ok: true, id: args.maalId };
}

/**
 * Det, «Gør målet skarpt» skriver (ren — fund 4): dommens felter UDEN
 * current_value (bevares altid) og — for et begivenhedsmål — uden target_value
 * (artens måltal 1 læses ikke af noget; det gamle måltal står). unit skrives
 * kun, når dommen har en (andet_tal — fund 5).
 */
export function skarpPayload(f: Extract<ReturnType<typeof doemNytMaal>, { ok: true }>["felter"]): TablesUpdate<"milestones"> {
  const payload: TablesUpdate<"milestones"> = {
    title: f.title,
    art: f.art,
    maal_noegle: f.maal_noegle,
    udgangspunkt: f.udgangspunkt,
    udgangspunkt_dato: f.udgangspunkt_dato,
    deadline: f.deadline,
  };
  if (f.art === "tal") payload.target_value = f.target_value;
  if (f.unit !== undefined) payload.unit = f.unit;
  return payload;
}

export const RETNING_IKKE_GEMT_TEKST = "Retningen blev ikke gemt — du har ikke adgang til rækken. Genindlæs siden.";
/** Fund 6: tre tomme svar gemmes aldrig oven på svar, der findes — en tom kladde må ikke slette retningen. */
export const RETNING_TOM_OVER_SVAR_TEKST = "Retningen blev ikke gemt — alle tre svar er tomme, og der står allerede svar. Skriv mindst ét svar, eller fortryd.";

/** Ren: er ALLE de tre svar tomme (efter trim)? Et manglende svar tæller som tomt. */
export function alleRetningssvarTomme(svar: Partial<Record<RetningNoegle, string>>): boolean {
  return RETNING_NOEGLER.every((n) => (svar[n] ?? "").trim() === "");
}

/**
 * Gem de tre retningssvar i medlemmets EGEN 'overordnet'-handout — samme
 * tabel, samme RLS og samme klient som handoutet (handoutEngine.saveHandout):
 *   1. dommen (retningTilResponses) over de NYE svar — fail-closed, intet kald ved nej
 *      ud over opslaget;
 *   2. egen række slås op (UNIQUE (user_id, module), så højst én);
 *   2b. FAIL-CLOSED (fund 6): er alle tre nye svar tomme, og har rækken allerede
 *      mindst ét svar, gemmes intet (RETNING_TOM_OVER_SVAR_TEKST) — en kladde,
 *      fladen åbnede før svarene var hentet, må ikke slette dem;
 *   3. FINDES den: UPDATE af KUN responses (fletningen bevarer handoutets øvrige
 *      svar) og — kun fra 'not_started' — status 'in_progress'
 *      (maalRetning.retningStatus). saveHandout bruges BEVIDST ikke til
 *      opdateringen: den skriver hele rækken og sætter status ud fra indholdet,
 *      så et UDFYLDT handout ville blive genåbnet ('completed' → 'in_progress').
 *      Guardet på id OG user_id; nul rækker = ikke gemt (RLS afviser stille);
 *   4. findes den IKKE: INSERT med module 'overordnet' i samme form som
 *      saveHandout (user_id, company_id, responses, checklist {}, levers [],
 *      status). RLS «Users can insert own handouts» kræver user_id = auth.uid()
 *      og company_id = user_company_id(auth.uid()) (20260310194637).
 * Kendt: læs-flet-skriv uden lås — en samtidig autosave i handoutet kan
 * overskrive de tre nøgler (eller omvendt). Samme forbehold som handoutets egen
 * autosave i to faner.
 */
export async function gemRetning(args: {
  companyId: string;
  userId: string;
  svar: Partial<Record<RetningNoegle, string>>;
}): Promise<SkriveSvar> {
  const egen = await supabase
    .from("handouts")
    .select(RETNING_KOLONNER)
    .eq("user_id", args.userId)
    .eq("module", RETNING_MODUL)
    .maybeSingle();
  if (egen.error) return { ok: false, grund: "Kunne ikke læse retningen — prøv igen", afventerMigration: false };
  const raekke = (egen.data ?? null) as RetningsRaekke | null;
  if (raekke && alleRetningssvarTomme(args.svar) && retningFraHandout(raekke).besvaret > 0) {
    return { ok: false, grund: RETNING_TOM_OVER_SVAR_TEKST, afventerMigration: false };
  }

  const dom = retningTilResponses(raekke?.responses ?? {}, args.svar);
  if (dom.ok === false) return { ok: false, grund: dom.grund, afventerMigration: false };
  const status = retningStatus(raekke?.status ?? null, dom.harIndhold);

  if (raekke) {
    const payload: Record<string, unknown> = { responses: dom.responses };
    if (status !== raekke.status) payload.status = status;
    const { data, error } = await supabase.from("handouts").update(payload).eq("id", raekke.id).eq("user_id", args.userId).select("id");
    if (error) return { ok: false, grund: "Kunne ikke gemme retningen — prøv igen", afventerMigration: false };
    if (!data || (data as unknown[]).length === 0) return { ok: false, grund: RETNING_IKKE_GEMT_TEKST, afventerMigration: false };
    return { ok: true, id: raekke.id };
  }

  const ny = {
    user_id: args.userId,
    company_id: args.companyId,
    module: RETNING_MODUL,
    responses: dom.responses,
    checklist: {},
    levers: [],
    status,
  };
  const { data, error } = await supabase.from("handouts").insert(ny as never).select("id").maybeSingle();
  if (error) return { ok: false, grund: "Kunne ikke gemme retningen — prøv igen", afventerMigration: false };
  return { ok: true, id: (data as { id: string } | null)?.id ?? null };
}

/** Nøglerne, en mål-skrivning gør forældede (fund 17). useMilestones har ingen — den genhenter selv.
    Skive 3: også forsidens kilder (["boardroom"] — milestonesQuery/fokus) og Score (harMaal læser målene). */
export const maalSkrivningNoegler = (companyId: string): readonly (readonly unknown[])[] => [
  ["dine-maal"],
  ["virksomhed", companyId],
  ["pulse-milestones", companyId],
  ["boardroom"],
  ["boardroom-score"],
];

export async function invaliderEfterMaalSkrivning(qc: Pick<QueryClient, "invalidateQueries">, companyId: string): Promise<void> {
  await Promise.all(maalSkrivningNoegler(companyId).map((queryKey) => qc.invalidateQueries({ queryKey: [...queryKey] })));
}

/**
 * Skrivevejen med invalidering: efter et JA invalideres nøglerne, og `efter`
 * kaldes (fladen giver useMilestones' genhent). Et NEJ invaliderer intet.
 */
export function useDineMaalSkrivning(opts: { companyId: string | null | undefined; efter?: () => void }) {
  const qc = useQueryClient();
  const { companyId, efter } = opts;
  return useMemo(() => {
    const ryd = async (svar: SkriveSvar): Promise<SkriveSvar> => {
      if (svar.ok && companyId) {
        await invaliderEfterMaalSkrivning(qc, companyId);
        efter?.();
      }
      return svar;
    };
    return {
      opret: async (args: Parameters<typeof opretMaalMedTal>[0]) => ryd(await opretMaalMedTal(args)),
      goerSkarpt: async (args: Parameters<typeof goerMaalSkarpt>[0]) => ryd(await goerMaalSkarpt(args)),
      // Retningens nøgle står under «dine-maal» (dineMaalRetningKey) — samme invalidering.
      gemRetning: async (args: Parameters<typeof gemRetning>[0]) => ryd(await gemRetning(args)),
      // Skive 3.
      bekraeft: async (args: Parameters<typeof bekraeftMaal>[0]) => ryd(await bekraeftMaal(args)),
      slip: async (args: Parameters<typeof slipMaal>[0]) => ryd(await slipMaal(args)),
      // «Nået» er et menneskes klik og bor i hooks/maalNaaetKlik (maalTal.guard dom 7: denne fil skriver aldrig completed).
      markerNaaet: async (args: Parameters<typeof markerMaalNaaetKlik>[0]) => ryd(await markerMaalNaaetKlik(args)),
      registrerKvartalstjek: async (args: Parameters<typeof registrerKvartalstjek>[0]) => ryd(await registrerKvartalstjek(args)),
    };
  }, [qc, companyId, efter]);
}
