/**
 * src/lib/boardroomScore/typer.ts — inddata og udfald for Boardroom Score.
 *
 * Designet står i docs/boardroom-score.md (30/9-2026). Motoren er REN:
 * ingen React, ingen Supabase. Hooken (src/hooks/useBoardroomScore.ts)
 * bygger ScoreGrundlag af financial_report_facts, companies.contract_start_date,
 * budget_targets og milestones (skive 3: Dine mål; før 2/10 kpi_targets) — alt
 * læst med medlemmets egen RLS.
 */

export interface ScoreMaaned {
  /** «YYYY-MM» (financial_report_facts.period_key). */
  key: string;
  /** Kun 'measured' indgår nogen steder — estimater er ikke måneder (data-basis-kontrakten). */
  basis: "measured" | "estimated";
  /**
   * Månedens FØRSTE godkendelse: den tidligste af hukommelsen
   * (maaned_foerste_godkendelse.foerst_godkendt_at — overlever «Erstat gammel
   * data» og permanent sletning) og facts-rækkens created_at
   * (streak.ts:tidligsteGodkendelse). committed_at læses aldrig (SENESTE,
   * overskrives ved gen-godkendelse). ISO-streng; null når ukendt.
   */
  foersteGodkendtAt: string | null;
  /** Canonical-nøgler (revenue, ebt, cash, payroll …). Manglende nøgle = umålt, aldrig 0. */
  metrics: Record<string, number | null>;
}

export interface ScoreGrundlag {
  maaneder: readonly ScoreMaaned[];
  /** companies.contract_start_date («YYYY-MM-DD») — afgrænser disciplin og streak; null = måneden efter tidligste første godkendelse (streak.ts:foersteTaellendeMaaned). */
  kontraktStart: string | null;
  /** Mindst én værdirække i budget_targets for indeværende år. */
  harBudgetForAaret: boolean;
  /** Mindst ét mål på Dine mål, der tæller (maalBekraeft.taellerSomScoreMaal: aktivt · bekræftet · frist · et tal-mål med måltal; art kræves ikke). Før skive 3-migrationen: mindst én række i kpi_targets. */
  harMaal: boolean;
}

export type SoejleNavn = "likviditet" | "indtjening" | "vaekst" | "disciplin";

export interface LikviditetDetaljer {
  bank: number;
  /** Måneden bankbeløbet er fra — kan være ældre end omkostningsvinduet. */
  bankKey: string;
  maanedligOmkostning: number;
  /** Antal måneder i omkostningsgennemsnittet (1–3). */
  omkostningsMaaneder: number;
  runwayMaaneder: number;
}

export interface IndtjeningDetaljer {
  omsaetning: number;
  resultat: number;
  /** resultat / omsaetning */
  margin: number;
  maaneder: string[];
}

export interface VaekstDetaljer {
  nu: number;
  foer: number;
  /** (nu − foer) / foer */
  vaekst: number;
  vindue: string[];
  sammenligning: "aar_til_aar" | "kvartal_til_kvartal";
}

export interface DisciplinDetaljer {
  /** Måneder i vinduet (frist passeret, efter kontraktstart), ældste først. */
  vindue: string[];
  maalte: number;
  rettidige: number;
  rytmePoint: number;
  rettidighedPoint: number;
  budgetPoint: number;
  maalPoint: number;
}

export type SoejleDetaljer = {
  likviditet: LikviditetDetaljer;
  indtjening: IndtjeningDetaljer;
  vaekst: VaekstDetaljer;
  disciplin: DisciplinDetaljer;
};

export type SoejleDom<N extends SoejleNavn = SoejleNavn> =
  | { navn: N; max: number; status: "ok"; point: number; detaljer: SoejleDetaljer[N] }
  | { navn: N; max: number; status: "ikke_nok_data"; grund: string };

/** De fire domme med hver sin detaljetype — bruges frem for Record<SoejleNavn, SoejleDom>, som taber koblingen navn → detaljer. */
export type Soejler = { [N in SoejleNavn]: SoejleDom<N> };

export type StreakStatus = "aktiv" | "brudt" | "ingen";

export interface StreakDom {
  laengde: number;
  status: StreakStatus;
  /** Længste streak i rækkerne (mindst `laengde`). */
  bedste: number;
  /** Den åbne måned (frist ikke passeret) er allerede godkendt til tiden. */
  aabenMaanedGodkendt: boolean;
  /** Den åbne måneds frist — det, der skal holdes for at streaken vokser. */
  naesteFrist: { key: string; tidspunkt: Date; hverdageTil: number };
}

export interface Handling {
  soejle: SoejleNavn;
  tekst: string;
  /** Gevinst i SAMLET score (0–1000-skalaen); null når den ikke kan regnes (søjlen mangler data). */
  gevinst: number | null;
  /** Skive 3 (2/10-2026): «Sæt et mål med en frist.» peger på Dine mål (/milestones); /kpis er pejlemærkerne og bruges ikke længere af en løfter. */
  sti: "/reports" | "/budget" | "/milestones" | null;
}

export interface ScoreDom {
  /** 0–1000 = Σ point over alle fire søjler (uden data = 0), eller null når færre end MIN_SOEJLER_MED_DATA søjler har data. */
  score: number | null;
  /** Andel af de 1000 point, der KAN optjenes nu (Σ max for søjler med data / 1000). Søjler uden data giver 0 point (1/10-2026). */
  daekning: number;
  soejler: Soejler;
  /** Samme dom med `nu` én måned tilbage på de måneder, der DA var godkendt — retningen; null når den ikke kan regnes. Budget/mål regnes som nu. */
  forrige: number | null;
  streak: StreakDom;
  handlinger: Handling[];
  loefterMest: Handling | null;
  /** Når score er null: hvad der mangler. */
  ikkeNokData: string | null;
}
