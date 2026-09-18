import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { svarfristFra } from "@/lib/ventelisteDom";
import { naesteSendevindue, kbhTilUtc } from "@/lib/hverdage";
import { TRAPPER } from "@/lib/rykkerkoe";

// Recon 18/9 §2 pkt. 7: ventepladsens frist løber fra AFSENDELSEN. Og afsendelsen er NU (Jonas 18/9, pkt. 8,
// 19/9): tilbuddet er svar på en handling og sendes straks gennem motorens sendSvarMailNu — klik fredag 16:30
// → mailen fredag 16:30 → frist fredag om en uge, udløbsrækken samme dag kl. 10. Kun hvis afsendelsen fejler,
// tager køen rækken i næste sendevindue (mandag 07:00) — fristen bliver stående (7 dage fra tilbuddet).
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const IO = "supabase/functions/_shared/venteliste.ts";

export const fristenLoeberFraAfsendelsen = (k: string): boolean =>
  k.includes("const afsendelse = nu;") && k.includes("const svarfrist = svarfristFra(afsendelse);") &&
  k.includes('trappe: "venteplads", anker: afsendelse, nu });') && k.includes("tilbudt_at: nu.toISOString(), tilbud_udloeber_at: svarfrist.toISOString()") &&
  k.includes('await sendSvarMailNu(admin, a, "venteplads", nu, { bloed, svarfrist, tagPladsenUrl: tagPladsenLink(a.token), afslaaPladsenUrl: afslaaPladsenLink(a.token) })') &&
  !/naesteSendevindue/.test(k);

describe("ventepladsFrist.guard", () => {
  it("dag 0 i ventepladsen er uden dagsregel; dag 3 og udløbet er ikke", () => {
    expect(TRAPPER.venteplads.map((t) => [t.trinNr, t.udenDagsregel === true])).toEqual([[0, true], [1, false], [2, false]]);
  });
  it("fredag 16:30: afsendelsen er nu og fristen fredag om en uge; reservens tid (næste sendevindue) er mandag 07:00", () => {
    const klik = kbhTilUtc("2026-09-18", 16, 30);
    expect(svarfristFra(klik).toISOString()).toBe(kbhTilUtc("2026-09-25", 16, 30).toISOString());
    expect(naesteSendevindue(klik).toISOString()).toBe(kbhTilUtc("2026-09-21", 7, 0).toISOString());
  });
  it("tilbydPladsen: fristen og trappen ankres i afsendelsen = nu; tilbuddet sendes straks med bloed, frist og de to links; ingen sendevindue-regning", () => expect(fristenLoeberFraAfsendelsen(laes(IO))).toBe(true));
  it("VÆRNET VIRKER: fristen fra næste sendevindue igen → falsk; trappen ankret et andet sted → falsk; tilbuddet ikke sendt straks → falsk", () => {
    const k = laes(IO);
    expect(fristenLoeberFraAfsendelsen(k.replace("const afsendelse = nu;", "const afsendelse = naesteSendevindue(nu);"))).toBe(false);
    expect(fristenLoeberFraAfsendelsen(k.replace('anker: afsendelse, nu });', "anker: new Date(), nu });"))).toBe(false);
    expect(fristenLoeberFraAfsendelsen(k.replace('await sendSvarMailNu(admin, a, "venteplads", nu, ', "await x("))).toBe(false);
  });
});
