import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INTRO, prisTekst } from "@/lib/ansoegning/spoergsmaal";
import { MEDLEMSKAB_PRIS_KR_AAR } from "@/lib/ansoegning/skema";

/**
 * Prisen med begge beløb (Jonas 28/9-2026): 50.000 kr. er fuld betaling,
 * 4.375 kr./md. er tolv rater med 5 % tillæg — introen skal sige begge og
 * hvilken betalingsform, hvert tal er. Tallene kommer fra skema.ts og
 * prismotoren, ikke fra en sætning nogen har skrevet af.
 */
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

describe("prisTekst — begge beløb, og hvad de er", () => {
  it("standardprisen: 50.000 fuldt, 4.167 pr. måned, tolv rater à 4.375 med 5 % tillæg", () => {
    expect(prisTekst()).toBe(
      "Medlemskabet koster 50.000 kr. om året ekskl. moms, betalt på én gang — det svarer til 4.167 kr. om måneden. " +
      "Vil du hellere betale i tolv rater, er det 4.375 kr. om måneden (5 % tillæg).",
    );
    expect(MEDLEMSKAB_PRIS_KR_AAR).toBe(50_000);
    expect(INTRO.pris).toBe(prisTekst());
  });

  it("siger ALDRIG 52.500 som årspris (udkastVaern R2), og aldrig et tal uden dets betalingsform", () => {
    const t = prisTekst();
    expect(t).not.toContain("52.500");
    expect(t).toContain("betalt på én gang");
    expect(t).toContain("tolv rater");
  });

  it("det andet kendte niveau (40.000): 3.333 pr. måned, tolv rater à 3.500", () => {
    expect(prisTekst(40_000)).toContain("40.000 kr. om året ekskl. moms, betalt på én gang — det svarer til 3.333 kr. om måneden.");
    expect(prisTekst(40_000)).toContain("3.500 kr. om måneden (5 % tillæg)");
  });

  it("et niveau, prismotoren ikke kender, får kun den fulde betaling — aldrig en gættet rate", () => {
    const t = prisTekst(45_000);
    expect(t).toContain("45.000 kr. om året ekskl. moms, betalt på én gang");
    expect(t).not.toContain("rater");
  });
});

describe("kildeværn — introen siger prisen ét sted", () => {
  const INTRO_FLADE = "src/components/ansoegning/AnsoegIntro.tsx";
  const introSigerPrisenEtSted = (flade: string): boolean => {
    const f = udenKommentarer(flade);
    return f.includes("{INTRO.pris}") && !/koster/.test(f) && !/MEDLEMSKAB_PRIS_KR_AAR/.test(f);
  };

  it("AnsoegIntro tegner INTRO.pris — og bygger ingen egen prissætning", () => {
    expect(introSigerPrisenEtSted(laes(INTRO_FLADE))).toBe(true);
  });

  it("selvbevis: en egen sætning i fladen, eller INTRO.pris fjernet, falder", () => {
    const flade = laes(INTRO_FLADE);
    expect(introSigerPrisenEtSted(flade.replace("{INTRO.pris}", "Medlemskabet koster 50.000 kr. om året ekskl. moms."))).toBe(false);
    expect(introSigerPrisenEtSted(flade.replace("{INTRO.pris}", "{INTRO.prisNote}"))).toBe(false);
  });
});
