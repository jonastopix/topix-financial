import { describe, expect, it } from "vitest";
import { OFFENTLIG_URL_MARKOER, stiTilhoererAfsender, vedhaeftningsSti } from "@/lib/chatVedhaeftningSti";

/** Chat-vedhæftningens sti skal tilhøre beskedens afsender (29/9-2026, «ændring 5»). */
const A = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const B = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
const URL_BASE = `https://loiavmastgeieqyiwyyr.supabase.co${OFFENTLIG_URL_MARKOER}`;

describe("vedhaeftningsSti — samme læsning og fejltekster som get-chat-attachment-url før 29/9", () => {
  it("path-formen læses ordret", () => {
    expect(vedhaeftningsSti({ path: `${A}/1727600000000-faktura.pdf` })).toEqual({ ok: true, sti: `${A}/1727600000000-faktura.pdf` });
  });
  it("den historiske offentlige url-form giver stien efter markøren", () => {
    expect(vedhaeftningsSti({ url: `${URL_BASE}${A}/1-a.png` })).toEqual({ ok: true, sti: `${A}/1-a.png` });
  });
  it("url-formen vinder over path, som i funktionen", () => {
    expect(vedhaeftningsSti({ url: `${URL_BASE}${A}/1-a.png`, path: `${B}/2-b.png` })).toEqual({ ok: true, sti: `${A}/1-a.png` });
  });
  it("url med query, foranstillet «/» efter markøren, eller tom rest → Malformed attachment URL", () => {
    for (const url of [`${URL_BASE}${A}/1-a.png?token=x`, `${URL_BASE}/${A}/1-a.png`, URL_BASE]) {
      expect(vedhaeftningsSti({ url })).toEqual({ ok: false, fejl: "Malformed attachment URL" });
    }
  });
  it("path der er en url, en url uden markør, intet af det, eller null → Unknown attachment reference format", () => {
    for (const att of [{ path: "https://x/y" }, { url: "https://andet.dk/fil.png" }, {}, null, { path: 42 }]) {
      expect(vedhaeftningsSti(att as never)).toEqual({ ok: false, fejl: "Unknown attachment reference format" });
    }
  });
});

describe("stiTilhoererAfsender — kun når første mappe er præcis afsenderen", () => {
  it("afsenderens egen fil: ja", () => {
    expect(stiTilhoererAfsender(`${A}/1727600000000-faktura.pdf`, A)).toBe(true);
    expect(stiTilhoererAfsender(`${A}/under/mappe/fil.pdf`, A)).toBe(true);
  });
  it("en anden brugers fil: nej — det er hullet", () => {
    expect(stiTilhoererAfsender(`${B}/1-hemmelig.pdf`, A)).toBe(false);
  });
  it("store bogstaver i mappen tæller ikke som afsenderen (auth.uid()::text er små bogstaver)", () => {
    expect(stiTilhoererAfsender(`${A.toUpperCase()}/1-a.pdf`, A)).toBe(false);
  });
  it("mappen skal være HELE id'et, ikke et præfiks eller en forlængelse", () => {
    expect(stiTilhoererAfsender(`${A.slice(0, 20)}/1-a.pdf`, A)).toBe(false);
    expect(stiTilhoererAfsender(`${A}x/1-a.pdf`, A)).toBe(false);
  });
  it("«..» og «.» afvises, også URL-kodet, og også når første mappe er afsenderen", () => {
    for (const sti of [`${A}/../${B}/1-a.pdf`, `${A}/./1-a.pdf`, `${A}/%2e%2e/${B}/1-a.pdf`, `${A}/%2E/1-a.pdf`, `../${A}/1-a.pdf`]) {
      expect(stiTilhoererAfsender(sti, A), sti).toBe(false);
    }
  });
  it("tomme dele afvises: «//», afsluttende «/», kun mappen", () => {
    for (const sti of [`${A}//1-a.pdf`, `${A}/`, `${A}`, ""]) expect(stiTilhoererAfsender(sti, A), JSON.stringify(sti)).toBe(false);
  });
  it("foranstillet «/», «\\», «?» og kodet «/» afvises", () => {
    for (const sti of [`/${A}/1-a.pdf`, `${A}\\1-a.pdf`, `${A}/1-a.pdf?x=1`, `${A}/a%2F..%2F${B}`, `${A}/a%5Cb`]) {
      expect(stiTilhoererAfsender(sti, A), sti).toBe(false);
    }
  });
  it("ugyldig URL-kodning afvises (decodeURIComponent kaster)", () => {
    expect(stiTilhoererAfsender(`${A}/%E0%A4%A.pdf`, A)).toBe(false);
  });
  it("afsender, der ikke er et uuid, eller mangler: nej", () => {
    expect(stiTilhoererAfsender(`abc/1-a.pdf`, "abc")).toBe(false);
    expect(stiTilhoererAfsender(`${A}/1-a.pdf`, null)).toBe(false);
    expect(stiTilhoererAfsender(`${A}/1-a.pdf`, undefined)).toBe(false);
    expect(stiTilhoererAfsender(null, A)).toBe(false);
  });
  it("et filnavn med mellemrum eller procent, der afkodes pænt, er i orden", () => {
    expect(stiTilhoererAfsender(`${A}/1-min%20fil.pdf`, A)).toBe(true);
  });
});
