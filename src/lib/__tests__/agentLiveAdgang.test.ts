import { describe, expect, it } from "vitest";
import { MEDLEM_LIVE_TRIGGERE, maaKoereLive } from "../../../supabase/functions/_shared/agentLiveAdgang.ts";

// Fund 9 (30/9-2026): et medlem må ikke starte en live agentkørsel uden for
// sin egen rapport-commit.
const ALLE = ["report_committed", "anomaly_detected", "pulse_submitted", "onboarding", "company_review"];

describe("maaKoereLive", () => {
  it("tørkørsel må alle", () => {
    for (const trigger of ALLE) {
      expect(maaKoereLive({ dryRun: true, isServiceRole: false, isAdvisor: false, trigger })).toBe(true);
    }
  });

  it("service role og rådgiver må live for alle triggere", () => {
    for (const trigger of ALLE) {
      expect(maaKoereLive({ dryRun: false, isServiceRole: true, isAdvisor: false, trigger })).toBe(true);
      expect(maaKoereLive({ dryRun: false, isServiceRole: false, isAdvisor: true, trigger })).toBe(true);
    }
  });

  it("medlem live: kun de to triggere, medlemmets rapport-commit starter", () => {
    expect(MEDLEM_LIVE_TRIGGERE).toEqual(["report_committed", "anomaly_detected"]);
    const medlem = (trigger: unknown) => maaKoereLive({ dryRun: false, isServiceRole: false, isAdvisor: false, trigger });
    expect(medlem("report_committed")).toBe(true);
    expect(medlem("anomaly_detected")).toBe(true);
    expect(medlem("company_review")).toBe(false);
    expect(medlem("onboarding")).toBe(false);
    expect(medlem("pulse_submitted")).toBe(false);
    expect(medlem("ukendt_trigger")).toBe(false);
    expect(medlem(undefined)).toBe(false);
  });

  it("de live-kald, medlemsfladen faktisk laver, er på listen (målt i src/)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    for (const fil of ["src/lib/reportCommit.ts", "src/components/ReportReviewDialog.tsx"]) {
      const k = readFileSync(resolve(process.cwd(), fil), "utf8");
      const kald = [...k.matchAll(/invoke\("run-company-agent",\s*\{\s*body:\s*\{([\s\S]*?)\}\s*,?\s*\}\)/g)].map((m) => m[1]);
      expect(kald.length, fil).toBeGreaterThan(0);
      for (const b of kald) {
        if (!/dry_run:\s*false/.test(b)) continue;
        const trigger = /trigger:\s*"([a-z_]+)"/.exec(b)?.[1];
        expect(MEDLEM_LIVE_TRIGGERE, `${fil}: ${trigger}`).toContain(trigger);
      }
    }
  });
});
