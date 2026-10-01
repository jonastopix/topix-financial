import { describe, expect, it } from "vitest";
import { afgoerMilepael, erMarkeretNaaet, dageTilFrist, sammenlignAktive, statusEfterFremgang, HASTENDE_DAGE } from "@/lib/milepaelDom";

// Fristen er 10. september 2026. «Nu» gives i LOKAL tid, fordi dommen læser
// læserens kalenderdag — testene er derfor uafhængige af maskinens zone.
const FRIST = "2026-09-10";
const dagenFoer_sent = new Date(2026, 8, 9, 23, 59, 59);
const fristdag_tidligt = new Date(2026, 8, 10, 0, 0, 0);
const fristdag_sent = new Date(2026, 8, 10, 23, 59, 59);
const dagenEfter_tidligt = new Date(2026, 8, 11, 0, 0, 0);

const aktiv = (progress: number, deadline: string | Date | null = FRIST) => ({ status: "active", progress, deadline });

describe("afgoerMilepael — grænserne omkring fristen (7/9: fristdagen er sidste dag MED)", () => {
  it("dagen før fristen: ikke forfalden, dage_til_frist 1", () => {
    const d = afgoerMilepael(aktiv(40), dagenFoer_sent);
    expect(d.tilstand).toBe("i_gang");
    expect(d.forfalden).toBe(false);
    expect(d.dage_til_frist).toBe(1);
  });
  it("fristdagen, første sekund: ikke forfalden, dage_til_frist 0", () => {
    const d = afgoerMilepael(aktiv(40), fristdag_tidligt);
    expect(d.tilstand).toBe("i_gang");
    expect(d.forfalden).toBe(false);
    expect(d.dage_til_frist).toBe(0);
  });
  it("fristdagen, sidste sekund: STADIG ikke forfalden", () => {
    const d = afgoerMilepael(aktiv(0), fristdag_sent);
    expect(d.tilstand).toBe("ikke_startet");
    expect(d.forfalden).toBe(false);
    expect(d.dage_til_frist).toBe(0);
  });
  it("dagen efter, første sekund: forfalden, dage_til_frist −1", () => {
    const d = afgoerMilepael(aktiv(40), dagenEfter_tidligt);
    expect(d.tilstand).toBe("forfalden");
    expect(d.forfalden).toBe(true);
    expect(d.aktiv).toBe(true);
    expect(d.paabegyndt).toBe(true);
    expect(d.dage_til_frist).toBe(-1);
  });
  it("fristen som Date (new Date('YYYY-MM-DD') = UTC-midnat) dømmes som samme kalenderdag", () => {
    expect(afgoerMilepael(aktiv(40, new Date(FRIST)), fristdag_sent).forfalden).toBe(false);
    expect(afgoerMilepael(aktiv(40, new Date(FRIST)), dagenEfter_tidligt).forfalden).toBe(true);
  });
  it("uden frist: aldrig forfalden, dage_til_frist null", () => {
    const d = afgoerMilepael(aktiv(40, null), dagenEfter_tidligt);
    expect(d.forfalden).toBe(false);
    expect(d.dage_til_frist).toBeNull();
    expect(afgoerMilepael(aktiv(40, ""), dagenEfter_tidligt).dage_til_frist).toBeNull();
    expect(afgoerMilepael(aktiv(40, "ikke en dato"), dagenEfter_tidligt).dage_til_frist).toBeNull();
  });
});

describe("afgoerMilepael — nået er KUN et menneskes klik (Jonas 1/10-2026)", () => {
  // Fejlen 1/10 11:37 (Jonas, målt): «Når jeg har et skridt på et mål, og
  // klikker gjort på et skridt, så lukker målet.» opgave-luk skriver progress
  // = andel gjorte skridt (100 ved det sidste); dommen sagde progress >= 100
  // = færdig, og målet sprang til den foldede «Nået». Denne test fælder det.
  it("progress 100 med status 'active' er IKKE nået — målet står aktivt (alle skridt gjort ≠ nået)", () => {
    const d = afgoerMilepael(aktiv(100), fristdag_sent);
    expect(d.faerdig).toBe(false);
    expect(d.aktiv).toBe(true);
    expect(d.tilstand).toBe("i_gang");
    expect(erMarkeretNaaet("active")).toBe(false);
  });
  it("et aktivt mål på 100 % med passeret frist er forfaldent — det er stadig aktivt", () => {
    const d = afgoerMilepael(aktiv(100), dagenEfter_tidligt);
    expect(d.tilstand).toBe("forfalden");
    expect(d.faerdig).toBe(false);
  });
  it("status 'completed' er nået, også ved progress 0", () => {
    const d = afgoerMilepael({ status: "completed", progress: 0, deadline: FRIST }, dagenEfter_tidligt);
    expect(d.tilstand).toBe("faerdig");
    expect(d.forfalden).toBe(false);
    expect(erMarkeretNaaet("completed")).toBe(true);
  });
  it("progress over 100 og null progress", () => {
    expect(afgoerMilepael(aktiv(140), fristdag_sent).faerdig).toBe(false);
    expect(afgoerMilepael({ status: "active", progress: null, deadline: null }, fristdag_sent).tilstand).toBe("ikke_startet");
  });
});

describe("afgoerMilepael — parkeret vinder over alt", () => {
  it("parkeret med passeret frist er parkeret, ikke forfalden", () => {
    const d = afgoerMilepael({ status: "parked", progress: 40, deadline: FRIST }, dagenEfter_tidligt);
    expect(d.tilstand).toBe("parkeret");
    expect(d.forfalden).toBe(false);
    expect(d.aktiv).toBe(false);
  });
  it("parkeret med 100 % er parkeret, ikke færdig (som deriveStatus altid dømte)", () => {
    const d = afgoerMilepael({ status: "parked", progress: 100, deadline: null }, fristdag_sent);
    expect(d.tilstand).toBe("parkeret");
    expect(d.faerdig).toBe(false);
    expect(d.paabegyndt).toBe(true);
  });
});

describe("dageTilFrist og statusEfterFremgang", () => {
  it("regner hele kalenderdage hen over et månedsskifte", () => {
    expect(dageTilFrist("2026-10-01", new Date(2026, 8, 30, 12))).toBe(1);
    expect(dageTilFrist("2026-09-01", new Date(2026, 9, 1, 12))).toBe(-30);
  });
  it("skrivereglen: 100 → completed, alt under → active", () => {
    expect(statusEfterFremgang(100)).toBe("completed");
    expect(statusEfterFremgang(99)).toBe("active");
    expect(statusEfterFremgang(0)).toBe("active");
  });
});

describe("sammenlignAktive — forfaldne først, så hastende, så påbegyndte, så frist, så uden frist", () => {
  const nu = new Date(2026, 8, 20, 12);
  const raekker = [
    { id: "uden", status: "active", progress: 0, deadline: null },
    { id: "langt", status: "active", progress: 0, deadline: "2026-12-01" },
    { id: "igang-langt", status: "active", progress: 30, deadline: "2026-12-15" },
    { id: "hast-idag", status: "active", progress: 0, deadline: "2026-09-20" },
    { id: "hast-7", status: "active", progress: 0, deadline: "2026-09-27" },
    { id: "ikke-hast-8", status: "active", progress: 0, deadline: "2026-09-28" },
    { id: "forfalden-ny", status: "active", progress: 50, deadline: "2026-09-19" },
    { id: "forfalden-gammel", status: "active", progress: 0, deadline: "2026-09-01" },
  ];
  it("giver husets rækkefølge", () => {
    const sorteret = [...raekker].sort((a, b) => sammenlignAktive(a, b, nu)).map((r) => r.id);
    expect(sorteret).toEqual([
      "forfalden-gammel",
      "forfalden-ny",
      "hast-idag",
      "hast-7",
      "igang-langt",
      "ikke-hast-8",
      "langt",
      "uden",
    ]);
  });
  it("påbegyndt uden frist står før ikke-startet med fjern frist (den gamle sorterings regel, bevaret)", () => {
    const a = { status: "active", progress: 10, deadline: null };
    const b = { status: "active", progress: 0, deadline: "2026-12-01" };
    expect(sammenlignAktive(a, b, nu)).toBeLessThan(0);
  });
  it("hastende er 0..HASTENDE_DAGE dage — fristdagen selv er hastende, ikke forfalden", () => {
    expect(HASTENDE_DAGE).toBe(7);
    expect(afgoerMilepael(raekker[3], nu).dage_til_frist).toBe(0);
    expect(afgoerMilepael(raekker[3], nu).forfalden).toBe(false);
  });
});
