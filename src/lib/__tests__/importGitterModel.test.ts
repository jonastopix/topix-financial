import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { laesMatrix, type ImportResultat, type Tabel } from "@/lib/importEngine";
import {
  byggGitter,
  opsummer,
  saetEtiket,
  saetMedtag,
  saetVaerdi,
  slet,
  tilfoejRaekke,
  type Gitter,
} from "@/lib/importGitterModel";
import { parseCsvTilMatrix } from "./csvTestHelper";
import { laesArkTilMatrix } from "./xlsxTestHelper";

// ───────────────────────── Byggeklodser ─────────────────────────

const felt = (vaerdi: number | null, kilde = vaerdi === null ? "tom" : "tal", raa = "") => ({
  vaerdi,
  kilde: kilde as "tal" | "parentes" | "bindestreg" | "tom" | "procent" | "ulaeselig",
  raa: raa || (vaerdi === null ? "" : String(vaerdi)),
});

const post = (raekkeIndex: number, etiket: string, vaerdier: (number | null)[]) => ({
  raekkeIndex,
  etiket,
  type: "post" as const,
  felter: vaerdier.map((v) => felt(v)),
});

const tabel = (raekker: Tabel["raekker"], overrides: Partial<Tabel> = {}): Tabel => ({
  headerRaekke: null,
  kolonneOverskrifter: [],
  foersteDataRaekke: raekker[0]?.raekkeIndex ?? 0,
  sidsteDataRaekke: raekker[raekker.length - 1]?.raekkeIndex ?? 0,
  raekker,
  tekstKolonner: [],
  ...overrides,
});

const resultat = (tabeller: Tabel[], advarsler: string[] = []): ImportResultat => ({
  konvention: { tusind: ",", decimal: ".", sikkerhed: "hoej" },
  tabeller,
  advarsler,
});

const standardGitter = (): Gitter =>
  byggGitter(
    resultat([
      tabel([
        { raekkeIndex: 0, etiket: "Personale", type: "sektion", felter: [felt(null), felt(null)] },
        post(1, "Løn", [100, 200]),
        post(2, "Pension", [10, 20]),
        {
          raekkeIndex: 3,
          etiket: "Personale i alt",
          type: "subtotal",
          daekker: [1, 2],
          felter: [felt(110), felt(220)],
        },
      ]),
    ]),
  );

// ───────────────────────── byggGitter ─────────────────────────

describe("byggGitter", () => {
  it("kun poster bliver rækker; sektioner og subtotaler lander i struktur", () => {
    const g = standardGitter();
    expect(g.raekker.map((r) => r.etiket)).toEqual(["Løn", "Pension"]);
    expect(g.struktur).toEqual([
      { raekkeIndex: 0, etiket: "Personale", slags: "sektion", tabelIndex: 0 },
      {
        raekkeIndex: 3,
        etiket: "Personale i alt",
        slags: "subtotal",
        daekker: [1, 2],
        tabelIndex: 0,
      },
    ]);
  });

  it("sektion-tilknytning: nærmeste foranstående sektion i samme tabel, ellers null", () => {
    const g = byggGitter(
      resultat([
        tabel([
          post(0, "Uden sektion", [1]),
          { raekkeIndex: 1, etiket: "Drift", type: "sektion", felter: [felt(null)] },
          post(2, "Shopify", [2]),
          { raekkeIndex: 3, etiket: "Marketing", type: "sektion", felter: [felt(null)] },
          post(4, "Klaviyo", [3]),
        ]),
        tabel([post(10, "Anden tabel", [5])]),
      ]),
    );
    expect(g.raekker.map((r) => [r.etiket, r.sektion])).toEqual([
      ["Uden sektion", null],
      ["Shopify", "Drift"],
      ["Klaviyo", "Marketing"],
      ["Anden tabel", null], // sektioner krydser aldrig tabelgrænser
    ]);
  });

  it("tekstkolonne bliver til kommentar — aldrig til en værdi eller en tvivls-bemærkning", () => {
    const g = byggGitter(
      resultat([
        tabel(
          [
            {
              raekkeIndex: 0,
              etiket: "Revenue",
              type: "post",
              felter: [felt(2700000), felt(null, "ulaeselig", "Nettoomsætning B2C + B2B")],
            },
          ],
          { tekstKolonner: [1] },
        ),
      ]),
    );
    expect(g.raekker[0].vaerdier).toEqual([2700000]);
    expect(g.raekker[0].kommentar).toBe("Nettoomsætning B2C + B2B");
    expect(g.raekker[0].bemaerkning).toBeNull();
  });

  it("både ulæselig værdi og tekstkolonne: bemaerkning OG kommentar er sat", () => {
    const g = byggGitter(
      resultat([
        tabel(
          [
            {
              raekkeIndex: 0,
              etiket: "Blended ROAS",
              type: "post",
              felter: [
                felt(null, "ulaeselig", "3.6x"),
                felt(null, "ulaeselig", "Total B2C Revenue / Marketing Spend"),
              ],
            },
          ],
          { tekstKolonner: [1] },
        ),
      ]),
    );
    expect(g.raekker[0].bemaerkning).toBe("Kunne ikke læses: 3.6x");
    expect(g.raekker[0].kommentar).toBe("Total B2C Revenue / Marketing Spend");
  });

  it("kolonner matches på navn: 'Årstotal' lander i Årstotal-pladsen, ikke i Januar", () => {
    const g = byggGitter(
      resultat([
        tabel([post(0, "Revenue", [2700000])], {
          headerRaekke: -1,
          kolonneOverskrifter: ["KPI", "Årstotal"],
        }),
        tabel([post(10, "Løn", [1, 2, 3])], {
          headerRaekke: 9,
          kolonneOverskrifter: ["Post", "Januar", "Februar", "Årstotal"],
        }),
      ]),
    );
    expect(g.kolonner).toEqual(["Januar", "Februar", "Årstotal"]);
    expect(g.raekker[0].vaerdier).toEqual([null, null, 2700000]);
    expect(g.raekker[1].vaerdier).toEqual([1, 2, 3]);
  });

  it("tabel uden overskrifter placeres positionelt", () => {
    const g = byggGitter(
      resultat([
        tabel([post(0, "Uden header", [5, 6])]),
        tabel([post(10, "Med header", [1, 2, 3])], {
          headerRaekke: 9,
          kolonneOverskrifter: ["Post", "Januar", "Februar", "Årstotal"],
        }),
      ]),
    );
    expect(g.raekker[0].vaerdier).toEqual([5, 6, null]);
  });

  it("dobbelttælling: post der matcher subtotal i ANDEN tabel får bemærkning og forbliver medtaget", () => {
    const g = byggGitter(
      resultat([
        tabel([post(0, "Gross Profit", [100])]),
        tabel([
          post(10, "Nettoomsætning", [500]),
          post(11, "Vareforbrug", [-400]),
          {
            raekkeIndex: 12,
            etiket: "Gross Profit",
            type: "subtotal",
            daekker: [10, 11],
            felter: [felt(100)],
          },
        ]),
      ]),
    );
    const posten = g.raekker.find((r) => r.raekkeIndex === 0)!;
    expect(posten.bemaerkning).toBe(
      "Ligner totalen 'Gross Profit' i en anden del af filen — tages den med, tælles beløbet to gange",
    );
    expect(posten.medtag).toBe(true);
  });

  it("dobbelttælling: samme etiket som subtotal i SAMME tabel giver ingen bemærkning", () => {
    const g = byggGitter(
      resultat([
        tabel([
          { raekkeIndex: 0, etiket: "Gross Profit", type: "sektion", felter: [felt(null)] },
          post(1, "Nettoomsætning", [500]),
          post(2, "Vareforbrug", [-400]),
          {
            raekkeIndex: 3,
            etiket: "Gross Profit",
            type: "subtotal",
            daekker: [1, 2],
            felter: [felt(100)],
          },
        ]),
      ]),
    );
    expect(g.raekker.every((r) => r.bemaerkning === null)).toBe(true);
  });

  it("total af alle øvrige linjer: rækken der summer resten af gitteret får bemærkning", () => {
    const g = byggGitter(
      resultat([
        tabel([post(0, "Dækningsbidrag", [500, 600])]),
        tabel([
          post(10, "Løn", [-200, -250]),
          post(11, "Husleje", [-100, -150]),
          post(12, "Resultat", [200, 200]), // 500-200-100 / 600-250-150
        ]),
      ]),
    );
    const resultatRaekke = g.raekker.find((r) => r.etiket === "Resultat")!;
    expect(resultatRaekke.bemaerkning).toBe(
      "Ser ud til at være en total af de øvrige linjer — tages den med, tælles beløbet to gange",
    );
    expect(resultatRaekke.medtag).toBe(true);
    expect(g.raekker.filter((r) => r.bemaerkning !== null)).toHaveLength(1);
  });

  it("total af øvrige rammer aldrig nulrækker (kræver |v| > 2)", () => {
    const g = byggGitter(
      resultat([
        tabel([
          post(0, "A", [3, -3]),
          post(1, "B", [-3, 3]),
          post(2, "Nulrække", [0, 0]), // 3-3=0 og -3+3=0 — matcher, men er ikke informativ
        ]),
      ]),
    );
    expect(g.raekker.find((r) => r.etiket === "Nulrække")!.bemaerkning).toBe(
      "Alle måneder er nul",
    );
  });

  it("forholdstal: alle værdier ≤ 1 blandt store naborækker får bemærkning", () => {
    const g = byggGitter(
      resultat([
        tabel([post(0, "Omsætning", [80000, 90000]), post(1, "Nettomargin", [0.4, 0.5])]),
      ]),
    );
    expect(g.raekker.find((r) => r.etiket === "Nettomargin")!.bemaerkning).toBe(
      "Ser ud til at være et forholdstal, ikke et beløb",
    );
    expect(g.raekker.find((r) => r.etiket === "Nettomargin")!.medtag).toBe(true);
    expect(g.raekker.find((r) => r.etiket === "Omsætning")!.bemaerkning).toBeNull();
  });

  it("forholdstal: rene nulrækker rammes ikke (skærpelsen), og små tabeller uden store naboer heller ikke", () => {
    const g = byggGitter(
      resultat([
        tabel([post(0, "Omsætning", [80000, 90000]), post(1, "Tom budgetlinje", [0, 0])]),
        tabel([post(10, "Lille A", [0.4, 0.5]), post(11, "Lille B", [0.2, 0.3])]),
      ]),
    );
    expect(g.raekker.find((r) => r.etiket === "Tom budgetlinje")!.bemaerkning).toBe(
      "Alle måneder er nul",
    );
    expect(g.raekker.find((r) => r.etiket === "Lille A")!.bemaerkning).toBeNull();
  });

  it("dobbelttælling i tillæg til eksisterende tvivls-bemærkning", () => {
    const g = byggGitter(
      resultat([
        tabel([post(0, "Net Profit", [0, 0])]),
        tabel([
          post(10, "A", [1, 1]),
          post(11, "B", [2, 2]),
          {
            raekkeIndex: 12,
            etiket: "Net Profit",
            type: "subtotal",
            daekker: [10, 11],
            felter: [felt(3), felt(3)],
          },
        ]),
      ]),
    );
    const posten = g.raekker.find((r) => r.raekkeIndex === 0)!;
    expect(posten.bemaerkning).toBe(
      "Alle måneder er nul · Ligner totalen 'Net Profit' i en anden del af filen — tages den med, tælles beløbet to gange",
    );
  });

  it("bemærkning: alle værdier null og ingen ulæselige → 'Ingen tal i denne linje'", () => {
    const g = byggGitter(resultat([tabel([post(0, "Tom linje", [null, null])])]));
    expect(g.raekker[0].bemaerkning).toBe("Ingen tal i denne linje");
    expect(g.raekker[0].medtag).toBe(true); // P1: rækken er altid med
  });

  it("bemærkning: mindst ét ulæseligt felt → 'Kunne ikke læses: {raa}'", () => {
    const g = byggGitter(
      resultat([
        tabel([
          {
            raekkeIndex: 0,
            etiket: "Blended ROAS",
            type: "post",
            felter: [felt(null, "ulaeselig", "3.6x"), felt(null)],
          },
        ]),
      ]),
    );
    expect(g.raekker[0].bemaerkning).toBe("Kunne ikke læses: 3.6x");
  });

  it("bemærkning: alle værdier 0 → 'Alle måneder er nul'", () => {
    const g = byggGitter(resultat([tabel([post(0, "B2B salg", [0, 0, 0])])]));
    expect(g.raekker[0].bemaerkning).toBe("Alle måneder er nul");
  });

  it("ingen bemærkning når rækken har almindelige tal", () => {
    const g = byggGitter(resultat([tabel([post(0, "Løn", [100, null, 0])])]));
    expect(g.raekker[0].bemaerkning).toBeNull();
  });

  it("flere tabeller med forskellig bredde: bredeste vinder, smallere efterfyldes med null", () => {
    const g = byggGitter(
      resultat([
        tabel([post(0, "Smal", [1, 2])]),
        tabel([post(10, "Bred", [10, 20, 30, 40])], {
          headerRaekke: 9,
          kolonneOverskrifter: ["Post", "Jan", "Feb", "Mar", "Apr"],
        }),
      ]),
    );
    expect(g.kolonner).toEqual(["Jan", "Feb", "Mar", "Apr"]);
    expect(g.raekker[0].vaerdier).toEqual([1, 2, null, null]);
    expect(g.raekker[1].vaerdier).toEqual([10, 20, 30, 40]);
    expect(g.raekker.map((r) => r.tabelIndex)).toEqual([0, 1]);
  });

  it("uden kolonneOverskrifter genereres 'Kolonne N'", () => {
    const g = byggGitter(resultat([tabel([post(0, "A", [1, 2, 3])])]));
    expect(g.kolonner).toEqual(["Kolonne 1", "Kolonne 2", "Kolonne 3"]);
  });

  it("advarsler fra motoren følger med", () => {
    const g = byggGitter(resultat([tabel([post(0, "A", [1])])], ["En advarsel"]));
    expect(g.advarsler).toEqual(["En advarsel"]);
  });
});

// ───────────────────────── Mutationer ─────────────────────────

describe("mutationer — nye objekter, aldrig mutation af input", () => {
  const frys = (g: Gitter) => JSON.parse(JSON.stringify(g));

  it("saetMedtag", () => {
    const g = standardGitter();
    const foer = frys(g);
    const ny = saetMedtag(g, 1, false);
    expect(ny).not.toBe(g);
    expect(ny.raekker.find((r) => r.raekkeIndex === 1)?.medtag).toBe(false);
    expect(g).toEqual(foer);
  });

  it("saetVaerdi", () => {
    const g = standardGitter();
    const foer = frys(g);
    const ny = saetVaerdi(g, 1, 1, 999);
    expect(ny.raekker.find((r) => r.raekkeIndex === 1)?.vaerdier).toEqual([100, 999]);
    expect(g).toEqual(foer);
  });

  it("saetVaerdi uden for kolonneområdet ændrer intet", () => {
    const g = standardGitter();
    const ny = saetVaerdi(g, 1, 7, 999);
    expect(ny.raekker.find((r) => r.raekkeIndex === 1)?.vaerdier).toEqual([100, 200]);
  });

  it("saetEtiket", () => {
    const g = standardGitter();
    const foer = frys(g);
    const ny = saetEtiket(g, 2, "Pension & ATP");
    expect(ny.raekker.find((r) => r.raekkeIndex === 2)?.etiket).toBe("Pension & ATP");
    expect(g).toEqual(foer);
  });

  it("slet fjerner enhver række — også importerede", () => {
    const g = standardGitter();
    const foer = frys(g);
    const ny = slet(g, 1);
    expect(ny.raekker.map((r) => r.etiket)).toEqual(["Pension"]);
    expect(g).toEqual(foer);
  });

  it("tilfoejRaekke indsætter tom række med negativt raekkeIndex og arver sektion", () => {
    const g = standardGitter();
    const foer = frys(g);
    const ny = tilfoejRaekke(g, 1);
    expect(ny.raekker.map((r) => r.etiket)).toEqual(["Løn", "", "Pension"]);
    const nyRaekke = ny.raekker[1];
    expect(nyRaekke.raekkeIndex).toBeLessThan(0);
    expect(nyRaekke.vaerdier).toEqual([null, null]);
    expect(nyRaekke.sektion).toBe("Personale");
    expect(nyRaekke.medtag).toBe(true);
    expect(g).toEqual(foer);
  });

  it("to nye rækker får forskellige negative raekkeIndex", () => {
    const g = tilfoejRaekke(tilfoejRaekke(standardGitter(), 1), 1);
    const negative = g.raekker.filter((r) => r.raekkeIndex < 0).map((r) => r.raekkeIndex);
    expect(negative).toHaveLength(2);
    expect(new Set(negative).size).toBe(2);
  });
});

// ───────────────────────── opsummer ─────────────────────────

describe("opsummer", () => {
  it("regner kun på medtagne rækker", () => {
    let g = standardGitter(); // Løn [100,200], Pension [10,20]
    expect(opsummer(g)).toEqual({ medtaget: 2, fravalgt: 0, medBemaerkning: 0, sum: [110, 220] });

    g = saetMedtag(g, 2, false);
    expect(opsummer(g)).toEqual({ medtaget: 1, fravalgt: 1, medBemaerkning: 0, sum: [100, 200] });
  });

  it("kolonne uden medtagne værdier summer til null", () => {
    const g = byggGitter(resultat([tabel([post(0, "A", [5, null])])]));
    expect(opsummer(g).sum).toEqual([5, null]);
  });

  it("tæller rækker med bemærkning", () => {
    const g = byggGitter(
      resultat([tabel([post(0, "Tom", [null]), post(1, "Nul", [0]), post(2, "OK", [7])])]),
    );
    expect(opsummer(g).medBemaerkning).toBe(2);
  });
});

// ───────────────────────── Golden: ægte medlemsfil ─────────────────────────

/**
 * GOLDEN mod Remm ApS' driftsbudget 2026 — samme fixture som importEngine-
 * golden-testen, verificeret 2026-08-23. Ændrer tallene sig, har motoren
 * eller gitter-modellen ændret adfærd på en rigtig fil.
 *
 * NB om "Corpay": bestillingen forventede bemærkningen "Ingen tal i denne
 * linje", men medlemmets fil har faktisk tal fra juli ((899)×6 + årstotal,
 * CSV-linje 56) — rækken har derfor INGEN bemærkning. Fastholdt mod filens
 * virkelighed, ikke mod forventningen.
 */
describe("golden: gitter af Remm-budget 2026", () => {
  const fixturePath = path.resolve(__dirname, "../__fixtures__/remm-budget-base-2026.csv");
  const res = laesMatrix(parseCsvTilMatrix(fs.readFileSync(fixturePath, "utf-8")));
  const g = byggGitter(res);

  it("63 rækker — alle poster, alt medtaget som udgangspunkt", () => {
    expect(g.raekker).toHaveLength(63);
    expect(g.raekker.every((r) => r.medtag)).toBe(true);
  });

  it("ingen subtotal er blandt rækkerne — de 13 står i struktur", () => {
    const subtotaler = g.struktur.filter((s) => s.slags === "subtotal");
    expect(subtotaler).toHaveLength(13);
    const subtotalIndeks = new Set(subtotaler.map((s) => s.raekkeIndex));
    expect(g.raekker.some((r) => subtotalIndeks.has(r.raekkeIndex))).toBe(false);
  });

  it("'Blended ROAS' har både tvivls-bemærkning om 3.6x og medlemmets kommentar", () => {
    const roas = g.raekker.find((r) => r.etiket === "Blended ROAS")!;
    expect(roas.bemaerkning).toBe("Kunne ikke læses: 3.6x");
    expect(roas.kommentar).toBe("Total B2C Revenue / Marketing Spend");
    expect(roas.medtag).toBe(true);
  });

  it("'Corpay' har tal fra juli og derfor ingen bemærkning (se NB i blok-kommentaren)", () => {
    const corpay = g.raekker.find((r) => r.etiket === "Corpay")!;
    expect(corpay.vaerdier.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(corpay.vaerdier[6]).toBe(-899);
    expect(corpay.bemaerkning).toBeNull();
  });

  it("kolonnerne kommer fra måneds-headeren", () => {
    expect(g.kolonner[0]).toBe("Januar");
    expect(g.kolonner[12]).toBe("Årstotal");
  });

  it("KPI-tabellens årstotal lander i Årstotal-kolonnen, ikke i Januar", () => {
    const revenue = g.raekker.find((r) => r.etiket === "Revenue" && r.tabelIndex === 0)!;
    expect(revenue.vaerdier[0]).toBeNull();
    expect(revenue.vaerdier[12]).toBe(2700000);
    expect(revenue.kommentar).toBe("Nettoomsætning B2C + B2B");
  });

  it("ingen Remm-række rammes af total-af-øvrige- eller forholdstals-værnene", () => {
    expect(g.raekker.filter((r) => r.bemaerkning?.includes("total af de øvrige linjer"))).toEqual([]);
    expect(g.raekker.filter((r) => r.bemaerkning?.includes("forholdstal"))).toEqual([]);
  });

  it("dobbelttællings-bemærkning på præcis de otte rækker der gentager en total fra en anden tabel", () => {
    const medNote = g.raekker
      .filter((r) => r.bemaerkning?.includes("Ligner totalen"))
      .map((r) => [r.raekkeIndex, r.etiket]);
    expect(medNote).toEqual([
      [4, "Revenue"],                // KPI-resumé ↔ sektion/subtotal i tabel 2
      [5, "Gross Profit"],           // KPI-resumé ↔ tabel 3
      [7, "Contribution Margin"],    // KPI-resumé ↔ tabel 4
      [9, "Net Profit"],             // KPI-resumé ↔ tabel 6
      [25, "Nettoomsætning"],        // videreført total fra tabel 2 i tabel 3
      [38, "Gross Profit"],          // videreført total fra tabel 3 i tabel 4
      [93, "Contribution Margin"],   // videreført total fra tabel 4 i tabel 6
      [94, "Total Fixed Expenses"],  // videreført total fra tabel 5 i tabel 6
    ]);
    expect(medNote.every(([idx]) => g.raekker.find((r) => r.raekkeIndex === idx)!.medtag)).toBe(true);
  });
});

/**
 * GOLDEN mod Topix.dk ApS' eget budget (XLSX, arket Budget2026) —
 * verificeret manuelt mod filen 2026-08-23 (~/Downloads/topix-resultat.md
 * plus rettelserne af de fire fejl fundet dér). Strukturelt anderledes end
 * Remm-CSV'en: native tal, rigtige minusser, tom afstandskolonne mellem
 * december og årstotal, månedsoverskrifter som "Januar-26". Ændrer tallene
 * sig, har motoren eller gitteret ændret adfærd på en rigtig fil.
 */
describe("golden: gitter af Topix-budget 2026 (XLSX)", () => {
  const fixturePath = path.resolve(__dirname, "../__fixtures__/topix-budget-2026.xlsx");
  const res = laesMatrix(laesArkTilMatrix(fixturePath, "Budget2026"));
  const alle = res.tabeller.flatMap((t) => t.raekker);
  const g = byggGitter(res);

  it("de fem nulrækker/margin-rækker der før forsvandt som subtotaler er nu poster", () => {
    for (const etiket of [
      "D2C Fragt & emballage",
      "B2B Vareforbrug",
      "B2B Fragt & emballage",
      "El",
      "Bruttomargin",
    ]) {
      const r = alle.find((x) => x.etiket === etiket)!;
      expect(r.type, etiket).toBe("post");
    }
  });

  it("'Dækningsbidrag' er stadig subtotal", () => {
    expect(alle.find((r) => r.etiket === "Dækningsbidrag")!.type).toBe("subtotal");
  });

  it("'Resultat' er post MED total-af-øvrige-bemærkningen", () => {
    const r = g.raekker.find((x) => x.etiket === "Resultat")!;
    expect(alle.find((x) => x.etiket === "Resultat")!.type).toBe("post");
    expect(r.bemaerkning).toBe(
      "Ser ud til at være en total af de øvrige linjer — tages den med, tælles beløbet to gange",
    );
    expect(r.medtag).toBe(true);
  });

  it("'Nettomargin' er post MED forholdstals-bemærkningen", () => {
    const r = g.raekker.find((x) => x.etiket === "Nettomargin")!;
    expect(r.bemaerkning).toBe("Ser ud til at være et forholdstal, ikke et beløb");
    expect(r.medtag).toBe(true);
  });

  it("gitteret har 32 rækker — de fem reddede linjer er med", () => {
    expect(g.raekker).toHaveLength(32);
  });

  it("kolonnenavnene starter med 'Januar-26'", () => {
    expect(g.kolonner[0]).toBe("Januar-26");
  });

  it("headeren genkendes nu af findTabeller (via månedssuffiks), ikke kun af promoveringen", () => {
    const hovedtabel = res.tabeller.find((t) => t.headerRaekke === 3)!;
    expect(hovedtabel.foersteDataRaekke).toBe(4);
    expect(hovedtabel.kolonneOverskrifter[1]).toBe("Januar-26");
  });
});
