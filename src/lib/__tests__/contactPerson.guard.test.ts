/**
 * Kildeværn (14/9 2026): companies.contact_person sættes ad BEGGE veje ind
 * fra samme kilde-logik.
 *
 * MÅLT: byggVirksomhedsRaekke skrev aldrig contact_person; navnet landede i
 * application_context.contact_name, og 35 af 39 virksomheder stod med
 * kolonnens DEFAULT ''. Bevist 14/9: Monday-vejen satte feltet (B5, en
 * separat opdatering efter rækken), import-vejen gjorde ikke. Nu bærer
 * rækken feltet, Monday-vejens navnesamling går gennem bygKontaktperson, og
 * begge kaldere sender contact_name ind til rækkebyggeren.
 *
 * Kildelæsning for de to functions (de importerer npm:/esm.sh-moduler);
 * direkte import af mondayAnsoegning.ts, som er ren.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bygKontaktnavn } from "../../../supabase/functions/_shared/mondayAnsoegning.ts";
import { bygKontaktperson } from "../../../supabase/functions/_shared/virksomhedsraekke.ts";

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

describe("contactPerson.guard — rækkebyggeren bærer feltet i begge kopier", () => {
  for (const sti of ["supabase/functions/_shared/virksomhedsraekke.ts", "src/lib/virksomhedsraekke.ts"]) {
    it(`${sti}: contact_person: bygKontaktperson(input.contact_name)`, () => {
      const kode = udenKommentarer(laes(sti));
      expect(kode).toContain("contact_person: bygKontaktperson(input.contact_name),");
      expect(kode).toContain("export function bygKontaktperson(...dele: Array<string | null | undefined>): string {");
    });
  }
});

describe("contactPerson.guard — Monday-vejen (delt navn) går gennem samme funktion", () => {
  it("bygKontaktnavn i mondayAnsoegning.ts delegerer til bygKontaktperson og oversætter kun tomt til null", () => {
    const kode = udenKommentarer(laes("supabase/functions/_shared/mondayAnsoegning.ts"));
    expect(kode).toContain('import { bygKontaktperson } from "./virksomhedsraekke.ts";');
    expect(kode).toContain("return bygKontaktperson(fornavn, efternavn) || null;");
  });

  it("Fornavn + Efternavn giver samme streng som den delte funktion; tomt giver null til kalderen", () => {
    expect(bygKontaktnavn("Anne Marie", "Møller Jensen")).toBe(bygKontaktperson("Anne Marie", "Møller Jensen"));
    expect(bygKontaktnavn("Anne Marie", "Møller Jensen")).toBe("Anne Marie Møller Jensen");
    expect(bygKontaktnavn("Caspar", null)).toBe("Caspar");
    expect(bygKontaktnavn(null, "")).toBeNull();
  });

  it("monday-webhook sender det samlede navn ind som contact_name til rækkebyggeren — og B5 står stadig for genbrug", () => {
    const kode = udenKommentarer(laes("supabase/functions/monday-webhook/index.ts"));
    expect(kode).toContain("const kontaktnavn = bygKontaktnavn(felter.fornavn, felter.efternavn);");
    expect(kode).toContain("contact_name: kontaktnavn,");
    expect(kode).toContain("if (kontaktnavn) opdatering.contact_person = kontaktnavn;");
  });
});

describe("contactPerson.guard — import-vejen (samlet navn) sender contact_name ind", () => {
  it("import-application giver body.contact_name til opretEllerGenbrugVirksomhed", () => {
    const kode = udenKommentarer(laes("supabase/functions/import-application/index.ts"));
    expect(kode).toContain("contact_name: body.contact_name,");
    expect(kode).toContain("oprettet = await opretEllerGenbrugVirksomhed({");
  });

  it("virksomhedsOprettelse indsætter rækken fra byggVirksomhedsRaekke uden at pille felter af", () => {
    const kode = udenKommentarer(laes("supabase/functions/_shared/virksomhedsOprettelse.ts"));
    expect(kode).toContain("const raekke = byggVirksomhedsRaekke(input, cvrSvar);");
    expect(kode).toContain(".insert(raekke)");
  });
});
