/**
 * src/lib/raadgiverHentefejl.ts
 *
 * Ordene for «vi kunne ikke hente …» på RÅDGIVERENS flader — søster til
 * lib/hjemmebane/hentefejl.ts (#780, medlemmets ord). Rene funktioner,
 * testet i __tests__/raadgiverHentefejl.test.ts.
 *
 * HVORFOR RÅDGIVERENS SIDE ER ANDERLEDES (Jonas 10/9): et medlem der ser en
 * tom side, tror der ikke er noget. En RÅDGIVER der ser en tom liste, tror
 * at INGEN har brug for noget — og handler ikke. Forsidens dom er bygget
 * af 20+ hentninger; fejler én af dem stille, mangler der linjer, og
 * forsiden ser normal ud. Målt 10/9 (recon-fejlovervaagningen §2, bekræftet
 * ved læsning): tolv af forsidens hentninger læste `.data || []` uden at se
 * på `error`; virksomhedssiden sytten af nitten; listen to; opgaverne én;
 * invitationerne to. Alle går nu gennem kraevRaekker/kraevRaekke og KASTER
 * med kildens navn (HentningsFejl.kilde), så fladen kan sige HVAD der
 * manglede — og at skærmen ikke kan stoles på.
 *
 * TEKSTEN siger derfor ikke «prøv igen» alene. Den siger hvad der ikke
 * kunne hentes, og at fladen kan mangle noget: «Uploads kunne ikke hentes —
 * forsiden kan mangle linjer. Prøv igen.» Rådgiveren skal vide at det han
 * ser, ikke er hele billedet. Rolig tone, ingen teknik, kildens navn i
 * rådgiverens ord.
 *
 * VAGTEN (beslutning, ikke bygget): cron-vagten ser cron-fejl. Om en fejlet
 * hentning på rådgiverforsiden også skal stå i driftslinjen, er en
 * beslutning — Sentry får den allerede gennem QueryCache.onError (#702),
 * fordi queryFn'en nu kaster.
 */

import { kildeAf } from "./hjemmebane/hentefejl";

/** Kildens navn (tabellen HentningsFejl bærer) → rådgiverens ord. */
// data_basis-undtagelse: kun tabelNAVNE i en ordbog til fejltekster — filen læser ingen rækker
export const RAADGIVER_KILDE_ORD: Readonly<Record<string, string>> = {
  companies: "virksomhederne",
  company_members: "medlemmerne",
  profiles: "medlemmernes navne",
  member_profiles: "medlemmernes profiler",
  get_all_advisor_profiles: "rådgiverne",
  conversations: "samtalerne",
  messages: "beskederne",
  financial_report_facts: "virksomhedernes tal",
  financial_reports: "rapporterne",
  kpi_targets: "KPI-målene",
  budget_targets: "budgetterne",
  milestones: "milepælene",
  handouts: "handouts",
  pulse_checkins: "refleksionerne",
  agent_proposals: "forslagene",
  company_actions: "opgaverne",
  company_invitations: "invitationerne",
  company_fornyelse: "fornyelserne",
  company_betalingslink: "betalingslinkene",
  company_traek: "trækkene",
  company_perioder: "perioderne",
  advisor_company_acknowledgments: "kvitteringerne",
  email_send_log: "mailloggen",
  uploads: "uploads",
};

export type RaadgiverFlade = "forsiden" | "virksomheden" | "listen" | "opgaverne" | "invitationerne";

/** Hvad fladen kan mangle — det rådgiveren skal vide om skærmen. */
export const FLADE_MANGEL: Readonly<Record<RaadgiverFlade, string>> = {
  forsiden: "forsiden kan mangle linjer",
  virksomheden: "siden kan mangle noget",
  listen: "listen kan mangle noget",
  opgaverne: "listen kan mangle noget",
  invitationerne: "listen kan mangle noget",
};

/** Rådgiverens ord for en kilde; ukendte kilder bliver «noget af det der står her». */
export function raadgiverKildeOrd(kilde: string): string {
  return RAADGIVER_KILDE_ORD[kilde] ?? "noget af det der står her";
}

/** «Uploads kunne ikke hentes — forsiden kan mangle linjer. Prøv igen.» */
export function raadgiverHentefejlTekst(error: unknown, flade: RaadgiverFlade): string {
  const ord = raadgiverKildeOrd(kildeAf(error));
  return `${ord.charAt(0).toUpperCase()}${ord.slice(1)} kunne ikke hentes — ${FLADE_MANGEL[flade]}. Prøv igen.`;
}
