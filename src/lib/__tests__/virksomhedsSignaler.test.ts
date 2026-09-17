import { describe, it, expect } from "vitest";
import {
  afgoerVirksomhedsSignaler,
  isFiguresFresh,
  RIMELIGHED_FAKTISK_MIN_KR,
  RIMELIGHED_GRUNDLAG_MIN_KR,
  RIMELIGHED_PCT_MAX,
  TAL_SER_FORKERT_UD_ALVOR,
  talSerForkertUd,
  talSerForkertUdTekst,
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

  it("skrevet for 22 dage siden → «Ingen dialog i 22 dage», alvor 61,13", () => {
    const s = afgoerVirksomhedsSignaler(input({ senesteBeskedAt: dageSiden(22) }), NOW);
    const stale = s.find((x) => x.koe === "ikke_hoert_fra_laenge");
    expect(stale?.noegle).toBe("ingen_dialog");
    expect(stale?.tekst).toBe("Ingen dialog i 22 dage");
    expect(stale?.alvor).toBeCloseTo(61.13, 2);
  });

  it("skrevet for præcis 21 dage siden → intet signal (tærsklen er > 21)", () => {
    expect(noegler(input({ senesteBeskedAt: dageSiden(21) }))).not.toContain("ingen_dialog");
  });

  it("skrevet i går → intet signal", () => {
    expect(noegler(input({ senesteBeskedAt: dageSiden(1) }))).not.toContain("ingen_dialog");
    expect(noegler(input({ senesteBeskedAt: dageSiden(1) }))).not.toContain("aldrig_skrevet");
  });

  // Rettelsen 3/9 kl. 23:36: den første formel loftede ved 90 fra dag 51,
  // så 126 dage fik samme alvor som 57, og indlæsningsrækkefølgen afgjorde.
  const alvorVed = (dage: number) => afgoerVirksomhedsSignaler(input({ senesteBeskedAt: dageSiden(dage) }), NOW)[0].alvor;

  it("regnestykket fra filhovedet: dag 30 → 68,08, dag 60 → 79,78, dag 86 → 83,95, dag 126 → 87,22, dag 365 → 92,19", () => {
    expect(alvorVed(30)).toBeCloseTo(68.08, 2);
    expect(alvorVed(60)).toBeCloseTo(79.78, 2);
    expect(alvorVed(86)).toBeCloseTo(83.95, 2);
    expect(alvorVed(126)).toBeCloseTo(87.22, 2);
    expect(alvorVed(365)).toBeCloseTo(92.19, 2);
  });

  it("flest dage øverst: 126 over 86, 86 over 57 — ingen klump", () => {
    expect(alvorVed(126)).toBeGreaterThan(alvorVed(86));
    expect(alvorVed(86)).toBeGreaterThan(alvorVed(57));
    expect(alvorVed(57)).toBeGreaterThan(alvorVed(22));
  });

  it("aldrig skrevet (95) ligger over enhver tavshed — også 10 år", () => {
    const aldrig = afgoerVirksomhedsSignaler(input({ senesteBeskedAt: null }), NOW)[0].alvor;
    expect(aldrig).toBe(95);
    expect(alvorVed(126)).toBeLessThan(aldrig);
    expect(alvorVed(3650)).toBeLessThan(aldrig);
  });

  it("skalaen holder: omsætningsfald (80) overhales ved dag 61, bankovertræk (90) ved dag 201", () => {
    expect(alvorVed(60)).toBeLessThan(80);
    expect(alvorVed(61)).toBeCloseTo(80, 6);
    expect(alvorVed(62)).toBeGreaterThan(80);
    expect(alvorVed(200)).toBeLessThan(90);
    expect(alvorVed(201)).toBeCloseTo(90, 6);
    expect(alvorVed(202)).toBeGreaterThan(90);
  });

  it("den rækkefølge der var forkert i drift (57, 126, 66, 85, 86, 78, 59, 86, 77, 45) sorteres nu faldende på dage", () => {
    const dage = [57, 126, 66, 85, 86, 78, 59, 86, 77, 45];
    const signaler = dage.map((d) => afgoerVirksomhedsSignaler(input({ senesteBeskedAt: dageSiden(d) }), NOW)[0]);
    const sorteret = [...signaler].sort((a, b) => b.alvor - a.alvor).map((s) => s.tekst);
    expect(sorteret).toEqual([
      "Ingen dialog i 126 dage",
      "Ingen dialog i 86 dage",
      "Ingen dialog i 86 dage",
      "Ingen dialog i 85 dage",
      "Ingen dialog i 78 dage",
      "Ingen dialog i 77 dage",
      "Ingen dialog i 66 dage",
      "Ingen dialog i 59 dage",
      "Ingen dialog i 57 dage",
      "Ingen dialog i 45 dage",
    ]);
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
  // Valg 6 gjaldt FORFALDNE milepæle og løftestænger: motoren giver ingen
  // signaler for dem, og det er uændret. «Én plan» fase 4 (16/9) tilføjer
  // «mål uden bevægelse» — men som FORSIDENS egen slags (forsidensDom
  // maal_uden_bevaegelse, regnet af planen.ts), IKKE som et signal her.
  // Motoren kender stadig hverken progress_updated_at eller antallet aktive.
  // Før (ordret): it("forfaldne milestones og løftestænger giver INGEN signaler", …) — samme forventning, ny begrundelse.
  it("forfaldne milestones og løftestænger giver INGEN signaler — «uden bevægelse» er forsidensDoms slags, ikke motorens", () => {
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

describe("kø 8: stamdata mangler — CVR-opslaget lykkedes ikke ved oprettelsen (14/9, lib/cvrBerigelse.ts)", () => {
  const ramt = { cvr_number: "46415124", cvr_fetched_at: null, address: null, industry_code: null };

  it("uden stamdata i inputtet (forsiden) gives intet signal", () => {
    expect(noegler(input())).not.toContain("cvr_opslag_mangler");
  });

  it("gyldigt CVR, intet opslag, tomme felter → signalet, i sin egen kø, alvor 50, med handlingen som detalje", () => {
    const s = afgoerVirksomhedsSignaler(input({ stamdata: ramt }), NOW).find((x) => x.noegle === "cvr_opslag_mangler");
    expect(s).toBeDefined();
    expect(s!.koe).toBe("stamdata_mangler");
    expect(s!.alvor).toBe(50);
    expect(s!.tekst).toBe("CVR-opslag mangler — adresse og branchekode står tomt");
    expect(s!.detalje).toContain("berig-virksomheder");
  });

  it("er felterne fyldt, eller lykkedes opslaget, gives intet signal", () => {
    expect(noegler(input({ stamdata: { ...ramt, address: "Vestergade 1", industry_code: "retail_fashion" } }))).not.toContain("cvr_opslag_mangler");
    expect(noegler(input({ stamdata: { ...ramt, cvr_fetched_at: "2026-09-14T08:10:15Z" } }))).not.toContain("cvr_opslag_mangler");
    expect(noegler(input({ stamdata: { ...ramt, cvr_number: null } }))).not.toContain("cvr_opslag_mangler");
  });

  it("alvor 50 ligger under agentforslag (55) og over «over budget» (40)", () => {
    const signaler = afgoerVirksomhedsSignaler(
      input({ stamdata: ramt, agentforslagVenter: 1, budgetOmsaetning: 80_000 }),
      NOW,
    );
    const raekkefoelge = signaler.map((x) => x.noegle);
    expect(raekkefoelge.indexOf("agentforslag_venter")).toBeLessThan(raekkefoelge.indexOf("cvr_opslag_mangler"));
    expect(raekkefoelge.indexOf("cvr_opslag_mangler")).toBeLessThan(raekkefoelge.indexOf("budget_over"));
  });
});

describe("Rimelighedsdommen (valg 8, 17/9) — tal der ikke kan passe bliver «tjek tallet», ikke en procent", () => {
  it("grænserne står som VALG: 500 %, 1.000 kr., 50.000 kr., alvor 50", () => {
    expect(RIMELIGHED_PCT_MAX).toBe(500);
    expect(RIMELIGHED_GRUNDLAG_MIN_KR).toBe(1000);
    expect(RIMELIGHED_FAKTISK_MIN_KR).toBe(50_000);
    expect(TAL_SER_FORKERT_UD_ALVOR).toBe(50);
  });

  it("talSerForkertUd: over 500 % til hver side, eller grundlag < 1.000 mod faktisk > 50.000; præcis på grænsen er rimeligt", () => {
    expect(talSerForkertUd(500, 100_000, 600_000)).toBe(false);
    expect(talSerForkertUd(500.1, 100_000, 600_100)).toBe(true);
    expect(talSerForkertUd(-500.1, 100_000, -400_100)).toBe(true);
    expect(talSerForkertUd(20, 999, 50_001)).toBe(true);
    expect(talSerForkertUd(20, 1000, 50_001)).toBe(false);
    expect(talSerForkertUd(20, 999, 50_000)).toBe(false);
    expect(talSerForkertUd(null, null, null)).toBe(false);
  });

  it("Doggybed 2026-08 ordret (prod 17/9 15:33): faktisk 7.656,76 kr. mod budget 35 kr. → IKKE «Omsætning 21776% over budgetteret», men «Tallet ser forkert ud — tjek budgettet for Aug 2026»", () => {
    const s = afgoerVirksomhedsSignaler(input({ senesteFact: fact({ omsaetning: 7656.76 }), budgetOmsaetning: 35 }), NOW);
    // Den gamle dom ville have givet præcis dette (regnet: (7656,76 − 35) / 35 × 100 = 21776,46):
    expect(Math.round(((7656.76 - 35) / 35) * 100)).toBe(21776);
    expect(s.map((x) => x.tekst)).not.toContain("Omsætning 21776% over budgetteret");
    expect(s.map((x) => x.noegle)).not.toContain("budget_over");
    const t = s.find((x) => x.noegle === "tal_ser_forkert_ud");
    expect(t).toMatchObject({
      koe: "stikker_ud",
      alvor: 50,
      tekst: "Tallet ser forkert ud — tjek budgettet for Aug 2026",
      detalje: "Faktisk 7.657 kr. mod budget 35 kr.",
    });
  });

  it("et budget på 999 kr. mod faktisk 50.001 kr. er forkert (grundlagsreglen), selv om procenten er lille — 1.000 kr. mod 1.100 kr. er ikke", () => {
    expect(noegler(input({ senesteFact: fact({ omsaetning: 50_001 }), budgetOmsaetning: 999 }))).toContain("tal_ser_forkert_ud");
    const s = noegler(input({ senesteFact: fact({ omsaetning: 1100 }), budgetOmsaetning: 1000 }));
    expect(s).not.toContain("tal_ser_forkert_ud");
    expect(s).not.toContain("budget_over"); // 10 % — under tærsklen
  });

  it("et rigtigt budgetsignal er uændret: 85.000 mod 100.000 → budget_under, ingen rimelighedslinje", () => {
    const s = noegler(input({ senesteFact: fact({ omsaetning: 85_000 }), budgetOmsaetning: 100_000 }));
    expect(s).toContain("budget_under");
    expect(s).not.toContain("tal_ser_forkert_ud");
  });

  it("MoM: forrige måned 10 kr. mod 100.000 kr. → «tjek tallene», intet faldsignal; begge retninger dømmes", () => {
    const op = afgoerVirksomhedsSignaler(
      input({ forrigeFact: fact({ period_key: "2026-07", period_label: "Jul 2026", omsaetning: 10 }), senesteFact: fact({ omsaetning: 100_000 }) }),
      NOW,
    );
    expect(op.find((x) => x.noegle === "tal_ser_forkert_ud")).toMatchObject({
      tekst: "Tallet ser forkert ud — tjek tallene for Aug 2026",
      detalje: "Omsætning 10 kr. → 100.000 kr.",
    });
    const ned = afgoerVirksomhedsSignaler(
      input({ forrigeFact: fact({ period_key: "2026-07", period_label: "Jul 2026", resultat_foer_skat: -100 }), senesteFact: fact({ resultat_foer_skat: -10_000 }) }),
      NOW,
    );
    expect(ned.map((x) => x.noegle)).not.toContain("resultatfald_mom");
    expect(ned.find((x) => x.noegle === "tal_ser_forkert_ud")?.detalje).toBe("Resultat f. skat -100 kr. → -10.000 kr.");
  });

  it("rammer både budget og M/M → ÉN linje: «tjek budgettet og tallene», detaljerne samlet med ·", () => {
    const s = afgoerVirksomhedsSignaler(
      input({ forrigeFact: fact({ period_key: "2026-07", period_label: "Jul 2026", omsaetning: 10 }), senesteFact: fact({ omsaetning: 100_000 }), budgetOmsaetning: 35 }),
      NOW,
    );
    const linjer = s.filter((x) => x.noegle === "tal_ser_forkert_ud");
    expect(linjer).toHaveLength(1);
    expect(linjer[0].tekst).toBe("Tallet ser forkert ud — tjek budgettet og tallene for Aug 2026");
    expect(linjer[0].detalje).toBe("Omsætning 10 kr. → 100.000 kr. · Faktisk 100.000 kr. mod budget 35 kr.");
  });

  it("gamle tal: rimelighedsdommen er under friskhedsgaten som resten af køen", () => {
    const s = noegler(input({ senesteFact: fact({ period_key: "2026-03", period_label: "Mar 2026", omsaetning: 7656.76 }), budgetOmsaetning: 35 }));
    expect(s).not.toContain("tal_ser_forkert_ud");
    expect(s).not.toContain("budget_over");
  });

  it("teksten: ét eller to ting at tjekke", () => {
    expect(talSerForkertUdTekst(["budgettet"], "Aug 2026")).toBe("Tallet ser forkert ud — tjek budgettet for Aug 2026");
    expect(talSerForkertUdTekst(["tallene"], "Aug 2026")).toBe("Tallet ser forkert ud — tjek tallene for Aug 2026");
    expect(talSerForkertUdTekst(["tallene", "budgettet"], "Aug 2026")).toBe("Tallet ser forkert ud — tjek budgettet og tallene for Aug 2026");
  });
});
