import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import {
  parseTV1Header,
  STRIPE_TOLERANCE_SEK,
  verificerTV1Signatur,
} from "../../../supabase/functions/_shared/webhookSignatur.ts";

// C7/F1 (30/9-2026): Stripe/Calendly-signaturen i konstant tid, alle v1, og
// Stripes 300 s-vindue.
const SECRET = "whsec_test_hemmelighed";
const BODY = '{"id":"evt_1","type":"invoice.paid"}';
const NU = 1_790_000_000;
const signer = (t: number, body = BODY, secret = SECRET) =>
  createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

describe("parseTV1Header", () => {
  it("læser t og ALLE v1", () => {
    expect(parseTV1Header("t=1,v1=AA,v0=x,v1=bb")).toEqual({ t: "1", v1: ["aa", "bb"] });
  });
  it("null uden t eller v1", () => {
    expect(parseTV1Header("v1=aa")).toBeNull();
    expect(parseTV1Header("t=1")).toBeNull();
    expect(parseTV1Header("")).toBeNull();
    expect(parseTV1Header(null)).toBeNull();
  });
});

describe("verificerTV1Signatur", () => {
  const kald = (header: string | null, opts: { nuSek?: number; toleranceSek?: number | null; secret?: string | null; body?: string } = {}) =>
    verificerTV1Signatur({
      payload: opts.body ?? BODY,
      header,
      secret: opts.secret === undefined ? SECRET : opts.secret,
      nuSek: opts.nuSek ?? NU,
      toleranceSek: opts.toleranceSek === undefined ? STRIPE_TOLERANCE_SEK : opts.toleranceSek,
    });

  it("Stripes tolerance er SDK'ens 300 s", () => {
    expect(STRIPE_TOLERANCE_SEK).toBe(300);
  });

  it("ægte, frisk signatur → ok", async () => {
    expect(await kald(`t=${NU},v1=${signer(NU)}`)).toEqual({ ok: true, alderSek: 0 });
  });

  it("den anden v1 (nøglerotation) matcher også", async () => {
    expect(await kald(`t=${NU},v1=${"0".repeat(64)},v1=${signer(NU)}`)).toMatchObject({ ok: true });
  });

  it("forkert signatur, anden body eller anden hemmelighed → matcher_ikke", async () => {
    expect(await kald(`t=${NU},v1=${"0".repeat(64)}`)).toEqual({ ok: false, grund: "matcher_ikke" });
    expect(await kald(`t=${NU},v1=${signer(NU)}`, { body: BODY + " " })).toEqual({ ok: false, grund: "matcher_ikke" });
    expect(await kald(`t=${NU},v1=${signer(NU, BODY, "anden")}`)).toEqual({ ok: false, grund: "matcher_ikke" });
    // Tidsstemplet er en del af det signerede: et byttet t matcher ikke.
    expect(await kald(`t=${NU + 1},v1=${signer(NU)}`)).toEqual({ ok: false, grund: "matcher_ikke" });
  });

  it("tidsvinduet: 300 s gammel ok, 301 s afvist (nu − t > tolerance)", async () => {
    const t = NU - 300;
    expect(await kald(`t=${t},v1=${signer(t)}`)).toEqual({ ok: true, alderSek: 300 });
    const gl = NU - 301;
    expect(await kald(`t=${gl},v1=${signer(gl)}`)).toEqual({ ok: false, grund: "for_gammel", alderSek: 301 });
  });

  it("uden tolerance (Calendly) afvises en gammel besked ikke — alderen returneres", async () => {
    const t = NU - 86_400;
    expect(await kald(`t=${t},v1=${signer(t)}`, { toleranceSek: null })).toEqual({ ok: true, alderSek: 86_400 });
  });

  it("forfalsket OG gammel → matcher_ikke (signaturen dømmes før tiden)", async () => {
    expect(await kald(`t=${NU - 10_000},v1=${"a".repeat(64)}`)).toEqual({ ok: false, grund: "matcher_ikke" });
  });

  it("manglende hemmelighed, header eller form → afvist", async () => {
    expect(await kald(`t=${NU},v1=${signer(NU)}`, { secret: "" })).toEqual({ ok: false, grund: "ingen_hemmelighed" });
    expect(await kald(`t=${NU},v1=${signer(NU)}`, { secret: null })).toEqual({ ok: false, grund: "ingen_hemmelighed" });
    expect(await kald(null)).toEqual({ ok: false, grund: "ingen_header" });
    expect(await kald(`v1=${signer(NU)}`)).toEqual({ ok: false, grund: "header_uden_t_eller_v1" });
    expect(await kald(`t=abc,v1=${signer(NU)}`)).toEqual({ ok: false, grund: "ugyldigt_tidsstempel" });
  });
});
