import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { getISOWeekKey } from "../../../supabase/functions/_shared/isoUge.ts";
import { getISOWeekKey as frontendISOWeekKey } from "../hjemmebane/week";

// Uge-nøgle-hændelsen 2026-08-25: agentens mandags-ankrede lokalformel
// skrev 42 weekly_focus-rækker én uge bagud over fire måneder. Denne fil
// er værnet mod gentagelse: (1) faste datoer med kendte ISO-facit,
// (2) paritet mod generate-weekly-focus' GAMLE lokale formel (flyttet
// ordret — adfærden skal være uændret) og mod frontendens week.ts,
// (3) kildeværn: ingen edge function må igen beregne en uge-nøgle inline.

/** generate-weekly-focus' gamle lokale formel (index.ts:12-19 før
    flytningen), gengivet ORDRET her som facit for adfærds-pariteten. */
function gammelLokalFormel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

describe("isoUge — kanonisk ISO-8601-uge-nøgle", () => {
  it("faste datoer med kendte facit", () => {
    // Mandag 24/8 2026 — dagen fra hændelsen. Mandags-formlen gav 2026-W34.
    expect(getISOWeekKey(new Date(Date.UTC(2026, 7, 24)))).toBe("2026-W35");
    // Torsdag 1/1 2026 — år hvor 1. januar er en torsdag. Mandags-formlen
    // gav 2025-W52: både år og nummer forkert.
    expect(getISOWeekKey(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-W01");
    // Søndag 3/1 2027 hører til det GAMLE års uge 53 (2026 er et 53-ugers år).
    expect(getISOWeekKey(new Date(Date.UTC(2027, 0, 3)))).toBe("2026-W53");
  });

  it("paritet med generate-weekly-focus' gamle lokale formel over et helt år", () => {
    // Dagligt fra før årsskiftet 2025/26 til efter årsskiftet 2026/27 —
    // dækker hele 2026 inkl. begge uge-1/uge-53-grænser.
    const start = Date.UTC(2025, 11, 20);
    const slut = Date.UTC(2027, 0, 10);
    for (let t = start; t <= slut; t += 86400000) {
      const dato = new Date(t);
      expect(getISOWeekKey(dato), `afvigelse for ${dato.toISOString().slice(0, 10)}`).toBe(
        gammelLokalFormel(dato),
      );
    }
  });

  it("paritet med frontendens week.ts (samme aritmetik, to runtimes)", () => {
    const start = Date.UTC(2025, 11, 20);
    const slut = Date.UTC(2027, 0, 10);
    for (let t = start; t <= slut; t += 86400000) {
      const dato = new Date(t);
      expect(getISOWeekKey(dato)).toBe(frontendISOWeekKey(dato));
    }
  });

  it("kildeværn: ingen edge function beregner en uge-nøgle inline", () => {
    // Fingeraftrykkene for en uge-beregning: getUTCDay-normaliseringen og
    // "-W${"-skabelonen. Begge må KUN findes i _shared/isoUge.ts —
    // dukker de op andetsteds under supabase/functions/, er en inline-kopi
    // genopstået (præcis fejlen der lå bag hændelsen 2026-08-25).
    const rod = resolve(process.cwd(), "supabase/functions");
    const syndere: string[] = [];
    const walk = (dir: string) => {
      for (const navn of readdirSync(dir)) {
        const sti = join(dir, navn);
        if (statSync(sti).isDirectory()) {
          walk(sti);
        } else if (sti.endsWith(".ts") && !sti.endsWith("_shared/isoUge.ts")) {
          const kilde = readFileSync(sti, "utf8");
          if (/getUTCDay\(\)/.test(kilde) || kilde.includes("-W${")) {
            syndere.push(sti.slice(rod.length + 1));
          }
        }
      }
    };
    walk(rod);
    expect(syndere, "uge-nøgle-beregning fundet udenfor _shared/isoUge.ts").toEqual([]);
  });
});
