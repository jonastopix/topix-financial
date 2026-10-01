/**
 * Fase 3a, trin 1 (1/10-2026, docs/prod-hjem-plan.md): Bucket B's dom.
 *
 * Dommen bor ren i supabase/functions/_shared/serviceNoegle.ts (ingen imports),
 * så den importeres direkte. authenticateServiceRole i edgeFunctionAuth.ts
 * importerer esm.sh og kan ikke importeres i vitest — den læses som kilde
 * (kildeværn nederst), samme mønster som de øvrige *.guard-tests.
 *
 * Nøglerne her er OPDIGTEDE og har kun formen af de rigtige.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FEJL_401,
  FEJL_403,
  domServiceRole,
  erRuntimensServiceNoegle,
  erSbSecretForm,
  konstantTidLig,
  noegleKandidat,
  parseJwtClaims,
} from "../../../supabase/functions/_shared/serviceNoegle.ts";

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");

// 41 tegn som runtimens nøgle (sb_secret_ + 31).
// Bygget i dele, så GitHubs push protection ikke tager en FALSK testværdi for en rigtig nøgle (1/10).
const RUNTIME = ["sb", "secret", "AbCdEfGhIjKlMnOpQrStUvWxYz01234"].join("_");
const PUBLISHABLE = "sb_publishable_AbCdEfGhIjKlMnOpQrStUvWxYz0123";

/** base64url-koder et objekt (JWT-segmentform: -/_ og uden padding). */
const b64url = (obj: unknown): string =>
  Buffer.from(JSON.stringify(obj), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const jwt = (payload: unknown): string =>
  `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.usigneret`;

const LEGACY_SERVICE = jwt({ role: "service_role", iss: "supabase" });
const LEGACY_ANON = jwt({ role: "anon", iss: "supabase" });

const h = (felter: Record<string, string>) => new Headers(felter);

describe("konstantTidLig", () => {
  it("ens strenge → true", () => {
    expect(konstantTidLig(RUNTIME, RUNTIME)).toBe(true);
    expect(konstantTidLig("", "")).toBe(true);
  });
  it("én forskellig byte (først, midt, sidst) → false", () => {
    expect(konstantTidLig(RUNTIME, "t" + RUNTIME.slice(1))).toBe(false);
    expect(konstantTidLig(RUNTIME, RUNTIME.slice(0, 20) + "X" + RUNTIME.slice(21))).toBe(false);
    expect(konstantTidLig(RUNTIME, RUNTIME.slice(0, -1) + "5")).toBe(false);
  });
  it("præfiks og forlængelse → false (længden tæller)", () => {
    expect(konstantTidLig(RUNTIME, RUNTIME.slice(0, -1))).toBe(false);
    expect(konstantTidLig(RUNTIME, RUNTIME + "0")).toBe(false);
    expect(konstantTidLig(RUNTIME, "")).toBe(false);
  });
  it("kildeværn: ingen tidlig udgang i løkken", () => {
    const kilde = laes("supabase/functions/_shared/serviceNoegle.ts");
    const krop = kilde.split("export function konstantTidLig")[1].split("\n}\n")[0];
    expect(krop).toContain("Math.max(ea.length, eb.length)");
    expect(krop).toContain("ea.length ^ eb.length");
    expect(krop).not.toMatch(/return false|break;/);
    expect(krop).not.toMatch(/a === b|a !== b/);
  });
});

describe("erSbSecretForm", () => {
  it("sb_secret_ + tegn → true", () => {
    expect(erSbSecretForm(RUNTIME)).toBe(true);
  });
  it("publishable, legacy-JWT, tom hale, tom, null og mellemrum → false", () => {
    expect(erSbSecretForm(PUBLISHABLE)).toBe(false);
    expect(erSbSecretForm(LEGACY_SERVICE)).toBe(false);
    expect(erSbSecretForm("sb_secret_")).toBe(false);
    expect(erSbSecretForm("")).toBe(false);
    expect(erSbSecretForm(null)).toBe(false);
    expect(erSbSecretForm(undefined)).toBe(false);
    expect(erSbSecretForm(RUNTIME + " x")).toBe(false);
  });
});

describe("noegleKandidat", () => {
  it("apikey vinder over Authorization", () => {
    expect(noegleKandidat(h({ apikey: RUNTIME, Authorization: `Bearer ${LEGACY_SERVICE}` }))).toBe(RUNTIME);
  });
  it("Bearer sb_secret_… er en kandidat", () => {
    expect(noegleKandidat(h({ Authorization: `Bearer ${RUNTIME}` }))).toBe(RUNTIME);
  });
  it("Bearer <legacy-JWT> er IKKE en kandidat", () => {
    expect(noegleKandidat(h({ Authorization: `Bearer ${LEGACY_SERVICE}` }))).toBeNull();
  });
  it("ingen headere → null; tom apikey → falder til Authorization", () => {
    expect(noegleKandidat(h({}))).toBeNull();
    expect(noegleKandidat(h({ apikey: "   " }))).toBeNull();
    expect(noegleKandidat(h({ apikey: "", Authorization: `Bearer ${RUNTIME}` }))).toBe(RUNTIME);
  });
});

describe("erRuntimensServiceNoegle", () => {
  it("rigtig nøgle → true", () => {
    expect(erRuntimensServiceNoegle(RUNTIME, RUNTIME)).toBe(true);
  });
  it("forkert nøgle af samme længde → false", () => {
    expect(erRuntimensServiceNoegle(RUNTIME.slice(0, -1) + "9", RUNTIME)).toBe(false);
  });
  it("forkert længde → false", () => {
    expect(erRuntimensServiceNoegle(RUNTIME + "9", RUNTIME)).toBe(false);
    expect(erRuntimensServiceNoegle(RUNTIME.slice(0, -1), RUNTIME)).toBe(false);
  });
  it("publishable og anon-JWT → false", () => {
    expect(erRuntimensServiceNoegle(PUBLISHABLE, RUNTIME)).toBe(false);
    expect(erRuntimensServiceNoegle(LEGACY_ANON, RUNTIME)).toBe(false);
  });
  it("lukket når runtimens nøgle mangler eller ikke er sb_secret (fx en legacy-JWT)", () => {
    expect(erRuntimensServiceNoegle(RUNTIME, undefined)).toBe(false);
    expect(erRuntimensServiceNoegle(RUNTIME, "")).toBe(false);
    expect(erRuntimensServiceNoegle("", "")).toBe(false);
    expect(erRuntimensServiceNoegle(LEGACY_SERVICE, LEGACY_SERVICE)).toBe(false);
  });
});

describe("domServiceRole — nøglevejen (trin 1)", () => {
  it("apikey = runtimens nøgle → ok «noegle», også UDEN Authorization", () => {
    expect(domServiceRole(h({ apikey: RUNTIME }), RUNTIME)).toEqual({ ok: true, vej: "noegle" });
  });
  it("Bearer sb_secret_… = runtimens nøgle → ok «noegle»", () => {
    expect(domServiceRole(h({ Authorization: `Bearer ${RUNTIME}` }), RUNTIME)).toEqual({ ok: true, vej: "noegle" });
  });
  it("kald_edges trin 1-form (legacy-Bearer + apikey) → ok «noegle»", () => {
    expect(
      domServiceRole(h({ Authorization: `Bearer ${LEGACY_SERVICE}`, apikey: RUNTIME }), RUNTIME),
    ).toEqual({ ok: true, vej: "noegle" });
  });
  it("forkert apikey alene → 401", () => {
    expect(domServiceRole(h({ apikey: RUNTIME.slice(0, -1) + "9" }), RUNTIME)).toEqual({
      ok: false, status: 401, error: FEJL_401,
    });
  });
  it("apikey med forkert længde alene → 401", () => {
    expect(domServiceRole(h({ apikey: RUNTIME + "0" }), RUNTIME)).toMatchObject({ ok: false, status: 401 });
  });
  it("anon-JWT eller publishable som apikey alene → 401", () => {
    expect(domServiceRole(h({ apikey: LEGACY_ANON }), RUNTIME)).toMatchObject({ ok: false, status: 401 });
    expect(domServiceRole(h({ apikey: PUBLISHABLE }), RUNTIME)).toMatchObject({ ok: false, status: 401 });
  });
  it("Bearer publishable → 401 (ikke en JWT, ikke nøglen)", () => {
    expect(domServiceRole(h({ Authorization: `Bearer ${PUBLISHABLE}` }), RUNTIME)).toMatchObject({ ok: false, status: 401 });
  });
  it("tom apikey og ingen Authorization → 401", () => {
    expect(domServiceRole(h({ apikey: "" }), RUNTIME)).toMatchObject({ ok: false, status: 401 });
    expect(domServiceRole(h({}), RUNTIME)).toMatchObject({ ok: false, status: 401 });
  });
  it("runtimens nøgle mangler → nøglevejen lukket, selv en «ens» tom streng", () => {
    expect(domServiceRole(h({ apikey: RUNTIME }), undefined)).toMatchObject({ ok: false, status: 401 });
    expect(domServiceRole(h({ apikey: "" }), "")).toMatchObject({ ok: false, status: 401 });
  });
});

describe("domServiceRole — role-claim-vejen er UÆNDRET", () => {
  it("role service_role → ok «role_claim»", () => {
    expect(domServiceRole(h({ Authorization: `Bearer ${LEGACY_SERVICE}` }), RUNTIME)).toEqual({ ok: true, vej: "role_claim" });
  });
  it("forkert apikey + gyldig legacy-Bearer → stadig ok «role_claim» (trin 1 afviser ingen, der virker i dag)", () => {
    expect(
      domServiceRole(h({ Authorization: `Bearer ${LEGACY_SERVICE}`, apikey: PUBLISHABLE }), RUNTIME),
    ).toEqual({ ok: true, vej: "role_claim" });
  });
  it("role-claim virker også uden runtime-nøgle", () => {
    expect(domServiceRole(h({ Authorization: `Bearer ${LEGACY_SERVICE}` }), undefined)).toEqual({ ok: true, vej: "role_claim" });
  });
  it("header uden Bearer-præfiks → 401", () => {
    expect(domServiceRole(h({ Authorization: LEGACY_SERVICE }), RUNTIME)).toEqual({ ok: false, status: 401, error: FEJL_401 });
  });
  it("Bearer + streng uden punktum → 401", () => {
    expect(domServiceRole(h({ Authorization: "Bearer abc123utenpunktum" }), RUNTIME)).toMatchObject({ ok: false, status: 401 });
  });
  it("Bearer + ugyldig base64 → 401", () => {
    expect(domServiceRole(h({ Authorization: "Bearer hoved.!!!ugyldig-base64!!!.sig" }), RUNTIME)).toMatchObject({ ok: false, status: 401 });
  });
  it("role anon / authenticated / intet role-felt → 403", () => {
    for (const p of [{ role: "anon" }, { role: "authenticated", sub: "abc" }, { sub: "abc", exp: 9999999999 }]) {
      expect(domServiceRole(h({ Authorization: `Bearer ${jwt(p)}` }), RUNTIME)).toEqual({ ok: false, status: 403, error: FEJL_403 });
    }
  });
  it("base64url med - og _ dekodes; ekstra mellemrum efter Bearer trimmes", () => {
    const token = jwt({ role: "service_role", pad: "ÿÿÿ" });
    expect(token).toMatch(/[-_]/);
    expect(domServiceRole(h({ Authorization: `Bearer ${token}` }), RUNTIME)).toEqual({ ok: true, vej: "role_claim" });
    expect(domServiceRole(h({ Authorization: `Bearer  ${LEGACY_SERVICE}` }), RUNTIME)).toEqual({ ok: true, vej: "role_claim" });
  });
  it("parseJwtClaims læser payloaden", () => {
    expect(parseJwtClaims(LEGACY_SERVICE)).toEqual({ role: "service_role", iss: "supabase" });
    expect(parseJwtClaims("uden-punktum")).toBeNull();
  });
});

describe("kildeværn — edgeFunctionAuth.ts og migrationen", () => {
  const auth = laes("supabase/functions/_shared/edgeFunctionAuth.ts");
  const migration = laes("supabase/migrations/20261001200000_kald_edge_apikey.sql");

  it("authenticateServiceRole dømmer med domServiceRole mod runtimens SUPABASE_SERVICE_ROLE_KEY", () => {
    const krop = auth.split("export function authenticateServiceRole")[1].split("\n}\n")[0];
    expect(krop).toContain("domServiceRole(req.headers, laesRuntimeNoegle())");
    expect(auth).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(auth).toContain('import { domServiceRole, parseJwtClaims } from "./serviceNoegle.ts"');
    expect(auth).toContain("export { parseJwtClaims }");
  });
  it("serviceNoegle.ts har ingen imports (vitest + Deno)", () => {
    expect(laes("supabase/functions/_shared/serviceNoegle.ts")).not.toMatch(/^import /m);
  });
  it("migrationen: første linje, Bearer uændret, apikey kun ved sb_secret-form, ingen GRANT", () => {
    expect(migration.split("\n")[0]).toBe(
      "-- IKKE KØRT. DEPLOY: manuelt i Lovable → SQL editor efter merge (FØR Update-klik).",
    );
    const sql = migration.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
    expect(sql).toContain("'Authorization', 'Bearer ' || v_bearer");
    expect(sql).toContain("v_noegle constant text := 'email_queue_service_role_key'");
    expect(sql).toContain("v_noegle_ny constant text := 'kald_edge_sb_secret'");
    expect(sql).toContain("v_apikey ~ '^sb_secret_[A-Za-z0-9_-]+$'");
    expect(sql).toContain("jsonb_build_object('apikey', v_apikey)");
    expect(sql).toContain("RAISE EXCEPTION 'kald_edge: % mangler i vault', v_noegle");
    expect(sql).toContain("RAISE EXCEPTION 'kald_edge: ugyldigt funktionsnavn %', funktion");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("EXCEPTION WHEN OTHERS THEN");
    expect(sql).not.toMatch(/\bGRANT\b|\bREVOKE\b/);
    // Den nye post må aldrig kunne give en fejl: ingen RAISE EXCEPTION nævner den.
    expect(sql).not.toMatch(/RAISE EXCEPTION[^;]*v_noegle_ny/);
  });
  it("migrationen bevarer grænserne ordret fra 20260910180000", () => {
    const gammel = laes("supabase/migrations/20260910180000_kald_edge.sql");
    for (const linje of [
      "IF funktion IS NULL OR funktion !~ '^[a-z0-9-]+$' THEN",
      "v_timeout := COALESCE(timeout_ms, public.kald_edge_standard_ms());",
      "IF interval_ms IS NOT NULL AND v_timeout >= interval_ms THEN",
      "IF v_timeout <= 0 OR v_timeout > public.kald_edge_loft_ms() THEN",
      "v_rod constant text := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/';",
      "timeout_milliseconds := v_timeout",
    ]) {
      expect(gammel).toContain(linje);
      expect(migration).toContain(linje);
    }
  });
});
