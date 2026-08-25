import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Kaldestedsværn (beslutning 2026-08-25): tør er default i
// run-company-agent, og live kræver eksplicit dry_run: false. Dette værn
// gør UDELADELSE af flaget til en CI-fejl — et kaldested uden eksplicit
// dry_run er ikke en stille tør-kørsel, det er en manglende beslutning.
// Kilde-scan efter agentToerkoersel.test.ts-mønstret (CI har ingen DB, og
// edge-funktioner kan ikke importeres i Vitest).
//
// __tests__-mapper springes over: testfiler (denne inkl.) nævner
// kaldemønstrene i regex/streng-form uden at være kaldesteder.

const ROOTS = ["src", "supabase/functions"];

const KALD_MOENSTRE: RegExp[] = [
  // supabase.functions.invoke("run-company-agent", { body: {...} })
  /invoke\(\s*["']run-company-agent["']/g,
  // rå fetch mod funktions-URL'en (run-weekly-agent)
  /\/functions\/v1\/run-company-agent/g,
];

function tsFiler(dir: string): string[] {
  const resultat: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const sti = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      resultat.push(...tsFiler(sti));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      resultat.push(sti);
    }
  }
  return resultat;
}

interface Kaldested {
  fil: string;
  linje: number;
  vindue: string;
}

function findKaldesteder(): Kaldested[] {
  const fundne: Kaldested[] = [];
  for (const rod of ROOTS) {
    for (const fil of tsFiler(resolve(process.cwd(), rod))) {
      const source = readFileSync(fil, "utf8");
      // run-company-agent's egen fil er ikke et kaldested.
      if (fil.endsWith(join("run-company-agent", "index.ts"))) continue;
      for (const moenster of KALD_MOENSTRE) {
        for (const match of source.matchAll(moenster)) {
          const linje = source.slice(0, match.index).split("\n").length;
          // Vinduet dækker kaldets body — dry_run skal stå dér.
          const vindue = source.slice(match.index, (match.index ?? 0) + 800);
          fundne.push({ fil: fil.replace(process.cwd() + "/", ""), linje, vindue });
        }
      }
    }
  }
  return fundne;
}

describe("run-company-agent-kaldesteder — dry_run skal være eksplicit", () => {
  const kaldesteder = findKaldesteder();

  it("scanningen finder de kendte kaldesteder (regex-forudsætningen holder)", () => {
    // 2026-08-25: 11 kaldesteder (AgentForslagPanel, ReportDebug,
    // ReportReviewDialog x4, reportCommit x2, useAuth, Onboarding,
    // run-weekly-agent). Falder tallet til nul-nære værdier, er
    // mønstrene drevet fra koden — ikke koden fra kaldene.
    expect(kaldesteder.length).toBeGreaterThanOrEqual(11);
  });

  it("hvert kaldested sætter dry_run eksplicit til true eller false", () => {
    for (const k of kaldesteder) {
      expect(
        /dry_run\s*:\s*(true|false)/.test(k.vindue),
        `${k.fil}:${k.linje} kalder run-company-agent uden eksplicit dry_run — ` +
          `udeladelse er en manglende beslutning, ikke en stille tør-kørsel`,
      ).toBe(true);
    }
  });
});
