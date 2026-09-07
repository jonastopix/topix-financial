import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Driftværn for forsidens datalag (rettet 7/9, recon-tavse-fejl.md pkt. 1):
// hentAdvisorDashboard læste alle delkald som `res.data || []` og kastede
// aldrig. Fejlede ét delkald, forsvandt den slags fra dommen, og forsiden
// sagde «Der er ikke noget der haster i dag» — udløbne kontrakter og
// ubetalte indgange forsvandt uden spor. RaadgiverForsideViews isError-gren
// fandtes, men kunne ikke fyre.
//
// De ni kilder dommen hviler på SKAL læses gennem kraevRaekker (kaster med
// kildens navn). Kilde-læsning frem for import: hentAdvisorDashboard er
// Supabase-kode uden ren funktion at kalde (agentforslagVenter.guard-mønstret).
// De ti øvrige delkald (pulse, aktivitetsfeed, milestones, kpi_targets,
// rådgiverprofiler, handouts, medlemsnavne, sidste login) føder kun den
// pensionerede AdvisorDashboard-komponent eller er berigelser — de læses
// som før, og det er et valg, ikke en forglemmelse.
//
// VIRKSOMHEDSLISTEN (7/9, pkt. 2 på rangeringen): hentVirksomhedsliste i
// VirksomhedslisteView havde samme hul — «Der er ingen virksomheder endnu»
// for hele porteføljen. Fire af seks kilder kaster (companies,
// conversations, financial_report_facts, company_traek); company_members
// og profiles er berigelser med indbygget fald-tilbage og læses som før.
// Fladen SKAL desuden have en isError-gren, så fejl ikke ligner tom.

const sti = "src/components/AdvisorDashboard.tsx";
const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");

/** Fra `export const hentAdvisorDashboard` til `export type AdvisorDashboardData`. */
const hentning = (() => {
  const start = kilde.indexOf("export const hentAdvisorDashboard");
  const slut = kilde.indexOf("export type AdvisorDashboardData");
  expect(start, "hentAdvisorDashboard mangler").toBeGreaterThan(-1);
  expect(slut, "AdvisorDashboardData mangler").toBeGreaterThan(start);
  return kilde.slice(start, slut);
})();

const SKAL_KASTE: Array<[variabel: string, kildenavn: string]> = [
  ["convRes", "conversations"],
  ["companiesRes", "companies"],
  ["factsRes", "financial_report_facts"],
  ["companyMembersRes", "company_members"],
  ["companyInvitationsRes", "company_invitations"],
  ["agentProposalsRes", "agent_proposals"],
  ["fornyelseRes", "company_fornyelse"],
  ["betalingslinkRes", "company_betalingslink"],
  ["aktiveOpgaverRes", "company_actions"],
];

describe("forsidens delkald kaster — dommens ni kilder læses gennem kraevRaekker", () => {
  it(`${sti}: importerer kraevRaekker fra @/lib/kraevRaekker`, () => {
    expect(kilde).toContain('from "@/lib/kraevRaekker"');
  });

  for (const [variabel, kildenavn] of SKAL_KASTE) {
    it(`${variabel} (${kildenavn}): læses med kraevRaekker og navngiver kilden`, () => {
      expect(hentning, `kraevRaekker(${variabel}, "${kildenavn}") mangler`).toContain(`kraevRaekker(${variabel}, "${kildenavn}")`);
    });

    it(`${variabel}: læses IKKE længere som \`.data || []\` — det gjorde fejlen til et tomt svar`, () => {
      expect(hentning, `${variabel}.data || [] findes stadig`).not.toMatch(dataFallback(variabel));
    });
  }
});

/** `x.data || []`, `x.data ?? []`, `(x as any)?.data || []` — alle former der gør en fejl til tomt. */
function dataFallback(variabel: string): RegExp {
  return new RegExp(`${variabel}(?: as any)?\\)?\\??\\.data\\s*(?:\\|\\||\\?\\?)`);
}

const listeSti = "src/components/hjemmebane/virksomheder/VirksomhedslisteView.tsx";
const listeKilde = readFileSync(resolve(process.cwd(), listeSti), "utf8");

/** Fra `async function hentVirksomhedsliste` til `export const VirksomhedslisteView`. */
const listeHentning = (() => {
  const start = listeKilde.indexOf("async function hentVirksomhedsliste");
  const slut = listeKilde.indexOf("export const VirksomhedslisteView");
  expect(start, "hentVirksomhedsliste mangler").toBeGreaterThan(-1);
  expect(slut, "VirksomhedslisteView mangler").toBeGreaterThan(start);
  return listeKilde.slice(start, slut);
})();

const LISTEN_SKAL_KASTE: Array<[variabel: string, kildenavn: string]> = [
  ["companiesRes", "companies"],
  ["convsRes", "conversations"],
  ["factsRes", "financial_report_facts"],
  ["traekRes", "company_traek"],
];

describe("virksomhedslistens delkald kaster — fire kilder gennem kraevRaekker, og fejl ligner ikke tom", () => {
  it(`${listeSti}: importerer kraevRaekker fra @/lib/kraevRaekker`, () => {
    expect(listeKilde).toContain('from "@/lib/kraevRaekker"');
  });

  for (const [variabel, kildenavn] of LISTEN_SKAL_KASTE) {
    it(`${variabel} (${kildenavn}): læses med kraevRaekker og navngiver kilden`, () => {
      expect(listeHentning, `kraevRaekker(${variabel}, "${kildenavn}") mangler`).toContain(`kraevRaekker(${variabel}, "${kildenavn}")`);
    });

    it(`${variabel}: læses IKKE som \`.data ?? []\``, () => {
      expect(listeHentning, `${variabel}.data ?? [] findes stadig`).not.toMatch(dataFallback(variabel));
    });
  }

  it("fladen har en isError-gren der siger «kunne ikke hentes» — ikke «ingen virksomheder»", () => {
    expect(listeKilde).toContain("listeQuery.isError");
    expect(listeKilde).toContain("Listen kunne ikke hentes. Prøv igen.");
  });
});
