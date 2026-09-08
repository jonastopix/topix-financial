import { describe, expect, it } from "vitest";
import type { Forsidensdom, Grund, Pukkellinje, Tilstandslinje } from "@/lib/forsidensDom";
import {
  filterOverskrift,
  laesGrundParam,
  listeLink,
  samletLinjeLink,
  virksomhederForGrund,
  virksomhedsLink,
} from "../forsideLinks";

// Mortens fejl 1 (8/9): linjen med de tolv førte til en liste med 27.
// Linket bygges nu af en ren funktion: ét selskab går direkte til
// virksomheden (virkede allerede), flere går til listen MED filtret.

const grund = (slags: Grund["slags"]): Grund =>
  ({ slags, signaltype: `${slags}_x`, tekst: "t", handling: "h", alvor: 50, lukkerOmDage: null, indsats: 2 }) as unknown as Grund;

const tilstand = (slags: Tilstandslinje["slags"], ids: string[]): Tilstandslinje => ({
  linje: "tilstand",
  slags,
  antal: ids.length,
  tekst: `${ids.length} virksomheder`,
  virksomheder: ids.map((id) => ({ companyId: id, navn: `V-${id}`, grund: grund(slags) })),
  alvor: 60,
  lukkerOmDage: null,
  loeftet: false,
  indsats: 2,
});

const pukkel = (ids: string[]): Pukkellinje => ({
  linje: "pukkel",
  slags: "agentforslag",
  antal: ids.length,
  tekst: `${ids.length} agentforslag venter`,
  virksomheder: ids.map((id, i) => ({ companyId: id, navn: `V-${id}`, antal: i + 1 })),
  alvor: 40,
  lukkerOmDage: null,
  loeftet: false,
  indsats: 1,
});

describe("samletLinjeLink — ét selskab direkte, flere til listen med filtret", () => {
  it("ét selskab: direkte til virksomheden med grunden (som før)", () => {
    expect(samletLinjeLink(tilstand("tavshed", ["a"]))).toBe("/virksomhed/a?grund=tavshed");
    expect(samletLinjeLink(pukkel(["a"]))).toBe("/virksomhed/a?grund=agentforslag");
    expect(virksomhedsLink("a", "fornyelse")).toBe("/virksomhed/a?grund=fornyelse");
  });

  it("flere selskaber: listen MED ?grund=<slags> — de tolv følger med", () => {
    const tolv = Array.from({ length: 12 }, (_, i) => `id${i}`);
    expect(samletLinjeLink(tilstand("tavshed", tolv))).toBe("/virksomheder?grund=tavshed");
    expect(samletLinjeLink(tilstand("fornyelse", ["a", "b"]))).toBe("/virksomheder?grund=fornyelse");
    expect(samletLinjeLink(tilstand("indgang", ["a", "b", "c"]))).toBe("/virksomheder?grund=indgang");
    expect(samletLinjeLink(pukkel(["a", "b"]))).toBe("/virksomheder?grund=agentforslag");
    expect(listeLink("tavshed")).toBe("/virksomheder?grund=tavshed");
  });

  it("URL'en bærer aldrig id'erne — kun slagsen, uanset antal", () => {
    const tyve = Array.from({ length: 20 }, (_, i) => `id${i}`);
    const link = samletLinjeLink(tilstand("tavshed", tyve));
    expect(link).toBe("/virksomheder?grund=tavshed");
    for (const id of tyve) expect(link).not.toContain(id);
  });

  it("nul selskaber (bør ikke ske): listen uden filter, som før", () => {
    expect(samletLinjeLink(tilstand("tavshed", []))).toBe("/virksomheder");
  });
});

describe("laesGrundParam — kun slags der kan blive en samlet linje", () => {
  it("de tre tilstande og puklen læses", () => {
    expect(laesGrundParam("tavshed")).toBe("tavshed");
    expect(laesGrundParam("fornyelse")).toBe("fornyelse");
    expect(laesGrundParam("indgang")).toBe("indgang");
    expect(laesGrundParam("agentforslag")).toBe("agentforslag");
  });

  it("hændelser, ukendt, tom og null → null (parameteren ignoreres)", () => {
    expect(laesGrundParam("stikker_ud")).toBeNull();
    expect(laesGrundParam("venter_i_samtalen")).toBeNull();
    expect(laesGrundParam("opgave_naer_deadline")).toBeNull();
    expect(laesGrundParam("hest")).toBeNull();
    expect(laesGrundParam("")).toBeNull();
    expect(laesGrundParam(null)).toBeNull();
    expect(laesGrundParam(undefined)).toBeNull();
  });
});

describe("virksomhederForGrund — de samme virksomheder som dommen bar", () => {
  const dom: Pick<Forsidensdom, "linjer" | "underStregen"> = {
    linjer: [tilstand("tavshed", ["t1", "t2", "t3"]), pukkel(["p1", "p2"])],
    underStregen: {
      antalVirksomhederUnderTaersklen: 0,
      antalTilstandeSamlet: 5,
      tilstande: [tilstand("fornyelse", ["f1", "f2"])],
      pukler: [],
    },
  };

  it("over stregen: tilstanden og puklen", () => {
    expect(virksomhederForGrund(dom, "tavshed")).toEqual({ ids: ["t1", "t2", "t3"], antalIDommen: 3 });
    expect(virksomhederForGrund(dom, "agentforslag")).toEqual({ ids: ["p1", "p2"], antalIDommen: 2 });
  });

  it("under stregen: tilstanden findes også dér", () => {
    expect(virksomhederForGrund(dom, "fornyelse")).toEqual({ ids: ["f1", "f2"], antalIDommen: 2 });
  });

  it("ingen samlet linje for slagsen → null", () => {
    expect(virksomhederForGrund(dom, "indgang")).toBeNull();
    expect(virksomhederForGrund({ linjer: [], underStregen: { ...dom.underStregen, tilstande: [] } }, "tavshed")).toBeNull();
  });
});

describe("filterOverskrift — listen siger hvad den viser, med forsidens ord", () => {
  it("tallet er det viste; ental og flertal", () => {
    expect(filterOverskrift("tavshed", 12, 12)).toBe("12 virksomheder du ikke har hørt fra længe");
    expect(filterOverskrift("tavshed", 1, 1)).toBe("1 virksomhed du ikke har hørt fra længe");
    expect(filterOverskrift("fornyelse", 2, 2)).toBe("2 virksomheder med en fornyelse der venter på dig");
    expect(filterOverskrift("indgang", 1, 1)).toBe("1 virksomhed med en indgang der ikke er betalt");
    expect(filterOverskrift("agentforslag", 3, 3)).toBe("3 virksomheder med agentforslag der venter på din afgørelse");
  });

  it("afviger listens tal fra dommens, står begge tal — aldrig ét tal alene og forkert", () => {
    expect(filterOverskrift("tavshed", 11, 12)).toBe("11 virksomheder du ikke har hørt fra længe (forsiden talte 12)");
    expect(filterOverskrift("tavshed", 0, 12)).toBe("0 virksomheder du ikke har hørt fra længe (forsiden talte 12)");
  });
});
