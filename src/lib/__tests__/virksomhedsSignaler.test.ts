import { describe, it, expect } from "vitest";
import {
  afgoerVirksomhedsSignaler,
  isFiguresFresh,
  type FactPunkt,
  type VirksomhedsInput,
} from "@/lib/virksomhedsSignaler";

// Fast «nu»: 3. september 2026 kl. 12:00 UTC. Friske perioder er da
// juni, juli, august og september 2026 (cutoff = 1. juni).
const NOW = new Date("2026-09-03T12:00:00Z");

function dageSiden(n: number): string {
  return new Date(NOW.getTime() - n * 86400000).toISOString();
}

function fact(over: Partial<FactPunkt> = {}): FactPunkt {
  return {
    period_key: "2026-08",
    period_label: "Aug 2026",
    omsaetning: 100_000,
    resultat_foer_skat: 10_000,
    bank_balance: 50_000,
    ...over,
  };
}

/** Grundinput uden signaler: skrevet i går, ingen ulæste, sunde friske tal, intet budget. */
function input(over: Partial<VirksomhedsInput> = {}): VirksomhedsInput {
  return {
    senesteFact: fact(),
    forrigeFact: fact({ period_key: "2026-07", period_label: "Jul 2026" }),
    senesteCommittedAt: dageSiden(30),
    budgetOmsaetning: null,
    forfaldneMilestones: 0,
    loeftestaenger: 0,
    ulaesteBeskeder: 0,
    senesteBeskedAt: dageSiden(1),
    harCommittedeTal: true,
    agentforslagVenter: 0,
    ...over,
  };
}

const noegler = (i: VirksomhedsInput) => afgoerVirksomhedsSignaler(i, NOW).map((s) => s.noegle);

describe("isFiguresFresh — flyttet ordret fra AdvisorDashboard", () => {
  it("periode inden for tre kalendermåneder er frisk", () => {
    expect(isFiguresFresh("2026-08", NOW)).toBe(true);
    expect(isFiguresFresh("2026-06", NOW)).toBe(true);
  });
  it("periode ældre end tre kalendermåneder er ikke frisk", () => {
    expect(isFiguresFresh("2026-05", NOW)).toBe(false);
    expect(isFiguresFresh("2025-12", NOW)).toBe(false);
  });
  it("null, tom og uparsbar periode er ikke frisk (fejler til at skjule)", () => {
    expect(isFiguresFresh(null, NOW)).toBe(false);
    expect(isFiguresFresh(undefined, NOW)).toBe(false);
    expect(isFiguresFresh("", NOW)).toBe(false);
    expect(isFiguresFresh("2026-13", NOW)).toBe(false);
    expect(isFiguresFresh("august", NOW)).toBe(false);
  });
});

describe("Ikke hørt fra længe — den vendte regel (designets §3.5)", () => {
  it("aldrig skrevet → MED, alvor 95, tekst «Har aldrig skrevet»", () => {
    const s = afgoerVirksomhedsSignaler(input({ senesteBeskedAt: null }), NOW);
    const stale = s.find((x) => x.koe === "ikke_hoert_fra_laenge");
    expect(stale?.noegle).toBe("aldrig_skrevet");
    expect(stale?.tekst).toBe("Har aldrig skrevet");
    expect(stale?.alvor).toBe(95);
  });

  it("aldrig skrevet tæller også UDEN committede tal (kravet er faldet bort)", () => {
    const s = afgoerVirksomhedsSignaler(
      input({ senesteBeskedAt: null, senesteFact: null, forrigeFact: null, senesteCommittedAt: null, harCommittedeTal: false }),
      NOW,
    );
    expect(s.map((x) => x.noegle)).toContain("aldrig_skrevet");
  });

  it("skrevet for 22 dage siden → «Ingen dialog i 22 dage», alvor 61", () => {
    const s = afgoerVirksomhedsSignaler(input({ senesteBeskedAt: dageSiden(22) }), NOW);
    const stale = s.find((x) => x.koe === "ikke_hoert_fra_laenge");
    expect(stale?.noegle).toBe("ingen_dialog");
    expect(stale?.tekst).toBe("Ingen dialog i 22 dage");
    expect(stale?.alvor).toBe(61);
  });

  it("skrevet for præcis 21 dage siden → intet signal (tærsklen er > 21)", () => {
    expect(noegler(input({ senesteBeskedAt: dageSiden(21) }))).not.toContain("ingen_dialog");
  });

  it("skrevet i går → intet signal", () => {
    expect(noegler(input({ senesteBeskedAt: dageSiden(1) }))).not.toContain("ingen_dialog");
    expect(noegler(input({ senesteBeskedAt: dageSiden(1) }))).not.toContain("aldrig_skrevet");
  });

  it("alvor for tavshed loftes ved 90 (dag 51 og derover), så aldrig skrevet altid ligger over", () => {
    const dag51 = afgoerVirksomhedsSignaler(input({ senesteBeskedAt: dageSiden(51) }), NOW)[0];
    const dag200 = afgoerVirksomhedsSignaler(input({ senesteBeskedAt: dageSiden(200) }), NOW)[0];
    expect(dag51.alvor).toBe(90);
    expect(dag200.alvor).toBe(90);
    expect(dag200.alvor).toBeLessThan(95);
  });
});

describe("Venter på dit svar", () => {
  it("én ulæst besked → «1 ulæst besked», alvor 71", () => {
    const s = afgoerVirksomhedsSignaler(input({ ulaesteBeskeder: 1 }), NOW).find((x) => x.koe === "venter_paa_svar");
    expect(s?.tekst).toBe("1 ulæst besked");
    expect(s?.alvor).toBe(71);
  });
  it("tre ulæste → flertal og alvor 73", () => {
    const s = afgoerVirksomhedsSignaler(input({ ulaesteBeskeder: 3 }), NOW).find((x) => x.koe === "venter_paa_svar");
    expect(s?.tekst).toBe("3 ulæste beskeder");
    expect(s?.alvor).toBe(73);
  });
  it("nul ulæste → intet signal", () => {
    expect(noegler(input({ ulaesteBeskeder: 0 }))).not.toContain("ulaeste_beskeder");
  });
});

describe("Stikker ud — bankovertræk med friskhedsgate (valg 1)", () => {
  it("bankovertræk med friske tal → signal, alvor 90", () => {
    const s = afgoerVirksomhedsSignaler(input({ senesteFact: fact({ bank_balance: -5_000 }) }), NOW);
    const bank = s.find((x) => x.noegle === "bankovertraek");
    expect(bank?.alvor).toBe(90);
    expect(bank?.koe).toBe("stikker_ud");
  });

  it("bankovertræk med GAMLE tal → IKKE et signal", () => {
    const s = noegler(input({ senesteFact: fact({ period_key: "2026-03", period_label: "Mar 2026", bank_balance: -5_000 }) }));
    expect(s).not.toContain("bankovertraek");
  });

  it("bank præcis 0 er ikke overtræk", () => {
    expect(noegler(input({ senesteFact: fact({ bank_balance: 0 }) }))).not.toContain("bankovertraek");
  });
});

describe("Stikker ud — MoM (valg 2 og 3)", () => {
  it("omsætningsfald præcis på tærsklen (−15 %) → signal, alvor 80", () => {
    const s = afgoerVirksomhedsSignaler(
      input({ forrigeFact: fact({ period_key: "2026-07", omsaetning: 100_000 }), senesteFact: fact({ omsaetning: 85_000 }) }),
      NOW,
    );
    const mom = s.find((x) => x.noegle === "omsaetningsfald_mom");
    expect(mom?.alvor).toBe(80);
    expect(mom?.tekst).toBe("Omsætning faldt 15% MoM");
  });

  it("omsætningsfald lige under tærsklen (−14,9 %) → intet signal", () => {
    const s = noegler(input({ forrigeFact: fact({ period_key: "2026-07", omsaetning: 100_000 }), senesteFact: fact({ omsaetning: 85_100 }) }));
    expect(s).not.toContain("omsaetningsfald_mom");
  });

  it("omsætningsSTIGNING på 20 % → intet signal (kun fald stikker ud)", () => {
    const s = noegler(input({ forrigeFact: fact({ period_key: "2026-07", omsaetning: 100_000 }), senesteFact: fact({ omsaetning: 120_000 }) }));
    expect(s).not.toContain("omsaetningsfald_mom");
  });

  it("omsætningsfald med gamle tal → intet signal (friskhedsgate gælder også MoM)", () => {
    const s = noegler(
      input({
        forrigeFact: fact({ period_key: "2026-02", omsaetning: 100_000 }),
        senesteFact: fact({ period_key: "2026-03", period_label: "Mar 2026", omsaetning: 50_000 }),
      }),
    );
    expect(s).not.toContain("omsaetningsfald_mom");
  });

  it("resultatfald 50 % med negativ forrige (−100 → −150) → signal, alvor 70 (abs-nævner)", () => {
    const s = afgoerVirksomhedsSignaler(
      input({ forrigeFact: fact({ period_key: "2026-07", resultat_foer_skat: -100 }), senesteFact: fact({ resultat_foer_skat: -150 }) }),
      NOW,
    );
    const res = s.find((x) => x.noegle === "resultatfald_mom");
    expect(res?.alvor).toBe(70);
    expect(res?.tekst).toBe("Resultat f. skat faldt 50% MoM");
  });

  it("uden forrige fact kan MoM ikke regnes → intet MoM-signal", () => {
    const s = noegler(input({ forrigeFact: null, senesteFact: fact({ omsaetning: 10 }) }));
    expect(s).not.toContain("omsaetningsfald_mom");
    expect(s).not.toContain("resultatfald_mom");
  });
});

describe("Stikker ud — budgetafvigelse over 10 %", () => {
  it("omsætning 15 % under budget → «budget_under», alvor 50", () => {
    const s = afgoerVirksomhedsSignaler(input({ senesteFact: fact({ omsaetning: 85_000 }), budgetOmsaetning: 100_000 }), NOW);
    const b = s.find((x) => x.noegle === "budget_under");
    expect(b?.alvor).toBe(50);
    expect(b?.tekst).toBe("Omsætning 15% under budgetteret");
    expect(b?.detalje).toBe("Faktisk 85.000 kr. mod budget 100.000 kr.");
  });

  it("omsætning 15 % over budget → «budget_over», alvor 40", () => {
    const s = afgoerVirksomhedsSignaler(input({ senesteFact: fact({ omsaetning: 115_000 }), budgetOmsaetning: 100_000 }), NOW);
    const b = s.find((x) => x.noegle === "budget_over");
    expect(b?.alvor).toBe(40);
  });

  it("afvigelse på præcis 10 % → intet signal (tærsklen er > 10)", () => {
    expect(noegler(input({ senesteFact: fact({ omsaetning: 90_000 }), budgetOmsaetning: 100_000 }))).not.toContain("budget_under");
    expect(noegler(input({ senesteFact: fact({ omsaetning: 110_000 }), budgetOmsaetning: 100_000 }))).not.toContain("budget_over");
  });

  it("afvigelse på 5 % → intet signal", () => {
    expect(noegler(input({ senesteFact: fact({ omsaetning: 95_000 }), budgetOmsaetning: 100_000 }))).not.toContain("budget_under");
  });

  it("budget 0 eller null → intet signal", () => {
    expect(noegler(input({ budgetOmsaetning: 0 }))).not.toContain("budget_under");
    expect(noegler(input({ budgetOmsaetning: null }))).not.toContain("budget_under");
  });

  it("budgetafvigelse med gamle tal → intet signal (friskhedsgate, valg 1)", () => {
    const s = noegler(input({ senesteFact: fact({ period_key: "2026-03", omsaetning: 50_000 }), budgetOmsaetning: 100_000 }));
    expect(s).not.toContain("budget_under");
  });
});

describe("Stikker ud — uden friske facts gives INTET (valg 4, konsekvensen)", () => {
  it("ingen facts overhovedet → ingen tal-signaler, selv med budget", () => {
    const s = afgoerVirksomhedsSignaler(
      input({ senesteFact: null, forrigeFact: null, senesteCommittedAt: null, harCommittedeTal: false, budgetOmsaetning: 100_000 }),
      NOW,
    );
    expect(s.filter((x) => x.koe === "stikker_ud")).toHaveLength(0);
  });

  it("gamle facts (marts) med overtræk, fald og budgetafvigelse → ingen tal-signaler", () => {
    const s = afgoerVirksomhedsSignaler(
      input({
        forrigeFact: fact({ period_key: "2026-02", period_label: "Feb 2026", omsaetning: 100_000 }),
        senesteFact: fact({ period_key: "2026-03", period_label: "Mar 2026", omsaetning: 50_000, bank_balance: -5_000 }),
        budgetOmsaetning: 100_000,
      }),
      NOW,
    );
    expect(s.filter((x) => x.koe === "stikker_ud")).toHaveLength(0);
  });

  it("bank_balance null i friske facts → intet bankovertræk", () => {
    expect(noegler(input({ senesteFact: fact({ bank_balance: null }) }))).not.toContain("bankovertraek");
  });
});

describe("Agentforslag der venter", () => {
  it("to forslag → signal, alvor 55", () => {
    const s = afgoerVirksomhedsSignaler(input({ agentforslagVenter: 2 }), NOW).find((x) => x.koe === "agentforslag_venter");
    expect(s?.tekst).toBe("2 agentforslag venter på din afgørelse");
    expect(s?.alvor).toBe(55);
  });
  it("nul forslag → intet signal", () => {
    expect(noegler(input({ agentforslagVenter: 0 }))).not.toContain("agentforslag_venter");
  });
});

describe("Friske tal", () => {
  it("committed for 10 dage siden → «Ny rapport for Aug 2026», alvor 30", () => {
    const s = afgoerVirksomhedsSignaler(input({ senesteCommittedAt: dageSiden(10) }), NOW).find((x) => x.koe === "friske_tal");
    expect(s?.tekst).toBe("Ny rapport for Aug 2026");
    expect(s?.alvor).toBe(30);
  });
  it("committed for 15 dage siden → intet signal (vinduet er 14 dage)", () => {
    expect(noegler(input({ senesteCommittedAt: dageSiden(15) }))).not.toContain("friske_tal");
  });
  it("uden period_label → «Ny rapport for seneste periode»", () => {
    const s = afgoerVirksomhedsSignaler(
      input({ senesteCommittedAt: dageSiden(1), senesteFact: fact({ period_label: null }) }),
      NOW,
    ).find((x) => x.koe === "friske_tal");
    expect(s?.tekst).toBe("Ny rapport for seneste periode");
  });
});

describe("Ingen data overhovedet", () => {
  it("ingen facts, ingen samtale → præcis ét signal: aldrig skrevet", () => {
    const s = afgoerVirksomhedsSignaler(
      {
        senesteFact: null,
        forrigeFact: null,
        senesteCommittedAt: null,
        budgetOmsaetning: null,
        forfaldneMilestones: 0,
        loeftestaenger: 0,
        ulaesteBeskeder: 0,
        senesteBeskedAt: null,
        harCommittedeTal: false,
        agentforslagVenter: 0,
      },
      NOW,
    );
    expect(s).toHaveLength(1);
    expect(s[0].noegle).toBe("aldrig_skrevet");
  });

  it("sund virksomhed der skrev i går → nul signaler", () => {
    expect(afgoerVirksomhedsSignaler(input(), NOW)).toHaveLength(0);
  });
});

describe("Milestones og løftestænger (valg 6)", () => {
  it("forfaldne milestones og løftestænger giver INGEN signaler", () => {
    expect(afgoerVirksomhedsSignaler(input({ forfaldneMilestones: 3, loeftestaenger: 5 }), NOW)).toHaveLength(0);
  });
});

describe("Sortering", () => {
  it("det alvorligste først: aldrig skrevet (95) > bankovertræk (90) > omsætningsfald (80) > ulæste (71) > agentforslag (55) > budget under (50) > friske tal (30)", () => {
    const s = afgoerVirksomhedsSignaler(
      input({
        senesteBeskedAt: null,
        ulaesteBeskeder: 1,
        agentforslagVenter: 1,
        budgetOmsaetning: 100_000,
        senesteCommittedAt: dageSiden(2),
        forrigeFact: fact({ period_key: "2026-07", omsaetning: 100_000 }),
        senesteFact: fact({ omsaetning: 80_000, bank_balance: -10 }),
      }),
      NOW,
    );
    expect(s.map((x) => x.noegle)).toEqual([
      "aldrig_skrevet",
      "bankovertraek",
      "omsaetningsfald_mom",
      "ulaeste_beskeder",
      "agentforslag_venter",
      "budget_under",
      "friske_tal",
    ]);
    for (let i = 1; i < s.length; i++) expect(s[i - 1].alvor).toBeGreaterThanOrEqual(s[i].alvor);
  });

  it("default now er new Date() når parameteren udelades", () => {
    // Skrevet for 40 dage siden regnet fra RIGTIG nu → ingen dialog i ~40 dage.
    const s = afgoerVirksomhedsSignaler(input({ senesteBeskedAt: new Date(Date.now() - 40 * 86400000).toISOString() }));
    expect(s.map((x) => x.noegle)).toContain("ingen_dialog");
  });
});
