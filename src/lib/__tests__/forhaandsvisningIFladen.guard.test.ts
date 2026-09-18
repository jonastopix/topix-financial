import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afgoerForhaandsvisning } from "@/lib/hjemmebane/forhaandsvisning";

// Forhåndsvisningen i fladen (18/9 aften): window.open efter await blokeres uanset pop-up-indstilling.
const ROD = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROD, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:"'])\/\/[^\n]*/g, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const KOMPONENT = "src/components/hjemmebane/virksomhed/SendTilUnderskrift.tsx";

/** Intet nyt vindue; svaret lander i state og vises som ren tekst i et panel med Luk. */
export const forhaandsvisningenErIFladen = (k: string): boolean =>
  !k.includes("window.open(") && !k.includes("dangerouslySetInnerHTML") &&
  k.includes("setForhaandsvisning({ oere, svar: (data ?? {}) as ForhaandsvisningSvar });") &&
  k.includes("data-forhaandsvisning={forhaandsvisning.oere}") && /<pre[^>]*>\{dom\.tekst\}<\/pre>/.test(k) &&
  k.includes("data-forhaandsvisning-luk");

describe("afgoerForhaandsvisning — linjen øverst", () => {
  it("kan sendes: adressen og «intet er sendt»; ingen grunde", () => {
    const d = afgoerForhaandsvisning({ kan_sendes: true, til: "lisbeth@nordicbyg.test", titel: "Aftalegrundlag", skabelon: "aftale v3", tekst: "Hej" });
    expect(d.kanSendes).toBe(true);
    expect(d.linje).toBe("Kan sendes til lisbeth@nordicbyg.test — dette er en forhåndsvisning, intet er sendt.");
    expect(d.grunde).toEqual([]);
    expect(d).toMatchObject({ titel: "Aftalegrundlag", skabelon: "aftale v3", tekst: "Hej" });
  });
  it("kan ikke sendes: ukendte felter, tomme felter og manglende mail som grunde", () => {
    const d = afgoerForhaandsvisning({ kan_sendes: false, manglende: ["samlet_kr"], tomme: ["adresse"], til: null });
    expect(d.kanSendes).toBe(false);
    expect(d.grunde).toEqual(["{{samlet_kr}} kendes ikke", "{{adresse}} er tom", "ingen kontaktmail"]);
    expect(d.linje).toBe("Kan ikke sendes: {{samlet_kr}} kendes ikke · {{adresse}} er tom · ingen kontaktmail.");
  });
  it("tomt svar → kan ikke sendes, ukendt grund, tomme tekster", () => {
    expect(afgoerForhaandsvisning({})).toMatchObject({ kanSendes: false, linje: "Kan ikke sendes: ingen kontaktmail.", titel: "", skabelon: "", tekst: "" });
    expect(afgoerForhaandsvisning({ til: "x@y.dk" }).linje).toBe("Kan ikke sendes: ukendt grund.");
  });
});

describe("forhaandsvisningIFladen.guard", () => {
  it("SendTilUnderskrift åbner intet vindue; panelet viser teksten som ren tekst", () => expect(forhaandsvisningenErIFladen(udenKommentarer(laes(KOMPONENT)))).toBe(true));
  it("VÆRNET VIRKER: window.open tilbage → falsk; HTML fra data → falsk; panelet væk → falsk", () => {
    const k = udenKommentarer(laes(KOMPONENT));
    expect(forhaandsvisningenErIFladen(k + '\nconst w = window.open("", "_blank");\n')).toBe(false);
    expect(forhaandsvisningenErIFladen(k.replace("<pre", "<pre dangerouslySetInnerHTML={{ __html: dom.tekst }}"))).toBe(false);
    expect(forhaandsvisningenErIFladen(k.replace("data-forhaandsvisning-luk", "data-x"))).toBe(false);
  });
});
