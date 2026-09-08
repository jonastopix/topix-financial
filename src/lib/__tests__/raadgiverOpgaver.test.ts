import { describe, expect, it } from "vitest";
import {
  GAMMEL_DAGE,
  GJORT_SYNLIG_DAGE,
  afgoerOpgave,
  delListe,
  fristTekst,
  sammenlignOpgaver,
  type RaadgiverOpgave,
} from "@/lib/raadgiverOpgaver";

// Rådgivernes to-do (8/9): fristen sorterer, notificerer ikke. Grænserne
// som milepaelDom: dagen før, fristdagen, dagen efter.

const NU = new Date(2026, 8, 8, 9, 0); // 8. september 2026
// Tidsstempler bygges i LOKAL tid, så dagtallene ikke afhænger af maskinens zone.
const lokal = (y: number, m: number, d: number, h = 8) => new Date(y, m - 1, d, h).toISOString();
let n = 0;
const o = (tekst: string, over: Partial<RaadgiverOpgave> = {}): RaadgiverOpgave => ({
  id: `o${++n}`,
  tekst,
  ejer_id: "jonas",
  oprettet_af: "jonas",
  company_id: null,
  frist: null,
  status: "aaben",
  gjort_at: null,
  created_at: "2026-09-01T10:00:00Z",
  ...over,
});

describe("afgoerOpgave — grænserne om fristen", () => {
  it("dagen før = kommende (1), fristdagen = i dag (0), dagen efter = forfalden (−1)", () => {
    expect(afgoerOpgave(o("a", { frist: "2026-09-09" }), NU)).toMatchObject({ tilstand: "kommende", dage_til_frist: 1 });
    expect(afgoerOpgave(o("a", { frist: "2026-09-08" }), new Date(2026, 8, 8, 23, 59))).toMatchObject({ tilstand: "i_dag", dage_til_frist: 0 });
    expect(afgoerOpgave(o("a", { frist: "2026-09-07" }), new Date(2026, 8, 8, 0, 0))).toMatchObject({ tilstand: "forfalden", dage_til_frist: -1 });
  });
  it("uden frist: uden_frist, og «gammel» først efter GAMMEL_DAGE", () => {
    expect(afgoerOpgave(o("a", { created_at: "2026-08-09T10:00:00Z" }), NU)).toMatchObject({ tilstand: "uden_frist", alder_dage: 29, gammel: false });
    expect(afgoerOpgave(o("a", { created_at: lokal(2026, 8, 8) }), NU)).toMatchObject({ alder_dage: 31, gammel: true });
    expect(GAMMEL_DAGE).toBe(30);
  });
  it("gjort er gjort uanset frist, og aldrig «gammel»", () => {
    expect(afgoerOpgave(o("a", { status: "gjort", gjort_at: "2026-09-02T10:00:00Z", frist: "2026-01-01", created_at: "2026-01-01T00:00:00Z" }), NU))
      .toMatchObject({ tilstand: "gjort", gammel: false });
  });
});

describe("sammenlignOpgaver — forfaldne øverst (ældst først), så i dag, kommende, uden frist (nyest først)", () => {
  it("giver rækkefølgen", () => {
    const liste = [
      o("uden-ny", { created_at: "2026-09-07T10:00:00Z" }),
      o("om 5", { frist: "2026-09-13" }),
      o("uden-gammel", { created_at: "2026-07-01T10:00:00Z" }),
      o("i dag", { frist: "2026-09-08" }),
      o("forfaldt 145", { frist: "2026-04-16" }),
      o("om 1", { frist: "2026-09-09" }),
      o("forfaldt 1", { frist: "2026-09-07" }),
    ];
    expect([...liste].sort((a, b) => sammenlignOpgaver(a, b, NU)).map((x) => x.tekst)).toEqual([
      "forfaldt 145", "forfaldt 1", "i dag", "om 1", "om 5", "uden-ny", "uden-gammel",
    ]);
  });
  it("samme frist: ældst oprettet først — stabilt fra dag til dag", () => {
    const a = o("ny", { frist: "2026-09-10", created_at: "2026-09-05T10:00:00Z" });
    const b = o("gammel", { frist: "2026-09-10", created_at: "2026-09-01T10:00:00Z" });
    expect([a, b].sort((x, y) => sammenlignOpgaver(x, y, NU)).map((x) => x.tekst)).toEqual(["gammel", "ny"]);
  });
});

describe("delListe — intet åbent skjules; gjorte forlader fladen efter GJORT_SYNLIG_DAGE", () => {
  it("åbne sorteres, forfaldne tælles, gjorte deles i synlige og skjulte", () => {
    const liste = [
      o("forfaldt", { frist: "2026-04-16" }),
      o("gjort ny", { status: "gjort", gjort_at: "2026-09-07T10:00:00Z" }),
      o("gjort gammel", { status: "gjort", gjort_at: "2026-07-01T10:00:00Z" }),
      o("gjort dag 30", { status: "gjort", gjort_at: "2026-08-09T09:30:00Z" }),
      o("uden", {}),
    ];
    const d = delListe(liste, NU);
    expect(d.aabne.map((x) => x.tekst)).toEqual(["forfaldt", "uden"]);
    expect(d.forfaldne).toBe(1);
    expect(d.gjorte.map((x) => x.tekst)).toEqual(["gjort ny", "gjort dag 30"]);
    expect(d.gjorteSkjult).toBe(1);
    expect(GJORT_SYNLIG_DAGE).toBe(30);
  });
  it("et 145 dage gammelt forfaldent punkt står stadig øverst — ingen kirkegård", () => {
    const d = delListe([o("ny", { frist: "2026-09-20" }), o("145", { frist: "2026-04-16", created_at: "2026-04-01T00:00:00Z" })], NU);
    expect(d.aabne[0].tekst).toBe("145");
  });
});

describe("fristTekst", () => {
  it("husets ord", () => {
    expect(fristTekst(afgoerOpgave(o("a", { frist: "2026-04-16" }), NU))).toBe("Forfaldt for 145 dage siden");
    expect(fristTekst(afgoerOpgave(o("a", { frist: "2026-09-07" }), NU))).toBe("Forfaldt i går");
    expect(fristTekst(afgoerOpgave(o("a", { frist: "2026-09-08" }), NU))).toBe("I dag");
    expect(fristTekst(afgoerOpgave(o("a", { frist: "2026-09-09" }), NU))).toBe("I morgen");
    expect(fristTekst(afgoerOpgave(o("a", { frist: "2026-09-13" }), NU))).toBe("Om 5 dage");
    expect(fristTekst(afgoerOpgave(o("a"), NU))).toBe("Ingen frist");
    expect(fristTekst(afgoerOpgave(o("a", { created_at: lokal(2026, 7, 1) }), NU))).toBe("Ingen frist · ligger 69 dage");
  });
});
