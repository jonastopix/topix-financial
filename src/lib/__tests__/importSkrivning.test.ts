import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { laesMatrix } from "@/lib/importEngine";
import {
  byggGitter,
  GYLDIGE_GRUPPER,
  normaliseretVaerdi,
  saetMedtag,
  saetRaekkegruppe,
  saetSektionsgruppe,
  saetSektionUdeladt,
  type Gitter,
} from "@/lib/importGitterModel";
import {
  byggSkriveplan,
  byggSkriveplanInserts,
  tolkKolonner,
  udledAar,
  type Skriveplan,
} from "@/lib/importSkrivning";
import { parseCsvTilMatrix } from "@/lib/csvLaesning";
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
    gruppe: null,
    tabelIndex: 0,
  })),
  struktur: [],
  // Tomt valg-kort: byggSkriveplan falder tilbage til gruppeForslag.
  sektionsGrupper: {},
  udeladteSektioner: {},
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

  it("årstotal med årssuffiks: 'I alt 2026' og 'Total 2026' er aar-kolonner der bærer året", () => {
    const kolonner = tolkKolonner(["I alt 2026", "Total 2026"]);
    expect(kolonner.map((k) => k.type)).toEqual(["aar", "aar"]);
    expect(kolonner.map((k) => k.aar)).toEqual(["2026", "2026"]);
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

  it("årsfilter: kun kolonner med det valgte år når år kan udledes — aarsskift er null", () => {
    const plan = byggSkriveplan(
      gitter(
        ["Januar-25", "Januar-26"],
        [{ raekkeIndex: 0, etiket: "Løn", vaerdier: [111, 222] }],
      ),
      "2026",
    );
    expect(plan.raekker[0].maanedsbeloeb[0]).toBe(222);
    expect(plan.sprungetOverKolonner).toContain("Januar-25");
    expect(plan.aarsskift).toBeNull();
    expect(plan.advarsler.some((a) => a.startsWith("Kolonnerne i filen er fra"))).toBe(false);
  });

  it("årsskift: matcher INGEN kolonner det valgte år, bruges filens år alligevel (P1)", () => {
    const plan = byggSkriveplan(
      gitter(
        ["Januar-25", "Februar-25"],
        [{ raekkeIndex: 0, etiket: "Løn", vaerdier: [111, 222] }],
      ),
      "2026",
    );
    expect(plan.raekker).toHaveLength(1);
    expect(plan.raekker[0].maanedsbeloeb.slice(0, 2)).toEqual([111, 222]);
    expect(plan.aarsskift).toEqual({ fra: "2025", til: "2026" });
    expect(plan.advarsler).toContain(
      "Kolonnerne i filen er fra 2025. Tallene skrives til budget 2026 — tjek at det er det du vil.",
    );
    expect(plan.sprungetOverKolonner).toEqual([]);
  });

  it("årsskift: året med FLEST kolonner vinder når flere år findes", () => {
    const plan = byggSkriveplan(
      gitter(
        ["Januar-24", "Januar-25", "Februar-25"],
        [{ raekkeIndex: 0, etiket: "Løn", vaerdier: [1, 111, 222] }],
      ),
      "2027",
    );
    expect(plan.aarsskift).toEqual({ fra: "2025", til: "2027" });
    expect(plan.raekker[0].maanedsbeloeb.slice(0, 2)).toEqual([111, 222]);
    expect(plan.sprungetOverKolonner).toContain("Januar-24");
  });

  it("årsfilter: kolonner UDEN udledt år hører til det effektive år — måneder uden suffiks overlever", () => {
    // Filens virkelighed i Topix-resultatbudgettet: kun totalkolonnen bærer
    // årstallet. Månederne må ikke tabes til årsfilteret.
    const plan = byggSkriveplan(
      gitter(
        ["Januar", "I alt 2026"],
        [{ raekkeIndex: 0, etiket: "Løn", vaerdier: [100, 1200] }],
      ),
      "2026",
    );
    expect(plan.raekker[0].maanedsbeloeb[0]).toBe(100);
    expect(plan.aarsskift).toBeNull();
    // Årstotalen bruges ikke (månedsdækning findes) men er tolket, ikke ukendt.
    expect(plan.sprungetOverKolonner).toEqual(["I alt 2026"]);
    expect(plan.utolkedeKolonner).toEqual([]);
  });

  it("fil uden udledbart år: uændret adfærd, aarsskift null", () => {
    const plan = byggSkriveplan(
      gitter(["Januar", "Februar"], [{ raekkeIndex: 0, etiket: "Løn", vaerdier: [1, 2] }]),
      "2026",
    );
    expect(plan.raekker).toHaveLength(1);
    expect(plan.aarsskift).toBeNull();
  });

  it("gruppen OPLØSES til en gruppenøgle — forslag fra sektionsnavnet, drift uden sektion", () => {
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
    expect(plan.raekker.map((r) => r.gruppe)).toEqual(["personale", "drift"]);
    expect(plan.grupper).toEqual([
      { sektion: "Personale & konsulentydelser", gruppe: "personale" },
      { sektion: null, gruppe: "drift" },
    ]);
  });

  it("linjens egen gruppe vinder over sektionens valg i planen (spor 3)", () => {
    const g0 = byggGitter(
      laesMatrix([
        ["Post", "Januar"],
        ["OMKOSTNINGER", null],
        ["Personale", 100],
        ["Software & It", 50],
      ]),
    );
    const plan = byggSkriveplan(g0, "2026");
    expect(plan.raekker.map((r) => [r.etiket, r.gruppe])).toEqual([
      ["Personale", "personale"], // linjegæt vinder over sektionens drift
      ["Software & It", "drift"], // intet linjegæt → sektionens fallback
    ]);
    // ...og medlemmets linje-overstyring vinder over begge.
    const plan2 = byggSkriveplan(saetRaekkegruppe(g0, 3, "faste"), "2026");
    expect(plan2.raekker.find((r) => r.etiket === "Software & It")!.gruppe).toBe("faste");
  });

  it("medlemmets gruppevalg i gitteret vinder over forslaget", () => {
    const g0 = byggGitter(
      laesMatrix([
        ["Post", "Januar"],
        ["Shop & IT", null],
        ["Shopify", 100],
        ["Hosting", 50],
      ]),
    );
    expect(g0.sektionsGrupper["Shop & IT"]).toBe("drift"); // forslaget
    const plan = byggSkriveplan(saetSektionsgruppe(g0, "Shop & IT", "faste"), "2026");
    expect(plan.raekker.map((r) => r.gruppe)).toEqual(["faste", "faste"]);
  });

  it("'Ikke et budgetbeløb': sektionens rækker når hverken planen eller __group__-markørerne", () => {
    const g0 = byggGitter(
      laesMatrix([
        ["Post", "Januar"],
        ["Omsætning", null],
        ["Salg", 100],
        ["Nøgletal", null],
        ["MRR", 43031],
        ["ARR", 516367],
      ]),
    );
    // Forvalget har allerede udeladt Nøgletal — planen bekræfter det.
    const plan = byggSkriveplan(g0, "2026");
    expect(plan.raekker.map((r) => r.etiket)).toEqual(["Salg"]);
    expect(plan.grupper).toEqual([{ sektion: "Omsætning", gruppe: "indtaegter" }]);
    const inserts = byggSkriveplanInserts({ userId: "u", companyId: "c", plan });
    const groupMarkoerer = inserts.filter((i) => i.category.startsWith("__group__"));
    expect(groupMarkoerer).toHaveLength(1);
    // Markørens period er en gruppenøgle — aldrig "Ikke et budgetbeløb"
    // eller noget andet uden for de seks.
    expect(GYLDIGE_GRUPPER).toContain(groupMarkoerer[0].period as (typeof GYLDIGE_GRUPPER)[number]);
    expect(inserts.some((i) => i.category.includes("mrr") || i.category.includes("arr"))).toBe(false);

    // Og den anden vej: udelades Omsætning også, er planen tom.
    const tomPlan = byggSkriveplan(saetSektionUdeladt(g0, "Omsætning", true), "2026");
    expect(tomPlan.raekker).toEqual([]);
    expect(byggSkriveplanInserts({ userId: "u", companyId: "c", plan: tomPlan })).toEqual([]);
  });

  it("fortegns-normalisering: omkostninger skrives som absolutværdi, indtægter beholder fortegn", () => {
    const plan = byggSkriveplan(
      byggGitter(
        laesMatrix([
          ["Post", "Januar"],
          ["Omsætning", null],
          ["B2C Salg", -500], // negativ omsætning er information — bevares
          ["Medarbejdere", null],
          ["Løn", -200],
        ]),
      ),
      "2026",
    );
    const salg = plan.raekker.find((r) => r.etiket === "B2C Salg")!;
    const loen = plan.raekker.find((r) => r.etiket === "Løn")!;
    expect(salg.gruppe).toBe("indtaegter");
    expect(salg.maanedsbeloeb[0]).toBe(-500);
    expect(loen.gruppe).toBe("personale");
    expect(loen.maanedsbeloeb[0]).toBe(200);
  });

  it("fortegns-normalisering gælder også fordelinger", () => {
    const plan = byggSkriveplan(
      byggGitter(
        laesMatrix([
          ["Post", "Q1"],
          ["Lokaler", null],
          ["Husleje", -3000],
          ["El", -600],
        ]),
      ),
      "2026",
    );
    const husleje = plan.raekker.find((r) => r.etiket === "Husleje")!;
    expect(husleje.gruppe).toBe("faste");
    expect(husleje.maanedsbeloeb.slice(0, 3)).toEqual([1000, 1000, 1000]);
    expect(husleje.fordelinger[0].beloebPrMaaned).toBe(1000);
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
    // __group__-markørerne bærer raekke.gruppe verbatim — den SKAL altid
    // være en af platformens seks nøgler, for alle fixtures.
    for (const raekke of plan.raekker) {
      expect(GYLDIGE_GRUPPER, `${raekke.noegle}: ${raekke.gruppe}`).toContain(raekke.gruppe);
    }
  };

  it("Remm-budget (CSV): 54 rækker (8 dobbelttællings-rækker fravalgt); Årstotal fordelt for KPI-rækkerne og ubrugt for månedsrækkerne", () => {
    const g = byggGitter(
      laesMatrix(parseCsvTilMatrix(fs.readFileSync(`${FIX}/remm-budget-base-2026.csv`, "utf-8"))),
    );
    const { plan, fordelteKolonner, noeglerUnikke } = planAf(g, "2026");
    fastlaas(plan, fordelteKolonner, noeglerUnikke, {
      raekker: 54, // 63 minus ROAS (ingen tal) minus de 8 auto-fravalgte dobbelttællinger
      fordelte: ["Årstotal"],
      utolkede: [],
      sprungetOver: ["Årstotal"], // brugt for KPI-rækkerne, sprunget over for månedsrækkerne
    });
    expect(plan.advarsler.some((a) => a.includes("uden tal blev udeladt"))).toBe(true);
  });

  it("Topix Budget2026 (XLSX): 29 rækker ('Resultat' og de to margins fravalgt), intet fordelt", () => {
    const g = byggGitter(laesMatrix(laesArkTilMatrix(`${FIX}/topix-budget-2026.xlsx`, "Budget2026")));
    const { plan, fordelteKolonner, noeglerUnikke } = planAf(g, "2026");
    fastlaas(plan, fordelteKolonner, noeglerUnikke, {
      // FLYTTET 2026-08-24 (fra 31): Bruttomargin/Nettomargin er forholdstal
      // og fravælges nu i byggGitter — de blev før holdt ude af gitterets
      // sum men alligevel skrevet.
      raekker: 29,
      fordelte: [],
      utolkede: [],
      sprungetOver: ["Årstotal"], // månedsdækning findes — årstotalen ville dobbelttælle
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

  it("robusthed 04 (semikolon-dansk): 10 rækker ('Resultat' fravalgt), ren månedsskrivning", () => {
    const g = byggGitter(
      laesMatrix(parseCsvTilMatrix(fs.readFileSync(`${FIX}/robusthed/04-semikolon-dansk.csv`, "utf-8"), ";")),
    );
    const { plan, fordelteKolonner, noeglerUnikke } = planAf(g, "2026");
    fastlaas(plan, fordelteKolonner, noeglerUnikke, {
      raekker: 10,
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
      // FLYTTET 2026-08-24 (fra 6): 'EBITDA margin' er forholdstal og
      // fravælges nu i byggGitter i stedet for kun at holdes ude af summen.
      raekker: 5,
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

  it("Topix Budget2025-arket importeret til 2026: 42 rækker med årsskifte-advarsel", () => {
    const g = byggGitter(laesMatrix(laesArkTilMatrix(`${FIX}/topix-budget-2026.xlsx`, "Budget2025")));
    const plan = byggSkriveplan(g, "2026");
    // FLYTTET 2026-08-24 (fra 39): årsfilteret smider ikke længere kolonner
    // UDEN udledt år væk — den umærkede "Årstotal"-kolonne hører nu til
    // filens år (2025). Fire medlemslinjer med tal KUN i Årstotal (D2C/B2B
    // Vareforbrug og Fragt & emballage) blev før tavst droppet; nu skrives
    // de fordelt over tolv måneder. Nødvendig følge af at "I alt 2026" i
    // resultatbudget-fixturen bærer året alene (P1: medlemmets linjer må
    // ikke forsvinde til et filter). Minus 'Bruttomargin' (forholdstal,
    // fravalgt fra byggGitter samme dag): 39 + 4 − 1 = 42.
    expect(plan.raekker).toHaveLength(42);
    expect(
      plan.raekker.filter((r) => r.fordelinger.some((f) => f.kolonnenavn === "Årstotal")).map((r) => r.etiket),
    ).toEqual(["D2C Vareforbrug", "D2C Fragt & emballage", "B2B Vareforbrug", "B2B Fragt & emballage"]);
    expect(plan.aarsskift).toEqual({ fra: "2025", til: "2026" });
    expect(plan.advarsler).toContain(
      "Kolonnerne i filen er fra 2025. Tallene skrives til budget 2026 — tjek at det er det du vil.",
    );
  });

  it("Topix-resultatbudget 2026 ('Budget 2026'): Jan…Dec-kolonner, år 2026, NØGLETAL udeladt, hovedtal", () => {
    const g = byggGitter(laesMatrix(laesArkTilMatrix(`${FIX}/topix-resultatbudget-2026.xlsx`, "Budget 2026")));

    // Fejl 1+2: kolonnerne kommer fra den fritstående månedsheader.
    expect(g.kolonner.slice(0, 12)).toEqual([
      "Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
    ]);
    // Året udledes af "I alt 2026" — den eneste kolonne der bærer det.
    expect(udledAar(tolkKolonner(g.kolonner))).toEqual(["2026"]);

    // Medlemmet udelader også de sektionsløse resultatlinjer (RESULTAT FØR
    // SKAT, Akkumuleret resultat) — NØGLETAL er allerede forvalgt udeladt,
    // og Overskudsgraden er fravalgt af sit eget forholdstals-værn.
    const { plan, fordelteKolonner, noeglerUnikke } = planAf(saetSektionUdeladt(g, null, true), "2026");
    fastlaas(plan, fordelteKolonner, noeglerUnikke, {
      raekker: 10, // 5 omsætningslinjer + 5 omkostningslinjer
      fordelte: [],
      utolkede: [],
      sprungetOver: ["I alt 2026"], // månedsdækning findes — årstotalen ville dobbelttælle
    });
    expect(plan.aarsskift).toBeNull();
    expect(plan.raekker.some((r) => /MRR|ARR|medlemmer|overskudsgrad/i.test(r.etiket))).toBe(false);

    // Hovedtal — verificeret mod filen 2026-08-24: planen rammer filens
    // egne totaler (OMSÆTNING I ALT / OMKOSTNINGER I ALT), præcis fordi
    // intet forholdstal og intet nøgletal skrives.
    // (Bestillingen nævnte 86.364 i januar-indtægter fra et andet udkast
    // af arket — filens faktiske tal er fastholdt, jf. golden-princippet.)
    const sumFor = (filter: (g2: string) => boolean, maaned: number) =>
      plan.raekker
        .filter((r) => filter(r.gruppe))
        .reduce((s, r) => s + (r.maanedsbeloeb[maaned] ?? 0), 0);
    expect(sumFor((g2) => g2 === "indtaegter", 0)).toBeCloseTo(85818.06, 2);
    expect(sumFor((g2) => g2 !== "indtaegter", 0)).toBeCloseTo(73608.97, 2);
    const aaret = (filter: (g2: string) => boolean) =>
      Array.from({ length: 12 }, (_, m) => sumFor(filter, m)).reduce((a, b) => a + b, 0);
    expect(aaret((g2) => g2 === "indtaegter")).toBeCloseTo(1317572.89, 2);
    expect(aaret((g2) => g2 !== "indtaegter")).toBeCloseTo(1110535.12, 2);
  });

  it("fravalg slår igennem i planen (Remm: fravælg én MEDTAGET række → 53)", () => {
    const g = byggGitter(
      laesMatrix(parseCsvTilMatrix(fs.readFileSync(`${FIX}/remm-budget-base-2026.csv`, "utf-8"))),
    );
    const foersteMedtagne = g.raekker.find((r) => r.medtag)!.raekkeIndex;
    const { plan } = planAf(saetMedtag(g, foersteMedtagne, false), "2026");
    expect(plan.raekker).toHaveLength(53);
  });
});

// ─────────────── Visning ≡ skrivning (alle syv fixtures) ───────────────

/**
 * Det medlemmet SER i gitteret (normaliseretVaerdi) skal være præcis det
 * skriveplanen skriver. Bevis: et gitter hvor alle celler er erstattet med
 * deres normaliserede visningsværdi giver en IDENTISK skriveplan —
 * normaliseringen er én delt regel, ikke to der kan glide fra hinanden.
 */
describe("visning ≡ skrivning", () => {
  const FIX2 = path.resolve(__dirname, "../__fixtures__");
  const tilfaelde: [string, () => Gitter][] = [
    ["remm", () => byggGitter(laesMatrix(parseCsvTilMatrix(fs.readFileSync(`${FIX2}/remm-budget-base-2026.csv`, "utf-8"))))],
    ["topix", () => byggGitter(laesMatrix(laesArkTilMatrix(`${FIX2}/topix-budget-2026.xlsx`, "Budget2026")))],
    ["rob01", () => byggGitter(laesMatrix(laesArkTilMatrix(`${FIX2}/robusthed/01-kvartal-positive-omkostninger.xlsx`, "Budget")))],
    ["rob02", () => byggGitter(laesMatrix(laesArkTilMatrix(`${FIX2}/robusthed/02-transponeret.xlsx`, "Budget 2026")))],
    ["rob03", () => byggGitter(laesMatrix(laesArkTilMatrix(`${FIX2}/robusthed/03-flettede-total-oeverst.xlsx`, "Resultatbudget")))],
    ["rob04", () => byggGitter(laesMatrix(parseCsvTilMatrix(fs.readFileSync(`${FIX2}/robusthed/04-semikolon-dansk.csv`, "utf-8"), ";")))],
    ["rob05", () => byggGitter(laesMatrix(laesArkTilMatrix(`${FIX2}/robusthed/05-engelsk-fire-aar.xlsx`, "Consolidated")))],
  ];

  it("skriveplanen af de VISTE værdier er identisk med skriveplanen af de rå", () => {
    for (const [navn, byg] of tilfaelde) {
      const g = byg();
      const somVist: Gitter = {
        ...g,
        raekker: g.raekker.map((r) => ({
          ...r,
          vaerdier: r.vaerdier.map((_, k) => normaliseretVaerdi(g, r, k)),
        })),
      };
      expect(byggSkriveplan(somVist, "2026"), navn).toEqual(byggSkriveplan(g, "2026"));
    }
  });
});
