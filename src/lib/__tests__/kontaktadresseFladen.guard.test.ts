import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { KONTAKT_ADRESSE, mailtoKontakt } from "@/lib/kontaktadresse";

// Kildeværn for kontaktadressen på FLADEN (fund E, 14/9 2026): /betal viste
// «Spørgsmål? Skriv til jonas@topix.dk» — det fjerde og sidste sted med en
// personlig adresse i indgangen, og den skærm et menneske står på mens
// betalingen bekræftes. Målt i hele src/ 14/9: atten steder i seks filer.
// BESLUTTET (Jonas 14/9): kontakt@theboardroom.dk. Samme form som
// kontaktadresse.guard.test.ts (mailene): forbudte former ude, adressen
// inde hvor den vises — og de to konstanter (src/lib og Deno-siden) ens.

const ROOT = process.cwd();
const laes = (sti: string) => readFileSync(resolve(ROOT, sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const FORBUDT = [/jonas@/, /morten@/, /@topix\.dk/, /@molainvest\.dk/];

/** De seks filer der bar adressen 14/9. */
const BEROERTE = [
  "src/pages/Betal.tsx",
  "src/components/CompanyLinkFailedGate.tsx",
  "src/components/MembershipExpiredGate.tsx",
  "src/components/FornyelseKvittering.tsx",
  "src/components/hjemmebane/booksession/BookSessionView.tsx",
  "src/pages/ChatShell.tsx",
];
/** De fire der VISER adressen som tekst («Spørgsmål? Skriv til …»). */
const VISER_ADRESSEN = BEROERTE.slice(0, 4);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      walk(full, out);
    } else out.push(full);
  }
  return out;
}
const kildefiler = () =>
  walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f) && !/[._]test\.tsx?$/.test(f) && !f.includes(join("src", "test")));

describe("kontaktadresseFladen.guard — ingen personlig adresse på fladen", () => {
  it("konstanten er kontakt@theboardroom.dk, og mailtoKontakt bærer emnet URL-kodet", () => {
    expect(KONTAKT_ADRESSE).toBe("kontakt@theboardroom.dk");
    expect(mailtoKontakt()).toBe("mailto:kontakt@theboardroom.dk");
    expect(mailtoKontakt("The Boardroom — mit betalingslink")).toBe(
      `mailto:kontakt@theboardroom.dk?subject=${encodeURIComponent("The Boardroom — mit betalingslink")}`,
    );
  });

  it("ingen kildefil under src/ (tests undtaget) nævner jonas@, morten@, @topix.dk eller @molainvest.dk", () => {
    const offenders: string[] = [];
    for (const f of kildefiler()) {
      const uden = udenKommentarer(readFileSync(f, "utf8"));
      uden.split("\n").forEach((line, i) => {
        if (FORBUDT.some((r) => r.test(line))) offenders.push(`${relative(ROOT, f)}:${i + 1}`);
      });
    }
    expect(offenders, `Personlig adresse i fladen (adressen er lib/kontaktadresse.ts): ${offenders.join(", ")}`).toEqual([]);
  });

  it("de seks berørte filer går gennem lib/kontaktadresse.ts — ingen egen mailto-literal", () => {
    for (const sti of BEROERTE) {
      const kode = udenKommentarer(laes(sti));
      expect(kode, sti).toMatch(/from "@\/lib\/kontaktadresse"/);
      expect(kode, sti).toContain("mailtoKontakt(");
      expect(kode, sti).not.toMatch(/mailto:[a-z]/i);
    }
  });

  it("hvor adressen vises som tekst, vises konstanten — «Spørgsmål? Skriv til {KONTAKT_ADRESSE}»", () => {
    for (const sti of VISER_ADRESSEN) {
      const kode = udenKommentarer(laes(sti));
      expect(kode, sti).toContain("Spørgsmål? Skriv til");
      expect(kode, sti).toMatch(/\{KONTAKT_ADRESSE\}/);
    }
  });

  it("src/lib og Deno-siden (_shared/indgangsMail.ts) har SAMME adresse — de kan ikke importere hinanden, så literalerne sammenlignes", () => {
    const deno = udenKommentarer(laes("supabase/functions/_shared/indgangsMail.ts")).match(/export const KONTAKT_ADRESSE = "([^"]+)";/)?.[1];
    const frontend = udenKommentarer(laes("src/lib/kontaktadresse.ts")).match(/export const KONTAKT_ADRESSE = "([^"]+)";/)?.[1];
    expect(deno, "KONTAKT_ADRESSE ikke fundet i indgangsMail.ts").toBeTruthy();
    expect(frontend, "KONTAKT_ADRESSE ikke fundet i src/lib/kontaktadresse.ts").toBeTruthy();
    expect(frontend).toBe(deno);
    expect(frontend).toBe(KONTAKT_ADRESSE);
  });
});
