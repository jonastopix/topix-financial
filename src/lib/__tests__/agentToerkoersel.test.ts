import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SKRIVE_TOOLS,
  toerResultat,
  ikkeGodkendbareSkriveTools,
  blokeredeVaerktoejer,
  annonceredeVaerktoejer,
  toerPromptTillaeg,
} from "../../../supabase/functions/_shared/agentToerkoersel.ts";
import { UNDERSTOETTEDE_SKRIVEVEJE } from "../../../supabase/functions/_shared/forslagEngine.ts";

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

describe("run-company-agent — trigger- og default-værn (beslutning 2026-08-25)", () => {
  it("hver trigger i KNOWN_TRIGGERS har en post i POOL_BLOCKLIST", () => {
    // Recon 2026-08-25 fandt hullet: onboarding manglede en post og fik
    // dermed FULD tool-pool inkl. write_chat_message. En trigger uden
    // erklæret blocklist er en manglende beslutning, ikke en tilladelse.
    const ktBlok = rcaSource.match(/const KNOWN_TRIGGERS = \[([\s\S]*?)\]/);
    expect(ktBlok, "KNOWN_TRIGGERS-arrayet ikke fundet — regex-forudsætningen holder ikke").toBeTruthy();
    const triggers = [...ktBlok![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    // 13/9: weekly_cron udgik af KNOWN_TRIGGERS sammen med run-weekly-agent
    // (kørte aldrig) — sentinellen er fem triggere, ikke en forglemmelse.
    expect(triggers.length).toBeGreaterThanOrEqual(5);

    const pbBlok = rcaSource.match(/const POOL_BLOCKLIST[\s\S]*?\{([\s\S]*?)\};/);
    expect(pbBlok, "POOL_BLOCKLIST-objektet ikke fundet — regex-forudsætningen holder ikke").toBeTruthy();
    const blocklistKeys = [...pbBlok![1].matchAll(/^\s*([a-z_]+):\s*\[/gm)].map((m) => m[1]);
    for (const trigger of triggers) {
      expect(blocklistKeys, `trigger '${trigger}' mangler en post i POOL_BLOCKLIST`).toContain(trigger);
    }
  });

  it("tør er default: kun body.dry_run === false giver en live-kørsel", () => {
    // Live skal være et ord nogen har skrevet, aldrig noget nogen glemte.
    expect(rcaSource).toContain("const dryRun = body.dry_run !== false");
    expect(rcaSource).not.toContain("body.dry_run === true");
  });
});

// Værnet for beslutningen 30/9-2026 (docs/agent-forslag-design.md §9):
// en tør-kørsel må KUN foreslå det, en rådgiver kan godkende. Målt i prod:
// 6 af 6 opgaveforslag fra tør-kørsler kunne aldrig godkendes. Listen over
// det godkendbare står ÉT sted — forslagEngine.UNDERSTOETTEDE_SKRIVEVEJE.
describe("tør-kørslen annoncerer kun godkendbare skrivetools (30/9)", () => {
  const triggers = (() => {
    const blok = rcaSource.match(/const KNOWN_TRIGGERS = \[([\s\S]*?)\]/)!;
    return [...blok[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  })();
  const poolBlok = rcaSource.match(/const POOL_BLOCKLIST[\s\S]*?\{([\s\S]*?)\};/)![1];
  const blocklistFor = (trigger: string): string[] => {
    const linje = poolBlok.match(new RegExp(`^\\s*${trigger}:\\s*\\[([^\\]]*)\\]`, "m"));
    expect(linje, `POOL_BLOCKLIST-posten for '${trigger}' kan ikke læses`).toBeTruthy();
    return [...linje![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  };

  it("de ikke-godkendbare er præcis SKRIVE_TOOLS minus motorens liste", () => {
    const forventet = [...SKRIVE_TOOLS].filter((t) => !UNDERSTOETTEDE_SKRIVEVEJE.has(t)).sort();
    expect(ikkeGodkendbareSkriveTools()).toEqual(forventet);
    expect(ikkeGodkendbareSkriveTools()).toContain("write_company_action");
  });

  for (const trigger of ["onboarding", "company_review", "report_committed", "anomaly_detected", "pulse_submitted"]) {
    it(`${trigger}, tørt: hvert annonceret skrivetool kan godkendes`, () => {
      expect(triggers).toContain(trigger);
      const annoncerede = annonceredeVaerktoejer(declaredTools, blokeredeVaerktoejer(blocklistFor(trigger), true));
      const skriv = annoncerede.filter((n) => SKRIVE_TOOLS.has(n));
      for (const t of skriv) {
        expect(UNDERSTOETTEDE_SKRIVEVEJE.has(t), `'${t}' annonceres i tør-tilstand, men kan ikke godkendes`).toBe(true);
      }
      expect(annoncerede).not.toContain("write_company_action");
      // Læseværktøjerne og finish er urørte.
      expect(annoncerede).toContain("get_company_facts");
      expect(annoncerede).toContain("finish");
    });
  }

  it("alle triggere, tørt: kun update_weekly_focus kan foreslås i dag", () => {
    for (const trigger of triggers) {
      const skriv = annonceredeVaerktoejer(declaredTools, blokeredeVaerktoejer(blocklistFor(trigger), true))
        .filter((n) => SKRIVE_TOOLS.has(n));
      expect(skriv, trigger).toEqual(["update_weekly_focus"]);
    }
  });

  it("live er uændret: blokeringen er KUN triggerens egen post", () => {
    for (const trigger of triggers) {
      expect(blokeredeVaerktoejer(blocklistFor(trigger), false)).toEqual([...blocklistFor(trigger)].sort());
    }
    // report_committed og anomaly_detected kan stadig oprette skridt live.
    const live = annonceredeVaerktoejer(declaredTools, blokeredeVaerktoejer(blocklistFor("report_committed"), false));
    expect(live).toContain("write_company_action");
  });

  it("run-company-agent bruger den fælles blokering til BÅDE annoncering og afvisning", () => {
    expect(rcaSource).toContain("blokeredeVaerktoejer(POOL_BLOCKLIST[trigger] ?? [], dryRun)");
    expect(rcaSource).toContain("annonceredeVaerktoejer(tools.map((t) => t.function.name), blocked)");
    expect(rcaSource).toContain("tools: activeTools");
    expect(rcaSource).toContain("if (blocked.includes(toolName))");
    // Blokeringen står FØR opsnapningen: et ikke-godkendbart kald bliver
    // aldrig en agent_proposals-række.
    expect(rcaSource.indexOf("if (blocked.includes(toolName))")).toBeLessThan(
      rcaSource.indexOf("dryRun && SKRIVE_TOOLS.has(toolName)"),
    );
    // Ingen lokal kopi af den gamle filtrering.
    expect(rcaSource).not.toMatch(/const blocked = POOL_BLOCKLIST\[trigger\] \?\? \[\];/);
  });

  it("beviset: svaret bærer annoncerede_vaerktoejer i alle fire svar", () => {
    expect(rcaSource.match(/annoncerede_vaerktoejer: annoncerede/g)?.length).toBe(4);
  });

  it("tør-prompten: tillægget læses kun i tør-tilstand, og onboarding beder ikke om en opgave", () => {
    expect(rcaSource).toContain("${dryRun ? `\\n\\n${toerPromptTillaeg(annoncerede)}` : \"\"}");
    const onboarding = rcaSource.match(/trigger === "onboarding"\n\s*\? `([^`]*)`/);
    expect(onboarding, "onboarding-prompten ikke fundet").toBeTruthy();
    expect(onboarding![1]).not.toMatch(/handlingsopgave|write_company_action/);
    expect(onboarding![1]).toContain("weekly focus");
    const tillaeg = toerPromptTillaeg(["get_company_facts", "update_weekly_focus", "finish"]);
    expect(tillaeg).toContain("update_weekly_focus");
    expect(tillaeg).toContain("write_company_action");
  });
});
