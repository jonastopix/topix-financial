import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn (fase 0a; fjerde skriver 17/9): de fire skrivere af company_actions-skridt dømmer
// gennem skridtForslag.doemSkrivning FØR deres insert — ingen af dem har
// sin egen dedup, og ingen skriver uden om dommen. Værnet læser kilden;
// «VÆRNET VIRKER» bevises på kopier hvor dommen er fjernet eller står
// efter insert'en.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
// JONAS 16/9, VALG A: rådgiverens egne forslag (foreslaa-opgave) spærres
// aldrig af et ventende forslag — kun af dubletkontrollen; AI'en stopper.
// Skriveren står ORDRET i kaldet, så den ikke kan glide.
const SKRIVERE = [
  { sti: "supabase/functions/generate-weekly-focus/index.ts", insert: '.from("company_actions").insert(', skriver: "ai" },
  { sti: "supabase/functions/run-company-agent/index.ts", insert: '.from("company_actions")\n        .insert(', skriver: "ai" },
  { sti: "supabase/functions/foreslaa-opgave/index.ts", insert: '.from("company_actions")\n    .insert(', skriver: "raadgiver" },
  // 17/9 (Jonas «ja»): medlemmets eget skridt — «medlem» dømmes som rådgiveren (kun dubletkontrollen).
  { sti: "supabase/functions/skridt-tilfoej/index.ts", insert: '.from("company_actions")\n    .insert(', skriver: "medlem" },
] as const;
const ALLE_SKRIVERE = ["ai", "raadgiver", "medlem"] as const;
type SkriverNavn = (typeof ALLE_SKRIVERE)[number];

function doemKilde(kilde: string, insert: string, skriver: SkriverNavn): { importerer: boolean; doemmer: boolean; foerInsert: boolean; henterMedFilter: boolean; rigtigSkriver: boolean } {
  const importerer = /from "\.\.\/_shared\/skridtForslag\.ts"/.test(kilde);
  const dom = kilde.indexOf("doemSkrivning(");
  const ins = kilde.indexOf(insert);
  // Før (to skrivere): const anden = skriver === "ai" ? "raadgiver" : "ai";
  const andre = ALLE_SKRIVERE.filter((s) => s !== skriver);
  return {
    importerer,
    doemmer: dom >= 0,
    foerInsert: dom >= 0 && ins >= 0 && dom < ins,
    henterMedFilter: kilde.includes("SKRIVE_SELECT_KOLONNER") && kilde.includes("skriveFilter("),
    // Fase 5: kaldet bærer også maalId — `{ skriver: "ai", maalId }` / `{ skriver: "raadgiver", maalId: oensketMaalId }`.
    // Før: kilde.includes(`{ skriver: "${skriver}" }`) && !kilde.includes(`{ skriver: "${anden}" }`).
    rigtigSkriver: new RegExp(`\\{ skriver: "${skriver}"[,} ]`).test(kilde) && andre.every((anden) => !new RegExp(`\\{ skriver: "${anden}"[,} ]`).test(kilde)),
  };
}

describe("skridtForslag — de fire skrivere dømmer gennem motoren før insert, med den rigtige skriver", () => {
  for (const { sti, insert, skriver } of SKRIVERE) {
    it(`${sti}: importerer motoren, henter rækkerne med SKRIVE_SELECT_KOLONNER + skriveFilter, kalder doemSkrivning FØR insert som «${skriver}»`, () => {
      const kilde = laes(sti);
      expect(kilde, "insert-formen skal findes (ellers er værnet blindt)").toContain(insert);
      expect(doemKilde(kilde, insert, skriver)).toEqual({ importerer: true, doemmer: true, foerInsert: true, henterMedFilter: true, rigtigSkriver: true });
    });
  }
  it("generate-weekly-focus skriver højst ÉT forslag pr. kørsel (Jonas 16/9, beslutning 3)", () => {
    const kilde = laes("supabase/functions/generate-weekly-focus/index.ts");
    expect(kilde).toContain("analysis.actions.slice(0, 1)");
    expect(kilde).not.toContain("analysis.actions.slice(0, 3)");
  });
  it("maaSkriveForslag bor kun i motoren — ikke længere i ugensFokusGate (begge kopier)", () => {
    for (const sti of ["src/lib/ugensFokusGate.ts", "supabase/functions/generate-weekly-focus/ugensFokusGate.ts"]) {
      expect(laes(sti)).not.toContain("export function maaSkriveForslag");
    }
    expect(laes("supabase/functions/_shared/skridtForslag.ts")).toContain("export function maaSkriveForslag");
  });
});

describe("VÆRNET VIRKER — på kopier uden dommen, med dommen efter insert, eller med den forkerte skriver", () => {
  const insert = '.from("company_actions")\n    .insert(';
  const godt = (skriver: string) => `import { doemSkrivning, SKRIVE_SELECT_KOLONNER, skriveFilter } from "../_shared/skridtForslag.ts";\nconst rows = await admin.from("company_actions").select(SKRIVE_SELECT_KOLONNER).or(skriveFilter(nu));\nconst d = doemSkrivning(t, rows, nu, { skriver: "${skriver}" });\nawait admin.from("company_actions")\n    .insert({})`;
  it("kopien uden import og dom dømmes dårlig", () => {
    expect(doemKilde(`await admin.from("company_actions")\n    .insert({})`, insert, "ai")).toMatchObject({ importerer: false, doemmer: false, foerInsert: false, rigtigSkriver: false });
  });
  it("kopien med dommen EFTER insert dømmes dårlig", () => {
    const daarlig = `import { doemSkrivning, SKRIVE_SELECT_KOLONNER, skriveFilter } from "../_shared/skridtForslag.ts";\nawait admin.from("company_actions")\n    .insert({});\nconst d = doemSkrivning(t, rows, nu, { skriver: "ai" });`;
    expect(doemKilde(daarlig, insert, "ai")).toMatchObject({ importerer: true, doemmer: true, foerInsert: false, rigtigSkriver: true });
  });
  it("rådgiverens function der dømmer som AI (spærres af ventende) dømmes dårlig — og omvendt", () => {
    expect(doemKilde(godt("ai"), insert, "raadgiver")).toMatchObject({ rigtigSkriver: false });
    expect(doemKilde(godt("raadgiver"), insert, "ai")).toMatchObject({ rigtigSkriver: false });
    expect(doemKilde(godt("medlem"), insert, "raadgiver")).toMatchObject({ rigtigSkriver: false });
    expect(doemKilde(godt("ai"), insert, "medlem")).toMatchObject({ rigtigSkriver: false });
  });
  it("de gode kopier dømmes gode", () => {
    expect(doemKilde(godt("ai"), insert, "ai")).toEqual({ importerer: true, doemmer: true, foerInsert: true, henterMedFilter: true, rigtigSkriver: true });
    expect(doemKilde(godt("raadgiver"), insert, "raadgiver")).toEqual({ importerer: true, doemmer: true, foerInsert: true, henterMedFilter: true, rigtigSkriver: true });
    expect(doemKilde(godt("medlem"), insert, "medlem")).toEqual({ importerer: true, doemmer: true, foerInsert: true, henterMedFilter: true, rigtigSkriver: true });
  });
});
