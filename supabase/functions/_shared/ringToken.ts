/**
 * ringToken — legitimationen bag /ring-mig-op (2/10-2026, docs/samtykke-og-opkald.md §2.8).
 *
 * SAMME KLASSE SOM webinarAfmeldToken (22/9): et HMAC-SHA256, ikke en gemt række.
 * Tokenet er `<ewebinar_id i base64url>.<HMAC af ewebinar_id, base64url>`;
 * serveren regner aftrykket igen og sammenligner i KONSTANT TID (hjælperne
 * importeres derfra — én implementering af base64url og konstant-tid-lighed).
 *
 * HVORFOR TILMELDINGEN, IKKE MAILEN: tokenet skal bære «denne person DELTOG i
 * webinaret» (Jonas 2/10: «Kun dem, der deltog»). Det dømmes af
 * webinar_tilmeldinger-rækken (doemSetGrad → harDeltaget), og rækken findes på
 * ewebinar_id — én pr. tilmelding. Et HMAC over mailen ville give adgang for
 * ALLE tilmeldinger på den mail, også dem, der ikke mødte op. Så tokenet peger
 * på rækken, og rækken afgør.
 *
 * HVOR TOKENET KOMMER UD (Jonas 2/10 08:17: «en knap i Klaviyos EKSISTERENDE
 * «Deltog»-mail med et personligt link — profilegenskab, fx ring_op_url, skrevet
 * kun for deltagere»): linket `ring_op_url` skrives i ÉT kald med Klaviyo-hændelsen
 * «Deltog i webinar» (webinarHaendelser.byggFremmoede) — som PROFILEGENSKAB
 * (`profile.data.attributes.properties`, `{{ person.ring_op_url }}`) og som
 * hændelsesegenskab (`{{ event.ring_op_url }}`). Samme kald = ingen kapløb med
 * flowet (et cron-pas i klaviyo-profil-cron kører hver time, og «Deltog»-mail 1
 * går en time efter hændelsen). Profilen bærer linket, til en ny deltagelse
 * overskriver det; linket giver KUN adgang til at bede om et opkald for den
 * tilmelding (ingen læsning). Tokenet udstedes KUN for en «deltog»-overgang —
 * aldrig for «mødte ikke op».
 *
 * SECRET'EN er `RING_SECRET`, og den har ÉT job (samme regel som
 * WEBINAR_AFMELD_SECRET: aldrig service-role-nøglen, aldrig en nøgle, der
 * roteres af andre grunde). Mangler den, udstedes intet token (fail-soft i
 * webhooken: hændelsen går uden egenskaben), og ring-mig-op svarer 503.
 *
 * KASTER ALDRIG på et forkert token. Svaret er «ugyldigt», og functionen siger
 * det samme til mennesket, uanset grunden.
 */
import { erKonstantTidLig, fraBase64Url, tilBase64Url, TOKEN_FORM } from "./webinarAfmeldToken.ts";

export const RING_SECRET = "RING_SECRET";
/** Fladens vært — samme konstant som ansoegningMotor.APP_URL (ingen import på tværs: filen skal kunne læses af vitest uden Deno). */
export const RING_APP_URL = "https://app.theboardroom.dk";
export const RING_TOKEN_PARAM = "t";
/** Fladen, tokenet peger på (uguardet rute i App.tsx). */
export const RING_STI = "/ring-mig-op";

const enc = new TextEncoder();

async function hmac(secret: string, besked: string): Promise<Uint8Array> {
  const noegle = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", noegle, enc.encode(besked)));
}

/** eWebinars registrant-id som det står i webinar_tilmeldinger.ewebinar_id — trimmet, ellers urørt. */
export const normaliserEwebinarId = (id: string): string => id.trim();

export async function byggRingToken(secret: string, ewebinarId: string): Promise<string> {
  const id = normaliserEwebinarId(ewebinarId);
  return `${tilBase64Url(enc.encode(id))}.${tilBase64Url(await hmac(secret, id))}`;
}

export type RingTokendom = { ok: true; ewebinarId: string } | { ok: false; grund: "form" | "aftryk" | "ingen_secret" };

export async function laesRingToken(secret: string | null | undefined, token: unknown): Promise<RingTokendom> {
  const s = (secret ?? "").trim();
  if (!s) return { ok: false, grund: "ingen_secret" };
  if (typeof token !== "string" || !TOKEN_FORM.test(token)) return { ok: false, grund: "form" };
  const [del, aftryk] = token.split(".");
  const raaId = fraBase64Url(del);
  const raaAftryk = fraBase64Url(aftryk);
  if (!raaId || !raaAftryk) return { ok: false, grund: "form" };
  const id = normaliserEwebinarId(new TextDecoder().decode(raaId));
  if (id === "" || id.length > 128) return { ok: false, grund: "form" };
  const ventet = await hmac(s, id);
  if (!erKonstantTidLig(ventet, raaAftryk)) return { ok: false, grund: "aftryk" };
  return { ok: true, ewebinarId: id };
}

/** Hele linket til fladen: https://app.theboardroom.dk/ring-mig-op?t=… */
export function ringUrl(basis: string, token: string): string {
  return `${basis.replace(/\/+$/, "")}${RING_STI}?${RING_TOKEN_PARAM}=${encodeURIComponent(token)}`;
}

/**
 * Tokenet som egenskab på «Deltog i webinar» — fail-soft: uden secret → null,
 * og byggHaendelse udelader null. Kaster aldrig.
 */
export async function ringOpUrlHvisSecret(secret: string | null | undefined, basis: string, ewebinarId: string): Promise<string | null> {
  try {
    const s = (secret ?? "").trim();
    if (!s || !ewebinarId.trim()) return null;
    return ringUrl(basis, await byggRingToken(s, ewebinarId));
  } catch {
    return null;
  }
}
