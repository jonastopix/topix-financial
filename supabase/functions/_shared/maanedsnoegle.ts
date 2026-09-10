/**
 * _shared/maanedsnoegle.ts — «hvilken måned er det i Danmark, og er en periode
 * afsluttet?» (10/9-2026, de-tyve nr. 10).
 *
 * REN: vitest læser den direkte (src/lib/__tests__/maanedsnoegle.test.ts).
 *
 * HVORFOR: regel 6 i resolve_report_commit_candidate dømte «måneden er ikke
 * afsluttet» med to_char(now(), 'YYYY-MM') — databasens UTC. Fladen dømmer i
 * dansk tid (reportCardView.erForTidligt). Den 1. mellem 00:00 og 02:00 dansk
 * tid (CEST; 00:00–01:00 ved CET) var UTC stadig i forrige måned: fladen sagde
 * «kan godkendes», resolveren «ikke afsluttet». Migration 20260910220000
 * retter SQL'en til Europe/Copenhagen; denne fil er samme regel i TypeScript
 * for cron'en — begge sider skal give samme svar, og grænserne testes fra
 * begge sider (sidste sekund før, første sekund efter, sommer og vinter).
 */

export const TZ = "Europe/Copenhagen";

/** "YYYY-MM" for et tidspunkt set fra Danmark. sv-SE giver ISO-formen. */
export function maanedsNoegleKbh(nu: Date): string {
  return nu.toLocaleDateString("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit" }).slice(0, 7);
}

/** Er perioden (YYYY-MM) afsluttet set fra Danmark? Indeværende og fremtidige måneder er det ikke. */
export function erMaanedAfsluttet(periodKey: string | null | undefined, nu: Date): boolean {
  if (!periodKey || !/^\d{4}-\d{2}$/.test(periodKey)) return false;
  return periodKey < maanedsNoegleKbh(nu);
}
