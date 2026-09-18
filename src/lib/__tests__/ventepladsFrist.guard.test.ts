import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { svarfristFra } from "@/lib/ventelisteDom";
import { naesteSendevindue, kbhTilUtc } from "@/lib/hverdage";
import { TRAPPER } from "@/lib/rykkerkoe";

// Recon 18/9 §2 pkt. 7: ventepladsens frist løber fra AFSENDELSEN. Klik fredag 16:30 → mailen mandag 07:00
// → frist mandag om en uge 07:00, udløbsrækken samme dag kl. 10. Før løb fristen fra klikket (6 dage i praksis).
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const IO = "supabase/functions/_shared/venteliste.ts";

export const fristenLoeberFraAfsendelsen = (k: string): boolean =>
  k.includes("const afsendelse = naesteSendevindue(nu);") && k.includes("const svarfrist = svarfristFra(afsendelse);") &&
  k.includes('trappe: "venteplads", anker: afsendelse, nu });') && k.includes("tilbudt_at: nu.toISOString(), tilbud_udloeber_at: svarfrist.toISOString()");

describe("ventepladsFrist.guard", () => {
  it("dag 0 i ventepladsen er uden dagsregel; dag 3 og udløbet er ikke", () => {
    expect(TRAPPER.venteplads.map((t) => [t.trinNr, t.udenDagsregel === true])).toEqual([[0, true], [1, false], [2, false]]);
  });
  it("fredag 16:30: afsendelsen er mandag 07:00 og fristen mandag om en uge — ikke fredag om en uge", () => {
    const klik = kbhTilUtc("2026-09-18", 16, 30);
    const afsendelse = naesteSendevindue(klik);
    expect(afsendelse.toISOString()).toBe(kbhTilUtc("2026-09-21", 7, 0).toISOString());
    expect(svarfristFra(afsendelse).toISOString()).toBe(kbhTilUtc("2026-09-28", 7, 0).toISOString());
    expect(svarfristFra(klik).getTime()).toBeLessThan(svarfristFra(afsendelse).getTime());
  });
  it("i vinduet: afsendelsen er nu — fristen som før", () => {
    const klik = kbhTilUtc("2026-09-21", 11, 0);
    expect(naesteSendevindue(klik).toISOString()).toBe(klik.toISOString());
  });
  it("tilbydPladsen: fristen og trappen ankres i afsendelsen; tilbudt_at er stadig klikket", () => expect(fristenLoeberFraAfsendelsen(laes(IO))).toBe(true));
  it("VÆRNET VIRKER: fristen fra klikket igen → falsk; trappen ankret i nu → falsk", () => {
    const k = laes(IO);
    expect(fristenLoeberFraAfsendelsen(k.replace("const svarfrist = svarfristFra(afsendelse);", "const svarfrist = svarfristFra(nu);"))).toBe(false);
    expect(fristenLoeberFraAfsendelsen(k.replace('anker: afsendelse, nu });', "anker: nu, nu });"))).toBe(false);
  });
});
