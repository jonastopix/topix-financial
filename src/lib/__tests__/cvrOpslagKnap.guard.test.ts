import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for rådgiverens manuelle CVR-opslag (22/9-2026). Fire domme, hver
 * bevist på en kopi med fejlen indsat:
 *
 *   1. BUCKET A, I RÆKKEFØLGE: authenticateUser FØR has_role FØR
 *      createClient(serviceKey). En service-role-klient bygget før gaten er
 *      en åben dør, uanset hvad der står bagefter.
 *   2. KILDEN ER HUSETS: opslaget går gennem hentDataCvrRaa + cacheRaekkeAf +
 *      gemICache — aldrig et nyt fetch, aldrig en ny URL. Og cachen læses med
 *      den DELTE friskhed (erFriskCache), ikke med egne dage.
 *   3. DE TO REGLER, DER IKKE KAN SES I ET SVAR: skrivningen sker kun gennem
 *      maaSkrives, og `cvr_bekraeftet` røres ALDRIG i denne function.
 *   4. FLADEN TEGNER DOMMENS ORD: knappen vises kun ved kanSlaaOp, teksten er
 *      knapTekst, linjen er opslagsBesked — fladen skriver ingen af dem selv.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };

const FN = "supabase/functions/ansoegning-cvr-opslag/index.ts";
const VIEW = "src/components/hjemmebane/ansoegninger/AnsoegningView.tsx";
const CACHE = "supabase/functions/_shared/cvrCache.ts";
const FORMULAR = "supabase/functions/ansoegning-cvr/index.ts";
const CONFIG = "supabase/config.toml";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const bucketAErRigtig = (fn: string, config: string): boolean => {
  const f = udenKommentarer(fn);
  const serve = f.slice(f.indexOf("Deno.serve("));
  const blok = config.slice(config.indexOf("[functions.ansoegning-cvr-opslag]"), config.indexOf("[functions.ansoegning-cvr-opslag]") + 80);
  return (
    foer(serve, "await authenticateUser(req)", 'callerClient.rpc("has_role"') &&
    foer(serve, 'callerClient.rpc("has_role"', "createClient(Deno.env.get(\"SUPABASE_URL\")") &&
    serve.includes('if (rolleErr || erRaadgiver !== true) return json({ error: "Kun rådgivere" }, 403);') &&
    (serve.match(/createClient\(/g) ?? []).length === 1 &&
    /verify_jwt = true/.test(blok) &&
    f.includes('export const KENDTE_FELTER = ["ansoegning_id"] as const;') &&
    f.includes("ukendteFelter(raaBody, KENDTE_FELTER)") &&
    f.includes("ukendteFelterBesked(ukendte, KENDTE_FELTER)")
  );
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const kildenErHusets = (fn: string, cache: string, formular: string): boolean => {
  const f = udenKommentarer(fn);
  return (
    f.includes('import { hentDataCvrRaa } from "../_shared/virksomhedsOprettelse.ts";') &&
    f.includes("cacheRaekkeAf(cvr, await hentDataCvrRaa(cvr))") &&
    f.includes("await gemICache(admin, bygget.raekke)") &&
    // Ingen egen hentning og ingen egen URL.
    !/fetch\(/.test(f) && !/datacvrapi/.test(f) && !/DATACVR_API_KEY/.test(f) &&
    // Friskheden er den delte — ikke egne dage.
    f.includes("erFriskCache(") && !/CACHE_DAGE_/.test(f) &&
    cache.includes("export function erFriskCache(") &&
    cache.includes("export const CACHE_DAGE_FUNDET = 30;") &&
    cache.includes("export const CACHE_DAGE_FINDES_IKKE = 1;") &&
    // Og formularen læser nu DERFRA, så der kun er ét tal.
    udenKommentarer(formular).includes("erFriskCache(data.udfald, data.slaaet_op_at)") &&
    !/const CACHE_DAGE_/.test(udenKommentarer(formular))
  );
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const deToReglerHolder = (fn: string): boolean => {
  const f = udenKommentarer(fn);
  const opdateringer = [...f.matchAll(/\.from\("ansoegninger"\)\s*\.update\(([^)]*)\)/g)].map((m) => m[1]);
  return (
    // Skrivningen sker KUN bag dommen.
    f.includes("if (maaSkrives(udfald, visning !== null)) {") &&
    opdateringer.length === 1 &&
    opdateringer[0].includes("cvr_opslag:") &&
    // cvr_bekraeftet røres ALDRIG — hverken i opdateringen eller andre steder.
    !/cvr_bekraeftet/.test(f)
  );
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const fladenTegnerDommensOrd = (view: string): boolean => {
  const v = udenKommentarer(view);
  return (
    v.includes('import { kanSlaaOp, knapTekst, opslagsBesked } from "@/lib/ansoegninger/cvrManueltOpslag";') &&
    v.includes("{kanSlaaOp(a.cvr) ? (") &&
    // Ikke «{knapTekst(…)}»: knappen viser «Slår op…» mens den arbejder, så
    // kaldet står efter et kolon. Dommen er, at TEKSTEN kommer fra knapTekst.
    v.includes("knapTekst(a.cvr_opslag !== null)") &&
    v.includes('{opslagsBesked("intet_cvr")}') &&
    v.includes("{slaaOp.data.besked}") &&
    // Fladen skriver ingen af ordene selv.
    !/"Slå op i CVR"|"Opdatér fra CVR"/.test(v) &&
    !/\/\^\\d\{8\}\$\//.test(v) && !/length === 8/.test(v)
  );
};

describe("cvrOpslagKnap.guard — rådgiverens manuelle CVR-opslag", () => {
  it("1. Bucket A i rækkefølge, STRIKS body, verify_jwt = true", () => {
    expect(bucketAErRigtig(laes(FN), laes(CONFIG))).toBe(true);
  });
  it("2. kilden er husets ene, og friskheden har ét hjem", () => {
    expect(kildenErHusets(laes(FN), laes(CACHE), laes(FORMULAR))).toBe(true);
  });
  it("3. kun «fundet» skriver, og cvr_bekraeftet røres aldrig", () => {
    expect(deToReglerHolder(laes(FN))).toBe(true);
  });
  it("4. fladen tegner dommens ord og fælder ingen egen dom", () => {
    expect(fladenTegnerDommensOrd(laes(VIEW))).toBe(true);
  });
});

describe("cvrOpslagKnap.guard — dommene fanger fejlen på en kopi", () => {
  const fn = laes(FN), view = laes(VIEW), cache = laes(CACHE), formular = laes(FORMULAR), config = laes(CONFIG);

  it("service role før gaten, eller et felt mere i body, fælder dom 1", () => {
    const foerGate = fn
      .split('  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {\n    auth: { persistSession: false, autoRefreshToken: false },\n  });\n').join("")
      .replace("  const auth = await authenticateUser(req);", '  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {\n    auth: { persistSession: false, autoRefreshToken: false },\n  });\n  const auth = await authenticateUser(req);');
    expect(foerGate).not.toBe(fn);
    expect(bucketAErRigtig(foerGate, config)).toBe(false);
    expect(bucketAErRigtig(fn.split('["ansoegning_id"] as const').join('["ansoegning_id", "cvr"] as const'), config)).toBe(false);
    expect(bucketAErRigtig(fn, config.split("[functions.ansoegning-cvr-opslag]\n    verify_jwt = true").join("[functions.ansoegning-cvr-opslag]\n    verify_jwt = false"))).toBe(false);
  });

  it("et eget fetch, eller egne cache-dage, fælder dom 2", () => {
    expect(kildenErHusets(`${fn}\nconst r = await fetch("https://datacvrapi.dk/x");\n`, cache, formular)).toBe(false);
    expect(kildenErHusets(`${fn}\nconst CACHE_DAGE_FUNDET = 7;\n`, cache, formular)).toBe(false);
    // Tallet tilbage i formularen som en lokal kopi: to tal for det samme.
    expect(kildenErHusets(fn, cache, `${formular}\nconst CACHE_DAGE_FUNDET = 30;\n`)).toBe(false);
    expect(kildenErHusets(fn, cache.split("export function erFriskCache(").join("function erFriskCache("), formular)).toBe(false);
  });

  it("en skrivning uden dommen, eller cvr_bekraeftet rørt, fælder dom 3", () => {
    // Præcis fejlen værnet findes for: et tomt svar skriver alligevel.
    expect(deToReglerHolder(fn.split("if (maaSkrives(udfald, visning !== null)) {").join("if (true) {"))).toBe(false);
    // Formularens linje kopieret ind — den ville slette ansøgerens bekræftelse.
    expect(deToReglerHolder(fn.split(".update({ cvr_opslag: { cvr, ...(visning as CvrVisning) } })").join(".update({ cvr_opslag: { cvr, ...(visning as CvrVisning) }, cvr_bekraeftet: false })"))).toBe(false);
  });

  it("en knap uden dommen, eller ordene skrevet i fladen, fælder dom 4", () => {
    expect(fladenTegnerDommensOrd(view.split("{kanSlaaOp(a.cvr) ? (").join("{a.cvr ? ("))).toBe(false);
    expect(fladenTegnerDommensOrd(view.split("knapTekst(a.cvr_opslag !== null)").join('"Slå op i CVR"'))).toBe(false);
    expect(fladenTegnerDommensOrd(`${view}\nconst egen = (a.cvr ?? "").length === 8;\n`)).toBe(false);
  });
});
