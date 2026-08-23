import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { parseCsvTilMatrix } from "./csvTestHelper";
import {
  detekterTalKonvention,
  findTabeller,
  klassificerRaekker,
  laesMatrix,
  laesTal,
  type Felt,
  type Matrix,
  type Raekke,
  type TalKonvention,
} from "@/lib/importEngine";

const US: TalKonvention = { tusind: ",", decimal: ".", sikkerhed: "hoej" };
const DK: TalKonvention = { tusind: ".", decimal: ",", sikkerhed: "hoej" };

const felt = (vaerdi: number | null): Felt => ({
  vaerdi,
  kilde: vaerdi === null ? "tom" : "tal",
  raa: vaerdi === null ? "" : String(vaerdi),
});

const raekke = (
  raekkeIndex: number,
  etiket: string,
  vaerdier: (number | null)[],
): Raekke => ({ raekkeIndex, etiket, type: "post", felter: vaerdier.map(felt) });

/** Syntetisk fixture med alle fem fælder fra designdokumentet §1 på én gang:
    (1) negative tal i parentes, (2) komma som tusindtalsseparator,
    (3) subtotal direkte under de detaljelinjer den summerer,
    (4) bindestreg og tom celle side om side, (5) to tabeller i samme matrix
    hvor den første er et lille nøgletals-resumé med værdi i kolonne B. */
const REMM_FIXTURE: Matrix = [
  ["Remm ApS", null, null, null],                       // 0  titel (over resumé-blok)
  [null, null, null, null],                             // 1  tom række — blokskel
  ["Nøgletal", "Værdi", "Kommentar", null],             // 2  resumé uden periode-header
  ["Omsætningsmål", "2,700,000", "helår", null],        // 3  komma-tusinde (fælde 2)
  ["Resultatmål", "(17,000)", "underskud Q1", null],    // 4  parentes-negativ (fælde 1)
  [null, null, null, null],                             // 5  tom række — blokskel
  ["Post", "Jan", "Feb", "I alt"],                      // 6  månedstabel-header (fælde 5)
  ["Salg indland", "1,000", "2,000", "3,000"],          // 7
  ["Salg eksport", "500", "-", ""],                     // 8  bindestreg + tom (fælde 4)
  ["Subtotal salg", "1,500", "2,000", "3,000"],         // 9  subtotal under posterne (fælde 3)
  ["Fragt", "(100)", "(200)", "(300)"],                 // 10
];

// ───────────────────────── detekterTalKonvention ─────────────────────────

describe("detekterTalKonvention", () => {
  it("amerikansk: gentaget komma i '2,700,000' afgør tusind=',', decimal='.'", () => {
    const k = detekterTalKonvention([["2,700,000"], ["1,234,567"]]);
    expect(k.tusind).toBe(",");
    expect(k.decimal).toBe(".");
    expect(k.sikkerhed).toBe("hoej");
  });

  it("dansk: '2.700.000,50' afgør tusind='.', decimal=','", () => {
    const k = detekterTalKonvention([["2.700.000,50"], ["10.000"]]);
    expect(k.tusind).toBe(".");
    expect(k.decimal).toBe(",");
    expect(k.sikkerhed).toBe("hoej");
  });

  it("tvetydig enkelt separator ('2,700' alene) afgør ikke sikkert — sikkerhed 'lav'", () => {
    const k = detekterTalKonvention([["2,700"], ["1,500"]]);
    expect(k.sikkerhed).toBe("lav");
    expect(k.tusind).toBe(",");
  });

  it("fil uden entydige signaler får sikkerhed 'lav'", () => {
    const k = detekterTalKonvention([["Budget", "3,000"], ["Løn", "1,200"]]);
    expect(k.sikkerhed).toBe("lav");
  });

  it("én entydig forekomst løfter en fil fuld af tvetydige til 'hoej'", () => {
    const k = detekterTalKonvention([["2,700"], ["2,700,000"]]);
    expect(k.tusind).toBe(",");
    expect(k.sikkerhed).toBe("hoej");
  });

  it("decimal-signal alene: '63,5' giver decimal=','", () => {
    const k = detekterTalKonvention([["63,5"]]);
    expect(k.decimal).toBe(",");
    expect(k.tusind).toBe(".");
    expect(k.sikkerhed).toBe("hoej");
  });

  it("tom matrix kaster ikke og giver 'ingen' tusindtalsseparator", () => {
    const k = detekterTalKonvention([]);
    expect(k.tusind).toBe("ingen");
  });
});

// ───────────────────────── laesTal ─────────────────────────

describe("laesTal", () => {
  it("'(17,000)' → -17000 under amerikansk konvention, kilde 'parentes'", () => {
    const f = laesTal("(17,000)", US);
    expect(f.vaerdi).toBe(-17000);
    expect(f.kilde).toBe("parentes");
    expect(f.raa).toBe("(17,000)");
  });

  it("'(17.000)' → -17000 under dansk konvention, kilde 'parentes'", () => {
    const f = laesTal("(17.000)", DK);
    expect(f.vaerdi).toBe(-17000);
    expect(f.kilde).toBe("parentes");
  });

  it("bindestreg → 0 med kilde 'bindestreg'; tom → null med kilde 'tom' — de kan skelnes", () => {
    const streg = laesTal("-", US);
    const tom = laesTal("", US);
    expect(streg).toMatchObject({ vaerdi: 0, kilde: "bindestreg" });
    expect(tom).toMatchObject({ vaerdi: null, kilde: "tom" });
    expect(streg.kilde).not.toBe(tom.kilde);
  });

  it("'63.3%' → kilde 'procent' med værdien som tal", () => {
    const f = laesTal("63.3%", US);
    expect(f.vaerdi).toBeCloseTo(63.3);
    expect(f.kilde).toBe("procent");
  });

  it("ledende og efterstillet minus giver negativt fortegn", () => {
    expect(laesTal("-1,234", US).vaerdi).toBe(-1234);
    expect(laesTal("1.234-", DK).vaerdi).toBe(-1234);
  });

  it("valutategn og hårde mellemrum strippes", () => {
    expect(laesTal("kr. 2.700.000,50", DK).vaerdi).toBeCloseTo(2700000.5);
    expect(laesTal("1 234 567", { tusind: " ", decimal: ",", sikkerhed: "hoej" }).vaerdi).toBe(1234567);
  });

  it("ulæselig streng → null med kilde 'ulaeselig' — kaster aldrig", () => {
    const f = laesTal("ikke et tal", US);
    expect(f).toMatchObject({ vaerdi: null, kilde: "ulaeselig", raa: "ikke et tal" });
  });

  it("dansk decimal: '63,3' → 63.3 med kilde 'tal'", () => {
    const f = laesTal("63,3", DK);
    expect(f.vaerdi).toBeCloseTo(63.3);
    expect(f.kilde).toBe("tal");
  });
});

// ───────────────────────── findTabeller ─────────────────────────

describe("findTabeller", () => {
  it("finder to tabeller i samme matrix med korrekte grænser (fælde 5)", () => {
    const graenser = findTabeller(REMM_FIXTURE);
    expect(graenser).toHaveLength(2);
    // Resumé-blokken har ingen periode-header → headerløs tabel.
    expect(graenser[0]).toEqual({
      headerRaekke: null,
      foersteDataRaekke: 2,
      sidsteDataRaekke: 4,
    });
    // Månedstabellen starter ved header-rækken med Jan/Feb/I alt.
    expect(graenser[1]).toEqual({
      headerRaekke: 6,
      foersteDataRaekke: 7,
      sidsteDataRaekke: 10,
    });
  });

  it("månedsnavn med suffiks ('Januar-26', 'jan/2026', 'Marts.26') genkendes som periode-header", () => {
    for (const header of [
      ["Post", "Januar-26", "Februar-26"],
      ["Post", "jan/2026", "feb/2026"],
      ["Post", "Marts.26", "April.26"],
      ["Post", "Maj 2026", "Juni 2026"],
    ]) {
      const graenser = findTabeller([header, ["Løn", "1", "2"]]);
      expect(graenser, header.join(",")).toEqual([
        { headerRaekke: 0, foersteDataRaekke: 1, sidsteDataRaekke: 1 },
      ]);
    }
  });

  it("måneds-intervaller og halvår genkendes som periode-header", () => {
    for (const header of [
      ["Konto", "Jan-feb", "Mar-apr"],
      ["Konto", "maj/jun", "jul/aug"],
      ["Post", "1. halvår", "2. halvår"],
      ["Post", "H1", "H2"],
    ]) {
      const graenser = findTabeller([header, ["Løn", "1", "2"]]);
      expect(graenser, header.join(",")).toEqual([
        { headerRaekke: 0, foersteDataRaekke: 1, sidsteDataRaekke: 1 },
      ]);
    }
  });

  it("to header-tabeller i samme blok: næste header afslutter den første", () => {
    const m: Matrix = [
      ["Post", "Jan", "Feb"],
      ["A", "1", "2"],
      ["Post", "Q1", "Q2"],
      ["B", "3", "4"],
    ];
    const graenser = findTabeller(m);
    expect(graenser).toEqual([
      { headerRaekke: 0, foersteDataRaekke: 1, sidsteDataRaekke: 1 },
      { headerRaekke: 2, foersteDataRaekke: 3, sidsteDataRaekke: 3 },
    ]);
  });

  it("rækker over blokkens første header hører ikke til nogen tabel", () => {
    const m: Matrix = [
      ["Driftsbudget 2026 — noter uden tal", null, null],
      ["Post", "Jan", "Feb"],
      ["A", "1", "2"],
    ];
    const graenser = findTabeller(m);
    expect(graenser).toHaveLength(1);
    expect(graenser[0].headerRaekke).toBe(1);
    expect(graenser[0].foersteDataRaekke).toBe(2);
  });

  it("ren tekstblok uden tal bliver ikke til en tabel", () => {
    expect(findTabeller([["Kun en titel", null], ["og en note", null]])).toHaveLength(0);
  });

  it("tom matrix kaster ikke", () => {
    expect(findTabeller([])).toEqual([]);
  });
});

// ───────────────────────── klassificerRaekker ─────────────────────────

describe("klassificerRaekker", () => {
  it("subtotal findes på tværs af tolv kolonner og dækker blokken over sig", () => {
    const a = Array.from({ length: 12 }, (_, i) => 100 + i);
    const b = Array.from({ length: 12 }, (_, i) => 200 + 2 * i);
    const sum = a.map((v, i) => v + b[i]);
    const rows = [raekke(0, "Løn", a), raekke(1, "Pension", b), raekke(2, "Personale i alt", sum)];
    const ud = klassificerRaekker(rows);
    expect(ud[2].type).toBe("subtotal");
    expect(ud[2].daekker).toEqual([0, 1]);
    expect(ud[0].type).toBe("post");
    expect(ud[1].type).toBe("post");
  });

  it("subtotal findes IKKE når kun én kolonne tilfældigvis summer", () => {
    // Kolonne 0 summer (10+20=30), de øvrige elleve gør ikke.
    const a = [10, ...Array.from({ length: 11 }, () => 5)];
    const b = [20, ...Array.from({ length: 11 }, () => 7)];
    const kandidat = [30, ...Array.from({ length: 11 }, () => 999)];
    const ud = klassificerRaekker([raekke(0, "A", a), raekke(1, "B", b), raekke(2, "Total?", kandidat)]);
    expect(ud[2].type).toBe("post");
    expect(ud[2].daekker).toBeUndefined();
  });

  it("ordet 'subtotal' i etiketten afgør ikke alene — uden sum-match forbliver rækken post", () => {
    const ud = klassificerRaekker([
      raekke(0, "A", [10, 10]),
      raekke(1, "B", [10, 10]),
      raekke(2, "Subtotal", [500, 500]),
    ]);
    expect(ud[2].type).toBe("post");
  });

  it("tolerance: 2 absolut pr. kolonne accepteres", () => {
    const ud = klassificerRaekker([
      raekke(0, "A", [100, 100]),
      raekke(1, "B", [200, 200]),
      raekke(2, "I alt", [301, 298]),
    ]);
    expect(ud[2].type).toBe("subtotal");
  });

  it("sektionsoverskrift: etiket uden tal efterfulgt af talrækker", () => {
    const rows = [
      { ...raekke(0, "Personale", []), felter: [felt(null), felt(null)] },
      raekke(1, "Løn", [10, 20]),
      raekke(2, "Pension", [5, 5]),
    ];
    const ud = klassificerRaekker(rows);
    expect(ud[0].type).toBe("sektion");
  });

  it("støj: hverken etiket eller tal", () => {
    const ud = klassificerRaekker([
      { ...raekke(0, "", []), felter: [felt(null), felt(null)] },
      raekke(1, "Løn", [10, 20]),
    ]);
    expect(ud[0].type).toBe("stoej");
  });

  it("sektion mellem poster bryder IKKE blokken — den bidrager med nul", () => {
    const rows = [
      raekke(0, "A", [100, 100]),
      { ...raekke(1, "Ny sektion", []), felter: [felt(null), felt(null)] },
      raekke(2, "B", [200, 200]),
      raekke(3, "Hovedtotal", [300, 300]), // A+B hen over sektionen
    ];
    const ud = klassificerRaekker(rows);
    expect(ud[1].type).toBe("sektion");
    expect(ud[3].type).toBe("subtotal");
    expect(ud[3].daekker).toEqual([0, 2]);
  });

  it("muterer ikke input", () => {
    const rows = [raekke(0, "A", [1, 1]), raekke(1, "B", [2, 2]), raekke(2, "Sum", [3, 3])];
    const kopi = JSON.parse(JSON.stringify(rows));
    klassificerRaekker(rows);
    expect(rows).toEqual(kopi);
  });

  it("én talkolonne der summer to rækker over, UDEN støttende etiket → post", () => {
    const ud = klassificerRaekker([
      raekke(0, "A", [10]),
      raekke(1, "B", [20]),
      raekke(2, "Rest", [30]),
    ]);
    expect(ud[2].type).toBe("post");
    expect(ud[2].daekker).toBeUndefined();
  });

  it("samme række MED etiketten 'I alt' → subtotal (struktur + etiket = to signaler)", () => {
    const ud = klassificerRaekker([
      raekke(0, "A", [10]),
      raekke(1, "B", [20]),
      raekke(2, "I alt", [30]),
    ]);
    expect(ud[2].type).toBe("subtotal");
    expect(ud[2].daekker).toEqual([0, 1]);
  });

  it("to talkolonner der begge summer klarer sig uden etiket-støtte", () => {
    const ud = klassificerRaekker([
      raekke(0, "A", [10, 100]),
      raekke(1, "B", [20, 200]),
      raekke(2, "Resten", [30, 300]),
    ]);
    expect(ud[2].type).toBe("subtotal");
    expect(ud[2].daekker).toEqual([0, 1]);
  });

  it("nulrækker: |0−0| ≤ 2 er ikke bevis — uden etiket-støtte forbliver rækken post", () => {
    const ud = klassificerRaekker([
      raekke(0, "D2C Fragt & emballage", [0, 0, 0]),
      raekke(1, "B2B Vareforbrug", [0, 0, 0]),
      raekke(2, "B2B Fragt & emballage", [0, 0, 0]),
    ]);
    expect(ud.map((r) => r.type)).toEqual(["post", "post", "post"]);
  });

  it("nulrække MED etiket-støtte må stadig være subtotal (to signaler)", () => {
    const ud = klassificerRaekker([
      raekke(0, "A", [0, 0]),
      raekke(1, "B", [0, 0]),
      raekke(2, "I alt", [0, 0]),
    ]);
    expect(ud[2].type).toBe("subtotal");
  });

  it("én informativ kolonne (|v| > 2) er nok til at strukturen bærer igen", () => {
    const ud = klassificerRaekker([
      raekke(0, "A", [0, 5]),
      raekke(1, "B", [0, 7]),
      raekke(2, "Resten", [0, 12]),
    ]);
    expect(ud[2].type).toBe("subtotal");
    expect(ud[2].daekker).toEqual([0, 1]);
  });

  it("total OVER sine detaljer findes nedad og dækker hele gruppen", () => {
    const ud = klassificerRaekker([
      raekke(0, "Nettoomsætning", [742000, 806000]),
      raekke(1, "  Konsultationer", [498000, 541000]),
      raekke(2, "  Behandlinger", [201000, 219000]),
      raekke(3, "  Salg af produkter", [43000, 46000]),
    ]);
    expect(ud[0].type).toBe("subtotal");
    expect(ud[0].daekker).toEqual([1, 2, 3]);
    expect(ud.slice(1).map((r) => r.type)).toEqual(["post", "post", "post"]);
  });

  it("nedad gælder GRUPPE-semantik: et præfiks-match uden hele blokken er ikke bevis (Contribe-regressionen)", () => {
    // -200 = -75 + -125 (de to første under) — men blokken fortsætter til -125 mere.
    const ud = klassificerRaekker([
      raekke(0, "Shopify App, Contribe", [-200, -200]),
      raekke(1, "Shopify App, Hideapp", [-75, -75]),
      raekke(2, "Shopify App, JudgeMe", [-125, -125]),
      raekke(3, "Shopify App, EZ Market Translate", [-125, -125]),
    ]);
    expect(ud[0].type).toBe("post");
  });

  it("nedad-søgningen stopper ved næste subtotal — der summes aldrig hen over den", () => {
    const ud = klassificerRaekker([
      raekke(0, "X", [100, 100]), // 100 = D+E+F, men F ligger på den anden side af subtotalen
      raekke(1, "D", [15, 15]),
      raekke(2, "E", [15, 15]),
      raekke(3, "I alt", [30, 30]), // subtotal for D+E (opad)
      raekke(4, "F", [70, 70]),
    ]);
    expect(ud[3].type).toBe("subtotal");
    expect(ud[3].daekker).toEqual([1, 2]);
    expect(ud[0].type).toBe("post"); // blokken [D,E] stopper ved subtotalen: 30 ≠ 100
  });

  it("etiket med kun ulæselige felter → post, ikke stoej ('Blended ROAS'-casen)", () => {
    const ud = klassificerRaekker([
      {
        ...raekke(0, "Blended ROAS", []),
        felter: [{ vaerdi: null, kilde: "ulaeselig", raa: "3.6x" } as Felt, felt(null)],
      },
    ]);
    expect(ud[0].type).toBe("post");
  });

  it("hverken etiket eller indhold → stoej", () => {
    const ud = klassificerRaekker([{ ...raekke(0, "", []), felter: [felt(null), felt(null)] }]);
    expect(ud[0].type).toBe("stoej");
  });

  it("indlejrede overskrifter: overskrift → overskrift → talrækker giver to sektioner", () => {
    const ud = klassificerRaekker([
      { ...raekke(0, "Fixed Expenses", []), felter: [felt(null), felt(null)] },
      { ...raekke(1, "Personale & konsulentydelser", []), felter: [felt(null), felt(null)] },
      raekke(2, "Chatrine Løn", [20000, 20000]),
    ]);
    expect(ud[0].type).toBe("sektion");
    expect(ud[1].type).toBe("sektion");
  });

  it("afsluttende etiketrække uden tal efter sig → stoej", () => {
    const ud = klassificerRaekker([
      raekke(0, "Løn", [10, 20]),
      { ...raekke(1, "Note: alle beløb ex. moms", []), felter: [felt(null), felt(null)] },
    ]);
    expect(ud[1].type).toBe("stoej");
  });

  it("hovedtotal på tværs af seks sektioner: summer alle detaljerækker hen over sektioner og subtotaler", () => {
    const rows: Raekke[] = [];
    const alleDetaljer: number[] = [];
    let idx = 0;
    let total1 = 0;
    let total2 = 0;
    for (let s = 0; s < 6; s++) {
      rows.push({ ...raekke(idx++, `Sektion ${s + 1}`, []), felter: [felt(null), felt(null)] });
      const a = 10 * (s + 1);
      const b = 7 * (s + 1);
      rows.push(raekke(idx, `Post ${s + 1}a`, [a, a * 2]));
      alleDetaljer.push(idx++);
      total1 += a;
      total2 += a * 2;
      rows.push(raekke(idx, `Post ${s + 1}b`, [b, b * 3]));
      alleDetaljer.push(idx++);
      total1 += b;
      total2 += b * 3;
      rows.push(raekke(idx++, `Subtotal ${s + 1}`, [a + b, a * 2 + b * 3]));
    }
    rows.push(raekke(idx, "Total Fixed Expenses", [total1, total2]));

    const ud = klassificerRaekker(rows);
    for (let s = 0; s < 6; s++) {
      expect(ud[s * 4 + 3].type).toBe("subtotal");
      expect(ud[s * 4 + 3].daekker).toEqual([s * 4 + 1, s * 4 + 2]);
    }
    const hoved = ud[ud.length - 1];
    expect(hoved.type).toBe("subtotal");
    expect(hoved.daekker).toEqual(alleDetaljer);
  });
});

// ───────────────────────── laesMatrix ─────────────────────────

describe("laesMatrix", () => {
  it("læser Remm-fixturen: alle fem fælder i én matrix", () => {
    const res = laesMatrix(REMM_FIXTURE);

    // Fælde 2: komma-tusinde detekteret på filniveau.
    expect(res.konvention.tusind).toBe(",");
    expect(res.konvention.decimal).toBe(".");

    // Fælde 5: to tabeller — resumé (værdi i kolonne B) og månedstabel.
    expect(res.tabeller).toHaveLength(2);
    const [resume, maaneder] = res.tabeller;

    // Resuméets første række ("Nøgletal"/"Værdi"/"Kommentar") promoveres til
    // overskriftsrække — tekst i kolonne 0 OG i andre kolonner, tal nedenunder.
    expect(resume.headerRaekke).toBe(2);
    expect(resume.kolonneOverskrifter.slice(0, 3)).toEqual(["Nøgletal", "Værdi", "Kommentar"]);
    expect(resume.foersteDataRaekke).toBe(3);
    expect(resume.raekker.map((r) => r.etiket)).toEqual(["Omsætningsmål", "Resultatmål"]);
    // Resuméets værdier bor i kolonne B → felt[0].
    expect(resume.raekker[0].felter[0].vaerdi).toBe(2700000);
    // Fælde 1: parentes-negativ.
    expect(resume.raekker[1].felter[0]).toMatchObject({ vaerdi: -17000, kilde: "parentes" });

    expect(maaneder.headerRaekke).toBe(6);
    expect(maaneder.kolonneOverskrifter).toEqual(["Post", "Jan", "Feb", "I alt"]);

    // Fælde 4: bindestreg og tom celle side om side — samme række, forskellig kilde.
    const eksport = maaneder.raekker.find((r) => r.etiket === "Salg eksport")!;
    expect(eksport.felter[1]).toMatchObject({ vaerdi: 0, kilde: "bindestreg" });
    expect(eksport.felter[2]).toMatchObject({ vaerdi: null, kilde: "tom" });

    // Fælde 3: subtotalen under detaljelinjerne genkendes på summen
    // (Jan: 1000+500=1500; Feb: 2000+0=2000; I alt: 3000+null=3000).
    const subtotal = maaneder.raekker.find((r) => r.etiket === "Subtotal salg")!;
    expect(subtotal.type).toBe("subtotal");
    expect(subtotal.daekker).toEqual([7, 8]);

    // Etiketter bevares ordret (P3).
    expect(maaneder.raekker.map((r) => r.etiket)).toEqual([
      "Salg indland",
      "Salg eksport",
      "Subtotal salg",
      "Fragt",
    ]);
  });

  it("ulæselig celle giver en række der stadig kommer med (P1) — plus en advarsel", () => {
    // To rækker så Feb-kolonnen er BLANDET (tal + tekst) — en ren
    // tekstkolonne ville med rette være advarsels-fri (se tekstKolonner).
    const res = laesMatrix([
      ["Post", "Jan", "Feb"],
      ["Løn", "1,000", "ikke et tal"],
      ["Husleje", "2,000", "3,000"],
    ]);
    const row = res.tabeller[0].raekker[0];
    expect(row.etiket).toBe("Løn");
    expect(row.felter[1]).toMatchObject({ vaerdi: null, kilde: "ulaeselig", raa: "ikke et tal" });
    expect(res.advarsler.some((a) => a.includes("kunne ikke læses"))).toBe(true);
  });

  it("ren kommentarkolonne: ingen ulæselig-advarsel og korrekt indeks i tekstKolonner", () => {
    const res = laesMatrix([
      ["Post", "Jan", "Feb", "Kommentar"],
      ["Løn", "1,000", "2,000", "fastansatte"],
      ["Husleje", "3,000", "4,000", "kontor + lager"],
    ]);
    const tabel = res.tabeller[0];
    // Kolonneindeks er relative til felter (kolonne 0 skåret fra): Kommentar = 2.
    expect(tabel.tekstKolonner).toEqual([2]);
    expect(res.advarsler.some((a) => a.includes("kunne ikke læses"))).toBe(false);
    // Feltet bevares som det er, så gitteret kan vise indholdet (P1/P3).
    expect(tabel.raekker[0].felter[2]).toMatchObject({
      vaerdi: null,
      kilde: "ulaeselig",
      raa: "fastansatte",
    });
  });

  it("blandet tal/tekst-kolonne er IKKE tekstkolonne — dens ulæselige celler tæller stadig", () => {
    const res = laesMatrix([
      ["Post", "Jan", "Feb", "Note"],
      ["A", "1,000", "5,000", "2,000"],
      ["B", "2,000", "6,000", "tekst"],
    ]);
    const tabel = res.tabeller[0];
    expect(tabel.tekstKolonner).toEqual([]);
    expect(res.advarsler.some((a) => a.includes("kunne ikke læses"))).toBe(true);
    expect(tabel.raekker[1].felter[2]).toMatchObject({ vaerdi: null, kilde: "ulaeselig" });
  });

  it("talceller (number) læses direkte uden konvention", () => {
    const res = laesMatrix([
      ["Post", "Jan", "Feb"],
      ["Løn", 1000.5, -200],
    ]);
    expect(res.tabeller[0].raekker[0].felter.map((f) => f.vaerdi)).toEqual([1000.5, -200]);
  });

  it("lav sikkerhed på konventionen giver en advarsel", () => {
    const res = laesMatrix([
      ["Post", "Jan", "Feb"],
      ["Løn", "2,700", "1,500"],
    ]);
    expect(res.konvention.sikkerhed).toBe("lav");
    expect(res.advarsler.some((a) => a.includes("usikker"))).toBe(true);
  });

  it("matrix uden genkendelig tabelstruktur lander i én headerløs tabel (P1)", () => {
    const res = laesMatrix([["Løn", "1000"], ["Husleje", "2000"]]);
    expect(res.tabeller).toHaveLength(1);
    expect(res.tabeller[0].headerRaekke).toBeNull();
    expect(res.tabeller[0].raekker).toHaveLength(2);
  });

  it("headerløs tabel: første række med tekst i flere kolonner promoveres til overskriftsrække", () => {
    const res = laesMatrix([
      ["KPI", "Årstotal", "Kommentar"],
      ["Revenue", "2,700,000", "Netto"],
      ["Net Profit", "188,724", "Efter faste"],
    ]);
    const t = res.tabeller[0];
    expect(t.headerRaekke).toBe(0);
    expect(t.kolonneOverskrifter).toEqual(["KPI", "Årstotal", "Kommentar"]);
    expect(t.foersteDataRaekke).toBe(1);
    expect(t.raekker.map((r) => r.etiket)).toEqual(["Revenue", "Net Profit"]);
  });

  it("header-promovering ser på de første TRE rækker — titelrækker over headeren droppes", () => {
    const res = laesMatrix([
      ["Nordlys Klinik 2026", null, null],
      ["Konto", "Årstotal", "Note"],
      ["Løn", "1.000", "x"],
    ]);
    const t = res.tabeller[0];
    expect(t.headerRaekke).toBe(1);
    expect(t.kolonneOverskrifter).toEqual(["Konto", "Årstotal", "Note"]);
    expect(t.foersteDataRaekke).toBe(2);
    expect(t.raekker.map((r) => r.etiket)).toEqual(["Løn"]);
  });

  it("headerløs tabel: første række med tekst KUN i kolonne 0 promoveres ikke — forbliver sektion", () => {
    const res = laesMatrix([
      ["Gross Profit", null, null],
      ["Nettoomsætning", "1,000", "2,000"],
    ]);
    const t = res.tabeller[0];
    expect(t.headerRaekke).toBeNull();
    expect(t.kolonneOverskrifter).toEqual([]);
    expect(t.raekker[0].type).toBe("sektion");
    expect(t.raekker).toHaveLength(2);
  });

  it("tom matrix kaster ikke og giver tomt resultat uden advarsler", () => {
    const res = laesMatrix([]);
    expect(res.tabeller).toEqual([]);
    expect(res.advarsler).toEqual([]);
  });

  it("muterer ikke input-matrixen", () => {
    const m: Matrix = [["Post", "Jan"], ["Løn", "1,000"]];
    const kopi = JSON.parse(JSON.stringify(m));
    laesMatrix(m);
    expect(m).toEqual(kopi);
  });
});

// ───────────────────────── Golden: ægte medlemsfil ─────────────────────────

/**
 * GOLDEN-TEST mod en ÆGTE medlemsfil (Remm ApS, driftsbudget 2026 BASE).
 *
 * Tallene herunder er verificeret manuelt mod medlemmets fil 2026-08-23
 * (~/Downloads/remm-resultat-2.md, prøvekørslen efter de fire rettelser).
 * Ændrer en assertion sig, har MOTOREN ændret adfærd på en rigtig fil —
 * det er et fund der skal forstås, ikke en test der skal rettes.
 * Samme mønster som pdfStructuralExtractor.test.ts' golden fixture.
 */
describe("golden: Remm-budget 2026", () => {
  const fixturePath = path.resolve(__dirname, "../__fixtures__/remm-budget-base-2026.csv");
  const matrix = parseCsvTilMatrix(fs.readFileSync(fixturePath, "utf-8"));
  const res = laesMatrix(matrix);
  const alleRaekker = res.tabeller.flatMap((t) => t.raekker);
  const raekkeVed = (idx: number): Raekke => {
    const r = alleRaekker.find((x) => x.raekkeIndex === idx);
    expect(r, `raekkeIndex ${idx} findes i en tabel`).toBeDefined();
    return r as Raekke;
  };

  it("konvention: tusind ',', decimal '.', sikkerhed 'hoej'", () => {
    expect(res.konvention).toEqual({ tusind: ",", decimal: ".", sikkerhed: "hoej" });
  });

  it("advarsler: præcis 1, og den handler om ulæselige celler", () => {
    expect(res.advarsler).toHaveLength(1);
    expect(res.advarsler[0]).toContain("kunne ikke læses");
  });

  it("seks tabeller", () => {
    expect(res.tabeller).toHaveLength(6);
  });

  it("rækketyper på tværs af alle tabeller: 63 post, 11 sektion, 13 subtotal, 0 stoej", () => {
    const tael: Record<string, number> = { post: 0, sektion: 0, subtotal: 0, stoej: 0 };
    for (const r of alleRaekker) tael[r.type]++;
    expect(tael).toEqual({ post: 63, sektion: 11, subtotal: 13, stoej: 0 });
  });

  it("feltkilder i alt: 92 bindestreg, 576 parentes, 42 procent, 133 tal, 276 tom, 12 ulaeselig", () => {
    const tael: Record<string, number> = {
      bindestreg: 0, parentes: 0, procent: 0, tal: 0, tom: 0, ulaeselig: 0,
    };
    for (const r of alleRaekker) for (const f of r.felter) tael[f.kilde]++;
    expect(tael).toEqual({
      bindestreg: 92, parentes: 576, procent: 42, tal: 133, tom: 276, ulaeselig: 12,
    });
  });

  it("tabel 1: promoveret KPI-header, foersteDataRaekke 4, tekstKolonner [1]", () => {
    const t1 = res.tabeller[0];
    expect(t1.headerRaekke).toBe(3);
    expect(t1.kolonneOverskrifter.slice(0, 3)).toEqual(["KPI", "Årstotal", "Kommentar"]);
    expect(t1.foersteDataRaekke).toBe(4);
    expect(t1.tekstKolonner).toEqual([1]);
  });

  it("fælde 1 — parentes-negativ: 'B2C Product Cost / COGS' felt0 = -17000 (parentes)", () => {
    const r = raekkeVed(26);
    expect(r.etiket).toBe("B2C Product Cost / COGS");
    expect(r.felter[0]).toMatchObject({ vaerdi: -17000, kilde: "parentes" });
  });

  it("fælde 2 — komma-tusinde: 'Revenue' felt0 = 2700000", () => {
    const r = raekkeVed(4);
    expect(r.etiket).toBe("Revenue");
    expect(r.felter[0].vaerdi).toBe(2700000);
  });

  it("fælde 3 — subtotal under detaljelinjer: 'Order Expenses' daekker [26..32]", () => {
    const r = raekkeVed(33);
    expect(r.etiket).toBe("Order Expenses");
    expect(r.type).toBe("subtotal");
    expect(r.daekker).toEqual([26, 27, 28, 29, 30, 31, 32]);
  });

  it("fælde 4 — bindestreg vs. tom kan skelnes: 'B2B salg' (0/bindestreg) og 'Corpay' (null/tom)", () => {
    const b2b = raekkeVed(21);
    expect(b2b.etiket).toBe("B2B salg");
    expect(b2b.felter[0]).toMatchObject({ vaerdi: 0, kilde: "bindestreg" });

    const corpay = raekkeVed(55);
    expect(corpay.etiket).toBe("Corpay");
    expect(corpay.felter[0]).toMatchObject({ vaerdi: null, kilde: "tom" });
  });

  it("fælde 5 — flere tabeller: tabel 2 har måneds-header på række 16", () => {
    const t2 = res.tabeller[1];
    expect(t2.headerRaekke).toBe(16);
    expect(t2.kolonneOverskrifter[1]).toBe("Januar");
  });

  it("fejl 1-rettelsen: 'Blended ROAS' er post med raa '3.6x' — ikke støj", () => {
    const r = raekkeVed(14);
    expect(r.etiket).toBe("Blended ROAS");
    expect(r.type).toBe("post");
    expect(r.felter[0].raa).toBe("3.6x");
  });

  it("fejl 2-rettelsen: 'Fixed Expenses' er sektion", () => {
    const r = raekkeVed(43);
    expect(r.etiket).toBe("Fixed Expenses");
    expect(r.type).toBe("sektion");
  });

  it("fejl 3-rettelsen: 'Total Fixed Expenses' er subtotal og dækker præcis 34 rækker", () => {
    const r = raekkeVed(90);
    expect(r.etiket).toBe("Total Fixed Expenses");
    expect(r.type).toBe("subtotal");
    expect(r.daekker).toHaveLength(34);
  });

  it("fejl 4-rettelsen: ingen række i nogen tabel er støj", () => {
    expect(alleRaekker.filter((r) => r.type === "stoej")).toEqual([]);
  });
});
