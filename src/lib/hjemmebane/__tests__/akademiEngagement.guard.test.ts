// Kildeværn for Akademiet på /engagement (3/10-2026).
//   1. Fladen og hentningen tolker ALDRIG medlemmets tidsstempler selv —
//      kun dommen (akademiFremdrift.ts → itemProgressState) gør.
//   2. Dommen går gennem itemProgressState/markeringsTilstand/medlemmetsSenesteStempel
//      og læser ikke de rå felter.
//   3. Rådgivere og tjenestekonti trækkes fra (hentRaadgiverListe → dommen).
// Selvbevis: hver dom prøves også på en lille kilde, der SKAL fælde den.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const RAA_FELTER = /\.(seen_at|acknowledged_at|skipped_at|markeret_at)\b|\[\s*["'](seen_at|acknowledged_at|skipped_at|markeret_at)["']\s*\]/;

/** Dom 1: kilden må ikke læse et rå tidsstempelfelt som egenskab. */
const tolkerSelv = (kilde: string) => RAA_FELTER.test(udenKommentarer(kilde));

/** Dom 2: dommen bruger husets tre funktioner og læser ingen rå felter. */
const dommenGaarGennemProgressState = (kilde: string) => {
  const kode = udenKommentarer(kilde);
  return (
    /itemProgressState\(/.test(kode) &&
    /markeringsTilstand\(/.test(kode) &&
    /medlemmetsSenesteStempel\(/.test(kode) &&
    /from "\.\/progressState"/.test(kode) &&
    !RAA_FELTER.test(kode)
  );
};

/** Dom 3: hentEngagement giver rådgiverlisten til akademidommen. */
const traekkerRaadgivereFra = (kilde: string) =>
  /akademiFremdriftPrVirksomhed\(\s*[\s\S]{0,200}?,\s*raadgivere,/.test(udenKommentarer(kilde));

describe("Akademiet på /engagement — kildeværn", () => {
  it("1. fladen og hentningen tolker ikke seen_at/acknowledged_at selv", () => {
    expect(tolkerSelv(laes("src/components/hjemmebane/engagement/EngagementView.tsx"))).toBe(false);
    expect(tolkerSelv(laes("src/hooks/trofaeer.ts"))).toBe(false);
    // Selvbevis: en flade, der dømmer selv, fældes.
    expect(tolkerSelv(`const set = rows.filter((r) => r.acknowledged_at).length;`)).toBe(true);
    expect(tolkerSelv(`const s = row["seen_at"];`)).toBe(true);
    // … men en kommentar om feltet fælder ikke.
    expect(tolkerSelv(`// læser aldrig r.acknowledged_at\nconst x = 1;`)).toBe(false);
  });

  it("2. dommen går gennem progressState", () => {
    expect(dommenGaarGennemProgressState(laes("src/lib/hjemmebane/akademiFremdrift.ts"))).toBe(true);
    // Selvbevis: en dom med egen fortolkning fældes.
    expect(
      dommenGaarGennemProgressState(
        `import { itemProgressState, markeringsTilstand, medlemmetsSenesteStempel } from "./progressState";\nconst done = r.acknowledged_at !== null;`,
      ),
    ).toBe(false);
    expect(dommenGaarGennemProgressState(`const done = Boolean(x);`)).toBe(false);
  });

  it("3. rådgivere og tjenestekonti trækkes fra i hentningen", () => {
    expect(traekkerRaadgivereFra(laes("src/hooks/trofaeer.ts"))).toBe(true);
    // Selvbevis: uden rådgiverlisten fældes.
    expect(traekkerRaadgivereFra(`akademiFremdriftPrVirksomhed(raekker, medlemmer, new Set(), ids, katalog)`)).toBe(false);
  });

  it("4. fladen viser dommens ord (akademiTekst) og ikke en egen tælling", () => {
    const fladenBrugerDommen = (kilde: string) => {
      const kode = udenKommentarer(kilde);
      return (
        /akademiTekst\(r\.akademi\)/.test(kode) &&
        /akademiSorteringsnoegle\(r\.akademi\)/.test(kode) &&
        !/member_progress|itemProgressState|egetStempel|erRaadgiverensStempel/.test(kode)
      );
    };
    expect(fladenBrugerDommen(laes("src/components/hjemmebane/engagement/EngagementView.tsx"))).toBe(true);
    // Selvbevis: en flade, der tæller selv, eller som dømmer med progressState direkte, fældes.
    expect(fladenBrugerDommen(`const t = \`\${r.akademi.set} af \${r.akademi.ialt}\`;`)).toBe(false);
    expect(
      fladenBrugerDommen(`akademiTekst(r.akademi); akademiSorteringsnoegle(r.akademi); itemProgressState(row);`),
    ).toBe(false);
  });
});
