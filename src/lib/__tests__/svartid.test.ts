import { describe, expect, it } from "vitest";
import {
  aeldsteTekst,
  efterHverdagstimer,
  findVentetider,
  hverdagstimerMellem,
  intetVenterStreak,
  median,
  MIN_N,
  streakTekst,
  svartidsUret,
  svartidTal,
  timerTekst,
  toneAf,
  trendAf,
  trendTekst,
  vindueTekst,
  type SvartidBesked,
  type SvartidInput,
  type SvartidSamtale,
  type SvartidTal,
} from "@/lib/svartid";

// Faste tidspunkter i dansk sommertid (UTC+2) — «kbh(…)» er dansk vægtid.
// Kalenderen: 25/9-2026 er fredag, 28/9 mandag, 30/9 onsdag.
const kbh = (s: string) => new Date(`${s}+02:00`);
const R1 = "raadgiver-jonas";
const R2 = "raadgiver-morten";
const M = "medlem-a";

let seq = 0;
const b = (samtale: string, sender: string, tid: string, type = "user"): SvartidBesked => ({
  id: `b${String(++seq).padStart(4, "0")}`,
  conversation_id: samtale,
  sender_id: sender,
  created_at: kbh(tid).toISOString(),
  message_type: type,
});
const samtale = (id: string, company: string | null = "c1", awaiting: string | null = "company"): SvartidSamtale => ({
  id,
  company_id: company,
  awaiting_reply_from: awaiting,
});
const input = (beskeder: SvartidBesked[], samtaler: SvartidSamtale[], nu: string, ekstra: Partial<SvartidInput> = {}): SvartidInput => ({
  beskeder,
  samtaler,
  virksomheder: [
    { id: "c1", name: "Floren Engros", is_demo: false },
    { id: "c2", name: "Bageriet ApS", is_demo: false },
    { id: "demo", name: "Demo ApS", is_demo: true },
  ],
  raadgiverIds: [R1, R2],
  nu: kbh(nu),
  ...ekstra,
});

/** n besvarede ventetider på hver sin samtale, stillet `dag` kl. 09:00, svaret efter `timer` hverdagstimer samme dag. */
const besvaredePaaDag = (dag: string, timer: number[], praefiks: string) => {
  const beskeder: SvartidBesked[] = [];
  const samtaler: SvartidSamtale[] = [];
  timer.forEach((t, i) => {
    const id = `${praefiks}${i}`;
    samtaler.push(samtale(id));
    beskeder.push(b(id, M, `${dag}T09:00:00`));
    const svar = new Date(kbh(`${dag}T09:00:00`).getTime() + t * 3_600_000);
    beskeder.push({ ...b(id, R1, `${dag}T09:00:00`), created_at: svar.toISOString() });
  });
  return { beskeder, samtaler };
};

describe("hverdagstimerMellem — husets ur (hverdage 07–17)", () => {
  it("samme hverdag, inden for vinduet", () => {
    expect(hverdagstimerMellem(kbh("2026-09-29T09:00:00"), kbh("2026-09-29T11:30:00"))).toBe(2.5);
  });
  it("før 07 og efter 17 klippes: hele dagen = 10 t", () => {
    expect(hverdagstimerMellem(kbh("2026-09-29T05:00:00"), kbh("2026-09-29T20:00:00"))).toBe(10);
  });
  it("fredag 16:00 → mandag 08:30 = (17 − 16) + (08:30 − 07:00) = 1 + 1,5 = 2,5 t (weekenden tæller ikke)", () => {
    expect(hverdagstimerMellem(kbh("2026-09-25T16:00:00"), kbh("2026-09-28T08:30:00"))).toBe(2.5);
  });
  it("kl. 16–17 tæller (Jonas' 17, ikke sendevinduets 16)", () => {
    expect(hverdagstimerMellem(kbh("2026-09-29T16:00:00"), kbh("2026-09-29T17:00:00"))).toBe(1);
  });
  it("lukkedag og helligdag tæller ikke: onsdag 23/12 16:00 → mandag 28/12 08:00 = 1 + 1 = 2 t", () => {
    // 24/12 (torsdag) er husets lukkedag, 25/12 juledag, 26–27/12 weekend → første hverdag 28/12.
    expect(hverdagstimerMellem(kbh("2026-12-23T16:00:00"), kbh("2026-12-28T08:00:00"))).toBe(2);
  });
  it("omvendt rækkefølge = 0", () => {
    expect(hverdagstimerMellem(kbh("2026-09-29T11:00:00"), kbh("2026-09-29T09:00:00"))).toBe(0);
  });
});

describe("efterHverdagstimer — omvendt af hverdagstimerMellem", () => {
  it("24 hverdagstimer fra tirsdag 09:00 = torsdag 13:00 (8 + 10 + 6)", () => {
    expect(efterHverdagstimer(kbh("2026-09-29T09:00:00"), 24).toISOString()).toBe(kbh("2026-10-01T13:00:00").toISOString());
  });
  it("fra fredag 16:00 springer weekenden over: 3 t = mandag 09:00", () => {
    expect(efterHverdagstimer(kbh("2026-09-25T16:00:00"), 3).toISOString()).toBe(kbh("2026-09-28T09:00:00").toISOString());
  });
  it("rundtur: hverdagstimerMellem(fra, efterHverdagstimer(fra, t)) = t", () => {
    const fra = kbh("2026-09-24T14:17:00");
    expect(hverdagstimerMellem(fra, efterHverdagstimer(fra, 24))).toBeCloseTo(24, 9);
  });
});

describe("median — som percentile_cont(0.5)", () => {
  it("lige antal interpoleres, ulige tager midten, tom = null", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
  });
});

describe("findVentetider — reglerne", () => {
  it("første medlemsbesked efter sidste svar starter uret; tre i træk er ÉN ventetid", () => {
    const q = findVentetider(
      input(
        [
          b("s1", M, "2026-09-29T09:00:00"),
          b("s1", M, "2026-09-29T09:10:00"),
          b("s1", M, "2026-09-29T09:20:00"),
          b("s1", R2, "2026-09-29T10:00:00"),
          b("s1", R1, "2026-09-29T10:05:00"),
        ],
        [samtale("s1")],
        "2026-09-30T12:00:00",
      ),
    );
    expect(q).toHaveLength(1);
    expect(q[0].status).toBe("besvaret");
    expect(q[0].hverdagstimer).toBe(1);
    expect(q[0].raaTimer).toBe(1);
  });

  it("systembeskeder tæller ikke — heller ikke med en rådgivers sender_id", () => {
    const q = findVentetider(
      input(
        [
          b("s1", M, "2026-09-29T09:00:00"),
          b("s1", R1, "2026-09-29T09:05:00", "welcome"),
          b("s1", R1, "2026-09-29T09:06:00", "reflection-nudge"),
          b("s1", R1, "2026-09-29T09:07:00", "system"),
          b("s1", R1, "2026-09-29T11:00:00"),
        ],
        [samtale("s1")],
        "2026-09-30T12:00:00",
      ),
    );
    expect(q).toHaveLength(1);
    expect(q[0].hverdagstimer).toBe(2);
  });

  it("en ubesvaret sidste besked venter kun, når samtalen venter på rådgiveren", () => {
    const q = findVentetider(
      input(
        [b("s1", M, "2026-09-30T09:00:00"), b("s2", M, "2026-09-30T09:00:00")],
        [samtale("s1", "c1", "advisor"), samtale("s2", "c2", null)],
        "2026-09-30T12:00:00",
      ),
    );
    expect(q.map((v) => v.status).sort()).toEqual(["afgjort_uden_svar", "venter"]);
    const venter = q.find((v) => v.status === "venter")!;
    expect(venter.hverdagstimer).toBe(3);
    expect(q.find((v) => v.status === "afgjort_uden_svar")!.hverdagstimer).toBeNull();
  });

  it("demo-virksomheder og ukendte samtaler tælles ikke", () => {
    const q = findVentetider(
      input(
        [b("d", M, "2026-09-29T09:00:00"), b("d", R1, "2026-09-29T10:00:00"), b("ukendt", M, "2026-09-29T09:00:00")],
        [samtale("d", "demo")],
        "2026-09-30T12:00:00",
      ),
    );
    expect(q).toHaveLength(0);
  });

  it("en rådgiverbesked uden forudgående medlemsbesked starter intet", () => {
    const q = findVentetider(input([b("s1", R1, "2026-09-29T09:00:00")], [samtale("s1")], "2026-09-30T12:00:00"));
    expect(q).toHaveLength(0);
  });
});

describe("svartidTal — vinduer, for få og andele", () => {
  const nu = "2026-09-30T12:00:00";

  it("median og gennemsnit over besvarede i 7 dage, begge ure", () => {
    const d = besvaredePaaDag("2026-09-29", [1, 2, 3, 4, 10], "a");
    const t = svartidTal(findVentetider(input(d.beskeder, d.samtaler, nu)), kbh(nu), 7);
    expect(t.n).toBe(5);
    expect(t.forFaa).toBe(false);
    expect(t.medianHverdagstimer).toBe(3);
    expect(t.gennemsnitHverdagstimer).toBeCloseTo((1 + 2 + 3 + 4 + 8) / 5, 9); // 3,6
    // 10 hverdagstimer fra 09:00 er 19:00 i kalendertid → hverdagsuret stopper kl. 17 (8 t), råt 10 t.
    expect(t.medianRaaTimer).toBe(3);
  });

  it("under MIN_N er for få", () => {
    const d = besvaredePaaDag("2026-09-29", [1, 2], "a");
    const t = svartidTal(findVentetider(input(d.beskeder, d.samtaler, nu)), kbh(nu), 7);
    expect(t.forFaa).toBe(true);
    expect(MIN_N).toBe(5);
  });

  it("andel inden for 4 t / 24 t: ventende over grænsen er i nævneren, under grænsen ikke", () => {
    const d = besvaredePaaDag("2026-09-29", [1, 2, 3, 5], "a"); // 3 af 4 inden for 4 t
    const beskeder = [
      ...d.beskeder,
      b("v1", M, "2026-09-30T07:00:00"), // venter 5 hverdagstimer: over 4 t, under 24 t
      b("v2", M, "2026-09-30T11:00:00"), // venter 1 t: endnu ikke afgjort
    ];
    const samtaler = [...d.samtaler, samtale("v1", "c1", "advisor"), samtale("v2", "c2", "advisor")];
    const t = svartidTal(findVentetider(input(beskeder, samtaler, nu)), kbh(nu), 7);
    expect(t.afgjorte4t).toBe(5);
    expect(t.andelInden4t).toBeCloseTo(3 / 5, 9);
    expect(t.afgjorte24t).toBe(4);
    expect(t.andelInden24t).toBe(1);
  });

  it("forskudt vindue: de 7 dage før de seneste 7", () => {
    const gammel = besvaredePaaDag("2026-09-21", [2, 2, 2, 2, 2], "g"); // 9 dage før nu
    const ny = besvaredePaaDag("2026-09-29", [1, 1, 1, 1, 1], "n");
    const alle = findVentetider(input([...gammel.beskeder, ...ny.beskeder], [...gammel.samtaler, ...ny.samtaler], nu));
    expect(svartidTal(alle, kbh(nu), 7).medianHverdagstimer).toBe(1);
    expect(svartidTal(alle, kbh(nu), 7, 7).medianHverdagstimer).toBe(2);
    expect(svartidTal(alle, kbh(nu), 30).n).toBe(10);
  });
});

describe("toneAf og trendAf", () => {
  const tal = (median: number | null, forFaa = false): SvartidTal => ({
    n: forFaa ? 1 : 10,
    forFaa,
    medianHverdagstimer: median,
    gennemsnitHverdagstimer: median,
    medianRaaTimer: median,
    gennemsnitRaaTimer: median,
    andelInden4t: null,
    andelInden24t: null,
    afgjorte4t: 0,
    afgjorte24t: 0,
  });
  it("grøn ≤ 4 t, gul ≤ 24 t, rød > 24 t, for få = neutral", () => {
    expect(toneAf(tal(4))).toBe("groen");
    expect(toneAf(tal(4.01))).toBe("gul");
    expect(toneAf(tal(24))).toBe("gul");
    expect(toneAf(tal(24.5))).toBe("roed");
    expect(toneAf(tal(1, true))).toBe("neutral");
  });
  it("trend: lavere median er hurtigere; for få i en af ugerne giver ingen trend", () => {
    expect(trendAf(tal(2), tal(3.5))).toEqual({ forskel: -1.5, retning: "hurtigere" });
    expect(trendAf(tal(5), tal(3))!.retning).toBe("langsommere");
    expect(trendAf(tal(3.02), tal(3))!.retning).toBe("uaendret");
    expect(trendAf(tal(2), tal(3, true))).toBeNull();
    expect(trendTekst(trendAf(tal(2), tal(3.5)))).toBe("1,5 t hurtigere end de 7 dage før");
  });
});

describe("intetVenterStreak — dage uden noget over 24 hverdagstimer", () => {
  const nu = "2026-09-30T12:00:00"; // onsdag

  it("intet har ventet: streaken er hele vinduet, «mindst»", () => {
    const s = intetVenterStreak([], kbh(nu));
    expect(s).toEqual({ dage: 30, mindst: true, brudtNu: false });
    expect(streakTekst(s)).toBe("Mindst 30 dage i træk uden noget, der har ventet over 24 t.");
  });

  it("en besvaret, der krydsede 24 t i går, bryder i går: streaken er 1 (i dag)", () => {
    // Stillet fredag 25/9 09:00; 24 hverdagstimer = 8 (fre) + 10 (man) + 6 (tir) → tirsdag 29/9 13:00. Svaret tirsdag 15:00.
    const alle = findVentetider(input([b("s1", M, "2026-09-25T09:00:00"), b("s1", R1, "2026-09-29T15:00:00")], [samtale("s1")], nu));
    expect(intetVenterStreak(alle, kbh(nu))).toEqual({ dage: 1, mindst: false, brudtNu: false });
  });

  it("en besvaret lige under 24 hverdagstimer bryder ikke — weekenden tæller ikke", () => {
    // Fredag 25/9 16:00 → mandag 28/9 08:30 = 2,5 hverdagstimer, men 64,5 rå timer.
    const alle = findVentetider(input([b("s1", M, "2026-09-25T16:00:00"), b("s1", R1, "2026-09-28T08:30:00")], [samtale("s1")], nu));
    expect(intetVenterStreak(alle, kbh(nu)).dage).toBe(30);
  });

  it("noget venter over 24 t nu: streaken er 0 og brudt", () => {
    const alle = findVentetider(input([b("s1", M, "2026-09-25T09:00:00")], [samtale("s1", "c1", "advisor")], nu));
    const s = intetVenterStreak(alle, kbh(nu));
    expect(s).toEqual({ dage: 0, mindst: false, brudtNu: true });
    expect(streakTekst(s)).toMatch(/^Noget har ventet over 24 t/);
  });

  it("«Kræver ikke svar» bryder aldrig", () => {
    const alle = findVentetider(input([b("s1", M, "2026-09-10T09:00:00")], [samtale("s1", "c1", null)], nu));
    expect(intetVenterStreak(alle, kbh(nu)).dage).toBe(30);
  });
});

describe("svartidsUret — hele dommen", () => {
  it("ældste ubesvarede med virksomhed, antal ventende, 7/30 dage og tone", () => {
    const nu = "2026-09-30T12:00:00";
    const d = besvaredePaaDag("2026-09-29", [1, 2, 3, 4, 5], "a");
    const beskeder = [...d.beskeder, b("v1", M, "2026-09-30T07:00:00"), b("v2", M, "2026-09-30T10:00:00")];
    const samtaler = [...d.samtaler, samtale("v1", "c2", "advisor"), samtale("v2", "c1", "advisor")];
    const dom = svartidsUret(input(beskeder, samtaler, nu));
    expect(dom.uge.medianHverdagstimer).toBe(3);
    expect(dom.tone).toBe("groen");
    expect(dom.maaned.n).toBe(5);
    expect(dom.trend).toBeNull(); // ugen før har ingen svar
    expect(dom.antalVenter).toBe(2);
    expect(dom.aeldsteUbesvarede).toMatchObject({ samtaleId: "v1", companyId: "c2", navn: "Bageriet ApS", hverdagstimer: 5, raaTimer: 5 });
    expect(aeldsteTekst(dom.aeldsteUbesvarede!)).toBe("Bageriet ApS · 5 t");
  });

  it("tomt grundlag: for få, neutral, intet venter", () => {
    const dom = svartidsUret(input([], [], "2026-09-30T12:00:00"));
    expect(dom.uge.forFaa).toBe(true);
    expect(dom.tone).toBe("neutral");
    expect(dom.aeldsteUbesvarede).toBeNull();
    expect(vindueTekst("30 dage", dom.maaned, true)).toBe("30 dage: for få svar (0 af mindst 5)");
  });
});

describe("tekster", () => {
  it("timerTekst", () => {
    expect(timerTekst(0.5)).toBe("30 min");
    expect(timerTekst(3.46)).toBe("3,5 t");
    expect(timerTekst(26.4)).toBe("26 t");
  });
  it("vindueTekst med tal", () => {
    const nu = "2026-09-30T12:00:00";
    const d = besvaredePaaDag("2026-09-29", [1, 2, 3, 4, 5], "a");
    const t = svartidTal(findVentetider(input(d.beskeder, d.samtaler, nu)), kbh(nu), 30);
    expect(vindueTekst("30 dage", t, true)).toBe("30 dage: median 3 t · gns. 3 t · 80 % inden for 4 t · 100 % inden for 24 t · 5 svar");
  });
});
