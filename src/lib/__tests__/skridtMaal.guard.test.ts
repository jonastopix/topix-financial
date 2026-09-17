import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for «Én plan» fase 5 (16/9-2026): AI'en foreslår kun skridt mod et
// aktivt mål, og et afvist forslag under samme mål kommer aldrig igen.
// Dom 4 (17/9): medlemmets egen skrivevej skridt-tilfoej.
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
const TILFOEJ = "supabase/functions/skridt-tilfoej/index.ts";

/** Dom 4 (17/9, Jonas «ja»; fristen «1»): medlemmets egen function. Medlemskabet
    (company_members med KALDERENS klient, company_id OG user_id = kalderen) og
    målets opslag (id OG company_id, kravet om aktivt) står FØR insert'en;
    insert'en skriver status 'active', source_type 'manual', maal_id, user_id =
    kalderen, accepted_at og due_date fra body (doemFrist — påkrævet, 400 uden);
    dommen kaldes som « skriver: "medlem" » med maalId; ingen has_role, ingen
    proposed-status, ingen expires_at. */
export const tilfoejHolder = (kode: string): boolean => {
  const medlemskab = kode.indexOf('.from("company_members")');
  const maal = kode.indexOf('.from("milestones")');
  const dom = kode.indexOf("doemSkrivning(");
  const insert = kode.search(/\.from\("company_actions"\)\s*\.insert\(/);
  if (medlemskab === -1 || maal === -1 || dom === -1 || insert === -1) return false;
  const medlemskabsOpslag = kode.slice(medlemskab, kode.indexOf(".maybeSingle()", medlemskab));
  const maalOpslag = kode.slice(maal, kode.indexOf(".maybeSingle()", maal));
  const insertBlok = kode.slice(insert, kode.indexOf(".select(", insert));
  return medlemskab < insert && maal < insert && dom < insert &&
    /await callerClient\s*\.from\("company_members"\)/.test(kode) &&
    medlemskabsOpslag.includes('.eq("company_id", companyId)') && medlemskabsOpslag.includes('.eq("user_id", callerId)') &&
    maalOpslag.includes('.eq("id", maalId)') && maalOpslag.includes('.eq("company_id", companyId)') &&
    /status !== "active"/.test(kode.slice(maal, insert)) &&
    /const fristDom = doemFrist\(dueDate, nu\);/.test(kode) && /if \(!fristDom\.ok\)/.test(kode) &&
    /\{ skriver: "medlem", maalId \}/.test(kode) &&
    /skriveFilter\(nu, maalId\)/.test(kode) &&
    /status: "active",/.test(insertBlok) && /source_type: "manual",/.test(insertBlok) &&
    /user_id: callerId,/.test(insertBlok) && /accepted_at: nu\.toISOString\(\),/.test(insertBlok) &&
    /due_date: fristDom\.dato,/.test(insertBlok) && /maal_id: maalId,/.test(insertBlok) &&
    !/has_role/.test(kode) && !/status: "proposed"/.test(kode) && !/expires_at/.test(kode);
};

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
  it("dom 4 (17/9): skridt-tilfoej tjekker medlemskab og målets status FØR insert, skriver status 'active' med due_date fra body (påkrævet), skriver «medlem»", () => {
    const k = udenKommentarer(laes(TILFOEJ));
    expect(tilfoejHolder(k)).toBe(true);
    // Motoren kender skriveren «medlem» i begge kopier.
    for (const m of [MOTOR_DENO, MOTOR_SRC]) expect(udenKommentarer(laes(m))).toContain('export type Skriver = "raadgiver" | "ai" | "medlem";');
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
  it("selvbevis 4: skridt-tilfoej uden medlemskabs-tjek, med målet efter insert, uden frist-dom, som proposed, eller som rådgiver falder", () => {
    const k = udenKommentarer(laes(TILFOEJ));
    expect(tilfoejHolder(k.replace('.eq("user_id", callerId)\n    .maybeSingle();', ".maybeSingle();"))).toBe(false);
    expect(tilfoejHolder(k.replace("await callerClient\n    .from(\"company_members\")", "await adminClient\n    .from(\"company_members\")"))).toBe(false);
    expect(tilfoejHolder(k.replace("const fristDom = doemFrist(dueDate, nu);", "const fristDom = { ok: true, dato: typeof dueDate === \"string\" ? dueDate : null } as const;"))).toBe(false);
    expect(tilfoejHolder(k.replace('status: "active",', 'status: "proposed",'))).toBe(false);
    expect(tilfoejHolder(k.replace('{ skriver: "medlem", maalId }', '{ skriver: "raadgiver", maalId }'))).toBe(false);
    expect(tilfoejHolder(k.replace('status !== "active"', 'status === "parked"'))).toBe(false);
    // Målets opslag flyttet EFTER insert: falder.
    const maalStart = k.indexOf('  const { data: maal, error: maalErr }');
    // Kommentarerne er strippet (udenKommentarer) — ankeret er kode: dubletkontrollens opslag.
    const maalSlut = k.indexOf('  const { data: eksisterende, error: eksErr }');
    const flyttet = k.slice(0, maalStart) + k.slice(maalSlut).replace("return jsonResponse({ ok: true, actionId: opgave.id });", k.slice(maalStart, maalSlut) + "return jsonResponse({ ok: true, actionId: opgave.id });");
    expect(maalStart).toBeGreaterThan(0); expect(maalSlut).toBeGreaterThan(maalStart);
    expect(tilfoejHolder(flyttet)).toBe(false);
  });
  it("selvbevis 3: en motor der kun ser vinduet (afvist-reglen fjernet) falder", () => {
    const m = udenKommentarer(laes(MOTOR_SRC));
    expect(motorenHolder(m.replace("if (!iVinduet && !afvistIMaalet) continue;", "if (!iVinduet) continue;"))).toBe(false);
    expect(motorenHolder(m.replace('export const SKRIVE_SELECT_KOLONNER = "id, title, status, created_at, maal_id";', 'export const SKRIVE_SELECT_KOLONNER = "id, title, status, created_at";'))).toBe(false);
  });
});
