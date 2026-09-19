import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cvrLoftBesked, TYPE_CVR_LOFT } from "../../../supabase/functions/_shared/cvrLoftBesked.ts";
import { DAGSLOFT_STANDARD } from "../../../supabase/functions/_shared/cvrLoft.ts";

// Generalprøvens brist 6 (18/9): dagsloftet er eksplicit, og rådgiverne får en klokke når det rammes.
//
// NY PRÆMIS 19/9 (recon-boelgen-2 §3): loftet er flyttet til _shared/cvrLoft.ts og
// læses PR. KALD af app_config → secret → standard, så det kan hæves uden en
// udrulning; klokken hedder meldLoft (ikke meldLoftRamt) og har en TREDJE grund,
// «naermer_sig», der går ved 80 %. Værnene nedenfor er rettet til den præmis —
// ikke svækket: de holder stadig på at standarden er 20, at klokken skrives i
// begge stop-grene og ingen andre steder, og at den aldrig kaster. Det der er
// nyt, er låst af src/lib/__tests__/cvrLoftKilde.guard.test.ts.
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");
const CVR = "supabase/functions/ansoegning-cvr/index.ts";

export const loftetErEksplicit = (k: string): boolean =>
  // Standarden er stadig 20 — den bor nu i _shared/cvrLoft.ts og re-eksporteres.
  DAGSLOFT_STANDARD === 20 &&
  k.includes("export { DAGSLOFT_STANDARD };") &&
  k.includes("vaelgLoft(fraConfig, Deno.env.get(LOFT_SECRET))") &&
  // Den gamle NaN-linje må ikke komme tilbage.
  !/Number\(\s*Deno\.env\.get/.test(k);
/** Klokken skrives i BEGGE stop-grene: vores dagsloft og DataCVR's egen grænse — og aldrig andre steder. */
export const klokkenVedBeggeLofter = (k: string): boolean => {
  const dagsloft = /console\.warn\(`\[ansoegning-cvr\] dagsloftet \(\$\{loft\}\) er nået[^\n]*\n\s*svar = \{ udfald: "utilgaengelig" \};\n\s*await meldLoft\(adminClient, "dagsloft", loft\);/.test(k);
  const datacvr = /svar = \{ udfald: "utilgaengelig" \};\n\s*if \(udfald\.udfald === "graense"\) await meldLoft\(adminClient, "datacvr", loft\);/.test(k);
  // TRE kald nu, ikke to: de to stop-grene plus advarslen ved 80 %.
  return dagsloft && datacvr && k.split("meldLoft(adminClient, ").length === 4 &&
    k.includes('await meldLoft(adminClient, "naermer_sig", loft, loft - dom.resterende);') &&
    k.includes("skrivRaadgiverBesked(adminClient, cvrLoftBesked(grund, kbhDato(new Date()), loft, brugt))");
};
/** Klokken må aldrig vælte opslaget: try/catch om skrivningen. */
/**
 * try/catch INDEN FOR funktionens egen krop. Bundet med (?!async function), for
 * en ubundet `[\s\S]*?` løber videre til NÆSTE funktions catch — og så består
 * værnet, selv når try/catch'en er fjernet netop dér hvor den skulle stå.
 * (Fundet 19/9: mutationen «} catch → } finally» blev ikke fanget.)
 */
const harTryCatchIKroppen = (k: string, navn: string, indeni = ""): boolean => {
  const krop = "(?:(?!async function)[\\s\\S])*?";
  return new RegExp(`async function ${navn}\\(${krop}try \\{${krop}${indeni}${indeni ? krop : ""}\\} catch \\(e\\) \\{`).test(k);
};

export const klokkenKasterAldrig = (k: string): boolean =>
  harTryCatchIKroppen(k, "meldLoft", "skrivRaadgiverBesked\\(") &&
  // Loftets egen læsning må heller ikke vælte opslaget: en DB-fejl skal give
  // secret/standard, ikke en exception midt i en ansøgning.
  harTryCatchIKroppen(k, "hentLoft");

describe("cvrLoftBesked — teksten til klokken", () => {
  it("vores dagsloft: titel med dato og loft, body med hvad der sker og hvad man gør", () => {
    const b = cvrLoftBesked("dagsloft", "2026-09-21", 20);
    expect(b.type).toBe(TYPE_CVR_LOFT);
    expect(b.title).toBe("CVR-opslag stoppet 2026-09-21: vores eget dagsloft (20 opslag) er nået");
    expect(b.body).toContain("Ansøgere får feltet «Hvad hedder virksomheden?»");
    // Rådet er nu app_config-linjen (den virker uden en udrulning); secret'en
    // nævnes stadig som vejen, der findes, men den er ikke længere den første.
    expect(b.body).toContain("update public.app_config");
    expect(b.reference_type).toBe("cvr_loft");
  });
  it("DataCVR's grænse: anden titel, råd om planen", () => {
    const b = cvrLoftBesked("datacvr", "2026-09-21", 20);
    expect(b.title).toBe("CVR-opslag stoppet 2026-09-21: DataCVR har lukket for flere opslag i dag (grænsen på nøglen)");
    expect(b.body).toContain("25 pr. dag på gratisplanen");
  });
  it("to dage → to forskellige titler (dedup pr. dag); samme dag → samme titel (én klokke)", () => {
    expect(cvrLoftBesked("dagsloft", "2026-09-21", 20).title).not.toBe(cvrLoftBesked("dagsloft", "2026-09-22", 20).title);
    expect(cvrLoftBesked("dagsloft", "2026-09-21", 20).title).toBe(cvrLoftBesked("dagsloft", "2026-09-21", 20).title);
  });
});

describe("cvrLoft.guard — ansoegning-cvr", () => {
  const k = udenKommentarer(laes(CVR));
  it("dagsloftet er eksplicit (standard 20, secret'en overstyrer)", () => expect(loftetErEksplicit(k)).toBe(true));
  it("klokken skrives ved begge lofter, præcis dér, og med dagens danske dato", () => expect(klokkenVedBeggeLofter(k)).toBe(true));
  it("klokken kaster aldrig", () => expect(klokkenKasterAldrig(k)).toBe(true));
  it("VÆRNET VIRKER: standard 50 igen → falsk; klokken kun ved dagsloftet → falsk; uden try/catch → falsk", () => {
    expect(loftetErEksplicit(k.replace("export { DAGSLOFT_STANDARD };", ""))).toBe(false);
    expect(loftetErEksplicit(`${k}\nconst D = Number(Deno.env.get("X") ?? "20");`)).toBe(false);
    expect(klokkenVedBeggeLofter(k.replace('if (udfald.udfald === "graense") await meldLoft(adminClient, "datacvr", loft);', ""))).toBe(false);
    expect(klokkenVedBeggeLofter(k + '\nawait meldLoft(adminClient, "dagsloft", loft);\n')).toBe(false);
    // Begge try/catch'e prøves hver for sig — den ubundne regex bestod, når
    // kun den ene blev fjernet, fordi den fandt den anden længere nede.
    expect(klokkenKasterAldrig(k.replace("} catch (e) {", "} finally {"))).toBe(false);
    expect(klokkenKasterAldrig(k.replace(/\} catch \(e\) \{/g, "} finally {"))).toBe(false);
    expect(klokkenKasterAldrig(k.replace("async function hentLoft(", "async function hentLoftX("))).toBe(false);
  });
});
