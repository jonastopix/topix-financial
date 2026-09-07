import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Driftværn for puklen «N agentforslag venter på din afgørelse» (rettet
// 7/9). agent_proposals.status kan være proposed | approved | rejected |
// expired. INGEN kode sætter 'expired' — fire write_session_prep-forslag
// blev sat i hånden 1/9, da evnen blev fjernet — og en expired-række har
// decided_at = NULL, fordi ingen afgjorde den. AgentForslagPanel viser
// kun knapper for status === 'proposed', så et expired-forslag kan IKKE
// afgøres. Talte puklen på «decided_at is null», talte den de døde med,
// og rådgiveren klikkede ind på noget der ikke kunne afgøres.
//
// Dommen (forsidensDom) modtager kun et TAL og kan ikke skelne status;
// filtret bor i de to hentninger, og det er dem værnet låser:
//   1) AdvisorDashboard (porteføljebredt, forsidens pukkel)
//   2) useVirksomhed (virksomhedssidens signal)
// Begge SKAL filtrere på status = 'proposed' og må IKKE filtrere på
// decided_at. Kilde-læsning frem for import: begge er React/Supabase-
// kode uden ren funktion at kalde — agentProposals.guard.test.ts-mønstret.

const kilder = {
  "src/components/AdvisorDashboard.tsx": readFileSync(resolve(process.cwd(), "src/components/AdvisorDashboard.tsx"), "utf8"),
  "src/hooks/useVirksomhed.ts": readFileSync(resolve(process.cwd(), "src/hooks/useVirksomhed.ts"), "utf8"),
};

/** Udsnittet fra .from("agent_proposals") til næste .from( — selve query-kæden. */
function agentProposalsQuery(kilde: string): string {
  const start = kilde.indexOf('.from("agent_proposals")');
  expect(start, "hentningen af agent_proposals mangler").toBeGreaterThan(-1);
  const rest = kilde.slice(start + 1);
  const slut = rest.indexOf(".from(");
  return rest.slice(0, slut === -1 ? undefined : slut);
}

describe("puklen tæller kun det der kan afgøres — status = 'proposed', aldrig decided_at", () => {
  for (const [sti, kilde] of Object.entries(kilder)) {
    it(`${sti}: filtrerer på status = 'proposed'`, () => {
      const query = agentProposalsQuery(kilde);
      expect(query, "filtret på status = 'proposed' mangler").toContain('.eq("status", "proposed")');
    });

    it(`${sti}: filtrerer IKKE på decided_at — 'expired' har også null dér`, () => {
      const query = agentProposalsQuery(kilde);
      expect(query, "decided_at er ikke et svar på «kan det afgøres»").not.toContain("decided_at");
    });
  }
});
