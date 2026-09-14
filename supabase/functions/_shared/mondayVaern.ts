/**
 * Værnet for monday-webhook — to veje ind, én dom.
 *
 * HVORFOR DEN FINDES (14/9-2026): Mondays board-webhook (opskriften på
 * boardet) sender INGEN Authorization-header. Mondays egen dokumentation:
 * den signerede JWT kommer kun når webhooken er oprettet gennem
 * create_webhook med en integrations-apps OAuth-token. monday-webhook
 * afviste derfor hvert eneste board-kald med 401 på «Missing Authorization
 * header», og kæden «Godkendt» → virksomhed → dag 0 har aldrig kunnet nås.
 * Beslutning: en board-webhook autentificerer på en delt hemmelighed i
 * URL'en (?noegle=…), som kun Monday-automationen og vi kender.
 *
 * TO VEJE, fordi begge er rigtige i hver sin verden:
 *   - Authorization-header til stede → JWT-vejen, præcis som før:
 *     MONDAY_SIGNING_SECRET skal findes (500 ellers), verifyMondayJwt afgør
 *     (401 ved ugyldig). Det er den vej der gælder hvis webhooken en dag
 *     oprettes via en Monday-app — så bærer hvert kald en signatur, og den
 *     er stærkere end en delt hemmelighed.
 *   - Ingen Authorization-header → URL-vejen: query-parameteren skal være
 *     byte-for-byte lig MONDAY_WEBHOOK_SECRET. Mangler parameteren, er den
 *     forkert, eller er secret'en ikke sat → afvist. Sammenligningen er
 *     konstant-tid (_shared/konstantTidLighed.ts), så svartiden ikke røber
 *     hvor mange tegn der var rigtige.
 *   Secret-tjekket for JWT-vejen ligger INDE i JWT-grenen, så en board-
 *   webhook uden header ikke rammer 500 på en secret den ikke bruger.
 *
 * REN FUNKTION: intet HTTP, ingen Deno.env. Kalderen (index.ts) læser
 * header, query-parameter og secrets og giver dem ind; dommen siger enten
 * «videre, ad denne vej» eller «afvis med denne status, denne body og
 * denne loglinje». JWT-verifikationen gives ind som funktion, så værnet kan
 * testes med en rigtig HMAC-signeret token (vitest, src/lib/__tests__/
 * mondayVaern.test.ts) og CI-værnet (scripts/check-edge-function-auth.ts)
 * stadig ser `verifyMondayJwt(` i index.ts.
 *
 * Challenge-kaldet (body.challenge) ligger FØR værnet i index.ts og er
 * uændret: det skal kunne svares uden hemmelighed (Monday sender det ved
 * oprettelse af webhooken). Rækkefølgen er låst af
 * src/lib/__tests__/mondayVaern.guard.test.ts.
 */
import { erKonstantTidLig } from "./konstantTidLighed.ts";

/** Navnet på query-parameteren i webhook-URL'en: …/monday-webhook?noegle=<MONDAY_WEBHOOK_SECRET> */
export const MONDAY_URL_PARAMETER = "noegle";

/** Navnet på secret'en for URL-vejen (Lovable → Cloud → Secrets). Samme form som STRIPE_WEBHOOK_SECRET. */
export const MONDAY_WEBHOOK_SECRET_NAVN = "MONDAY_WEBHOOK_SECRET";

// HMAC-SHA256 verification for Monday.com webhook JWT
// (flyttet ordret fra monday-webhook/index.ts 14/9-2026, så den kan testes)
export async function verifyMondayJwt(authHeader: string | null, signingSecret: string): Promise<boolean> {
  if (!authHeader) return false;

  try {
    const parts = authHeader.split(".");
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureStr = signatureB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = signatureStr.length % 4;
    const paddedSig = pad ? signatureStr + "=".repeat(4 - pad) : signatureStr;
    const sigBytes = Uint8Array.from(atob(paddedSig), (c) => c.charCodeAt(0));

    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, data);

    return valid;
  } catch (e) {
    console.error("JWT verification error:", e);
    return false;
  }
}

export interface MondayVaernInput {
  /** Authorization-headeren som Monday sendte den — null når den mangler. */
  authHeader: string | null;
  /** Query-parameteren `noegle` fra URL'en — null når den mangler. */
  urlNoegle: string | null;
  /** MONDAY_SIGNING_SECRET fra env — undefined når den ikke er sat. */
  signeringsSecret: string | undefined;
  /** MONDAY_WEBHOOK_SECRET fra env — undefined når den ikke er sat. */
  urlSecret: string | undefined;
}

export type MondayVaernDom =
  | { ok: true; vej: "jwt" | "url" }
  | {
      ok: false;
      status: 401 | 500;
      /** Svarets body: { error } — samme form som før. */
      fejl: string;
      logNiveau: "warn" | "error";
      logTekst: string;
    };

/** Signaturen på verifyMondayJwt — gives ind, så dommen er ren og testbar. */
export type JwtVerificering = (authHeader: string, signingSecret: string) => Promise<boolean>;

export async function afgoerMondayVaern(input: MondayVaernInput, verificerJwt: JwtVerificering): Promise<MondayVaernDom> {
  // ── JWT-vejen: header til stede. Ordret samme domme som før 14/9. ──
  if (input.authHeader) {
    if (!input.signeringsSecret) {
      return {
        ok: false,
        status: 500,
        fejl: "Server configuration error",
        logNiveau: "error",
        logTekst: "MONDAY_SIGNING_SECRET not configured — refusing to process webhook",
      };
    }
    const gyldig = await verificerJwt(input.authHeader, input.signeringsSecret);
    if (!gyldig) {
      return { ok: false, status: 401, fejl: "Unauthorized", logNiveau: "error", logTekst: "Invalid Monday.com webhook signature" };
    }
    return { ok: true, vej: "jwt" };
  }

  // ── URL-vejen: ingen header. Board-webhookens vej. ──
  if (!input.urlSecret) {
    // Samme form som JWT-vejens manglende secret: 500, så det ses — ikke et stille 401.
    return {
      ok: false,
      status: 500,
      fejl: "Server configuration error",
      logNiveau: "error",
      logTekst: `${MONDAY_WEBHOOK_SECRET_NAVN} ikke sat — board-webhooken kan ikke autentificeres`,
    };
  }
  if (input.urlNoegle === null || input.urlNoegle === "") {
    return {
      ok: false,
      status: 401,
      fejl: "Unauthorized",
      logNiveau: "warn",
      logTekst: `Ingen Authorization-header og ingen ?${MONDAY_URL_PARAMETER}= i URL'en — afvist`,
    };
  }
  if (!erKonstantTidLig(input.urlNoegle, input.urlSecret)) {
    return {
      ok: false,
      status: 401,
      fejl: "Unauthorized",
      logNiveau: "warn",
      logTekst: `Ingen Authorization-header og forkert ?${MONDAY_URL_PARAMETER}= i URL'en — afvist`,
    };
  }
  return { ok: true, vej: "url" };
}
