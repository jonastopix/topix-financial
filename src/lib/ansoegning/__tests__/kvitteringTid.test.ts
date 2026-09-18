import { describe, expect, it } from "vitest";
import { hvornaarKommerKvitteringen, kvitteringensTidspunkt } from "@/lib/ansoegning/kvitteringTid";
import { KVITTERING } from "@/lib/ansoegning/spoergsmaal";
import { erHverdagDato, kbhDato, kbhTilUtc, naesteHverdagFra } from "@/lib/hverdage";

// Generalprøvens brist 2 (18/9): kvitteringsskærmen spørger køen, hvornår mailen kommer.
// Datoerne er faste danske tidspunkter (kbhTilUtc), så testen er ens sommer og vinter.
const dk = (dato: string, time: number, minut = 0) => kbhTilUtc(dato, time, minut);

describe("hvornaarKommerKvitteringen — køens egen dom, ikke en fast formulering", () => {
  it("fredag 18/9 kl. 15 (i vinduet, efter kl. 10) → «om et øjeblik»", () => {
    expect(hvornaarKommerKvitteringen(dk("2026-09-18", 15))).toBe("om et øjeblik");
  });
  it("fredag 18/9 kl. 16:30 (vinduet lukket) → «mandag morgen» — ikke «i morgen tidlig»", () => {
    expect(hvornaarKommerKvitteringen(dk("2026-09-18", 16, 30))).toBe("mandag morgen");
    expect(kvitteringensTidspunkt(dk("2026-09-18", 16, 30)).toISOString()).toBe(dk("2026-09-21", 7).toISOString());
  });
  it("lørdag og søndag → «mandag morgen»", () => {
    expect(hvornaarKommerKvitteringen(dk("2026-09-19", 11))).toBe("mandag morgen");
    expect(hvornaarKommerKvitteringen(dk("2026-09-20", 21))).toBe("mandag morgen");
  });
  it("torsdag 17/9 kl. 17 → «i morgen tidlig» (fredag kl. 7)", () => {
    expect(hvornaarKommerKvitteringen(dk("2026-09-17", 17))).toBe("i morgen tidlig");
    expect(kvitteringensTidspunkt(dk("2026-09-17", 17)).toISOString()).toBe(dk("2026-09-18", 7).toISOString());
  });
  it("mandag kl. 08:30 (i vinduet, før kl. 10) → «i dag kl. 10» — dag 0-rækken ligger kl. 10", () => {
    expect(hvornaarKommerKvitteringen(dk("2026-09-21", 8, 30))).toBe("i dag kl. 10");
  });
  it("mandag kl. 06:30 (før vinduet) → «i dag kl. 10»", () => {
    expect(hvornaarKommerKvitteringen(dk("2026-09-21", 6, 30))).toBe("i dag kl. 10");
  });
  it("mere end seks dage frem (jul) → datoen, ikke en ugedag — og datoen er køens egen næste hverdag", () => {
    const nu = dk("2026-12-23", 17);
    const t = kvitteringensTidspunkt(nu);
    const forventetDato = naesteHverdagFra("2026-12-24", true);
    expect(kbhDato(t)).toBe(forventetDato);
    expect(erHverdagDato(kbhDato(t))).toBe(true);
    const tekst = hvornaarKommerKvitteringen(nu);
    expect(tekst === "i morgen tidlig" || / morgen$/.test(tekst) || / om morgenen$/.test(tekst)).toBe(true);
  });
  it("teksten på skærmen bærer svaret og lover ikke mere", () => {
    const t = KVITTERING.tekst("mandag morgen");
    expect(t).toContain("Du får en mail med det, du skrev — mandag morgen.");
    expect(t).not.toContain("i morgen tidlig");
  });
});
