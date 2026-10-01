import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  kronemaal,
  kroner,
  MAAL_ANSOEGERE_BLANDT_SET,
  MAAL_FREMMOEDE,
  MAAL_KILDE,
  MAAL_PRIS_PR_ANSOEGNING_OERE,
  MAAL_PRIS_PR_MEDLEM_OERE,
  MAAL_UDFALD_ORD,
  maalstreger,
  prisTaelling,
  maalTaelling,
  procentmaal,
  type MaalForbrug,
} from "@/lib/webinar/maalstreger";
import { SPOR_FORHOLD_FRA, type AnsoegerMail, type Tilmelding } from "@/lib/webinar/dashboard";
import { TROVAERDIG_FRA } from "@/lib/webinar/annoncepriser";
import * as deno from "../../../../supabase/functions/_shared/webinarMaalstreger.ts";

/**
 * Nicklas' målstreger (udkast 1/10-2026). Fire ting prøves:
 *   1. PROCENTMÅLET: Wilson, «for få» ERSTATTER tallet under 5, og «over/under
 *      målet» kun når HELE intervallet ligger på én side — med Nicklas' egne tal
 *      (469 → 189 mødte; 132 så færdigt → 6 ansøgte).
 *   2. KRONEMÅLET: ingen pris under 5 personer, pris < mål = «under målet»,
 *      ingen data uden forbrug, udækket vindue eller anden valuta.
 *   3. TÆLLINGEN: kun afholdte sessioner (grænsen nu inklusiv), tragtens grænse
 *      i tid (indsendt SKARPT efter første afholdte session), webinarkoblingen.
 *   4. KILDEVÆRN: fladen skriver kun dommens ord; spejlet svarer det samme.
 */

const NU = new Date("2026-10-01T12:00:00.000Z");
const S1 = "2026-09-22T07:00:00.000Z";
const S2 = "2026-09-29T07:00:00.000Z";
const KOMMENDE = "2026-10-13T09:00:00.000Z";

const R = (email: string, session_tid: string | null, ekstra: Partial<Tilmelding> = {}): Tilmelding => ({
  ewebinar_id: `id-${email}-${session_tid}`, email, navn: email.split("@")[0], webinar_id: "w1", webinar_titel: "Styr på tallene",
  session_tid, session_type: "Scheduled", registreret_at: "2026-09-10T09:00:00.000Z", state: "Watched", sidste_action: null,
  attended: "true", subscribed: null, set_procent: 80, set_procent_kilde: "watchedPercentage", ...ekstra,
}) as Tilmelding;
const A = (email: string, indsendt_at: string | null, ekstra: Partial<AnsoegerMail> = {}): AnsoegerMail => ({
  email, indsendt_at, trin: "ny", virksomhed_slutdato: null, ...ekstra,
});

describe("målene står ét sted", () => {
  it("Nicklas' fire tal og hans navn", () => {
    expect(MAAL_FREMMOEDE).toBe(0.55);
    expect(MAAL_ANSOEGERE_BLANDT_SET).toBe(0.1);
    expect(MAAL_PRIS_PR_ANSOEGNING_OERE).toBe(250_000);
    expect(MAAL_PRIS_PR_MEDLEM_OERE).toBe(1_500_000);
    expect(MAAL_KILDE).toBe("Nicklas, 1/10");
    expect(kroner(250_000)).toBe("2.500");
    expect(kroner(1_500_000)).toBe("15.000");
  });
  it("R2: tre ord for alle fire mål", () => {
    expect(MAAL_UDFALD_ORD).toEqual({ naaet: "nået", ikke_naaet: "ikke nået", kan_ikke_afgoeres: "kan ikke afgøres" });
  });
  it("grænserne er husets ene grænse (5)", () => {
    expect(SPOR_FORHOLD_FRA).toBe(5);
    expect(TROVAERDIG_FRA).toBe(5);
  });
});

describe("procentmålet — Wilson mod stregen", () => {
  it("Nicklas' fremmøde: 189 af 469 = 40 % (36–45 %) — hele intervallet under 55 %", () => {
    const l = procentmaal("fremmoede", "Fremmøde", 189, 469, MAAL_FREMMOEDE, "", "");
    expect(l.vaerdiOrd).toBe("40 % (36–45 %) af 469");
    expect(l.udfald).toBe("ikke_naaet");
    expect(l.udfaldOrd).toBe("ikke nået");
    expect(l.naaet).toBe(false);
    expect(l.maalOrd).toBe("over 55 %");
  });
  it("Nicklas' ansøgere: 6 af 132 = 5 % (2–10 %) — øvre 9,6 % < 10 %: ikke nået", () => {
    const l = procentmaal("ansoegere_blandt_set", "Ansøgere", 6, 132, MAAL_ANSOEGERE_BLANDT_SET, "", "");
    expect(l.vaerdiOrd).toBe("5 % (2–10 %) af 132");
    expect(l.udfald).toBe("ikke_naaet");
  });
  it("intervallet rummer målet → kan ikke afgøres (55 af 100 og 60 af 100 mod 55 %)", () => {
    expect(procentmaal("fremmoede", "F", 55, 100, 0.55, "", "").udfald).toBe("kan_ikke_afgoeres");
    // 60 % (50–69 %): nedre 50,2 % < 55 % — selv om tallet er over, er det ikke afgjort.
    const l = procentmaal("fremmoede", "F", 60, 100, 0.55, "", "");
    expect(l.udfald).toBe("kan_ikke_afgoeres");
    expect(l.naaet).toBeNull();
    expect(l.vaerdi).toBe("maalt");
  });
  it("hele intervallet over → nået (300 af 400 mod 55 %; 30 af 100 mod 10 %)", () => {
    expect(procentmaal("fremmoede", "F", 300, 400, 0.55, "", "").udfald).toBe("naaet");
    const l = procentmaal("ansoegere_blandt_set", "A", 30, 100, 0.1, "", "");
    expect(l.udfald).toBe("naaet");
    expect(l.naaet).toBe(true);
  });
  it("under 5 ERSTATTER «for få» tallet; 0 er «ingen data»; 5 er et tal", () => {
    const fire = procentmaal("fremmoede", "F", 4, 4, 0.55, "", "");
    expect(fire).toMatchObject({ vaerdi: "for_faa", vaerdiOrd: "for få", udfald: "kan_ikke_afgoeres", naaet: null });
    expect(fire.bar.vaerdi).toBeNull();
    expect(fire.bar.fra).toBeNull();
    expect(fire.vaerdiOrd).not.toMatch(/%/);
    expect(procentmaal("fremmoede", "F", 0, 0, 0.55, "", "")).toMatchObject({ vaerdi: "ingen_data", vaerdiOrd: "ingen data" });
    const fem = procentmaal("fremmoede", "F", 5, 5, 0.55, "", "");
    expect(fem.vaerdi).toBe("maalt");
    expect(fem.vaerdiOrd).toBe("100 % (57–100 %) af 5");
    expect(fem.udfald).toBe("naaet");
  });
  it("baren: målstregen midt på ved dobbelt skala; intervallet ligger om tallet", () => {
    const l = procentmaal("ansoegere_blandt_set", "A", 6, 132, 0.1, "", "");
    expect(l.bar.maal).toBeCloseTo(0.5, 5);
    expect(l.bar.vaerdi!).toBeCloseTo(0.045454 / 0.2, 3);
    expect(l.bar.fra!).toBeLessThan(l.bar.vaerdi!);
    expect(l.bar.til!).toBeGreaterThan(l.bar.vaerdi!);
    const f = procentmaal("fremmoede", "F", 189, 469, 0.55, "", "");
    expect(f.bar.maal).toBeCloseTo(0.55, 5); // skalaen er loftet ved 100 %
  });
});

describe("kronemålet — ingen pris under 5", () => {
  it("3.120 kr. pr. ansøgning (31.200 kr. / 10) er over 2.500: ikke nået", () => {
    const l = kronemaal("pris_pr_ansoegning", "P", 3_120_000, 10, 250_000, "ansøgning", "ansøgninger", true, "", "");
    expect(l.vaerdiOrd).toBe("3.120 kr. af 10 ansøgninger");
    expect(l.udfald).toBe("ikke_naaet");
    expect(l.naaet).toBe(false);
    expect(l.maalOrd).toBe("under 2.500 kr.");
  });
  it("under målet er nået; præcis på målet er IKKE under (K9: dommen falder på det VISTE heltal)", () => {
    expect(kronemaal("pris_pr_ansoegning", "P", 1_000_000, 5, 250_000, "ansøgning", "ansøgninger", true, "", "")).toMatchObject({ udfald: "naaet", naaet: true, vaerdiOrd: "2.000 kr. af 5 ansøgninger" });
    expect(kronemaal("pris_pr_ansoegning", "P", 1_250_000, 5, 250_000, "ansøgning", "ansøgninger", true, "", "").udfald).toBe("ikke_naaet");
    // 1.249.800 / 5 = 249.960 øre = 2.499,60 kr. — STÅR som «2.500 kr.» og er derfor IKKE nået.
    const graense = kronemaal("pris_pr_ansoegning", "P", 1_249_800, 5, 250_000, "ansøgning", "ansøgninger", true, "", "");
    expect(graense).toMatchObject({ vaerdiOrd: "2.500 kr. af 5 ansøgninger", udfald: "ikke_naaet", udfaldOrd: "ikke nået", naaet: false });
    // 1.247.450 / 5 = 249.490 øre = 2.494,90 kr. → «2.495 kr.»: nået.
    expect(kronemaal("pris_pr_ansoegning", "P", 1_247_450, 5, 250_000, "ansøgning", "ansøgninger", true, "", "")).toMatchObject({ vaerdiOrd: "2.495 kr. af 5 ansøgninger", naaet: true, udfaldOrd: "nået" });
  });
  it("4 personer: «for få» og INGEN pris; 0 personer med forbrug: «0 medlemmer for N kr.» (B6)", () => {
    const l = kronemaal("pris_pr_medlem", "M", 3_490_500, 4, 1_500_000, "medlem", "medlemmer", true, "", "");
    expect(l).toMatchObject({ vaerdi: "for_faa", vaerdiOrd: "for få", udfald: "kan_ikke_afgoeres", naaet: null });
    expect(l.bar.vaerdi).toBeNull();
    expect(l.vaerdiOrd).not.toMatch(/kr\./);
    const nul = kronemaal("pris_pr_medlem", "M", 3_490_500, 0, 1_500_000, "medlem", "medlemmer", true, "", "");
    expect(nul).toMatchObject({ vaerdi: "nul", vaerdiOrd: "0 medlemmer for 34.905 kr.", udfald: "kan_ikke_afgoeres", udfaldOrd: "kan ikke afgøres", naaet: null });
    expect(nul.bar.vaerdi).toBeNull();
    expect(kronemaal("pris_pr_ansoegning", "P", 500_000, 0, 250_000, "ansøgning", "ansøgninger", true, "", "").vaerdiOrd).toBe("0 ansøgninger for 5.000 kr.");
  });
  it("uden data: «ingen data», også med mange personer", () => {
    expect(kronemaal("pris_pr_ansoegning", "P", 0, 50, 250_000, "ansøgning", "ansøgninger", false, "", "")).toMatchObject({ vaerdi: "ingen_data", vaerdiOrd: "ingen data", udfald: "kan_ikke_afgoeres" });
  });
});

describe("tællingen — de afholdte, tragtens grænse i tid, koblingen", () => {
  const tilmeldinger: Tilmelding[] = [
    R("a@x.dk", S1),                                                     // set, ansøgte 1 ms efter → tæller
    R("b@x.dk", S1),                                                     // set, ansøgte PRÆCIS ved start → tæller ikke
    R("c@x.dk", S1),                                                     // set, ansøgte FØR → tæller ikke
    R("d@x.dk", S1, { set_procent: 30 }),                                // delvist → ikke i nævneren for led 2
    R("e@x.dk", S1, { state: "Missed", attended: null, set_procent: null }), // mødte ikke op
    R("f@x.dk", KOMMENDE, { state: "Registered", attended: null, set_procent: null }), // kommende → ingen steder
    R("g@x.dk", S2),                                                     // set, koblet via webinar_email → tæller
    R("h@x.dk", null, { session_type: "Replay" }),                       // Replay uden tid: afholdt, set; enhver indsendelse tæller
    R("i@x.dk", NU.toISOString()),                                       // begynder PRÆCIS nu: afholdt (≤ nu)
    R("a@x.dk", S2, { set_procent: 10 }),                                // a's anden række: første session er stadig S1
  ];
  const ansoegninger: AnsoegerMail[] = [
    A("a@x.dk", new Date(Date.parse(S1) + 1).toISOString()),
    A("b@x.dk", S1),
    A("c@x.dk", "2026-09-01T10:00:00.000Z"),
    A("anden@firma.dk", "2026-09-30T10:00:00.000Z", { webinar_email: "g@x.dk" }),
    A("h@x.dk", "2026-08-01T10:00:00.000Z"),
    A("i@x.dk", null), // kladde: ikke en ansøgning
  ];
  const t = maalTaelling(tilmeldinger, ansoegninger, NU);

  it("led 1: 8 afholdte personer, 7 mødte op (f er kommende og står udenfor)", () => {
    // a b c d e g h i — e mødte ikke op; d er delvist (mødte op).
    expect(t.grundlag).toBe(8);
    expect(t.moedteOp).toBe(7);
  });
  it("led 2: 6 så færdigt (a b c g h i), heraf 3 ansøgte efter grænsen (a, g via kobling, h uden tid)", () => {
    expect(t.set).toBe(6);
    expect(t.setDerAnsoegte).toBe(3);
  });
  it("et nu ét millisekund tidligere: i's session er ikke afholdt endnu", () => {
    const foer = maalTaelling(tilmeldinger, ansoegninger, new Date(NU.getTime() - 1));
    expect(foer.grundlag).toBe(7);
    expect(foer.set).toBe(5);
  });
  it("K8: grænsen er personens FØRSTE «SET»-SESSION — udeblev S1, så S2, ansøgte imellem → tæller ikke; efter S2 → tæller", () => {
    const raekker = [
      R("u@x.dk", S1, { state: "Missed", attended: null, set_procent: null }),
      R("u@x.dk", S2),
      R("v@x.dk", S1, { state: "Missed", attended: null, set_procent: null }),
      R("v@x.dk", S2),
    ];
    const mellem = new Date(Date.parse(S1) + 24 * 3_600_000).toISOString();
    const efter = new Date(Date.parse(S2) + 1).toISOString();
    const k = maalTaelling(raekker, [A("u@x.dk", mellem), A("v@x.dk", efter)], NU);
    expect(k.set).toBe(2);
    // Med den gamle grænse (første AFHOLDTE = S1) ville u også tælle: 2. Med K8: kun v.
    expect(k.setDerAnsoegte).toBe(1);
  });
  it("K13: en Replay-række uden state og uden tid tæller i nævneren som udebleven — som tragten", () => {
    const k = maalTaelling([R("a@x.dk", S1), R("r@x.dk", null, { session_type: "Replay", state: null, attended: null, set_procent: null })], [], NU);
    expect(k).toMatchObject({ grundlag: 2, moedteOp: 1, udenTid: true });
  });
});

describe("R1 — prisernes tællere: kun ansøgninger EFTER første tilmelding", () => {
  const V = { fra: "2026-09-10", til: "2026-09-20" };
  const T = (email: string, registreret_at: string) => R(email, S1, { registreret_at });
  it("Anna (efter) tæller; Bo (gammel ansøger/medlem) tæller ikke; samme sekund tæller ikke; uden for vinduet tæller ikke", () => {
    const tilm = [
      T("anna@x.dk", "2026-09-10T09:00:00.000Z"),
      T("bo@x.dk", "2026-09-12T09:00:00.000Z"),
      T("cia@x.dk", "2026-09-13T09:00:00.000Z"),
      T("dan@x.dk", "2026-09-01T09:00:00.000Z"),   // første tilmelding før vinduet
      T("dan@x.dk", "2026-09-14T09:00:00.000Z"),
    ];
    const medlem = { trin: "underskrevet" as const, virksomhed_slutdato: "2027-09-01" };
    const ans = [
      A("anna@x.dk", "2026-09-23T10:00:00.000Z", medlem),
      A("bo@x.dk", "2026-09-01T10:00:00.000Z", medlem),   // eksisterende medlem: tæller hverken som ansøger eller medlem
      A("cia@x.dk", "2026-09-13T09:00:00.000Z"),          // samme sekund: ikke EFTER
      A("dan@x.dk", "2026-09-23T10:00:00.000Z", medlem),  // i orden, men hans første tilmelding er uden for vinduet
    ];
    expect(prisTaelling(tilm, ans, V)).toEqual({ personer: 3, ansoegte: 1, medlemmer: 1 });
    expect(prisTaelling(tilm, ans, null)).toEqual({ personer: 0, ansoegte: 0, medlemmer: 0 });
  });
  it("hele dommen: et eksisterende medlem, der melder sig til, sænker IKKE prisen", () => {
    const forbrug: MaalForbrug = {
      dage: [{ ad_id: "120212345678901234", campaign_id: "k1", dato: "2026-09-10", valuta: "DKK", forbrug_oere: 1_000_000 }, { ad_id: "120212345678901234", campaign_id: "k1", dato: "2026-09-20", valuta: "DKK", forbrug_oere: 0 }],
      annoncer: [], tilstand: "har", hentetTil: "2026-09-30",
    };
    const tilm = Array.from({ length: 6 }, (_, n) => T(`m${n}@x.dk`, "2026-09-11T09:00:00.000Z"));
    const gamle = tilm.map((r) => A(r.email, "2026-08-01T10:00:00.000Z", { trin: "underskrevet", virksomhed_slutdato: "2027-08-01" }));
    const m = maalstreger({ tilmeldinger: tilm, ansoegninger: gamle, forbrug }, NU);
    expect(m.linjer[2]).toMatchObject({ vaerdi: "nul", vaerdiOrd: "0 ansøgninger for 10.000 kr.", naevner: 0 });
    expect(m.linjer[3]).toMatchObject({ vaerdi: "nul", vaerdiOrd: "0 medlemmer for 10.000 kr.", udfaldOrd: "kan ikke afgøres" });
  });
});

describe("hele dommen", () => {
  const tilmeldinger: Tilmelding[] = Array.from({ length: 12 }, (_, n) =>
    R(`p${n}@x.dk`, S1, n < 6 ? {} : { state: "Missed", attended: null, set_procent: null, registreret_at: "2026-09-15T09:00:00.000Z" }));
  const ansoegninger = [A("p0@x.dk", "2026-09-23T10:00:00.000Z", { trin: "underskrevet", virksomhed_slutdato: "2027-09-23" })];
  const forbrug: MaalForbrug = {
    dage: [
      { ad_id: "120212345678901234", campaign_id: "k1", dato: "2026-09-10", valuta: "DKK", forbrug_oere: 500_000 },
      { ad_id: "120212345678901234", campaign_id: "k1", dato: "2026-09-20", valuta: "DKK", forbrug_oere: 500_000 },
    ],
    annoncer: [], tilstand: "har", hentetTil: "2026-09-30",
  };

  it("fire linjer i Nicklas' rækkefølge, med kilden og prisvinduet", () => {
    const m = maalstreger({ tilmeldinger, ansoegninger, forbrug }, NU);
    expect(m.kilde).toBe("Nicklas, 1/10");
    expect(m.linjer.map((l) => l.noegle)).toEqual(["fremmoede", "ansoegere_blandt_set", "pris_pr_ansoegning", "pris_pr_medlem"]);
    expect(m.prisvindueOrd).toBe("10.–20. september");
    // B7: grundlaget i ord på hver linje.
    expect(m.linjer.map((l) => l.grundlagOrd)).toEqual([
      "alle afholdte webinarer 22/9", "alle afholdte webinarer 22/9",
      "annoncevinduet 10.–20. september", "annoncevinduet 10.–20. september",
    ]);
    expect(m.linjer[0]).toMatchObject({ taeller: 6, naevner: 12 });
    expect(m.linjer[1]).toMatchObject({ taeller: 1, naevner: 6 });
    // 1 ansøger og 1 medlem i vinduet — under 5: ingen pris.
    expect(m.linjer[2]).toMatchObject({ vaerdi: "for_faa", taeller: 1_000_000, naevner: 1 });
    expect(m.linjer[3]).toMatchObject({ vaerdi: "for_faa", naevner: 1 });
  });
  it("uden forbrug: kronemålene er «ingen data», procentmålene står", () => {
    const m = maalstreger({ tilmeldinger, ansoegninger, forbrug: null }, NU);
    expect(m.prisvindueOrd).toBeNull();
    expect(m.linjer[2].grundlagOrd).toBe("intet annoncevindue med forbrug");
    expect(m.linjer[2].vaerdi).toBe("ingen_data");
    expect(m.linjer[3].vaerdi).toBe("ingen_data");
    expect(m.linjer[0].vaerdi).toBe("maalt");
    expect(maalstreger({ tilmeldinger, ansoegninger, forbrug: { ...forbrug, dage: [], tilstand: "tom" } }, NU).linjer[2].vaerdi).toBe("ingen_data");
    expect(maalstreger({ tilmeldinger, ansoegninger, forbrug: { ...forbrug, tilstand: "mangler" } }, NU).linjer[2].vaerdi).toBe("ingen_data");
  });
  it("forbrug i euro kan ikke holdes op mod et kronemål", () => {
    const euro = { ...forbrug, dage: forbrug.dage.map((d) => ({ ...d, valuta: "EUR" })) };
    const mange = Array.from({ length: 6 }, (_, n) => A(`p${n}@x.dk`, "2026-09-23T10:00:00.000Z"));
    expect(maalstreger({ tilmeldinger, ansoegninger: mange, forbrug }, NU).linjer[2].vaerdi).toBe("maalt");
    expect(maalstreger({ tilmeldinger, ansoegninger: mange, forbrug: euro }, NU).linjer[2].vaerdi).toBe("ingen_data");
  });
  it("tæller og nævner over SAMME vindue: en tilmelding før forbruget tæller ikke i prisen", () => {
    // p0–p5 registreret 10/9 (i vinduet), p6–p11 15/9 (i vinduet). Flyt to ansøgere uden for vinduet:
    const mange = Array.from({ length: 6 }, (_, n) => A(`p${n}@x.dk`, "2026-09-23T10:00:00.000Z"));
    const udenfor = tilmeldinger.map((r, n) => (n < 2 ? { ...r, registreret_at: "2026-09-01T09:00:00.000Z" } : r));
    expect(maalstreger({ tilmeldinger, ansoegninger: mange, forbrug }, NU).linjer[2]).toMatchObject({ naevner: 6, vaerdiOrd: "1.667 kr. af 6 ansøgninger" });
    expect(maalstreger({ tilmeldinger: udenfor, ansoegninger: mange, forbrug }, NU).linjer[2]).toMatchObject({ naevner: 4, vaerdi: "for_faa" });
  });
  it("serverens spejl (webinar-delt) svarer det samme", () => {
    const ind = { tilmeldinger, ansoegninger, forbrug };
    expect(deno.maalstreger(ind, NU)).toEqual(maalstreger(ind, NU));
    expect(deno.maalstreger({ ...ind, forbrug: null }, NU)).toEqual(maalstreger({ ...ind, forbrug: null }, NU));
  });
  it("svaret bærer ingen mail", () => {
    expect(JSON.stringify(maalstreger({ tilmeldinger, ansoegninger, forbrug }, NU))).not.toMatch(/@/);
  });
});

// ── Kildeværn ───────────────────────────────────────────────────────────────
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

/**
 * Målstregerne på fladen: KUN dommens ord og positioner. Ingen procent, pris
 * eller division regnet af tællerne, ingen formatering af tal, og ingen
 * egen dom over målet.
 */
export const maalFladenSkriverKunDommensOrd = (view: string): boolean => {
  const kode = udenKommentarer(view);
  const maal = kode.slice(kode.indexOf("const MaalBarTegning"), kode.indexOf("const Skelet"));
  return maal.length > 200 &&
    maal.includes("{l.vaerdiOrd}") && maal.includes("{l.udfaldOrd}") && maal.includes("{l.maalOrd}") &&
    // B7: grundlaget står under hver række — dommens tekst, også på den delte side.
    maal.includes(">{l.grundlagOrd}</p>") &&
    !/\.(taeller|naevner)\b/.test(maal) &&
    !/\bpct\(|\bkroner\(|intervalOrd\(|wilson\(/.test(maal) &&
    !/\bMAAL_(FREMMOEDE|ANSOEGERE|PRIS)/.test(kode) &&
    !/\.(nedre|oevre|interval)\b/.test(maal) &&
    // Fail-soft: et gammelt delt-svar uden `maalstreger` tegner intet.
    kode.includes("{maal && (");
};

describe("kildeværn — målstregerne", () => {
  const VIEW = "src/components/hjemmebane/webinar/WebinarView.tsx";
  it("fladen skriver kun dommens ord", () => {
    const v = laes(VIEW);
    expect(maalFladenSkriverKunDommensOrd(v)).toBe(true);
    expect(maalFladenSkriverKunDommensOrd(v.replace("{l.vaerdiOrd}", "{`${Math.round(l.taeller / l.naevner * 100)} %`}"))).toBe(false);
    expect(maalFladenSkriverKunDommensOrd(v.replace("{l.udfaldOrd}", "{l.taeller > 0.55 ? \"over\" : \"under\"}"))).toBe(false);
    expect(maalFladenSkriverKunDommensOrd(v.replace("{l.maalOrd}", "{`${MAAL_FREMMOEDE * 100} %`}"))).toBe(false);
    expect(maalFladenSkriverKunDommensOrd(v.replace("{maal && (", "{("))).toBe(false);
    expect(maalFladenSkriverKunDommensOrd(v.replace(">{l.grundlagOrd}</p>", ">alle webinarer</p>"))).toBe(false);
  });
  it("målene står ét sted: tallene 0.55 · 0.1 · 250_000 · 1_500_000 kun i dommen", () => {
    const d = udenKommentarer(laes("src/lib/webinar/maalstreger.ts"));
    expect(d).toContain("export const MAAL_FREMMOEDE = 0.55;");
    expect(d).toContain("export const MAAL_PRIS_PR_MEDLEM_OERE = 1_500_000;");
    for (const sti of [VIEW, "src/pages/DeltWebinar.tsx", "supabase/functions/_shared/webinarDelingSvar.ts"]) {
      expect(udenKommentarer(laes(sti)), sti).not.toMatch(/\b(250_?000|1_?500_?000)\b/);
    }
  });
  it("dommen bruger lag 6's Wilson og husets grænser — ingen egen formel", () => {
    const d = udenKommentarer(laes("src/lib/webinar/maalstreger.ts"));
    expect(d).toMatch(/import \{[^}]*\bwilson\b[^}]*\} from "@\/lib\/marketing\/statistik";/);
    expect(d).toContain('if (antal < SPOR_FORHOLD_FRA) return uden("for_faa", MAAL_FOR_FAA_ORD);');
    expect(d).toContain('if (n < TROVAERDIG_FRA) return uden("for_faa", MAAL_FOR_FAA_ORD);');
    // K9: dommen falder på det VISTE heltal i kroner, ikke på ørerne.
    expect(d).toContain("const naaet = visteKr < maalOere / 100;");
    expect(d).toContain('valg: "daekning"');
    expect(d).not.toContain("Math.sqrt");
    expect(d).not.toMatch(/1\.96/);
  });
});
