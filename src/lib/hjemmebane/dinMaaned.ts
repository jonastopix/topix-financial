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
 *   - Bank kan komme fra en ÆLDRE række end perioden (sidste med bank_balance)
 *     — som TalStrips bankRow.
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
 *     fortsat seneste række med tallet, med estimat-mærket som i dag. Uden
 *     målte rækker: ingen kurve og «kurven kommer med første målte måned».
 * Uden tal (dag 1): kortet siger hvad det bliver til, og «Upload din første
 * rapport». Testet i __tests__/dinMaaned.test.ts; kildeværn
 * src/lib/__tests__/forsideTop.guard.test.ts.
 */
import { maanedsnavn } from "@/lib/maanedsnoegle";

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
  /** Rækken tallet kommer fra er et estimat (kun vist når kortet ikke allerede er mærket som helhed). */
  estimeret: boolean;
  /** «højere end i juni» / «lavere end i juni» / «som i juni» — null uden forrige måned eller uden tal. */
  retning: string | null;
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

/** Sidste række med tallet, og rækken før den (den forrige måned MED tallet). */
function sidsteOgForrige(rows: readonly MaanedsRaekke[], felt: TalFelt): { sidste: MaanedsRaekke | null; forrige: MaanedsRaekke | null } {
  const med = [...rows].sort((a, b) => a.key.localeCompare(b.key)).filter((r) => r[felt] != null);
  return { sidste: med[med.length - 1] ?? null, forrige: med[med.length - 2] ?? null };
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
  const tal: Tal[] = (["omsaetning", "resultat", "bank"] as TalFelt[]).map((felt) => {
    const { sidste, forrige } = sidsteOgForrige(sorteret, felt);
    return {
      felt,
      label: LABELS[felt],
      value: sidste ? (sidste[felt] as number) : null,
      // Mærkes kun når kortet ikke allerede er mærket som helhed (TalStrips regel).
      estimeret: !!sidste && sidste.basis === "estimated" && !estimeret,
      retning: sidste && forrige ? retningTekst(sidste[felt], forrige[felt], forrige.key) : null,
    };
  });
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
