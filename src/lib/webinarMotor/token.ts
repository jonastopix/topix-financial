/**
 * webinarMotor/token — deltagertokenet, en HMAC (skive 1, 30/9-2026).
 *
 * Spejlet ORDRET i supabase/functions/_shared/webinarMotor/token.ts
 * (paritetstest src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports;
 * kun platformens egne globale (crypto.subtle, TextEncoder, btoa/atob), som
 * findes ens i Deno, Node og browseren. Secret'en gives IND — den læses ét
 * sted: supabase/functions/_shared/webinarDeltagerAuth.ts.
 *
 * HVORFOR HMAC OG IKKE ET GEMT SHA-256-AFTRYK (spec §D2 — en bevidst afvigelse
 * fra delingstokenAuth.ts): delingstokenet vises én gang og lever kun i
 * modtagerens link. Join-linket skal derimod BYGGES IGEN af webinar-mail-cron i
 * op til syv mails over 14 dage. Et gemt aftryk kan ikke give linket tilbage,
 * og at gemme tokenet i klartekst er præcis det, delingstokenAuth.ts forklarer,
 * hvorfor huset ikke gør. HMAC giver begge dele: intet gemt, og cronen kan
 * udlede linket. Præcedensen er webinarAfmeldToken.ts (HMAC over mailen).
 *
 * FORMEN: base64url(16 bytes tilmeldings-uuid ‖ 4 bytes version, big-endian)
 * «.» base64url(HMAC-SHA256(secret, "<uuid>:<version>")) — 27 + 1 + 43 tegn.
 * Versionen står i tokenet, så HMAC'en kan regnes FØR noget databaseopslag:
 * et forfalsket token koster aldrig en forespørgsel. Tilbagekaldelse:
 * webinar_tilmeldinger.token_version += 1 — kalderen kræver, at versionen i
 * tokenet er rækkens.
 *
 * KASTER ALDRIG på et forkert token.
 */

export const DELTAGERTOKEN_FORM = /^[A-Za-z0-9_-]{27}\.[A-Za-z0-9_-]{43}$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const enc = new TextEncoder();

function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fraB64u(s: string): Uint8Array | null {
  try {
    const p = s.replace(/-/g, "+").replace(/_/g, "/");
    const raa = atob(p + "=".repeat((4 - (p.length % 4)) % 4));
    const ud = new Uint8Array(raa.length);
    for (let i = 0; i < raa.length; i++) ud[i] = raa.charCodeAt(i);
    return ud;
  } catch {
    return null;
  }
}

async function hmac(secret: string, besked: string): Promise<Uint8Array> {
  const noegle = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", noegle, enc.encode(besked)));
}

/** Konstant tid — en sammenligning, der stopper tidligt, fortæller hvor langt man kom. */
export function ensIKonstantTid(a: Uint8Array, b: Uint8Array): boolean {
  let forskel = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) forskel |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return forskel === 0;
}

function uuidTilBytes(id: string): Uint8Array {
  const hex = id.replace(/-/g, "");
  const ud = new Uint8Array(16);
  for (let i = 0; i < 16; i++) ud[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return ud;
}

function bytesTilUuid(b: Uint8Array): string {
  const h = Array.from(b.slice(0, 16), (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const gyldigVersion = (v: number) => Number.isInteger(v) && v >= 1 && v <= 0xffffffff;

export async function byggDeltagertoken(secret: string, tilmeldingId: string, version: number): Promise<string> {
  const id = tilmeldingId.toLowerCase();
  if (!secret.trim()) throw new Error("byggDeltagertoken: ingen secret");
  if (!UUID.test(id)) throw new Error("byggDeltagertoken: tilmeldings-id er ikke et uuid");
  if (!gyldigVersion(version)) throw new Error("byggDeltagertoken: ugyldig version");
  const del = new Uint8Array(20);
  del.set(uuidTilBytes(id));
  new DataView(del.buffer).setUint32(16, version, false);
  return `${b64u(del)}.${b64u(await hmac(secret.trim(), `${id}:${version}`))}`;
}

export type Deltagertokendom =
  | { ok: true; tilmeldingId: string; version: number; noegle: "nu" | "forrige" }
  | { ok: false; grund: "ingen_secret" | "form" | "aftryk" };

/**
 * Form-tjek → id og version ud af første del → HMAC regnet igen med den
 * gældende nøgle (og den forrige i en rotationsperiode) → sammenlignet i
 * konstant tid. Ingen databaseopslag her; kalderen slår rækken op BAGEFTER og
 * kræver, at token_version passer.
 */
export async function laesDeltagertoken(secret: string | null | undefined, forrige: string | null | undefined, token: unknown): Promise<Deltagertokendom> {
  const nu = (secret ?? "").trim();
  if (!nu) return { ok: false, grund: "ingen_secret" };
  if (typeof token !== "string" || !DELTAGERTOKEN_FORM.test(token)) return { ok: false, grund: "form" };
  const [a, b] = token.split(".");
  const del = fraB64u(a);
  const aftryk = fraB64u(b);
  if (!del || del.length !== 20 || !aftryk || aftryk.length !== 32) return { ok: false, grund: "form" };
  const id = bytesTilUuid(del);
  const version = new DataView(del.buffer, del.byteOffset, del.byteLength).getUint32(16, false);
  if (!gyldigVersion(version)) return { ok: false, grund: "form" };
  const besked = `${id}:${version}`;
  if (ensIKonstantTid(await hmac(nu, besked), aftryk)) return { ok: true, tilmeldingId: id, version, noegle: "nu" };
  const gammel = (forrige ?? "").trim();
  if (gammel && ensIKonstantTid(await hmac(gammel, besked), aftryk)) return { ok: true, tilmeldingId: id, version, noegle: "forrige" };
  return { ok: false, grund: "aftryk" };
}

/** Stien til rummet. Tokenet flyttes af siden til sessionStorage og fjernes fra adresselinjen. */
export function rumSti(slug: string, token: string): string {
  return `/w/${encodeURIComponent(slug)}?t=${encodeURIComponent(token)}`;
}

/**
 * Appens adresse (skive 3). Seerens sider bor her, og mailenes links peger
 * hertil — webinar-mail-cron bygger join- og kalenderlinket for motorens
 * tilmeldinger som APP_URL + sti. Ét sted, så mail og rum aldrig er uenige.
 */
export const APP_URL = "https://app.theboardroom.dk";

/**
 * Kalenderlinket til mails (skive 3): siden /w/<slug>/kalender sender videre
 * til webinar-rum GET handling=ics — husets egen .ics (Apple/Outlook desktop).
 * Samme token som rummet.
 */
export function kalenderSti(slug: string, token: string): string {
  return `/w/${encodeURIComponent(slug)}/kalender?t=${encodeURIComponent(token)}`;
}

/**
 * Reserveformularen med ÉN bestemt session valgt (skive 3) — rådgiverens
 * prøvelink til en INTERN session. Den interne session står aldrig i de
 * offentlige lister (naesteSessioner); linket er vejen ind, og webinar-tilmeld
 * tager kun imod husets egne adresser til den (tilmelding.ts:internDom).
 * Session-id'et er ingen hemmelighed og ingen legitimation.
 */
export function tilmeldSti(slug: string, sessionId: string): string {
  return `/w/${encodeURIComponent(slug)}/tilmeld?session=${encodeURIComponent(sessionId)}`;
}
