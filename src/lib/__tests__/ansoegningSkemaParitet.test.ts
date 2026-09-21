import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as srcModul from "@/lib/ansoegning/skema";
import * as denoModul from "../../../supabase/functions/_shared/ansoegningSkema.ts";

// Paritet src/lib ↔ _shared (18/9-2026): samme mønster som omkostningsnoeglerParitet —
// kroppen er ordret ens, filhovedet er den eneste forskel, og hver dom giver det
// samme for de samme input. Telefonen og serveren dømmer med samme kode.

const svar = [
  srcModul.TOMME_SVAR,
  { ...srcModul.TOMME_SVAR, cvr: " 12 34 56 78", hjemmeside: "Www.Nordicbyg.dk/", antal_ansatte: 3 },
  { ...srcModul.TOMME_SVAR, navn: "  A  B ", email: "X@Y.DK", telefon: "12345678", udfordring: "x".repeat(50) },
  { ...srcModul.TOMME_SVAR, omsaetningsinterval: "G", start_tidspunkt: "inden_3_maaneder", set_webinar: "ja", proevet: "et to tre fire fem seks syv otte ni ti elleve tolv tretten fjorten" },
];

describe("ansoegningSkema — parity between src/lib and supabase/functions/_shared", () => {
  it("konstanterne er ens", () => {
    expect(denoModul.FELTER).toEqual(srcModul.FELTER);
    expect(denoModul.SKAERME).toEqual(srcModul.SKAERME);
    expect(denoModul.OMSAETNINGSINTERVALLER).toEqual(srcModul.OMSAETNINGSINTERVALLER);
    expect(denoModul.KILDER).toEqual(srcModul.KILDER);
    expect(denoModul.TOKEN_PARAM).toBe(srcModul.TOKEN_PARAM);
    expect(denoModul.ANSOEG_STI).toBe(srcModul.ANSOEG_STI);
    expect(denoModul.TEKST_MIN).toBe(srcModul.TEKST_MIN);
    expect(denoModul.PAAMINDELSE_EFTER_DAGE).toBe(srcModul.PAAMINDELSE_EFTER_DAGE);
  });

  /* cvrMangler (19/9): «tynd ansøgning» — regnet uden branche, alder og status.
     Motoren skriver forbeholdet i grundlaget, listen viser mærket «uden CVR» på
     den lukkede række. Bliver de to uenige om hvad tynd betyder, står der ét sted
     et forbehold, som det andet sted ikke viser. */
  it("cvrMangler dømmer ens på begge sider", () => {
    const tilfaelde = [
      null,
      undefined,
      {},
      { kilde: "ansoeger" as const },
      { kilde: "datacvr" as const },
      { kilde: "ansoeger" as const, navn: "Nordic Byg ApS" },
    ];
    for (const t of tilfaelde) {
      expect(denoModul.cvrMangler(t), JSON.stringify(t)).toBe(srcModul.cvrMangler(t));
    }
    // Og dommen selv: intet opslag ELLER ansøgerens eget navn = tynd.
    expect(srcModul.cvrMangler(null)).toBe(true);
    expect(srcModul.cvrMangler(undefined)).toBe(true);
    expect(srcModul.cvrMangler({ kilde: "ansoeger" })).toBe(true);
    expect(srcModul.cvrMangler({ kilde: "datacvr" })).toBe(false);
    // UDELADT kilde betyder DataCVR (CvrVisning.kilde: «Udeladt/datacvr = DataCVR»),
    // så et opslag uden feltet er IKKE tyndt. Dommen er ordret motorens gamle
    // betingelse — den er flyttet, ikke ændret; et opslag der lykkedes, men kom
    // tomt tilbage, er en anden sag og dømmes ikke her.
    expect(srcModul.cvrMangler({})).toBe(false);
  });

  for (const [i, s] of svar.entries()) {
    it(`dommene er ens for svar ${i}`, () => {
      for (const id of srcModul.FELTER) expect(denoModul.validerFelt(id, s[id])).toEqual(srcModul.validerFelt(id, s[id]));
      expect(denoModul.validerAlle(s)).toEqual(srcModul.validerAlle(s));
      expect(denoModul.validerDel(s)).toEqual(srcModul.validerDel(s));
      expect(denoModul.afgoerFremdrift(s)).toEqual(srcModul.afgoerFremdrift(s));
    });
  }

  it("kilde og CVR-sætning er ens", () => {
    const k = { kilde: null, utmSource: "LinkedIn", referrer: "https://www.linkedin.com/" };
    expect(denoModul.afgoerKilde(k)).toEqual(srcModul.afgoerKilde(k));
    const v = { navn: "X ApS", stiftet_aar: 2001, antal_ansatte: "5-9", selskabsform: null, branche: null, status: null, hjemmeside: null };
    expect(denoModul.cvrSaetning(v)).toBe(srcModul.cvrSaetning(v));
  });

  it("Metas cookier dømmes ens på begge sider (22/9)", () => {
    const tilfaelde: unknown[] = [
      null, undefined, "x", [], {},
      { fbp: "fb.1.1790017100000.1234567890", fbc: "fb.1.1790017100000.IwAR0abc" },
      { fbp: "pjat", fbc: " fb.2.17.abcDEF-_ " },
      { fbp: 7, fbc: null },
    ];
    for (const t of tilfaelde) expect(denoModul.metaCookiesAf(t), JSON.stringify(t)).toEqual(srcModul.metaCookiesAf(t));
    const cookie = "_ga=GA1.1.1.2; _fbp=fb.1.1790017100000.1234567890; _fbc=fb.1.1790017100000.IwAR0abc";
    expect(denoModul.laesMetaCookies(cookie)).toEqual(srcModul.laesMetaCookies(cookie));
    expect(denoModul.TOMME_META_COOKIES).toEqual(srcModul.TOMME_META_COOKIES);
  });

  it("kroppen er ordret ens (filhovedet er den eneste forskel)", () => {
    const uden = (s: string) => s.replace(/^\/\*\*[\s\S]*?\*\/\n/, "");
    const src = uden(readFileSync(resolve(process.cwd(), "src/lib/ansoegning/skema.ts"), "utf8"));
    const deno = uden(readFileSync(resolve(process.cwd(), "supabase/functions/_shared/ansoegningSkema.ts"), "utf8"));
    expect(src).toBe(deno);
  });
});
