import { describe, expect, it } from "vitest";
import {
  IMPORT_ADVARSEL_ANDEN_VEJ,
  IMPORT_ADVARSEL_LINJER,
  IMPORT_ADVARSEL_OVERSKRIFT,
  importAdvarsel,
} from "../importensAdvarsel";

describe("importAdvarsel — teksten før «Importér og send invitation»", () => {
  it("vises altid — dialogen har kun én tilstand siden berig blev fjernet 10/9", () => {
    const a = importAdvarsel();
    expect(a.overskrift).toBe(IMPORT_ADVARSEL_OVERSKRIFT);
    expect(a.linjer).toBe(IMPORT_ADVARSEL_LINJER);
    expect(a.andenVej).toBe(IMPORT_ADVARSEL_ANDEN_VEJ);
  });

  it("siger de tre ting der adskiller import fra ansøgningsvejen", () => {
    expect(IMPORT_ADVARSEL_LINJER).toHaveLength(3);
    const [datoer, betaling, adgang] = IMPORT_ADVARSEL_LINJER;
    expect(datoer).toMatch(/kontraktdatoerne fra regnearket/);
    expect(betaling).toMatch(/ikke noget betalingslink/);
    expect(betaling).toMatch(/ingen betaling/);
    expect(adgang).toMatch(/straks/);
    expect(adgang).toMatch(/adgang med det samme/);
  });

  it("peger på den anden vej — underskriften i platformen (Monday nedlagt 2/10-2026, mondayVaek.guard)", () => {
    expect(IMPORT_ADVARSEL_ANDEN_VEJ).toBe(
      "Skal de betale først, sker det automatisk når ansøgningen underskrives i platformen.",
    );
    expect(IMPORT_ADVARSEL_ANDEN_VEJ).not.toMatch(/monday/i);
  });

  it("er roligt sprog — ingen udråbstegn, ingen advarselsord", () => {
    const alt = [IMPORT_ADVARSEL_OVERSKRIFT, ...IMPORT_ADVARSEL_LINJER, IMPORT_ADVARSEL_ANDEN_VEJ].join(" ");
    expect(alt).not.toMatch(/!/);
    expect(alt).not.toMatch(/advarsel|fejl|pas på|obs/i);
  });
});
