/**
 * Rådgiverbeskeden i klokken (10/9): vagtens form — én række pr. rådgiver,
 * dedup på reference (eller titlen når referencen mangler) — og teksterne.
 */
import { describe, expect, it } from "vitest";
import {
  afvisningsgrundDansk,
  beskedVedFejletTraek,
  nyeForsoegVilIkkeLykkes,
  dubletBeskedTekst,
  fornyelsesBeskedTekst,
  raadgivereUdenRaekke,
  traekFejletBeskedTekst,
  TYPE_FORNYELSE_BETALT,
  TYPE_FORNYELSE_DUBLET,
  TYPE_TRAEK_FEJLET,
  type FejletTraekRaekke,
} from "../../../supabase/functions/_shared/raadgiverBeskedTekst.ts";

describe("raadgivereUdenRaekke", () => {
  const raadgivere = ["jonas", "morten"];
  it("ingen rækker → alle mangler", () => {
    expect(raadgivereUdenRaekke(raadgivere, [], { title: "T", reference_id: "p1" })).toEqual(["jonas", "morten"]);
  });
  it("dedup på reference_id: kun den der har rækken springes over", () => {
    const eks = [{ advisor_id: "jonas", reference_id: "p1", title: "gammel titel" }];
    expect(raadgivereUdenRaekke(raadgivere, eks, { title: "T", reference_id: "p1" })).toEqual(["morten"]);
  });
  it("uden reference_id dedup'es på titlen", () => {
    const eks = [{ advisor_id: "morten", reference_id: null, title: "Mulig dobbeltbetaling: X" }];
    expect(raadgivereUdenRaekke(raadgivere, eks, { title: "Mulig dobbeltbetaling: X", reference_id: null })).toEqual(["jonas"]);
    expect(raadgivereUdenRaekke(raadgivere, eks, { title: "Anden titel", reference_id: null })).toEqual(["jonas", "morten"]);
  });
  it("fælles rækker (advisor_id null, de gamle writere) tæller ikke som den enkeltes", () => {
    const eks = [{ advisor_id: null, reference_id: "p1", title: "T" }];
    expect(raadgivereUdenRaekke(raadgivere, eks, { title: "T", reference_id: "p1" })).toEqual(["jonas", "morten"]);
  });
});

describe("teksterne", () => {
  it("fornyelsen: virksomhed, beløb ekskl. moms, model og ny slutdato", () => {
    expect(TYPE_FORNYELSE_BETALT).toBe("fornyelse_betalt");
    expect(fornyelsesBeskedTekst({ virksomhed: "CARMA STUDIO", samletOere: 2_000_000, betalingsmodel: "rate2", nySlutDatoTekst: "3. oktober 2027" })).toEqual({
      title: "CARMA STUDIO har fornyet medlemskabet",
      body: "20.000 kr. ekskl. moms i to rater · til 3. oktober 2027",
    });
    expect(fornyelsesBeskedTekst({ virksomhed: "X", samletOere: 2_625_000, betalingsmodel: "rate12", nySlutDatoTekst: "d" }).body).toBe("26.250 kr. ekskl. moms i tolv rater · til d");
    expect(fornyelsesBeskedTekst({ virksomhed: "X", samletOere: 1_500_000, betalingsmodel: "fuld", nySlutDatoTekst: "d" }).body).toContain("på én gang");
    expect(fornyelsesBeskedTekst({ virksomhed: "X", samletOere: 1_500_000, betalingsmodel: "ukendt", nySlutDatoTekst: "d" }).body).toContain("ukendt");
  });
  it("dubletten: stabil titel pr. virksomhed, sessionen og handlingen i teksten", () => {
    expect(TYPE_FORNYELSE_DUBLET).toBe("fornyelse_dublet");
    const t = dubletBeskedTekst({ virksomhed: "CARMA STUDIO", samletOere: 2_000_000, sessionId: "cs_test_1", detalje: "perioden … slutter efter" });
    expect(t.title).toBe("Mulig dobbeltbetaling: CARMA STUDIO");
    expect(t.body).toContain("cs_test_1");
    expect(t.body).toContain("20.000 kr. ekskl. moms");
    expect(t.body).toContain("IKKE skrevet en periode");
    expect(t.body).toContain("Refundér i Stripe");
  });
});

describe("det fejlede træk (kort 23)", () => {
  const raekke = (over: Partial<FejletTraekRaekke> = {}): FejletTraekRaekke => ({
    id: "11111111-1111-4111-8111-111111111111",
    status: "fejlet",
    company_id: "c1",
    beloeb_oere: 437_500,
    fejl_besked: "Your card has insufficient funds.",
    fejl_decline_code: "insufficient_funds",
    faktura_nummer: "DZ7BZXM5-0012",
    ...over,
  });

  it("teksten: virksomhed og beløb inkl. moms i titlen; grunden på dansk med Stripes besked i parentes, næste forsøg og faktura i teksten (16/9)", () => {
    expect(TYPE_TRAEK_FEJLET).toBe("traek_fejlet");
    expect(traekFejletBeskedTekst({
      virksomhed: "doggybed", beloebOere: 437_500, fejlBesked: "Your card has insufficient funds.", declineCode: "insufficient_funds",
      naesteForsoegTekst: "17. september 2026", fakturaNummer: "DZ7BZXM5-0012",
    })).toEqual({
      title: "doggybed: et træk på 4.375 kr. fejlede",
      body: "ikke nok penge på kontoen (Stripe: Your card has insufficient funds.) · prøver igen 17. september 2026 · faktura DZ7BZXM5-0012",
    });
  });
  it("uden fejlgrund: «Stripe gav ingen grund» KUN når hverken kode eller besked findes; kun kode → dansk/ordret; kun besked → «Stripe: …»", () => {
    const grund = (fejlBesked: string | null, declineCode: string | null) =>
      traekFejletBeskedTekst({ virksomhed: "X", beloebOere: 100, fejlBesked, declineCode, naesteForsoegTekst: null, fakturaNummer: null }).body;
    expect(grund(null, null)).toBe("Stripe gav ingen grund · ingen flere forsøg fra Stripe");
    expect(grund("  ", "")).toBe("Stripe gav ingen grund · ingen flere forsøg fra Stripe");
    expect(grund(null, "card_declined")).toBe("kortet er afvist · ingen flere forsøg fra Stripe");
    expect(grund(null, "en_kode_vi_ikke_kender")).toBe("en_kode_vi_ikke_kender · ingen flere forsøg fra Stripe");
    expect(grund("Kortet blev afvist.", null)).toBe("Stripe: Kortet blev afvist. · ingen flere forsøg fra Stripe");
  });
  it("uden næste forsøg: «ingen flere forsøg fra Stripe»; uden fakturanummer udelades leddet", () => {
    const t = traekFejletBeskedTekst({ virksomhed: "X", beloebOere: 250_000, fejlBesked: null, declineCode: "expired_card", naesteForsoegTekst: null, fakturaNummer: null });
    expect(t.title).toBe("X: et træk på 2.500 kr. fejlede");
    expect(t.body).toBe("kortet er udløbet · ingen flere forsøg fra Stripe");
    expect(t.body).not.toContain("faktura");
  });

  // ── Afvisningsgrunden på dansk (16/9, Livja TBR-0007) ──
  it("afvisningsgrundDansk: de tre koder, ukendt kode ordret, ingen grund → null; decline_code vinder over code", () => {
    expect(afvisningsgrundDansk({ declineCode: "invalid_account" })).toBe("kortet er afvist: lukket eller ugyldig konto");
    expect(afvisningsgrundDansk({ declineCode: "insufficient_funds" })).toBe("ikke nok penge på kontoen");
    expect(afvisningsgrundDansk({ declineCode: "expired_card" })).toBe("kortet er udløbet");
    expect(afvisningsgrundDansk({ declineCode: "noget_nyt_fra_stripe" })).toBe("noget_nyt_fra_stripe");
    expect(afvisningsgrundDansk({ declineCode: null, kode: "card_declined" })).toBe("kortet er afvist");
    expect(afvisningsgrundDansk({ declineCode: "invalid_account", kode: "card_declined" })).toBe("kortet er afvist: lukket eller ugyldig konto");
    expect(afvisningsgrundDansk({ declineCode: null, kode: null })).toBeNull();
    expect(afvisningsgrundDansk({ declineCode: "  ", kode: "" })).toBeNull();
  });
  it("nyeForsoegVilIkkeLykkes: kun advice_code do_not_try_again", () => {
    expect(nyeForsoegVilIkkeLykkes("do_not_try_again")).toBe(true);
    expect(nyeForsoegVilIkkeLykkes("try_again_later")).toBe(false);
    expect(nyeForsoegVilIkkeLykkes("confirm_card_data")).toBe(false);
    expect(nyeForsoegVilIkkeLykkes(null)).toBe(false);
    expect(nyeForsoegVilIkkeLykkes(undefined)).toBe(false);
  });
  it("Livja 16/9: invalid_account + do_not_try_again → grunden på dansk, og at Stripes nye forsøg ikke vil lykkes — medlemmet skal have et nyt kort", () => {
    const t = traekFejletBeskedTekst({
      virksomhed: "Livja", beloebOere: 437_500, fejlBesked: "Invalid account.", declineCode: "invalid_account", kode: "card_declined",
      naesteForsoegTekst: "19. september 2026", fakturaNummer: "TBR-0007", adviceCode: "do_not_try_again",
    });
    expect(t.title).toBe("Livja: et træk på 4.375 kr. fejlede");
    expect(t.body).toBe("kortet er afvist: lukket eller ugyldig konto (Stripe: Invalid account.) · Stripes nye forsøg (19. september 2026) vil ikke lykkes — medlemmet skal have et nyt kort · faktura TBR-0007");
    expect(t.body).not.toContain("prøver igen");
    expect(t.body).not.toContain("Stripe gav ingen grund");
  });
  it("do_not_try_again uden næste forsøg: samme ord uden datoen; try_again_later ændrer intet", () => {
    const uden = traekFejletBeskedTekst({ virksomhed: "X", beloebOere: 100, fejlBesked: null, declineCode: "invalid_account", naesteForsoegTekst: null, fakturaNummer: null, adviceCode: "do_not_try_again" });
    expect(uden.body).toBe("kortet er afvist: lukket eller ugyldig konto · Stripes nye forsøg vil ikke lykkes — medlemmet skal have et nyt kort");
    const senere = traekFejletBeskedTekst({ virksomhed: "X", beloebOere: 100, fejlBesked: null, declineCode: "processing_error", naesteForsoegTekst: "19. september 2026", fakturaNummer: null, adviceCode: "try_again_later" });
    expect(senere.body).toBe("fejl hos kortudstederen · prøver igen 19. september 2026");
  });
  it("dommen bærer fejl_kode og adviceCode videre til teksten (16/9)", () => {
    const b = beskedVedFejletTraek({
      traek: raekke({ fejl_besked: "Invalid account.", fejl_decline_code: "invalid_account", fejl_kode: "card_declined", faktura_nummer: "TBR-0007" }),
      virksomhed: "Livja", naesteForsoegTekst: "19. september 2026", adviceCode: "do_not_try_again",
    });
    expect(b?.body).toBe("kortet er afvist: lukket eller ugyldig konto (Stripe: Invalid account.) · Stripes nye forsøg (19. september 2026) vil ikke lykkes — medlemmet skal have et nyt kort · faktura TBR-0007");
    // Kun code, ingen decline_code: dansk for card_declined.
    const kun = beskedVedFejletTraek({ traek: raekke({ fejl_besked: null, fejl_decline_code: null, fejl_kode: "card_declined", faktura_nummer: null }), virksomhed: "X", naesteForsoegTekst: null });
    expect(kun?.body).toBe("kortet er afvist · ingen flere forsøg fra Stripe");
  });

  it("dommen: en fejlet række med id og virksomhed giver beskeden med reference_id = company_traek.id", () => {
    expect(beskedVedFejletTraek({ traek: raekke(), virksomhed: "doggybed", naesteForsoegTekst: "17. september 2026" })).toEqual({
      type: "traek_fejlet",
      title: "doggybed: et træk på 4.375 kr. fejlede",
      body: "ikke nok penge på kontoen (Stripe: Your card has insufficient funds.) · prøver igen 17. september 2026 · faktura DZ7BZXM5-0012",
      company_id: "c1",
      reference_type: "traek",
      reference_id: "11111111-1111-4111-8111-111111111111",
    });
  });
  it("dommen uden grund og uden næste forsøg", () => {
    const b = beskedVedFejletTraek({ traek: raekke({ fejl_besked: null, fejl_decline_code: null, faktura_nummer: null }), virksomhed: "X", naesteForsoegTekst: null });
    expect(b?.body).toBe("Stripe gav ingen grund · ingen flere forsøg fra Stripe");
  });
  it("null når id mangler — intet at dedup'e på", () => {
    expect(beskedVedFejletTraek({ traek: raekke({ id: null }), virksomhed: "X", naesteForsoegTekst: null })).toBeNull();
    expect(beskedVedFejletTraek({ traek: raekke({ id: "  " }), virksomhed: "X", naesteForsoegTekst: null })).toBeNull();
  });
  it("null når rækken ikke står som fejlet (trækket er betalt siden)", () => {
    expect(beskedVedFejletTraek({ traek: raekke({ status: "betalt" }), virksomhed: "X", naesteForsoegTekst: null })).toBeNull();
  });
  it("null når company_id mangler", () => {
    expect(beskedVedFejletTraek({ traek: raekke({ company_id: null }), virksomhed: "X", naesteForsoegTekst: null })).toBeNull();
    expect(beskedVedFejletTraek({ traek: raekke({ company_id: "" }), virksomhed: "X", naesteForsoegTekst: null })).toBeNull();
  });
});
