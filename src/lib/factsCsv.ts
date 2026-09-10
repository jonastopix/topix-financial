/**
 * src/lib/factsCsv.ts — «Download dine tal som CSV» (#68, 10/9-2026).
 *
 * Én række pr. måned, kolonnerne som Nøgletals månedstabel (KPI_DEFS via
 * VALUE_EXTRACTORS — samme formler, så fil og skærm aldrig siger noget
 * forskelligt). Ren funktion, testet i __tests__/factsCsv.test.ts.
 *
 * TO LÆRDOMME FRA DAGEN (#786, #787) er filens kontrakt:
 *   - ESTIMATER MARKERES i deres egen kolonne «Grundlag» (Målt/Estimat).
 *     En fil uden den kolonne ville få et /12-tal fra årsrapporten til at
 *     ligne en målt måned igen.
 *   - ET MANGLENDE TAL ER TOMT, ikke 0. Cellen er blank når udtrækket giver
 *     null — også «Omk. total» i en estimeret række hvor ikke alle
 *     omkostningsfelter er læst (omkostningerKendte).
 *
 * FORMATET er Excel/Numbers på dansk: semikolon, decimalkomma, ingen
 * tusindtalsseparator, UTF-8 med BOM (så æøå åbner rigtigt i Excel), CRLF.
 * Procent-kolonner bærer tallet (31,2), ikke «31,2 %» — så det kan regnes på.
 */
import { KPI_DEFS, VALUE_EXTRACTORS } from "@/lib/kpiDefs";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { DANISH_MONTHS } from "@/lib/financialUtils";
import type { CompanyFact } from "@/hooks/useCompanyFacts";

export const CSV_SKILLETEGN = ";";
export const CSV_BOM = "\uFEFF";
export const GRUNDLAG_ORD = { measured: "Målt", estimated: "Estimat" } as const;

/** Kolonneoverskrifterne — de tre faste og én pr. KPI (procent-KPI'er mærket). */
export function csvOverskrifter(): string[] {
  return ["Periode", "Måned", "Grundlag", ...KPI_DEFS.map((d) => (d.unit === "%" ? `${d.label} (%)` : `${d.label} (kr.)`))];
}

/** Tal → dansk CSV-celle: decimalkomma, højst to decimaler, ingen tusindtal; null → tom. */
export function csvTal(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  const afrundet = Math.round(v * 100) / 100;
  return String(afrundet).replace(".", ",");
}

/** Tekst-celle: citeres når den bærer skilletegn, anførselstegn eller linjeskift. */
export function csvTekst(s: string): string {
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** «Januar 2026» af "2026-01" — hele måneden, ikke tabellens forkortelse, fordi filen læses uden kontekst. */
export function maanedOrd(periodKey: string): string {
  const [y, m] = periodKey.split("-");
  const navn = DANISH_MONTHS[parseInt(m, 10) - 1];
  return navn ? `${navn} ${y}` : periodKey;
}

/** Én række pr. fact — sorteret stigende på period_key uanset input-rækkefølge. */
export function csvRaekker(facts: readonly CompanyFact[]): string[][] {
  return [...facts]
    .sort((a, b) => a.period_key.localeCompare(b.period_key))
    .map((f) => {
      const kf = factsToDanishMetrics(f.metrics);
      return [
        f.period_key,
        maanedOrd(f.period_key),
        GRUNDLAG_ORD[f.data_basis] ?? f.data_basis,
        ...KPI_DEFS.map((d) => csvTal(VALUE_EXTRACTORS[d.key]?.(kf, f.data_basis) ?? null)),
      ];
    });
}

/** Hele filen som tekst. Tom liste giver kun overskriftsrækken. */
export function bygFactsCsv(facts: readonly CompanyFact[]): string {
  const linjer = [csvOverskrifter(), ...csvRaekker(facts)].map((r) => r.map(csvTekst).join(CSV_SKILLETEGN));
  return CSV_BOM + linjer.join("\r\n") + "\r\n";
}

/** «virksomhed-tal-2026-09-10.csv» — små bogstaver, danske tegn omskrevet. */
export function csvFilnavn(virksomhed: string, dato: Date): string {
  const slug = virksomhed
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "virksomhed";
  const iso = dato.toISOString().slice(0, 10);
  return `${slug}-tal-${iso}.csv`;
}
