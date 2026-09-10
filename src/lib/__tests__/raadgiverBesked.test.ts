/**
 * Rådgiverbeskeden i klokken (10/9): vagtens form — én række pr. rådgiver,
 * dedup på reference (eller titlen når referencen mangler) — og teksterne.
 */
import { describe, expect, it } from "vitest";
import {
  dubletBeskedTekst,
  fornyelsesBeskedTekst,
  raadgivereUdenRaekke,
  TYPE_FORNYELSE_BETALT,
  TYPE_FORNYELSE_DUBLET,
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
