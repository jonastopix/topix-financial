import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { erMaanedsnavn, laesMatrix, laesTal, type ImportResultat, type Matrix, type Tabel } from "@/lib/importEngine";
import {
  byggGitter,
  erSektionUdeladt,
  gruppeForslag,
  gruppeGaet,
  indsaetFraTekst,
  normaliseretVaerdi,
  raekkeGruppe,
  opsummer,
  saetRaekkegruppe,
  saetSektionsgruppe,
  saetSektionUdeladt,
  saetEtiket,
  saetMedtag,
  saetVaerdi,
  slet,
  tilfoejRaekke,
  type Gitter,
} from "@/lib/importGitterModel";
import { parseCsvTilMatrix } from "@/lib/csvLaesning";
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

  it("dobbelttælling: post der matcher subtotal i ANDEN tabel FRAVÆLGES med forklarende bemærkning", () => {
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
      "Fravalgt: ligner totalen 'Gross Profit' i en anden del af filen — tages den med, tælles beløbet to gange",
    );
    expect(posten.medtag).toBe(false); // sikker dobbelttælling → fravalgt som standard
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

  it("total af alle øvrige linjer: rækken FRAVÆLGES med forklarende bemærkning", () => {
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
      "Fravalgt: ser ud til at være en total af de øvrige linjer — tages den med, tælles beløbet to gange",
    );
    expect(resultatRaekke.medtag).toBe(false);
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

  it("forholdstal: alle værdier ≤ 1 blandt store naborækker FRAVÆLGES med bemærkning", () => {
    const g = byggGitter(
      resultat([
        tabel([post(0, "Omsætning", [80000, 90000]), post(1, "Nettomargin", [0.4, 0.5])]),
      ]),
    );
    const margin = g.raekker.find((r) => r.etiket === "Nettomargin")!;
    expect(margin.bemaerkning).toBe("Fravalgt: ser ud til at være et forholdstal, ikke et beløb");
    // Et forholdstal er ikke et budgetbeløb — fravalgt som dobbelttællings-
    // rækkerne, men stående og synligt så medlemmet kan vælge det til (P1).
    expect(margin.medtag).toBe(false);
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
      "Alle måneder er nul · Fravalgt: ligner totalen 'Net Profit' i en anden del af filen — tages den med, tælles beløbet to gange",
    );
    expect(posten.medtag).toBe(false);
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

// ───────────────────────── Gruppeforslag og gruppevalg ─────────────────────────

describe("gruppeGaet, saetRaekkegruppe og linjeniveau-gruppen (spor 3)", () => {
  it("linjegæt: rammer rigtigt på Topix-etiketterne, null uden match", () => {
    expect(gruppeGaet("Salg & Marketing")).toBe("salg_marketing"); // ikke indtaegter
    expect(gruppeGaet("Personale")).toBe("personale");
    expect(gruppeGaet("Lokale & Administration")).toBe("faste");
    expect(gruppeGaet("Direkte Omkostninger")).toBe("variable");
    expect(gruppeGaet("Software & It")).toBeNull(); // følger sektionen
    expect(gruppeGaet("Konsulent & øvrig omsætning")).toBe("indtaegter");
  });

  it("omkostningsmarkør spærrer indtægtsreglen: 'Cost of revenue' og 'Salgsomkostninger' er ikke indtægter", () => {
    expect(gruppeGaet("Cost of revenue")).toBe("variable");
    expect(gruppeGaet("Salgsomkostninger")).toBeNull();
    expect(gruppeGaet("Revenue")).toBe("indtaegter");
  });

  it("linjegættet vinder over sektionsgættet; uden linjegæt følges sektionen", () => {
    const g = byggGitter(
      resultat([
        tabel([
          { raekkeIndex: 0, etiket: "OMKOSTNINGER", type: "sektion", felter: [felt(null)] },
          post(1, "Personale", [100]),
          post(2, "Software & It", [50]),
        ]),
      ]),
    );
    const personale = g.raekker.find((r) => r.etiket === "Personale")!;
    const software = g.raekker.find((r) => r.etiket === "Software & It")!;
    expect(personale.gruppe).toBe("personale");
    expect(software.gruppe).toBeNull();
    expect(raekkeGruppe(g, personale)).toBe("personale");
    expect(raekkeGruppe(g, software)).toBe("drift"); // sektionens fallback
  });

  it("saetRaekkegruppe overstyrer linjen; saetSektionsgruppe nulstiller ALLE sektionens linjer — immutabelt", () => {
    const g = byggGitter(
      resultat([
        tabel([
          { raekkeIndex: 0, etiket: "OMKOSTNINGER", type: "sektion", felter: [felt(null)] },
          post(1, "Personale", [100]),
          post(2, "Software & It", [50]),
        ]),
      ]),
    );
    const foer = JSON.parse(JSON.stringify(g));
    const overstyret = saetRaekkegruppe(g, 2, "faste");
    expect(raekkeGruppe(overstyret, overstyret.raekker.find((r) => r.raekkeIndex === 2)!)).toBe("faste");
    expect(g).toEqual(foer); // muterer ikke input

    // Nyt sektionsvalg sætter alle linjer — også de overstyrede og linjegættet.
    const sektionsvalgt = saetSektionsgruppe(overstyret, "OMKOSTNINGER", "variable");
    for (const r of sektionsvalgt.raekker) {
      expect(r.gruppe).toBeNull();
      expect(raekkeGruppe(sektionsvalgt, r)).toBe("variable");
    }
  });

  it("normaliseretVaerdi følger linjens gruppe: skift til indtaegter genopretter det rå fortegn", () => {
    const g = byggGitter(
      resultat([
        tabel([
          { raekkeIndex: 0, etiket: "Diverse", type: "sektion", felter: [felt(null)] },
          post(1, "Refusion", [-500]),
        ]),
      ]),
    );
    const raekke = g.raekker[0];
    expect(normaliseretVaerdi(g, raekke, 0)).toBe(500); // drift → absolutværdi
    const ny = saetRaekkegruppe(g, 1, "indtaegter");
    expect(normaliseretVaerdi(ny, ny.raekker[0], 0)).toBe(-500);
  });
});

describe("gruppeForslag og saetSektionsgruppe", () => {
  it("hver af de seks regler plus fallback", () => {
    expect(gruppeForslag("Omsætning")).toBe("indtaegter");
    expect(gruppeForslag("Total Revenue")).toBe("indtaegter");
    expect(gruppeForslag("Personale & konsulentydelser")).toBe("personale");
    expect(gruppeForslag("Medarbejdere")).toBe("personale");
    expect(gruppeForslag("Marketing, CRM & værktøjer")).toBe("salg_marketing");
    expect(gruppeForslag("Lokaler")).toBe("faste");
    expect(gruppeForslag("Husleje og kontor")).toBe("faste");
    expect(gruppeForslag("Direkte omkostninger")).toBe("variable");
    expect(gruppeForslag("Variable omkostninger")).toBe("variable");
    expect(gruppeForslag("Shop & IT")).toBe("drift"); // fallback
    expect(gruppeForslag(null)).toBe("drift"); // uden sektion
  });

  it("byggGitter initialiserer sektionsGrupper med forslag; saetSektionsgruppe ændrer immutabelt", () => {
    const g = byggGitter(
      resultat([
        tabel([
          { raekkeIndex: 0, etiket: "Medarbejdere", type: "sektion", felter: [felt(null)] },
          post(1, "Løn", [100]),
          post(2, "Uden sektion... nej vent", [50]),
        ]),
      ]),
    );
    expect(g.sektionsGrupper).toEqual({ Medarbejdere: "personale" });
    const foer = JSON.parse(JSON.stringify(g));
    const ny = saetSektionsgruppe(g, "Medarbejdere", "faste");
    expect(ny.sektionsGrupper["Medarbejdere"]).toBe("faste");
    expect(g).toEqual(foer); // muterer ikke input
  });

  it("golden: Remms elleve sektionsnavne får de rigtige forslag", () => {
    const g = byggGitter(
      laesMatrix(parseCsvTilMatrix(fs.readFileSync(path.resolve(__dirname, "../__fixtures__/remm-budget-base-2026.csv"), "utf-8"))),
    );
    expect(g.sektionsGrupper).toEqual({
      "": "drift", // KPI-rækkerne uden sektion
      Revenue: "indtaegter",
      "Gross Profit": "drift",
      "Contribution Margin": "drift",
      "Net Profit": "drift", // "Fixed Expenses" har ingen direkte rækker — dens rækker bor i undersektionerne
      "Personale & konsulentydelser": "personale",
      "Økonomi, administration & forsikring": "drift",
      "Webshop, betaling & logistiksystemer": "drift",
      "Marketing, CRM & værktøjer": "salg_marketing",
      "Content, udvikling & vækstprojekter": "drift",
      "Øvrige & reserve": "drift",
    });
  });

  it("golden: Topix' syv sektionsnavne får de rigtige forslag", () => {
    const g = byggGitter(
      laesMatrix(laesArkTilMatrix(path.resolve(__dirname, "../__fixtures__/topix-budget-2026.xlsx"), "Budget2026")),
    );
    expect(g.sektionsGrupper).toEqual({
      "Omsætning": "indtaegter",
      "Direkte omkostninger": "variable",
      "Variable omkostninger": "variable",
      "Medarbejdere": "personale",
      "Shop & IT": "drift",
      "Lokaler": "faste",
      "Administrativt": "drift",
    });
  });
});

// ───────────── "Ikke et budgetbeløb" (fejl 3) ─────────────

describe("saetSektionUdeladt og 'Ikke et budgetbeløb'", () => {
  const noegletalsGitter = () =>
    byggGitter(
      resultat([
        tabel([
          { raekkeIndex: 0, etiket: "OMSÆTNING", type: "sektion", felter: [felt(null)] },
          post(1, "Salg", [100]),
          { raekkeIndex: 2, etiket: "NØGLETAL", type: "sektion", felter: [felt(null)] },
          post(3, "MRR", [43031]),
          post(4, "ARR", [516367]),
        ]),
      ]),
    );

  it("NØGLETAL-sektionen forvælges som udeladt — rækkerne fravalgt men synlige i gitteret (P1)", () => {
    const g = noegletalsGitter();
    expect(erSektionUdeladt(g, "NØGLETAL")).toBe(true);
    expect(erSektionUdeladt(g, "OMSÆTNING")).toBe(false);
    const mrr = g.raekker.find((r) => r.etiket === "MRR")!;
    const arr = g.raekker.find((r) => r.etiket === "ARR")!;
    expect(mrr.medtag).toBe(false);
    expect(arr.medtag).toBe(false);
    expect(g.raekker.find((r) => r.etiket === "Salg")!.medtag).toBe(true);
    // Rækkerne forsvinder ikke — medlemmet kan se hvad der udelades.
    expect(g.raekker).toHaveLength(3);
  });

  it("forvalget rammer også KPI- og key figures-navne", () => {
    for (const navn of ["KPI-oversigt", "Key Figures", "Nøgletalsoversigt"]) {
      const g = byggGitter(
        resultat([
          tabel([
            { raekkeIndex: 0, etiket: navn, type: "sektion", felter: [felt(null)] },
            post(1, "MRR", [100]),
          ]),
        ]),
      );
      expect(erSektionUdeladt(g, navn), navn).toBe(true);
    }
  });

  it("saetSektionUdeladt fravælger alle sektionens rækker og kan fortrydes — immutabelt", () => {
    const g = noegletalsGitter();
    const foer = JSON.parse(JSON.stringify(g));
    const udeladt = saetSektionUdeladt(g, "OMSÆTNING", true);
    expect(erSektionUdeladt(udeladt, "OMSÆTNING")).toBe(true);
    expect(udeladt.raekker.find((r) => r.etiket === "Salg")!.medtag).toBe(false);
    const fortrudt = saetSektionUdeladt(udeladt, "OMSÆTNING", false);
    expect(erSektionUdeladt(fortrudt, "OMSÆTNING")).toBe(false);
    expect(fortrudt.raekker.find((r) => r.etiket === "Salg")!.medtag).toBe(true);
    expect(g).toEqual(foer); // muterer ikke input
  });

  it("udeladelsen er en SEPARAT tilstand — gruppevalget for sektionen røres ikke", () => {
    const g = saetSektionUdeladt(noegletalsGitter(), "OMSÆTNING", true);
    expect(g.sektionsGrupper["OMSÆTNING"]).toBe("indtaegter");
  });

  it("rækker med forholdstals- eller dobbelttællings-bemærkning påvirkes ikke af sektionsvalget", () => {
    // Håndbygget gitter: én sektion med et dobbelttællings-fravalg, et
    // forholdstal og en almindelig række.
    const g: Gitter = {
      kolonner: ["Jan"],
      raekker: [
        {
          raekkeIndex: 0,
          etiket: "Videreført total",
          vaerdier: [500],
          medtag: false,
          bemaerkning:
            "Fravalgt: ligner totalen 'Videreført total' i en anden del af filen — tages den med, tælles beløbet to gange",
          kommentar: null,
          sektion: "Resultat",
          gruppe: null,
          tabelIndex: 0,
        },
        {
          raekkeIndex: 1,
          etiket: "Margin",
          // Medlemmet har selv valgt forholdstallet til igen — det valg må
          // sektionsvalget ikke rulle tilbage.
          vaerdier: [0.2],
          medtag: true,
          bemaerkning: "Fravalgt: ser ud til at være et forholdstal, ikke et beløb",
          kommentar: null,
          sektion: "Resultat",
          gruppe: null,
          tabelIndex: 0,
        },
        {
          raekkeIndex: 2,
          etiket: "Almindelig",
          vaerdier: [100],
          medtag: true,
          bemaerkning: null,
          kommentar: null,
          sektion: "Resultat",
          gruppe: null,
          tabelIndex: 0,
        },
      ],
      struktur: [],
      sektionsGrupper: { Resultat: "drift" },
      udeladteSektioner: { Resultat: false },
      advarsler: [],
    };
    const udeladt = saetSektionUdeladt(g, "Resultat", true);
    // Forholdstallet beholder sit eget tilvalg; den almindelige fravælges.
    expect(udeladt.raekker.map((r) => r.medtag)).toEqual([false, true, false]);
    const fortrudt = saetSektionUdeladt(udeladt, "Resultat", false);
    // Dobbelttællings-fravalget står ved magt når sektionen vælges til igen.
    expect(fortrudt.raekker.map((r) => r.medtag)).toEqual([false, true, true]);
  });

  it("rækker uden sektion (null) kan også udelades", () => {
    const g = byggGitter(resultat([tabel([post(0, "Resultat før skat", [100])])]));
    const udeladt = saetSektionUdeladt(g, null, true);
    expect(erSektionUdeladt(udeladt, null)).toBe(true);
    expect(udeladt.raekker[0].medtag).toBe(false);
  });
});

// ───────────── Advarsler og kolonne-oprydning (robusthed) ─────────────

describe("advarsler og kolonner", () => {
  it("positiv omkostningsgruppe giver fortegns-advarsel — én gang, uanset antal grupper", () => {
    const g = byggGitter(
      resultat([
        tabel([
          { raekkeIndex: 0, etiket: "OMKOSTNINGER", type: "sektion", felter: [felt(null), felt(null)] },
          post(1, "Råvarer", [1180000, 1290000]),
          post(2, "Fremmed arbejde", [220000, 240000]),
          {
            raekkeIndex: 3,
            etiket: "Vareforbrug i alt",
            type: "subtotal",
            daekker: [1, 2],
            felter: [felt(1400000), felt(1530000)],
          },
        ]),
      ]),
    );
    expect(
      g.advarsler.filter((a) => a.includes("positive tal")),
    ).toEqual(["Omkostningerne står som positive tal i din fil. Tjek at fortegnene er som du vil have dem."]);
  });

  it("negative omkostningsgrupper giver ingen fortegns-advarsel", () => {
    const g = byggGitter(
      resultat([
        tabel([
          post(0, "Mel og gær", [-84100, -80300]),
          post(1, "Smør", [-61300, -58500]),
          {
            raekkeIndex: 2,
            etiket: "Vareforbrug i alt",
            type: "subtotal",
            daekker: [0, 1],
            felter: [felt(-145400), felt(-138800)],
          },
        ]),
      ]),
    );
    expect(g.advarsler.some((a) => a.includes("positive tal"))).toBe(false);
  });

  it("mindst 8 månedsetiketter giver transponerings-advarsel — 7 gør ikke", () => {
    const maaneder = ["Januar", "Februar", "Marts", "April", "Maj", "Juni", "Juli", "August"];
    const g8 = byggGitter(
      resultat([tabel(maaneder.map((m, i) => post(i, m, [100, -50])))]),
    );
    expect(g8.advarsler.some((a) => a.includes("måneder står som rækker"))).toBe(true);

    const g7 = byggGitter(
      resultat([tabel(maaneder.slice(0, 7).map((m, i) => post(i, m, [100, -50])))]),
    );
    expect(g7.advarsler.some((a) => a.includes("måneder står som rækker"))).toBe(false);
  });

  it("tom unavngiven kolonne udelades; tom NAVNGIVEN kolonne bevares", () => {
    const g = byggGitter(
      resultat([
        tabel([post(0, "Løn", [100, null, null])], {
          headerRaekke: -1,
          kolonneOverskrifter: ["Post", "Jan", "Feb", ""], // sidste kolonne unavngiven
        }),
      ]),
    );
    expect(g.kolonner).toEqual(["Jan", "Feb"]); // "Feb" tom men navngiven → bevaret
    expect(g.raekker[0].vaerdier).toEqual([100, null]);
  });

  it("forholdstals-række er fravalgt og ude af summen — vælges den til, tælles den med og skrives", () => {
    const g = byggGitter(
      resultat([
        tabel([post(0, "EBITDA", [120, 230]), post(1, "EBITDA margin", [0.025, 0.045])]),
      ]),
    );
    expect(g.raekker[1].bemaerkning).toBe(
      "Fravalgt: ser ud til at være et forholdstal, ikke et beløb",
    );
    const o = opsummer(g);
    expect(o.medtaget).toBe(1);
    expect(o.fravalgt).toBe(1);
    expect(o.sum).toEqual([120, 230]);
    // medtag er det ENE sted der afgør: medlemmets gen-tilvalg tæller i
    // summen — og præcis samme række skrives så af skriveplanen.
    const valgtTil = opsummer(saetMedtag(g, 1, true));
    expect(valgtTil.medtaget).toBe(2);
    expect(valgtTil.sum).toEqual([120.025, 230.045]);
  });
});

// ───────────────────────── indsaetFraTekst ─────────────────────────

describe("indsaetFraTekst", () => {
  // Navngivne kolonner, så de tomme kolonner ikke prunes væk før indsætningen.
  const bredt = () =>
    byggGitter(
      resultat([
        tabel([post(0, "Løn", Array.from({ length: 12 }, () => null))], {
          headerRaekke: -1,
          kolonneOverskrifter: ["Post", ...Array.from({ length: 12 }, (_, i) => `M${i + 1}`)],
        }),
      ]),
    );

  it("tolv tab-adskilte tal indsat i kolonne 0 fylder tolv kolonner — og et trettende ignoreres", () => {
    const tekst = Array.from({ length: 13 }, (_, i) => String((i + 1) * 100)).join("\t");
    const ny = indsaetFraTekst(bredt(), 0, 0, tekst);
    expect(ny.raekker[0].vaerdier).toEqual([
      100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200,
    ]);
  });

  it("blok på tre rækker udvider gitteret med to nye rækker (negativt indeks, arvet sektion)", () => {
    const g = standardGitter(); // rækker 1 (Løn) og 2 (Pension), sektion "Personale"
    const ny = indsaetFraTekst(g, 2, 0, "1\t2\n3\t4\n5\t6");
    expect(ny.raekker).toHaveLength(4);
    expect(ny.raekker[1].vaerdier).toEqual([1, 2]); // Pension overskrevet
    const nye = ny.raekker.slice(2);
    expect(nye.map((r) => r.vaerdier)).toEqual([[3, 4], [5, 6]]);
    for (const r of nye) {
      expect(r.raekkeIndex).toBeLessThan(0);
      expect(r.medtag).toBe(true);
      expect(r.sektion).toBe("Personale");
      expect(r.tabelIndex).toBe(0);
    }
    expect(new Set(nye.map((r) => r.raekkeIndex)).size).toBe(2);
  });

  it("blok med tekst i første kolonne indsat i kolonne 0 sætter etiketter", () => {
    const ny = indsaetFraTekst(standardGitter(), 1, 0, "Husleje\t100\t200\nEl & varme\t300\t400");
    expect(ny.raekker[0].etiket).toBe("Husleje");
    expect(ny.raekker[0].vaerdier).toEqual([100, 200]);
    expect(ny.raekker[1].etiket).toBe("El & varme");
    expect(ny.raekker[1].vaerdier).toEqual([300, 400]);
  });

  it("amerikansk og dansk talformat i indsat tekst læses korrekt", () => {
    const us = indsaetFraTekst(standardGitter(), 1, 0, "2,700,000\t1,500");
    expect(us.raekker[0].vaerdier).toEqual([2700000, 1500]);

    const dk = indsaetFraTekst(standardGitter(), 1, 0, "2.700.000,50\t1.500");
    expect(dk.raekker[0].vaerdier).toEqual([2700000.5, 1500]);
  });

  it("parentes-negativ i indsat tekst følger motorens regler", () => {
    const ny = indsaetFraTekst(standardGitter(), 1, 0, "(17,000)\t500");
    expect(ny.raekker[0].vaerdier).toEqual([-17000, 500]);
  });

  it("semikolon-fallback når der ingen tabs er", () => {
    const ny = indsaetFraTekst(standardGitter(), 1, 0, "100;200");
    expect(ny.raekker[0].vaerdier).toEqual([100, 200]);
  });

  it("indsætning i en senere kolonne rammer den kolonne, ikke kolonne 0", () => {
    const ny = indsaetFraTekst(standardGitter(), 1, 1, "999");
    expect(ny.raekker[0].vaerdier).toEqual([100, 999]);
  });

  it("muterer ikke input", () => {
    const g = standardGitter();
    const foer = JSON.parse(JSON.stringify(g));
    indsaetFraTekst(g, 1, 0, "1\t2\n3\t4\n5\t6");
    expect(g).toEqual(foer);
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
    let g = byggGitter(resultat([tabel([post(0, "A", [5, null]), post(1, "B", [null, 7])])]));
    g = saetMedtag(g, 1, false);
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

  it("63 rækker — 55 medtaget, de 8 dobbelttællings-rækker fravalgt fra start", () => {
    expect(g.raekker).toHaveLength(63);
    expect(g.raekker.filter((r) => r.medtag)).toHaveLength(55);
    expect(g.raekker.filter((r) => !r.medtag)).toHaveLength(8);
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

  it("dobbelttællings-bemærkning OG fravalg på præcis de otte rækker der gentager en total fra en anden tabel", () => {
    const medNote = g.raekker
      .filter((r) => r.bemaerkning?.includes("ligner totalen"))
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
    // Sikker dobbelttælling er FRAVALGT fra start — bemærkningen forklarer.
    expect(medNote.every(([idx]) => !g.raekker.find((r) => r.raekkeIndex === idx)!.medtag)).toBe(true);
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

  it("'Resultat' er post, FRAVALGT med total-af-øvrige-bemærkningen", () => {
    const r = g.raekker.find((x) => x.etiket === "Resultat")!;
    expect(alle.find((x) => x.etiket === "Resultat")!.type).toBe("post");
    expect(r.bemaerkning).toBe(
      "Fravalgt: ser ud til at være en total af de øvrige linjer — tages den med, tælles beløbet to gange",
    );
    expect(r.medtag).toBe(false);
  });

  it("fravalgt fra start: 'Resultat' (total-af-øvrige) og de to margins (forholdstal)", () => {
    // FLYTTET 2026-08-24 (fra kun 'Resultat'): forholdstal fravælges nu i
    // byggGitter — medtag er det ENE sted der afgør både gitterets sum og
    // hvad der skrives, i stedet for at opsummer holdt dem ude af summen
    // mens skriveplanen alligevel skrev dem.
    expect(g.raekker.filter((r) => !r.medtag).map((r) => r.etiket)).toEqual([
      "Bruttomargin",
      "Resultat",
      "Nettomargin",
    ]);
  });

  it("omkostningerne i det ubehandlede gitter er ca. 4,90 mio. — ikke 9,66 mio.", () => {
    // Normaliserede beløb, medtagne ikke-indtægts-rækker uden forholdstal —
    // dvs. præcis det opsummer/skriveplanen regner med.
    const omkostninger = g.raekker
      .filter(
        (r) =>
          r.medtag &&
          raekkeGruppe(g, r) !== "indtaegter" &&
          !r.bemaerkning?.includes("forholdstal"),
      )
      .reduce(
        (s, r) =>
          s +
          r.vaerdier.reduce(
            // Kun månedskolonnerne — Årstotal-kolonnen springes over af
            // skriveplanen og skal heller ikke tælles her.
            (a: number, _, k) => a + (erMaanedsnavn(g.kolonner[k]) ? (normaliseretVaerdi(g, r, k) ?? 0) : 0),
            0,
          ),
        0,
      );
    expect(omkostninger).toBeGreaterThan(4_800_000);
    expect(omkostninger).toBeLessThan(5_000_000);
  });

  it("'Nettomargin' er post, FRAVALGT med forholdstals-bemærkningen", () => {
    const r = g.raekker.find((x) => x.etiket === "Nettomargin")!;
    expect(r.bemaerkning).toBe("Fravalgt: ser ud til at være et forholdstal, ikke et beløb");
    expect(r.medtag).toBe(false);
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

/**
 * GOLDEN mod Topix.dk ApS' resultatbudget 2026 (XLSX, arket "Budget 2026") —
 * filen der afslørede de tre importfejl 2026-08-24: månedsheaderen (række 4)
 * er adskilt fra alle datablokke af en tom række og har tom etiketcelle, og
 * NØGLETAL-sektionen (MRR/ARR/abonnenter) er tal OM forretningen, ikke
 * budgetbeløb. NB: kun "I alt 2026"-kolonnen bærer årstallet — månederne
 * hedder "Jan".."Dec" uden suffiks.
 */
describe("golden: gitter af Topix-resultatbudget 2026 (XLSX)", () => {
  const fixturePath = path.resolve(__dirname, "../__fixtures__/topix-resultatbudget-2026.xlsx");
  const res = laesMatrix(laesArkTilMatrix(fixturePath, "Budget 2026"));
  const g = byggGitter(res);

  it("fejl 1: den fritstående månedsheader (række 4) gælder alle fire datablokke", () => {
    expect(res.tabeller).toHaveLength(4);
    for (const t of res.tabeller) expect(t.headerRaekke).toBe(3);
  });

  it("kolonnenavnene er Jan…Dec + 'I alt 2026' — ikke 'Kolonne N'", () => {
    expect(g.kolonner).toEqual([
      "Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec", "I alt 2026",
    ]);
  });

  it("16 rækker; strukturen er 3 sektioner og 2 subtotaler", () => {
    expect(g.raekker).toHaveLength(16);
    expect(g.struktur.filter((s) => s.slags === "sektion").map((s) => s.etiket)).toEqual([
      "OMSÆTNING", "OMKOSTNINGER", "NØGLETAL",
    ]);
    expect(g.struktur.filter((s) => s.slags === "subtotal").map((s) => s.etiket)).toEqual([
      "OMSÆTNING I ALT", "OMKOSTNINGER I ALT",
    ]);
  });

  it("fejl 3: NØGLETAL er forvalgt som 'Ikke et budgetbeløb' — MRR/ARR/abonnenter fravalgt men synlige", () => {
    expect(erSektionUdeladt(g, "NØGLETAL")).toBe(true);
    const noegletal = g.raekker.filter((r) => r.sektion === "NØGLETAL");
    expect(noegletal.map((r) => r.etiket)).toEqual([
      "Aktive løbende medlemmer, ultimo",
      "MRR, ultimo (ekskl. moms)",
      "ARR, ultimo (MRR x 12)",
    ]);
    expect(noegletal.every((r) => !r.medtag)).toBe(true);
    // 16 minus de 3 nøgletals-rækker minus Overskudsgrad (forholdstal).
    expect(g.raekker.filter((r) => r.medtag)).toHaveLength(12);
  });

  it("'Overskudsgrad' er FRAVALGT med forholdstals-bemærkningen", () => {
    const r = g.raekker.find((x) => x.etiket === "Overskudsgrad")!;
    expect(r.bemaerkning).toBe("Fravalgt: ser ud til at være et forholdstal, ikke et beløb");
    expect(r.medtag).toBe(false);
  });

  it("RESULTAT FØR SKAT og Akkumuleret resultat står uden sektion — udelades via 'Ikke et budgetbeløb'", () => {
    const udenSektion = g.raekker.filter((r) => r.sektion === null);
    expect(udenSektion.map((r) => r.etiket)).toEqual([
      "RESULTAT FØR SKAT", "Overskudsgrad", "Akkumuleret resultat",
    ]);
    const udeladt = saetSektionUdeladt(g, null, true);
    const efter = udeladt.raekker.filter((r) => r.sektion === null);
    // Overskudsgraden er allerede fravalgt af sit eget forholdstals-værn
    // (og påvirkes ikke af sektionsvalget); de to andre fravælges her.
    expect(efter.map((r) => [r.etiket, r.medtag])).toEqual([
      ["RESULTAT FØR SKAT", false],
      ["Overskudsgrad", false],
      ["Akkumuleret resultat", false],
    ]);
  });

  it("eneste advarsel er fortegns-advarslen (omkostninger står positive i filen)", () => {
    expect(g.advarsler).toEqual([
      "Omkostningerne står som positive tal i din fil. Tjek at fortegnene er som du vil have dem.",
    ]);
  });

  it("spor 3: OMKOSTNINGER-sektionens fem linjer får hver deres gruppe-forvalg fra linjegættet", () => {
    // Sektionsvalg alene er for groft — én sektion, fem kategorier
    // (spor3-design §4.1). Software & It har intet linjegæt og følger
    // sektionens drift-fallback.
    const forvalg = g.raekker
      .filter((r) => r.sektion === "OMKOSTNINGER")
      .map((r) => [r.etiket, raekkeGruppe(g, r)]);
    expect(forvalg).toEqual([
      ["Direkte Omkostninger", "variable"],
      ["Salg & Marketing", "salg_marketing"],
      ["Software & It", "drift"],
      ["Personale", "personale"],
      ["Lokale & Administration", "faste"],
    ]);
  });
});

/**
 * GOLDEN mod de fem robusthed-fixtures — hver bygget til at bryde ÉN
 * antagelse (verificeret 2026-08-23, ~/Downloads/robusthed-resultat.md
 * efter de seks rettelser). Fastholder pr. fil: antal gitterrækker, antal
 * subtotaler, gitterets advarsler — og den ene fejlklasse der ALDRIG må
 * forekomme: at en række med tal hverken er gitterrække, struktur-note
 * eller header.
 */
describe("golden: robusthed-fixtures", () => {
  const robusthed = path.resolve(__dirname, "../__fixtures__/robusthed");

  /** Matrix-rækker med tal der hverken blev gitterrække, struktur eller header. */
  const tabteTalRaekker = (
    matrix: Matrix,
    res: ImportResultat,
    g: ReturnType<typeof byggGitter>,
  ): number[] => {
    const daekket = new Set<number>();
    for (const r of g.raekker) daekket.add(r.raekkeIndex);
    for (const s of g.struktur) daekket.add(s.raekkeIndex);
    for (const t of res.tabeller) if (t.headerRaekke !== null) daekket.add(t.headerRaekke);
    const tabte: number[] = [];
    matrix.forEach((raekke, ri) => {
      if (daekket.has(ri)) return;
      const harTal = (raekke ?? []).some(
        (c) =>
          typeof c === "number" ||
          (typeof c === "string" && laesTal(c, res.konvention).vaerdi !== null),
      );
      if (harTal) tabte.push(ri);
    });
    return tabte;
  };

  const koer = (matrix: Matrix) => {
    const res = laesMatrix(matrix);
    const g = byggGitter(res);
    return { res, g, tabte: tabteTalRaekker(matrix, res, g) };
  };

  it("01 — positive omkostninger: 11 rækker, 5 subtotaler, fortegns-advarsel, intet tal tabt", () => {
    const { g, tabte } = koer(laesArkTilMatrix(`${robusthed}/01-kvartal-positive-omkostninger.xlsx`, "Budget"));
    expect(g.raekker).toHaveLength(11);
    expect(g.struktur.filter((s) => s.slags === "subtotal")).toHaveLength(5);
    expect(g.advarsler).toEqual([
      "Omkostningerne står som positive tal i din fil. Tjek at fortegnene er som du vil have dem.",
    ]);
    expect(tabte).toEqual([]);
  });

  it("02 — transponeret: 12 rækker, 1 subtotal, transponerings-advarsel, intet tal tabt", () => {
    const { g, tabte } = koer(laesArkTilMatrix(`${robusthed}/02-transponeret.xlsx`, "Budget 2026"));
    expect(g.raekker).toHaveLength(12);
    expect(g.struktur.filter((s) => s.slags === "subtotal")).toHaveLength(1);
    expect(g.advarsler).toEqual([
      "Det ser ud til at dine måneder står som rækker og kategorierne som kolonner. Tjek at tabellen vender rigtigt.",
    ]);
    expect(tabte).toEqual([]);
  });

  it("03 — totaler øverst + flettede intervaller: 8 rækker, 3 subtotaler, sum 154000, intet tal tabt", () => {
    const { g, tabte } = koer(laesArkTilMatrix(`${robusthed}/03-flettede-total-oeverst.xlsx`, "Resultatbudget"));
    expect(g.raekker).toHaveLength(8);
    expect(g.struktur.filter((s) => s.slags === "subtotal")).toHaveLength(3);
    expect(g.advarsler).toEqual([]);
    expect(g.kolonner[0]).toBe("Jan-feb");
    // Summen viser de normaliserede (skrevne) beløb: alle rækker er uden
    // sektion → drift → omkostningerne tælles positivt (742+186+402 tkr.).
    expect(opsummer(g).sum[0]).toBe(1330000);
    expect(tabte).toEqual([]);
  });

  it("04 — semikolon-dansk: 11 rækker, 4 subtotaler, 12 kolonner (halekolonner væk), intet tal tabt", () => {
    const csv = fs.readFileSync(`${robusthed}/04-semikolon-dansk.csv`, "utf-8");
    const { res, g, tabte } = koer(parseCsvTilMatrix(csv, ";"));
    expect(res.konvention).toMatchObject({ tusind: ".", decimal: "," });
    expect(g.raekker).toHaveLength(11);
    expect(g.struktur.filter((s) => s.slags === "subtotal")).toHaveLength(4);
    expect(g.advarsler).toEqual([]);
    expect(g.kolonner).toHaveLength(12);
    expect(tabte).toEqual([]);
  });

  it("05 — engelsk fire år: 6 rækker, 3 subtotaler, forholdstal ude af summen, intet tal tabt", () => {
    const { g, tabte } = koer(laesArkTilMatrix(`${robusthed}/05-engelsk-fire-aar.xlsx`, "Consolidated"));
    expect(g.raekker).toHaveLength(6);
    expect(g.struktur.filter((s) => s.slags === "subtotal")).toHaveLength(3);
    expect(g.advarsler).toEqual([]);
    // Normaliserede summer: costs positive (revenue+cogs+opex adderet).
    expect(opsummer(g).sum).toEqual([9520, 10050, 11040, 11800, 13280, 14150, 15460, 16540]);
    expect(tabte).toEqual([]);
  });
});
