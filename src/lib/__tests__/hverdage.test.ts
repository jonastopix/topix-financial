import { describe, expect, it } from "vitest";
import {
  danskeHelligdage,
  erHelligdag,
  erHverdag,
  erHverdagDato,
  erISendevindue,
  forrigeHverdagFra,
  kbhDato,
  kbhDele,
  kbhTilUtc,
  laegDageTilDato,
  laegMaanederTilDato,
  naesteHverdagFra,
  naesteSendevindue,
  paaskedag,
  planlagtTidspunkt,
  startAfNaesteDag,
  SENDEVINDUE_FRA_TIME,
  SENDEVINDUE_TIL_TIME,
} from "@/lib/hverdage";

// Dansk kalender for rykkerkøen (18/9-2026). Sommertid: 2026-09-18 er
// UTC+2; 2026-12-18 er UTC+1. Sommertidsskift 2026: 29/3 og 25/10.

describe("hverdage — dansk klokke og dato", () => {
  it("kbhDele læser dansk vægtid, ikke UTC (sommertid +2, vintertid +1)", () => {
    expect(kbhDele(new Date("2026-09-18T07:30:00Z"))).toMatchObject({ aar: 2026, maaned: 9, dag: 18, time: 9, minut: 30, ugedag: 5 });
    expect(kbhDele(new Date("2026-12-18T07:30:00Z"))).toMatchObject({ dag: 18, time: 8, minut: 30, ugedag: 5 });
    // 23:30 UTC er næste dansk dag
    expect(kbhDato(new Date("2026-09-18T23:30:00Z"))).toBe("2026-09-19");
  });

  it("kbhTilUtc er den omvendte af kbhDele — også over sommertidsskiftet", () => {
    expect(kbhTilUtc("2026-09-21", 10, 0).toISOString()).toBe("2026-09-21T08:00:00.000Z");
    expect(kbhTilUtc("2026-12-21", 10, 0).toISOString()).toBe("2026-12-21T09:00:00.000Z");
    // Skiftedagen 25/10-2026: kl. 10 dansk er UTC+1 igen
    expect(kbhTilUtc("2026-10-25", 10, 0).toISOString()).toBe("2026-10-25T09:00:00.000Z");
    // Skiftedagen 29/3-2026: kl. 10 dansk er UTC+2
    expect(kbhTilUtc("2026-03-29", 10, 0).toISOString()).toBe("2026-03-29T08:00:00.000Z");
    for (const dato of ["2026-03-28", "2026-03-29", "2026-03-30", "2026-10-24", "2026-10-25", "2026-10-26"]) {
      const d = kbhTilUtc(dato, 10, 0);
      expect(kbhDato(d)).toBe(dato);
      expect(kbhDele(d).time).toBe(10);
    }
  });

  it("laegDageTilDato og laegMaanederTilDato er ren kalender; dagen klippes ved kort måned", () => {
    expect(laegDageTilDato("2026-12-30", 2)).toBe("2027-01-01");
    expect(laegDageTilDato("2026-03-01", -1)).toBe("2026-02-28");
    expect(laegMaanederTilDato("2026-11-30", 3)).toBe("2027-02-28");
    expect(laegMaanederTilDato("2026-01-31", 1)).toBe("2026-02-28");
    expect(laegMaanederTilDato("2026-09-18", 3)).toBe("2026-12-18");
    expect(() => laegDageTilDato("18/9-2026", 1)).toThrow();
  });
});

describe("hverdage — helligdage", () => {
  it("påsken regnes rigtigt for kendte år", () => {
    expect(paaskedag(2024)).toBe("2024-03-31");
    expect(paaskedag(2025)).toBe("2025-04-20");
    expect(paaskedag(2026)).toBe("2026-04-05");
    expect(paaskedag(2027)).toBe("2027-03-28");
  });

  it("de ti helligdage og de tre lukkedage i 2026 — og ingen store bededag", () => {
    const h = danskeHelligdage(2026);
    expect(h).toEqual([
      "2026-01-01", "2026-04-02", "2026-04-03", "2026-04-05", "2026-04-06", "2026-05-14",
      "2026-05-24", "2026-05-25", "2026-06-05", "2026-12-24", "2026-12-25", "2026-12-26", "2026-12-31",
    ]);
    expect(erHelligdag("2026-05-01")).toBe(false); // store bededag (afskaffet) — 4. fredag efter påske var 1/5
    expect(erHelligdag("2026-04-03")).toBe(true);
  });

  it("hverdag = hverken weekend, helligdag eller lukkedag", () => {
    expect(erHverdagDato("2026-09-18")).toBe(true); // fredag
    expect(erHverdagDato("2026-09-19")).toBe(false); // lørdag
    expect(erHverdagDato("2026-09-20")).toBe(false); // søndag
    expect(erHverdagDato("2026-12-24")).toBe(false); // juleaftensdag, torsdag
    expect(erHverdag(new Date("2026-09-18T22:30:00Z"))).toBe(false); // lørdag 00:30 dansk
  });

  it("naesteHverdagFra/forrigeHverdagFra springer weekend OG helligdage over", () => {
    expect(naesteHverdagFra("2026-09-19", true)).toBe("2026-09-21");
    expect(naesteHverdagFra("2026-09-18", true)).toBe("2026-09-18");
    expect(naesteHverdagFra("2026-09-18", false)).toBe("2026-09-21");
    expect(naesteHverdagFra("2026-04-02", true)).toBe("2026-04-07"); // skærtorsdag → tirsdag efter påske
    expect(forrigeHverdagFra("2026-09-20", true)).toBe("2026-09-18");
    expect(forrigeHverdagFra("2026-04-07", false)).toBe("2026-04-01"); // før tirsdag efter påske: onsdag før skærtorsdag
  });
});

describe("hverdage — sendevinduet 07–16 på hverdage", () => {
  it("vinduet er [07:00, 16:00) dansk tid", () => {
    expect(SENDEVINDUE_FRA_TIME).toBe(7);
    expect(SENDEVINDUE_TIL_TIME).toBe(16);
    expect(erISendevindue(kbhTilUtc("2026-09-18", 7, 0))).toBe(true);
    expect(erISendevindue(kbhTilUtc("2026-09-18", 15, 59))).toBe(true);
    expect(erISendevindue(kbhTilUtc("2026-09-18", 16, 0))).toBe(false); // «efter 16»
    expect(erISendevindue(kbhTilUtc("2026-09-18", 6, 59))).toBe(false);
    expect(erISendevindue(kbhTilUtc("2026-09-19", 10, 0))).toBe(false); // lørdag
    expect(erISendevindue(kbhTilUtc("2026-12-25", 10, 0))).toBe(false); // juledag
  });

  it("naesteSendevindue: i vinduet → samme øjeblik; før 07 → 07 samme dag; efter 16/weekend → næste hverdag 07", () => {
    const iVinduet = kbhTilUtc("2026-09-18", 11, 15);
    expect(naesteSendevindue(iVinduet).getTime()).toBe(iVinduet.getTime());
    expect(naesteSendevindue(kbhTilUtc("2026-09-18", 5, 0)).toISOString()).toBe(kbhTilUtc("2026-09-18", 7, 0).toISOString());
    expect(naesteSendevindue(kbhTilUtc("2026-09-18", 16, 0)).toISOString()).toBe(kbhTilUtc("2026-09-21", 7, 0).toISOString());
    expect(naesteSendevindue(kbhTilUtc("2026-09-19", 10, 0)).toISOString()).toBe(kbhTilUtc("2026-09-21", 7, 0).toISOString());
    expect(naesteSendevindue(kbhTilUtc("2026-12-23", 17, 0)).toISOString()).toBe(kbhTilUtc("2026-12-28", 7, 0).toISOString());
  });

  it("startAfNaesteDag er dansk midnat", () => {
    expect(startAfNaesteDag(kbhTilUtc("2026-09-18", 23, 30)).toISOString()).toBe("2026-09-18T22:00:00.000Z");
  });
});

describe("hverdage — planlagtTidspunkt (dag N fra ankeret)", () => {
  const anker = kbhTilUtc("2026-09-18", 14, 37); // fredag eftermiddag

  it("dag N ≥ 0 rykkes FREM til første hverdag, kl. 10", () => {
    expect(planlagtTidspunkt(anker, 0).toISOString()).toBe(kbhTilUtc("2026-09-18", 10, 0).toISOString());
    expect(planlagtTidspunkt(anker, 2).toISOString()).toBe(kbhTilUtc("2026-09-21", 10, 0).toISOString()); // søndag → mandag
    expect(planlagtTidspunkt(anker, 4).toISOString()).toBe(kbhTilUtc("2026-09-22", 10, 0).toISOString());
    expect(planlagtTidspunkt(anker, 7).toISOString()).toBe(kbhTilUtc("2026-09-25", 10, 0).toISOString());
    expect(planlagtTidspunkt(anker, 11).toISOString()).toBe(kbhTilUtc("2026-09-29", 10, 0).toISOString());
  });

  it("dag N < 0 rykkes TILBAGE: dagen før en samtale mandag er fredag", () => {
    const samtale = kbhTilUtc("2026-09-21", 9, 0);
    expect(planlagtTidspunkt(samtale, -1, 10).toISOString()).toBe(kbhTilUtc("2026-09-18", 10, 0).toISOString());
  });

  it("dag 0 med klokke 7 (samme morgen) og en klokke uden for vinduet kastes", () => {
    expect(planlagtTidspunkt(anker, 0, 7).toISOString()).toBe(kbhTilUtc("2026-09-18", 7, 0).toISOString());
    expect(() => planlagtTidspunkt(anker, 0, 16)).toThrow();
    expect(() => planlagtTidspunkt(anker, 0, 6)).toThrow();
  });

  it("dagen regnes på den DANSKE dato: et anker 23:30 UTC fredag er lørdag i Danmark", () => {
    const sentFredagUtc = new Date("2026-09-18T23:30:00Z");
    expect(planlagtTidspunkt(sentFredagUtc, 2).toISOString()).toBe(kbhTilUtc("2026-09-21", 10, 0).toISOString());
  });
});
