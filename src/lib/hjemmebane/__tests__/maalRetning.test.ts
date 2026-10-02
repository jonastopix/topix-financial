import { describe, expect, it } from "vitest";
import { handoutConfigs } from "@/lib/handoutConfig";
import {
  danskKalenderdag,
  klipKortTekst,
  klipRetning,
  RETNING_FELT_ORD,
  RETNING_KORT_MAKS_TEGN,
  RETNING_MAKS_LINJER,
  RETNING_MAKS_TEGN,
  RETNING_MODUL,
  RETNING_NOEGLER,
  retningFraHandout,
  retningLinjer,
  retningMeta,
  retningStatus,
  retningTilResponses,
  vaelgRetningsRaekke,
  type RetningsRaekke,
} from "../maalRetning";

const raekke = (o: Partial<RetningsRaekke> = {}): RetningsRaekke => ({
  id: "h1",
  user_id: "u1",
  module: "overordnet",
  responses: {},
  updated_at: "2026-09-01T10:00:00Z",
  ...o,
});

describe("«Jeres retning» — nøglerne er handoutets", () => {
  it("de tre nøgler står ordret i handoutConfigs.overordnet", () => {
    const noegler = handoutConfigs.overordnet.sections.flatMap((s) => s.questions.map((q) => q.key));
    for (const n of RETNING_NOEGLER) expect(noegler).toContain(n);
    expect(RETNING_MODUL).toBe("overordnet");
  });
});

describe("vaelgRetningsRaekke", () => {
  it("kun modul 'overordnet', den nyeste", () => {
    const valgt = vaelgRetningsRaekke([
      raekke({ id: "gammel", updated_at: "2026-08-01T00:00:00Z" }),
      raekke({ id: "salg", module: "salg", updated_at: "2026-10-01T00:00:00Z" }),
      raekke({ id: "ny", updated_at: "2026-09-15T00:00:00Z" }),
    ]);
    expect(valgt?.id).toBe("ny");
  });
  it("ingen 'overordnet' → null; lige stempler → den første", () => {
    expect(vaelgRetningsRaekke([raekke({ module: "salg" })])).toBeNull();
    expect(vaelgRetningsRaekke([])).toBeNull();
    expect(vaelgRetningsRaekke([raekke({ id: "a" }), raekke({ id: "b" })])?.id).toBe("a");
  });
});

describe("retningFraHandout", () => {
  it("de tre svar af responses; andre nøgler ignoreres; besvaret tæller ikke-tomme efter trim", () => {
    const r = retningFraHandout(
      raekke({ responses: { lykkedes_12mdr: "2 mio. i omsætning", anderledes_hverdag: "   ", maal_forretning: "x", konsekvenser_ingen_aendring: "Vi lukker" } }),
    );
    expect(r.svar).toEqual({ lykkedes_12mdr: "2 mio. i omsætning", anderledes_hverdag: "   ", konsekvenser_ingen_aendring: "Vi lukker" });
    expect(r.besvaret).toBe(2);
    expect(r.handoutId).toBe("h1");
    expect(r.userId).toBe("u1");
    expect(r.opdateret).toBe("2026-09-01T10:00:00Z");
  });
  it("ingen række → tomme svar, intet id", () => {
    const r = retningFraHandout(null);
    expect(r).toEqual({ handoutId: null, userId: null, svar: { lykkedes_12mdr: "", anderledes_hverdag: "", konsekvenser_ingen_aendring: "" }, besvaret: 0, opdateret: null });
  });
  it("et felt er en observation: ikke-tekst og ikke-objekt læses som tomt", () => {
    expect(retningFraHandout(raekke({ responses: { lykkedes_12mdr: 42, anderledes_hverdag: null } })).besvaret).toBe(0);
    expect(retningFraHandout(raekke({ responses: ["lykkedes_12mdr"] })).besvaret).toBe(0);
    expect(retningFraHandout(raekke({ responses: null })).svar.lykkedes_12mdr).toBe("");
  });
});

describe("retningTilResponses", () => {
  it("fletter KUN de tre nøgler; handoutets øvrige svar bevares ordret (også ikke-tekst)", () => {
    const d = retningTilResponses({ maal_forretning: "Vokse", lykkedes_12mdr: "gammelt", tal: 7 }, { lykkedes_12mdr: "nyt", anderledes_hverdag: "Fri fredag" });
    expect(d).toEqual({ ok: true, harIndhold: true, responses: { maal_forretning: "Vokse", lykkedes_12mdr: "nyt", tal: 7, anderledes_hverdag: "Fri fredag" } });
  });
  it("et udeladt svar står uændret; et tomt svar skrives som tomt", () => {
    const d = retningTilResponses({ lykkedes_12mdr: "x", konsekvenser_ingen_aendring: "y" }, { konsekvenser_ingen_aendring: "" });
    expect(d.ok && d.responses).toEqual({ lykkedes_12mdr: "x", konsekvenser_ingen_aendring: "" });
  });
  it("en fremmed nøgle afvises — handoutets andre svar skrives aldrig herfra", () => {
    expect(retningTilResponses({}, { maal_forretning: "x" })).toEqual({ ok: false, grund: "Kun de tre spørgsmål om retningen kan gemmes her" });
  });
  it("et svar, der ikke er tekst, afvises", () => {
    expect(retningTilResponses({}, { lykkedes_12mdr: 3 })).toEqual({ ok: false, grund: "Svaret skal være tekst" });
  });
  it("harIndhold: kun mellemrum er intet indhold; ikke-objekt-responses starter tomt", () => {
    expect(retningTilResponses(null, { lykkedes_12mdr: "  " })).toEqual({ ok: true, harIndhold: false, responses: { lykkedes_12mdr: "  " } });
  });
});

describe("retningStatus", () => {
  it("'completed' og 'in_progress' røres aldrig; 'not_started'/ny → afledt af indholdet", () => {
    expect(retningStatus("completed", true)).toBe("completed");
    expect(retningStatus("completed", false)).toBe("completed");
    expect(retningStatus("in_progress", false)).toBe("in_progress");
    expect(retningStatus("not_started", true)).toBe("in_progress");
    expect(retningStatus("not_started", false)).toBe("not_started");
    expect(retningStatus(null, true)).toBe("in_progress");
    expect(retningStatus(undefined, false)).toBe("not_started");
  });
});

// ── Feltets afledninger (2/10-2026: listen, klippet, meta-linjen) ──

describe("retningLinjer", () => {
  it("split på linjeskift (også CRLF), trim, tomme linjer væk, punkttegn foran fjernet", () => {
    expect(retningLinjer("vi har 30.000 kr. i løn\r\n\n- vi har ansat én\n• jeg kan holde fri  \n3. tre ture\n   ")).toEqual([
      "vi har 30.000 kr. i løn",
      "vi har ansat én",
      "jeg kan holde fri",
      "tre ture",
    ]);
  });
  it("ét afsnit uden linjeskift er én linje; et tal i sætningen er ikke et punkttegn; tomt → []", () => {
    expect(retningLinjer("Vi har 2 mio. i årstakt og 3 ansatte.")).toEqual(["Vi har 2 mio. i årstakt og 3 ansatte."]);
    expect(retningLinjer("2026 bliver året")).toEqual(["2026 bliver året"]);
    expect(retningLinjer("   \n\n")).toEqual([]);
  });
});

describe("klipRetning", () => {
  const l = (n: number) => Array.from({ length: n }, (_, i) => `linje ${i + 1}`);
  it("under grænserne: alt vises, intet klippet; tom liste → tom", () => {
    expect(klipRetning(l(3))).toEqual({ linjer: l(3), klippet: false });
    expect(klipRetning([])).toEqual({ linjer: [], klippet: false });
  });
  it("flere linjer end RETNING_MAKS_LINJER: klippes ved linjegrænsen", () => {
    const k = klipRetning(l(8));
    expect(k.linjer).toEqual(l(RETNING_MAKS_LINJER));
    expect(k.klippet).toBe(true);
  });
  it("for mange tegn i alt: linjer tages ind, så længe summen holder — aldrig midt i en linje", () => {
    const lang = "x".repeat(200);
    const k = klipRetning([lang, lang, lang]); // 200 + 200 = 400 ≤ 420; den tredje ville give 600
    expect(k).toEqual({ linjer: [lang, lang], klippet: true });
  });
  it("den FØRSTE linje alene er for lang: klippes ved sidste mellemrum før grænsen + «…» — mindst én linje vises", () => {
    const ord = Array.from({ length: 120 }, (_, i) => `ord${i}`).join(" ");
    const k = klipRetning([ord, "mere"]);
    expect(k.linjer).toHaveLength(1);
    expect(k.linjer[0].endsWith("…")).toBe(true);
    expect(k.linjer[0].length).toBeLessThanOrEqual(RETNING_MAKS_TEGN + 1);
    // Klippet ved et mellemrum, ikke midt i et ord: det sidste ord før «…» er et helt «ordN» fra kilden.
    const sidste = k.linjer[0].slice(0, -1).split(" ").pop()!;
    expect(ord.split(" ")).toContain(sidste);
    expect(k.klippet).toBe(true);
  });
});

describe("klipKortTekst", () => {
  it("kort tekst står hel (trimmet); lang klippes ved et mellemrum + «…»", () => {
    expect(klipKortTekst("  Mere struktur.  ")).toEqual({ tekst: "Mere struktur.", klippet: false });
    const t = Array.from({ length: 80 }, (_, i) => `ord${i}`).join(" ");
    const k = klipKortTekst(t);
    expect(k.klippet).toBe(true);
    expect(k.tekst.length).toBeLessThanOrEqual(RETNING_KORT_MAKS_TEGN + 1);
    expect(k.tekst.endsWith("…")).toBe(true);
    expect(klipKortTekst("")).toEqual({ tekst: "", klippet: false });
  });
});

describe("retningMeta", () => {
  const dato = (iso: string) => `D(${iso.slice(0, 10)})`;
  it("«Skrevet af <fornavn> · <dato>» med navn; «Skrevet <dato>» uden; navn alene; null uden begge", () => {
    expect(retningMeta("Mette", "2026-09-12T10:00:00Z", dato)).toBe("Skrevet af Mette · D(2026-09-12)");
    expect(retningMeta(null, "2026-09-12T10:00:00Z", dato)).toBe("Skrevet D(2026-09-12)");
    expect(retningMeta("  ", "2026-09-12T10:00:00Z", dato)).toBe("Skrevet D(2026-09-12)");
    expect(retningMeta("Mette", null, dato)).toBe("Skrevet af Mette");
    expect(retningMeta(null, null, dato)).toBeNull();
  });
  it("en medejers række: «Skrevet af en anden i virksomheden · <dato>» — «Skrevet» ÉN gang (rådets fund 2/10)", () => {
    expect(retningMeta(null, "2026-09-12T10:00:00Z", dato, true)).toBe("Skrevet af en anden i virksomheden · D(2026-09-12)");
    expect(retningMeta(null, null, dato, true)).toBe("Skrevet af en anden i virksomheden");
    expect(retningMeta("Mette", "2026-09-12T10:00:00Z", dato, true)).toBe("Skrevet af en anden i virksomheden · D(2026-09-12)");
  });
  it("danskKalenderdag: Europe/Copenhagen omkring midnat, sommer- og vintertid; ulæseligt → uændret", () => {
    expect(danskKalenderdag("2026-09-11T22:30:00Z")).toBe("2026-09-12");
    expect(danskKalenderdag("2026-09-11T21:59:59Z")).toBe("2026-09-11");
    expect(danskKalenderdag("2026-12-31T23:00:00Z")).toBe("2027-01-01");
    expect(danskKalenderdag("2026-12-31T22:59:59Z")).toBe("2026-12-31");
    expect(danskKalenderdag("2026-09-12T10:00:00+00:00")).toBe("2026-09-12");
    expect(danskKalenderdag("ikke en dato")).toBe("ikke en dato");
  });
  it("ordene står ét sted — kortenes overskrifter og foden", () => {
    expect(RETNING_FELT_ORD.hverdagen).toBe("Hverdagen, vi bygger");
    expect(RETNING_FELT_ORD.prisen).toBe("Prisen, hvis intet ændrer sig");
    expect(RETNING_FELT_ORD.fod).toBe("Jeres mål herunder er vejen derhen.");
  });
});
