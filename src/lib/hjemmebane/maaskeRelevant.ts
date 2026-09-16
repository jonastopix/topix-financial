/**
 * src/lib/hjemmebane/maaskeRelevant.ts
 *
 * «Måske relevant for dig» — lektionen der passer til ugens fokus (Jonas
 * 16/9; mangellisten «Måske relevant for dig» — agenten ser indholdslaget:
 * «regelbaseret V1, ikke AI: samme mapping som handout → lektion
 * (handout_module) + video-ratingens «hjalp den?» som vægt. Når ugens fokus
 * handler om X, peger platformen på lektionen om X»). Ren dom, ingen React,
 * ingen Supabase — testet i __tests__/maaskeRelevant.test.ts; fladen er én
 * stille linje under fokuskortet på medlemmets forside (BoardroomView).
 *
 * HVAD UGENS FOKUS VED OM SIT EMNE (målt 16/9): weekly_focus bærer ingen
 * kategori og intet modul — kun triggers_fired (T1–T9, generate-weekly-focus
 * :183-393) og trigger_data. Kun HANDOUT_OVERDUE bærer et handout-modul i
 * data (trigger_data.HANDOUT_OVERDUE[].module, :356-362). Resten oversættes
 * her med en REGELTABEL (MODUL_FOR_TRIGGER) — ingen ny kolonne, ingen AI:
 *   økonomi-triggerne (BUDGET_DEVIATION, KPI_OFF_TARGET, BENCHMARK_BELOW,
 *   POSITIVE_MOMENTUM, NO_REPORT_60_DAYS) → 'bogholderi' (handoutConfig:
 *   «Bogholderi — Få styr på dine tal og økonomistyring»); milepæls-
 *   triggerne (MILESTONE_DUE_SOON, MILESTONE_STALLED) → 'overordnet'
 *   («Målsætning 12 mdr.»); REPORT_UPLOADED alene → intet modul (ugens
 *   fokus er da «quiet», :398-410). Tabellen er en regel, ikke en beslutning
 *   — ændres ét sted, og testen låser den.
 *
 * MAPPINGEN modul → lektioner er den DELTE motor lektionerForModul (kun
 * publicerede, forløbsrækkefølge; kataloget hentes med cache-nøglen
 * ["akademi","items"], som forsiden allerede har gennem useAkademiData).
 * Grundlaget er smalt (prod 11/9: 14 lektioner bærer et modul) — det er
 * redaktionelt (ItemEditor), ikke kode: intet match → null → ingen linje.
 *
 * FILTER: lektioner medlemmet allerede har gennemført (itemProgressState =
 * "done" på egen member_progress-række) udelades. VÆGT: «brugbar»-andelen
 * (member_progress.brugbar, ja/(ja+nej) blandt rækker med acknowledged_at,
 * lektionBrugbar-invarianten) sorterer EFTER forløbsrækkefølgen — dvs. kun
 * mellem lektioner med samme position. Rækkerne der leveres i dag er
 * medlemmets EGNE (self-only RLS, 20260804120000:259-263), så vægten er
 * inert på forsiden indtil huset udstiller et tal pr. lektion for alle
 * (kræver en RPC — SQL-ændring, ikke taget her). Formen er klar til den.
 */

import { itemProgressState, type MemberProgress } from "./progressState";
import { lektionerForModul, type LektionRaekke } from "./lektionerForModul";

export const MAASKE_RELEVANT_PRAEFIKS = "Måske relevant for dig";
/** Højst så mange lektioner under kortet — én linje pr. lektion. */
export const MAASKE_RELEVANT_LOFT = 2;

/** Regel V1: trigger → handout-modul. null = triggeren peger ikke på en lektion. */
export const MODUL_FOR_TRIGGER: Readonly<Record<string, string | null>> = {
  HANDOUT_OVERDUE: null, // modulet står i trigger_data, ikke i tabellen
  BUDGET_DEVIATION: "bogholderi",
  KPI_OFF_TARGET: "bogholderi",
  BENCHMARK_BELOW: "bogholderi",
  POSITIVE_MOMENTUM: "bogholderi",
  NO_REPORT_60_DAYS: "bogholderi",
  MILESTONE_DUE_SOON: "overordnet",
  MILESTONE_STALLED: "overordnet",
  REPORT_UPLOADED: null,
};

/** Det dommen læser af weekly_focus — Json-kolonnerne tages som unknown og læses defensivt. */
export interface FokusRaekke {
  triggers_fired: unknown;
  trigger_data: unknown;
}

const erStreng = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** Modulerne ugens fokus peger på, i rækkefølge og uden dubletter: først
    dem der står i data (HANDOUT_OVERDUE), så regeltabellens i triggernes
    rækkefølge. Ulæselig række → tom liste. */
export function modulerForFokus(fokus: FokusRaekke | null | undefined): string[] {
  if (!fokus || !Array.isArray(fokus.triggers_fired)) return [];
  const ud: string[] = [];
  const tilfoej = (m: unknown) => {
    if (erStreng(m) && !ud.includes(m)) ud.push(m);
  };
  const data = fokus.trigger_data && typeof fokus.trigger_data === "object" ? (fokus.trigger_data as Record<string, unknown>) : {};
  const handouts = data.HANDOUT_OVERDUE;
  if (Array.isArray(handouts)) {
    for (const h of handouts) {
      if (h && typeof h === "object") tilfoej((h as { module?: unknown }).module);
    }
  }
  for (const t of fokus.triggers_fired) {
    if (!erStreng(t)) continue;
    tilfoej(MODUL_FOR_TRIGGER[t] ?? null);
  }
  return ud;
}

/** «brugbar»-andel pr. lektion: ja / (ja + nej) blandt rækker set færdig
    (acknowledged_at). Uden svar: null (sorteres sidst blandt lige). */
export function brugbarAndel(
  rows: readonly Pick<MemberProgress, "content_item_id" | "brugbar" | "acknowledged_at">[],
): Map<string, number> {
  const ja = new Map<string, number>();
  const nej = new Map<string, number>();
  for (const r of rows) {
    if (!r.acknowledged_at || r.brugbar == null) continue;
    const m = r.brugbar ? ja : nej;
    m.set(r.content_item_id, (m.get(r.content_item_id) ?? 0) + 1);
  }
  const ud = new Map<string, number>();
  for (const id of new Set([...ja.keys(), ...nej.keys()])) {
    const j = ja.get(id) ?? 0;
    const n = nej.get(id) ?? 0;
    ud.set(id, j / (j + n));
  }
  return ud;
}

export interface MaaskeRelevantInput<T extends LektionRaekke> {
  fokus: FokusRaekke | null | undefined;
  /** Kataloget (published-only fra listPublishedItems; formen holder uanset). */
  lektioner: readonly T[];
  /** Medlemmets egne member_progress-rækker (useAkademiData.progressRows). */
  progress: readonly Pick<MemberProgress, "content_item_id" | "seen_at" | "acknowledged_at" | "skipped_at">[];
  /** Rækker til vægten — i dag de samme egne rækker; en dag et tal for alle. */
  ratings?: readonly Pick<MemberProgress, "content_item_id" | "brugbar" | "acknowledged_at">[];
  loft?: number;
}

/** Højst `loft` lektioner: kun publicerede med matchende modul, ikke
    gennemført af medlemmet, i forløbsrækkefølge (modulerne i fokus-orden,
    lektionerne i kursets orden), derefter «brugbar»-andel (højest først,
    ubesvaret sidst). Intet match → null: ingen linje. */
export function maaskeRelevant<T extends LektionRaekke>(i: MaaskeRelevantInput<T>): T[] | null {
  const moduler = modulerForFokus(i.fokus);
  if (moduler.length === 0) return null;
  const progressAf = new Map(i.progress.map((p) => [p.content_item_id, p]));
  const andel = brugbarAndel(i.ratings ?? []);
  const set = new Set<string>();
  const ud: T[] = [];
  for (const modul of moduler) {
    const kandidater = lektionerForModul(i.lektioner, modul)
      .filter((l) => itemProgressState(progressAf.get(l.id)) !== "done")
      .filter((l) => !set.has(l.id));
    // Stabil: forløbsrækkefølgen først (lektionerForModul), andelen kun mellem lige positioner.
    kandidater.sort((a, b) => a.position - b.position || (andel.get(b.id) ?? -1) - (andel.get(a.id) ?? -1));
    for (const l of kandidater) {
      set.add(l.id);
      ud.push(l);
    }
  }
  const loft = i.loft ?? MAASKE_RELEVANT_LOFT;
  return ud.length === 0 ? null : ud.slice(0, loft);
}

/** Linjens ord: «Måske relevant for dig: {titel}». */
export function maaskeRelevantTekst(lektion: Pick<LektionRaekke, "title">): string {
  return `${MAASKE_RELEVANT_PRAEFIKS}: ${lektion.title}`;
}
