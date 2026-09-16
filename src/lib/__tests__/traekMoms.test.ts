import { describe, expect, it } from "vitest";
import { beloebEksMoms, beloebTekst } from "@/lib/traek";
import { periodeLinje, traekLinje } from "@/lib/hjemmebane/indstillinger";

/* Priserne ekskl. moms (16/9; Jonas: «Priserne vi vil se er dem ex. moms.»):
   momsen er gemt pr. betaling i company_traek.moms_oere. Kendt moms →
   «3.500 kr. ekskl. moms»; ukendt (NULL) → «4.375 kr. inkl. moms». Aldrig
   25 % antaget i koden. */

describe("beloebEksMoms — beløbet uden moms, eller null når momsen ikke er kendt", () => {
  it("kendt moms: beloeb − moms", () => {
    expect(beloebEksMoms({ beloeb_oere: 437_500, moms_oere: 87_500 })).toBe(350_000);
    expect(beloebEksMoms({ beloeb_oere: 5_000_000, moms_oere: 1_000_000 })).toBe(4_000_000);
  });
  it("moms 0 er kendt: beløbet uændret (en kunde uden dansk moms)", () => {
    expect(beloebEksMoms({ beloeb_oere: 437_500, moms_oere: 0 })).toBe(437_500);
  });
  it("null/undefined/NaN moms → null, ikke et gæt", () => {
    expect(beloebEksMoms({ beloeb_oere: 437_500, moms_oere: null })).toBeNull();
    expect(beloebEksMoms({ beloeb_oere: 437_500, moms_oere: undefined })).toBeNull();
    expect(beloebEksMoms({ beloeb_oere: 437_500, moms_oere: Number.NaN })).toBeNull();
  });
});

describe("beloebTekst — ordet der er sandt", () => {
  it("kendt moms: «3.500 kr. ekskl. moms»", () => {
    expect(beloebTekst({ beloeb_oere: 437_500, moms_oere: 87_500 })).toBe("3.500 kr. ekskl. moms");
    expect(beloebTekst({ beloeb_oere: 1_875_000, moms_oere: 375_000 })).toBe("15.000 kr. ekskl. moms");
  });
  it("moms 0: hele beløbet, stadig ekskl. moms", () => {
    expect(beloebTekst({ beloeb_oere: 437_500, moms_oere: 0 })).toBe("4.375 kr. ekskl. moms");
  });
  it("ukendt moms: «4.375 kr. inkl. moms» — beløbet vi har, aldrig × 0,8", () => {
    expect(beloebTekst({ beloeb_oere: 437_500, moms_oere: null })).toBe("4.375 kr. inkl. moms");
    expect(beloebTekst({ beloeb_oere: 437_500, moms_oere: undefined })).toBe("4.375 kr. inkl. moms");
  });
});

describe("betalingslisten hos medlemmet — alle linjer siger moms-ordet", () => {
  const basis = { status: "betalt", betalt_at: "2026-06-26T10:00:00Z", fejlet_at: null, faktura_nummer: "7WMYOQJD-0001", hosted_invoice_url: null, stripe_invoice_id: "in_1TmUs3", kilde: "stripe_engang", id: "r1" };
  it("Warburg år 2: 18.750 inkl. → «15.000 kr. ekskl. moms»", () => {
    expect(traekLinje({ ...basis, beloeb_oere: 1_875_000, moms_oere: 375_000 }).vaerdi).toBe("15.000 kr. ekskl. moms · Betalt 26. juni 2026");
  });
  it("før backfill (moms ukendt): «18.750 kr. inkl. moms»", () => {
    expect(traekLinje({ ...basis, beloeb_oere: 1_875_000, moms_oere: null }).vaerdi).toBe("18.750 kr. inkl. moms · Betalt 26. juni 2026");
  });
  it("periodelinjen (company_perioder er uden moms) siger «ekskl. moms»", () => {
    expect(periodeLinje({ id: "p1", art: "fornyelse", betalingsmodel: "fuld", beloeb_oere: 2_000_000, periode_start: "2026-09-22", periode_slut: "2027-09-21" }).vaerdi)
      .toBe("20.000 kr. ekskl. moms · Fuld betaling · Fornyelse");
  });
});
