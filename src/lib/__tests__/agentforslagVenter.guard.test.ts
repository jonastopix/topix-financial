import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ejefald, kraeverAfgoerelse, ugefokusForklaring, UNDERSTOETTEDE_SKRIVEVEJE_FLADE } from "../forslagFlade";

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

    // Udløbsdommen (besluttet 7/9): et forslag fra en passeret ISO-uge kan
    // kun forkastes og må ikke tælles. Dommen er en ren funktion på
    // proposed_at og et «nu» (@/lib/forslagUdloeb) og kan ikke stå i SQL
    // uden at kopiere ISO-uge-beregningen — så hentningen SKAL bære
    // proposed_at, og optællingen SKAL kalde erForslagGyldigt.
    it(`${sti}: henter proposed_at, så udløbsdommen kan regnes i kode`, () => {
      const query = agentProposalsQuery(kilde);
      expect(query, "select'en mangler proposed_at — dommen kan ikke regnes").toContain("proposed_at");
      expect(query, "count/head kan ikke bære rækker — dommen kræver proposed_at pr. række").not.toContain("head: true");
    });

    // 30/9 (design §9): kun forslag, der KRÆVER rådgiveren, tæller — gyldige
    // OG godkendbare. Dommen kraeverAfgoerelse (@/lib/forslagFlade) bærer
    // både udløbsdommen og godkend-vejen; hentningen SKAL bære tool.
    it(`${sti}: tæller med kraeverAfgoerelse fra @/lib/forslagFlade og henter tool`, () => {
      expect(kilde, "importen af dommen mangler").toMatch(/import \{[^}]*kraeverAfgoerelse[^}]*\} from "@\/lib\/forslagFlade"/);
      expect(kilde, "optællingen kalder ikke dommen").toContain("kraeverAfgoerelse(p, ");
      expect(agentProposalsQuery(kilde), "select'en mangler tool — godkend-vejen kan ikke dømmes").toMatch(/\.select\("[^"]*\btool\b/);
      // Ingen lokal kopi af dommen ved siden af.
      expect(kilde).not.toContain("erForslagGyldigt(");
      expect(kilde).not.toContain("UNDERSTOETTEDE_SKRIVEVEJE_FLADE");
    });
  }
});

// Dommen selv (30/9, agent-forslag-design §9): et forslag kræver rådgiveren
// ⇔ gyldigt (indeværende ISO-uge) OG godkendbart (tool med godkend-vej).
describe("kraeverAfgoerelse — kun det, der kan afgøres, venter på nogen", () => {
  // Onsdag 30/9-2026 kl. 12 lokal tid (uge 40).
  const nu = new Date(2026, 8, 30, 12, 0, 0);
  const iUgen = new Date(2026, 8, 29, 9, 0, 0).toISOString();
  const sidsteUge = new Date(2026, 8, 25, 9, 0, 0).toISOString();

  it("ugens fokus fra denne uge → ja", () => {
    expect(kraeverAfgoerelse({ proposed_at: iUgen, tool: "update_weekly_focus" }, nu)).toBe(true);
  });
  it("opgaveforslag (write_company_action) → nej, heller ikke fra denne uge", () => {
    expect(kraeverAfgoerelse({ proposed_at: iUgen, tool: "write_company_action" }, nu)).toBe(false);
  });
  it("ugens fokus fra en passeret uge → nej (kan kun forkastes)", () => {
    expect(kraeverAfgoerelse({ proposed_at: sidsteUge, tool: "update_weekly_focus" }, nu)).toBe(false);
  });
  it("null tool eller ulæseligt stempel → nej (fail-closed)", () => {
    expect(kraeverAfgoerelse({ proposed_at: iUgen, tool: null }, nu)).toBe(false);
    expect(kraeverAfgoerelse({ proposed_at: "ikke en dato", tool: "update_weekly_focus" }, nu)).toBe(false);
  });
  it("følger godkend-listen: hvert godkendbart tool giver ja", () => {
    for (const t of UNDERSTOETTEDE_SKRIVEVEJE_FLADE) {
      expect(kraeverAfgoerelse({ proposed_at: iUgen, tool: t }, nu)).toBe(true);
    }
  });
});

// Panelet (30/9, design §9): linjen over ugefokus-forslaget og knappen, der
// siger hvad den gør.
describe("AgentForslagPanel — forståeligt for en rådgiver", () => {
  const panel = readFileSync(resolve(process.cwd(), "src/components/AgentForslagPanel.tsx"), "utf8");

  it("ugefokusForklaring siger hvad godkendelse gør og at forslaget udløber søndag", () => {
    expect(ugefokusForklaring("Carma")).toBe("Godkend, så erstatter det ugens fokus på Carmas forside. Forslaget udløber søndag.");
    expect(ugefokusForklaring("Topix")).toContain("på Topix' forside");
    expect(ugefokusForklaring(null)).toContain("på medlemmets forside");
    expect(ejefald("Bland Selv Frø")).toBe("Bland Selv Frøs");
  });

  it("linjen står over et godkendbart ugefokus-forslag, og knappen hedder «Foreslå ugens fokus»", () => {
    expect(panel).toContain("ugefokusForklaring(virksomhedsnavn)");
    expect(panel).toContain('"Foreslå ugens fokus"');
    expect(panel).not.toContain("Kør agent (tørt)");
    // Et ikke-godkendbart forslag er til orientering — intet løfte om «endnu».
    expect(panel).toContain("TIL_ORIENTERING_TEKST");
    expect(panel).not.toContain("Kan endnu ikke godkendes herfra");
  });

  it("knappen kører stadig TØRT og som company_review", () => {
    const kald = panel.slice(panel.indexOf('invoke("run-company-agent"'));
    expect(kald.slice(0, 300)).toContain('trigger: "company_review"');
    expect(kald.slice(0, 300)).toContain("dry_run: true");
  });
});

describe("AgentForslagPanel — «fandt intet» er kun et regulært slut (rådets fund 1, 30/9)", () => {
  const panelTekst = readFileSync("src/components/AgentForslagPanel.tsx", "utf8");
  it("den rolige besked kræver stop_reason === finish", () => {
    expect(panelTekst).toContain('agentData?.diagnostics?.stop_reason === "finish"');
  });
});
