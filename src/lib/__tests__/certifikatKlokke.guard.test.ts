import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Kildeværn for certifikat-klokke (trin 2, 29/9-2026). Fire domme, hver bevist
 * på en kopi med fejlen indsat:
 *   1. AUTH FØRST OG TØRKØRSEL SOM STANDARD: authenticateServiceRole før
 *      createClient; dry_run !== false; STRIKS body; tørkørslen returnerer FØR
 *      writeNotificationToMany; config.toml har verify_jwt = true.
 *   2. KLOKKEN: writeNotificationToMany med type/priority/title/body/deep_link/
 *      reference_type/reference_id/company_id/dedup_key fra dommen.
 *   3. DOMMEN ER _shared's: functionen kalder certifikatKlokkeModtagere og regner
 *      ingen egen dato eller tier (ingen laegMaanederTilDato, computeMembershipTier,
 *      Date-regning på startdatoen).
 *   4. MIGRATIONEN: første linje «-- IKKE KØRT», jobbet 'certifikat-klokke' kl.
 *      '15 6 * * *' gennem kald_edge med dry_run false, 60000 < 86400000, og revert.
 */
const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "");
const foer = (k: string, a: string, b: string) => { const i = k.indexOf(a), j = k.indexOf(b); return i !== -1 && j !== -1 && i < j; };
const FN = "supabase/functions/certifikat-klokke/index.ts";
const CONFIG = "supabase/config.toml";
const MIG = "supabase/migrations/20260929200000_certifikat_klokke_cron.sql";

export const authOgToerkoersel = (fn: string, config: string): boolean => {
  const f = udenKommentarer(fn);
  const serve = f.slice(f.indexOf("Deno.serve("));
  const blok = config.slice(config.indexOf("[functions.certifikat-klokke]"), config.indexOf("[functions.certifikat-klokke]") + 60);
  return (
    serve.includes("const auth = authenticateServiceRole(req);") &&
    serve.includes("if (auth !== true) return auth;") &&
    foer(serve, "authenticateServiceRole(req)", "createClient(supabaseUrl, serviceKey") &&
    f.includes('export const KENDTE_FELTER = ["dry_run", "nu"] as const;') &&
    f.includes("ukendteFelter(raaBody, KENDTE_FELTER)") &&
    f.includes("const toerKoersel = raaBody?.dry_run !== false;") &&
    foer(f, "if (toerKoersel) return r;", "await writeNotificationToMany(") &&
    /verify_jwt = true/.test(blok)
  );
};

export const klokkensFelter = (fn: string): boolean => {
  const f = udenKommentarer(fn).replace(/\s+/g, " ");
  return (
    (f.match(/writeNotificationToMany\(/g) ?? []).length === 1 &&
    f.includes('await writeNotificationToMany(admin, k.modtagere, { type: KLOKKE_TYPE, priority: "important", title: KLOKKE_TITEL, body: KLOKKE_TEKST, deep_link: KLOKKE_LINK, reference_type: KLOKKE_REFERENCE_TYPE, reference_id: k.companyId, company_id: k.companyId, dedup_key: k.dedupKey, });')
  );
};

export const dommenErShared = (fn: string): boolean => {
  const f = udenKommentarer(fn);
  return (
    /import \{[^}]*\bcertifikatKlokkeModtagere\b[^}]*\} from "\.\.\/_shared\/certifikatKlokke\.ts";/.test(f) &&
    f.includes("const udvalg = certifikatKlokkeModtagere({ virksomheder, medlemmer, raadgivere, harHentet, nu });") &&
    !/laegMaanederTilDato|laegDageTilDato|computeMembershipTier|contract_start_date\s*[<>]|setMonth|getMonth|getDate\(|getUTCDay/.test(f)
  );
};

export const migrationenErRigtig = (sql: string): boolean => {
  // Kommentarer væk — også halekommentarer efter et argument («60000, -- timeout …»).
  const kode = sql.split("\n").filter((l) => !/^\s*--/.test(l)).map((l) => l.replace(/\s*--.*$/, "")).join("\n").replace(/\s+/g, " ");
  return (
    sql.split("\n")[0] === "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik)." &&
    /cron\.schedule\( 'certifikat-klokke', '15 6 \* \* \*', \$job\$ SELECT public\.kald_edge\( 'certifikat-klokke', '\{"dry_run": false\}'::jsonb, 60000, 86400000 \); \$job\$ \);/.test(kode) &&
    sql.includes("-- Revert: SELECT cron.unschedule('certifikat-klokke');") &&
    sql.includes("06:15 UTC = 08:15 dansk sommertid") && sql.includes("07:15 dansk vintertid")
  );
};

describe("certifikatKlokke.guard", () => {
  it("1. auth først, tørkørsel som standard, verify_jwt = true", () => expect(authOgToerkoersel(laes(FN), laes(CONFIG))).toBe(true));
  it("2. klokkens felter fra dommen", () => expect(klokkensFelter(laes(FN))).toBe(true));
  it("3. dommen er _shared's — ingen egen dato eller tier i functionen", () => expect(dommenErShared(laes(FN))).toBe(true));
  it("4. migrationens hoved, job og revert", () => expect(migrationenErRigtig(laes(MIG))).toBe(true));
});

describe("certifikatKlokke.guard — dommene fælder på en kopi", () => {
  const fn = laes(FN), config = laes(CONFIG), mig = laes(MIG);
  const byt = (k: string, a: string, b: string) => { expect(k.split(a).length - 1, a).toBe(1); return k.split(a).join(b); };

  it("service role før auth, dry_run som opt-in, skrivning i tørkørsel eller verify_jwt false fælder dom 1", () => {
    expect(authOgToerkoersel(byt(fn, "  const auth = authenticateServiceRole(req);\n  if (auth !== true) return auth;\n", ""), config)).toBe(false);
    expect(authOgToerkoersel(byt(fn, "const toerKoersel = raaBody?.dry_run !== false;", "const toerKoersel = raaBody?.dry_run === true;"), config)).toBe(false);
    expect(authOgToerkoersel(byt(fn, "  if (toerKoersel) return r;\n", ""), config)).toBe(false);
    expect(authOgToerkoersel(fn, byt(config, "[functions.certifikat-klokke]\n    verify_jwt = true", "[functions.certifikat-klokke]\n    verify_jwt = false"))).toBe(false);
  });

  it("en anden priority, et hjemmelavet dedup_key eller et manglende deep_link fælder dom 2", () => {
    expect(klokkensFelter(byt(fn, 'priority: "important",', 'priority: "info",'))).toBe(false);
    expect(klokkensFelter(byt(fn, "dedup_key: k.dedupKey,", "dedup_key: `certifikat_klar:${k.companyId}`,"))).toBe(false);
    expect(klokkensFelter(byt(fn, "      deep_link: KLOKKE_LINK,\n", ""))).toBe(false);
  });

  it("en egen dato- eller tier-regning i functionen fælder dom 3", () => {
    expect(dommenErShared(`${fn}\nconst x = laegMaanederTilDato("2025-01-01", 12);\n`)).toBe(false);
    expect(dommenErShared(`${fn}\nconst t = computeMembershipTier(c);\n`)).toBe(false);
    expect(dommenErShared(byt(fn, "const udvalg = certifikatKlokkeModtagere({ virksomheder, medlemmer, raadgivere, harHentet, nu });", "const udvalg = { iDag: \"\", klar: [], sprunget: {} as never, raadgivere: 0, harHentet: 0 };"))).toBe(false);
  });

  it("et hoved uden IKKE KØRT, et andet tidspunkt, en timeout ≥ interval eller ingen revert fælder dom 4", () => {
    expect(migrationenErRigtig(`-- forklaring først\n${mig}`)).toBe(false);
    expect(migrationenErRigtig(byt(mig, "'15 6 * * *'", "'15 6 * * 1'"))).toBe(false);
    expect(migrationenErRigtig(byt(mig, "    60000,       -- timeout", "    86400000,    -- timeout"))).toBe(false);
    expect(migrationenErRigtig(byt(mig, "-- Revert: SELECT cron.unschedule('certifikat-klokke');", ""))).toBe(false);
  });
});
