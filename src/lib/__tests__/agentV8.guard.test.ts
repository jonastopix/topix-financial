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
 * Dom 4 — BEVISET: DEPLOY_STAMP er v8, og hvert svar bærer f0-markøren —
 *   STEDBUNDET (CTO 3/10): `new Response(` står KUN i hjælperen svarJson, som
 *   lægger markøren i kroppen; authenticateUser's afvisning går gennem
 *   svarFraAuth. Et nyt svar uden om hjælperen fælder værnet, uanset hvor
 *   mange markører der står andre steder.
 * Dom 5 — KROPPEN (CTO runde 2, 3/10): `await req.json()` står aldrig uden for
 *   en try-blok — en krop, der ikke er JSON, er 400 «ugyldig_krop» gennem
 *   svarJson, ikke en 500 uden markør, CORS og JSON.
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

/** Linjenumre med `new Response(` uden for svarJson-hjælperen (dom 4). */
export function responsUdenomHjaelperen(tekst: string): number[] {
  const fra = tekst.indexOf("function svarJson(");
  const til = tekst.indexOf("async function svarFraAuth(");
  const ud: number[] = [];
  const re = /new Response\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tekst))) {
    if (fra >= 0 && til > fra && m.index > fra && m.index < til) continue;
    ud.push(tekst.slice(0, m.index).split("\n").length);
  }
  return ud;
}

/** Linjenumre med `await req.json()` uden for en try-blok (dom 5). En forekomst
    er inde i en try, når den nærmeste foregående ikke-tomme linje (efter
    kommentarer) slutter med `try {`, og der ikke står andet på dens egen linje
    end tildelingen. Stedbundet og bevidst snæver: én tildeling pr. try. */
export function reqJsonUdenTry(tekst: string): number[] {
  const linjer = tekst.split("\n");
  const ud: number[] = [];
  linjer.forEach((l, i) => {
    if (!l.includes("await req.json()") || /^\s*\/\//.test(l)) return;
    let j = i - 1;
    while (j >= 0 && (linjer[j].trim() === "" || /^\s*\/\//.test(linjer[j]))) j--;
    const forrige = j >= 0 ? linjer[j].trim() : "";
    const egenLinjeRen = /^\s*[A-Za-z_$][\w$]*\s*=\s*await req\.json\(\);\s*$/.test(l);
    if (!(forrige.endsWith("try {") && egenLinjeRen)) ud.push(i + 1);
  });
  return ud;
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

  it("dom 4: DEPLOY_STAMP er v8", () => {
    expect(kilde()).toMatch(/const DEPLOY_STAMP = "run-company-agent v8 [^"]*\(2026-10-03\)";/);
  });

  it("dom 4: hvert `new Response(` står i svarJson, og svarJson lægger markøren", () => {
    const k = kilde();
    expect(responsUdenomHjaelperen(k)).toEqual([]);
    const hjaelper = k.slice(k.indexOf("function svarJson("), k.indexOf("async function svarFraAuth("));
    expect(hjaelper).toContain("JSON.stringify({ ...body, f0: F0_MARKOER })");
    expect((hjaelper.match(/new Response\(/g) ?? []).length).toBe(2); // krop + preflight (null)
    // Markøren sættes ét sted — ingen håndskrevne f0-felter at glemme.
    expect((k.match(/F0_MARKOER/g) ?? []).length).toBe(2); // import + svarJson
    // Afvisningen fra authenticateUser sendes ikke rå videre.
    expect(k).toContain("if (auth instanceof Response) return await svarFraAuth(auth);");
    expect(k).not.toMatch(/return auth;/);
    // Svarene, CTO'en nævnte, går gennem hjælperen.
    expect(k).toContain('return svarJson({ ok: false, error: "company_not_found" }, 200);');
    expect(k).toContain('return svarJson({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }, 200);');
    expect(k).toContain('return svarJson({ stamp: DEPLOY_STAMP, now: new Date().toISOString() }, 200);');
    expect((k.match(/return (await )?svar(Json|FraAuth)\(/g) ?? []).length).toBeGreaterThanOrEqual(15);
  });

  it("dom 4, SELVBEVIS: et svar uden om hjælperen fælder", () => {
    const k = kilde();
    const snydt = k.replace(
      'return svarJson({ ok: false, error: "company_not_found" }, 200);',
      'return new Response(JSON.stringify({ ok: false, error: "company_not_found" }), { status: 200 });',
    );
    expect(snydt).not.toBe(k);
    expect(responsUdenomHjaelperen(snydt)).toHaveLength(1);
  });

  it("dom 5: await req.json() står kun i en try, og parsefejlen er 400 «ugyldig_krop»", () => {
    const k = kilde();
    expect(reqJsonUdenTry(k)).toEqual([]);
    expect((k.match(/await req\.json\(\)/g) ?? []).length).toBe(1);
    expect(k).toContain(`  try {
    body = await req.json();
  } catch {
    return svarJson({ ok: false, error: "ugyldig_krop" }, 400);
  }`);
    expect(k).toContain('if (body === null || typeof body !== "object" || Array.isArray(body)) {');
  });

  it("dom 5, SELVBEVIS: req.json() uden try fælder", () => {
    expect(reqJsonUdenTry("  const body = await req.json();")).toEqual([1]);
    expect(reqJsonUdenTry("  try {\n    const x = 1; body = await req.json();\n  } catch {}")).toEqual([2]);
    expect(reqJsonUdenTry("  try {\n    body = await req.json();\n  } catch {}")).toEqual([]);
    const k = kilde();
    const snydt = k.replace(
      `  let body: any;
  try {
    body = await req.json();
  } catch {
    return svarJson({ ok: false, error: "ugyldig_krop" }, 400);
  }`,
      "  const body = await req.json();",
    );
    expect(snydt).not.toBe(k);
    expect(reqJsonUdenTry(snydt)).toHaveLength(1);
  });
});
