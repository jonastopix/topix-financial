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
//
// /members OG MEDLEMMETS FORSIDE (7/9, pkt. 3 og 4): Members.tsx' hentning
// fodrer også FornyelsesSektion og IndgangsSektion med rækkerne — en fejl
// blev til «Ingen virksomheder endnu» og «intet at beslutte». Otte kilder
// kaster; profiles, user_login_log, get_users_last_login, email_send_log og
// pulse_checkins er berigelser med fald-tilbage og læses som før.
// BoardroomView: «Dine aftaler» (company_actions) og de ulæste
// (conversations + messages, head-tællinger → HentningsFejl direkte)
// kaster; fejlen vises PR. SEKTION, ikke for hele forsiden.

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

// ───────── /members ─────────
const membersSti = "src/pages/Members.tsx";
const membersKilde = readFileSync(resolve(process.cwd(), membersSti), "utf8");

/** Fra `queryKey: ["members-data"` til `enabled: !!user && !!isAdvisor` — selve queryFn'en. */
const membersHentning = (() => {
  const start = membersKilde.indexOf('queryKey: ["members-data"');
  const slut = membersKilde.indexOf("enabled: !!user && !!isAdvisor", start);
  expect(start, "members-data-hentningen mangler").toBeGreaterThan(-1);
  expect(slut, "enabled-linjen mangler").toBeGreaterThan(start);
  return membersKilde.slice(start, slut);
})();

const MEMBERS_SKAL_KASTE: Array<[variabel: string, kildenavn: string]> = [
  ["companiesRes", "companies"],
  ["membersRes", "company_members"],
  ["convsRes", "conversations"],
  ["reportsRes", "financial_reports"],
  ["invitationsRes", "company_invitations"],
  ["factsRes", "financial_report_facts"],
  ["traekRes", "company_traek"],
  ["unreadRes", "messages"],
];

describe("/members' delkald kaster — otte kilder gennem kraevRaekker, og fejl ligner ikke tom", () => {
  it(`${membersSti}: importerer kraevRaekker fra @/lib/kraevRaekker`, () => {
    expect(membersKilde).toContain('from "@/lib/kraevRaekker"');
  });

  for (const [variabel, kildenavn] of MEMBERS_SKAL_KASTE) {
    it(`${variabel} (${kildenavn}): læses med kraevRaekker og navngiver kilden`, () => {
      expect(membersHentning, `kraevRaekker(${variabel}, "${kildenavn}") mangler`).toContain(`kraevRaekker(${variabel}, "${kildenavn}")`);
    });

    it(`${variabel}: læses IKKE som \`.data || []\``, () => {
      expect(membersHentning, `${variabel}.data || [] findes stadig`).not.toMatch(dataFallback(variabel));
    });
  }

  it("fladen har en isError-gren der siger «kunne ikke hentes» — ikke «Ingen virksomheder endnu»", () => {
    expect(membersKilde).toContain("isError: listenFejlede");
    expect(membersKilde).toContain("Listen kunne ikke hentes. Prøv igen.");
  });
});

// ───────── Medlemmets forside ─────────
const boardroomSti = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const boardroomKilde = readFileSync(resolve(process.cwd(), boardroomSti), "utf8");

/** Fra `const actionsQuery = useQuery` til `const leversQuery = useQuery` — aftaler og ulæste. */
const boardroomHentning = (() => {
  const start = boardroomKilde.indexOf("const actionsQuery = useQuery");
  const slut = boardroomKilde.indexOf("const leversQuery = useQuery", start);
  expect(start, "actionsQuery mangler").toBeGreaterThan(-1);
  expect(slut, "leversQuery mangler").toBeGreaterThan(start);
  return boardroomKilde.slice(start, slut);
})();

describe("medlemmets forside — «Dine aftaler» og de ulæste kaster, og fejlen vises pr. sektion", () => {
  it(`${boardroomSti}: importerer HentningsFejl og kraevRaekker`, () => {
    expect(boardroomKilde).toContain('from "@/lib/kraevRaekker"');
  });

  it("company_actions læses med kraevRaekker og navngiver kilden", () => {
    expect(boardroomHentning).toContain('kraevRaekker(actionsRes, "company_actions")');
    expect(boardroomHentning, "det gamle `(data || [])` er tilbage").not.toMatch(/\(data \|\| \[\]\)/);
    expect(boardroomHentning, "det gamle `const { data } = await` er tilbage").not.toMatch(/const \{ data(?::\s*\w+)? \} = await supabase/);
  });

  it("de ulæste kaster HentningsFejl for conversations og messages — head-tællinger har ingen rækker", () => {
    expect(boardroomHentning).toContain('new HentningsFejl("conversations"');
    expect(boardroomHentning).toContain('new HentningsFejl("messages"');
  });

  it("fejlen vises pr. sektion — «Dine aftaler» og de ulæste — ikke for hele forsiden", () => {
    expect(boardroomKilde).toContain("actionsQuery.isError");
    expect(boardroomKilde).toContain("Dine aftaler kunne ikke hentes. Prøv igen.");
    expect(boardroomKilde).toContain("unreadQuery.isError");
    expect(boardroomKilde).toContain("Dine ulæste beskeder kunne ikke hentes. Prøv igen.");
  });
});

// ───────── Rapportering (medlemmets rapportliste og årsrapporter) ─────────
const rapportSti = "src/components/hjemmebane/rapportering/RapporteringView.tsx";
const rapportKilde = readFileSync(resolve(process.cwd(), rapportSti), "utf8");

/** Fra `const reportsQuery = useQuery` til `const dbReports = useMemo` — månedsrapporterne. */
const rapportHentning = (() => {
  const start = rapportKilde.indexOf("const reportsQuery = useQuery");
  const slut = rapportKilde.indexOf("const dbReports = useMemo", start);
  expect(start, "reportsQuery mangler").toBeGreaterThan(-1);
  expect(slut, "dbReports mangler").toBeGreaterThan(start);
  return rapportKilde.slice(start, slut);
})();

/** Fra `const annualQuery = useQuery` til `const annualReports =` — årsrapporterne. */
const aarsHentning = (() => {
  const start = rapportKilde.indexOf("const annualQuery = useQuery");
  const slut = rapportKilde.indexOf("const annualReports =", start);
  expect(start, "annualQuery mangler").toBeGreaterThan(-1);
  expect(slut, "annualReports mangler").toBeGreaterThan(start);
  return rapportKilde.slice(start, slut);
})();

const RAPPORT_SKAL_KASTE: Array<[hentning: string, variabel: string, kildenavn: string, navn: string]> = [
  [rapportHentning, "reportsRes", "financial_reports", "månedsrapporterne"],
  [aarsHentning, "annualRes", "financial_reports", "årsrapporterne"],
];

describe("rapporteringen kaster — «Ingen rapporter endnu — upload din første» må aldrig være en fejl", () => {
  it(`${rapportSti}: importerer kraevRaekker fra @/lib/kraevRaekker`, () => {
    expect(rapportKilde).toContain('from "@/lib/kraevRaekker"');
  });

  for (const [hentning, variabel, kildenavn, navn] of RAPPORT_SKAL_KASTE) {
    it(`${navn}: ${variabel} (${kildenavn}) læses med kraevRaekker og navngiver kilden`, () => {
      expect(hentning, `kraevRaekker(${variabel}, "${kildenavn}") mangler`).toContain(`kraevRaekker(${variabel}, "${kildenavn}")`);
    });

    it(`${navn}: læses IKKE som \`.data ?? []\` eller \`const { data } = await\``, () => {
      expect(hentning, `${variabel}.data ?? [] findes stadig`).not.toMatch(dataFallback(variabel));
      expect(hentning, "det gamle `(data ?? [])` er tilbage").not.toMatch(/\(data \?\? \[\]\)/);
      expect(hentning, "det gamle `const { data } = await` er tilbage").not.toMatch(/const \{ data(?::\s*\w+)? \} = await supabase/);
    });
  }

  it("listen har en isError-gren der siger «kunne ikke hentes» — og IKKE opfordrer til upload", () => {
    expect(rapportKilde).toContain("reportsQuery.isError");
    expect(rapportKilde).toContain("Dine rapporter kunne ikke hentes.");
  });

  it("årsrapporterne har en isError-gren, og upload er gated på den (ellers en dublet)", () => {
    expect(rapportKilde).toContain("annualQuery.isError");
    expect(rapportKilde).toContain("Dine årsrapporter kunne ikke hentes.");
  });
});
