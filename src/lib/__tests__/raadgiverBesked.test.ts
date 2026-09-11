/**
 * Rådgiverbeskeden i klokken (10/9): vagtens form — én række pr. rådgiver,
 * dedup på reference (eller titlen når referencen mangler) — og teksterne.
 */
import { describe, expect, it } from "vitest";
import {
  beskedVedFejletTraek,
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

  it("teksten: virksomhed og beløb inkl. moms i titlen; grund, næste forsøg og faktura i teksten", () => {
    expect(TYPE_TRAEK_FEJLET).toBe("traek_fejlet");
    expect(traekFejletBeskedTekst({
      virksomhed: "doggybed", beloebOere: 437_500, fejlBesked: "Your card has insufficient funds.", declineCode: "insufficient_funds",
      naesteForsoegTekst: "17. september 2026", fakturaNummer: "DZ7BZXM5-0012",
    })).toEqual({
      title: "doggybed: et træk på 4.375 kr. fejlede",
      body: "Stripe: Your card has insufficient funds. (insufficient_funds) · prøver igen 17. september 2026 · faktura DZ7BZXM5-0012",
    });
  });
  it("uden fejlgrund: «Stripe gav ingen grund»; kun kode eller kun besked står alene", () => {
    const grund = (fejlBesked: string | null, declineCode: string | null) =>
      traekFejletBeskedTekst({ virksomhed: "X", beloebOere: 100, fejlBesked, declineCode, naesteForsoegTekst: null, fakturaNummer: null }).body;
    expect(grund(null, null)).toBe("Stripe gav ingen grund · ingen flere forsøg fra Stripe");
    expect(grund("  ", "")).toBe("Stripe gav ingen grund · ingen flere forsøg fra Stripe");
    expect(grund(null, "card_declined")).toBe("Stripe: card_declined · ingen flere forsøg fra Stripe");
    expect(grund("Kortet blev afvist.", null)).toBe("Stripe: Kortet blev afvist. · ingen flere forsøg fra Stripe");
  });
  it("uden næste forsøg: «ingen flere forsøg fra Stripe»; uden fakturanummer udelades leddet", () => {
    const t = traekFejletBeskedTekst({ virksomhed: "X", beloebOere: 250_000, fejlBesked: null, declineCode: "expired_card", naesteForsoegTekst: null, fakturaNummer: null });
    expect(t.title).toBe("X: et træk på 2.500 kr. fejlede");
    expect(t.body).toBe("Stripe: expired_card · ingen flere forsøg fra Stripe");
    expect(t.body).not.toContain("faktura");
  });

  it("dommen: en fejlet række med id og virksomhed giver beskeden med reference_id = company_traek.id", () => {
    expect(beskedVedFejletTraek({ traek: raekke(), virksomhed: "doggybed", naesteForsoegTekst: "17. september 2026" })).toEqual({
      type: "traek_fejlet",
      title: "doggybed: et træk på 4.375 kr. fejlede",
      body: "Stripe: Your card has insufficient funds. (insufficient_funds) · prøver igen 17. september 2026 · faktura DZ7BZXM5-0012",
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
