import { describe, expect, it } from "vitest";
import { MEST_LAEST_MAERKE, MEST_LAEST_MINDST, vaelgMestLaest } from "../communityMestLaest";
import { NYTTIGT_ORD, nyttigtTekst } from "../communityNyttigt";

describe("vaelgMestLaest — højst én tråd", () => {
  it("vinderen er tråden med flest læsere", () => {
    expect(vaelgMestLaest([
      { traad_id: "a", laesere: 3 },
      { traad_id: "b", laesere: 7 },
      { traad_id: "c", laesere: 5 },
    ])).toBe("b");
  });

  it("tærsklen er 3: præcis 3 giver mærket, 2 gør ikke", () => {
    expect(MEST_LAEST_MINDST).toBe(3);
    expect(vaelgMestLaest([{ traad_id: "a", laesere: 3 }])).toBe("a");
    expect(vaelgMestLaest([{ traad_id: "a", laesere: 2 }, { traad_id: "b", laesere: 1 }])).toBeNull();
  });

  it("uafgjort på toppen giver INTET mærke — også når de er over tærsklen", () => {
    expect(vaelgMestLaest([{ traad_id: "a", laesere: 5 }, { traad_id: "b", laesere: 5 }])).toBeNull();
    expect(vaelgMestLaest([{ traad_id: "a", laesere: 5 }, { traad_id: "b", laesere: 5 }, { traad_id: "c", laesere: 6 }])).toBe("c");
  });

  it("uafgjort længere nede rører ikke vinderen", () => {
    expect(vaelgMestLaest([{ traad_id: "a", laesere: 9 }, { traad_id: "b", laesere: 4 }, { traad_id: "c", laesere: 4 }])).toBe("a");
  });

  it("rækkefølgen i svaret er ligegyldig", () => {
    const r = [{ traad_id: "a", laesere: 4 }, { traad_id: "b", laesere: 8 }, { traad_id: "c", laesere: 8 }];
    expect(vaelgMestLaest(r)).toBeNull();
    expect(vaelgMestLaest([...r].reverse())).toBeNull();
  });

  it("bigint som streng (PostgREST) tælles som tal", () => {
    expect(vaelgMestLaest([{ traad_id: "a", laesere: "4" }, { traad_id: "b", laesere: "10" }])).toBe("b");
  });

  it("samme id to gange er ikke uafgjort", () => {
    expect(vaelgMestLaest([{ traad_id: "a", laesere: 4 }, { traad_id: "a", laesere: 4 }])).toBe("a");
  });

  it("tomt, null, undefined og ugyldige rækker → null / ignoreres", () => {
    expect(vaelgMestLaest([])).toBeNull();
    expect(vaelgMestLaest(null)).toBeNull();
    expect(vaelgMestLaest(undefined)).toBeNull();
    expect(vaelgMestLaest([{ traad_id: "", laesere: 9 }, { traad_id: "b", laesere: "x" }, { traad_id: "c", laesere: 3 }])).toBe("c");
  });

  it("mærkets ord", () => {
    expect(MEST_LAEST_MAERKE).toBe("Mest læst denne uge");
  });
});

describe("nyttigtTekst — like-tallet som ord", () => {
  it("0 → intet tal", () => {
    expect(nyttigtTekst(0)).toBeNull();
  });
  it("1 → «1 fandt det nyttigt»", () => {
    expect(nyttigtTekst(1)).toBe("1 fandt det nyttigt");
  });
  it("N → «N fandt det nyttigt»", () => {
    expect(nyttigtTekst(4)).toBe("4 fandt det nyttigt");
    expect(nyttigtTekst(120)).toBe("120 fandt det nyttigt");
    expect(NYTTIGT_ORD).toBe("fandt det nyttigt");
  });
  it("ugyldige tal behandles som 0", () => {
    expect(nyttigtTekst(-1)).toBeNull();
    expect(nyttigtTekst(Number.NaN)).toBeNull();
    expect(nyttigtTekst(1.5)).toBeNull();
    expect(nyttigtTekst(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
