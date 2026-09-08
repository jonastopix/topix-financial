import { describe, expect, it } from "vitest";
import {
  dageTilUdloeb,
  flereForslagTekst,
  foreslaaetHvornaar,
  forslagKilde,
  forslagMetaLinje,
  forslagOverlinje,
  fristTekst,
  sorterAktive,
  udloebstekst,
  vaelgForslag,
} from "../aftaler";

describe("sorterAktive — due_date stigende, forfaldne øverst", () => {
  it("sorterer på due_date stigende", () => {
    const sorteret = sorterAktive([
      { id: "b", due_date: "2026-09-11", created_at: "2026-08-01" },
      { id: "a", due_date: "2026-08-28", created_at: "2026-08-02" },
      { id: "c", due_date: "2026-09-04", created_at: "2026-08-03" },
    ]);
    expect(sorteret.map((r: any) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("tie-break på ældste created_at; manglende due_date defensivt sidst", () => {
    const sorteret = sorterAktive([
      { id: "uden", due_date: null, created_at: "2026-08-01" },
      { id: "yngst", due_date: "2026-09-04", created_at: "2026-08-20" },
      { id: "aeldst", due_date: "2026-09-04", created_at: "2026-08-10" },
    ]);
    expect(sorteret.map((r: any) => r.id)).toEqual(["aeldst", "yngst", "uden"]);
  });

  it("muterer ikke input", () => {
    const input = [
      { id: "b", due_date: "2026-09-11" },
      { id: "a", due_date: "2026-08-28" },
    ];
    sorterAktive(input);
    expect(input.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("vaelgForslag — kilde, derefter prioritet, derefter ældste", () => {
  it("advisor slår et ældre ai_weekly uanset prioritet (B10-vægtningen)", () => {
    const valgt = vaelgForslag([
      { id: "ai", source_type: "ai_weekly", priority: "high", created_at: "2026-08-26" },
      { id: "raadgiver", source_type: "advisor", priority: "medium", created_at: "2026-08-31" },
    ]);
    expect((valgt as any).id).toBe("raadgiver");
  });

  it("advisor vinder over agent — også når agentforslaget er ældre og har høj prioritet", () => {
    const valgt = vaelgForslag([
      { id: "agent", source_type: "agent", priority: "high", created_at: "2026-08-20" },
      { id: "raadgiver", source_type: "advisor", priority: "low", created_at: "2026-09-07" },
    ]);
    expect((valgt as any).id).toBe("raadgiver");
  });

  it("kilderangen følger B10: advisor → reflection → ai_weekly/agent; ukendt vejer som 14-dages-klassen", () => {
    const valgt = vaelgForslag([
      { id: "agent", source_type: "agent", priority: "high", created_at: "2026-08-01" },
      { id: "refleksion", source_type: "reflection", priority: "low", created_at: "2026-08-30" },
      { id: "ukendt", source_type: "???", priority: "high", created_at: "2026-08-01" },
    ]);
    expect((valgt as any).id).toBe("refleksion");
  });

  it("inden for samme kilde afgør prioritet", () => {
    const valgt = vaelgForslag([
      { id: "medium", source_type: "advisor", priority: "medium", created_at: "2026-08-01" },
      { id: "high", source_type: "advisor", priority: "high", created_at: "2026-08-30" },
    ]);
    expect((valgt as any).id).toBe("high");
  });

  it("inden for samme kilde og prioritet afgør ældste created_at — tættest på udløb", () => {
    const valgt = vaelgForslag([
      { id: "ny", source_type: "advisor", priority: "high", created_at: "2026-08-30" },
      { id: "gammel", source_type: "advisor", priority: "high", created_at: "2026-08-24" },
    ]);
    expect((valgt as any).id).toBe("gammel");
  });

  it("high vinder over medium og low", () => {
    const valgt = vaelgForslag([
      { id: "m", priority: "medium", created_at: "2026-08-01" },
      { id: "h", priority: "high", created_at: "2026-08-20" },
      { id: "l", priority: "low", created_at: "2026-08-02" },
    ]);
    expect((valgt as any).id).toBe("h");
  });

  it("samme prioritet: ældste created_at først — tættest på udløb (B8)", () => {
    const valgt = vaelgForslag([
      { id: "ny", priority: "high", created_at: "2026-08-30" },
      { id: "gammel", priority: "high", created_at: "2026-08-24" },
    ]);
    expect((valgt as any).id).toBe("gammel");
  });

  it("ukendt/manglende prioritet behandles som medium (fladens sortering)", () => {
    const valgt = vaelgForslag([
      { id: "ukendt", priority: "???", created_at: "2026-08-01" },
      { id: "low", priority: "low", created_at: "2026-08-01" },
    ]);
    expect((valgt as any).id).toBe("ukendt");
  });

  it("tom liste → null", () => {
    expect(vaelgForslag([])).toBeNull();
  });
});

describe("fristTekst — klar tekst, forfald dagen efter fristen", () => {
  it("kommende og dags dato frist: 'Frist …'", () => {
    expect(fristTekst("2026-09-04", "2026-08-31")).toBe("Frist 4. september");
    expect(fristTekst("2026-08-31", "2026-08-31")).toBe("Frist 31. august");
  });

  it("passeret frist: 'Fristen var …'", () => {
    expect(fristTekst("2026-08-28", "2026-08-31")).toBe("Fristen var 28. august");
  });
});

// ── Forslagets synlighed (8/9) ─────────────────────────────────────────

describe("forslagOverlinje + flereForslagTekst — tællingen ved nul, ét og flere", () => {
  it("nul og ét: overlinjen er 'Forslag til dig', ingen flere-linje", () => {
    expect(forslagOverlinje(0)).toBe("Forslag til dig");
    expect(forslagOverlinje(1)).toBe("Forslag til dig");
    expect(flereForslagTekst(0)).toBeNull();
    expect(flereForslagTekst(1)).toBeNull();
  });

  it("to: '1 af 2' og '1 forslag mere venter' (ental)", () => {
    expect(forslagOverlinje(2)).toBe("Forslag til dig · 1 af 2");
    expect(flereForslagTekst(2)).toBe("1 forslag mere venter — det kommer frem når du har svaret på dette.");
  });

  it("flere: '1 af N' og 'N-1 forslag mere venter' (flertal)", () => {
    expect(forslagOverlinje(5)).toBe("Forslag til dig · 1 af 5");
    expect(flereForslagTekst(5)).toBe("4 forslag mere venter — de kommer frem når du har svaret på dette.");
  });
});

describe("forslagKilde — hvem der foreslog, ud fra source_type", () => {
  it("rådgiver, refleksion, AI, ukendt", () => {
    expect(forslagKilde("advisor")).toBe("Fra din rådgiver");
    expect(forslagKilde("reflection")).toBe("Fra din refleksion");
    expect(forslagKilde("ai_weekly")).toBe("Fra ugens AI-analyse");
    expect(forslagKilde("agent")).toBe("Fra ugens AI-analyse");
    expect(forslagKilde("manual")).toBe("Forslag");
    expect(forslagKilde(null)).toBe("Forslag");
  });
});

describe("foreslaaetHvornaar — i dag / i går / dato, i lokale kalenderdage", () => {
  const nu = new Date(2026, 8, 8, 14, 30); // 8. september 2026, 14:30 lokal

  it("samme kalenderdag: 'foreslået i dag' — også tidligt om morgenen", () => {
    expect(foreslaaetHvornaar(new Date(2026, 8, 8, 0, 5).toISOString(), nu)).toBe("foreslået i dag");
  });

  it("dagen før: 'foreslået i går' — også kl. 23:59", () => {
    expect(foreslaaetHvornaar(new Date(2026, 8, 7, 23, 59).toISOString(), nu)).toBe("foreslået i går");
  });

  it("ældre: dato uden år, dansk måned med lille begyndelsesbogstav", () => {
    expect(foreslaaetHvornaar(new Date(2026, 8, 3, 9, 0).toISOString(), nu)).toBe("foreslået 3. september");
    expect(foreslaaetHvornaar(new Date(2026, 7, 21, 9, 0).toISOString(), nu)).toBe("foreslået 21. august");
  });

  it("manglende eller ulæseligt stempel: null — frem for en forkert dato", () => {
    expect(foreslaaetHvornaar(null, nu)).toBeNull();
    expect(foreslaaetHvornaar("ikke en dato", nu)).toBeNull();
  });
});

describe("dageTilUdloeb + udloebstekst — vises kun ved 7 dage eller færre", () => {
  const nu = new Date(2026, 8, 8, 14, 30);

  it("kalenderdage, ikke timer: udløb kl. 06 i morgen er 1 dag", () => {
    expect(dageTilUdloeb(new Date(2026, 8, 9, 6, 0).toISOString(), nu)).toBe(1);
    expect(dageTilUdloeb(new Date(2026, 8, 8, 23, 0).toISOString(), nu)).toBe(0);
    expect(dageTilUdloeb(new Date(2026, 8, 15, 6, 0).toISOString(), nu)).toBe(7);
    expect(dageTilUdloeb(new Date(2026, 9, 8, 6, 0).toISOString(), nu)).toBe(30);
  });

  it("null når expires_at mangler eller ikke kan læses", () => {
    expect(dageTilUdloeb(null, nu)).toBeNull();
    expect(dageTilUdloeb(undefined, nu)).toBeNull();
    expect(dageTilUdloeb("???", nu)).toBeNull();
  });

  it("over 7 dage og null: ingen tekst", () => {
    expect(udloebstekst(8)).toBeNull();
    expect(udloebstekst(30)).toBeNull();
    expect(udloebstekst(null)).toBeNull();
  });

  it("husets ord: i dag / i morgen / om N dage; grænsen 7 er med", () => {
    expect(udloebstekst(0)).toBe("udløber i dag");
    expect(udloebstekst(1)).toBe("udløber i morgen");
    expect(udloebstekst(3)).toBe("udløber om 3 dage");
    expect(udloebstekst(7)).toBe("udløber om 7 dage");
  });

  it("negativt (udløbet, men cron/filter har ikke fjernet det endnu): 'udløber i dag' som forsvar", () => {
    expect(udloebstekst(-1)).toBe("udløber i dag");
  });
});

describe("forslagMetaLinje — kilde · hvornår · udløb, med haster-flag", () => {
  const nu = new Date(2026, 8, 8, 14, 30);

  it("rådgiverforslag fra i går, 29 dage til udløb: ingen udløbstekst", () => {
    const m = forslagMetaLinje(
      { source_type: "advisor", created_at: new Date(2026, 8, 7, 10, 0).toISOString(), expires_at: new Date(2026, 9, 7, 10, 0).toISOString() },
      nu,
    );
    expect(m.dele).toEqual(["Fra din rådgiver", "foreslået i går"]);
    expect(m.udloeb).toBeNull();
    expect(m.haster).toBe(false);
  });

  it("AI-forslag med 3 dage tilbage: udløbstekst, ikke haster", () => {
    const m = forslagMetaLinje(
      { source_type: "ai_weekly", created_at: new Date(2026, 7, 28, 6, 0).toISOString(), expires_at: new Date(2026, 8, 11, 6, 0).toISOString() },
      nu,
    );
    expect(m.dele).toEqual(["Fra ugens AI-analyse", "foreslået 28. august"]);
    expect(m.udloeb).toBe("udløber om 3 dage");
    expect(m.haster).toBe(false);
  });

  it("udløber i morgen: haster", () => {
    const m = forslagMetaLinje(
      { source_type: "advisor", created_at: new Date(2026, 7, 10, 6, 0).toISOString(), expires_at: new Date(2026, 8, 9, 6, 0).toISOString() },
      nu,
    );
    expect(m.udloeb).toBe("udløber i morgen");
    expect(m.haster).toBe(true);
  });

  it("uden stempler: kun kilden", () => {
    const m = forslagMetaLinje({ source_type: "advisor" }, nu);
    expect(m.dele).toEqual(["Fra din rådgiver"]);
    expect(m.udloeb).toBeNull();
  });
});
