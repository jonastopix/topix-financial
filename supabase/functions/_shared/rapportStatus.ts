/**
 * supabase/functions/_shared/rapportStatus.ts
 *
 * Rapporteringsstatus-dommen til company_review-triggeren
 * (docs/agent-forslag-design.md-beslutningen 2026-08-25: manglende
 * opdaterede tal er i sig selv en observation agenten skal give).
 *
 * SPEJLER forsidens fokus-motor, deriveFocus i
 * src/components/hjemmebane/boardroom/nextStep.ts:118-152 — punkterne
 * (a) manglende rapport og (b) uploadet-men-ikke-godkendt — samt
 * periode-hjælperne i src/lib/financialUtils.ts
 * (parseReportPeriodToKey, hasManualOverride/getEffectiveReportPeriodKey).
 * Edge functions kan ikke importere fra src/, så dommen findes ét sted
 * pr. runtime og INGEN andre steder. Enhver ændring her SKAL også laves
 * i motoren. Paritet håndhæves af
 * src/lib/__tests__/rapportStatus.paritet.test.ts (opgaveUdloeb-mønstret).
 *
 * Nul imports, så filen kan læses af både Deno og Vite/Vitest.
 */

/** Spejl af DANISH_MONTHS (financialUtils.ts:4-7) — paritetstestet. */
export const DANSKE_MAANEDER = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];

/** Forrige kalendermåned — ankeret for rapporteringsdommen
    (deriveFocus:120-123, årsskifte-grenen inklusive). */
export function forrigePeriode(nu: Date): { key: string; maanedNavn: string; aar: number } {
  const prevMonth = nu.getMonth() === 0 ? 11 : nu.getMonth() - 1;
  const prevYear = nu.getMonth() === 0 ? nu.getFullYear() - 1 : nu.getFullYear();
  return {
    key: `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`,
    maanedNavn: DANSKE_MAANEDER[prevMonth].toLowerCase(),
    aar: prevYear,
  };
}

export type RapporteringsStatus = "mangler" | "uploadet_ikke_godkendt" | "rapporteret";

/** Tre-vejs-dommen fra deriveFocus:126-152: !processed → mangler;
    processed men !committed → uploadet_ikke_godkendt; begge → rapporteret. */
export function rapporteringsStatus(
  processedKeys: ReadonlySet<string>,
  committedKeys: ReadonlySet<string>,
  nu: Date,
): { status: RapporteringsStatus; periodeKey: string; maanedNavn: string; aar: number } {
  const { key, maanedNavn, aar } = forrigePeriode(nu);
  const hasProcessed = processedKeys.has(key);
  const hasCommitted = committedKeys.has(key);
  const status: RapporteringsStatus = !hasProcessed
    ? "mangler"
    : !hasCommitted
      ? "uploadet_ikke_godkendt"
      : "rapporteret";
  return { status, periodeKey: key, maanedNavn, aar };
}

/** Spejl af parseReportPeriodToKey (financialUtils.ts:18-27): dansk
    månedsnavn + firecifret årstal i fri tekst → "YYYY-MM", ellers null. */
export function parsRapportPeriodeTilKey(period: string | null): string | null {
  if (!period) return null;
  for (let i = 0; i < DANSKE_MAANEDER.length; i++) {
    if (period.toLowerCase().includes(DANSKE_MAANEDER[i].toLowerCase())) {
      const yearMatch = period.match(/\d{4}/);
      if (yearMatch) return `${yearMatch[0]}-${String(i + 1).padStart(2, "0")}`;
    }
  }
  return null;
}

export interface RapportRad {
  report_period: string | null;
  manual_report_period_key?: string | null;
  manual_override_status?: string | null;
}

/** Spejl af getEffectiveReportPeriodKey (financialUtils.ts:129-134):
    anvendt manuel override vinder over den parsede periode-tekst. */
export function effektivRapportPeriodeKey(rapport: RapportRad): string | null {
  if (rapport.manual_override_status === "applied" && rapport.manual_report_period_key) {
    return rapport.manual_report_period_key;
  }
  return parsRapportPeriodeTilKey(rapport.report_period);
}
