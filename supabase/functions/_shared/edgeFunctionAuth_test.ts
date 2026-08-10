/**
 * Enhedstests for authenticateServiceRole (PR 2a i auth-sporet).
 *
 * Tokens bygges lokalt med base64url-kodning UDEN rigtig signatur —
 * signaturen er GATEWAYENS ansvar (verify_jwt = true) og indgår ikke i
 * enheden. Testene dækker portens egen dom: Bearer-form, dekodning og
 * role-claimet, inkl. 401/403-adskillelsen.
 */

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authenticateServiceRole } from "./edgeFunctionAuth.ts";

/** base64url-koder et objekt (JWT-segmentform: -/_ og uden padding). */
const b64url = (obj: unknown): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const makeToken = (payload: unknown): string =>
  `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.usigneret`;

const reqWith = (auth?: string): Request =>
  new Request("http://localhost/", auth ? { headers: { Authorization: auth } } : {});

const expectStatus = async (result: true | Response, status: number, errorText: string) => {
  assert(result !== true, `Forventede en Response med ${status}, fik true`);
  assertEquals(result.status, status);
  const body = await result.json();
  assertEquals(body.error, errorText);
};

Deno.test("ingen Authorization-header → 401", async () => {
  await expectStatus(
    authenticateServiceRole(reqWith()),
    401,
    "Unauthorized — service-role key required",
  );
});

Deno.test("header uden Bearer-præfiks → 401", async () => {
  await expectStatus(
    authenticateServiceRole(reqWith(makeToken({ role: "service_role" }))),
    401,
    "Unauthorized — service-role key required",
  );
});

Deno.test("Bearer + streng uden punktum → 401", async () => {
  await expectStatus(
    authenticateServiceRole(reqWith("Bearer sb_secret_abc123utenpunktum")),
    401,
    "Unauthorized — service-role key required",
  );
});

Deno.test("Bearer + token med ugyldig base64 → 401", async () => {
  await expectStatus(
    authenticateServiceRole(reqWith("Bearer hoved.!!!ugyldig-base64!!!.sig")),
    401,
    "Unauthorized — service-role key required",
  );
});

Deno.test("role 'anon' → 403", async () => {
  await expectStatus(
    authenticateServiceRole(reqWith(`Bearer ${makeToken({ role: "anon" })}`)),
    403,
    "Forbidden — service-role required",
  );
});

Deno.test("role 'authenticated' → 403", async () => {
  await expectStatus(
    authenticateServiceRole(reqWith(`Bearer ${makeToken({ role: "authenticated", sub: "abc" })}`)),
    403,
    "Forbidden — service-role required",
  );
});

Deno.test("payload uden role-felt → 403", async () => {
  await expectStatus(
    authenticateServiceRole(reqWith(`Bearer ${makeToken({ sub: "abc", exp: 9999999999 })}`)),
    403,
    "Forbidden — service-role required",
  );
});

Deno.test("role 'service_role' → true", () => {
  const result = authenticateServiceRole(
    reqWith(`Bearer ${makeToken({ role: "service_role", iss: "supabase" })}`),
  );
  assertEquals(result, true);
});

Deno.test("payload med - og _ i base64url dekodes korrekt", () => {
  // "ÿÿÿ" (UTF-8: C3 BF ×3) giver '/' i standard-base64 → '_' i base64url,
  // så testen beviseligt rammer -/_ → +// -tilbageoversættelsen.
  const token = makeToken({ role: "service_role", pad: "ÿÿÿ" });
  assert(token.includes("_") || token.includes("-"), "Testpayloaden skal indeholde base64url-tegn");
  const result = authenticateServiceRole(reqWith(`Bearer ${token}`));
  assertEquals(result, true);
});

Deno.test("ekstra mellemrum efter Bearer accepteres (trim)", () => {
  const result = authenticateServiceRole(
    reqWith(`Bearer  ${makeToken({ role: "service_role" })}`),
  );
  assertEquals(result, true);
});
