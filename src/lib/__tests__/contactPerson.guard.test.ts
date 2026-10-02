/**
 * Kildeværn (14/9 2026): companies.contact_person sættes ad alle veje ind
 * fra samme kilde-logik.
 *
 * MÅLT: byggVirksomhedsRaekke skrev aldrig contact_person; navnet landede i
 * application_context.contact_name, og 35 af 39 virksomheder stod med
 * kolonnens DEFAULT ''. Bevist 14/9: den daværende Monday-vej satte feltet
 * (en separat opdatering efter rækken), import-vejen gjorde ikke. Nu bærer
 * rækken feltet, og hver kalder sender contact_name ind til rækkebyggeren.
 *
 * 2/10-2026: Monday-vejen er nedlagt (monday-webhook svarer 410,
 * mondayAnsoegning.ts er slettet — mondayVaek.guard). Dommene om den er
 * taget ud; bygKontaktperson (delt navn → ét) lever videre i
 * virksomhedsraekke.ts og prøves i virksomhedsraekke.test.ts.
 *
 * Kildelæsning for functions (de importerer npm:/esm.sh-moduler).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

describe("contactPerson.guard — import-vejen (samlet navn) sender contact_name ind", () => {
  it("import-application giver body.contact_name til opretEllerGenbrugVirksomhed", () => {
    const kode = udenKommentarer(laes("supabase/functions/import-application/index.ts"));
    expect(kode).toContain("contact_name: body.contact_name,");
    expect(kode).toContain("oprettet = await opretEllerGenbrugVirksomhed({");
  });

  it("virksomhedsOprettelse indsætter rækken fra byggVirksomhedsRaekke uden at pille felter af", () => {
    const kode = udenKommentarer(laes("supabase/functions/_shared/virksomhedsOprettelse.ts"));
    expect(kode).toContain("const raekke = byggVirksomhedsRaekke(input, cvrSvar);");
    // 18/9 (ansøgningsmotoren): rækken må få et id lagt til — ansøgningen bliver
    // virksomheden med samme id — men ingen felter piller af. Formen låses.
    expect(kode).toContain(".insert(valg.id ? { ...raekke, id: valg.id } : raekke)");
    expect(kode).not.toMatch(/\.insert\(\{[^}]*\.\.\.raekke[^}]*(name|contact_person|contact_email):/);
  });
});
