import { describe, it, expect, vi } from "vitest";

// Payload-opsamlende Supabase-stub (udvidelse af retDataRoundTrip-mønstret):
// vi tester den FAKTISKE saveManualOverride-sti og asserterer på det payload
// der ville ramme financial_reports.manual_normalized_data.
type CapturedUpdate = {
  manual_normalized_data: { metrics: Record<string, number | null> };
};
const captured = vi.hoisted(() => [] as CapturedUpdate[]);
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (payload: CapturedUpdate) => {
        captured.push(payload);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  },
}));

import {
  ALL_FIELDS,
  canonicalPreviewToDanishInputs,
  saveManualOverride,
} from "../reportOverrideHelpers";

/**
 * REGRESSION for EBITDA/EBIT-tab i "Ret data"-flowet (Mulighed A: beregnede
 * størrelser — punkt 2-beslutning 2026-07-22).
 *
 * Prod-evidens (21-22/7, Topix juni-saldobalance):
 *   (a) Frisk parse har ebitda 5609.85 og ebit -634.12 i metrics (afledt i
 *       canonicalEngine.ts:468-480 med JS-float-artefakt: 5609.849999999991).
 *   (c) Efter "gem rettelser" UDEN ændringer er begge nøgler væk fra Godkend
 *       data-oversigten.
 *   (d) Manuelt committede facts mangler ebit/ebitda-nøglerne.
 *
 * Tabskæden: EBIT har intet formularfelt og kasseres ved form-init
 * (CANONICAL_TO_DANISH/ALL_FIELDS); saveManualOverride gemmer kun ALL_FIELDS;
 * SQL-CASEn i resolve_report_commit_candidate (20260420190823.sql:69-89) mangler
 * WHEN 'ebitda' og dropper formularens nøgle → facts mangler begge.
 *
 * A-SEMANTIK der håndhæves her (JS-benet af kontrakten):
 *   - EBITDA er IKKE længere et inputfelt (afledte tal round-trippes ikke).
 *   - Ved gem BEREGNES ebitda = daekningsbidrag − (løn+salg+lokale+admin) og
 *     ebit = ebitda − afskrivninger — samme formler som canonicalEngine.ts:468-480
 *     — afrundet til 2 decimaler, og skrives i manual_normalized_data.metrics
 *     under nøglerne "ebitda"/"ebit".
 *   - Null-fallback: mangler komponenterne, udelades nøglerne ærligt (ingen gæt).
 * SQL-benet (nye WHEN-grene i resolver-CASEn) dækkes af migrationen og
 * verificeres manuelt i Lovable efter kørsel (pg_get_functiondef) — det kan
 * vitest ikke nå.
 *
 * Fixture: komponentværdier er syntetiske, men valgt så de beregner præcis
 * prod-parsens ebitda/ebit (5609.85 / -634.12) inkl. float-artefakt undervejs.
 */

const NOOP_SAVE_BASE = {
  reportId: "test-report",
  userId: "test-user",
  month: 6,
  year: 2026,
  reportType: "saldobalance",
  note: "",
  overrideSource: "member",
  status: "applied" as const,
};

// Grundfelter: gp − (30000.1 + 2000.5 + 3000.5 + 4390.02 = 39391.12) → ebitda,
// ebitda − 6243.97 → ebit. Målværdier = prod-parsens 5609.85 / -634.12.
const previewMetrics = {
  gross_profit: 45000.97,
  payroll: 30000.1,
  sales_costs: 2000.5,
  facility_costs: 3000.5,
  admin_costs: 4390.02,
  depreciation: 6243.97,
  // Parse-sidens afledte værdier med float-artefakt, som preview'et viser i dag:
  ebitda: 5609.849999999991,
  ebit: -634.1200000000008,
};

async function noopSave(metrics: Record<string, number>) {
  const inputs = canonicalPreviewToDanishInputs(metrics); // no-op: intet redigeres
  await saveManualOverride({ ...NOOP_SAVE_BASE, metricInputs: inputs });
  return captured.at(-1)!.manual_normalized_data.metrics;
}

describe("Ret data — Mulighed A: ebitda/ebit beregnes ved gem (tabes i dag)", () => {
  it("EBITDA er ikke længere et inputfelt (afledte tal round-trippes ikke)", () => {
    expect(ALL_FIELDS).not.toContain("ebitda");
    expect(ALL_FIELDS).not.toContain("ebit");
  });

  it("no-op-gem beregner ebitda fra grundfelterne, afrundet til 2 decimaler", async () => {
    const saved = await noopSave(previewMetrics);
    // I dag: 5609.849999999991 (round-trip af parse-artefakten via inputfeltet).
    // A-semantik: re-beregnet 45000.97 − 39391.12, afrundet → 5609.85.
    expect(saved.ebitda).toBe(5609.85);
  });

  it("no-op-gem beregner ebit (i dag tabes nøglen — intet felt, ikke i ALL_FIELDS)", async () => {
    const saved = await noopSave(previewMetrics);
    // I dag: undefined (nøglen findes slet ikke i gem-payloadet).
    // A-semantik: ebitda − afskrivninger = 5609.85 − 6243.97, afrundet → -634.12.
    expect(saved.ebit).toBe(-634.12);
  });

  it("null-fallback: mangler komponenterne, udelades begge nøgler ærligt", async () => {
    // needs_manual_entry-lignende gem: kun omsætning og bank tastet.
    const saved = await noopSave({ revenue: 100000, cash: 50000 });
    // I dag: "ebitda" findes som null-nøgle (ALL_FIELDS-loopet). A-semantik:
    // ingen komponenter → ingen beregning → nøglerne er HELT fraværende.
    expect("ebitda" in saved).toBe(false);
    expect("ebit" in saved).toBe(false);
  });

  it("regressionsværn: grundfelterne round-tripper uændret gennem no-op-gem", async () => {
    const saved = await noopSave(previewMetrics);
    expect(saved.daekningsbidrag).toBe(45000.97);
    expect(saved.loenninger).toBe(30000.1);
    expect(saved.salgsomkostninger).toBe(2000.5);
    expect(saved.lokaleomkostninger).toBe(3000.5);
    expect(saved.administrationsomkostninger).toBe(4390.02);
    expect(saved.afskrivninger).toBe(6243.97);
  });
});
