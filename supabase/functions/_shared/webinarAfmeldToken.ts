/**
 * webinarAfmeldToken — afmeldingslinket i før-webinar-mailene (22/9-2026).
 *
 * KRAVET: et link, der virker uden login, for en person der aldrig har haft en
 * konto. Og det skal virke for HVER modtager, også dem der får deres første
 * mail i samme sekund — så der er intet at slå op på forhånd.
 *
 * DERFOR ET HMAC, IKKE EN GEMT RÆKKE. Tokenet er
 * `<mail i base64url>.<HMAC-SHA256 af mailen, base64url>`; serveren regner
 * aftrykket igen og sammenligner i KONSTANT TID. Ingen tabel skal fyldes på
 * forhånd, ingen række kan blive væk, og en fremmed kan ikke afmelde en
 * adresse, han ikke har fået et link til.
 *
 * SAMMENLIGNET MED HUSETS TO ANDRE TOKENS: `verifyAftaletoken` og
 * `verifyDelingstoken` slår op på en GEMT række, fordi der ER en række
 * (en aftale, en deling). Her er der ingen — modtageren er bare en mailadresse.
 *
 * SECRET'EN er `WEBINAR_AFMELD_SECRET`, og den har ÉT job. Den er bevidst ikke
 * service-role-nøglen: et link i en mail, der lever i måneder, må ikke hænge
 * sammen med en nøgle, der roteres af andre grunde — og et HMAC med en
 * auth-nøgle er at bruge den samme hemmelighed til to ting.
 *
 * KASTER ALDRIG på et forkert token. Svaret er «ugyldigt», og kalderen
 * bestemmer, hvad den siger til mennesket.
 */

export const AFMELD_SECRET = "WEBINAR_AFMELD_SECRET";

/** Formen: to base64url-dele adskilt af ét punktum. */
export const TOKEN_FORM = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const enc = new TextEncoder();

export function tilBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fraBase64Url(s: string): Uint8Array | null {
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
export function erKonstantTidLig(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let forskel = 0;
  for (let i = 0; i < a.length; i++) forskel |= a[i] ^ b[i];
  return forskel === 0;
}

/** Mailen normaliseres ÉT sted — ellers ville «Jonas@…» og «jonas@…» give to forskellige tokens. */
export const normaliserMail = (mail: string): string => mail.trim().toLowerCase();

export async function byggAfmeldToken(secret: string, mail: string): Promise<string> {
  const m = normaliserMail(mail);
  return `${tilBase64Url(enc.encode(m))}.${tilBase64Url(await hmac(secret, m))}`;
}

export type Tokendom = { ok: true; email: string } | { ok: false; grund: "form" | "aftryk" | "ingen_secret" };

export async function laesAfmeldToken(secret: string | null | undefined, token: unknown): Promise<Tokendom> {
  const s = (secret ?? "").trim();
  if (!s) return { ok: false, grund: "ingen_secret" };
  if (typeof token !== "string" || !TOKEN_FORM.test(token)) return { ok: false, grund: "form" };
  const [del, aftryk] = token.split(".");
  const raaMail = fraBase64Url(del);
  const raaAftryk = fraBase64Url(aftryk);
  if (!raaMail || !raaAftryk) return { ok: false, grund: "form" };
  const mail = normaliserMail(new TextDecoder().decode(raaMail));
  if (!mail.includes("@")) return { ok: false, grund: "form" };
  const ventet = await hmac(s, mail);
  if (!erKonstantTidLig(ventet, raaAftryk)) return { ok: false, grund: "aftryk" };
  return { ok: true, email: mail };
}

/** Hele linket. Basen er functionens egen URL — den skal kunne kaldes uden login. */
export function afmeldUrl(basis: string, token: string): string {
  return `${basis.replace(/\/+$/, "")}?t=${encodeURIComponent(token)}`;
}
