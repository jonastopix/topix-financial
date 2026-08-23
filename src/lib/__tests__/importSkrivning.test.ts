import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { laesMatrix } from "@/lib/importEngine";
import { byggGitter, saetMedtag, type Gitter } from "@/lib/importGitterModel";
import {
  byggSkriveplan,
  tolkKolonner,
  udledAar,
  type Skriveplan,
} from "@/lib/importSkrivning";
import { parseCsvTilMatrix } from "./csvTestHelper";
import { laesArkTilMatrix } from "./xlsxTestHelper";

// ───────────────────────── Byggeklodser ─────────────────────────

const gitter = (
  kolonner: string[],
  raekker: {
    raekkeIndex: number;
    etiket: string;
    vaerdier: (number | null)[];
    medtag?: boolean;
    sektion?: string | null;
  }[],
): Gitter => ({
  kolonner,
  raekker: raekker.map((r) => ({
    raekkeIndex: r.raekkeIndex,
    etiket: r.etiket,
    vaerdier: r.vaerdier,
    medtag: r.medtag ?? true,
    bemaerkning: null,
    kommentar: null,
    sektion: r.sektion ?? null,
    tabelIndex: 0,
  })),
  struktur: [],
  advarsler: [],
});

// ───────────────────────── tolkKolonner ─────────────────────────

describe("tolkKolonner", () => {
  it("genkender alle fem periodetyper", () => {
    const kolonner = tolkKolonner(["Januar", "Q2", "1. halvår", "Årstotal", "Kommentar"]);
    expect(kolonner.map((k) => k.type)).toEqual(["maaned", "kvartal", "halvaar", "aar", "ukendt"]);
    expect(kolonner[0].maaneder).toEqual([0]);
    expect(kolonner[1].maaneder).toEqual([3, 4, 5]);
    expect(kolonner[2].maaneder).toEqual([0, 1, 2, 3, 4, 5]);
    expect(kolonner[3].maaneder).toHaveLength(12);
    expect(kolonner[4].maaneder).toEqual([]);
  });

  it("måneds-interval: 'Jan-feb' dækker to måneder", () => {
    const [k] = tolkKolonner(["Jan-feb"]);
    expect(k.type).toBe("maaned");
    expect(k.maaneder).toEqual([0, 1]);
  });

  it("årsudledning: 'Januar-26' → 2026, 'FY2024 Actual H1' → 2024, uden år → null", () => {
    const kolonner = tolkKolonner(["Januar-26", "FY2024 Actual H1", "December", "Q3"]);
    expect(kolonner.map((k) => k.aar)).toEqual(["2026", "2024", null, null]);
    expect(kolonner[1].type).toBe("halvaar");
    expect(kolonner[1].maaneder).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("varianter: 'H2', '3. kvartal', 'I alt', 'Total', 'FY2024'", () => {
    const kolonner = tolkKolonner(["H2", "3. kvartal", "I alt", "Total", "FY2024"]);
    expect(kolonner.map((k) => k.type)).toEqual(["halvaar", "kvartal", "aar", "aar", "aar"]);
    expect(kolonner[0].maaneder).toEqual([6, 7, 8, 9, 10, 11]);
    expect(kolonner[1].maaneder).toEqual([6, 7, 8]);
    expect(kolonner[4].aar).toBe("2024");
  });
});

describe("udledAar", () => {
  it("alle distinkte år, sorteret", () => {
    expect(udledAar(tolkKolonner(["FY2027 Plan H1", "Januar-26", "Februar-26"]))).toEqual([
      "2026",
      "2027",
    ]);
  });

  it("tom liste når intet år kan udledes", () => {
    expect(udledAar(tolkKolonner(["Januar", "Februar", "Årstotal"]))).toEqual([]);
  });
});

// ───────────────────────── byggSkriveplan ─────────────────────────

describe("byggSkriveplan", () => {
  it("månedskolonner skrives direkte på deres månedsindeks", () => {
    const plan = byggSkriveplan(
      gitter(["Januar", "Marts"], [{ raekkeIndex: 0, etiket: "Løn", vaerdier: [100, 300] }]),
      "2026",
    );
    expect(plan.raekker).toHaveLength(1);
    expect(plan.raekker[0].maanedsbeloeb).toEqual([
      100, null, 300, null, null, null, null, null, null, null, null, null,
    ]);
    expect(plan.raekker[0].fordelinger).toEqual([]);
  });

  it("kvartal fordeles ligeligt på tre måneder og registreres", () => {
    const plan = byggSkriveplan(
      gitter(["Q1"], [{ raekkeIndex: 0, etiket: "Husleje", vaerdier: [3000] }]),
      "2026",
    );
    expect(plan.raekker[0].maanedsbeloeb.slice(0, 3)).toEqual([1000, 1000, 1000]);
    expect(plan.raekker[0].fordelinger).toEqual([
      { kolonne: 0, kolonnenavn: "Q1", maaneder: [0, 1, 2], beloebPrMaaned: 1000 },
    ]);
    expect(plan.advarsler.some((a) => a.includes("fordelt ligeligt"))).toBe(true);
  });

  it("halvår fordeles på seks måneder; 'Jan-feb' på to", () => {
    const plan = byggSkriveplan(
      gitter(["H1", "Jan-feb"], [{ raekkeIndex: 0, etiket: "Løn", vaerdier: [600, 200] }]),
      "2026",
    );
    const r = plan.raekker[0];
    // H1: 100 pr. måned jan-jun; Jan-feb: +100 pr. måned jan-feb.
    expect(r.maanedsbeloeb.slice(0, 6)).toEqual([200, 200, 100, 100, 100, 100]);
    expect(r.fordelinger.map((f) => [f.kolonnenavn, f.beloebPrMaaned])).toEqual([
      ["H1", 100],
      ["Jan-feb", 100],
    ]);
  });

  it("årstotal bruges KUN når rækken ingen månedsdækning har", () => {
    const plan = byggSkriveplan(
      gitter(
        ["Januar", "Årstotal"],
        [
          { raekkeIndex: 0, etiket: "Med måneder", vaerdier: [100, 9999] },
          { raekkeIndex: 1, etiket: "Kun årstotal", vaerdier: [null, 1200] },
        ],
      ),
      "2026",
    );
    const medMaaneder = plan.raekker[0];
    expect(medMaaneder.maanedsbeloeb[0]).toBe(100);
    expect(medMaaneder.maanedsbeloeb.slice(1)).toEqual(Array(11).fill(null)); // 9999 ikke brugt
    expect(plan.sprungetOverKolonner).toContain("Årstotal");
    expect(plan.utolkedeKolonner).toEqual([]);

    const kunAar = plan.raekker[1];
    expect(kunAar.maanedsbeloeb).toEqual(Array(12).fill(100)); // 1200/12
    expect(kunAar.fordelinger[0]).toMatchObject({ kolonnenavn: "Årstotal", beloebPrMaaned: 100 });
  });

  it("ukendte kolonner ignoreres og registreres i utolkedeKolonner", () => {
    const plan = byggSkriveplan(
      gitter(["Januar", "Kommentar"], [{ raekkeIndex: 0, etiket: "Løn", vaerdier: [100, 555] }]),
      "2026",
    );
    expect(plan.raekker[0].maanedsbeloeb[0]).toBe(100);
    expect(plan.raekker[0].maanedsbeloeb.filter((v) => v !== null)).toEqual([100]);
    expect(plan.utolkedeKolonner).toContain("Kommentar");
    expect(plan.sprungetOverKolonner).toEqual([]);
  });

  it("årsfilter: kun kolonner med det valgte år når år kan udledes", () => {
    const plan = byggSkriveplan(
      gitter(
        ["Januar-25", "Januar-26"],
        [{ raekkeIndex: 0, etiket: "Løn", vaerdier: [111, 222] }],
      ),
      "2026",
    );
    expect(plan.raekker[0].maanedsbeloeb[0]).toBe(222);
    expect(plan.sprungetOverKolonner).toContain("Januar-25");
  });

  it("gruppen sættes fra gitterrækkens sektion", () => {
    const plan = byggSkriveplan(
      gitter(
        ["Januar"],
        [
          { raekkeIndex: 0, etiket: "Løn", vaerdier: [100], sektion: "Personale & konsulentydelser" },
          { raekkeIndex: 1, etiket: "Uden sektion", vaerdier: [200] },
        ],
      ),
      "2026",
    );
    expect(plan.raekker.map((r) => r.gruppe)).toEqual(["Personale & konsulentydelser", null]);
  });

  it("nøgler er unikke selv når to rækker har samme etiket", () => {
    const plan = byggSkriveplan(
      gitter(
        ["Januar"],
        [
          { raekkeIndex: 17, etiket: "Forsikring", vaerdier: [100] },
          { raekkeIndex: 39, etiket: "Forsikring", vaerdier: [200] },
        ],
      ),
      "2026",
    );
    expect(plan.raekker.map((r) => r.noegle)).toEqual([
      "import_forsikring_17",
      "import_forsikring_39",
    ]);
  });

  it("fravalgte rækker udelades; rækker uden tal udelades med advarsel", () => {
    const plan = byggSkriveplan(
      gitter(
        ["Januar"],
        [
          { raekkeIndex: 0, etiket: "Med", vaerdier: [100] },
          { raekkeIndex: 1, etiket: "Fravalgt", vaerdier: [200], medtag: false },
          { raekkeIndex: 2, etiket: "Tom", vaerdier: [null] },
        ],
      ),
      "2026",
    );
    expect(plan.raekker.map((r) => r.etiket)).toEqual(["Med"]);
    expect(plan.advarsler.some((a) => a.includes("uden tal blev udeladt"))).toBe(true);
  });

  it("dansk etiket giver læsbar snake_case-nøgle, trunkeret til 40 tegn", () => {
    const plan = byggSkriveplan(
      gitter(
        ["Januar"],
        [
          {
            raekkeIndex: 3,
            etiket: "Økonomi, administration & forsikring — meget lang etiket her",
            vaerdier: [1],
          },
        ],
      ),
      "2026",
    );
    const [noegle] = plan.raekker.map((r) => r.noegle);
    expect(noegle.startsWith("import_oekonomi_administration_forsikring")).toBe(true);
    expect(noegle.endsWith("_3")).toBe(true);
    expect(noegle.length).toBeLessThanOrEqual("import_".length + 40 + "_3".length);
  });
});

// ───────────────────────── Golden: alle syv fixtures ─────────────────────────

/**
 * GOLDEN: skriveplanen for alle syv fixtures (verificeret 2026-08-23).
 * Fastholder antal rækker, nøgle-unikhed, hvilke kolonner der blev fordelt,
 * og hvilke der ikke blev brugt. Ændrer tallene sig, har kolonnetolkningen
 * eller planbygningen ændret adfærd på rigtige filer.
 */
describe("golden: skriveplaner for de syv fixtures", () => {
  const FIX = path.resolve(__dirname, "../__fixtures__");

  const planAf = (gitterInput: Gitter, aar: string) => {
    const plan = byggSkriveplan(gitterInput, aar);
    const fordelteKolonner = [
      ...new Set(plan.raekker.flatMap((r) => r.fordelinger.map((f) => f.kolonnenavn))),
    ];
    const noeglerUnikke = new Set(plan.raekker.map((r) => r.noegle)).size === plan.raekker.length;
    return { plan, fordelteKolonner, noeglerUnikke };
  };

  const fastlaas = (
    plan: Skriveplan,
    fordelteKolonner: string[],
    noeglerUnikke: boolean,
    forventet: { raekker: number; fordelte: string[]; utolkede: string[]; sprungetOver: string[] },
  ) => {
    expect(plan.raekker).toHaveLength(forventet.raekker);
    expect(noeglerUnikke).toBe(true);
    expect(fordelteKolonner).toEqual(forventet.fordelte);
    expect(plan.utolkedeKolonner).toEqual(forventet.utolkede);
    expect(plan.sprungetOverKolonner).toEqual(forventet.sprungetOver);
  };

  it("Remm-budget (CSV): 62 rækker; Årstotal fordelt for KPI-rækkerne og ubrugt for månedsrækkerne", () => {
    const g = byggGitter(
      laesMatrix(parseCsvTilMatrix(fs.readFileSync(`${FIX}/remm-budget-base-2026.csv`, "utf-8"))),
    );
    const { plan, fordelteKolonner, noeglerUnikke } = planAf(g, "2026");
    fastlaas(plan, fordelteKolonner, noeglerUnikke, {
      raekker: 62, // 63 medtagne minus "Blended ROAS" (ingen tal)
      fordelte: ["Årstotal"],
      utolkede: [],
      sprungetOver: ["Årstotal"], // brugt for KPI-rækkerne, sprunget over for månedsrækkerne
    });
    expect(plan.advarsler.some((a) => a.includes("uden tal blev udeladt"))).toBe(true);
  });

  it("Topix Budget2026 (XLSX): 32 rækker, intet fordelt, Årstotal uden år filtreres fra", () => {
    const g = byggGitter(laesMatrix(laesArkTilMatrix(`${FIX}/topix-budget-2026.xlsx`, "Budget2026")));
    const { plan, fordelteKolonner, noeglerUnikke } = planAf(g, "2026");
    fastlaas(plan, fordelteKolonner, noeglerUnikke, {
      raekker: 32,
      fordelte: [],
      utolkede: [],
      sprungetOver: ["Årstotal"], // intet år på kolonnen, månederne bærer -26
    });
  });

  it("robusthed 01 (kvartaler): 11 rækker, Q1-Q4 fordelt, Total ubrugt", () => {
    const g = byggGitter(
      laesMatrix(laesArkTilMatrix(`${FIX}/robusthed/01-kvartal-positive-omkostninger.xlsx`, "Budget")),
    );
    const { plan, fordelteKolonner, noeglerUnikke } = planAf(g, "2026");
    fastlaas(plan, fordelteKolonner, noeglerUnikke, {
      raekker: 11,
      fordelte: ["Q1", "Q2", "Q3", "Q4"],
      utolkede: [],
      sprungetOver: ["Total"],
    });
  });

  it("robusthed 02 (transponeret): tom plan — alle kolonner ukendte, alle linjer uden tal", () => {
    const g = byggGitter(
      laesMatrix(laesArkTilMatrix(`${FIX}/robusthed/02-transponeret.xlsx`, "Budget 2026")),
    );
    const { plan, fordelteKolonner, noeglerUnikke } = planAf(g, "2026");
    fastlaas(plan, fordelteKolonner, noeglerUnikke, {
      raekker: 0,
      fordelte: [],
      utolkede: ["Omsætning", "Varekøb", "Løn", "Husleje", "Øvrigt", "Resultat"],
      sprungetOver: [],
    });
    expect(plan.advarsler).toEqual([
      "Ingen af kolonnerne kunne læses som en periode. Tjek at månederne står som kolonner.",
    ]);
  });

  it("robusthed 03 (intervaller): 8 rækker, alle seks intervalkolonner fordelt", () => {
    const g = byggGitter(
      laesMatrix(laesArkTilMatrix(`${FIX}/robusthed/03-flettede-total-oeverst.xlsx`, "Resultatbudget")),
    );
    const { plan, fordelteKolonner, noeglerUnikke } = planAf(g, "2026");
    fastlaas(plan, fordelteKolonner, noeglerUnikke, {
      raekker: 8,
      fordelte: ["Jan-feb", "Mar-apr", "Maj-jun", "Jul-aug", "Sep-okt", "Nov-dec"],
      utolkede: [],
      sprungetOver: [],
    });
  });

  it("robusthed 04 (semikolon-dansk): 11 rækker, ren månedsskrivning", () => {
    const g = byggGitter(
      laesMatrix(parseCsvTilMatrix(fs.readFileSync(`${FIX}/robusthed/04-semikolon-dansk.csv`, "utf-8"), ";")),
    );
    const { plan, fordelteKolonner, noeglerUnikke } = planAf(g, "2026");
    fastlaas(plan, fordelteKolonner, noeglerUnikke, {
      raekker: 11,
      fordelte: [],
      utolkede: [],
      sprungetOver: [],
    });
    expect(plan.advarsler).toEqual([]);
  });

  it("robusthed 05 (fire år): kun FY2026-kolonnerne skrives, de øvrige seks år-kolonner ubrugte", () => {
    const g = byggGitter(
      laesMatrix(laesArkTilMatrix(`${FIX}/robusthed/05-engelsk-fire-aar.xlsx`, "Consolidated")),
    );
    const { plan, fordelteKolonner, noeglerUnikke } = planAf(g, "2026");
    fastlaas(plan, fordelteKolonner, noeglerUnikke, {
      raekker: 6,
      fordelte: ["FY2026 Plan H1", "FY2026 Plan H2"],
      utolkede: [],
      sprungetOver: [
        "FY2024 Actual H1",
        "FY2024 Actual H2",
        "FY2025 Budget H1",
        "FY2025 Budget H2",
        "FY2027 Plan H1",
        "FY2027 Plan H2",
      ],
    });
  });

  it("fravalg slår igennem i planen (Remm: fravælg én række → 61)", () => {
    const g = byggGitter(
      laesMatrix(parseCsvTilMatrix(fs.readFileSync(`${FIX}/remm-budget-base-2026.csv`, "utf-8"))),
    );
    const foerste = g.raekker[0].raekkeIndex;
    const { plan } = planAf(saetMedtag(g, foerste, false), "2026");
    expect(plan.raekker).toHaveLength(61);
  });
});
