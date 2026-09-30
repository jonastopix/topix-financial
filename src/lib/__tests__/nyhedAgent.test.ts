import { describe, expect, it } from "vitest";
import {
  afgoerOvergang,
  byggDokument,
  dokumentTekst,
  FEED_FRIST_MS,
  FEED_MAKS_BYTES,
  filtrerVaerter,
  FORAELDET_TAG_MS,
  JOB_TIMEOUT_MS,
  KILDER,
  laesKropMedLoft,
  LINK_MOENSTER,
  linksIDokument,
  LLM_TIMEOUT_MS,
  MAKS_LLM_KALD,
  MAKS_PUNKTER,
  MARGIN_MS,
  maaStarteLlmKald,
  normaliserUrl,
  paaVaertslisten,
  parseFeed,
  rensTekst,
  talIkkeIKilden,
  talITekst,
  traadFraForsoeget,
  traadKanKnyttes,
  type TraadSpor,
  udvaelgIVindue,
  ugeNoegle,
  vaelgTilUdkast,
  validerUdkast,
  validerVurderinger,
  type Kandidat,
} from "../../../supabase/functions/_shared/nyhedAgent";
import { parseCommunityDokument } from "@/lib/hjemmebane/communityDokument";

// Motoren for nyhedsagenten, skive 1 (30/9-2026). Kildeværnet står i nyhedAgent.guard.test.ts.

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Nyheder og releases fra nemhandel.dk</title>
<item><title>E-fakturering bliver den nye f&#230;lles m&aring;de at fakturere</title>
<link>https://nemhandel.dk/nyheder/e-fakturering?utm_source=rss&amp;x=1#top</link>
<description><![CDATA[<p>Fra 1. januar 2027 skal <b>alle</b> virksomheder kunne modtage e-fakturaer.</p>]]></description>
<pubDate>Mon, 28 Sep 2026 08:00:00 +0200</pubDate></item>
<item><title>Uden link</title><description>x</description><pubDate>Mon, 28 Sep 2026 08:00:00 +0200</pubDate></item>
<item><title>Servicevindue</title><link>https://nemhandel.dk/s</link><pubDate>Fri, 04 Sep 2026 10:00:00 +0200</pubDate></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Høringsportalen - Høringer for Erhvervsstyrelsen</title>
<entry><title type="text">Høring over bekendtgørelse om sikkerhed for gasinstallationer</title>
<link rel="alternate" href="https://hoeringsportalen.dk/Hearing/Details/70123" />
<updated>2026-09-24T10:00:00Z</updated>
<summary type="html">&lt;p&gt;Høringsfrist 22. oktober 2026&lt;/p&gt;</summary></entry>
</feed>`;

const NU = new Date("2026-09-28T04:40:00Z"); // mandag 06:40 dansk

describe("feed-parseren", () => {
  it("RSS 2.0: entiteter, CDATA og HTML ud; utm og fragment væk; et emne uden link kasseres", () => {
    const e = parseFeed(RSS, "nemhandel");
    expect(e).toHaveLength(2);
    expect(e[0].titel).toBe("E-fakturering bliver den nye fælles måde at fakturere");
    expect(e[0].url).toBe("https://nemhandel.dk/nyheder/e-fakturering?x=1");
    expect(e[0].resume).toBe("Fra 1. januar 2027 skal alle virksomheder kunne modtage e-fakturaer.");
    expect(e[0].udgivet).toBe("2026-09-28T06:00:00.000Z");
  });
  it("Atom: link rel=alternate, updated som dato, dobbeltkodet HTML i summary", () => {
    const e = parseFeed(ATOM, "hoering_erst");
    expect(e).toHaveLength(1);
    expect(e[0].url).toBe("https://hoeringsportalen.dk/Hearing/Details/70123");
    expect(e[0].resume).toBe("Høringsfrist 22. oktober 2026");
    expect(e[0].udgivet).toBe("2026-09-24T10:00:00.000Z");
  });
  it("normaliserUrl: http → https, andet end http(s) → null", () => {
    expect(normaliserUrl("http://Example.DK/a?utm_medium=x")).toBe("https://example.dk/a");
    expect(normaliserUrl("javascript:alert(1)")).toBeNull();
    expect(normaliserUrl("ikke en url")).toBeNull();
  });
  it("rensTekst fjerner kontroltegn og samler mellemrum", () => {
    expect(rensTekst("a\u0000  b\n\tc")).toBe("a b c");
  });
  it("vinduet: 8 dage bagud, uden dato tælles og tages ikke", () => {
    const v = udvaelgIVindue([...parseFeed(RSS, "nemhandel"), { kilde: "x", titel: "t", url: "https://x.dk", resume: "", udgivet: null }], NU);
    expect(v.valgt.map((e) => e.titel)).toEqual(["E-fakturering bliver den nye fælles måde at fakturere"]);
    expect(v.uden_dato).toBe(1);
    expect(v.uden_for_vindue).toBe(1);
  });
});

describe("kilderne", () => {
  it("hver kilde har https-URL, navn, hvorfor og en måling — og nøglerne er unikke", () => {
    expect(KILDER.length).toBeGreaterThanOrEqual(3);
    for (const k of KILDER) {
      expect(k.url.startsWith("https://")).toBe(true);
      expect(k.navn.length).toBeGreaterThan(0);
      expect(k.hvorfor.length).toBeGreaterThan(20);
      expect(k.maalt).toMatch(/WebFetch 30\/9-2026: gyldigt (RSS|Atom)/);
    }
    expect(new Set(KILDER.map((k) => k.noegle)).size).toBe(KILDER.length);
  });
  it("hver kilde har en ikke-tom værtsliste med små bogstaver (fund 3)", () => {
    for (const k of KILDER) {
      expect(k.vaerter.length).toBeGreaterThan(0);
      for (const v of k.vaerter) expect(v).toBe(v.toLowerCase());
    }
  });
});

describe("værtslisten (fund 3)", () => {
  it("præcis match på værtsnavnet; en anden vært, en undervært og et ugyldigt link er et nej", () => {
    expect(paaVaertslisten("https://nemhandel.dk/nyheder/x", ["nemhandel.dk"])).toBe(true);
    expect(paaVaertslisten("https://NEMHANDEL.dk/x", ["nemhandel.dk"])).toBe(true);
    expect(paaVaertslisten("https://evil.dk/nemhandel.dk", ["nemhandel.dk"])).toBe(false);
    expect(paaVaertslisten("https://nemhandel.dk.evil.dk/x", ["nemhandel.dk"])).toBe(false);
    expect(paaVaertslisten("https://version2.dk/artikel/x", ["www.version2.dk"])).toBe(false);
    expect(paaVaertslisten("ikke en url", ["nemhandel.dk"])).toBe(false);
  });
  it("filtrerVaerter kasserer emner med fremmed vært og tæller dem", () => {
    const e = parseFeed(RSS, "nemhandel");
    const fremmed = { ...e[0], url: "https://phishing.example/e-faktura" };
    const d = filtrerVaerter([...e, fremmed], ["nemhandel.dk"]);
    expect(d.godkendt).toHaveLength(e.length);
    expect(d.kasseret).toBe(1);
    expect(d.godkendt.some((x) => x.url.includes("phishing"))).toBe(false);
  });
});

/** En strøm med de givne bidder (bytes). */
const stroem = (bidder: Uint8Array[]) => new ReadableStream<Uint8Array>({
  start(c) { for (const b of bidder) c.enqueue(b); c.close(); },
});

describe("feed-kroppen: loft og frist (fund 8)", () => {
  it("loftet er 2 MB, og fristen er 2 × 10 000 + 500 ms", () => {
    expect(FEED_MAKS_BYTES).toBe(2 * 1024 * 1024);
    expect(FEED_FRIST_MS).toBe(20_500);
  });
  it("en krop under loftet læses hel (også æøå over bidgrænser)", async () => {
    const b = new TextEncoder().encode("<rss>æøå</rss>");
    const d = await laesKropMedLoft(stroem([b.slice(0, 6), b.slice(6)]), 1000, Date.now() + 10_000);
    expect(d).toEqual({ ok: true, tekst: "<rss>æøå</rss>" });
  });
  it("én byte over loftet kasserer HELE kroppen", async () => {
    const d = await laesKropMedLoft(stroem([new Uint8Array(600), new Uint8Array(401)]), 1000, Date.now() + 10_000);
    expect(d).toEqual({ ok: false, fejl: "for_stor" });
    const præcis = await laesKropMedLoft(stroem([new Uint8Array(600), new Uint8Array(400)]), 1000, Date.now() + 10_000);
    expect(præcis.ok).toBe(true);
  });
  it("fristen passeret før læsningen → for_langsom", async () => {
    const d = await laesKropMedLoft(stroem([new Uint8Array(1)]), 1000, 1000, () => 1001);
    expect(d).toEqual({ ok: false, fejl: "for_langsom" });
  });
  it("tiden tjekkes igen EFTER læsningen: kroppen nåede ind, men fristen gik under sidste bid", async () => {
    let t = 0;
    const ur = () => { t += 400; return t; }; // 400, 800, 1200 … — fristen 1000 passeres efter sidste bid
    const d = await laesKropMedLoft(stroem([new Uint8Array(1)]), 1000, 1000, ur);
    expect(d).toEqual({ ok: false, fejl: "for_langsom" });
  });
  it("en strøm, der aldrig svarer, afbrydes ved fristen", async () => {
    const haenger = new ReadableStream<Uint8Array>({ start() { /* intet */ } });
    const d = await laesKropMedLoft(haenger, 1000, Date.now() + 50);
    expect(d).toEqual({ ok: false, fejl: "for_langsom" });
  });
});

describe("uge og budget", () => {
  it("ugen er den DANSKE dags ISO-uge (søndag 23:30 UTC = mandag i Danmark)", () => {
    expect(ugeNoegle(NU)).toBe("2026-W40");
    expect(ugeNoegle(new Date("2026-10-04T22:30:00Z"))).toBe("2026-W41");
  });
  it("et LLM-kald startes kun, hvis det værste forløb når at slutte: seneste start = 140 000 − 15 000 − 40 000 = 85 000 ms", () => {
    expect(JOB_TIMEOUT_MS - MARGIN_MS - LLM_TIMEOUT_MS).toBe(85_000);
    expect(maaStarteLlmKald(85_000, 0)).toBe(true);
    expect(maaStarteLlmKald(85_001, 0)).toBe(false);
    expect(maaStarteLlmKald(0, MAKS_LLM_KALD)).toBe(false);
  });
});

describe("vurderingen (skema-dommen)", () => {
  it("gyldige rækker bruges; ukendt id, dublet, score uden for 0–10 og tomme felter afvises", () => {
    const svar = { vurderinger: [
      { id: "n1", score: 8, relevant: true, hvem: "Alle", handling: "Tjek", begrundelse: "Lov" },
      { id: "n1", score: 7, relevant: true, hvem: "a", handling: "b", begrundelse: "c" },
      { id: "n9", score: 5, relevant: true, hvem: "a", handling: "b", begrundelse: "c" },
      { id: "n2", score: 11, relevant: true, hvem: "a", handling: "b", begrundelse: "c" },
      { id: "n3", score: 4, relevant: false, hvem: "", handling: "b", begrundelse: "c" },
    ] };
    const d = validerVurderinger(svar, ["n1", "n2", "n3"]);
    expect(d.vurderinger.map((v) => v.id)).toEqual(["n1"]);
    expect(d.afvist).toBe(4);
    expect(validerVurderinger("vrøvl", ["n1"]).afvist).toBe(1);
  });
});

const kandidat = (id: string, score: number, relevant = true): Kandidat => ({
  emne_id: id, kilde: "nemhandel", titel: `T ${id}`, url: `https://x.dk/${id}`, resume: "", udgivet: "2026-09-27T00:00:00Z",
  score, relevant, hvem: "h", handling: "a", begrundelse: "b",
});

describe("udvælgelsen", () => {
  it("højst fem, score ≥ 6 og relevant, højeste først — færre end tre er intet udkast", () => {
    const v = vaelgTilUdkast([kandidat("a", 9), kandidat("b", 6), kandidat("c", 5), kandidat("d", 10, false), kandidat("e", 7), kandidat("f", 8), kandidat("g", 8), kandidat("h", 7)]);
    expect(v.valgt.map((k) => k.emne_id)).toEqual(["a", "f", "g", "e", "h"]);
    expect(v.valgt.length).toBe(MAKS_PUNKTER);
    expect(v.nok).toBe(true);
    expect(vaelgTilUdkast([kandidat("a", 9), kandidat("b", 8)]).nok).toBe(false);
  });
});

const VALGTE = [
  { id: "n1", titel: "E-fakturering bliver den nye fælles måde at fakturere", resume: "Fra 1. januar 2027 skal alle virksomheder kunne modtage e-fakturaer." },
  { id: "n2", titel: "Høring over bekendtgørelse om sikkerhed for gasinstallationer", resume: "Høringsfrist 22. oktober 2026" },
  { id: "n3", titel: "AI-modstand vokser også i Danmark", resume: "Demonstranter er vrede." },
];
const GODT = {
  titel: "Ugens nyt: e-faktura, gas og AI",
  indledning: "Her er ugens tre ting, der kan ramme din virksomhed.",
  punkter: [
    { id: "n1", overskrift: "E-faktura for alle", tekst: "Fra 1. januar 2027 skal alle virksomheder kunne modtage e-fakturaer.", betydning: "Spørg dit regnskabsprogram, om det er klar." },
    { id: "n2", overskrift: "Nye regler for gasinstallationer i høring", tekst: "Høringsfristen er 22. oktober 2026.", betydning: "Arbejder du med gas, så læs udkastet." },
    { id: "n3", overskrift: "Modstand mod AI", tekst: "Der er demonstrationer mod AI i Danmark.", betydning: "Tænk over, hvordan du forklarer din brug af AI." },
  ],
  afslutning: "Skriv i tråden, hvis du vil vide mere.",
};

describe("udkastet (skema-, kilde- og tal-dommen)", () => {
  it("et godt svar går igennem", () => {
    const d = validerUdkast(GODT, VALGTE);
    expect(d.ok).toBe(true);
  });
  it("et tal, kilden ikke siger, afviser HELE udkastet", () => {
    const d = validerUdkast({ ...GODT, punkter: [{ ...GODT.punkter[0], tekst: "Fra 1. januar 2028 skal alle kunne modtage e-fakturaer." }, ...GODT.punkter.slice(1)] }, VALGTE);
    expect(d.ok).toBe(false);
    expect(((d as { fejl?: string[] }).fejl ?? []).join(" ")).toMatch(/«2028» står ikke i kilden/);
  });
  it("tal i titel, indledning eller afslutning afvises", () => {
    expect(validerUdkast({ ...GODT, titel: "Uge 40: tre nyheder" }, VALGTE).ok).toBe(false);
    expect(validerUdkast({ ...GODT, afslutning: "Vi ses om 7 dage." }, VALGTE).ok).toBe(false);
  });
  it("talværnet sammenligner HELE tal: «6» og «20» står ikke i «2026» (fund 1)", () => {
    expect(talIkkeIKilden("Frist 6. juni", "Høringsfrist juni 2026")).toEqual(["6"]);
    expect(talIkkeIKilden("20 virksomheder", "Høringsfrist 22. oktober 2026")).toEqual(["20"]);
    expect(talIkkeIKilden("Frist 22. oktober 2026", "Høringsfrist 22. oktober 2026")).toEqual([]);
    expect(talIkkeIKilden("1.000 kr.", "10.000 kr.")).toEqual(["1.000"]);
    const d = validerUdkast({ ...GODT, punkter: [GODT.punkter[0], { ...GODT.punkter[1], tekst: "Høringsfristen er 20. oktober 2026." }, GODT.punkter[2]] }, VALGTE);
    expect(d.ok).toBe(false);
    expect(((d as { fejl?: string[] }).fejl ?? []).join(" ")).toMatch(/«20» står ikke i kilden/);
    const seks = validerUdkast({ ...GODT, punkter: [GODT.punkter[0], { ...GODT.punkter[1], betydning: "Svar inden 6 uger — 2026 er året." }, GODT.punkter[2]] }, VALGTE);
    expect(((seks as { fejl?: string[] }).fejl ?? []).join(" ")).toMatch(/«6» står ikke i kilden/);
  });
  it("LINK_MOENSTER fanger også @-adresser og domæner uden www (fund 5)", () => {
    for (const t of ["skriv til info@skat.dk", "se skat.dk", "på virk.dk/regler", "læs Version2.dk", "europa.eu", "x@y"]) expect(LINK_MOENSTER.test(t)).toBe(true);
    for (const t of ["Spørg dit regnskabsprogram, om det er klar.", "f.eks. EU-regler", "Høringsfristen er 22. oktober 2026."]) expect(LINK_MOENSTER.test(t)).toBe(false);
    expect(validerUdkast({ ...GODT, punkter: [{ ...GODT.punkter[2], betydning: "Skriv til info@virk.dk" }, ...GODT.punkter.slice(0, 2)] }, VALGTE).ok).toBe(false);
    expect(validerUdkast({ ...GODT, afslutning: "Se mere på skat.dk" }, VALGTE).ok).toBe(false);
  });
  it("et link skrevet af modellen afvises — linket sætter vi selv", () => {
    expect(validerUdkast({ ...GODT, punkter: [{ ...GODT.punkter[2], betydning: "Læs mere på https://x.dk" }, ...GODT.punkter.slice(0, 2)] }, VALGTE).ok).toBe(false);
    expect(validerUdkast({ ...GODT, indledning: "Se www.skat.dk" }, VALGTE).ok).toBe(false);
  });
  it("ukendt id, dublet og for få punkter afvises", () => {
    expect(validerUdkast({ ...GODT, punkter: [{ ...GODT.punkter[0], id: "n7" }, ...GODT.punkter.slice(1)] }, VALGTE).ok).toBe(false);
    expect(validerUdkast({ ...GODT, punkter: [GODT.punkter[0], GODT.punkter[0], GODT.punkter[1]] }, VALGTE).ok).toBe(false);
    expect(validerUdkast({ ...GODT, punkter: GODT.punkter.slice(0, 2) }, VALGTE).ok).toBe(false);
    expect(validerUdkast(null, VALGTE).ok).toBe(false);
  });
  it("talITekst finder datoer, beløb og paragraffer som hele tokens", () => {
    expect(talITekst("§ 3, stk. 2 — 1.000 kr. den 13/10 og 2026-09-30")).toEqual(["3", "2", "1.000", "13/10", "2026-09-30"]);
  });
});

describe("dokumentet", () => {
  const kilder = new Map(VALGTE.map((v) => [v.id, { navn: "Nemhandel", titel: v.titel, url: `https://nemhandel.dk/${v.id}` }]));
  const d = validerUdkast(GODT, VALGTE);
  if (!d.ok) throw new Error("fixture");
  const doc = byggDokument(d.udkast, kilder);

  it("community-motoren kasserer INTET: samme antal blokke, overskrifter og links efter parseCommunityDokument", () => {
    const vist = parseCommunityDokument(doc);
    expect(vist.length).toBe(doc.content.length);
    expect(vist.filter((n) => n.type === "heading")).toHaveLength(3);
    const links = JSON.stringify(vist).match(/"type":"link","href":"https:\/\/nemhandel\.dk\/n\d"/g) ?? [];
    expect(links).toHaveLength(3);
  });
  it("hvert punkt har «Hvad betyder det for dig?» og «Kilde:» med kildens egen URL", () => {
    const t = dokumentTekst(doc);
    expect((t.match(/Hvad betyder det for dig\?/g) ?? []).length).toBe(3);
    expect((t.match(/Kilde:/g) ?? []).length).toBe(3);
    expect(JSON.stringify(doc)).not.toMatch(/"href":"(?!https:\/\/nemhandel\.dk\/)/);
  });
  it("dokumentTekst er uændret for samme indhold og ændret, når et ord rettes", () => {
    const kopi = JSON.parse(JSON.stringify(doc));
    expect(dokumentTekst(kopi)).toBe(dokumentTekst(doc));
    kopi.content[0].content[0].text = "Rettet af rådgiveren.";
    expect(dokumentTekst(kopi)).not.toBe(dokumentTekst(doc));
  });
});

describe("afgørelsen (tilstandsovergangene)", () => {
  const nu = new Date("2026-09-28T08:00:00Z");
  const kladde = { status: "kladde" as const, afgjort_af: null, afgjort_at: null };
  const taget = { status: "publiceres" as const, afgjort_af: "jonas", afgjort_at: "2026-09-28T07:58:00Z" };
  it("tag og afvis kun fra kladde", () => {
    expect(afgoerOvergang(kladde, "tag", "jonas", nu)).toEqual({ ok: true, til: "publiceres" });
    expect(afgoerOvergang(kladde, "afvis", "jonas", nu)).toEqual({ ok: true, til: "afvist" });
    expect(afgoerOvergang(taget, "tag", "morten", nu)).toMatchObject({ ok: false, http: 409 });
    expect(afgoerOvergang({ ...kladde, status: "godkendt" }, "afvis", "jonas", nu)).toMatchObject({ ok: false, http: 409 });
  });
  it("publiceret af den, der tog udkastet — en anden først efter 10 minutter («Markér som publiceret»)", () => {
    expect(afgoerOvergang(taget, "publiceret", "jonas", nu)).toEqual({ ok: true, til: "godkendt" });
    expect(afgoerOvergang(taget, "publiceret", "morten", nu)).toMatchObject({ ok: false, http: 403 });
    const senere = new Date(new Date(taget.afgjort_at).getTime() + FORAELDET_TAG_MS);
    expect(afgoerOvergang(taget, "publiceret", "morten", senere)).toEqual({ ok: true, til: "godkendt" });
    expect(afgoerOvergang(kladde, "publiceret", "jonas", nu)).toMatchObject({ ok: false, http: 409 });
  });
  it("slip: den, der tog det, altid — en anden først efter 10 minutter", () => {
    expect(afgoerOvergang(taget, "slip", "jonas", nu)).toEqual({ ok: true, til: "kladde" });
    expect(afgoerOvergang(taget, "slip", "morten", nu)).toMatchObject({ ok: false, http: 403 });
    const senere = new Date(new Date(taget.afgjort_at).getTime() + FORAELDET_TAG_MS);
    expect(afgoerOvergang(taget, "slip", "morten", senere)).toEqual({ ok: true, til: "kladde" });
  });
});

describe("tråden fra publiceringsforsøget (fund 2 og 7)", () => {
  const u = { id: "u1", titel: "Ugens nyt", afgjort_af: "jonas", afgjort_at: "2026-09-28T07:58:00Z", kildeUrls: ["https://nemhandel.dk/n1"] };
  const doc = (href: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Kilde", marks: [{ type: "link", attrs: { href } }] }] }] });
  const traad = (o: Partial<TraadSpor>): TraadSpor => ({ id: "t1", forfatter_id: "jonas", titel: "Ugens nyt", created_at: "2026-09-28T07:59:00Z", indhold_json: doc("https://andet.dk"), ...o });
  const ingen = new Set<string>();

  it("samme forfatter, efter «tag», samme titel → trådens id", () => {
    expect(traadFraForsoeget(u, [traad({})], ingen)).toBe("t1");
    expect(traadFraForsoeget(u, [traad({ titel: "  Ugens nyt " })], ingen)).toBe("t1");
  });
  it("rettet titel, men udkastets eget kildelink → trådens id", () => {
    expect(traadFraForsoeget(u, [traad({ titel: "Rettet", indhold_json: doc("https://nemhandel.dk/n1") })], ingen)).toBe("t1");
    expect(traadFraForsoeget(u, [traad({ titel: "Rettet" })], ingen)).toBeNull();
  });
  it("en anden forfatter, en tråd FØR «tag» og en tråd, der er et andet udkasts, tæller ikke", () => {
    expect(traadFraForsoeget(u, [traad({ forfatter_id: "morten" })], ingen)).toBeNull();
    expect(traadFraForsoeget(u, [traad({ created_at: "2026-09-28T07:57:59Z" })], ingen)).toBeNull();
    expect(traadFraForsoeget(u, [traad({})], new Set(["t1"]))).toBeNull();
    expect(traadFraForsoeget({ ...u, afgjort_af: null }, [traad({})], ingen)).toBeNull();
  });
  it("flere → den nyeste", () => {
    expect(traadFraForsoeget(u, [traad({ id: "a", created_at: "2026-09-28T07:59:00Z" }), traad({ id: "b", created_at: "2026-09-28T08:01:00Z" })], ingen)).toBe("b");
  });
  it("linksIDokument finder link-marks i dybden", () => {
    expect(linksIDokument(doc("https://x.dk/1"))).toEqual(["https://x.dk/1"]);
    expect(linksIDokument(null)).toEqual([]);
  });
  it("traadKanKnyttes: forfatteren = den, der tog; efter «tag»; ikke et andet udkasts", () => {
    const uk = { afgjort_af: "jonas", afgjort_at: "2026-09-28T07:58:00Z" };
    expect(traadKanKnyttes(uk, { forfatter_id: "jonas", created_at: "2026-09-28T07:58:00Z" }, false)).toBeNull();
    expect(traadKanKnyttes(uk, { forfatter_id: "morten", created_at: "2026-09-28T07:59:00Z" }, false)).toMatchObject({ http: 403 });
    expect(traadKanKnyttes(uk, { forfatter_id: "jonas", created_at: "2026-09-28T07:57:00Z" }, false)).toMatchObject({ http: 409 });
    expect(traadKanKnyttes(uk, { forfatter_id: "jonas", created_at: "2026-09-28T07:59:00Z" }, true)).toMatchObject({ http: 409 });
    expect(traadKanKnyttes({ afgjort_af: null, afgjort_at: null }, { forfatter_id: "jonas", created_at: "2026-09-28T07:59:00Z" }, false)).toMatchObject({ http: 403 });
  });
});
