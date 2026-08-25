import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Driftværn for invariansen: en agent_runs-række med proposals-elementer
// må ikke kunne eksistere uden matchende agent_proposals-rækker
// (docs/agent-forslag-design.md §7). CI har ingen database, så værnet
// håndhæver invariansen dér hvor den kan brydes — i kildekoden:
//   1) run-company-agent SKAL spejle proposals-arrayet til agent_proposals
//      umiddelbart efter agent_runs-insertet, og SKAL fejle ærligt
//      (proposals_log_failed) hvis spejlingen fejler — fjernes et af de
//      to, går rækker i stykker stille, og denne test fejler.
//   2) Migrationen SKAL backfille eksisterende arrays idempotent, så
//      historiske kørsler ikke står uden beslutningsrækker.
// Kilde-læsning frem for import: index.ts kan ikke importeres i Vitest
// (Deno.serve + esm.sh-imports) — agentToerkoersel.test.ts-mønstret.

const rcaSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/run-company-agent/index.ts"),
  "utf8",
);
const migrationSource = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260825200000_agent_proposals.sql"),
  "utf8",
);

describe("agent_proposals — kørsel og beslutningsrækker skal følges ad", () => {
  it("run-company-agent spejler proposals til agent_proposals efter agent_runs-insertet", () => {
    const runsInsert = rcaSource.indexOf('.from("agent_runs")');
    const proposalsInsert = rcaSource.indexOf('.from("agent_proposals")');
    expect(runsInsert, "agent_runs-insertet mangler").toBeGreaterThan(-1);
    expect(proposalsInsert, "agent_proposals-insertet mangler — kørsler med forslag ville stå uden beslutningsrækker").toBeGreaterThan(-1);
    expect(proposalsInsert, "agent_proposals skal skrives EFTER agent_runs (run_id kommer derfra)").toBeGreaterThan(runsInsert);
  });

  it("spejlingen gater på kørsler MED forslag og bruger arrayets rækkefølge som position", () => {
    expect(rcaSource).toContain("runId && proposals.length > 0");
    expect(rcaSource).toContain("position: i");
    expect(rcaSource).toContain("run_id: runId");
  });

  it("fejlet spejling fejler kørslen ærligt — ikke stiltiende", () => {
    // Samme kontrakt som run_log_failed: et fejlet insert skal ud af
    // funktionen som ok:false med sin egen fejlkode, aldrig sluges.
    expect(rcaSource).toContain("proposals_log_failed");
    const failBlock = rcaSource.slice(rcaSource.indexOf("proposals_log_failed") - 600, rcaSource.indexOf("proposals_log_failed"));
    expect(failBlock).toContain("ok: false");
  });

  it("migrationen backfiller eksisterende proposals-arrays idempotent", () => {
    expect(migrationSource).toContain("jsonb_array_elements(r.proposals) WITH ORDINALITY");
    expect(migrationSource).toContain("(p.ordinality - 1)::int");
    expect(migrationSource).toContain("ON CONFLICT (run_id, position) DO NOTHING");
  });

  it("migrationen bærer beslutnings-constraints og service-role-only-skrivning", () => {
    expect(migrationSource).toContain("CONSTRAINT forkast_kraever_grund");
    expect(migrationSource).toContain("CONSTRAINT afgjort_kraever_afgoerer");
    expect(migrationSource).toContain("UNIQUE (run_id, position)");
    // Kun to policies: advisor-SELECT + service role ALL — ingen
    // klient-skrivning.
    const policies = migrationSource.match(/CREATE POLICY/g) ?? [];
    expect(policies.length).toBe(2);
    expect(migrationSource).toContain('"Advisors can view agent proposals"');
    expect(migrationSource).toContain('"Service role can manage agent proposals"');
  });
});
