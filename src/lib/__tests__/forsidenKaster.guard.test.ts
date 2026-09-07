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
      expect(hentning, `${variabel}.data || [] findes stadig`).not.toMatch(new RegExp(`${variabel}(?: as any)?\\)?\\??\\.data\\s*\\|\\|`));
    });
  }
});
