import { describe, expect, it } from "vitest";
import { dineMaalDom, type SkridtTilDineMaal } from "@/lib/hjemmebane/dineMaal";
import type { MaalRaekke } from "@/lib/hjemmebane/planen";
import {
  ALLE_GJORT_TEKST,
  erUdloebetForslag,
  fejring,
  fejringTekst,
  forsidePlanDom,
  MAAL_UDEN_SKRIDT_TEKST,
  ordnForslag,
  PLAN_TOM_TEKST,
  planHarIndhold,
  type PlanSkridt,
} from "@/lib/hjemmebane/forsidePlan";

/* «Din plan» (forside PR 3, 17/9 — Jonas «A» til valg 3): målene med skridt
   under, uden mål sidst, tom-tilstanden som invitation, fejringen. */

const NU = new Date("2026-09-17T10:00:00Z");
const maal = (over: Partial<MaalRaekke> & { id: string }): MaalRaekke => ({
  title: `Mål ${over.id}`, status: "active", progress: 0, deadline: null, category: "other", source: "manual",
  progress_updated_at: "2026-09-10T10:00:00Z", completed_at: null, created_at: "2026-09-01T00:00:00Z", ...over,
});
const s = (over: Partial<PlanSkridt> & { id: string; maal_id: string | null }): PlanSkridt => ({
  title: `Skridt ${over.id}`, status: "active", due_date: "2026-10-01", deferral_count: 0, expires_at: null, context: null,
  source_type: "advisor", created_at: "2026-09-10T00:00:00Z", ...over,
});
/** dineMaalDom læser skridt i sin egen form (title/status/due_date/maal_id/closed_at). */
const tilDine = (rows: PlanSkridt[]): SkridtTilDineMaal[] => rows.map((r) => ({ id: r.id, title: r.title, status: r.status, due_date: r.due_date, maal_id: r.maal_id, closed_at: null }));

describe("forsidePlanDom — grupperne", () => {
  it("tom: ingen mål → invitationen, ingen rækker; skridt uden mål vises stadig", () => {
    const d = forsidePlanDom(dineMaalDom([], [], NU), [s({ id: "u", maal_id: null })], NU);
    expect(d.tom).toBe(true);
    expect(d.maal).toEqual([]);
    expect(d.udenMaal.aktive.map((x) => x.id)).toEqual(["u"]);
    expect(planHarIndhold(d)).toBe(true);
    expect(PLAN_TOM_TEKST).toBe("Din plan starter med et mål. Sæt det første selv — eller sammen med din rådgiver.");
    expect(planHarIndhold(forsidePlanDom(dineMaalDom([], [], NU), [], NU))).toBe(false);
  });
  it("ét mål med to skridt: aktive (forfaldne øverst) og forslag under målet; udenSkridt falsk", () => {
    const skridt = [
      s({ id: "a1", maal_id: "m", due_date: "2026-10-05" }),
      s({ id: "a0", maal_id: "m", due_date: "2026-09-01" }), // forfalden → øverst
      s({ id: "f1", maal_id: "m", status: "proposed", due_date: null }),
    ];
    const d = forsidePlanDom(dineMaalDom([maal({ id: "m" })], tilDine(skridt), NU), skridt, NU);
    expect(d.tom).toBe(false);
    expect(d.maal).toHaveLength(1);
    expect(d.maal[0].aktive.map((x) => x.id)).toEqual(["a0", "a1"]);
    expect(d.maal[0].forslag.map((x) => x.id)).toEqual(["f1"]);
    expect(d.maal[0].udenSkridt).toBe(false);
    expect(d.maal[0].alleGjort).toBe(false);
    expect(d.ventende).toBe(1);
  });
  it("tre aktive mål vises; det fjerde tælles i flere, og dets skridt står under «Skridt under andre mål»", () => {
    const m = ["a", "b", "c", "d"].map((id, i) => maal({ id, created_at: `2026-09-0${i + 1}T00:00:00Z` }));
    const skridt = [s({ id: "sd", maal_id: "d" }), s({ id: "sa", maal_id: "a" })];
    const d = forsidePlanDom(dineMaalDom(m, tilDine(skridt), NU), skridt, NU);
    expect(d.maal.map((x) => x.plan.plan.maal.id)).toEqual(["a", "b", "c"]);
    expect(d.flere).toBe(1);
    expect(d.andre.aktive.map((x) => x.id)).toEqual(["sd"]);
    expect(d.overGraensen).toBe(true);
  });
  it("mål uden skridt overhovedet → udenSkridt (knappen «Tilføj det første skridt»)", () => {
    const d = forsidePlanDom(dineMaalDom([maal({ id: "m" })], [], NU), [], NU);
    expect(d.maal[0].udenSkridt).toBe(true);
    expect(MAAL_UDEN_SKRIDT_TEKST).toBe("Tilføj det første skridt");
  });
  it("alle skridt gjort (fremdrift 100 af skridtene, rækkens tal endnu ikke 100) → målet er aktivt med alleGjort; med rækkens tal 100 er det nået og ude af de aktive", () => {
    const gjorte: SkridtTilDineMaal[] = [{ id: "g", title: "G", status: "done", due_date: null, maal_id: "m", closed_at: "2026-09-12T00:00:00Z" }];
    const d = forsidePlanDom(dineMaalDom([maal({ id: "m", progress: 0 })], gjorte, NU), [], NU);
    expect(d.maal).toHaveLength(1);
    expect(d.maal[0].alleGjort).toBe(true);
    expect(ALLE_GJORT_TEKST).toBe("Alle skridt er gjort — marker målet som nået");
    // Rækkens progress 100 (opgave-luk har skrevet den): nået i planens dom (Jonas «A») → ikke blandt de aktive.
    const naaet = forsidePlanDom(dineMaalDom([maal({ id: "m", progress: 100 })], gjorte, NU), [], NU);
    expect(naaet.maal).toHaveLength(0);
    expect(naaet.ingenAktive).toBe(true);
  });
  it("kun parkerede/nåede mål → ingenAktive (ikke tom)", () => {
    const d = forsidePlanDom(dineMaalDom([maal({ id: "p", status: "parked" })], [], NU), [], NU);
    expect(d.tom).toBe(false);
    expect(d.ingenAktive).toBe(true);
  });
  it("udløbne forslag udelades; et skridt hvis mål ikke findes regnes som uden mål", () => {
    const skridt = [
      s({ id: "udl", maal_id: "m", status: "proposed", expires_at: "2026-09-01T00:00:00Z" }),
      s({ id: "ok", maal_id: "m", status: "proposed", expires_at: "2026-12-01T00:00:00Z" }),
      s({ id: "forladt", maal_id: "findes-ikke" }),
    ];
    const d = forsidePlanDom(dineMaalDom([maal({ id: "m" })], tilDine(skridt), NU), skridt, NU);
    expect(d.maal[0].forslag.map((x) => x.id)).toEqual(["ok"]);
    expect(d.udenMaal.aktive.map((x) => x.id)).toEqual(["forladt"]);
    expect(erUdloebetForslag(skridt[0], NU)).toBe(true);
    expect(erUdloebetForslag(skridt[1], NU)).toBe(false);
    expect(erUdloebetForslag({ status: "active", expires_at: "2026-01-01T00:00:00Z" }, NU)).toBe(false);
  });
});

describe("ordnForslag — vaelgForslag's rangorden gentaget", () => {
  it("rådgiverens forslag før AI'ens; high før medium; ældste først inden for samme", () => {
    const f = [
      s({ id: "ai", maal_id: null, status: "proposed", source_type: "ai_weekly", priority: "high", created_at: "2026-09-01T00:00:00Z" }),
      s({ id: "adv-ny", maal_id: null, status: "proposed", source_type: "advisor", priority: "medium", created_at: "2026-09-12T00:00:00Z" }),
      s({ id: "adv-gl", maal_id: null, status: "proposed", source_type: "advisor", priority: "medium", created_at: "2026-09-02T00:00:00Z" }),
    ];
    expect(ordnForslag(f).map((x) => x.id)).toEqual(["adv-gl", "adv-ny", "ai"]);
    expect(ordnForslag([])).toEqual([]);
  });
});

describe("fejringen — ✓ og en stille linje", () => {
  it("«Godt gået — {mål} er nu {N} %» med motorens tal, afrundet", () => {
    expect(fejringTekst("Nå 100 aktive kunder", 66.6)).toBe("Godt gået — Nå 100 aktive kunder er nu 67 %");
    expect(fejringTekst("Mål", 100)).toBe("Godt gået — Mål er nu 100 %. Alle skridt er gjort — marker målet som nået.");
    expect(fejringTekst("Mål", 99.6)).toBe("Godt gået — Mål er nu 100 %. Alle skridt er gjort — marker målet som nået.");
  });
  it("uden mål eller uden tal: «Godt gået.»", () => {
    expect(fejringTekst(null, 50)).toBe("Godt gået.");
    expect(fejringTekst("Mål", null)).toBe("Godt gået.");
    expect(fejringTekst("Mål", NaN)).toBe("Godt gået.");
  });
  it("fejring() bærer skridtet, målet og teksten", () => {
    expect(fejring({ id: "s1", title: "Ring til banken", maal_id: "m" }, "Positiv bundlinje", 50)).toEqual({
      skridtId: "s1", titel: "Ring til banken", maalId: "m", tekst: "Godt gået — Positiv bundlinje er nu 50 %",
    });
  });
});
