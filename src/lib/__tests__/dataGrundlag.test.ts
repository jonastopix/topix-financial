/** Motor-tests for dataGrundlag — faste data, alle fire seriemønstre:
    kun estimater, kun målinger, estimater først + målinger sidst, og en
    serie der skifter frem og tilbage. */
import { describe, expect, it } from "vitest";
import {
  erEstimat,
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
