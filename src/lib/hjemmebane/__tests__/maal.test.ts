import { describe, expect, it } from "vitest";
import { kanOpretteMaal, maalFremdrift, MAX_AKTIVE_MAAL, TAELLENDE_SKRIDT, vaelgMaalForForslag } from "@/lib/hjemmebane/maal";

/* «Én plan pr. virksomhed», fase 1 (16/9): motoren for mål og skridt.
   Jonas: når alle skridt er gjort, rykker målets fremdrift; højst tre aktive
   mål; AI'en foreslår kun mod et aktivt mål. Alle grene. */

const s = (...statusser: string[]) => statusser.map((status) => ({ status }));

describe("maalFremdrift — andel gjorte skridt af de tællende", () => {
  it("tællende er præcis active, done, not_done, dropped", () => {
    expect([...TAELLENDE_SKRIDT]).toEqual(["active", "done", "not_done", "dropped"]);
  });
  it("alle skridt gjort → 100", () => {
    expect(maalFremdrift(s("done", "done", "done"), 0)).toBe(100);
    expect(maalFremdrift(s("done"), 40)).toBe(100);
  });
  it("et aktivt skridt tilbage → aldrig 100 (det står i nævneren)", () => {
    expect(maalFremdrift(s("done", "done", "active"), 0)).toBe(67);
    expect(maalFremdrift(s("active"), 90)).toBe(0);
  });
  it("not_done og dropped var skridt: de tæller i nævneren, ikke i tælleren", () => {
    expect(maalFremdrift(s("done", "not_done"), 0)).toBe(50);
    expect(maalFremdrift(s("done", "dropped", "dropped"), 0)).toBe(33);
    expect(maalFremdrift(s("dropped"), 70)).toBe(0);
  });
  it("forslag tæller ikke: proposed, dismissed, expired ændrer intet", () => {
    expect(maalFremdrift(s("done", "proposed", "dismissed", "expired"), 0)).toBe(100);
    expect(maalFremdrift(s("done", "active", "proposed", "proposed"), 0)).toBe(50);
  });
  it("ingen tællende skridt → fremdriften er UÆNDRET (menneskets tal beholdes), klippet til 0–100", () => {
    expect(maalFremdrift([], 35)).toBe(35);
    expect(maalFremdrift(s("proposed", "dismissed"), 35)).toBe(35);
    expect(maalFremdrift([], 140)).toBe(100);
    expect(maalFremdrift([], -5)).toBe(0);
    expect(maalFremdrift([], 12.6)).toBe(13);
  });
  it("ulæseligt nuvaerende uden skridt → 0; med skridt ignoreres det", () => {
    expect(maalFremdrift([], null)).toBe(0);
    expect(maalFremdrift([], undefined)).toBe(0);
    expect(maalFremdrift([], Number.NaN)).toBe(0);
    expect(maalFremdrift(s("done"), null)).toBe(100);
  });
  it("afrunding: 1 af 3 → 33, 2 af 3 → 67, 1 af 6 → 17", () => {
    expect(maalFremdrift(s("done", "active", "active"), 0)).toBe(33);
    expect(maalFremdrift(s("done", "done", "active"), 0)).toBe(67);
    expect(maalFremdrift(s("done", "active", "active", "active", "active", "active"), 0)).toBe(17);
  });
  it("muterer ikke input", () => {
    const input = s("active", "done");
    const kopi = JSON.stringify(input);
    maalFremdrift(input, 0);
    expect(JSON.stringify(input)).toBe(kopi);
  });
});

describe("kanOpretteMaal — højst tre aktive", () => {
  it("0, 1, 2 aktive → ja; 3 og derover → nej", () => {
    expect(MAX_AKTIVE_MAAL).toBe(3);
    expect(kanOpretteMaal(0)).toBe(true);
    expect(kanOpretteMaal(1)).toBe(true);
    expect(kanOpretteMaal(2)).toBe(true);
    expect(kanOpretteMaal(3)).toBe(false);
    expect(kanOpretteMaal(7)).toBe(false);
  });
  it("fail-closed: negativt, NaN, Infinity og ikke-tal → nej", () => {
    expect(kanOpretteMaal(-1)).toBe(false);
    expect(kanOpretteMaal(Number.NaN)).toBe(false);
    expect(kanOpretteMaal(Number.POSITIVE_INFINITY)).toBe(false);
    expect(kanOpretteMaal("2" as unknown as number)).toBe(false);
  });
});

describe("vaelgMaalForForslag — kun formen og dommen (kaldes i fase 5)", () => {
  const maal = [
    { id: "m-nyt", status: "active", category: "other", created_at: "2026-09-10T08:00:00Z" },
    { id: "m-oek", status: "active", category: "Økonomi", created_at: "2026-09-05T08:00:00Z" },
    { id: "m-aeldst", status: "active", category: "salg", created_at: "2026-09-01T08:00:00Z" },
    { id: "m-park", status: "parked", category: "salg", created_at: "2026-08-01T08:00:00Z" },
    { id: "m-naaet", status: "completed", category: "økonomi", created_at: "2026-07-01T08:00:00Z" },
  ];
  it("1: det ønskede mål når det er aktivt", () => {
    expect(vaelgMaalForForslag(maal, { maalId: "m-nyt" })).toBe("m-nyt");
    expect(vaelgMaalForForslag(maal, { maalId: " m-oek " })).toBe("m-oek");
  });
  it("ønsket mål der er parkeret, nået eller ukendt → falder videre", () => {
    expect(vaelgMaalForForslag(maal, { maalId: "m-park" })).toBe("m-aeldst");
    expect(vaelgMaalForForslag(maal, { maalId: "m-naaet", kategori: "økonomi" })).toBe("m-oek");
    expect(vaelgMaalForForslag(maal, { maalId: "findes-ikke" })).toBe("m-aeldst");
  });
  it("2: ældste aktive med kategorien (uafhængigt af store/små bogstaver og kanter)", () => {
    expect(vaelgMaalForForslag(maal, { kategori: "økonomi" })).toBe("m-oek");
    expect(vaelgMaalForForslag(maal, { kategori: " SALG " })).toBe("m-aeldst");
  });
  it("3: ukendt kategori eller intet ønske → ældste aktive", () => {
    expect(vaelgMaalForForslag(maal, { kategori: "hr" })).toBe("m-aeldst");
    expect(vaelgMaalForForslag(maal)).toBe("m-aeldst");
    expect(vaelgMaalForForslag(maal, { maalId: null, kategori: null })).toBe("m-aeldst");
  });
  it("4: ingen aktive mål → null (ingen mål → intet forslag)", () => {
    expect(vaelgMaalForForslag([], { maalId: "m-nyt" })).toBeNull();
    expect(vaelgMaalForForslag(maal.filter((m) => m.status !== "active"))).toBeNull();
  });
  it("kategori null på målet rammer ikke en ønsket kategori; muterer ikke input", () => {
    const m = [{ id: "a", status: "active", category: null, created_at: "2026-09-01T00:00:00Z" }];
    expect(vaelgMaalForForslag(m, { kategori: "salg" })).toBe("a");
    const kopi = JSON.stringify(maal);
    vaelgMaalForForslag(maal, { kategori: "salg" });
    expect(JSON.stringify(maal)).toBe(kopi);
  });
});
