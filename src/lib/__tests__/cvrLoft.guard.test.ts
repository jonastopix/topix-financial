import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cvrLoftBesked, TYPE_CVR_LOFT } from "../../../supabase/functions/_shared/cvrLoftBesked.ts";

// Generalprøvens brist 6 (18/9): dagsloftet er eksplicit, og rådgiverne får en klokke når det rammes.
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");
const CVR = "supabase/functions/ansoegning-cvr/index.ts";

export const loftetErEksplicit = (k: string): boolean =>
  k.includes("export const DAGSLOFT_STANDARD = 20;") &&
  k.includes('const DAGSLOFT = Number(Deno.env.get("ANSOEGNING_CVR_DAGSLOFT") ?? String(DAGSLOFT_STANDARD));');
/** Klokken skrives i BEGGE stop-grene: vores dagsloft og DataCVR's egen grænse — og aldrig andre steder. */
export const klokkenVedBeggeLofter = (k: string): boolean => {
  const dagsloft = /console\.warn\(`\[ansoegning-cvr\] dagsloftet \(\$\{DAGSLOFT\}\) er nået[^\n]*\n\s*svar = \{ udfald: "utilgaengelig" \};\n\s*await meldLoftRamt\(adminClient, "dagsloft"\);/.test(k);
  const datacvr = /svar = \{ udfald: "utilgaengelig" \};\n\s*if \(udfald\.udfald === "graense"\) await meldLoftRamt\(adminClient, "datacvr"\);/.test(k);
  return dagsloft && datacvr && k.split("await meldLoftRamt(adminClient, ").length === 3 && k.includes("skrivRaadgiverBesked(adminClient, cvrLoftBesked(grund, kbhDato(new Date()), DAGSLOFT))");
};
/** Klokken må aldrig vælte opslaget: try/catch om skrivningen. */
export const klokkenKasterAldrig = (k: string): boolean =>
  /async function meldLoftRamt\([\s\S]*?try \{[\s\S]*?skrivRaadgiverBesked\([\s\S]*?\} catch \(e\) \{/.test(k);

describe("cvrLoftBesked — teksten til klokken", () => {
  it("vores dagsloft: titel med dato og loft, body med hvad der sker og hvad man gør", () => {
    const b = cvrLoftBesked("dagsloft", "2026-09-21", 20);
    expect(b.type).toBe(TYPE_CVR_LOFT);
    expect(b.title).toBe("CVR-opslag stoppet 2026-09-21: vores eget dagsloft (20 opslag) er nået");
    expect(b.body).toContain("Ansøgere får feltet «Hvad hedder virksomheden?»");
    expect(b.body).toContain("ANSOEGNING_CVR_DAGSLOFT (i dag 20)");
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
    expect(loftetErEksplicit(k.replace("export const DAGSLOFT_STANDARD = 20;", "export const DAGSLOFT_STANDARD = 50;"))).toBe(false);
    expect(klokkenVedBeggeLofter(k.replace('if (udfald.udfald === "graense") await meldLoftRamt(adminClient, "datacvr");', ""))).toBe(false);
    expect(klokkenVedBeggeLofter(k + '\nawait meldLoftRamt(adminClient, "dagsloft");\n')).toBe(false);
    expect(klokkenKasterAldrig(k.replace("} catch (e) {", "} finally {"))).toBe(false);
  });
});
