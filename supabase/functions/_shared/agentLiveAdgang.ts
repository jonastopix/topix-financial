/**
 * agentLiveAdgang — hvem må starte en LIVE kørsel af run-company-agent?
 * (30/9-2026, sikkerhedsanalysen fund 9.)
 *
 * HULLET: for et bruger-JWT var eneste tjek, at kalderen kan SE virksomheden.
 * Et medlem kunne sende {"dry_run": false, "trigger": "company_review"} og få
 * agentens skrivekald udført live — uden om agent_proposals (rådgiverens
 * godkendelse) og med AI-kredit uden loft.
 *
 * ANALYSEN SAGDE «kun rådgiver/service-role live». MÅLT 30/9 i src/: det ville
 * bryde medlemmets egen rapport-commit. RapporteringView (medlemsfladen) →
 * propagateReportCommit (src/lib/reportCommit.ts) og ReportReviewDialog kalder
 * run-company-agent med dry_run: false for PRÆCIS to triggere:
 * «report_committed» og — når detect-financial-alerts har skrevet alarmer —
 * «anomaly_detected». Det er husets besluttede flow (tørt som standard, live
 * når nogen har skrevet det, beslutning 2026-08-25), og POOL_BLOCKLIST
 * holder chat og klokke ude af begge.
 *
 * DOMMEN: tørkørsel må alle med adgang til virksomheden. Live må service role
 * og rådgivere altid; et medlem KUN for de to triggere, medlemmets egen
 * commit starter. «company_review» (rådgiver-igangsat), «onboarding» og
 * «pulse_submitted» live kræver rådgiver eller service role. Fail-closed: en
 * ny trigger er rådgiver-kun live, indtil nogen bevidst skriver den her.
 *
 * Ingen IO — testes i vitest fra src/lib/__tests__/agentLiveAdgang.test.ts.
 */

/** De triggere, et medlems egen rapport-commit starter live (målt 30/9). */
export const MEDLEM_LIVE_TRIGGERE: readonly string[] = ["report_committed", "anomaly_detected"];

export function maaKoereLive(input: {
  dryRun: boolean;
  isServiceRole: boolean;
  isAdvisor: boolean;
  trigger: unknown;
}): boolean {
  if (input.dryRun) return true;
  if (input.isServiceRole || input.isAdvisor) return true;
  return typeof input.trigger === "string" && MEDLEM_LIVE_TRIGGERE.includes(input.trigger);
}
