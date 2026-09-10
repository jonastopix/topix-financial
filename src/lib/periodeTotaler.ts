/**
 * src/lib/periodeTotaler.ts — «Perioden samlet» på Nøgletal (#59, 10/9-2026).
 *
 * Visningslaget oven på motoren periodeOpgoerelse (opgoerPeriode): HVILKE
 * nøgler, HVAD «samlet» betyder for hver, og hvordan huller og estimater
 * siges. Ren, React-fri, testet i __tests__/periodeTotaler.test.ts.
 *
 * AFGJORT (Jonas' spørgsmål 10/9 — summeres, gennemsnit, eller ikke samlet):
 * - SUMMERES (flow): omsætning, dækningsbidrag, lønninger, resultat før skat.
 *   Beløb pr. måned kan lægges sammen; summen over et helt estimatår er
 *   årsrapportens eget årstal (motorens undtagelse).
 * - FORHOLD PÅ SUMMERNE (ikke gennemsnit): DB-margin og resultatmargin
 *   regnes med SAMME formel som månedstallene, på periodens summerede kf —
 *   et gennemsnit af månedsprocenter ville vægte en lille måned som en
 *   stor. Derfor findes der INGEN gennemsnit her.
 * - ULTIMO (beholdning): bank. En beholdning summeres aldrig; periodens
 *   tal er den seneste måned med værdi.
 * - VISES IKKE SAMLET: M/M-ændringer (de er pr. måned), mål (kortets
 *   beslutning «mål × måneder med data» er truffet, men ikke bygget her —
 *   det er en egen linje i hero'en, ikke en total), og Omk. total (summen af
 *   omkostningsfelter regner manglende felter som 0 — præcis den løgn
 *   #786 lukkede for graferne).
 *
 * HULLER (#786: et manglende tal er ikke nul): en nøgle der mangler i nogle
 * af periodens måneder får sin sum alligevel — men rækken siger
 * «ufuldstændig · 9 af 12 måneder». Perioden er KALENDERSPÆNDET fra første
 * til sidste måned i udvalget (usePeriodFilter vælger nøgler der findes, så
 * en manglende måned midt i «seneste 12» er usynlig for den — ikke for os).
 */
import { calcDbMargin, calcResultMargin } from "@/lib/financialUtils";
import { opgoerPeriode, type PeriodeDefinition, type PeriodeVaerdi } from "@/lib/periodeOpgoerelse";
import type { CompanyFact } from "@/hooks/useCompanyFacts";

export const PERIODE_DEFINITIONER: readonly (PeriodeDefinition & { label: string; enhed: "kr" | "%" })[] = [
  { key: "omsaetning", label: "Omsætning", enhed: "kr", art: "flow", udtraek: (kf) => kf.omsaetning ?? null },
  { key: "daekningsbidrag", label: "Dækningsbidrag", enhed: "kr", art: "flow", udtraek: (kf) => kf.daekningsbidrag ?? null },
  { key: "loenninger", label: "Lønninger", enhed: "kr", art: "flow", udtraek: (kf) => (kf.loenninger != null ? Math.abs(kf.loenninger) : null) },
  { key: "resultat_foer_skat", label: "Resultat f. skat", enhed: "kr", art: "flow", udtraek: (kf) => kf.resultat_foer_skat ?? null },
  { key: "db_margin", label: "DB-margin", enhed: "%", art: "forhold", udtraek: (kf) => calcDbMargin(kf) },
  { key: "resultat_margin", label: "Resultatmargin", enhed: "%", art: "forhold", udtraek: (kf) => calcResultMargin(kf) },
  { key: "bank_balance", label: "Bank (ultimo)", enhed: "kr", art: "beholdning", udtraek: (kf) => kf.bank_balance ?? null },
];

/** Antal kalendermåneder fra første til sidste nøgle, begge inklusive. 0 uden nøgler. */
export function maanederISpaend(periodKeys: readonly string[]): number {
  if (periodKeys.length === 0) return 0;
  const sorted = [...periodKeys].sort();
  const [y1, m1] = sorted[0].split("-").map(Number);
  const [y2, m2] = sorted[sorted.length - 1].split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) + 1;
}

const MAANED_KORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** «Jan 2026 – Aug 2026 · 8 måneder» — spændet og antallet af måneder med tal. */
export function periodeTekst(periodKeys: readonly string[]): string {
  if (periodKeys.length === 0) return "Ingen måneder i perioden";
  const sorted = [...periodKeys].sort();
  const ord = (k: string) => {
    const [y, m] = k.split("-");
    const navn = MAANED_KORT[Number(m) - 1] ?? m;
    return `${navn.charAt(0).toUpperCase()}${navn.slice(1)} ${y}`;
  };
  const spaend = maanederISpaend(sorted);
  const fra = ord(sorted[0]);
  const til = ord(sorted[sorted.length - 1]);
  const antal = `${sorted.length} ${sorted.length === 1 ? "måned" : "måneder"}`;
  if (fra === til) return `${fra} · ${antal}`;
  return spaend === sorted.length ? `${fra} – ${til} · ${antal}` : `${fra} – ${til} · ${antal} af ${spaend}`;
}

export interface PeriodeTotalLinje {
  key: string;
  label: string;
  enhed: "kr" | "%";
  art: PeriodeVaerdi["art"];
  /** null når ingen måned bærer nøglen, eller formlen ikke kan dømme. */
  total: number | null;
  daekning: number;
  spaend: number;
  /** Nøglen mangler i mindst én måned af spændet — summen er lavere end virkeligheden. */
  ufuldstaendig: boolean;
  /** Estimater indgår (basis estimated eller blandet). */
  medEstimat: boolean;
  /** Estimatdelens bidrag (kun flows). */
  estimatAndel: number | null;
}

export interface PeriodeTotaler {
  tekst: string;
  spaend: number;
  grundlag: { maalte: number; estimerede: number; samlet: number };
  /** Estimatmåneder udgør hele kalenderår — summen er årsrapportens eksakte årstal. */
  heleEstimatAar: boolean;
  linjer: PeriodeTotalLinje[];
}

/** facts: periodens rækker, sorteret stigende — præcis dem grafen tegner. */
export function bygPeriodeTotaler(facts: readonly CompanyFact[]): PeriodeTotaler {
  const keys = facts.map((f) => f.period_key);
  const spaend = maanederISpaend(keys);
  const opg = opgoerPeriode(facts, PERIODE_DEFINITIONER);
  const linjer = PERIODE_DEFINITIONER.map((def) => {
    const v = opg.vaerdier[def.key];
    // Forhold og beholdning dømmes ikke «ufuldstændige» på dækning af egen
    // nøgle: en beholdning er ultimo, og et forhold på summerne bærer
    // hullerne fra sine flows (som selv siger det).
    const ufuldstaendig = def.art === "flow" && v.daekning > 0 && v.daekning < spaend;
    return {
      key: def.key,
      label: def.label,
      enhed: def.enhed,
      art: v.art,
      total: v.total,
      daekning: v.daekning,
      spaend,
      ufuldstaendig,
      medEstimat: v.basis === "estimated" || v.basis === "blandet",
      estimatAndel: v.estimatAndel,
    };
  });
  return { tekst: periodeTekst(keys), spaend, grundlag: opg.grundlag, heleEstimatAar: opg.heleEstimatAar, linjer };
}

/** «ufuldstændig · 9 af 12 måneder» — kun når det er sandt. */
export function ufuldstaendigTekst(l: Pick<PeriodeTotalLinje, "ufuldstaendig" | "daekning" | "spaend">): string | null {
  return l.ufuldstaendig ? `ufuldstændig · ${l.daekning} af ${l.spaend} måneder` : null;
}

/** «heraf 3 estimerede måneder» / «heraf estimeret 120.000 kr.» — estimatets del af en sum. */
export function estimatTekst(t: PeriodeTotaler, l: PeriodeTotalLinje, formatKr: (n: number) => string): string | null {
  if (!l.medEstimat) return null;
  if (l.art === "beholdning") return "estimat";
  if (l.art === "forhold") return "på delvist estimerede tal";
  if (l.estimatAndel == null || l.total == null || l.estimatAndel === l.total) {
    return t.heleEstimatAar ? "estimat — årsrapportens årstal" : "estimat — delår, jævnt fordelt";
  }
  return `heraf estimeret ${formatKr(l.estimatAndel)}${t.heleEstimatAar ? "" : " (delår, jævnt fordelt)"}`;
}
