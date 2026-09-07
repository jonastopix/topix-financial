import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Driftværn (samlet 7/9): company_fornyelse skrives ÉT sted —
// src/hooks/useVirksomhed.ts (skrivFornyelsesbeslutning, skrivFornyelsesnote,
// sletFornyelsesbeslutning). Før lå der to skriveveje: FornyelsesSektion på
// /members havde sin egen upsert/update/delete, og Aftalen-kortet på
// virksomhedssiden (#707) fik sin egen. To skriveveje driver fra hinanden:
// den ene tjekker antal berørte rækker og invaliderer alle tre læsere, den
// anden gør måske ikke. Værnet læser kilden (agentforslagVenter.guard-
// mønstret): ethvert `.from("company_fornyelse")` hvis kæde (frem til det
// første `;`) indeholder .upsert(/.update(/.delete( uden for den ene fil
// er en fejl. Læsninger (.select uden skrivning) er fri.

const ROD = resolve(process.cwd(), "src");
const DEN_ENE_SKRIVEVEJ = "src/hooks/useVirksomhed.ts";
const SKRIVEKALD = /\.(upsert|update|delete)\(/;

function alleKildefiler(mappe: string): string[] {
  return readdirSync(mappe).flatMap((navn) => {
    const sti = join(mappe, navn);
    if (statSync(sti).isDirectory()) return navn === "__tests__" || navn === "node_modules" ? [] : alleKildefiler(sti);
    return /\.(ts|tsx)$/.test(navn) && !/\.test\.tsx?$/.test(navn) ? [sti] : [];
  });
}

/** Hver kæde der starter med .from("company_fornyelse" …) og løber til første `;`. */
function fornyelsesKaeder(kilde: string): string[] {
  const kaeder: string[] = [];
  const re = /\.from\(\s*"company_fornyelse"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(kilde)) !== null) {
    const slut = kilde.indexOf(";", m.index);
    kaeder.push(kilde.slice(m.index, slut === -1 ? kilde.length : slut));
  }
  return kaeder;
}

const filer = alleKildefiler(ROD).map((sti) => relative(process.cwd(), sti));

describe("company_fornyelse skrives ét sted", () => {
  it("værnet ser kildefilerne (ikke et tomt træ)", () => {
    expect(filer.length).toBeGreaterThan(100);
    expect(filer).toContain(DEN_ENE_SKRIVEVEJ);
    expect(filer).toContain("src/components/members/FornyelsesSektion.tsx");
  });

  it(`${DEN_ENE_SKRIVEVEJ}: bærer alle tre skrivekald (upsert, update, delete)`, () => {
    const kaeder = fornyelsesKaeder(readFileSync(resolve(process.cwd(), DEN_ENE_SKRIVEVEJ), "utf8"));
    for (const kald of ["upsert", "update", "delete"] as const) {
      expect(kaeder.some((k) => k.includes(`.${kald}(`)), `.${kald}( mangler i den ene skrivevej`).toBe(true);
    }
  });

  for (const fil of filer.filter((f) => f !== DEN_ENE_SKRIVEVEJ)) {
    const kilde = readFileSync(resolve(process.cwd(), fil), "utf8");
    if (!kilde.includes('"company_fornyelse"')) continue;
    it(`${fil}: skriver ikke selv til company_fornyelse`, () => {
      const skrivende = fornyelsesKaeder(kilde).filter((k) => SKRIVEKALD.test(k));
      expect(skrivende, `skrivekald uden om ${DEN_ENE_SKRIVEVEJ}:\n${skrivende.join("\n---\n")}`).toEqual([]);
    });
  }
});
