/** Motor-tests for dataGrundlag — faste data, alle fire seriemønstre:
    kun estimater, kun målinger, estimater først + målinger sidst, og en
    serie der skifter frem og tilbage. */
import { describe, expect, it } from "vitest";
import {
  basisNoegle,
  delSerieTilTegning,
  erEstimat,
  erEstimatNoegle,
  ESTIMAT_NOEGLE_SUFFIX,
  kunMaalinger,
  momErGyldig,
  opgoerGrundlag,
  segmenterSerie,
  type DataBasis,
} from "@/lib/dataGrundlag";

const p = (data_basis: DataBasis, id: number) => ({ data_basis, id });

const KUN_ESTIMATER = [p("estimated", 1), p("estimated", 2), p("estimated", 3)];
const KUN_MAALINGER = [p("measured", 1), p("measured", 2), p("measured", 3)];
/** Topix-formen: årsrapport-året først, rigtige måneder sidst. */
const ESTIMAT_FOERST = [
  p("estimated", 1),
  p("estimated", 2),
  p("measured", 3),
  p("measured", 4),
];
/** Skiftende: måling, estimat, måling, estimat. */
const SKIFTENDE = [
  p("measured", 1),
  p("estimated", 2),
  p("estimated", 3),
  p("measured", 4),
  p("estimated", 5),
];

describe("erEstimat / kunMaalinger", () => {
  it("dømmer pr. række", () => {
    expect(erEstimat(p("estimated", 1))).toBe(true);
    expect(erEstimat(p("measured", 1))).toBe(false);
  });

  it("kunMaalinger bevarer orden og kun målte rækker", () => {
    expect(kunMaalinger(KUN_ESTIMATER)).toEqual([]);
    expect(kunMaalinger(KUN_MAALINGER).map((x) => x.id)).toEqual([1, 2, 3]);
    expect(kunMaalinger(ESTIMAT_FOERST).map((x) => x.id)).toEqual([3, 4]);
    expect(kunMaalinger(SKIFTENDE).map((x) => x.id)).toEqual([1, 4]);
  });
});

describe("opgoerGrundlag", () => {
  it("tæller målte, estimerede og samlet", () => {
    expect(opgoerGrundlag([])).toEqual({ maalte: 0, estimerede: 0, samlet: 0 });
    expect(opgoerGrundlag(KUN_ESTIMATER)).toEqual({ maalte: 0, estimerede: 3, samlet: 3 });
    expect(opgoerGrundlag(KUN_MAALINGER)).toEqual({ maalte: 3, estimerede: 0, samlet: 3 });
    expect(opgoerGrundlag(ESTIMAT_FOERST)).toEqual({ maalte: 2, estimerede: 2, samlet: 4 });
    expect(opgoerGrundlag(SKIFTENDE)).toEqual({ maalte: 2, estimerede: 3, samlet: 5 });
  });
});

describe("momErGyldig", () => {
  it("falsk under to punkter", () => {
    expect(momErGyldig([])).toBe(false);
    expect(momErGyldig([p("measured", 1)])).toBe(false);
  });

  it("sand kun når begge de to sidste er målinger", () => {
    expect(momErGyldig(KUN_MAALINGER)).toBe(true);
    expect(momErGyldig(KUN_ESTIMATER)).toBe(false);
    // Estimater først, to målinger sidst → gyldig (Topix juni 2026-formen).
    expect(momErGyldig(ESTIMAT_FOERST)).toBe(true);
    // Sidste punkt er estimat → ugyldig uanset resten.
    expect(momErGyldig(SKIFTENDE)).toBe(false);
    // Måling sidst men estimat næstsidst (januar 2026-formen) → ugyldig.
    expect(momErGyldig([p("measured", 1), p("estimated", 2), p("measured", 3)])).toBe(false);
  });
});

describe("segmenterSerie", () => {
  it("tom serie → ingen segmenter", () => {
    expect(segmenterSerie([])).toEqual([]);
  });

  it("ensartede serier → ét segment", () => {
    const kunE = segmenterSerie(KUN_ESTIMATER);
    expect(kunE).toHaveLength(1);
    expect(kunE[0].basis).toBe("estimated");
    expect(kunE[0].punkter.map((x) => x.id)).toEqual([1, 2, 3]);

    const kunM = segmenterSerie(KUN_MAALINGER);
    expect(kunM).toHaveLength(1);
    expect(kunM[0].basis).toBe("measured");
  });

  it("estimater først, målinger sidst → to segmenter i orden", () => {
    const seg = segmenterSerie(ESTIMAT_FOERST);
    expect(seg.map((s) => s.basis)).toEqual(["estimated", "measured"]);
    expect(seg[0].punkter.map((x) => x.id)).toEqual([1, 2]);
    expect(seg[1].punkter.map((x) => x.id)).toEqual([3, 4]);
  });

  it("skiftende serie → segment pr. skift, ingen dublerede punkter", () => {
    const seg = segmenterSerie(SKIFTENDE);
    expect(seg.map((s) => s.basis)).toEqual([
      "measured",
      "estimated",
      "measured",
      "estimated",
    ]);
    expect(seg.map((s) => s.punkter.map((x) => x.id))).toEqual([[1], [2, 3], [4], [5]]);
    // Summen af segmentpunkter = seriens længde — intet tabt, intet dubleret.
    expect(seg.reduce((n, s) => n + s.punkter.length, 0)).toBe(SKIFTENDE.length);
  });
});

describe("delSerieTilTegning", () => {
  const v = (data_basis: DataBasis, vaerdi: number | null, label: string) => ({
    data_basis,
    vaerdi,
    label,
  });
  const NOEGLER = ["vaerdi"] as const;
  const EST = `vaerdi${ESTIMAT_NOEGLE_SUFFIX}`;

  /** Invariant: intet visuelt hul, ingen dobbelttegning. For hvert nabopar
      med værdi i begge originale punkter skal PRÆCIS én af de to nøgler
      have værdi i begge delte punkter. */
  const verificerStraekninger = (
    original: { vaerdi: number | null }[],
    delt: Record<string, number | null>[],
  ) => {
    for (let i = 0; i < original.length - 1; i++) {
      if (original[i].vaerdi == null || original[i + 1].vaerdi == null) continue;
      const maaltTegner = delt[i].vaerdi != null && delt[i + 1].vaerdi != null;
      const estimatTegner = delt[i][EST] != null && delt[i + 1][EST] != null;
      expect(maaltTegner || estimatTegner, `strækning ${i}→${i + 1} har hul`).toBe(true);
      expect(maaltTegner && estimatTegner, `strækning ${i}→${i + 1} dobbelttegnes`).toBe(false);
    }
  };

  it("tom serie og ét enkelt punkt", () => {
    expect(delSerieTilTegning([], NOEGLER)).toEqual([]);
    const enkeltMaalt = delSerieTilTegning([v("measured", 10, "a")], NOEGLER);
    expect(enkeltMaalt[0].vaerdi).toBe(10);
    expect(enkeltMaalt[0][EST]).toBeNull();
    const enkeltEstimat = delSerieTilTegning([v("estimated", 10, "a")], NOEGLER);
    expect(enkeltEstimat[0].vaerdi).toBeNull();
    expect(enkeltEstimat[0][EST]).toBe(10);
  });

  it("kun målt: alt i den målte nøgle, estimatnøglen tom", () => {
    const serie = [v("measured", 1, "a"), v("measured", 2, "b"), v("measured", 3, "c")];
    const delt = delSerieTilTegning(serie, NOEGLER);
    expect(delt.map((p) => p.vaerdi)).toEqual([1, 2, 3]);
    expect(delt.map((p) => p[EST])).toEqual([null, null, null]);
    verificerStraekninger(serie, delt);
  });

  it("kun estimat: alt i estimatnøglen, den målte tom", () => {
    const serie = [v("estimated", 1, "a"), v("estimated", 2, "b")];
    const delt = delSerieTilTegning(serie, NOEGLER);
    expect(delt.map((p) => p.vaerdi)).toEqual([null, null]);
    expect(delt.map((p) => p[EST])).toEqual([1, 2]);
    verificerStraekninger(serie, delt);
  });

  it("ét skift (Topix-formen: 6 estimater, så 6 målinger) — grænsepunktet bærer begge", () => {
    const serie = [
      ...Array.from({ length: 6 }, (_, i) => v("estimated", 48, `e${i}`)),
      ...Array.from({ length: 6 }, (_, i) => v("measured", 100 + i, `m${i}`)),
    ];
    const delt = delSerieTilTegning(serie, NOEGLER);
    // Grænsepunktet = første målte punkt (jan 2026): værdi i BEGGE nøgler.
    expect(delt[6].vaerdi).toBe(100);
    expect(delt[6][EST]).toBe(100);
    // Estimatlinjen slutter i grænsepunktet; indre målte punkter er rene.
    expect(delt[7][EST]).toBeNull();
    expect(delt[5].vaerdi).toBeNull();
    expect(delt[5][EST]).toBe(48);
    verificerStraekninger(serie, delt);
  });

  it("flere skift frem og tilbage (m-e-e-m-e) — hver grænse i begge nøgler, ingen huller", () => {
    const serie = [
      v("measured", 1, "m1"),
      v("estimated", 2, "e2"),
      v("estimated", 3, "e3"),
      v("measured", 4, "m4"),
      v("estimated", 5, "e5"),
    ];
    const delt = delSerieTilTegning(serie, NOEGLER);
    // m1 og m4 er grænsepunkter (estimat-naboer): begge nøgler.
    expect([delt[0].vaerdi, delt[0][EST]]).toEqual([1, 1]);
    expect([delt[3].vaerdi, delt[3][EST]]).toEqual([4, 4]);
    // Estimatpunkter bærer aldrig den målte nøgle.
    expect(delt[1].vaerdi).toBeNull();
    expect(delt[4].vaerdi).toBeNull();
    verificerStraekninger(serie, delt);
  });

  it("reelt manglende værdi forbliver null i begge nøgler (ærligt hul)", () => {
    const serie = [v("measured", 1, "a"), v("measured", null, "b"), v("measured", 3, "c")];
    const delt = delSerieTilTegning(serie, NOEGLER);
    expect(delt[1].vaerdi).toBeNull();
    expect(delt[1][EST]).toBeNull();
  });

  it("bevarer øvrige felter, muterer ikke input, håndterer flere nøgler", () => {
    const serie = [
      { data_basis: "estimated" as DataBasis, a: 1, b: 10, label: "x" },
      { data_basis: "measured" as DataBasis, a: 2, b: 20, label: "y" },
    ];
    const kopi = JSON.parse(JSON.stringify(serie));
    const delt = delSerieTilTegning(serie, ["a", "b"]);
    expect(serie).toEqual(kopi);
    expect(delt[0].label).toBe("x");
    expect(delt[0].data_basis).toBe("estimated");
    expect(delt[1][`a${ESTIMAT_NOEGLE_SUFFIX}`]).toBe(2); // grænsepunkt
    expect(delt[1][`b${ESTIMAT_NOEGLE_SUFFIX}`]).toBe(20);
  });

  it("nøgle-hjælperne runder tur-retur", () => {
    expect(erEstimatNoegle(`omsaetning${ESTIMAT_NOEGLE_SUFFIX}`)).toBe(true);
    expect(erEstimatNoegle("omsaetning")).toBe(false);
    expect(basisNoegle(`omsaetning${ESTIMAT_NOEGLE_SUFFIX}`)).toBe("omsaetning");
    expect(basisNoegle("omsaetning")).toBe("omsaetning");
  });
});
