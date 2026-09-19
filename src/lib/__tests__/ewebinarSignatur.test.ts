/**
 * ewebinarSignatur (udkast 19/9): beviset for at en besked er fra eWebinar.
 * HMAC-SHA256 over «<tidsstempel>.<rå body>», header «t=<unix>,v1=<hex>».
 * Testene regner selv den rigtige signatur med webcrypto og prøver så
 * alle måder den kan være forkert på — og de to nøgleformer (UTF-8-streng
 * og afkodet hex), som ikke er målt endnu (README §5).
 */
import { describe, expect, it } from "vitest";
import { hmacSha256Hex, noegleformer, parseSignaturHeader, verifyEwebinarSignature } from "../../../supabase/functions/_shared/ewebinarSignatur.ts";

const HEX_SECRET = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const ORD_SECRET = "whsec_ikke_hex_men_en_streng";
const BODY = '{"id":"abCD1234Efg56","email":"John.Doe@defaultmail.com","action":"Registered","webinarId":14166}';
const T = "1758283200";

async function signer(secret: string, form: "utf8" | "hex", t: string, body: string): Promise<string> {
  const noegle = noegleformer(secret).find((n) => n.form === form)!;
  return hmacSha256Hex(noegle.bytes, `${t}.${body}`);
}

describe("parseSignaturHeader", () => {
  it("læser t og v1, tåler mellemrum, gør v1 til små bogstaver", () => {
    expect(parseSignaturHeader("t=123,v1=ABCDEF")).toEqual({ t: "123", v1: "abcdef" });
    expect(parseSignaturHeader(" t=123 , v1=ab ")).toEqual({ t: "123", v1: "ab" });
  });
  it("null/tom/uden t eller v1 → null", () => {
    expect(parseSignaturHeader(null)).toBeNull();
    expect(parseSignaturHeader("")).toBeNull();
    expect(parseSignaturHeader("v1=ab")).toBeNull();
    expect(parseSignaturHeader("t=1")).toBeNull();
  });
});

describe("noegleformer", () => {
  it("en hex-hemmelighed af lige længde ≥ 32 giver to former (utf8 først, så hex som 32 bytes)", () => {
    const f = noegleformer(HEX_SECRET);
    expect(f.map((x) => x.form)).toEqual(["utf8", "hex"]);
    expect(f[0].bytes.length).toBe(64);
    expect(f[1].bytes.length).toBe(32);
  });
  it("en almindelig streng giver kun utf8", () => {
    expect(noegleformer(ORD_SECRET).map((x) => x.form)).toEqual(["utf8"]);
    expect(noegleformer("abc").map((x) => x.form)).toEqual(["utf8"]);
  });
});

describe("verifyEwebinarSignature", () => {
  it("rigtig signatur med tidsstemplet i sin egen header → ok, form utf8, t fra headeren", async () => {
    const v1 = await signer(HEX_SECRET, "utf8", T, BODY);
    const dom = await verifyEwebinarSignature({ rawBody: BODY, signaturHeader: `t=${T},v1=${v1}`, tidsstempelHeader: T, secret: HEX_SECRET });
    expect(dom).toEqual({ ok: true, form: "utf8", t: T });
  });

  it("uden X-EWebinar-Timestamp bruges t= fra signaturen", async () => {
    const v1 = await signer(HEX_SECRET, "utf8", T, BODY);
    const dom = await verifyEwebinarSignature({ rawBody: BODY, signaturHeader: `t=${T},v1=${v1}`, tidsstempelHeader: null, secret: HEX_SECRET });
    expect(dom).toEqual({ ok: true, form: "utf8", t: T });
  });

  it("er hemmeligheden hex og eWebinar signerede med de rå bytes, matcher form hex", async () => {
    const v1 = await signer(HEX_SECRET, "hex", T, BODY);
    const dom = await verifyEwebinarSignature({ rawBody: BODY, signaturHeader: `t=${T},v1=${v1.toUpperCase()}`, tidsstempelHeader: T, secret: HEX_SECRET });
    expect(dom).toEqual({ ok: true, form: "hex", t: T });
  });

  it("headeren og t= forskellige: headeren prøves først, t= dækker hvis den er den signerede", async () => {
    const v1 = await signer(ORD_SECRET, "utf8", T, BODY);
    const dom = await verifyEwebinarSignature({ rawBody: BODY, signaturHeader: `t=${T},v1=${v1}`, tidsstempelHeader: "999", secret: ORD_SECRET });
    expect(dom).toEqual({ ok: true, form: "utf8", t: T });
  });

  it("afviser: ingen header, header uden v1, forkert hemmelighed, ændret body, ændret tidsstempel, genserialiseret body", async () => {
    const v1 = await signer(HEX_SECRET, "utf8", T, BODY);
    const ok = { rawBody: BODY, signaturHeader: `t=${T},v1=${v1}`, tidsstempelHeader: T, secret: HEX_SECRET };
    expect(await verifyEwebinarSignature({ ...ok, signaturHeader: null })).toEqual({ ok: false, grund: "ingen_header" });
    expect(await verifyEwebinarSignature({ ...ok, signaturHeader: `t=${T}` })).toEqual({ ok: false, grund: "header_uden_t_eller_v1" });
    expect(await verifyEwebinarSignature({ ...ok, secret: ORD_SECRET })).toEqual({ ok: false, grund: "matcher_ikke" });
    expect(await verifyEwebinarSignature({ ...ok, rawBody: BODY.replace("Registered", "Watched") })).toEqual({ ok: false, grund: "matcher_ikke" });
    expect(await verifyEwebinarSignature({ ...ok, tidsstempelHeader: "1", signaturHeader: `t=1,v1=${v1}` })).toEqual({ ok: false, grund: "matcher_ikke" });
    // Genserialisering (mellemrum efter kolon) er en ANDEN body — det er derfor webhooken læser req.text().
    expect(await verifyEwebinarSignature({ ...ok, rawBody: JSON.stringify(JSON.parse(BODY), null, 1) })).toEqual({ ok: false, grund: "matcher_ikke" });
  });
});
