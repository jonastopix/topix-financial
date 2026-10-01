// Kildeværn for trofæerne (1/10-2026, docs/boardroom-score.md «Trofæer»).
//   1. Motoren læser intet, der kan give fordel til størrelse (Jonas 1/10).
//   2. Fladerne nævner ikke point, præmie eller «månedens» (bygges ikke nu).
//   3. Medlemmets hentning henter KUN egne data: hver tabel filtreres på
//      virksomhedens id, egne brugere eller trådene for vores egne svar.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");

describe("trofæernes kildeværn", () => {
  it("1. motoren nævner ikke omsætning, beløb eller ansatte", () => {
    const motor = laes("src/lib/gamification/trofaeer.ts");
    // Filhovedet forklarer reglen i ord; værnet dømmer koden (kommentarer fjernet).
    const kode = motor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(kode).not.toMatch(/revenue|omsaetning|omsætning|oere|øre|beloeb|beløb|ansatte|employees|budget_amount|metrics\[/i);
  });

  it("2. fladerne nævner ikke point, præmie eller «månedens»", () => {
    for (const sti of [
      "src/components/hjemmebane/boardroom/TrofaeKort.tsx",
      "src/components/hjemmebane/engagement/EngagementView.tsx",
      "src/lib/gamification/trofaeer.ts",
    ]) {
      expect(laes(sti), sti).not.toMatch(/\bpoint\b|præmie|praemie|månedens|maanedens/i);
    }
  });

  it("3. medlemmets hentning henter kun egne data", () => {
    const kilde = laes("src/hooks/trofaeer.ts");
    const start = kilde.indexOf("export async function hentMedlemmetsTrofaeGrundlag");
    const slut = kilde.indexOf("export function useMedlemmetsTrofaeer");
    expect(start).toBeGreaterThan(-1);
    const krop = kilde.slice(start, slut);
    const kald = [...krop.matchAll(/\.from\("([a-z_]+)"\)([^;]*?)(?=supabase\.from|\),\n|;|$)/g)];
    expect(kald.length).toBeGreaterThanOrEqual(6);
    for (const [, tabel, rest] of kald) {
      const filtreret = /\.eq\("company_id", companyId\)|\.in\("forfatter_id", egne\)/.test(rest);
      expect(filtreret, `${tabel} uden filter på egne data`).toBe(true);
    }
    // Ingen batch-hentning (alle virksomheder) i medlemmets vej.
    expect(krop).not.toMatch(/hentAlleSider|hentEngagement/);
    // Tråd-opslaget for svarene går kun på trådene for vores egne svar, og vælger kun forfatteren.
    const traad = kilde.slice(kilde.indexOf("async function traadForfattere"), start);
    expect(traad).toMatch(/\.select\("id, forfatter_id"\)\.in\("id", traadIds/);
  });

  it("4. kortet siger, at trofæer ikke er scoren", () => {
    const motor = laes("src/lib/gamification/trofaeer.ts");
    expect(motor).toMatch(/TROFAE_FORKLARING =\s*\n?\s*"Milepæle, du har nået\. Din Boardroom Score ovenfor er dit helbredstal lige nu\."/);
    expect(laes("src/components/hjemmebane/boardroom/TrofaeKort.tsx")).toMatch(/\{TROFAE_FORKLARING\}/);
  });
});
