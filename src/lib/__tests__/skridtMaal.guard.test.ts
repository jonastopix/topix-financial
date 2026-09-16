import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for «Én plan» fase 5 (16/9-2026): AI'en foreslår kun skridt mod et
// aktivt mål, og et afvist forslag under samme mål kommer aldrig igen.
//   1. Begge AI-skrivere (generate-weekly-focus, run-company-agent) vælger
//      målet gennem _shared/maal.ts vaelgMaalForForslag FØR doemSkrivning,
//      stopper uden aktive mål (loggen/tool-svaret siger det), giver maalId
//      til skriveFilter og doemSkrivning, og skriver maal_id i insert'en.
//   2. Rådgiverens function (foreslaa-opgave) giver sit maalId til
//      dubletkontrollen (valg A: KUN dubletkontrollen spærrer rådgiveren —
//      stadig « skriver: "raadgiver" », intet vaelgMaalForForslag).
//   3. Motoren: SKRIVE_SELECT_KOLONNER bærer maal_id; erGentagelse tager
//      maalId og dømmer dismissed + samme maal_id uanset alder; skriveFilter
//      med mål henter de afviste under målet uanset alder. Begge kopier.
// Kildelæsning med selvbevis på kopier.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");

const UGE = "supabase/functions/generate-weekly-focus/index.ts";
const AGENT = "supabase/functions/run-company-agent/index.ts";
const RAADGIVER = "supabase/functions/foreslaa-opgave/index.ts";
const MOTOR_DENO = "supabase/functions/_shared/skridtForslag.ts";
const MOTOR_SRC = "src/lib/hjemmebane/skridtForslag.ts";

/** Dom 1: en AI-skriver. `stopUdenMaal` er den tekst/form der siger «ingen aktive mål». */
export const aiSkriverHolder = (kode: string, stopUdenMaal: string): boolean => {
  const importerer = kode.includes('import { maaForeslaaMod, vaelgMaalForForslag, type MaalTilValg } from "../_shared/maal.ts";');
  // Jonas 16/9: gennemgang først — maaForeslaaMod FØR vaelgMaalForForslag, og «gennemgang_foerst» svares/logges.
  const adgang = kode.indexOf("maaForeslaaMod(");
  const vaelger = kode.indexOf("vaelgMaalForForslag(");
  const dom = kode.indexOf("doemSkrivning(");
  const insert = kode.search(/\.from\("company_actions"\)\s*\.insert\(/);
  return importerer && adgang > -1 && vaelger > adgang && dom > vaelger && insert > dom &&
    kode.includes("gennemgang_foerst") &&
    kode.includes(stopUdenMaal) &&
    /\.from\("milestones"\)\s*\.select\("id, status, category, created_at"\)[\s\S]{0,120}\.eq\("status", "active"\)/.test(kode) &&
    /skriveFilter\((now|nu), maalId\)/.test(kode) &&
    /\{ skriver: "ai", maalId \}/.test(kode) &&
    /maal_id: maalId,/.test(kode);
};

/** Dom 2: rådgiverens function. */
export const raadgiverHolder = (kode: string): boolean =>
  !/vaelgMaalForForslag/.test(kode) &&
  /skriveFilter\(nu, oensketMaalId\)/.test(kode) &&
  /\{ skriver: "raadgiver", maalId: oensketMaalId \}/.test(kode) &&
  /maal_id: oensketMaalId,/.test(kode);

/** Dom 3: motoren. */
export const motorenHolder = (kode: string): boolean =>
  kode.includes('export const SKRIVE_SELECT_KOLONNER = "id, title, status, created_at, maal_id";') &&
  /export function erGentagelse\(nyTitel: string, eksisterende: readonly ForslagsRaekke\[\], nu: Date, maalId\?: string \| null\): GentagelsesDom/.test(kode) &&
  /const afvistIMaalet = maal !== "" && r\.status === "dismissed" && \(r\.maal_id \?\? ""\) === maal;/.test(kode) &&
  /if \(!iVinduet && !afvistIMaalet\) continue;/.test(kode) &&
  /export function skriveFilter\(nu: Date, maalId\?: string \| null\): string/.test(kode) &&
  /and\(status\.eq\.dismissed,maal_id\.eq\.\$\{maal\}\)/.test(kode) &&
  /const g = erGentagelse\(nyTitel, eksisterende, nu, valg\.maalId\);/.test(kode);

describe("skridtMaal.guard — fase 5: kun mod et aktivt mål, afvist under målet kommer aldrig igen", () => {
  it("dom 1a: generate-weekly-focus vælger målet før dommen, stopper uden aktive mål (loggen), skriver maal_id", () => {
    expect(aiSkriverHolder(udenKommentarer(laes(UGE)), "ingen aktive mål — skriver intet forslag")).toBe(true);
  });
  it("dom 1b: run-company-agent write_company_action vælger målet (modellens milestone_id hvis aktivt), svarer intet_aktivt_maal, skriver maal_id; toolet annoncerer milestone_id", () => {
    const k = udenKommentarer(laes(AGENT));
    expect(aiSkriverHolder(k, 'return { ok: false, reason: "intet_aktivt_maal" };')).toBe(true);
    expect(k).toContain("milestone_id: { type: \"string\", description: \"ID på det aktive mål (fra get_milestones) skridtet hører til.");
    expect(k).toMatch(/maalId: typeof args\.milestone_id === "string" \? args\.milestone_id : null/);
    expect(k).toContain('{ ok: false, reason: "gennemgang_foerst", antal: adgang.antal }');
    expect(udenKommentarer(laes(UGE))).toContain("aktive mål — gennemgang først, skriver intet forslag");
  });
  it("dom 2: foreslaa-opgave giver sit maalId til dubletkontrollen — og kun den (valg A: ingen målvælger, skriver raadgiver)", () => {
    expect(raadgiverHolder(udenKommentarer(laes(RAADGIVER)))).toBe(true);
    expect(udenKommentarer(laes(RAADGIVER))).toContain('{ skriver: "raadgiver", maalId: oensketMaalId }');
  });
  it("dom 3: motoren i BEGGE kopier bærer maal_id, den evige afvist-regel og filteret", () => {
    for (const m of [MOTOR_DENO, MOTOR_SRC]) expect(motorenHolder(udenKommentarer(laes(m))), m).toBe(true);
  });

  it("selvbevis 1: en AI-skriver uden målvælger, med dommen før valget, uden maal_id i insert eller uden stop-teksten falder", () => {
    const k = udenKommentarer(laes(UGE));
    const stop = "ingen aktive mål — skriver intet forslag";
    expect(aiSkriverHolder(k.replace('import { maaForeslaaMod, vaelgMaalForForslag, type MaalTilValg } from "../_shared/maal.ts";', ""), stop)).toBe(false);
    expect(aiSkriverHolder(k.replace("maal_id: maalId,", ""), stop)).toBe(false);
    expect(aiSkriverHolder(k.split(stop).join("ingen mål"), stop)).toBe(false);
    expect(aiSkriverHolder(k.replace('{ skriver: "ai", maalId }', '{ skriver: "ai" }'), stop)).toBe(false);
    // Gennemgangs-dommen fjernet, eller lagt EFTER målvalget: falder.
    expect(aiSkriverHolder(k.replace("const adgang = maaForeslaaMod((maalRows ?? []).length);", "const adgang = { ok: true } as const;"), stop)).toBe(false);
  });
  it("selvbevis 2: rådgiverens function der vælger mål selv, eller dømmer uden maalId, falder", () => {
    const k = udenKommentarer(laes(RAADGIVER));
    expect(raadgiverHolder(k + "\nconst x = vaelgMaalForForslag([], {});")).toBe(false);
    expect(raadgiverHolder(k.replace('{ skriver: "raadgiver", maalId: oensketMaalId }', '{ skriver: "raadgiver" }'))).toBe(false);
  });
  it("selvbevis 3: en motor der kun ser vinduet (afvist-reglen fjernet) falder", () => {
    const m = udenKommentarer(laes(MOTOR_SRC));
    expect(motorenHolder(m.replace("if (!iVinduet && !afvistIMaalet) continue;", "if (!iVinduet) continue;"))).toBe(false);
    expect(motorenHolder(m.replace('export const SKRIVE_SELECT_KOLONNER = "id, title, status, created_at, maal_id";', 'export const SKRIVE_SELECT_KOLONNER = "id, title, status, created_at";'))).toBe(false);
  });
});
