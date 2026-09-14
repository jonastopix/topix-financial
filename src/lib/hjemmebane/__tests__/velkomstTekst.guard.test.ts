import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (14/9 2026): velkomstoverlejringens tekst må ikke stå som en
// fast sætning med en placering i fladen igen — den skal komme fra
// velkomstTekst(pilleTraekkerSig) i ankomst.ts, med samme dom som pillen.
// Kildelæsning: komponenten er React og læses ikke som modul her.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

describe("velkomstTekst.guard — HbOnboardingTjekliste", () => {
  const kode = udenKommentarer(laes("src/components/hjemmebane/HbOnboardingTjekliste.tsx"));

  it("den gamle sætning med «nederst på siden» findes ikke længere i fladen", () => {
    expect(kode).not.toMatch(/Tjeklisten nederst på siden/);
    expect(kode).not.toMatch(/Her er en kort gennemgang af/);
  });

  it("overlejringen læser tilstanden gennem velkomstTekst(pilleTraekkerSig) — samme prop skallen allerede giver boksen", () => {
    expect(kode).toContain('import { erVelkomstHash, velkomstTekst } from "@/lib/hjemmebane/ankomst";');
    expect(kode).toContain("{velkomstTekst(pilleTraekkerSig)}");
    expect(kode).toContain("pilleTraekkerSig={pilleTraekkerSig}");
    // Ingen ny prop gennem skallen: HbMemberShell giver stadig præcis den ene.
    const skal = udenKommentarer(laes("src/components/hjemmebane/HbMemberShell.tsx"));
    expect(skal.match(/pilleTraekkerSig=\{tjeklistePilleTraekkerSig\}/g) ?? []).toHaveLength(1);
  });
});
