import { describe, expect, it } from "vitest";
import {
  afgoerMondayVaern,
  MONDAY_URL_PARAMETER,
  MONDAY_WEBHOOK_SECRET_NAVN,
  verifyMondayJwt,
  type MondayVaernInput,
} from "../../../supabase/functions/_shared/mondayVaern.ts";

// Værnet for monday-webhook (14/9-2026) som ren funktion — intet HTTP.
// JWT-vejen testes med en RIGTIG HMAC-SHA256-signeret token bygget her, så
// verifyMondayJwt (flyttet ordret fra index.ts) også er dækket, ikke kun
// forgreningen. URL-vejen testes mod hemmeligheden byte for byte.

const SIGNERINGS_SECRET = "monday-signing-secret-til-test";
const URL_SECRET = "0f3a9c-delt-hemmelighed";

/** base64url uden padding — JWT-segmentform. */
const b64url = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlJson = (obj: unknown): string => b64url(new TextEncoder().encode(JSON.stringify(obj)));

/** En Monday-formet JWT (header.payload.signatur) signeret med HMAC-SHA256. */
async function signeretToken(secret: string, payload: unknown = { aud: "monday", iat: 1 }): Promise<string> {
  const koder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", koder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hoved = `${b64urlJson({ alg: "HS256", typ: "JWT" })}.${b64urlJson(payload)}`;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, koder.encode(hoved)));
  return `${hoved}.${b64url(sig)}`;
}

const input = (delvis: Partial<MondayVaernInput>): MondayVaernInput => ({
  authHeader: null,
  urlNoegle: null,
  signeringsSecret: SIGNERINGS_SECRET,
  urlSecret: URL_SECRET,
  ...delvis,
});

describe("afgoerMondayVaern — JWT-vejen (Authorization til stede)", () => {
  it("gyldig signatur → slipper igennem ad jwt-vejen", async () => {
    const token = await signeretToken(SIGNERINGS_SECRET);
    const dom = await afgoerMondayVaern(input({ authHeader: token }), verifyMondayJwt);
    expect(dom).toEqual({ ok: true, vej: "jwt" });
  });

  it("ugyldig signatur (signeret med anden secret) → 401 Unauthorized, error-log", async () => {
    const token = await signeretToken("en-anden-secret");
    const dom = await afgoerMondayVaern(input({ authHeader: token }), verifyMondayJwt);
    expect(dom).toEqual({
      ok: false, status: 401, fejl: "Unauthorized", logNiveau: "error", logTekst: "Invalid Monday.com webhook signature",
    });
  });

  it("header uden JWT-form → 401", async () => {
    const dom = await afgoerMondayVaern(input({ authHeader: "Bearer noget" }), verifyMondayJwt);
    expect(dom.ok).toBe(false);
    if (dom.ok === false) expect(dom.status).toBe(401);
  });

  it("header til stede, men MONDAY_SIGNING_SECRET ikke sat → 500 som før", async () => {
    const token = await signeretToken(SIGNERINGS_SECRET);
    const dom = await afgoerMondayVaern(input({ authHeader: token, signeringsSecret: undefined }), verifyMondayJwt);
    expect(dom).toEqual({
      ok: false, status: 500, fejl: "Server configuration error", logNiveau: "error",
      logTekst: "MONDAY_SIGNING_SECRET not configured — refusing to process webhook",
    });
  });

  it("header til stede → URL-parameteren er ligegyldig (rigtig eller forkert); kun signaturen afgør", async () => {
    const gyldig = await signeretToken(SIGNERINGS_SECRET);
    const ugyldig = await signeretToken("forkert");
    expect((await afgoerMondayVaern(input({ authHeader: gyldig, urlNoegle: "forkert" }), verifyMondayJwt)).ok).toBe(true);
    expect((await afgoerMondayVaern(input({ authHeader: ugyldig, urlNoegle: URL_SECRET }), verifyMondayJwt)).ok).toBe(false);
  });

  it("verificeringen gives ind: en stub afgør, og secret'en fra input sendes med", async () => {
    const kald: Array<[string, string]> = [];
    const stub = async (h: string, s: string) => { kald.push([h, s]); return true; };
    const dom = await afgoerMondayVaern(input({ authHeader: "x.y.z" }), stub);
    expect(dom).toEqual({ ok: true, vej: "jwt" });
    expect(kald).toEqual([["x.y.z", SIGNERINGS_SECRET]]);
  });
});

describe("afgoerMondayVaern — URL-vejen (ingen Authorization)", () => {
  it("rigtig hemmelighed i URL → slipper igennem ad url-vejen", async () => {
    const dom = await afgoerMondayVaern(input({ urlNoegle: URL_SECRET }), verifyMondayJwt);
    expect(dom).toEqual({ ok: true, vej: "url" });
  });

  it("forkert hemmelighed → 401 Unauthorized, warn-log", async () => {
    const dom = await afgoerMondayVaern(input({ urlNoegle: "0f3a9c-delt-hemmelighed-x" }), verifyMondayJwt);
    expect(dom).toEqual({
      ok: false, status: 401, fejl: "Unauthorized", logNiveau: "warn",
      logTekst: `Ingen Authorization-header og forkert ?${MONDAY_URL_PARAMETER}= i URL'en — afvist`,
    });
  });

  it("præfiks af hemmeligheden er forkert", async () => {
    const dom = await afgoerMondayVaern(input({ urlNoegle: URL_SECRET.slice(0, -1) }), verifyMondayJwt);
    expect(dom.ok).toBe(false);
  });

  it("ingen parameter (null) → 401 Unauthorized, warn-log", async () => {
    const dom = await afgoerMondayVaern(input({ urlNoegle: null }), verifyMondayJwt);
    expect(dom).toEqual({
      ok: false, status: 401, fejl: "Unauthorized", logNiveau: "warn",
      logTekst: `Ingen Authorization-header og ingen ?${MONDAY_URL_PARAMETER}= i URL'en — afvist`,
    });
  });

  it("tom parameter (?noegle=) → 401, samme som manglende", async () => {
    const dom = await afgoerMondayVaern(input({ urlNoegle: "" }), verifyMondayJwt);
    expect(dom.ok).toBe(false);
    if (dom.ok === false) expect(dom.status).toBe(401);
  });

  it("MONDAY_WEBHOOK_SECRET ikke sat → 500, aldrig sammenlignet mod tom", async () => {
    const dom = await afgoerMondayVaern(input({ urlNoegle: "", urlSecret: undefined }), verifyMondayJwt);
    expect(dom).toEqual({
      ok: false, status: 500, fejl: "Server configuration error", logNiveau: "error",
      logTekst: `${MONDAY_WEBHOOK_SECRET_NAVN} ikke sat — board-webhooken kan ikke autentificeres`,
    });
  });

  it("tom Authorization-header ('') behandles som manglende → URL-vejen", async () => {
    const dom = await afgoerMondayVaern(input({ authHeader: "", urlNoegle: URL_SECRET }), verifyMondayJwt);
    expect(dom).toEqual({ ok: true, vej: "url" });
  });
});

describe("navnene", () => {
  it("parameteren er kort og secret'en følger <INTEGRATION>_<FORMÅL>", () => {
    expect(MONDAY_URL_PARAMETER).toBe("noegle");
    expect(MONDAY_WEBHOOK_SECRET_NAVN).toBe("MONDAY_WEBHOOK_SECRET");
  });
});
