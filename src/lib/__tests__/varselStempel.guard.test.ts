import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afgoerForsidensDom } from "@/lib/forsidensDom";
import { fornyelsesBadge } from "@/lib/fornyelsesOrd";

// Driftværn for forsidens varsel-linje (7/9): forsidens dom siger «Skriv til
// X» i stedet for «Send tilbuddet til X», når company_fornyelse.
// varsel_1_sendt_at er sat. Dommen (forsidensDom.grundFraFornyelse) modtager
// stemplet gennem VirksomhedTilDom.varsel1SendtAt og kan ikke selv hente
// det; det bor i de to hentninger, og det er dem værnet låser:
//   1) AdvisorDashboard (porteføljebredt, forsidens linje)
//   2) useVirksomhed (virksomhedssidens «derfor er du her»)
// Begge SKAL bære kolonnen i select'en — to hentninger, ét tal. Det var
// præcis den asymmetri #682 og #689 fandt på agent_proposals (det ene sted
// rettet, det andet ikke). Kilde-læsning frem for import: begge er
// React/Supabase-kode uden ren funktion at kalde
// (agentforslagVenter.guard.test.ts-mønstret).

const kilder = {
  "src/components/AdvisorDashboard.tsx": readFileSync(resolve(process.cwd(), "src/components/AdvisorDashboard.tsx"), "utf8"),
  "src/hooks/useVirksomhed.ts": readFileSync(resolve(process.cwd(), "src/hooks/useVirksomhed.ts"), "utf8"),
};

/** Hvor VirksomhedTilDom bygges af hver hentning: AdvisorDashboard selv;
    useVirksomheds data bygges videre i VirksomhedView (findDerfor). */
const byggere = {
  "src/components/AdvisorDashboard.tsx": kilder["src/components/AdvisorDashboard.tsx"],
  "src/components/hjemmebane/virksomhed/VirksomhedView.tsx": readFileSync(
    resolve(process.cwd(), "src/components/hjemmebane/virksomhed/VirksomhedView.tsx"),
    "utf8",
  ),
};

/** Udsnittet fra .from("company_fornyelse" til næste .from( — selve query-kæden. */
function companyFornyelseQuery(kilde: string): string {
  const start = kilde.indexOf('.from("company_fornyelse"');
  expect(start, "hentningen af company_fornyelse mangler").toBeGreaterThan(-1);
  const rest = kilde.slice(start + 1);
  const slut = rest.indexOf(".from(");
  return rest.slice(0, slut === -1 ? undefined : slut);
}

describe("forsidens varsel-linje — begge hentninger bærer varsel_1_sendt_at", () => {
  for (const [sti, kilde] of Object.entries(kilder)) {
    it(`${sti}: select'en på company_fornyelse indeholder varsel_1_sendt_at`, () => {
      const query = companyFornyelseQuery(kilde);
      expect(query, "select'en mangler varsel_1_sendt_at — dommen kan ikke skelne «send» fra «skriv»").toContain("varsel_1_sendt_at");
    });

  }

  for (const [sti, kilde] of Object.entries(byggere)) {
    it(`${sti}: stemplet gives videre som VirksomhedTilDom.varsel1SendtAt`, () => {
      expect(kilde, "feltet varsel1SendtAt sættes ikke — dommen ser altid null").toContain("varsel1SendtAt:");
    });
  }
});

// VARSEL 2 (7/9 aften, CARMA): påmindelsen vinder over varslet (lib/varselTrin),
// og dommen læser VirksomhedTilDom.varsel2SendtAt. BEGGE hentninger bærer
// kolonnen, og BEGGE byggere sætter feltet — samme form som varsel 1 ovenfor.
// Før AdvisorDashboard fik kolonnen, sagde forsiden «Varslet er sendt» om
// CARMA mens virksomhedssiden sagde «Påmindelse sendt» — to flader, to svar.
describe("påmindelsen (varsel 2) — begge hentninger bærer varsel_2_sendt_at", () => {
  for (const [sti, kilde] of Object.entries(kilder)) {
    it(`${sti}: select'en på company_fornyelse indeholder varsel_2_sendt_at`, () => {
      const query = companyFornyelseQuery(kilde);
      expect(query, "select'en mangler varsel_2_sendt_at — dommen ser aldrig påmindelsen").toContain("varsel_2_sendt_at");
    });
  }

  for (const [sti, kilde] of Object.entries(byggere)) {
    it(`${sti}: stemplet gives videre som VirksomhedTilDom.varsel2SendtAt`, () => {
      expect(kilde, "feltet varsel2SendtAt sættes ikke — dommen falder tilbage på varsel 1 alene").toContain("varsel2SendtAt:");
    });
  }

  // Paritet på CARMA's tilfælde: badget (fornyelsesBadge) og forsidens dom
  // (grundFraFornyelse) skal give SAMME trin for samme stempler — varsel 2
  // sat, varsel 1 null. Det er de to steder der drev fra hinanden.
  it("CARMA ordret: badge og forsidens dom siger begge «påmindet» for varsel 2 uden varsel 1", () => {
    const v2 = "2026-09-07T11:57:53.000Z";
    expect(fornyelsesBadge("klar_til_tilbud", null, v2)).toBe("klar_til_tilbud_paamindet");
    const d = afgoerForsidensDom(
      [{
        companyId: "carma", navn: "CARMA STUDIO", signaler: [], agentforslagVenter: 0,
        fornyelse: { status: "klar_til_tilbud", dage_til_udloeb: 0, tier: "full" },
        varsel1SendtAt: null, varsel2SendtAt: v2, indgang: null, opgaver: [],
      }],
      new Date("2026-09-07T12:00:00.000Z"),
    );
    const grund = d.linjer.find((l) => l.linje === "virksomhed")?.grunde[0];
    expect(grund).toMatchObject({ signaltype: "klar_til_tilbud_paamindet", handling: "Skriv til CARMA STUDIO" });
  });
});
