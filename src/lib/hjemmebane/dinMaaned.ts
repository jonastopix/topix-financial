/**
 * src/lib/hjemmebane/dinMaaned.ts — «Din måned» på medlemmets forside
 * (forside PR 2, 17/9-2026 — Jonas «A på alle», valg 2: «tre tal med retning
 * mod forrige måned + sparkline over 12 måneder; ingen sammenligning med
 * andre»).
 *
 * REN dom: ingen React, ingen Supabase. Kilden er den samme som TalStrip
 * havde (BoardroomView `sorted`: useCompanyFacts → financial_report_facts
 * sorteret på period_key, ALLE rækker — ingen ny hentning; factsToDanishMetrics
 * giver omsaetning / resultat_foer_skat / bank_balance). Tallene:
 *   - «seneste periode» = sidste række (nyeste period_key); estimat-mærket
 *     følger data_basis som før (data-basis-kontrakten).
 *   - (Til 3/10: bank kunne komme fra en ÆLDRE række — se «RETTET 3/10» nedenfor.)
 *   - RETNING mod forrige godkendte måned i ORD: «højere end i juni» /
 *     «lavere end i juni» / «som i juni». Ingen procent, ingen farve-skam:
 *     ordene er de samme uanset fortegn. Uden forrige måned: ingen retning.
 *   - SPARKLINE: de seneste 12 MÅLTE rækker der HAR tallet — manglende
 *     måneder springes over (ikke nul). Kun punkter; tegningen er fladens.
 *     KUN MÅLTE MÅNEDER (17/9-2026, Jonas ordret: «Vi går med dine
 *     anbefalinger» — valg A): Jonas' SQL 17/9 11:53 viste at Topix.dk ApS'
 *     financial_report_facts har 2025-01 → 2025-12 som data_basis estimated /
 *     source_type annual_report (omsætning 48.929,75 hver måned = årsregn-
 *     skabet delt på 12) og 2026-01 → 2026-07 measured. Kurven tegnede de
 *     fem estimater (2025-08 → 2025-12) som en flad start — et estimat pr.
 *     definition, ikke en måned. Kurven skal vise rigtige måneder, så
 *     sparkline() tager kun basis "measured"; teksten «seneste N måneder»
 *     tæller de målte. RETNINGEN OG DE TRE TAL ÆNDRES IKKE — de følger
 *     fortsat seneste række med tallet, med estimat-mærket som i dag (AFLØST
 *     3/10 — se «RETTET 3/10» nedenfor). Uden
 *     målte rækker: ingen kurve og «kurven kommer med første målte måned».
 *
 * RETTET 3/10-2026 (mangellisten g03-bank-som-i-november; livetjek Floren
 * Engros 3/10: «BANK est. 3.517 kr. som i november»). MÅLT i prod 3/10:
 * Florens facts er 2024-01 → 2025-12 data_basis estimated / annual_report MED
 * cash, og 2026-01 → 2026-08 measured / canonical_v2 UDEN nøglen cash. Den
 * gamle regel tog for hvert tal «sidste række MED tallet og rækken før den» —
 * så banken faldt tilbage på estimatet 2025-12 og blev sammenlignet med
 * estimatet 2025-11 (årsregnskabet delt på 12 er ens hver måned → «som i
 * november»), mens omsætning og resultat stod for august. Bredere, målt 3/10:
 * 9 af 21 virksomheder med målte måneder har intet banktal i deres seneste
 * målte måned. DEN NYE REGEL (samme som sparkline: estimater er ikke måneder):
 *   1. Alle tre tal kommer fra DEN VISTE måned (seneste række) — aldrig fra en
 *      ældre række. Mangler tallet dér: value null og `mangler` =
 *      «ikke opgjort for {måned}» (ærligt i stedet for et gammelt tal).
 *   2. Banken vises KUN fra en MÅLT række: er den viste måned et estimat, er
 *      banken også «ikke opgjort for {måned}».
 *   3. Retningen sammenligner KUN to MÅLTE måneder: den viste og den FORRIGE
 *      MÅLTE (samme forrige for alle tre tal). Er den viste et estimat, eller
 *      har forrige målte ikke tallet: ingen retning. Et estimat sammenlignes
 *      aldrig — hverken med et estimat («som i november») eller med en måling.
 *   Kortets estimat-mærke som helhed er uændret (seneste række estimeret);
 *   det gamle mærke pr. tal («est.» ved banken) findes ikke længere, fordi
 *   intet tal kan komme fra en anden række end den viste.
 * Uden tal (dag 1): kortet siger hvad det bliver til, og «Upload din første
 * rapport». Testet i __tests__/dinMaaned.test.ts; kildeværn
 * src/lib/__tests__/forsideTop.guard.test.ts.
 */
import { maanedsNoegleKbh, maanedsnavn } from "@/lib/maanedsnoegle";
import { flytMaaned, fristPasseret, naesteMaaned } from "@/lib/boardroomScore/streak";

export interface MaanedsRaekke {
  /** «YYYY-MM» (financial_report_facts.period_key). */
  key: string;
  /** period_label, fx «Juli 2026». */
  period: string;
  basis: "measured" | "estimated";
  omsaetning: number | null;
  resultat: number | null;
  bank: number | null;
}

export type TalFelt = "omsaetning" | "resultat" | "bank";

export interface Tal {
  felt: TalFelt;
  label: string;
  value: number | null;
  /** «højere end i juni» / «lavere end i juni» / «som i juni» — KUN mellem to målte måneder; ellers null. */
  retning: string | null;
  /** «ikke opgjort for august» — når den viste måned ikke har tallet (bank: ikke MÅLT). Ellers null. */
  mangler: string | null;
}

export interface SparklinePunkt {
  key: string;
  value: number;
}

export type DinMaanedDom =
  | { tom: true; overskrift: string; linje: string; cta: { label: string; to: string } }
  | {
      tom: false;
      periodLabel: string;
      /** Seneste periode er et estimat — kortet mærkes som helhed. */
      estimeret: boolean;
      tal: Tal[];
      /** Omsætningen, seneste 12 MÅLTE måneder med tal — punkter til kurven (estimater udelades). */
      sparkline: SparklinePunkt[];
      /** «Omsætning · seneste 7 måneder» — antallet er punkternes (de målte), ikke 12 når der er færre;
          uden målte: «kurven kommer med første målte måned»; én målt: «kurven kommer med næste måned». */
      sparklineTekst: string;
    };

export const DIN_MAANED_TOM_OVERSKRIFT = "Din måned står her.";
export const DIN_MAANED_TOM_LINJE =
  "Her står din omsætning, dit resultat og din bank hver måned — med retning mod måneden før. Upload din første rapport, så er du i gang.";
export const DIN_MAANED_BEHANDLES_OVERSKRIFT = "Dine tal er på vej.";
export const DIN_MAANED_BEHANDLES_LINJE =
  "Din rapport er ved at blive behandlet — tallene lander her, så snart de er godkendt.";
export const RAPPORTERING_STI = "/reports";
export const SPARKLINE_MAANEDER = 12;
export const SPARKLINE_UDEN_MAALTE_TEKST = "Omsætning · kurven kommer med første målte måned";
export const SPARKLINE_EN_MAANED_TEKST = "Omsætning · kurven kommer med næste måned";

const LABELS: Record<TalFelt, string> = { omsaetning: "Omsætning", resultat: "Resultat f. skat", bank: "Bank" };

/** Retningen i ord — aldrig et tal. Lige = «som i {måned}». */
export function retningTekst(nu: number | null, foer: number | null, foerNoegle: string): string | null {
  if (nu == null || foer == null) return null;
  const navn = maanedsnavn(foerNoegle);
  if (!navn) return null;
  if (nu > foer) return `højere end i ${navn}`;
  if (nu < foer) return `lavere end i ${navn}`;
  return `som i ${navn}`;
}

/** Punkterne til kurven: MÅLTE rækker MED tallet, sorteret på key, de seneste `antal`.
    Estimater (data_basis estimated — fx årsregnskabet delt på 12) udelades: de er
    ikke måneder. Manglende måneder springes over — der indsættes aldrig et nul. */
export function sparkline(rows: readonly MaanedsRaekke[], felt: TalFelt, antal = SPARKLINE_MAANEDER): SparklinePunkt[] {
  return [...rows]
    .sort((a, b) => a.key.localeCompare(b.key))
    .filter((r) => r.basis === "measured")
    .filter((r) => r[felt] != null)
    .slice(-antal)
    .map((r) => ({ key: r.key, value: r[felt] as number }));
}

/** «ikke opgjort for august» — teksten, når den viste måned ikke har tallet. */
export function ikkeOpgjortTekst(noegle: string): string {
  const navn = maanedsnavn(noegle);
  return navn ? `ikke opgjort for ${navn}` : "ikke opgjort";
}

/** Den forrige MÅLTE række før `noegle` (nøgleorden) — null, hvis ingen. Huller springes over
    (gik juni tabt, er forrige målte maj — og retningen siger «i maj», som medlemmet kan følge). */
export function forrigeMaalte(sorteret: readonly MaanedsRaekke[], noegle: string): MaanedsRaekke | null {
  const foer = sorteret.filter((r) => r.basis === "measured" && r.key < noegle);
  return foer[foer.length - 1] ?? null;
}

/** Ét tal for den viste måned (reglen i filhovedet, «RETTET 3/10»). */
export function talForMaaned(sorteret: readonly MaanedsRaekke[], vist: MaanedsRaekke, felt: TalFelt): Tal {
  const label = LABELS[felt];
  // (2) Banken kun fra en målt række.
  const tilladt = felt !== "bank" || vist.basis === "measured";
  const value = tilladt ? vist[felt] : null;
  if (value == null) return { felt, label, value: null, retning: null, mangler: ikkeOpgjortTekst(vist.key) };
  // (3) Retning kun mellem to målte måneder.
  const forrige = vist.basis === "measured" ? forrigeMaalte(sorteret, vist.key) : null;
  const retning = forrige ? retningTekst(value, forrige[felt], forrige.key) : null;
  return { felt, label, value, retning, mangler: null };
}

export function dinMaanedDom(rows: readonly MaanedsRaekke[], processing: boolean): DinMaanedDom {
  if (rows.length === 0) {
    return processing
      ? { tom: true, overskrift: DIN_MAANED_BEHANDLES_OVERSKRIFT, linje: DIN_MAANED_BEHANDLES_LINJE, cta: { label: "Se status", to: RAPPORTERING_STI } }
      : { tom: true, overskrift: DIN_MAANED_TOM_OVERSKRIFT, linje: DIN_MAANED_TOM_LINJE, cta: { label: "Upload din første rapport", to: RAPPORTERING_STI } };
  }
  const sorteret = [...rows].sort((a, b) => a.key.localeCompare(b.key));
  const seneste = sorteret[sorteret.length - 1];
  const estimeret = seneste.basis === "estimated";
  const tal: Tal[] = (["omsaetning", "resultat", "bank"] as TalFelt[]).map((felt) => talForMaaned(sorteret, seneste, felt));
  const punkter = sparkline(sorteret, "omsaetning");
  return {
    tom: false,
    periodLabel: seneste.period,
    estimeret,
    tal,
    sparkline: punkter,
    sparklineTekst:
      punkter.length === 0 ? SPARKLINE_UDEN_MAALTE_TEKST : punkter.length === 1 ? SPARKLINE_EN_MAANED_TEKST : `Omsætning · seneste ${punkter.length} måneder`,
  };
}

/** Kurvens koordinater (0–1 i begge akser, y vendt så højere tal er højere
    oppe) — ren geometri, så SVG'en i fladen kun tegner. Ét punkt → midten;
    alle ens → vandret linje midt i. */
export function sparklineKoordinater(punkter: readonly SparklinePunkt[]): { x: number; y: number }[] {
  if (punkter.length === 0) return [];
  const vaerdier = punkter.map((p) => p.value);
  const min = Math.min(...vaerdier);
  const max = Math.max(...vaerdier);
  const span = max - min;
  return punkter.map((p, i) => ({
    x: punkter.length === 1 ? 0.5 : i / (punkter.length - 1),
    y: span === 0 ? 0.5 : 1 - (p.value - min) / span,
  }));
}

// ── Forside v3 (2/10-2026 aften, docs/forside-v3.md §3) ─────────────────────
/**
 * Hvor gamle er tallene? «N måneder gamle» står på forsidens kort, KUN når den seneste måned med tal
 * er bagud efter husets ENE frist (streak.ts: den 20. i måneden efter, rykket til hverdag):
 *   bagud ⇔ fristen for måneden EFTER den seneste er passeret.
 *   N = antal måneder fra den seneste til den seneste AFSLUTTEDE måned (maanedFoer(nu)), i dansk tid.
 * Eksempler (nu = 2/10-2026): seneste august → septembers frist 20/10 ikke passeret → null (frisk, Topix).
 *   seneste juni → julis frist 20/8 passeret → N = sep − jun = 3 → «3 måneder gamle».
 *   seneste juli → augusts frist 21/9 passeret → N = 2 → «2 måneder gamle».
 * Ingen rækker eller en ugyldig nøgle → null.
 */
export function talAlderTekst(senesteKey: string | null | undefined, nu: Date): string | null {
  if (!senesteKey || !/^\d{4}-\d{2}$/.test(senesteKey)) return null;
  if (!fristPasseret(naesteMaaned(senesteKey), nu)) return null;
  const afsluttet = flytMaaned(maanedsNoegleKbh(nu), -1);
  const [a1, m1] = senesteKey.split("-").map(Number);
  const [a2, m2] = afsluttet.split("-").map(Number);
  const n = (a2! - a1!) * 12 + (m2! - m1!);
  if (n < 1) return null;
  return n === 1 ? "1 måned gammel" : `${n} måneder gamle`;
}

/** Den seneste periode blandt rækkerne (nyeste nøgle) — null uden rækker. */
export function senesteNoegle(rows: readonly Pick<MaanedsRaekke, "key">[]): string | null {
  return rows.reduce<string | null>((s, r) => (s === null || r.key > s ? r.key : s), null);
}
