import { describe, expect, it } from "vitest";
import { deriveFocus, deriveNextStep, type FocusInputs, type NextStepInputs } from "../nextStep";

/** Fokus-motoren (forside PR 1): hver kilde, rækkefølgen ved samtidige
    signaler, tom-tilstand og wrapper-regressionsværnet. Fast "nu":
    10. august 2026 → forrige måned = juli 2026 ("2026-07") — samme anker
    som nextStep.test.ts. */
const NOW = new Date(2026, 7, 10);

/** Deadline som ABSOLUT tidsstempel præcis N dage efter NOW —
    tidszone-uafhængigt: motorens ceil-aritmetik regner på epoch-
    differencen, så N·86400000 ms giver altid "N dage tilbage", uanset
    om testen kører i UTC (CI) eller Europe/Copenhagen. Vi tester
    RELATIONEN (N dage frem), ikke en kalenderdato. */
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString();

const base = (overrides: Partial<FocusInputs> = {}): FocusInputs => ({
  now: NOW,
  processedPeriodKeys: new Set(["2026-07"]),
  committedPeriodKeys: new Set(["2026-07"]),
  milestones: [],
  hasPulseThisMonth: true,
  unreadUserMessages: 0,
  unreadAgentMessages: 0,
  weeklyFocus: null,
  openActions: [],
  unlinkedLevers: [],
  ...overrides,
});

describe("deriveFocus — hver kilde for sig", () => {
  it("(a) manglende rapport", () => {
    const items = deriveFocus(base({ processedPeriodKeys: new Set(), committedPeriodKeys: new Set() }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "missing-report",
      priority: 1,
      title: "Upload dine juli-tal",
      ctaHref: "/reports",
    });
  });

  it("(b) uploadet men ikke godkendt — udelukker (a)", () => {
    const items = deriveFocus(base({ committedPeriodKeys: new Set() }));
    expect(items.map((i) => i.kind)).toEqual(["pending-approval"]);
    expect(items[0].priority).toBe(2);
  });

  it("(c) ulæste rådgiver-beskeder m. ActionCenter-bøjningen (1 vs. flere)", () => {
    const one = deriveFocus(base({ unreadUserMessages: 1 }));
    expect(one[0]).toMatchObject({ kind: "unread-messages", title: "1 ulæst besked", ctaHref: "/chat" });
    const three = deriveFocus(base({ unreadUserMessages: 3 }));
    expect(three[0].title).toBe("3 ulæste beskeder");
  });

  it("(c) agent-indsigt — ordret ActionCenter-tekst, EFTER rådgiver-beskeden", () => {
    const items = deriveFocus(base({ unreadUserMessages: 2, unreadAgentMessages: 1 }));
    expect(items.map((i) => i.kind)).toEqual(["unread-messages", "unread-agent"]);
    expect(items[1].title).toBe("Din AI-chef har en ny indsigt");
    expect(items[1].description).toBe("Der er en ny analyse af dine tal klar i chatten");
  });

  it("(d) weekly_focus vises kun når IKKE set; headline bæres i beskrivelsen", () => {
    const unseen = deriveFocus(base({ weeklyFocus: { headline: "Stram likviditeten", seen: false } }));
    expect(unseen[0]).toMatchObject({ kind: "weekly-focus", title: "Ugens fokus er klar", description: "Stram likviditeten" });
    const seen = deriveFocus(base({ weeklyFocus: { headline: "Stram likviditeten", seen: true } }));
    expect(seen).toHaveLength(0);
  });

  it("(e) milestone-deadlines: ≤14-dages-tærsklen ordret (14 med, 15 ikke), ALLE kandidater, nærmeste først + titel-tie-break", () => {
    const items = deriveFocus(
      base({
        milestones: [
          { title: "Parkeret", deadline: daysFromNow(2), progress: 10, status: "parked" },
          { title: "Færdig", deadline: daysFromNow(2), progress: 100, status: "active" },
          { title: "Grænse-15 (ude)", deadline: daysFromNow(15), progress: 10, status: "active" },
          { title: "B-samme-dag", deadline: daysFromNow(4), progress: 40, status: "active" },
          { title: "A-samme-dag", deadline: daysFromNow(4), progress: 40, status: "active" },
          { title: "Senere", deadline: daysFromNow(10), progress: 40, status: "active" },
          { title: "Grænse-14 (med)", deadline: daysFromNow(14), progress: 40, status: "active" },
        ],
      }),
    );
    expect(items.map((i) => i.title)).toEqual([
      '"A-samme-dag" nærmer sig deadline',
      '"B-samme-dag" nærmer sig deadline',
      '"Senere" nærmer sig deadline',
      '"Grænse-14 (med)" nærmer sig deadline',
    ]);
    // Præcis 4·86400000 ms frem → ceil = 4 — uafhængigt af tidszone.
    expect(items[0].description).toContain("4 dage tilbage");
    expect(items[3].description).toContain("14 dage tilbage");
  });

  it("(f) company_actions: kalderens orden bevares, sourceId følger med", () => {
    const items = deriveFocus(
      base({
        openActions: [
          { id: "a1", title: "Ring til banken", priority: "high" },
          { id: "a2", title: "Opdatér prisliste", priority: "low" },
        ],
      }),
    );
    expect(items.map((i) => i.sourceId)).toEqual(["a1", "a2"]);
    expect(items[0]).toMatchObject({ kind: "company-action", title: "Ring til banken", priority: 6 });
  });

  it("(g) pulse-nudgen er GATED bag committed rapport (ActionCenter:166-176)", () => {
    const gated = deriveFocus(base({ committedPeriodKeys: new Set(), hasPulseThisMonth: false }));
    expect(gated.map((i) => i.kind)).toEqual(["pending-approval"]); // ingen pulse før godkendt
    const open = deriveFocus(base({ hasPulseThisMonth: false }));
    expect(open.map((i) => i.kind)).toEqual(["pulse"]);
    expect(open[0].title).toBe("Tag stilling til dine tal");
  });

  it("(h) løftestang uden milestone — ét samlet punkt m. første løftestang citeret", () => {
    const items = deriveFocus(
      base({
        unlinkedLevers: [
          { lever: "Flere leads fra LinkedIn", moduleTitle: "Salg" },
          { lever: "Automatisér bogføring", moduleTitle: "Bogholderi & Økonomi" },
        ],
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "unlinked-lever", priority: 8, ctaHref: "/handouts" });
    expect(items[0].description).toContain('"Flere leads fra LinkedIn" (Salg)');
  });
});

describe("deriveFocus — rækkefølge og tom-tilstand", () => {
  it("alle otte slots samtidig → fast (a)-(h)-rækkefølge", () => {
    const items = deriveFocus({
      now: NOW,
      processedPeriodKeys: new Set(), // (a) — og pulse-gaten lukker (g)
      committedPeriodKeys: new Set(),
      milestones: [{ title: "Deadline", deadline: daysFromNow(5), progress: 20, status: "active" }],
      hasPulseThisMonth: false,
      unreadUserMessages: 2,
      unreadAgentMessages: 1,
      weeklyFocus: { headline: null, seen: false },
      openActions: [{ id: "a1", title: "Handling", priority: "high" }],
      unlinkedLevers: [{ lever: "Løftestang", moduleTitle: "Salg" }],
    });
    expect(items.map((i) => i.kind)).toEqual([
      "missing-report",
      "unread-messages",
      "unread-agent",
      "weekly-focus",
      "milestone-deadline",
      "company-action",
      "unlinked-lever",
    ]);
    // prioriteterne er monotont voksende (listen ER sorteret)
    const prios = items.map((i) => i.priority);
    expect([...prios].sort((a, b) => a - b)).toEqual(prios);
  });

  it("alt ajour → tom liste ('alt er ajour'-tilstanden)", () => {
    expect(deriveFocus(base())).toEqual([]);
  });

  it("stabile keys — unikke i fuld liste", () => {
    const items = deriveFocus(
      base({
        unreadUserMessages: 1,
        openActions: [
          { id: "a1", title: "X", priority: "high" },
          { id: "a2", title: "Y", priority: "low" },
        ],
        milestones: [
          { title: "M1", deadline: daysFromNow(5), progress: 1, status: "active" },
          { title: "M2", deadline: daysFromNow(6), progress: 1, status: "active" },
        ],
      }),
    );
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("deriveNextStep — wrapper-regressionsværn (de fire oprindelige kilder)", () => {
  const old = (overrides: Partial<NextStepInputs> = {}): NextStepInputs => ({
    now: NOW,
    processedPeriodKeys: new Set(["2026-07"]),
    committedPeriodKeys: new Set(["2026-07"]),
    milestones: [],
    hasPulseThisMonth: true,
    ...overrides,
  });

  it("missing-report — ordret som før", () => {
    const step = deriveNextStep(old({ processedPeriodKeys: new Set(), committedPeriodKeys: new Set() }));
    expect(step).toEqual({
      id: "missing-report",
      title: "Upload dine juli-tal",
      description: "Så er juli 2026 med, og din rådgiver kan se fremad med dig.",
      cta: "Upload tallene",
      link: "/reports",
    });
  });

  it("pending-approval — ordret som før", () => {
    const step = deriveNextStep(old({ committedPeriodKeys: new Set() }));
    expect(step).toEqual({
      id: "pending-approval",
      title: "Godkend dine juli-tal",
      description: "Tallene for juli 2026 er uploadet, men ikke godkendt endnu — godkend dem, så de kommer i drift.",
      cta: "Godkend tallene",
      link: "/reports",
    });
  });

  it("milestone-deadline — nærmeste vinder, tekst ordret", () => {
    const step = deriveNextStep(
      old({
        milestones: [
          { title: "Senere", deadline: daysFromNow(10), progress: 40, status: "active" },
          { title: "Nærmest", deadline: daysFromNow(4), progress: 40, status: "active" },
        ],
      }),
    );
    expect(step).toEqual({
      id: "milestone-deadline",
      title: '"Nærmest" nærmer sig deadline',
      description: "4 dage tilbage — opdatér fremdriften eller justér målet.",
      cta: "Åbn milestones",
      link: "/milestones",
    });
  });

  it("pulse — tekst ordret; null når alt er ajour", () => {
    const step = deriveNextStep(old({ hasPulseThisMonth: false }));
    expect(step).toEqual({
      id: "pulse",
      title: "Tag stilling til dine tal",
      description: "Juli-rapporten er afleveret. Har du taget stilling til tallene?",
      cta: "Send din refleksion",
      link: "/pulse",
    });
    expect(deriveNextStep(old())).toBeNull();
  });
});
