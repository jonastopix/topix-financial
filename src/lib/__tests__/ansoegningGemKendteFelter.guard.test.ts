/**
 * KILDEVÆRN — ansoegning-gem afviser ukendte body-felter (STRIKS, 21/9), og
 * dens KENDTE_FELTER dækker PRÆCIS det, klienten sender.
 *
 * Faren ved at gå fra BAGLOG til STRIKS på en OFFENTLIG formular: ét felt,
 * klienten sender, og som ingen skrev på listen, giver 400 for hver ansøger.
 * Derfor læses klientens payloads ud af src/lib/ansoegning/api.ts (hvert
 * kald(…"ansoegning-gem", { … })) og opretAnsoegning's args-type, og hver
 * nøgle skal stå i functionens KENDTE_FELTER. Omvendt: et navn på listen, som
 * klienten aldrig sender, er en åben dør, og det siges også.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const API = "src/lib/ansoegning/api.ts";
const GEM = "supabase/functions/ansoegning-gem/index.ts";
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");

/** Functionens liste, som den står. */
export function kendteFelterAf(gem: string): string[] {
  const m = /const KENDTE_FELTER = \[([^\]]*)\] as const;/.exec(gem);
  return m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : [];
}

/** Kroppen af hvert `{ … }`, klienten sender til ansoegning-gem — med balancerede klammer (gem har en spredning med et objekt indeni). */
export function payloadKroppe(api: string): string[] {
  const ud: string[] = [];
  const start = /kald(?:<[^>]*>)?\("ansoegning-gem",\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = start.exec(api)) !== null) {
    let dybde = 1;
    let i = m.index + m[0].length;
    const fra = i;
    while (i < api.length && dybde > 0) {
      if (api[i] === "{") dybde++;
      else if (api[i] === "}") dybde--;
      i++;
    }
    ud.push(api.slice(fra, i - 1));
  }
  return ud;
}

/** Top-niveau-dele af et objekt-literal, delt på kommaer i dybde 0. */
function dele(krop: string): string[] {
  const ud: string[] = [];
  let dybde = 0, fra = 0;
  for (let i = 0; i < krop.length; i++) {
    const c = krop[i];
    if (c === "{" || c === "(" || c === "[") dybde++;
    else if (c === "}" || c === ")" || c === "]") dybde--;
    else if (c === "," && dybde === 0) { ud.push(krop.slice(fra, i)); fra = i + 1; }
  }
  ud.push(krop.slice(fra));
  return ud.map((d) => d.trim()).filter(Boolean);
}

/** Nøglerne i hvert payload — `key: value` giver key, `shorthand` giver sig selv, `...args` slås op i opretAnsoegning's type, `...(x ? { y } : {})` giver y. */
export function klientensNoegler(api: string): { handling: string; noegler: string[] }[] {
  const argsType = /opretAnsoegning\(args: \{([^}]*)\}/.exec(api);
  const argsNoegler = argsType ? [...argsType[1].matchAll(/(\w+)\??:/g)].map((x) => x[1]) : [];
  return payloadKroppe(api).map((krop) => {
    const noegler = new Set<string>();
    let handling = "?";
    for (const d of dele(krop)) {
      if (d.startsWith("...")) {
        if (/\bargs\b/.test(d)) for (const n of argsNoegler) noegler.add(n);
        for (const n of d.matchAll(/\{\s*(\w+)\s*\}/g)) noegler.add(n[1]);
        continue;
      }
      const kv = /^(\w+)\s*:\s*(.*)$/s.exec(d);
      if (kv) {
        noegler.add(kv[1]);
        if (kv[1] === "handling") handling = /"(\w+)"/.exec(kv[2])?.[1] ?? "?";
      } else if (/^\w+$/.test(d)) {
        noegler.add(d);
      }
    }
    return { handling, noegler: [...noegler] };
  });
}

describe("ansoegning-gem: kendte felter = det, klienten sender", () => {
  const gem = laes(GEM), api = laes(API);
  const kendte = kendteFelterAf(gem);
  const kald = klientensNoegler(api);

  it("functionen afviser ukendte felter og har en liste", () => {
    expect(gem).toContain("ukendteFelter(body, KENDTE_FELTER)");
    expect(gem).toContain("ukendteFelterBesked(");
    expect(kendte.length).toBeGreaterThan(0);
  });

  it("klienten har alle fire handlinger, og hver nøgle står på listen", () => {
    expect(kald.map((k) => k.handling).sort()).toEqual(["gem", "hent", "indsend", "opret"]);
    for (const k of kald) {
      const mangler = k.noegler.filter((n) => !kendte.includes(n));
      expect(`${k.handling}: ${mangler.join(",")}`).toBe(`${k.handling}: `);
    }
  });

  it("intet navn på listen, som klienten aldrig sender — en åben dør er også en fejl", () => {
    const sendt = new Set(kald.flatMap((k) => k.noegler));
    expect(kendte.filter((n) => !sendt.has(n))).toEqual([]);
  });

  it("SELVBEVIS: et nyt felt i klienten uden plads på listen fanges", () => {
    const ondApi = api.replace(/handling: "hent", token \}/g, 'handling: "hent", token, nyt_felt }');
    expect(ondApi).not.toBe(api);
    const hent = klientensNoegler(ondApi).find((k) => k.handling === "hent")!;
    expect(hent.noegler).toContain("nyt_felt");
    expect(hent.noegler.filter((n) => !kendte.includes(n))).toEqual(["nyt_felt"]);
  });

  it("SELVBEVIS: opret's ...args læses ud af typen — annoncespor tæller med", () => {
    const opret = kald.find((k) => k.handling === "opret")!;
    expect(opret.noegler).toEqual(expect.arrayContaining(["handling", "kilde", "kilde_raa", "annoncespor", "svar", "firma"]));
  });
});
