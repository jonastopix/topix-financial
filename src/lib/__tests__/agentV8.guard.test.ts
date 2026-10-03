import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * agentV8.guard — run-company-agent v8 (3/10-2026; mangellisten
 * a01-agent-bevis, a02-akademi-f0, g03-agent-milesten-ord).
 *
 * Dom 1 — ORDET: agentens tekster til medlemmer (prompt, værktøjsbeskrivelser,
 *   faste strenge) siger «mål», aldrig «milestone»/«milepæl»/«milesten».
 *   Kodeidentifikatorer og databaseværdier (get_milestones, milestone_id,
 *   milestone_progress, tabellen "milestones") røres ikke og fraregnes.
 * Dom 2 — prompten forbyder ordet over for founder (modellen skrev selv
 *   «milesten», livetjek 3/10 på Floren Engros).
 * Dom 3 — F0: get_member_content_progress henter markeret_at og dømmer gennem
 *   agentProgressRaekke (husets itemProgressState); intet rå
 *   `r.acknowledged_at ?` som tilstand.
 * Dom 4 — BEVISET: DEPLOY_STAMP er v8, og hvert svar bærer f0-markøren.
 */

const STI = "supabase/functions/run-company-agent/index.ts";
const kilde = () => readFileSync(resolve(process.cwd(), STI), "utf8");
/** Promptens regel nævner ordene for at forbyde dem — den ene sætning fraregnes (dom 2 kræver den). */
const ORD_REGEL = "Til founder hedder det altid «mål» — aldrig «milestone», «milepæl» eller «milesten».";

/** Fjerner kommentarer og de tekniske navne; det, der står tilbage, er tekst. */
export function forbudteOrd(tekst: string): string[] {
  const udenKommentarer = tekst
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .map((l) => l.replace(/\s\/\/\s.*$/, ""))
    .join("\n");
  const udenIdentifikatorer = udenKommentarer
    .replace(/\b[A-Za-z0-9]*_[A-Za-z0-9_]*\b/g, " ") // snake_case: get_milestones, milestone_id, milestone_progress …
    .replace(/\.from\("milestones"\)/g, " ") // tabellen
    .split(ORD_REGEL).join(" ");
  return udenIdentifikatorer.match(/milest\w*|milepæl\w*|milepael\w*/gi) ?? [];
}

describe("agentV8.guard", () => {
  it("dom 1: ingen «milestone/milepæl/milesten» i agentens tekst", () => {
    expect(forbudteOrd(kilde())).toEqual([]);
  });

  it("dom 1, SELVBEVIS: værnet fælder ordet i en prompt og lader identifikatorerne stå", () => {
    expect(forbudteOrd('const P = `Foreslå aldrig mål (milestones)`;')).toEqual(["milestones"]);
    expect(forbudteOrd('description: "Henter aktive milestones"')).toEqual(["milestones"]);
    expect(forbudteOrd('title: "Byg en likviditetsreserve-milesten"')).toEqual(["milesten"]);
    expect(forbudteOrd('const t = "næste milepæl";')).toEqual(["milepæl"]);
    expect(forbudteOrd('name: "get_milestones", milestone_id: x, .from("milestones")')).toEqual([]);
    expect(forbudteOrd("// create_milestone er ude — milestones i en kommentar")).toEqual([]);
    // Identifikatorerne står stadig i functionen (dommen fraregner dem, den fjerner dem ikke).
    expect(kilde()).toContain('name: "get_milestones"');
    expect(kilde()).toContain("milestone_id:");
  });

  it("dom 2: prompten forbyder ordet over for founder", () => {
    expect(kilde()).toContain(ORD_REGEL);
    expect(kilde().split(ORD_REGEL).length).toBe(2); // præcis én gang — fritagelsen dækker ikke mere
  });

  it("dom 3: F0 — markeret_at hentes, og tilstanden dømmes af agentProgressRaekke", () => {
    const k = kilde();
    const blok = k.slice(k.indexOf('case "get_member_content_progress"'), k.indexOf('case "get_kpi_targets"'));
    expect(blok).toContain("markeret_at");
    expect(blok).toContain(".map(agentProgressRaekke)");
    expect(blok).not.toMatch(/state:\s*r\.acknowledged_at/);
    expect(k).toContain('from "../_shared/agentIndholdsFremdrift.ts"');
    const modul = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/agentIndholdsFremdrift.ts"), "utf8");
    expect(modul).toContain('from "./progressState.ts"');
    expect(modul).toContain("itemProgressState(r)");
  });

  it("dom 4: DEPLOY_STAMP er v8, og hvert svar bærer f0-markøren", () => {
    const k = kilde();
    expect(k).toMatch(/const DEPLOY_STAMP = "run-company-agent v8 [^"]*\(2026-10-03\)";/);
    const svar = (k.match(/annoncerede_vaerktoejer: annoncerede,/g) ?? []).length;
    const markoerer = (k.match(/f0: F0_MARKOER/g) ?? []).length;
    expect(svar).toBe(4);
    expect(markoerer).toBe(svar + 1); // + ?meta=version
  });
});
