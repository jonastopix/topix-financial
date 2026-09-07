import { describe, it, expect } from "vitest";
import { beskrivMulighed, formatUdloebsdato, fornyelsesbaandTekst, kr } from "@/lib/hjemmebane/fornyelsesbaand";

describe("fornyelsesbåndets tekster", () => {
  it("kr: hele beløb uden decimaler, skæve med to — ører forsvinder ikke", () => {
    expect(kr(2_000_000)).toBe("20.000");
    expect(kr(218_750)).toBe("2.187,50");
    expect(kr(175_000)).toBe("1.750");
  });

  it("slutdatoen skrives som dansk dato med år; ulæselig eller manglende dato giver null", () => {
    expect(formatUdloebsdato("2026-09-29")).toBe("29. september 2026");
    expect(formatUdloebsdato(null)).toBeNull();
    expect(formatUdloebsdato("ikke-en-dato")).toBeNull();
  });

  it("PHILBERT-tilfældet: slutdato 29/9, 20.000 kr. — invitation, ingen alarm", () => {
    expect(fornyelsesbaandTekst({ contract_end_date: "2026-09-29", grundbeloeb_oere: 2_000_000 })).toEqual({
      overskrift: "Dit medlemskab udløber 29. september 2026",
      linje: "Forny nu til 20.000 kr. ekskl. moms — den nye periode begynder hvor den nuværende slutter.",
    });
  });

  it("uden læsbar slutdato udelades datoen frem for at vise noget forkert", () => {
    expect(fornyelsesbaandTekst({ contract_end_date: null, grundbeloeb_oere: 1_500_000 }).overskrift).toBe(
      "Dit medlemskab kan fornys nu",
    );
  });

  it("betalingsmodellerne beskrives som i gaten", () => {
    const m = (betalingsmodel: "fuld" | "rate2" | "rate12", samlet: number, rate: number, antal: number) => ({
      betalingsmodel, samlet_oere: samlet, rate_oere: rate, antal_traek: antal, lookup_key: `fornyelse_20000_${betalingsmodel}`,
    });
    expect(beskrivMulighed(m("fuld", 2_000_000, 2_000_000, 1))).toBe("Betal på én gang");
    expect(beskrivMulighed(m("rate2", 2_000_000, 1_000_000, 2))).toBe("2 rater à 10.000 kr. — nu og om 6 måneder");
    expect(beskrivMulighed(m("rate12", 2_100_000, 175_000, 12))).toBe("12 rater à 1.750 kr. — i alt 21.000 kr.");
  });
});
