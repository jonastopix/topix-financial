import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for «Svar pr. lektion» uden ikke-kunder (16/9-2026). Tre ting
// låses, så tallet aldrig igen regnes med rådgiverlisten alene:
//   1. ProgressView giver udelukFraBrugbar(raadgivereQuery.data, membersQuery.data)
//      til optaelBrugbarPrLektion — ikke raadgivereQuery.data alene.
//   2. listMembers' select på companies nævner er_kunde, og rækken bærer
//      companyErKunde via erKunde (fail-open, raadgiverensKunder.ts).
//   3. Gaten for brugbarOptaelling indeholder membersQuery.isSuccess, og
//      fejlgrenen membersQuery.isError — aldrig tal uden udelukkelsen, og
//      aldrig «Henter…» for evigt når medlemslisten fejler.
// React/react-query uden ren funktion at kalde → kildelæsning
// (lektionBrugbar.guard-mønstret), og værnet beviser sig selv på en KOPI med
// det gamle kald indsat. lektionBrugbar.guard.test.ts er urørt.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
export const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const PROGRESS_VIEW = "src/components/hjemmebane/admin/views/ProgressView.tsx";
const ADMIN_API = "src/lib/hjemmebane/adminContentApi.ts";

const GAMMELT_KALD = "optaelBrugbarPrLektion(progressQuery.data, raadgivereQuery.data)";
const NYT_KALD = "optaelBrugbarPrLektion(progressQuery.data, udeluk)";
const SAETTET = "const udeluk = udelukFraBrugbar(raadgivereQuery.data, membersQuery.data);";

/** Blokken `const brugbarOptaelling = useMemo(` frem til `]);` — gaten og kaldet. */
export function optaellingsBlok(kilde: string): string {
  const start = kilde.indexOf("const brugbarOptaelling = useMemo(");
  if (start === -1) throw new Error("ProgressView: fandt ikke `const brugbarOptaelling = useMemo(`");
  const slut = kilde.indexOf("]);", start);
  return kilde.slice(start, slut === -1 ? kilde.length : slut + 3);
}

/** Funktionskroppen for `export async function <navn>(` frem til første `\n}`. */
export function funktionsBlok(kilde: string, navn: string): string {
  const start = kilde.indexOf(`export async function ${navn}(`);
  if (start === -1) throw new Error(`fandt ikke \`export async function ${navn}(\``);
  const slut = kilde.indexOf("\n}", start);
  return kilde.slice(start, slut === -1 ? kilde.length : slut + 2);
}

/** Dom 1: sættet bygges af begge kilder og gives til optællingen; det gamle kald findes ikke. */
export const giverSaettet = (blok: string): boolean =>
  blok.includes(SAETTET) && blok.includes(NYT_KALD) && blok.includes("optaelBrugbarPrLektion([], udeluk)") && !blok.includes(GAMMELT_KALD);

/** Dom 2: listMembers henter er_kunde og sætter companyErKunde med erKunde. */
export const henterErKunde = (blok: string): boolean =>
  /\.from\("companies"\)\.select\("[^"]*\ber_kunde\b[^"]*"\)/.test(blok) &&
  blok.includes("companyErKunde: erKunde(companyById.get(m.company_id) ?? {})");

/** Dom 3: gaten kræver membersQuery.isSuccess. */
export const gatenKraeverMedlemmer = (blok: string): boolean =>
  /if \(!raadgivereQuery\.isSuccess \|\| !membersQuery\.isSuccess\) return null;/.test(blok);

describe("brugbarUdelukkelse.guard — tallet regnes aldrig med rådgiverlisten alene", () => {
  const view = udenKommentarer(laes(PROGRESS_VIEW));
  const admin = udenKommentarer(laes(ADMIN_API));
  const blok = optaellingsBlok(view);
  const listMembers = funktionsBlok(admin, "listMembers");

  it("1. ProgressView giver udelukFraBrugbar(raadgivereQuery.data, membersQuery.data) til optaelBrugbarPrLektion", () => {
    expect(giverSaettet(blok)).toBe(true);
    expect(view).toContain('import { brugbarLinje, optaelBrugbarPrLektion, udelukFraBrugbar } from "@/lib/hjemmebane/lektionBrugbar";');
    expect(view).not.toContain(GAMMELT_KALD);
  });

  it("2. listMembers' select nævner er_kunde, og rækken bærer companyErKunde via erKunde", () => {
    expect(henterErKunde(listMembers)).toBe(true);
    expect(admin).toContain('import { erKunde } from "@/lib/raadgiverensKunder";');
    expect(admin).toContain("companyErKunde: boolean;");
  });

  it("3. gaten indeholder membersQuery.isSuccess, deps bærer membersQuery, og fejlgrenen membersQuery.isError findes", () => {
    expect(gatenKraeverMedlemmer(blok)).toBe(true);
    expect(blok).toContain("membersQuery.isSuccess,");
    expect(blok).toContain("membersQuery.data,");
    expect(view).toContain('raadgiverHentefejlTekst(membersQuery.error, "listen")');
  });
});

describe("brugbarUdelukkelse.guard — dommene fanger fejlen på en kopi af kilden", () => {
  const view = udenKommentarer(laes(PROGRESS_VIEW));
  const admin = udenKommentarer(laes(ADMIN_API));

  it("1. det gamle kald (rådgiverlisten alene) fælder dom 1", () => {
    const gammel = optaellingsBlok(view).replace(SAETTET, "").replace(NYT_KALD, GAMMELT_KALD).replace("optaelBrugbarPrLektion([], udeluk)", "optaelBrugbarPrLektion([], raadgivereQuery.data)");
    expect(gammel).not.toBe(optaellingsBlok(view));
    expect(giverSaettet(gammel)).toBe(false);
  });

  it("2. en select uden er_kunde, eller companyErKunde uden erKunde, fælder dom 2", () => {
    const blok = funktionsBlok(admin, "listMembers");
    expect(henterErKunde(blok.replace('"id, name, is_legat, er_kunde"', '"id, name, is_legat"'))).toBe(false);
    expect(henterErKunde(blok.replace("companyErKunde: erKunde(companyById.get(m.company_id) ?? {})", "companyErKunde: true"))).toBe(false);
  });

  it("3. den gamle gate (kun rådgiverlisten) fælder dom 3", () => {
    const blok = optaellingsBlok(view);
    expect(gatenKraeverMedlemmer(blok.replace("if (!raadgivereQuery.isSuccess || !membersQuery.isSuccess) return null;", "if (!raadgivereQuery.isSuccess) return null;"))).toBe(false);
  });
});
