import { describe, expect, it, vi } from "vitest";
import {
  kald,
  KLAVIYO_BASE,
  KLAVIYO_REVISION,
  KLAVIYO_SECRET,
  noeglenErBrugbar,
  NOEGLE_PRAEFIKS,
  udfaldAfStatus,
} from "../../../supabase/functions/_shared/klaviyo.ts";
import {
  blevMedlem,
  brugbarMail,
  byggHaendelse,
  HAENDELSE,
  paabegyndt,
  sendHaendelse,
  sendt,
} from "../../../supabase/functions/_shared/klaviyoHaendelser.ts";

/**
 * Klaviyo-fundamentet (udkast 19/9-2026). Formen er MÅLT i Klaviyos egen
 * dokumentation; prøverne her låser den, så et skema-skift bliver en rød
 * prøve i stedet for en tavs 400'er i produktionen.
 */
const NOEGLE = "pk_0123456789abcdef";
const NU = new Date("2026-09-19T18:30:00.000Z");

/**
 * Kroppen er et dybt, ukendt JSON-træ; en navngiven hjælper er ærligere end
 * `any` spredt ud over prøverne, og eslint tillader ikke `any` her.
 */
type Json = { [n: string]: Json } | Json[] | string | number | boolean | null;
const felt = (v: unknown, sti: string): Json => sti.split(".").reduce<Json>((k, n) => (k as Record<string, Json>)?.[n], v as Json);

const svarer = (status: number, krop = "") =>
  vi.fn(async () => new Response(krop, { status })) as unknown as typeof fetch;

describe("klienten — målt mod Klaviyos dokumentation", () => {
  it("basen og revisionen er pinnet", () => {
    expect(KLAVIYO_BASE).toBe("https://a.klaviyo.com/api");
    expect(KLAVIYO_REVISION).toMatch(/^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/);
    expect(KLAVIYO_SECRET).toBe("KLAVIYO_API_KEY");
  });

  it("202 er OK — hændelser svarer «accepted», ikke «200»", () => {
    expect(udfaldAfStatus(202)).toBe("ok");
    expect(udfaldAfStatus(200)).toBe("ok");
  });

  it("hver fejlklasse har sit eget navn, så sporet kan læses", () => {
    expect(udfaldAfStatus(401)).toBe("noegle_afvist");
    expect(udfaldAfStatus(403)).toBe("noegle_afvist");
    expect(udfaldAfStatus(429)).toBe("loft");
    expect(udfaldAfStatus(400)).toBe("ugyldig");
    expect(udfaldAfStatus(422)).toBe("ugyldig");
    expect(udfaldAfStatus(500)).toBe("fejl");
  });

  it("en privat nøgle kendes på «pk_» — en offentlig afvises", () => {
    expect(noeglenErBrugbar(NOEGLE)).toBe(true);
    expect(noeglenErBrugbar("pk_x")).toBe(true);
    expect(noeglenErBrugbar(NOEGLE_PRAEFIKS)).toBe(false);
    expect(noeglenErBrugbar("XyZ123")).toBe(false);
    expect(noeglenErBrugbar(null)).toBe(false);
    expect(noeglenErBrugbar("")).toBe(false);
  });

  it("UDEN NØGLE sendes intet — og det er ikke en fejl", async () => {
    const f = svarer(202);
    const r = await kald(undefined, "/events/", { metode: "POST", krop: {}, fetchImpl: f });
    expect(r.ok).toBe(false);
    expect(r.spor.udfald).toBe("ingen_noegle");
    expect(r.spor.grund).toContain(KLAVIYO_SECRET);
    expect(f).not.toHaveBeenCalled();
  });

  it("sender de fire headere Klaviyo kræver — og aldrig nøglen i sporet", async () => {
    let set: RequestInit | undefined;
    const f = vi.fn(async (_u: string, i: RequestInit) => { set = i; return new Response("", { status: 202 }); });
    const r = await kald(NOEGLE, "/events/", { metode: "POST", krop: { a: 1 }, fetchImpl: f as unknown as typeof fetch });
    const h = set!.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Klaviyo-API-Key ${NOEGLE}`);
    expect(h.revision).toBe(KLAVIYO_REVISION);
    expect(h.accept).toBe("application/vnd.api+json");
    expect(h["content-type"]).toBe("application/vnd.api+json");
    expect(JSON.stringify(r.spor)).not.toContain(NOEGLE);
  });

  it("KASTER ALDRIG — hverken ved netværksfejl eller timeout", async () => {
    const kaster = vi.fn(async () => { throw new Error("netværket er væk"); }) as unknown as typeof fetch;
    const r = await kald(NOEGLE, "/events/", { fetchImpl: kaster });
    expect(r.ok).toBe(false);
    expect(r.spor.udfald).toBe("fejl");

    const afbryder = vi.fn(async () => { const e = new Error("afbrudt"); e.name = "AbortError"; throw e; }) as unknown as typeof fetch;
    const t = await kald(NOEGLE, "/events/", { fetchImpl: afbryder });
    expect(t.spor.udfald).toBe("timeout");
    expect(t.spor.grund).toContain("ms");
  });

  it("en 429 bliver til «loft», ikke til en almindelig fejl", async () => {
    const r = await kald(NOEGLE, "/events/", { fetchImpl: svarer(429, '{"errors":[]}') });
    expect(r.spor.udfald).toBe("loft");
    expect(r.spor.status).toBe(429);
  });

  it("GET læser JSON — så lag 3 kan hente flows uden at røre denne fil", async () => {
    const r = await kald<{ data: unknown[] }>(NOEGLE, "/flows/", { fetchImpl: svarer(200, '{"data":[{"id":"x"}]}') });
    expect(r.ok).toBe(true);
    expect(r.krop?.data).toHaveLength(1);
    expect(r.spor.sti).toBe("/flows/");
  });

  it("en tom 202-krop er ikke en fejl", async () => {
    const r = await kald(NOEGLE, "/events/", { metode: "POST", krop: {}, fetchImpl: svarer(202, "") });
    expect(r.ok).toBe(true);
    expect(r.krop).toBeNull();
  });
});

describe("hændelseskroppen — ordret Klaviyos skema", () => {
  it("har den form dokumentationen beskriver", () => {
    const k = byggHaendelse({ metric: HAENDELSE.sendt, email: "A@X.dk", uniktId: "abc", egenskaber: { kilde: "webinar" }, tid: NU });
    expect(felt(k, "data.type")).toBe("event");
    expect(felt(k, "data.attributes.metric.data.type")).toBe("metric");
    expect(felt(k, "data.attributes.metric.data.attributes.name")).toBe("Ansoegning sendt");
    expect(felt(k, "data.attributes.profile.data.type")).toBe("profile");
    expect(felt(k, "data.attributes.profile.data.attributes.email")).toBe("a@x.dk");
    expect(felt(k, "data.attributes.unique_id")).toBe("abc");
    expect(felt(k, "data.attributes.time")).toBe("2026-09-19T18:30:00.000Z");
    expect(felt(k, "data.attributes.properties")).toEqual({ kilde: "webinar" });
  });

  it("tomme egenskaber UDELADES — «ingen branche» er ikke et segment", () => {
    const k = byggHaendelse({
      metric: HAENDELSE.sendt, email: "a@x.dk", uniktId: "1",
      egenskaber: { kilde: "webinar", branche: null, omsaetningsinterval: undefined, antal_ansatte: 0, note: "  " },
    });
    expect(felt(k, "data.attributes.properties")).toEqual({ kilde: "webinar", antal_ansatte: 0 });
  });

  it("de tre hændelser har hver sit navn og sit unikke id", () => {
    expect(paabegyndt("a1", "a@x.dk", "webinar").metric).toBe("Ansoegning paabegyndt");
    expect(sendt("a1", "a@x.dk", { kilde: "webinar", branche: "Bygge", omsaetningsinterval: "C", antal_ansatte: 7 }).metric).toBe("Ansoegning sendt");
    expect(blevMedlem("c1", "2027-09-19", "a@x.dk", 5_000_000).metric).toBe("Blev medlem");
  });

  it("«paabegyndt» og «sendt» deler id men ikke metric — Klaviyos nøgle er (profil, metric, id)", () => {
    expect(paabegyndt("a1", "a@x.dk", null).uniktId).toBe(sendt("a1", "a@x.dk", { kilde: null, branche: null, omsaetningsinterval: null, antal_ansatte: null }).uniktId);
    expect(paabegyndt("a1", "a@x.dk", null).metric).not.toBe(HAENDELSE.sendt);
  });

  it("«Blev medlem» får samme id ved en GENSENDELSE og et nyt ved fornyelse", () => {
    expect(blevMedlem("c1", "2027-09-19", "a@x.dk", 1).uniktId).toBe(blevMedlem("c1", "2027-09-19", "a@x.dk", 1).uniktId);
    expect(blevMedlem("c1", "2028-09-19", "a@x.dk", 1).uniktId).not.toBe(blevMedlem("c1", "2027-09-19", "a@x.dk", 1).uniktId);
  });

  it("prisniveauet sendes i KRONER, ikke i øre", () => {
    expect(blevMedlem("c1", "2027-09-19", "a@x.dk", 5_000_000).egenskaber).toEqual({ prisniveau_kr: 50_000 });
    expect(blevMedlem("c1", "2027-09-19", "a@x.dk", null).egenskaber).toEqual({ prisniveau_kr: null });
  });
});

describe("sporet — også det der IKKE blev sendt", () => {
  // Signaturen på `insert` er eksplicit: uden den bliver `mock.calls[0][0]`
  // til en TOM tuple for tsc (TS2493), selv om prøven kører fint i vitest.
  const skriver = (fejl: { message: string } | null = null) => {
    const insert = vi.fn(async (_raekke: Record<string, unknown>) => ({ error: fejl }));
    return { from: vi.fn((_tabel: string) => ({ insert })), insert };
  };

  it("skriver en række med det sendte og Klaviyos svar", async () => {
    const s = skriver();
    await sendHaendelse(s, NOEGLE, paabegyndt("a1", "a@x.dk", "webinar", NU), { fetchImpl: svarer(202) });
    expect(s.from).toHaveBeenCalledWith("klaviyo_haendelser");
    const r = s.insert.mock.calls[0][0];
    expect(r).toMatchObject({ metric: "Ansoegning paabegyndt", email: "a@x.dk", unikt_id: "a1", udfald: "ok", status: 202 });
    expect(felt(r.sendt, "data.type")).toBe("event");
  });

  it("skriver ogsÅ når nøglen mangler — «ingen hændelser» må kunne skelnes fra «afvist»", async () => {
    const s = skriver();
    const r = await sendHaendelse(s, undefined, paabegyndt("a1", "a@x.dk", null), { fetchImpl: svarer(202) });
    expect(r.sendt).toBe(false);
    expect(s.insert.mock.calls[0][0].udfald).toBe("ingen_noegle");
  });

  it("en fejlet LOGNING stopper ikke kalderen", async () => {
    const fejl = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = skriver({ message: "tabellen findes ikke" });
    await expect(sendHaendelse(s, NOEGLE, paabegyndt("a1", "a@x.dk", null), { fetchImpl: svarer(202) })).resolves.toMatchObject({ sendt: true });
    expect(fejl).toHaveBeenCalled();
    fejl.mockRestore();
  });

  it("uden en skriver sendes hændelsen stadig", async () => {
    const r = await sendHaendelse(null, NOEGLE, paabegyndt("a1", "a@x.dk", null), { fetchImpl: svarer(202) });
    expect(r.sendt).toBe(true);
  });
});

// ── «ingen_mail»: den tavse sti, målt i prod 19/9 kl. 22.22 ───────────────

describe("uden mail sendes intet — men det LOGGES", () => {
  const skriver = () => {
    const insert = vi.fn(async (_r: Record<string, unknown>) => ({ error: null }));
    return { from: vi.fn((_t: string) => ({ insert })), insert };
  };

  it("brugbarMail afviser tom, whitespace og noget uden snabel-a", () => {
    expect(brugbarMail("A@X.dk")).toBe("a@x.dk");
    expect(brugbarMail("  a@x.dk  ")).toBe("a@x.dk");
    expect(brugbarMail("")).toBeNull();
    expect(brugbarMail("   ")).toBeNull();
    expect(brugbarMail("ikke en mail")).toBeNull();
    expect(brugbarMail(null)).toBeNull();
    expect(brugbarMail(undefined)).toBeNull();
  });

  it("DEN FEJL DER VAR: uden mail blev der hverken sendt eller logget — nu logges der", async () => {
    const s = skriver();
    const f = svarer(202);
    const r = await sendHaendelse(s, NOEGLE, paabegyndt("a1", "", null), { fetchImpl: f });
    expect(r.sendt).toBe(false);
    expect(r.spor.udfald).toBe("ingen_mail");
    expect(f).not.toHaveBeenCalled();
    // …og rækken FINDES.
    expect(s.insert).toHaveBeenCalledTimes(1);
    const raekke = s.insert.mock.calls[0][0];
    expect(raekke).toMatchObject({ metric: "Ansoegning paabegyndt", unikt_id: "a1", udfald: "ingen_mail", email: "" });
    expect(raekke.grund).toContain("ingen mailadresse");
  });

  it("rækken bærer metric og id, så det kan ses HVAD der ikke blev sendt", async () => {
    const s = skriver();
    await sendHaendelse(s, NOEGLE, blevMedlem("c1", "2027-09-19", "", 5_000_000), { fetchImpl: svarer(202) });
    const raekke = s.insert.mock.calls[0][0];
    expect(raekke.metric).toBe("Blev medlem");
    expect(raekke.unikt_id).toBe("c1:2027-09-19");
    expect(felt(raekke.sendt, "ikke_sendt")).toBe("ingen_mail");
  });

  it("«ingen_mail» og «ingen_noegle» er FORSKELLIGE udfald — de har forskellige årsager", async () => {
    const udenMail = await sendHaendelse(null, NOEGLE, paabegyndt("a1", "", null), { fetchImpl: svarer(202) });
    const udenNoegle = await sendHaendelse(null, undefined, paabegyndt("a1", "a@x.dk", null), { fetchImpl: svarer(202) });
    expect(udenMail.spor.udfald).toBe("ingen_mail");
    expect(udenNoegle.spor.udfald).toBe("ingen_noegle");
  });

  it("mailen normaliseres ÉN gang — kroppen og sporet er enige", async () => {
    const s = skriver();
    await sendHaendelse(s, NOEGLE, paabegyndt("a1", "  A@X.DK ", null), { fetchImpl: svarer(202) });
    const raekke = s.insert.mock.calls[0][0];
    expect(raekke.email).toBe("a@x.dk");
    expect(felt(raekke.sendt, "data.attributes.profile.data.attributes.email")).toBe("a@x.dk");
  });

  it("KASTER STADIG ALDRIG, når logningen af «ingen_mail» fejler", async () => {
    const fejl = vi.spyOn(console, "error").mockImplementation(() => {});
    const s = { from: vi.fn((_t: string) => ({ insert: vi.fn(async (_r: Record<string, unknown>) => ({ error: { message: "nede" } })) })) };
    await expect(sendHaendelse(s, NOEGLE, paabegyndt("a1", "", null), { fetchImpl: svarer(202) })).resolves.toMatchObject({ sendt: false });
    fejl.mockRestore();
  });
});
