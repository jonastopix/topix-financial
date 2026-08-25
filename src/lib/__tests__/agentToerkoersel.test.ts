import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SKRIVE_TOOLS,
  toerResultat,
} from "../../../supabase/functions/_shared/agentToerkoersel.ts";

// Driftværn for tør-kørslens snit (docs/agent-forslag-design.md §4.1).
// Invariansen: HVERT tool i run-company-agents pool er enten et
// get_*-læsetool, 'finish' eller medlem af SKRIVE_TOOLS. Tilføjes et nyt
// skrivetool uden at sættet følger med, siver det UDENOM tør-kørslen og
// skriver til medlemmet — det er præcis fejlen denne test skal fange.
// Kilde-læsning frem for import: index.ts kan ikke importeres i Vitest
// (Deno.serve + esm.sh-imports), samme begrundelse som at snittet bor i
// _shared/agentToerkoersel.ts (opgaveUdloeb-mønstret). Stien er
// cwd-relativ — vitest kører fra repo-roden (import.meta.url er ikke en
// file-URL under jsdom).

const rcaPath = resolve(process.cwd(), "supabase/functions/run-company-agent/index.ts");
const rcaSource = readFileSync(rcaPath, "utf8");

/** Tool-navnene som de er annonceret i tools-arrayet: `name: "..."`.
    Mønstret findes kun dér — executeTool bruger case-strenge, og
    SYSTEM_PROMPT indeholder ingen `name:`-nøgler. */
const declaredTools = [...rcaSource.matchAll(/name:\s*"([a-z_]+)"/g)].map((m) => m[1]);

describe("agentToerkoersel — tør-kørslens snit", () => {
  it("finder tool-poolen i run-company-agent (regex-forudsætningen holder)", () => {
    expect(declaredTools.length).toBeGreaterThanOrEqual(10);
    expect(declaredTools).toContain("get_company_facts");
    expect(declaredTools).toContain("finish");
  });

  it("hvert tool i poolen er læsetool (get_*), finish eller SKRIVE_TOOL", () => {
    const udenfor = declaredTools.filter(
      (name) => !name.startsWith("get_") && name !== "finish" && !SKRIVE_TOOLS.has(name),
    );
    // Fejler denne, er et nyt tool tilføjet uden stilling til tør-kørslen:
    // et skrivetool SKAL i SKRIVE_TOOLS, et læsetool SKAL hedde get_*.
    expect(udenfor).toEqual([]);
  });

  it("hvert SKRIVE_TOOL findes i poolen (intet forældet medlem i sættet)", () => {
    const declared = new Set(declaredTools);
    for (const tool of SKRIVE_TOOLS) {
      expect(declared, `'${tool}' er i SKRIVE_TOOLS men ikke i tool-poolen`).toContain(tool);
    }
  });

  it("interceptions-snittet findes i dispatchen", () => {
    expect(rcaSource).toContain("SKRIVE_TOOLS.has(toolName)");
    expect(rcaSource).toContain("toerResultat(toolName)");
  });

  it("toerResultat lader modellen fortsætte: ok-form uden fejl- og blocked-markører", () => {
    for (const tool of SKRIVE_TOOLS) {
      const resultat = toerResultat(tool);
      expect(resultat.ok).toBe(true);
      expect(resultat.dry_run).toBe(true);
      // {error} får modellen til at prøve igen; {blocked} får den til at
      // vælge et andet tool — begge former er forbudt i stubben.
      expect(resultat).not.toHaveProperty("error");
      expect(resultat).not.toHaveProperty("blocked");
      expect(resultat.note).toContain(tool);
    }
  });
});
