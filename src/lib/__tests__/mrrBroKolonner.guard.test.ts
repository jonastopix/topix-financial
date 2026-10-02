/**
 * MRR-broens kolonner har navne (Jonas 1/10-2026: «Sæt labels på kolonnerne … Det er svært at regne ud
 * for vores bogholder, hvad der er hvad»). Før stod etiketterne kun på mobil (`md:hidden`), og desktop
 * havde seks talkolonner uden overskrift. Værnet: én liste (BRO_KOLONNER) bærer både overskriftsrækken
 * og rækkernes etiketter, og forklaringen siger ekskl. moms og periodiseret.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const kilde = readFileSync("src/components/hjemmebane/oekonomi/OekonomiView.tsx", "utf8");

describe("MRR-broen har kolonnenavne", () => {
  it("overskriftsrækken findes og står over listen", () => {
    expect(kilde).toContain("data-bro-overskrift");
    const i = kilde.indexOf("<BroOverskrift />");
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(kilde.indexOf("data-oekonomi-bro={dom.bro.length}"));
  });
  it("hver talkolonne i rækken tager sin etiket fra BRO_KOLONNER — ingen løse strenge", () => {
    expect(kilde).not.toMatch(/<Tal label="/);
    for (const k of ["start", "ny", "op", "ned", "tabt", "slut"]) expect(kilde).toContain(`label={BRO_KOLONNER.${k}}`);
  });
  it("forklaringen siger MRR, ekskl. moms, periodiseret og primo + ændringer = ultimo", () => {
    expect(kilde).toMatch(/BRO_FORKLARING =\s*"MRR = månedlig tilbagevendende omsætning ekskl\. moms, periodiseret/);
    expect(kilde).toContain("MRR primo + ændringerne = MRR ultimo");
  });
});
