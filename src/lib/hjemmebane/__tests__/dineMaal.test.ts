import { describe, expect, it } from "vitest";
import { MAX_AKTIVE_MAAL } from "@/lib/hjemmebane/maal";
import type { MaalRaekke } from "@/lib/hjemmebane/planen";
import {
  DINE_MAAL_TOM_TEKST,
  dineMaalDom,
  forsideMaal,
  graenseTekst,
  modMaaletTekst,
  skridtLinjer,
  type SkridtTilDineMaal,
} from "@/lib/hjemmebane/dineMaal";

/* «Dine mål» (fase 3, 16/9): medlemmets handlinger på sine egne mål, skyderen
   kun uden skridt, skridt-linjerne (◻ ? ✓ –) og grænsen på tre i klart sprog.
   Grupper og fremdrift er planen.ts' (fase 2) — testet dér. */

const NU = new Date("2026-09-16T20:00:00Z");
const maal = (over: Partial<MaalRaekke> & { id: string }): MaalRaekke => ({
  title: `Mål ${over.id}`, status: "active", progress: 0, deadline: null, category: "other", source: "manual",
  progress_updated_at: "2026-09-10T10:00:00Z", completed_at: null, created_at: "2026-09-01T00:00:00Z", ...over,
});
const skridt = (over: Partial<SkridtTilDineMaal> & { id: string; maal_id: string | null }): SkridtTilDineMaal => ({
  title: `Skridt ${over.id}`, status: "active", due_date: null, closed_at: null, ...over,
});

describe("dineMaalDom — medlemmets handlinger", () => {
  it("«Tilføj skridt» (17/9, Jonas «ja»): KUN under aktive mål — ikke parkerede, ikke nåede", () => {
    const d = dineMaalDom([maal({ id: "a" }), maal({ id: "p", status: "parked" }), maal({ id: "n", status: "completed", completed_at: "2026-09-12T00:00:00Z" })], [], NU);
    expect(d.aktive[0].handlinger.kanTilfoejeSkridt).toBe(true);
    expect(d.parkerede[0].handlinger.kanTilfoejeSkridt).toBe(false);
    expect(d.naaede[0].handlinger.kanTilfoejeSkridt).toBe(false);
  });
  it("aktivt mål: nået, parkér, slet — og skyderen KUN uden tællende skridt", () => {
    const d = dineMaalDom([maal({ id: "u" }), maal({ id: "m" })], [skridt({ id: "s1", maal_id: "m" })], NU);
    const uden = d.aktive.find((x) => x.plan.maal.id === "u")!;
    const med = d.aktive.find((x) => x.plan.maal.id === "m")!;
    // Før (17/9): toEqual uden kanTilfoejeSkridt — «Tilføj skridt» (skridt-tilfoej) kom til 17/9.
    expect(uden.handlinger).toEqual({ kanMarkereNaaet: true, kanGenaabne: false, kanParkere: true, kanAktivere: false, kanSlette: true, kanSaetteFremdrift: true, kanTilfoejeSkridt: true });
    expect(med.handlinger.kanSaetteFremdrift).toBe(false);
    expect(med.plan.beregnet).toBe(true);
    expect(uden.plan.beregnet).toBe(false);
  });
  it("kun et ventende forslag under målet → ikke beregnet → skyderen er stadig medlemmets", () => {
    const d = dineMaalDom([maal({ id: "m", progress: 40 })], [skridt({ id: "p", maal_id: "m", status: "proposed" })], NU);
    expect(d.aktive[0].handlinger.kanSaetteFremdrift).toBe(true);
    expect(d.aktive[0].fremdriftTekst).toBe("40 %");
  });
  it("parkeret mål: aktivér kun når der er plads; slet altid", () => {
    const plads = dineMaalDom([maal({ id: "a" }), maal({ id: "p", status: "parked" })], [], NU);
    expect(plads.parkerede[0].handlinger).toMatchObject({ kanAktivere: true, kanSlette: true, kanMarkereNaaet: false, kanSaetteFremdrift: false });
    const fuldt = dineMaalDom([maal({ id: "a" }), maal({ id: "b" }), maal({ id: "c" }), maal({ id: "p", status: "parked" })], [], NU);
    expect(fuldt.parkerede[0].handlinger.kanAktivere).toBe(false);
  });
  it("nået mål: genåbn når der er plads — men ikke når alle skridt er gjort (fremdriften ville stadig være 100)", () => {
    const naaet = dineMaalDom([maal({ id: "n", status: "completed", progress: 40, completed_at: "2026-09-12T00:00:00Z" })], [], NU);
    expect(naaet.naaede[0].handlinger.kanGenaabne).toBe(true);
    const alleGjort = dineMaalDom([maal({ id: "n", status: "completed", progress: 100 })], [skridt({ id: "s", maal_id: "n", status: "done", closed_at: "2026-09-12T00:00:00Z" })], NU);
    expect(alleGjort.naaede[0].plan.fremdrift).toBe(100);
    expect(alleGjort.naaede[0].handlinger.kanGenaabne).toBe(false);
    const fuldt = dineMaalDom([maal({ id: "a" }), maal({ id: "b" }), maal({ id: "c" }), maal({ id: "n", status: "completed", progress: 40 })], [], NU);
    expect(fuldt.naaede[0].handlinger.kanGenaabne).toBe(false);
  });
  it("progress 100 med status active er nået (Jonas: A) — samme dom som planen", () => {
    const d = dineMaalDom([maal({ id: "h", progress: 100 })], [], NU);
    expect(d.aktive).toEqual([]);
    expect(d.naaede.map((x) => x.plan.maal.id)).toEqual(["h"]);
  });
});

describe("dineMaalDom — grænsen på tre i klart sprog", () => {
  it("0, 1–2, 3 og flere end 3 aktive", () => {
    expect(graenseTekst(0)).toBe(`Du kan have op til ${MAX_AKTIVE_MAAL} aktive mål ad gangen.`);
    expect(graenseTekst(1)).toBe("1 af 3 aktive mål — plads til 2 mere.");
    expect(graenseTekst(2)).toBe("2 af 3 aktive mål — plads til 1 mere.");
    expect(graenseTekst(3)).toBe("Du har 3 aktive mål — det er det højeste. Parkér eller markér et som nået for at få plads til et nyt.");
    expect(graenseTekst(5)).toBe("Du har 5 aktive mål — flere end de 3 der er plads til. Parkér eller markér nogle som nået, så I står med højst 3.");
  });
  it("kanOprette følger kanOpretteMaal; overGraensen = planens gennemgang; tom = ingen mål", () => {
    const tom = dineMaalDom([], [], NU);
    expect(tom).toMatchObject({ tom: true, kanOprette: true, overGraensen: false });
    expect(tom.graenseTekst).toBe(graenseTekst(0));
    const tre = dineMaalDom([maal({ id: "a" }), maal({ id: "b" }), maal({ id: "c" })], [], NU);
    expect(tre).toMatchObject({ tom: false, kanOprette: false, overGraensen: false });
    const fire = dineMaalDom([maal({ id: "a" }), maal({ id: "b" }), maal({ id: "c" }), maal({ id: "d" })], [], NU);
    expect(fire).toMatchObject({ kanOprette: false, overGraensen: true });
    expect(fire.graenseTekst).toBe(graenseTekst(4));
    expect(DINE_MAAL_TOM_TEKST).toContain("ikke sat mål endnu");
  });
});

describe("skridtLinjer — ◻ aktive med frist, ? venter, ✓ gjorte, – ikke gjort", () => {
  it("tegn, ord og rækkefølge: aktive (frist stigende, uden frist sidst), ventende, gjorte (nyeste først), resten; dismissed/expired udelades", () => {
    const linjer = skridtLinjer([
      skridt({ id: "g1", maal_id: "m", status: "done", closed_at: "2026-09-10T00:00:00Z" }),
      skridt({ id: "a-uden", maal_id: "m", status: "active", due_date: null }),
      skridt({ id: "v", maal_id: "m", status: "proposed" }),
      skridt({ id: "x", maal_id: "m", status: "expired" }),
      skridt({ id: "a2", maal_id: "m", status: "active", due_date: "2026-09-30" }),
      skridt({ id: "a1", maal_id: "m", status: "active", due_date: "2026-09-20" }),
      skridt({ id: "g2", maal_id: "m", status: "done", closed_at: "2026-09-14T00:00:00Z" }),
      skridt({ id: "nd", maal_id: "m", status: "not_done", closed_at: "2026-09-11T00:00:00Z" }),
      skridt({ id: "dr", maal_id: "m", status: "dropped", closed_at: "2026-09-13T00:00:00Z" }),
      skridt({ id: "afv", maal_id: "m", status: "dismissed" }),
    ]);
    expect(linjer.map((l) => `${l.tegn} ${l.id}`)).toEqual(["◻ a1", "◻ a2", "◻ a-uden", "? v", "✓ g2", "✓ g1", "– dr", "– nd"]);
    expect(linjer[0]).toMatchObject({ frist: "2026-09-20", kanMarkeresGjort: true, ord: null });
    expect(linjer[3]).toMatchObject({ ord: "venter på dit svar", kanMarkeresGjort: false });
    expect(linjer[4]).toMatchObject({ lukket: "2026-09-14T00:00:00Z", kanMarkeresGjort: false });
    expect(linjer[6].ord).toBe("droppet");
    expect(linjer[7].ord).toBe("ikke gjort");
  });
  it("linjerne hænger på målet; gjorte tælles til historikkens overskrift; fremdriften er planens ord", () => {
    const d = dineMaalDom([maal({ id: "m" })], [
      skridt({ id: "a", maal_id: "m" }), skridt({ id: "g", maal_id: "m", status: "done", closed_at: "2026-09-12T00:00:00Z" }),
      skridt({ id: "andet", maal_id: "andet-maal" }),
    ], NU);
    expect(d.aktive[0].skridtLinjer.map((l) => l.id)).toEqual(["a", "g"]);
    expect(d.aktive[0].gjorte).toBe(1);
    expect(d.aktive[0].fremdriftTekst).toBe("1 af 2 skridt gjort · 50 %");
  });
});

describe("forsiden — forsideMaal og «Mod målet»", () => {
  it("højst tre aktive vises; resten tælles", () => {
    const d = dineMaalDom([maal({ id: "a" }), maal({ id: "b" }), maal({ id: "c" }), maal({ id: "d" }), maal({ id: "p", status: "parked" })], [], NU);
    const f = forsideMaal(d);
    expect(f.viste.map((x) => x.plan.maal.id)).toEqual(["a", "b", "c"]);
    expect(f.flere).toBe(1);
    expect(forsideMaal(dineMaalDom([maal({ id: "a" })], [], NU)).flere).toBe(0);
  });
  it("«Mod målet: {titel}» — null uden mål eller ukendt mål", () => {
    const liste = [{ id: "m", title: "Positiv bundlinje" }];
    expect(modMaaletTekst(liste, "m")).toBe("Mod målet: Positiv bundlinje");
    expect(modMaaletTekst(liste, null)).toBeNull();
    expect(modMaaletTekst(liste, "x")).toBeNull();
  });
});
