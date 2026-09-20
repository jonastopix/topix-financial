import { describe, expect, it } from "vitest";
import {
  byggRegistrant, byggSignaturHeadere, erProeveId, erTrin, FORVENTET,
  KENDTE_FELTER, PROEVE_PRAEFIKS, PROEVE_WEBINAR_ID, TRIN, PROEVE_SESSION_STANDARD,
} from "../../../supabase/functions/_shared/ewebinarProeve";
import { hmacSha256Hex, noegleformer, verifyEwebinarSignature } from "../../../supabase/functions/_shared/ewebinarSignatur";
import { plukTilmelding, doemSetGrad } from "../../../supabase/functions/_shared/webinarDom";
import { afgoerOvergang } from "../../../supabase/functions/_shared/webinarHaendelser";

const NU = new Date("2026-09-20T09:00:00.000Z");

describe("ewebinarProeve — låsen: den er ikke et signerings-orakel", () => {
  it("kun id'er, der siger de er prøver, passerer", () => {
    expect(erProeveId("PROEVE-fremmoede-01")).toBe(true);
    expect(erProeveId("PROEVE-")).toBe(false);
    expect(erProeveId("abc123")).toBe(false);
    expect(erProeveId("proeve-01")).toBe(false);
    expect(erProeveId("PROEVE-med mellemrum")).toBe(false);
    expect(erProeveId(42)).toBe(false);
    expect(erProeveId(null)).toBe(false);
  });

  it("webinarId er fastlåst — kalderen kan ikke vælge et rigtigt webinar", () => {
    for (const trin of TRIN) {
      const r = byggRegistrant(trin, "PROEVE-x", "a@b.dk", NU);
      expect(r.webinarId).toBe(PROEVE_WEBINAR_ID);
      expect(String(r.webinarId).startsWith(PROEVE_PRAEFIKS)).toBe(true);
    }
  });

  it("kun tre felter forstås; trin er lukket", () => {
    expect(KENDTE_FELTER).toEqual(["trin", "email", "registrant_id", "session_tid"]);
    expect(erTrin("deltog")).toBe(true);
    expect(erTrin("Deltog")).toBe(false);
    expect(erTrin("set")).toBe(false);
  });
});

describe("ewebinarProeve — kroppen læses af webhookens egen pluk og dom", () => {
  it("tilmeldt: pluk → tilmeldt-grad før sessionen → ingen overgang", () => {
    // Standard-sessionen er NU — «tilmeldt» kræver en tid i fremtiden, givet eksplicit.
    const pluk = plukTilmelding(byggRegistrant("tilmeldt", "PROEVE-x", "A@B.dk", NU, "2026-09-22T10:00:00.000Z"));
    expect(pluk.ok).toBe(true);
    if (!pluk.ok) return;
    expect(pluk.tilmelding.email).toBe("a@b.dk");
    const grad = doemSetGrad(pluk.tilmelding, NU);
    expect(grad).toBe("tilmeldt");
    expect(afgoerOvergang(null, grad)).toBe(FORVENTET.tilmeldt);
  });

  it("deltog: 82 % → set → «deltog»", () => {
    const pluk = plukTilmelding(byggRegistrant("deltog", "PROEVE-x", "a@b.dk", NU));
    expect(pluk.ok).toBe(true);
    if (!pluk.ok) return;
    expect(pluk.tilmelding.set_procent).toBe(82);
    const grad = doemSetGrad(pluk.tilmelding, NU);
    expect(grad).toBe("set");
    expect(afgoerOvergang("tilmeldt", grad)).toBe(FORVENTET.deltog);
  });

  it("moedte_ikke: Missed → moedte_ikke → «moedte_ikke»", () => {
    const pluk = plukTilmelding(byggRegistrant("moedte_ikke", "PROEVE-y", "a@b.dk", NU));
    expect(pluk.ok).toBe(true);
    if (!pluk.ok) return;
    const grad = doemSetGrad(pluk.tilmelding, NU);
    expect(grad).toBe("moedte_ikke");
    expect(afgoerOvergang(null, grad)).toBe(FORVENTET.moedte_ikke);
  });
});

describe("ewebinarProeve — sessionstiden er et parameter (C's §0.5)", () => {
  it("standard er NU — ikke en dato ude i fremtiden", () => {
    expect(byggRegistrant("deltog", "PROEVE-x", "a@b.dk", NU).sessionTime).toBe(NU.toISOString());
    expect(PROEVE_SESSION_STANDARD(NU)).toBe(NU.toISOString());
  });
  it("en session en time tilbage går igennem uændret — det er filter-prøven", () => {
    const enTimeSiden = new Date(NU.getTime() - 3_600_000).toISOString();
    const r = byggRegistrant("deltog", "PROEVE-fremmoede-03", "a@b.dk", NU, enTimeSiden);
    expect(r.sessionTime).toBe(enTimeSiden);
    const pluk = plukTilmelding(r);
    expect(pluk.ok && doemSetGrad(pluk.tilmelding, NU)).toBe("set");
  });
  it("med standard-session er «tilmeldt» ukendt, ikke tilmeldt — og sender stadig intet", () => {
    const pluk = plukTilmelding(byggRegistrant("tilmeldt", "PROEVE-x", "a@b.dk", NU));
    expect(pluk.ok && doemSetGrad(pluk.tilmelding, NU)).toBe("ukendt");
    expect(afgoerOvergang(null, "ukendt")).toBe(FORVENTET.tilmeldt);
  });
});

describe("ewebinarProeve — signeringen og verifikationen er ENIGE", () => {
  // Det er den prøve, der betyder noget: functionen signerer med
  // hmacSha256Hex + noegleformer[0]; webhooken verificerer med
  // verifyEwebinarSignature. Er de to uenige, får Jonas 401 tirsdag formiddag
  // i stedet for et svar — og det skal ses HER, ikke dér.
  const signer = async (secret: string, raa: string, t: string) =>
    hmacSha256Hex(noegleformer(secret)[0].bytes, `${t}.${raa}`);

  it("en utf8-nøgle: signeret her, godkendt af webhookens verifikation", async () => {
    const secret = "en-hemmelighed-der-ikke-er-hex";
    const raa = JSON.stringify(byggRegistrant("deltog", "PROEVE-x", "a@b.dk", NU));
    const t = "1789900000";
    const hex = await signer(secret, raa, t);
    const h = byggSignaturHeadere(t, hex);
    const dom = await verifyEwebinarSignature({
      rawBody: raa, signaturHeader: h["X-EWebinar-Signature"], tidsstempelHeader: h["X-EWebinar-Timestamp"], secret,
    });
    expect(dom).toEqual({ ok: true, form: "utf8", t });
  });

  it("en hex-nøgle (eWebinars form): stadig godkendt — verifikationen prøver utf8 først", async () => {
    const secret = "a3f1c9e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8";
    const raa = JSON.stringify(byggRegistrant("tilmeldt", "PROEVE-x", "a@b.dk", NU));
    const t = "1789900001";
    const hex = await signer(secret, raa, t);
    const h = byggSignaturHeadere(t, hex);
    const dom = await verifyEwebinarSignature({
      rawBody: raa, signaturHeader: h["X-EWebinar-Signature"], tidsstempelHeader: h["X-EWebinar-Timestamp"], secret,
    });
    expect(dom.ok).toBe(true);
  });

  it("en GENSERIALISERET krop afvises — derfor signeres og sendes samme rå streng", async () => {
    const secret = "hemmelighed";
    const obj = byggRegistrant("deltog", "PROEVE-x", "a@b.dk", NU);
    const raa = JSON.stringify(obj);
    const t = "1789900002";
    const hex = await signer(secret, raa, t);
    const andenRaekkefoelge = JSON.stringify({ ...obj, id: obj.id }); // samme indhold, ny streng?
    const omskrevet = JSON.stringify(JSON.parse(raa), null, 2);       // helt sikkert en anden streng
    const dom = await verifyEwebinarSignature({
      rawBody: omskrevet, signaturHeader: `t=${t},v1=${hex}`, tidsstempelHeader: t, secret,
    });
    expect(dom.ok).toBe(false);
    expect(andenRaekkefoelge).toBe(raa); // spread bevarer rækkefølgen — det er derfor den første ER den samme
  });

  it("forkert nøgle afvises", async () => {
    const raa = JSON.stringify(byggRegistrant("deltog", "PROEVE-x", "a@b.dk", NU));
    const t = "1789900003";
    const hex = await signer("rigtig", raa, t);
    const dom = await verifyEwebinarSignature({ rawBody: raa, signaturHeader: `t=${t},v1=${hex}`, tidsstempelHeader: t, secret: "forkert" });
    expect(dom).toEqual({ ok: false, grund: "matcher_ikke" });
  });
});
