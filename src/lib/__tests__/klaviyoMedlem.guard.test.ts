import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for medlemsfeltet tb_medlem (30/9-2026). Elleve domme, hver bevist på en
 * kopi med fejlen indsat:
 *   1. FELTNAVNET ÉT STED: strengen "tb_medlem" står kun i klaviyoMedlem.ts (MEDLEM_FELT);
 *      kroppen bygges med [MEDLEM_FELT].
 *   2. INGEN SJETTE ADGANGSDOM: klaviyoMedlem.ts kalder computeMembershipTier og har ingen
 *      egen dato-sammenligning (docs/adgangsdomme.md §1).
 *   3. LEGAT OG GÆST DØMMES FØR TIER (Jonas 30/9 07:22): is_legat === true og
 *      vis_i_netvaerk === false står før computeMembershipTier i virksomhedsGrund.
 *   4. REN DOM: klaviyoMedlem.ts importerer kun membershipTier.ts; ingen Deno, fetch eller kald.
 *   5. NØGLEN ÉT STED: skrivMedlemHvisNoegle læser KLAVIYO_SECRET (KLAVIYO_API_KEY) og fanger
 *      alt; functionen await'er hvert kald; aldrig KLAVIYO_AFMELD_SECRET i medlemsvejen.
 *   6. TILSTANDEN FØR HVER RETURN i skrivMedlem.
 *   7. TØRKØRSEL STANDARD: planen regnes før «if (a.toerKoersel) return r;», skrivningen efter.
 *   8. SVARET BÆRER ALDRIG EN MAIL: Deno.serve renser medlem-delen før svaret; MedlemResultat
 *      har intet mailfelt; medlemsfejlene går aldrig i r.fejlede_liste.
 *   9. AFMELDTE-PORTEN GÆLDER IKKE medlemspasset (et afmeldt medlem skal stadig markeres).
 *  10. MIGRATIONEN: første linje præcis «-- IKKE KØRT. DEPLOY: …»; kun tilføjende; seks
 *      kolonner; medlem_udfald-CHECK'en har samme liste som udfald-CHECK'en.
 *  11. ISOLERET: medlemspassets læsning står i try/catch — den vælter aldrig webinarpasset.
 */

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };
const blok = (k: string, start: string, slut: string) => { const i = k.indexOf(start); const j = k.indexOf(slut, i + start.length); return i === -1 ? "" : k.slice(i, j === -1 ? undefined : j); };

const MEDLEM = "supabase/functions/_shared/klaviyoMedlem.ts";
const PROFIL = "supabase/functions/_shared/klaviyoProfil.ts";
const AFSENDELSE = "supabase/functions/_shared/klaviyoAfsendelse.ts";
const FUNKTION = "supabase/functions/klaviyo-profil-cron/index.ts";
const MIG = "supabase/migrations/20260930110000_klaviyo_profil_medlem.sql";
const MIG_TABEL = "supabase/migrations/20260921190000_klaviyo_profil.sql";
const SHARED = "supabase/functions/_shared";

// ── 1 ──────────────────────────────────────────────────────────────────────
export const feltnavnetEtSted = (medlem: string, andre: readonly string[]): boolean => {
  const m = udenKommentarer(medlem);
  return (m.match(/["'`]tb_medlem["'`]/g) ?? []).length === 1 && m.includes('export const MEDLEM_FELT = "tb_medlem";') &&
    m.includes("properties: { [MEDLEM_FELT]: medlem === true }") &&
    andre.every((a) => !/["'`]tb_medlem["'`]/.test(udenKommentarer(a)));
};

// ── 2 ──────────────────────────────────────────────────────────────────────
export const ingenSjetteDom = (medlem: string): boolean => {
  const m = udenKommentarer(medlem);
  return m.includes('import { computeMembershipTier, type MembershipTier } from "./membershipTier.ts";') &&
    /computeMembershipTier\(/.test(m) && !/contract_end_date\s*[<>]/.test(m) && !/Date\.UTC|new Date\(|getTime\(\)|Date\.now/.test(m);
};

// ── 3 ──────────────────────────────────────────────────────────────────────
export const legatOgGaestFoerTier = (medlem: string): boolean => {
  const g = blok(udenKommentarer(medlem), "export function virksomhedsGrund(", "export function erMedlemsvirksomhed(");
  return foer(g, 'if (v.is_legat === true) return "legat";', "computeMembershipTier(") &&
    foer(g, 'if (v.vis_i_netvaerk === false) return "gaest";', "computeMembershipTier(") &&
    /if \(tier === "full"\) return "aktiv_kontrakt";/.test(g) && /if \(tier === "subscriber"\) return "aktivt_abonnement";/.test(g);
};

// ── 4 ──────────────────────────────────────────────────────────────────────
export const renDom = (medlem: string): boolean => {
  const m = udenKommentarer(medlem);
  const imports = [...m.matchAll(/from\s+["']([^"']+)["']/g)].map((x) => x[1]);
  return imports.length === 1 && imports[0] === "./membershipTier.ts" && !/Deno\./.test(m) && !/\bfetch\s*\(/.test(m) && !/\bkald\s*\(/.test(m);
};

// ── 5 ──────────────────────────────────────────────────────────────────────
export const noeglenEtSted = (afsendelse: string, profil: string, funktion: string): boolean => {
  const a = udenKommentarer(afsendelse), p = udenKommentarer(profil), f = udenKommentarer(funktion);
  const hvis = blok(a, "export async function skrivMedlemHvisNoegle(", "\n}\n");
  const alle = (f.match(/skrivMedlemHvisNoegle\(/g) ?? []).length;
  const skriv = blok(p, "export async function skrivMedlem(", "\n}\n");
  return /skrivMedlem\(skriver, Deno\.env\.get\(KLAVIYO_SECRET\), email, medlem/.test(hvis) &&
    /try \{[\s\S]*\} catch \(e\) \{/.test(hvis) && !hvis.includes("KLAVIYO_AFMELD") &&
    !/Deno\./.test(p) && !skriv.includes("KLAVIYO_AFMELD") &&
    alle >= 1 && (f.match(/await skrivMedlemHvisNoegle\(/g) ?? []).length === alle;
};

// ── 6 ──────────────────────────────────────────────────────────────────────
export const tilstandFoerHverReturn = (profil: string): boolean => {
  const k = blok(udenKommentarer(profil), "export async function skrivMedlem(", "\n}\n");
  const returns = [...k.matchAll(/return \{/g)].map((m) => m.index!);
  const skriv = [...k.matchAll(/await skrivMedlemTilstand\(/g)].map((m) => m.index!);
  return returns.length === 2 && skriv.length === 2 && returns.every((r, i) => skriv[i] < r);
};

// ── 7 ──────────────────────────────────────────────────────────────────────
export const toerkoerselErStandard = (funktion: string): boolean => {
  const f = udenKommentarer(funktion);
  const koer = blok(f, "export async function koerProfil", "async function planlaegMedlem(");
  return foer(koer, "await planlaegMedlem(", "if (a.toerKoersel) return r;") &&
    foer(koer, "if (a.toerKoersel) return r;", "await skrivMedlemHvisNoegle(") &&
    f.includes("const toerKoersel = raaBody?.dry_run !== false;");
};

// ── 8 ──────────────────────────────────────────────────────────────────────
export const ingenMailISvaret = (funktion: string, medlem: string): boolean => {
  const f = udenKommentarer(funktion), m = udenKommentarer(medlem);
  const serve = f.slice(f.indexOf("Deno.serve("));
  const iface = blok(m, "export interface MedlemResultat {", "\n}\n");
  return foer(serve, "resultat.medlem = rensetMedlemResultat(resultat.medlem);", "return json(resultat") &&
    !/\bemail\b|\bmail\b/.test(iface) &&
    (f.match(/r\.fejlede_liste\.push\(/g) ?? []).length === 1 &&
    !/r\.fejlede_liste\.push\([^)]*felt: "medlem"/.test(f) &&
    blok(m, "export function rensetMedlemResultat(", "\n}\n").includes("findForbudteNoegler(m)");
};

// ── 9 ──────────────────────────────────────────────────────────────────────
export const afmeldteIkkeIMedlemspasset = (funktion: string): boolean => {
  const f = udenKommentarer(funktion);
  const plan = blok(f, "async function planlaegMedlem(", "\n}\n");
  const loekke = blok(f, "for (const p of medlemPoster)", "\n  }\n");
  return plan.length > 0 && !/afmeld/i.test(plan) && loekke.length > 0 && !/afmeld/i.test(loekke);
};

// ── 10 ─────────────────────────────────────────────────────────────────────
export const migrationenErRigtig = (mig: string, tabel: string): boolean => {
  const m = udenSqlKommentarer(mig);
  const liste = (sql: string, navn: string) => sql.match(new RegExp(`${navn}[\\s\\S]*?in \\(([^)]*)\\)`))?.[1]?.replace(/\s+/g, " ").trim();
  const kolonner = ["tb_medlem boolean", "tb_medlem_skrevet_at timestamptz", "medlem_forsoegt_at timestamptz", "medlem_udfald text", "medlem_status integer", "medlem_grund text"];
  const drops = [...m.matchAll(/\bdrop\s+(\w+)/gi)].map((x) => x[0].toLowerCase());
  return mig.startsWith("-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).\n") &&
    kolonner.every((k) => new RegExp(`add column if not exists ${k.split(" ")[0]}\\s+${k.split(" ")[1]}\\b`).test(m)) &&
    // Kun tilføjende: ingen drop ud over den ene CHECK's idempotens, ingen alter column, ingen not null, ingen politik.
    drops.every((d) => d === "drop constraint") && (m.match(/drop constraint if exists klaviyo_profil_medlem_udfald_check/g) ?? []).length === 1 &&
    !/alter column|set not null|\b(boolean|text|integer|timestamptz)\s+not null|create policy|security definer|delete from|update public|truncate/i.test(m) &&
    liste(m, "klaviyo_profil_medlem_udfald_check\\s+check \\(medlem_udfald is null or medlem_udfald") === liste(udenSqlKommentarer(tabel), "klaviyo_profil_udfald_check check \\(udfald") &&
    liste(m, "klaviyo_profil_medlem_udfald_check\\s+check \\(medlem_udfald is null or medlem_udfald") !== undefined;
};

// ── 11 ─────────────────────────────────────────────────────────────────────
export const isoleret = (funktion: string): boolean => {
  const koer = blok(udenKommentarer(funktion), "export async function koerProfil", "async function planlaegMedlem(");
  return /try \{\s*medlemPoster = await planlaegMedlem\(admin, a, r\.medlem\);\s*\} catch \(err\) \{[\s\S]*?r\.medlem\.fejl\.push\(/.test(koer) &&
    (koer.match(/planlaegMedlem\(/g) ?? []).length === 1;
};

const sharedFiler = () => readdirSync(resolve(process.cwd(), SHARED)).filter((f) => f.endsWith(".ts") && f !== "klaviyoMedlem.ts").map((f) => laes(`${SHARED}/${f}`));

describe("klaviyoMedlem.guard — de elleve domme på repoets filer", () => {
  it("1. feltnavnet står ét sted", () => expect(feltnavnetEtSted(laes(MEDLEM), [...sharedFiler(), laes(FUNKTION)])).toBe(true));
  it("2. ingen sjette adgangsdom", () => expect(ingenSjetteDom(laes(MEDLEM))).toBe(true));
  it("3. legat og gæst dømmes før tier", () => expect(legatOgGaestFoerTier(laes(MEDLEM))).toBe(true));
  it("4. ren dom", () => expect(renDom(laes(MEDLEM))).toBe(true));
  it("5. nøglen ét sted, alt await'et", () => expect(noeglenEtSted(laes(AFSENDELSE), laes(PROFIL), laes(FUNKTION))).toBe(true));
  it("6. tilstanden før hver return i skrivMedlem", () => expect(tilstandFoerHverReturn(laes(PROFIL))).toBe(true));
  it("7. tørkørsel er standard", () => expect(toerkoerselErStandard(laes(FUNKTION))).toBe(true));
  it("8. svaret bærer aldrig en mail", () => expect(ingenMailISvaret(laes(FUNKTION), laes(MEDLEM))).toBe(true));
  it("9. afmeldte-porten gælder ikke medlemspasset", () => expect(afmeldteIkkeIMedlemspasset(laes(FUNKTION))).toBe(true));
  it("10. migrationen: IKKE KØRT-linjen først, kun tilføjende, CHECK i takt", () => expect(migrationenErRigtig(laes(MIG), laes(MIG_TABEL))).toBe(true));
  it("11. medlemspasset er isoleret", () => expect(isoleret(laes(FUNKTION))).toBe(true));
});

describe("klaviyoMedlem.guard — dommene fanger fejlen på en kopi", () => {
  it("1. et andet sted, der skriver \"tb_medlem\", eller en krop uden MEDLEM_FELT, fælder dom 1", () => {
    const m = laes(MEDLEM), f = laes(FUNKTION);
    expect(feltnavnetEtSted(m, [...sharedFiler(), `${f}\nconst x = { "tb_medlem": true };`])).toBe(false);
    expect(feltnavnetEtSted(m.replace("properties: { [MEDLEM_FELT]: medlem === true }", 'properties: { "tb_medlem": medlem }'), [f])).toBe(false);
  });
  it("2. en egen dato-sammenligning eller et droppet computeMembershipTier fælder dom 2", () => {
    const m = laes(MEDLEM);
    expect(ingenSjetteDom(`${m}\nconst aktiv = (v: MedlemVirksomhed) => new Date(v.contract_end_date!) > new Date();`)).toBe(false);
    expect(ingenSjetteDom(m.replace(/computeMembershipTier\(/g, "egenTier("))).toBe(false);
  });
  it("3. legat eller gæst efter tier — eller fjernet — fælder dom 3", () => {
    const m = laes(MEDLEM);
    expect(legatOgGaestFoerTier(m.replace('  if (v.is_legat === true) return "legat";\n', ""))).toBe(false);
    expect(legatOgGaestFoerTier(m.replace('  if (v.vis_i_netvaerk === false) return "gaest";\n', ""))).toBe(false);
    expect(legatOgGaestFoerTier(m.replace('  if (v.is_legat === true) return "legat";\n', "").replace('  if (tier === "full")', '  if (v.is_legat === true) return "legat";\n  if (tier === "full")'))).toBe(false);
  });
  it("4. en import af klaviyo.ts eller Deno.env fælder dom 4", () => {
    const m = laes(MEDLEM);
    expect(renDom(`import { kald } from "./klaviyo.ts";\n${m}`)).toBe(false);
    expect(renDom(`${m}\nconst n = Deno.env.get("X");`)).toBe(false);
  });
  it("5. afmeldingsnøglen, et kald uden await eller et finally i stedet for catch fælder dom 5", () => {
    const a = laes(AFSENDELSE), p = laes(PROFIL), f = laes(FUNKTION);
    expect(noeglenEtSted(a.replace("skrivMedlem(skriver, Deno.env.get(KLAVIYO_SECRET), email, medlem", "skrivMedlem(skriver, Deno.env.get(KLAVIYO_AFMELD_SECRET), email, medlem"), p, f)).toBe(false);
    expect(noeglenEtSted(a, p, f.replace("await skrivMedlemHvisNoegle(", "void skrivMedlemHvisNoegle("))).toBe(false);
    const i = a.indexOf("export async function skrivMedlemHvisNoegle(");
    expect(noeglenEtSted(a.slice(0, i) + a.slice(i).replace("} catch (e) {", "} finally {"), p, f)).toBe(false);
  });
  it("6. en return før tilstanden fælder dom 6", () => {
    const p = laes(PROFIL);
    expect(tilstandFoerHverReturn(p.replace("  await skrivMedlemTilstand(skriver, mail, medlem, svar.spor, nu);\n", ""))).toBe(false);
  });
  it("7. planen efter tørkørslens return, eller skrivningen før, fælder dom 7", () => {
    const f = laes(FUNKTION);
    const toer = "  if (a.toerKoersel) return r;\n";
    const i = f.indexOf(toer);
    const udenToer = f.slice(0, i) + f.slice(i + toer.length);
    expect(toerkoerselErStandard(udenToer.replace("  // 3b. Medlemsfeltet", toer + "  // 3b. Medlemsfeltet"))).toBe(false);
    expect(toerkoerselErStandard(udenToer.replace("  // 5. Alarmen", toer + "  // 5. Alarmen"))).toBe(false);
  });
  it("8. uden rensning, et mailfelt i svaret, eller medlemsfejl i fejlede_liste fælder dom 8", () => {
    const f = laes(FUNKTION), m = laes(MEDLEM);
    expect(ingenMailISvaret(f.replace("resultat.medlem = rensetMedlemResultat(resultat.medlem);", ""), m)).toBe(false);
    expect(ingenMailISvaret(f, m.replace("  fejlede_udfald: Record<string, number>;", "  fejlede_udfald: Record<string, number>;\n  email: string[];"))).toBe(false);
    expect(ingenMailISvaret(f.replace("medlemFejl.push({ email: p.email,", "r.fejlede_liste.push({ email: p.email,"), m)).toBe(false);
    expect(ingenMailISvaret(f, m.replace("const fund = findForbudteNoegler(m);", "const fund: string[] = [];"))).toBe(false);
  });
  it("9. en afmeldte-port i medlemspasset fælder dom 9", () => {
    const f = laes(FUNKTION);
    expect(afmeldteIkkeIMedlemspasset(f.replace("  const plan = medlemPlan(dom.mails, sidst, a.email);", "  const plan = medlemPlan(new Set([...dom.mails].filter((x) => !afmeldte.has(x))), sidst, a.email);"))).toBe(false);
    expect(afmeldteIkkeIMedlemspasset(f.replace("  for (const p of medlemPoster) {\n", "  for (const p of medlemPoster) {\n    if (erAfmeldt(p.email)) continue;\n"))).toBe(false);
  });
  it("10. en forklaring over linje 1, en drop column, en not null eller en afvigende CHECK fælder dom 10", () => {
    const m = laes(MIG), t = laes(MIG_TABEL);
    expect(migrationenErRigtig(`-- Forklaring først\n${m}`, t)).toBe(false);
    expect(migrationenErRigtig(`${m}\nalter table public.klaviyo_profil drop column tb_naeste_webinar_tekst;`, t)).toBe(false);
    expect(migrationenErRigtig(m.replace("add column if not exists tb_medlem            boolean,", "add column if not exists tb_medlem            boolean not null default false,"), t)).toBe(false);
    expect(migrationenErRigtig(m.replace("'fejl', 'timeout'));", "'fejl'));"), t)).toBe(false);
    expect(migrationenErRigtig(m.replace("  add column if not exists medlem_grund         text;", "  add column if not exists medlem_andet         text;"), t)).toBe(false);
  });
  it("11. læsningen uden try/catch fælder dom 11", () => {
    const f = laes(FUNKTION);
    expect(isoleret(f.replace("  try {\n    medlemPoster = await planlaegMedlem(admin, a, r.medlem);\n  } catch (err) {", "  {\n    medlemPoster = await planlaegMedlem(admin, a, r.medlem);\n  } {\n    const err = null;"))).toBe(false);
  });
});
