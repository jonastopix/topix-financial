import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  afgoerelsesPatch,
  FORKAST_KATEGORIER,
  kanAfgoeres,
  skrivegrundlag,
  UNDERSTOETTEDE_SKRIVEVEJE,
  validerInput,
  validerKategori,
} from "../../../supabase/functions/_shared/forslagEngine.ts";

// Afgørelses-motorens domme (design §7) + kildeværn for det
// edge-funktionen SKAL gøre udenom motoren: rolle-gate før service role,
// skrivning før afgørelse, decided_by aldrig fra body.
// Kildeværns-mønstret er agentProposals.guard.test.ts (CI har ingen DB).

const afgoerSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/agent-forslag-afgoer/index.ts"),
  "utf8",
);
const rcaSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/run-company-agent/index.ts"),
  "utf8",
);

describe("forslagEngine — motorens domme", () => {
  it("afvisning uden grund fejler (A4 — spejler forkast_kraever_grund)", () => {
    expect(validerInput("reject", undefined, undefined).ok).toBe(false);
    expect(validerInput("reject", "", undefined).ok).toBe(false);
    expect(validerInput("reject", "   ", undefined).ok).toBe(false);
    expect(validerInput("reject", "Ikke relevant for denne virksomhed", undefined).ok).toBe(true);
  });

  it("ukendt decision og manglende edited_args afvises", () => {
    expect(validerInput("expire", undefined, undefined).ok).toBe(false);
    expect(validerInput("approve_edited", undefined, undefined).ok).toBe(false);
    expect(validerInput("approve_edited", undefined, ["liste"]).ok).toBe(false);
    expect(validerInput("approve_edited", undefined, { headline: "x" }).ok).toBe(true);
    expect(validerInput("approve", undefined, undefined).ok).toBe(true);
  });

  it("kun 'proposed' kan afgøres — alt andet er en ærlig fejl", () => {
    expect(kanAfgoeres("proposed").ok).toBe(true);
    for (const status of ["approved", "rejected", "expired"]) {
      const dom = kanAfgoeres(status) as { ok: boolean; grund?: string };
      expect(dom.ok).toBe(false);
      expect(dom.grund).toContain(status);
    }
  });

  it("approve_edited skriver edited_args som grundlag — args røres aldrig", () => {
    const args = { headline: "agentens", summary: "original" };
    const edited = { headline: "rådgiverens", summary: "version" };
    expect(skrivegrundlag("approve_edited", args, edited)).toBe(edited);
    expect(skrivegrundlag("approve", args, edited)).toBe(args);
    expect(skrivegrundlag("reject", args, edited)).toBe(args);
    // Patchen gemmer edited_args-kolonnen KUN ved approve_edited.
    const patchEdited = afgoerelsesPatch("approve_edited", "advisor-1", new Date(2026, 7, 25), undefined, edited);
    expect(patchEdited.edited_args).toBe(edited);
    const patchPlain = afgoerelsesPatch("approve", "advisor-1", new Date(2026, 7, 25));
    expect(patchPlain.edited_args).toBeUndefined();
  });

  it("decided_by er altid callerId-parameteren — motoren kender ingen body", () => {
    for (const decision of ["approve", "approve_edited", "reject"] as const) {
      const patch = afgoerelsesPatch(decision, "caller-auth-uid", new Date(2026, 7, 25), "grund", {});
      expect(patch.decided_by).toBe("caller-auth-uid");
      expect(patch.decided_at).toBeTruthy();
    }
    // approve sætter applied_at; reject gør ikke.
    expect(afgoerelsesPatch("approve", "x", new Date()).applied_at).toBeTruthy();
    expect(afgoerelsesPatch("reject", "x", new Date(), "grund").applied_at).toBeUndefined();
  });

  it("de understøttede skriveveje er præcis de delte idempotente", () => {
    expect([...UNDERSTOETTEDE_SKRIVEVEJE].sort()).toEqual([
      "update_weekly_focus",
      "write_session_prep",
    ]);
  });
});

describe("forslagEngine — forkast-kategorien (den tællelige dom, §4.4)", () => {
  it("reject uden kategori fejler", () => {
    expect(validerKategori("reject", undefined).ok).toBe(false);
    expect(validerKategori("reject", null).ok).toBe(false);
    expect(validerKategori("reject", "").ok).toBe(false);
  });

  it("ukendt slug fejler — kun sættet fra FORKAST_KATEGORIER", () => {
    expect(validerKategori("reject", "daarlig_ide").ok).toBe(false);
    expect(validerKategori("reject", "Ikke relevant").ok).toBe(false); // visningstekst er ikke en slug
    for (const slug of FORKAST_KATEGORIER) {
      expect(validerKategori("reject", slug).ok).toBe(true);
    }
  });

  it("kategori sendt ved approve/approve_edited fejler", () => {
    expect(validerKategori("approve", "ikke_relevant").ok).toBe(false);
    expect(validerKategori("approve_edited", "andet").ok).toBe(false);
    // Udeladt kategori er gyldig ved godkendelse:
    expect(validerKategori("approve", undefined).ok).toBe(true);
    expect(validerKategori("approve_edited", undefined).ok).toBe(true);
  });

  it("patchen bærer kategorien ved reject", () => {
    const patch = afgoerelsesPatch("reject", "advisor-1", new Date(2026, 7, 25), "tre nyere kørsler", {}, "forkert_timing");
    expect(patch.decision_category).toBe("forkert_timing");
    expect(patch.status).toBe("rejected");
  });

  it("slugs-sættet matcher migrationens CHECK ordret (paritet mod DB)", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260825230000_agent_proposals_decision_category.sql"),
      "utf8",
    );
    for (const slug of FORKAST_KATEGORIER) {
      expect(migration).toContain(`'${slug}'`);
    }
    // Og migrationen kender ikke slugs som motoren ikke kender: tæl
    // værdisætningens quoted slugs i CHECK-blokken.
    const checkBlok = migration.slice(
      migration.indexOf("agent_proposals_decision_category_valid"),
      migration.indexOf("-- ── 2."),
    );
    const slugsIMigration = [...checkBlok.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(slugsIMigration.sort()).toEqual([...FORKAST_KATEGORIER].sort());
  });

  it("edge-funktionen håndhæver kategorien (kildeværn)", () => {
    expect(afgoerSource).toContain("validerKategori(");
    expect(afgoerSource).toContain("decision_category");
  });
});

describe("agent-forslag-afgoer — kildeværn for rækkefølge og adgang", () => {
  it("medlem afvises på rolle FØR service-role-klienten konstrueres", () => {
    const roleGate = afgoerSource.indexOf('rpc("has_role"');
    const serviceRole = afgoerSource.indexOf("SUPABASE_SERVICE_ROLE_KEY");
    expect(roleGate).toBeGreaterThan(-1);
    expect(serviceRole).toBeGreaterThan(-1);
    expect(roleGate, "advisor-gaten skal stå FØR service-role-konstruktionen").toBeLessThan(serviceRole);
    expect(afgoerSource).toContain("Forbidden — advisor role required");
  });

  it("skrivningen udføres FØR rækken afgøres, og afgørelsen har optimistisk lås", () => {
    const skrivning = Math.min(
      ...["skrivUgensFokus(", "skrivSessionPrep("].map((m) => afgoerSource.indexOf(m)).filter((i) => i > -1),
    );
    const patch = afgoerSource.indexOf("afgoerelsesPatch(");
    expect(skrivning, "delt skrivevej mangler").toBeGreaterThan(-1);
    expect(patch).toBeGreaterThan(-1);
    expect(skrivning, "skriv FØRST, afgør BAGEFTER — fejlet skrivning skal efterlade 'proposed'").toBeLessThan(patch);
    expect(afgoerSource).toContain('.eq("status", "proposed")');
  });

  it("decided_by kan ikke sættes fra request-body", () => {
    expect(afgoerSource).not.toContain("body.decided_by");
    expect(afgoerSource).not.toContain("decided_by:");
    // Patchen bygges af motoren med callerId:
    expect(afgoerSource).toContain("afgoerelsesPatch(");
    expect(afgoerSource).toContain("callerId");
  });

  it("skrivevejene er DELT — run-company-agent bruger samme modul, ingen kopier", () => {
    expect(rcaSource).toContain('from "../_shared/agentSkriveveje.ts"');
    expect(afgoerSource).toContain('from "../_shared/agentSkriveveje.ts"');
    // Den gamle inline-implementering må ikke genopstå i executeTool:
    expect(rcaSource).not.toContain('.from("weekly_focus")');
    expect(rcaSource).not.toContain('context_type: "session_prep"');
  });
});
