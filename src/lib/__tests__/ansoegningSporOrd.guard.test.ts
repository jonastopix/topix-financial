import { describe, expect, it } from "vitest";
import { HANDLING_ORD, INTERN_ORD, SKABELON_ORD } from "@/lib/ansoegninger/ansoegningSpor";
import { KOE_SKABELONER, TRAPPER } from "@/lib/rykkerkoe";
import { MENNESKE_HANDLINGER, SYSTEM_HANDLINGER } from "@/lib/ansoegningTrin";

// Sporets tre ordbøger UDLEDES af koden (recon-sammenhæng §1/§6, 19/9): tre vinduer tilføjede
// trapper og handlinger, ingen opdaterede ordbogen, og rådgiveren så rå id'er. Nu kan de ikke
// glide fra hinanden: nøglerne skal være PRÆCIS listerne i rykkerkoe.ts og ansoegningTrin.ts —
// hverken færre (rå id i sporet) eller flere (ord for noget der ikke findes).

const sorteret = (xs: Iterable<string>) => [...xs].sort();
/** Køens interne handlinger: alt i TRAPPER der ikke er send_mail. */
export const interneHandlinger = (): string[] => sorteret(new Set(Object.values(TRAPPER).flat().map((t) => t.handling).filter((h) => h !== "send_mail")));
export const alleHandlingsarter = (): string[] => sorteret(new Set([...MENNESKE_HANDLINGER, ...SYSTEM_HANDLINGER]));
export const noeglerMatcher = (ord: Record<string, string>, liste: readonly string[]): { mangler: string[]; overflod: string[] } => ({
  mangler: liste.filter((k) => !(k in ord)),
  overflod: Object.keys(ord).filter((k) => !liste.includes(k)),
});

describe("ansoegningSporOrd.guard — ordbøgerne udledes af koden", () => {
  it("SKABELON_ORD = KOE_SKABELONER (alle køens mails har et ord — og intet ord uden mail)", () => {
    expect(noeglerMatcher(SKABELON_ORD, KOE_SKABELONER)).toEqual({ mangler: [], overflod: [] });
    expect(KOE_SKABELONER.length).toBeGreaterThanOrEqual(16);
  });
  it("INTERN_ORD = TRAPPER's handlinger uden send_mail", () => {
    expect(noeglerMatcher(INTERN_ORD, interneHandlinger())).toEqual({ mangler: [], overflod: [] });
    expect(interneHandlinger()).toContain("venteplads_udloeb");
  });
  it("HANDLING_ORD = MENNESKE_HANDLINGER ∪ SYSTEM_HANDLINGER", () => {
    expect(noeglerMatcher(HANDLING_ORD, alleHandlingsarter())).toEqual({ mangler: [], overflod: [] });
    expect(alleHandlingsarter()).toContain("saet_pause");
  });
  it("intet ord er bare sit eget id (det er det, rådgiveren så før)", () => {
    for (const ord of [SKABELON_ORD, INTERN_ORD, HANDLING_ORD]) for (const [k, v] of Object.entries(ord)) expect(v.trim(), k).not.toBe(k);
  });
});

describe("ansoegningSporOrd.guard — selvbevis", () => {
  it("en manglende nøgle, eller en nøgle uden kilde, falder", () => {
    const { "ansoegning-kvittering": _, ...uden } = SKABELON_ORD;
    expect(noeglerMatcher(uden, KOE_SKABELONER).mangler).toEqual(["ansoegning-kvittering"]);
    expect(noeglerMatcher({ ...INTERN_ORD, opfundet: "noget" }, interneHandlinger()).overflod).toEqual(["opfundet"]);
    expect(noeglerMatcher({ ...HANDLING_ORD }, [...alleHandlingsarter(), "ny_art"]).mangler).toEqual(["ny_art"]);
  });
});
