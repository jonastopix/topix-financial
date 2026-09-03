import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  udledBranchekode,
  normaliserBranchekode,
  DB25_AFDELINGER,
  DB25_GRUPPER,
  DB25_KLASSER,
  DB25_UNDERKLASSER,
} from "@/lib/branchekode";
import { ALLE_BRANCHER, INDUSTRY_OPTIONS, findBranche } from "@/lib/brancher";

// ── Måleapparatet: hele DB25-registret og benchmark-seedet ────────────────
//
// Fixturen er Danmarks Statistiks fulde DB25-liste (738 underklasser, hentet
// 3/9 2026). Seedet er de to migrationer der fylder industry_benchmarks. Begge
// læses som tekst, så testen måler mod det der faktisk ligger i repoet — ikke
// mod en liste skrevet af i testen.

const her = path.dirname(fileURLToPath(import.meta.url));

const DB25 = readFileSync(path.resolve(her, "../__fixtures__/db25-branchekoder.txt"), "utf-8")
  .split("\n")
  .filter(l => l && !l.startsWith("#"))
  .map(l => {
    const [kode, titel] = l.split(";");
    return { kode, titel };
  });

const DB25_AFDELINGER_I_REGISTRET = [...new Set(DB25.map(r => r.kode.slice(0, 2)))].sort();

const migrationsMappe = path.resolve(her, "../../../supabase/migrations");
const seedFiler = readdirSync(migrationsMappe).filter(
  f => f.startsWith("20260329190316") || f.startsWith("20260329211955"),
);
const SEEDEDE_KODER = new Set<string>();
for (const f of seedFiler) {
  const sql = readFileSync(path.join(migrationsMappe, f), "utf-8");
  for (const m of sql.matchAll(/\(\s*'([a-z][a-z_]*)'\s*,\s*'[^']*'\s*,\s*'(?:gross_margin_pct|ebitda_margin_pct)'/g)) {
    SEEDEDE_KODER.add(m[1]);
  }
}

const label = (industryCode: string) => findBranche(industryCode)!.label;

describe("måleapparatet selv", () => {
  it("fixturen har alle 738 underklasser fordelt på 87 afdelinger", () => {
    expect(DB25).toHaveLength(738);
    expect(DB25_AFDELINGER_I_REGISTRET).toHaveLength(87);
    expect(DB25_AFDELINGER_I_REGISTRET).not.toContain("45"); // nedlagt i DB25
  });

  it("begge seed-migrationer fandtes, og seedet dækker alle 48 underkategorier + 17 gruppekoder", () => {
    expect(seedFiler).toHaveLength(2);
    expect(ALLE_BRANCHER).toHaveLength(48);
    for (const b of ALLE_BRANCHER) expect(SEEDEDE_KODER.has(b.value), b.value).toBe(true);
    for (const g of INDUSTRY_OPTIONS) expect(SEEDEDE_KODER.has(g.value), g.value).toBe(true);
    expect(SEEDEDE_KODER.size).toBe(65);
  });
});

// ── Normalisering af det CVR sender ───────────────────────────────────────

describe("normaliserBranchekode", () => {
  it("tager streng, tal og punktumform", () => {
    expect(normaliserBranchekode("682040")).toBe("682040");
    expect(normaliserBranchekode(682040)).toBe("682040");
    expect(normaliserBranchekode("68.20.40")).toBe("682040");
    expect(normaliserBranchekode(" 68 20 40 ")).toBe("682040");
  });

  it("fem cifre er et tabt foranstillet nul fra cvrapi's talfelt", () => {
    expect(normaliserBranchekode(11100)).toBe("011100");
    expect(normaliserBranchekode("11100")).toBe("011100");
  });

  it("tomt, bogstaver, for kort og for langt er ikke en kode", () => {
    expect(normaliserBranchekode(null)).toBeNull();
    expect(normaliserBranchekode(undefined)).toBeNull();
    expect(normaliserBranchekode("")).toBeNull();
    expect(normaliserBranchekode("abc")).toBeNull();
    expect(normaliserBranchekode("6")).toBeNull();
    expect(normaliserBranchekode("1234567")).toBeNull();
  });
});

// ── Afdelinger der mappes: én underklasse pr. afdeling ────────────────────

const AFDELINGER_MAPPET: [kode: string, industryCode: string, label: string][] = [
  ["011100", "agriculture_general", "Landbrug, gartneri og natur"], // 01 kornavl
  ["021000", "agriculture_general", "Landbrug, gartneri og natur"], // 02 skovbrug
  ["031100", "agriculture_general", "Landbrug, gartneri og natur"], // 03 havfiskeri
  ["101110", "production_food", "Fødevareproduktion"], // 10 svinekød
  ["110500", "production_food", "Fødevareproduktion"], // 11 øl
  ["120000", "production_industrial", "Industriel produktion"], // 12 tobak
  ["139200", "production_industrial", "Industriel produktion"], // 13 boligtekstiler
  ["142100", "production_industrial", "Industriel produktion"], // 14 yderbeklædning
  ["152000", "production_industrial", "Industriel produktion"], // 15 fodtøj
  ["162300", "production_industrial", "Industriel produktion"], // 16 snedkeriartikler
  ["172100", "production_industrial", "Industriel produktion"], // 17 bølgepap
  ["181200", "production_industrial", "Industriel produktion"], // 18 anden trykning
  ["192000", "production_industrial", "Industriel produktion"], // 19 raffinaderi
  ["204200", "production_industrial", "Industriel produktion"], // 20 parfume og shampoo
  ["212000", "production_industrial", "Industriel produktion"], // 21 farmaceutiske præparater
  ["222200", "production_industrial", "Industriel produktion"], // 22 plastemballage
  ["236100", "production_industrial", "Industriel produktion"], // 23 betonelementer
  ["245300", "production_industrial", "Industriel produktion"], // 24 letmetalstøberi
  ["255300", "production_industrial", "Industriel produktion"], // 25 maskinforarbejdning
  ["265100", "production_industrial", "Industriel produktion"], // 26 måleinstrumenter
  ["274000", "production_industrial", "Industriel produktion"], // 27 belysning
  ["282200", "production_industrial", "Industriel produktion"], // 28 løfteudstyr
  ["293200", "production_industrial", "Industriel produktion"], // 29 dele til motorkøretøjer
  ["301200", "production_industrial", "Industriel produktion"], // 30 fritidsbåde
  ["310000", "production_industrial", "Industriel produktion"], // 31 møbler
  ["325000", "production_industrial", "Industriel produktion"], // 32 medicinsk/dentalt udstyr
  ["331200", "trades_other", "Anden håndværksservice"], // 33 reparation af maskiner
  ["410000", "construction_contractor", "Entreprenør og anlæg"], // 41 opførelse af bygninger
  ["421100", "construction_contractor", "Entreprenør og anlæg"], // 42 veje
  ["433200", "construction_craft", "Håndværk og installation"], // 43 tømrer
  ["464200", "wholesale_general", "Engroshandel og import/eksport"], // 46 engros beklædning
  ["477800", "retail_other", "Anden detailhandel"], // 47 andre nye varer
  ["494100", "transport_freight", "Varetransport og spedition"], // 49 vejgodstransport
  ["502000", "transport_freight", "Varetransport og spedition"], // 50 søgods
  ["512100", "transport_freight", "Varetransport og spedition"], // 51 luftfragt
  ["522600", "transport_freight", "Varetransport og spedition"], // 52 spedition
  ["532000", "transport_freight", "Varetransport og spedition"], // 53 kurér
  ["561110", "food_restaurant", "Restaurant og café"], // 56 restauranter og caféer
  ["591100", "creative_photo", "Foto og video"], // 59 film- og videoproduktion
  ["621000", "tech_software", "Softwareudvikling"], // 62 computerprogrammering
  ["649100", "finance_general", "Finans og forsikring"], // 64 finansiel leasing
  ["651200", "finance_general", "Finans og forsikring"], // 65 skadesforsikring
  ["662200", "finance_general", "Finans og forsikring"], // 66 forsikringsmæglere
  ["682040", "realestate_rental", "Udlejning og administration"], // 68 erhvervsudlejning (FLOOR1)
  ["702000", "consulting_management", "Management og strategi"], // 70 virksomhedsrådgivning
  ["711100", "construction_consulting", "Arkitektur og rådgivning"], // 71 arkitekter
  ["731110", "creative_advertising", "Reklame og design"], // 73 reklamekampagner
  ["750000", "health_clinic", "Klinik og behandling"], // 75 dyrlæger
  ["781000", "consulting_hr", "HR og rekruttering"], // 78 arbejdsformidling
  ["791100", "travel_tour", "Rejsebureau og turoperatør"], // 79 rejsebureauer
  ["812100", "trades_cleaning", "Rengøring og facility"], // 81 almindelig rengøring
  ["855300", "education_general", "Uddannelse og undervisning"], // 85 køreskoler
  ["862300", "health_clinic", "Klinik og behandling"], // 86 tandlæger
  ["953190", "trades_other", "Anden håndværksservice"], // 95 autoværksted (Bilhuset Frederiksen, målt 3/9)
];

describe("udledBranchekode — afdelinger der mappes (én underklasse pr. afdeling)", () => {
  it.each(AFDELINGER_MAPPET)("%s → %s «%s»", (kode, industryCode, forventetLabel) => {
    expect(udledBranchekode(kode)).toEqual({ industry_code: industryCode, industry_label: forventetLabel });
    expect(label(industryCode)).toBe(forventetLabel); // labelen er taksonomiens, ikke testens
  });

  it("de fire målte cvrapi-svar fra 3/9 lander hvor de skal", () => {
    expect(udledBranchekode(478100)?.industry_code).toBe("retail_automotive"); // Semler Mobility Retail
    expect(udledBranchekode(953190)?.industry_code).toBe("trades_other"); // Bilhuset Frederiksen
    expect(udledBranchekode(562200)?.industry_code).toBe("food_catering"); // Meyers
    expect(udledBranchekode(472700)?.industry_code).toBe("retail_grocery"); // Skagenfood
  });

  it("virker også på 2 og 4 cifre — det er afdelingens/klassens svar", () => {
    expect(udledBranchekode("62")?.industry_code).toBe("tech_software");
    expect(udledBranchekode("6220")?.industry_code).toBe("tech_support");
    expect(udledBranchekode("47.71")?.industry_code).toBe("retail_fashion");
  });
});

// ── Afdelinger der bevidst giver null ─────────────────────────────────────

const AFDELINGER_NULL: [kode: string, hvorfor: string][] = [
  ["051000", "05 kul"],
  ["061000", "06 olie/gas"],
  ["071000", "07 malme"],
  ["081200", "08 grusgrav"],
  ["099000", "09 støtte til råstof"],
  ["351200", "35 elproduktion"],
  ["360000", "36 vand"],
  ["370000", "37 spildevand"],
  ["381100", "38 affald"],
  ["390000", "39 jordrensning"],
  ["551000", "55 hoteller — ikke et rejsebureau"],
  ["581100", "58 bogforlag"],
  ["601000", "60 radio"],
  ["611000", "61 telekommunikation"],
  ["639200", "63 andre informationsaktiviteter"],
  ["721000", "72 forskning"],
  ["743000", "74 oversættelse"],
  ["771100", "77 biludlejning"],
  ["800100", "80 vagt"],
  ["823000", "82 kongresser og messer"],
  ["841100", "84 offentlig forvaltning"],
  ["871010", "87 plejehjem"],
  ["889110", "88 dagpleje"],
  ["901200", "90 billedkunstner"],
  ["912100", "91 museum"],
  ["920000", "92 lotteri"],
  ["932100", "93 forlystelsespark"],
  ["949900", "94 forening"],
  ["962100", "96 frisør — ingen underkategori rammer"],
  ["970000", "97 husholdning med medhjælp"],
  ["981000", "98 husholdningsproduktion"],
  ["990010", "99 ambassade"],
];

describe("udledBranchekode — afdelinger der bevidst giver null", () => {
  it.each(AFDELINGER_NULL)("%s → null (%s)", kode => {
    expect(udledBranchekode(kode)).toBeNull();
  });

  it("afdeling 69 har ingen standard: kun 69.10 og 69.20 rammer", () => {
    expect(udledBranchekode("691000")?.industry_code).toBe("consulting_legal");
    expect(udledBranchekode("692000")?.industry_code).toBe("consulting_finance");
    expect(udledBranchekode("69")).toBeNull();
  });

  it("de mappede og de fravalgte afdelinger er tilsammen præcis DB25's 87", () => {
    const mappet = new Set(AFDELINGER_MAPPET.map(([k]) => k.slice(0, 2)));
    const fravalgt = new Set(AFDELINGER_NULL.map(([k]) => k.slice(0, 2)));
    mappet.add("69");
    for (const a of mappet) expect(fravalgt.has(a), `afdeling ${a} står i begge lister`).toBe(false);
    expect([...mappet, ...fravalgt].sort()).toEqual(DB25_AFDELINGER_I_REGISTRET);
  });
});

// ── Undtagelserne: hver post på 3, 4 og 6 cifre, med kontrast til standarden ─

describe("udledBranchekode — undtagelser hvor to cifre er for groft", () => {
  it("håndværksproduktion: keramiker, guldsmed og instrumentmager — søsterklasser bliver industri", () => {
    expect(udledBranchekode("234100")?.industry_code).toBe("production_craft");
    expect(udledBranchekode("234200")?.industry_code).toBe("production_industrial"); // sanitetsartikler
    expect(udledBranchekode("321200")?.industry_code).toBe("production_craft");
    expect(udledBranchekode("321300")?.industry_code).toBe("production_industrial"); // bijouteri
    expect(udledBranchekode("322000")?.industry_code).toBe("production_craft");
    expect(udledBranchekode("323000")?.industry_code).toBe("production_industrial"); // sportsudstyr
  });

  it("bygge: el/VVS, maler/gulv og glarmester skilles fra tømrer og murer", () => {
    expect(udledBranchekode("432100")?.industry_code).toBe("trades_electrical");
    expect(udledBranchekode("432200")?.industry_code).toBe("trades_electrical");
    expect(udledBranchekode("432300")?.industry_code).toBe("construction_craft"); // isolering
    expect(udledBranchekode("433300")?.industry_code).toBe("trades_painter");
    expect(udledBranchekode("433410")?.industry_code).toBe("trades_painter");
    expect(udledBranchekode("433420")?.industry_code).toBe("construction_craft"); // glarmester
    expect(udledBranchekode("439100")?.industry_code).toBe("construction_craft"); // murer
    expect(udledBranchekode("436000")).toBeNull(); // formidling
  });

  it("engros: agenturhandel er provision, ikke varesalg", () => {
    expect(udledBranchekode("461800")).toBeNull();
    expect(udledBranchekode("461810")).toBeNull();
    expect(udledBranchekode("462100")?.industry_code).toBe("wholesale_general");
    expect(udledBranchekode("469000")?.industry_code).toBe("wholesale_general");
  });

  it("detail: varegruppen afgør underkategorien, formidling giver null", () => {
    expect(udledBranchekode("471110")?.industry_code).toBe("retail_grocery"); // kiosk
    expect(udledBranchekode("471200")?.industry_code).toBe("retail_other"); // varehus
    expect(udledBranchekode("472200")?.industry_code).toBe("retail_grocery"); // slagter
    expect(udledBranchekode("473000")?.industry_code).toBe("retail_other"); // tankstation
    expect(udledBranchekode("474000")?.industry_code).toBe("retail_electronics");
    expect(udledBranchekode("475100")?.industry_code).toBe("retail_other"); // tekstiler/garn
    expect(udledBranchekode("475300")?.industry_code).toBe("retail_furniture");
    expect(udledBranchekode("475400")?.industry_code).toBe("retail_electronics");
    expect(udledBranchekode("475510")?.industry_code).toBe("retail_furniture");
    expect(udledBranchekode("476320")?.industry_code).toBe("retail_sport"); // cykler
    expect(udledBranchekode("476400")?.industry_code).toBe("retail_other"); // legetøj
    expect(udledBranchekode("477110")?.industry_code).toBe("retail_fashion");
    expect(udledBranchekode("477210")?.industry_code).toBe("retail_fashion");
    expect(udledBranchekode("477300")?.industry_code).toBe("health_pharmacy");
    expect(udledBranchekode("477410")?.industry_code).toBe("health_optician");
    expect(udledBranchekode("477420")?.industry_code).toBe("health_pharmacy");
    expect(udledBranchekode("477500")?.industry_code).toBe("retail_other"); // kosmetik
    expect(udledBranchekode("477700")?.industry_code).toBe("retail_fashion"); // ure og smykker
    expect(udledBranchekode("478200")?.industry_code).toBe("retail_automotive");
    expect(udledBranchekode("479100")).toBeNull();
    expect(udledBranchekode("479200")).toBeNull();
  });

  it("transport: passagerer skilles fra gods; rumfart og formidling giver null", () => {
    expect(udledBranchekode("491100")?.industry_code).toBe("transport_passenger");
    expect(udledBranchekode("492000")?.industry_code).toBe("transport_freight");
    expect(udledBranchekode("493200")?.industry_code).toBe("transport_passenger"); // taxi
    expect(udledBranchekode("494200")?.industry_code).toBe("transport_freight"); // flytning
    expect(udledBranchekode("501000")?.industry_code).toBe("transport_passenger");
    expect(udledBranchekode("503000")?.industry_code).toBe("transport_passenger");
    expect(udledBranchekode("511010")?.industry_code).toBe("transport_passenger");
    expect(udledBranchekode("512200")).toBeNull();
    expect(udledBranchekode("523100")?.industry_code).toBe("transport_freight"); // fragtagenter → afdelingens standard
    expect(udledBranchekode("523200")).toBeNull();
    expect(udledBranchekode("533000")).toBeNull();
  });

  it("restauration: takeaway, catering og formidling", () => {
    expect(udledBranchekode("561190")?.industry_code).toBe("food_takeaway"); // grillbar/isbar
    expect(udledBranchekode("561200")?.industry_code).toBe("food_takeaway"); // food truck
    expect(udledBranchekode("562100")?.industry_code).toBe("food_catering");
    expect(udledBranchekode("562200")?.industry_code).toBe("food_catering");
    expect(udledBranchekode("563020")?.industry_code).toBe("food_restaurant"); // bar
    expect(udledBranchekode("564000")).toBeNull();
  });

  it("IT og medier: software, drift, hosting, portaler, lyd, biograf", () => {
    expect(udledBranchekode("582100")?.industry_code).toBe("tech_software");
    expect(udledBranchekode("582900")?.industry_code).toBe("tech_software");
    expect(udledBranchekode("581300")).toBeNull(); // magasiner
    expect(udledBranchekode("591200")?.industry_code).toBe("creative_photo"); // postproduktion
    expect(udledBranchekode("591400")?.industry_code).toBe("creative_music"); // biograf
    expect(udledBranchekode("592000")?.industry_code).toBe("creative_music");
    expect(udledBranchekode("622000")?.industry_code).toBe("tech_support");
    expect(udledBranchekode("629000")?.industry_code).toBe("tech_support");
    expect(udledBranchekode("631000")?.industry_code).toBe("tech_support");
    expect(udledBranchekode("639100")?.industry_code).toBe("tech_software");
  });

  it("finans: holding, investering og centralbank er ikke driftsvirksomheder", () => {
    expect(udledBranchekode("642110")).toBeNull();
    expect(udledBranchekode("642120")).toBeNull();
    expect(udledBranchekode("643120")).toBeNull();
    expect(udledBranchekode("641100")).toBeNull();
    expect(udledBranchekode("649910")).toBeNull();
    expect(udledBranchekode("649990")?.industry_code).toBe("finance_general");
    expect(udledBranchekode("649220")?.industry_code).toBe("finance_general");
  });

  it("fast ejendom: udvikling, mægling, udlejning", () => {
    expect(udledBranchekode("681100")?.industry_code).toBe("realestate_development");
    expect(udledBranchekode("681200")?.industry_code).toBe("realestate_development");
    expect(udledBranchekode("682030")?.industry_code).toBe("realestate_rental");
    expect(udledBranchekode("683110")?.industry_code).toBe("realestate_agency");
    expect(udledBranchekode("683210")?.industry_code).toBe("realestate_rental"); // administration
  });

  it("rådgivning og kreative: hovedsæder, afprøvning, PR, design, foto", () => {
    expect(udledBranchekode("701010")).toBeNull();
    expect(udledBranchekode("711210")?.industry_code).toBe("construction_consulting");
    expect(udledBranchekode("712020")).toBeNull();
    expect(udledBranchekode("731200")?.industry_code).toBe("creative_advertising");
    expect(udledBranchekode("732000")?.industry_code).toBe("consulting_marketing");
    expect(udledBranchekode("733000")?.industry_code).toBe("consulting_marketing");
    expect(udledBranchekode("741200")?.industry_code).toBe("creative_advertising"); // grafisk design
    expect(udledBranchekode("742000")?.industry_code).toBe("creative_photo");
    expect(udledBranchekode("749990")).toBeNull();
  });

  it("administrative: vikarbureau, reservation, anlægsgartner", () => {
    expect(udledBranchekode("782000")).toBeNull();
    expect(udledBranchekode("799000")).toBeNull();
    expect(udledBranchekode("791200")?.industry_code).toBe("travel_tour");
    expect(udledBranchekode("813000")?.industry_code).toBe("trades_other");
    expect(udledBranchekode("812210")?.industry_code).toBe("trades_cleaning"); // vinduespolering
  });

  it("undervisning, sundhed, sport, scenekunst, reparation, personlig service", () => {
    expect(udledBranchekode("856100")).toBeNull();
    expect(udledBranchekode("855100")?.industry_code).toBe("education_general");
    expect(udledBranchekode("869200")).toBeNull();
    expect(udledBranchekode("869700")).toBeNull();
    expect(udledBranchekode("869500")?.industry_code).toBe("health_clinic"); // fysioterapi
    expect(udledBranchekode("902010")?.industry_code).toBe("creative_music");
    expect(udledBranchekode("903100")?.industry_code).toBe("creative_music");
    expect(udledBranchekode("903910")?.industry_code).toBe("transport_event");
    expect(udledBranchekode("903920")).toBeNull();
    expect(udledBranchekode("931300")?.industry_code).toBe("health_fitness");
    expect(udledBranchekode("931100")?.industry_code).toBe("health_fitness");
    expect(udledBranchekode("931900")).toBeNull();
    expect(udledBranchekode("951000")?.industry_code).toBe("tech_support");
    expect(udledBranchekode("952300")?.industry_code).toBe("trades_other"); // skomager
    expect(udledBranchekode("954000")).toBeNull();
    expect(udledBranchekode("962200")?.industry_code).toBe("health_clinic");
    expect(udledBranchekode("962300")?.industry_code).toBe("health_clinic");
    expect(udledBranchekode("961020")).toBeNull(); // renseri
  });
});

// ── Hele registret gennem motoren ─────────────────────────────────────────

describe("udledBranchekode — hele DB25-registret", () => {
  const svar = DB25.map(r => ({ ...r, resultat: udledBranchekode(r.kode) }));

  it("hver returneret kode findes i taksonomien OG i industry_benchmarks' seedede sæt, med taksonomiens label", () => {
    for (const s of svar) {
      if (!s.resultat) continue;
      const b = findBranche(s.resultat.industry_code);
      expect(b, `${s.kode} ${s.titel}`).not.toBeNull();
      expect(s.resultat.industry_label).toBe(b!.label);
      expect(SEEDEDE_KODER.has(s.resultat.industry_code), `${s.kode} → ${s.resultat.industry_code}`).toBe(true);
    }
  });

  it("returnerer aldrig other_general, en gruppekode, tech_startup eller travel_event", () => {
    const grupper = new Set(INDUSTRY_OPTIONS.map(g => g.value));
    for (const s of svar) {
      if (!s.resultat) continue;
      expect(s.resultat.industry_code).not.toBe("other_general");
      expect(s.resultat.industry_code).not.toBe("tech_startup");
      expect(s.resultat.industry_code).not.toBe("travel_event");
      expect(grupper.has(s.resultat.industry_code), s.kode).toBe(false);
    }
  });

  it("tabellernes værdier er alle underkategorier i taksonomien (ingen tastefejl i koderne)", () => {
    for (const tabel of [DB25_AFDELINGER, DB25_GRUPPER, DB25_KLASSER, DB25_UNDERKLASSER]) {
      for (const [noegle, v] of Object.entries(tabel)) {
        if (v !== null) expect(findBranche(v), `${noegle} → ${v}`).not.toBeNull();
      }
    }
  });

  it("afdelingstabellen er præcis DB25's 87 afdelinger — ingen glemt, ingen opfundet", () => {
    expect(Object.keys(DB25_AFDELINGER).sort()).toEqual(DB25_AFDELINGER_I_REGISTRET);
  });

  it("hver gruppe-, klasse- og underklassepost peger på en kode der findes i registret (ingen døde regler)", () => {
    const grupperIRegistret = new Set(DB25.map(r => r.kode.slice(0, 3)));
    const klasserIRegistret = new Set(DB25.map(r => r.kode.slice(0, 4)));
    const underklasserIRegistret = new Set(DB25.map(r => r.kode));
    for (const k of Object.keys(DB25_GRUPPER)) expect(grupperIRegistret.has(k), `gruppe ${k}`).toBe(true);
    for (const k of Object.keys(DB25_KLASSER)) expect(klasserIRegistret.has(k), `klasse ${k}`).toBe(true);
    for (const k of Object.keys(DB25_UNDERKLASSER)) expect(underklasserIRegistret.has(k), `underklasse ${k}`).toBe(true);
  });

  it("dækning: antal underklasser der får en kode (tallet er målt, en ændring skal være bevidst)", () => {
    const mappet = svar.filter(s => s.resultat).length;
    expect(mappet).toBe(549);
    expect(DB25.length - mappet).toBe(189);
  });
});
