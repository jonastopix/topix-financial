import { describe, expect, it } from "vitest";
import { beregnUdloeb, type OpgaveSourceType } from "../opgaveEngine";
import {
  beregnUdloeb as beregnUdloebDeno,
  UDLOEBSDAGE,
  UDLOEB_FALLBACK_DAGE,
} from "../../../supabase/functions/_shared/opgaveUdloeb.ts";

// Paritetsværn — Deno-kopien i supabase/functions/_shared/opgaveUdloeb.ts
// skal give identisk udløb som motoren (src/lib/opgaveEngine.ts, B10) for
// alle kilder. Fejler denne blok, er de to filer drevet fra hinanden og
// skal re-synkroniseres. Samme mønster som membershipTier.test.ts:113-131.
describe("beregnUdloeb — paritet mellem src/lib og supabase/functions/_shared", () => {
  const ALLE_KILDER: OpgaveSourceType[] = [
    "ai_weekly",
    "milestone",
    "handout",
    "manual",
    "agent",
    "advisor",
    "reflection",
  ];

  // Midt på året, årsskifte og hen over dansk sommertids-ophør
  // (2026-10-25) — setDate-aritmetikken skal give samme kalenderdag
  // begge steder, også når døgnet er 25 timer.
  const TIDSPUNKTER = [
    new Date("2026-08-24T06:00:00Z"),
    new Date("2026-12-28T23:30:00Z"),
    new Date("2026-10-20T12:00:00Z"),
  ];

  for (const kilde of ALLE_KILDER) {
    for (const nu of TIDSPUNKTER) {
      it(`paritet: ${kilde} fra ${nu.toISOString()}`, () => {
        const motor = beregnUdloeb(kilde, nu);
        const deno = beregnUdloebDeno(kilde, nu);
        expect(deno.toISOString()).toBe(motor.toISOString());
      });
    }
  }

  it("B10-tabellen i Deno-kopien matcher designet: advisor 30, reflection 21, ai_weekly/agent 14", () => {
    expect(UDLOEBSDAGE).toEqual({ advisor: 30, reflection: 21, ai_weekly: 14, agent: 14 });
    expect(UDLOEB_FALLBACK_DAGE).toBe(14);
  });
});
