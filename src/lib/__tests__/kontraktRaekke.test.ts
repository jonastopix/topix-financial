import { describe, expect, it } from "vitest";
// Deno-filen læses direkte (som paritetstestene): den har nul imports.
import { bygKontraktRaekke, kontraktBetalingsmodel, type KontraktInput } from "../../../supabase/functions/_shared/kontraktRaekke.ts";

/* Kontraktåret webhooken skriver (18/9-2026). Jonas 17/9: «Prisen er det, der
   faktisk er faktureret. Grundprisen er det, fornyelsen regner fra.» */

const input = (over: Partial<KontraktInput> = {}): KontraktInput => ({
  company_id: "c1",
  periode_id: "p1",
  periode_start: "2026-09-22",
  periode_slut: "2027-09-22",
  beloeb_oere: 5_250_000,
  grundbeloeb_oere: 5_000_000,
  betalingsmodel: "rate12",
  art: "indgang",
  stripe_reference: "cs_test_1",
  ...over,
});

describe("bygKontraktRaekke", () => {
  it("indgang rate12: pris = det fakturerede inkl. 5 % (52.500), grundpris = listeprisen (50.000), kilde indgang, bilaget med", () => {
    const r = bygKontraktRaekke(input());
    expect(r.ok).toBe(true);
    if (r.ok === false) throw new Error(r.grund);
    expect(r.raekke).toEqual({
      company_id: "c1", periode_start: "2026-09-22", periode_slut: "2027-09-22",
      grundpris_oere: 5_000_000, pris_eks_moms_oere: 5_250_000, betalingsmodel: "rate12", kilde: "indgang", periode_id: "p1",
      note: "Skrevet af stripe-webhook ved indgang (rate12, cs_test_1). Prisen er det fakturerede ekskl. moms; grundprisen er listeprisen.",
    });
  });
  it("faktura (dag 31, én fuld betaling uden tillæg) skrives som 'fuld' — kontrakter kender ikke 'faktura'", () => {
    const r = bygKontraktRaekke(input({ betalingsmodel: "faktura", beloeb_oere: 4_000_000, grundbeloeb_oere: 4_000_000, periode_id: null, stripe_reference: "in_1" }));
    if (r.ok === false) throw new Error(r.grund);
    expect(r.raekke.betalingsmodel).toBe("fuld");
    expect(r.raekke.pris_eks_moms_oere).toBe(4_000_000);
    expect(r.raekke.grundpris_oere).toBe(4_000_000);
    expect(r.raekke.periode_id).toBeNull();
    expect(kontraktBetalingsmodel("faktura")).toBe("fuld");
    expect(kontraktBetalingsmodel("fuld")).toBe("fuld");
    expect(kontraktBetalingsmodel("rate2")).toBe("rate2");
    expect(kontraktBetalingsmodel("maanedlig")).toBeNull();
  });
  it("fornyelse: kilde fornyelse, år 2-prisen (50 % af indgangsprisen) som grundpris, det fakturerede som pris", () => {
    const r = bygKontraktRaekke(input({ art: "fornyelse", periode_start: "2027-09-22", periode_slut: "2028-09-22", beloeb_oere: 2_625_000, grundbeloeb_oere: 2_500_000, stripe_reference: "cs_f" }));
    if (r.ok === false) throw new Error(r.grund);
    expect(r.raekke).toMatchObject({ kilde: "fornyelse", grundpris_oere: 2_500_000, pris_eks_moms_oere: 2_625_000, periode_start: "2027-09-22" });
  });
  it("afrunder øre til heltal", () => {
    const r = bygKontraktRaekke(input({ beloeb_oere: 5_250_000.4, grundbeloeb_oere: 4_999_999.6 }));
    if (r.ok === false) throw new Error(r.grund);
    expect(r.raekke.pris_eks_moms_oere).toBe(5_250_000);
    expect(r.raekke.grundpris_oere).toBe(5_000_000);
  });
  it("fejler med grund — aldrig et kast — på ulæselig periode, slut ≤ start, negative beløb, ukendt model eller art, manglende company_id", () => {
    const grund = (over: Partial<KontraktInput>) => {
      const r = bygKontraktRaekke(input(over));
      return r.ok === false ? r.grund : "OK";
    };
    expect(grund({ periode_start: "22/9-2026" })).toMatch(/ulæselig/);
    expect(grund({ periode_slut: "2026-09-22" })).toMatch(/slutter ikke efter start/);
    expect(grund({ beloeb_oere: -1 })).toMatch(/beloeb_oere/);
    expect(grund({ grundbeloeb_oere: NaN })).toMatch(/grundbeloeb_oere/);
    expect(grund({ betalingsmodel: "maanedlig" })).toMatch(/ukendt betalingsmodel/);
    expect(grund({ art: "manuel" as never })).toMatch(/ukendt art/);
    expect(grund({ company_id: "" })).toMatch(/company_id/);
    expect(grund({})).toBe("OK");
  });
});
