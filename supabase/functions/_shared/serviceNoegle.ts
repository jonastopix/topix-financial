/**
 * serviceNoegle — Bucket B's dom, ren og uden imports (fase 3a, trin 1).
 * =======================================================================
 *
 * HVORFOR (docs/prod-hjem-plan.md, fase 3a): Supabase sletter legacy-
 * nøglerne (anon/service_role-JWT'erne) «Late 2026, TBC». Cron sender i dag
 * den legacy service_role-JWT som `Authorization: Bearer …` gennem
 * public.kald_edge, og Bucket B læser kun dens role-claim, mens gatewayen
 * (verify_jwt = true) bærer signaturen. Med de nye nøgler er der ingen JWT
 * at verificere: Supabase anviser verify_jwt = false og autorisation i
 * koden med `sb_secret_…` i `apikey`-headeren.
 *
 * TRIN 1 (denne fil): en ANDEN vej ind ved siden af role-claimet:
 *   - kandidaten er `apikey`-headeren, ellers `Authorization: Bearer
 *     sb_secret_…`;
 *   - den godtages KUN, når både kandidaten og runtimens
 *     SUPABASE_SERVICE_ROLE_KEY har formen `sb_secret_…`, og de er ens
 *     sammenlignet i KONSTANT TID (ingen tidlig udgang på første forskel
 *     eller på længden).
 * Role-claim-vejen er UÆNDRET, og en forkert eller fremmed nøgle får aldrig
 * selv et nej: dommen falder igennem til role-claimet, præcis som før
 * trin 1. Det er bevidst — alle Bucket B-functions står stadig med
 * verify_jwt = true, så gatewayen bærer signaturen på role-claim-vejen, og
 * trin 1 må ikke ændre et eneste svar for de kaldere, der virker i dag.
 *
 * TRIN 2 (IKKE bygget — docs/prod-hjem-plan.md «Fase 3a, trin 2 og 3»):
 * pr. function verify_jwt = false SAMMEN med en «kun nøgle»-tilstand, hvor
 * role-claimet ikke godtages. Uden gatewayens signaturtjek kan role-claimet
 * forfalskes af enhver, så de to ting skal ske i samme udrulning.
 *
 * Filen har INGEN imports (hverken esm.sh eller Deno), så vitest kan
 * importere den direkte (src/lib/__tests__/serviceNoegle.test.ts), og
 * runtimens nøgle gives ind som argument — `Deno.env` læses kun i
 * edgeFunctionAuth.ts.
 */

/** Formen på Supabase' nye hemmelige nøgle. Publishable (`sb_publishable_…`)
 *  og legacy-JWT'er (anon/service_role, `eyJ…`) har den ikke. */
export const SB_SECRET_PRAEFIKS = "sb_secret_";

const SB_SECRET_MOENSTER = /^sb_secret_[A-Za-z0-9_-]+$/;

/** Har strengen formen `sb_secret_<tegn>`? Kun bogstaver, cifre, `_` og `-`
 *  efter præfikset — et mellemrum, et punktum (JWT) eller en tom hale er nej. */
export function erSbSecretForm(s: string | null | undefined): s is string {
  return typeof s === "string" && SB_SECRET_MOENSTER.test(s);
}

/**
 * Sammenligner to strenge i konstant tid i forhold til indholdet.
 *
 * Regnestykket: begge strenge kodes til UTF-8-bytes; løkken går ALTID
 * max(|a|, |b|) gange og ORer `a[i] XOR b[i]` (manglende byte = 0) ind i
 * `forskel`, som på forhånd bærer `|a| XOR |b|` (≠ 0 når længderne er
 * forskellige). Resultatet er ens ⇔ forskel = 0. Ingen tidlig udgang — hverken
 * på første forskellige byte eller på længden — så svartiden afslører ikke,
 * hvor mange tegn en gætter har ramt. Længden af den LÆNGSTE streng kan ses
 * på tiden; den er ikke hemmelig (formen sb_secret_ + 31 tegn står i
 * Supabase' dokumentation).
 */
export function konstantTidLig(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const n = Math.max(ea.length, eb.length);
  let forskel = ea.length ^ eb.length;
  for (let i = 0; i < n; i++) {
    forskel |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  }
  return forskel === 0;
}

/** Den header, nøglen læses fra: `apikey` først, ellers `Authorization:
 *  Bearer sb_secret_…`. En Bearer, der ikke har sb_secret-formen (fx en
 *  legacy-JWT), er IKKE en nøglekandidat — den hører til role-claim-vejen. */
export function noegleKandidat(headers: Headers): string | null {
  const apikey = headers.get("apikey")?.trim();
  if (apikey) return apikey;
  const auth = headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token.startsWith(SB_SECRET_PRAEFIKS)) return token;
  }
  return null;
}

/**
 * Er kandidaten runtimens hemmelige nøgle? Kræver sb_secret-formen på BEGGE
 * sider: er runtimens SUPABASE_SERVICE_ROLE_KEY tom eller (som i et projekt
 * med legacy-nøgler alene) en JWT, er vejen lukket — en tom streng eller en
 * legacy-JWT må aldrig kunne «matche» sig ind. Sammenligningen er
 * konstantTidLig.
 */
export function erRuntimensServiceNoegle(
  kandidat: string | null | undefined,
  runtimeNoegle: string | null | undefined,
): boolean {
  if (!erSbSecretForm(runtimeNoegle)) return false;
  if (!erSbSecretForm(kandidat)) return false;
  return konstantTidLig(kandidat, runtimeNoegle);
}

/**
 * Læser claims ud af en JWT UDEN at verificere signaturen.
 * Må kun bruges bag verify_jwt = true (se INVARIANT i edgeFunctionAuth.ts).
 * Flyttet hertil fra edgeFunctionAuth.ts (som re-eksporterer den), så dommen
 * kan testes i vitest. Eneste ændring: `replaceAll(x, y)` → `replace(/x/g, y)`
 * (samme virkning), fordi tsconfig.app.json's lib ikke kender replaceAll.
 */
export function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
    return JSON.parse(atob(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const FEJL_401 = "Unauthorized — service-role key required";
export const FEJL_403 = "Forbidden — service-role required";

export type ServiceRoleDom =
  | { ok: true; vej: "noegle" | "role_claim" }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Bucket B's dom (trin 1). Rækkefølgen:
 *   1. Nøglevejen: noegleKandidat → erRuntimensServiceNoegle → ok «noegle».
 *   2. Ellers role-claim-vejen, UÆNDRET fra før trin 1:
 *      ingen `Bearer ` → 401 · claims kan ikke læses → 401 ·
 *      role ≠ "service_role" → 403 · ellers ok «role_claim».
 * 401/403-adskillelsen er bevaret (en tvetydig 401 kostede en times
 * fejlsøgning 10-08-2026).
 */
export function domServiceRole(
  headers: Headers,
  runtimeNoegle: string | null | undefined,
): ServiceRoleDom {
  if (erRuntimensServiceNoegle(noegleKandidat(headers), runtimeNoegle)) {
    return { ok: true, vej: "noegle" };
  }

  const authHeader = headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: FEJL_401 };
  }
  const claims = parseJwtClaims(authHeader.slice("Bearer ".length).trim());
  if (!claims) {
    return { ok: false, status: 401, error: FEJL_401 };
  }
  if (claims.role !== "service_role") {
    return { ok: false, status: 403, error: FEJL_403 };
  }
  return { ok: true, vej: "role_claim" };
}
