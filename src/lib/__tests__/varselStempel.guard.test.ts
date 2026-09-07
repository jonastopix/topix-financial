import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
