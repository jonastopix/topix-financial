import { describe, expect, it } from "vitest";
import { deriveFocus, deriveNextStep, filtrerUdloebneForslag, foersteRapportPeriode, type FocusInputs, type NextStepInputs } from "../nextStep";
import { byggTjekliste, TJEKLISTE_RAEKKEFOELGE, type TjeklisteInput } from "@/lib/onboardingTjekliste";

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
  askMeAboutMissing: false,
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

  it("(f) context bruges som description — handlingens egen begrundelse, ikke standardsætningen", () => {
    // Ordret produktions-eksempel (målt 2026-08-12).
    const context =
      "Handouts fra bogholderi (128 dage) og administration (110 dage) er ubesvarede. " +
      "Samtidig er 'Få styr på likviditeten' stagneret i 41 dage. Prioritér at få svar " +
      "på disse og genoptag arbejdet med likviditeten hurtigst muligt.";
    const items = deriveFocus(
      base({
        openActions: [
          { id: "a1", title: "Følg op på ubesvarede handouts og likviditet", priority: "high", context },
        ],
      }),
    );
    expect(items[0].description).toBe(context);
  });

  it("(f) fallback-sætningen når context er null, mangler eller kun whitespace", () => {
    const items = deriveFocus(
      base({
        openActions: [
          { id: "a1", title: "Uden context", priority: "high", context: null },
          { id: "a2", title: "Context mangler helt", priority: "medium" },
          { id: "a3", title: "Kun whitespace", priority: "low", context: "   \n  " },
        ],
      }),
    );
    expect(items.map((i) => i.description)).toEqual([
      "Åben handling fra din handlingsplan.",
      "Åben handling fra din handlingsplan.",
      "Åben handling fra din handlingsplan.",
    ]);
  });

  it("(f) 'proposed' giver INTET fokus-punkt — forslaget bor i Dine aftaler (ét ad gangen)", () => {
    const items = deriveFocus(
      base({
        openActions: [
          { id: "p1", title: "Stram likviditeten", priority: "high", status: "proposed", deferral_count: 0 },
          { id: "p2", title: "Endnu et forslag", priority: "medium", status: "proposed", context: "Begrundelse." },
        ],
      }),
    );
    expect(items).toEqual([]);
  });

  it("(f) 'active' siger hvornår den skal være gjort og peger på #dine-aftaler", () => {
    const items = deriveFocus(
      base({
        openActions: [
          { id: "k1", title: "Ring til banken", priority: "high", status: "active", due_date: "2026-09-04", deferral_count: 1 },
        ],
      }),
    );
    expect(items[0].description).toBe("Skal være gjort senest 4. september.");
    expect(items[0].ctaHref).toBe("#dine-aftaler");
  });

  it("(f) 'active' med context: fristen først, begrundelsen efter", () => {
    const items = deriveFocus(
      base({
        openActions: [
          { id: "k1", title: "Ring til banken", priority: "high", status: "active", due_date: "2026-09-04", context: "Renten skal genforhandles." },
        ],
      }),
    );
    expect(items[0].description).toBe("Skal være gjort senest 4. september. Renten skal genforhandles.");
  });

  it("(f) arve-'open' og manglende status er uændret: context/fallback og href er forsiden (fold-ud)", () => {
    const items = deriveFocus(
      base({
        openActions: [
          { id: "a1", title: "Arv med status", priority: "high", status: "open", context: "Begrundelsen." },
          { id: "a2", title: "Arv uden status", priority: "low" },
        ],
      }),
    );
    expect(items.map((i) => i.description)).toEqual(["Begrundelsen.", "Åben handling fra din handlingsplan."]);
    expect(items.every((i) => i.ctaHref === "/")).toBe(true);
    expect(items.every((i) => i.ctaLabel === "Se handlinger")).toBe(true);
  });

  it("(f) blandet liste: proposed udelades, active og arve-'open' består i kalderens orden", () => {
    const items = deriveFocus(
      base({
        openActions: [
          { id: "p1", title: "Forslag", priority: "high", status: "proposed" },
          { id: "k1", title: "Aktiv", priority: "medium", status: "active", due_date: "2026-09-04" },
          { id: "a1", title: "Arv", priority: "low", status: "open" },
        ],
      }),
    );
    expect(items.map((i) => i.sourceId)).toEqual(["k1", "a1"]);
    expect(items.every((i) => i.priority === 6)).toBe(true);
  });

  it("(f) B8: filtrerUdloebneForslag fjerner udløbet 'proposed' på tidsstempel, kommende består", () => {
    // Helperen bruges af BÅDE fokus-mappingen og Dine aftaler-sektionen.
    // Tidsstempel-dom (timestamptz), ikke kalenderdag.
    const udloebet = {
      id: "p1",
      title: "Udløbet forslag",
      priority: "high",
      status: "proposed",
      expires_at: new Date(NOW.getTime() - 1000).toISOString(),
    };
    const kommende = {
      id: "p2",
      title: "Kommende forslag",
      priority: "high",
      status: "proposed",
      expires_at: new Date(NOW.getTime() + 1000).toISOString(),
    };
    expect(filtrerUdloebneForslag([udloebet, kommende], NOW).map((a) => a.id)).toEqual(["p2"]);
  });

  it("(f) B8 rører kun 'proposed': active og arve-'open' består uanset expires_at-fortid", () => {
    const fortid = new Date(NOW.getTime() - 1000).toISOString();
    const beholdt = filtrerUdloebneForslag(
      [
        { id: "k1", status: "active", expires_at: fortid },
        { id: "a1", status: "open", expires_at: null },
        { id: "p1", status: "proposed", expires_at: fortid },
      ],
      NOW,
    );
    expect(beholdt.map((a) => a.id)).toEqual(["k1", "a1"]);
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

  it("(i) tom netværksprofil → punktet, lavest prioritet", () => {
    const items = deriveFocus(base({ askMeAboutMissing: true }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "empty-profile",
      priority: 9,
      title: "Fortæl de andre hvad du er god til",
      ctaHref: "/settings",
    });
  });

  it("(i) udfyldt ask_me_about → intet punkt", () => {
    expect(deriveFocus(base({ askMeAboutMissing: false }))).toEqual([]);
  });

  it("(i) står ALDRIG øverst når en anden kilde er aktiv", () => {
    const withReport = deriveFocus(
      base({ processedPeriodKeys: new Set(), committedPeriodKeys: new Set(), askMeAboutMissing: true }),
    );
    expect(withReport.map((i) => i.kind)).toEqual(["missing-report", "empty-profile"]);

    const withLever = deriveFocus(
      base({
        unlinkedLevers: [{ lever: "Flere leads fra LinkedIn", moduleTitle: "Salg" }],
        askMeAboutMissing: true,
      }),
    );
    expect(withLever.map((i) => i.kind)).toEqual(["unlinked-lever", "empty-profile"]);
    expect(withLever[withLever.length - 1].kind).toBe("empty-profile");
  });
});

describe("deriveFocus — rækkefølge og tom-tilstand", () => {
  it("alle ni slots samtidig → fast (a)-(i)-rækkefølge", () => {
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
      askMeAboutMissing: true,
    });
    expect(items.map((i) => i.kind)).toEqual([
      "missing-report",
      "unread-messages",
      "unread-agent",
      "weekly-focus",
      "milestone-deadline",
      "company-action",
      "unlinked-lever",
      "empty-profile",
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

/* ── Trin 8 (docs/indgangen-overhaling.md §5/§9): ankomstens motor ── */

/** Tjekliste-input hvor ALT er gjort — testene slår enkelte punkter fra. */
const tjeklisteAltGjort = (overrides: Partial<TjeklisteInput> = {}): TjeklisteInput => ({
  har_velkomstvideo: true,
  velkomstvideo_set_at: "2026-08-01T10:00:00Z",
  avatar_url: "https://x/avatar.png",
  ask_me_about: "Likviditet",
  website: "https://firma.dk",
  industry_label: "Håndværk",
  cvr_number: "12345678",
  antal_rapporter: 1,
  antal_udfyldte_handouts: 1,
  last_member_message_at: "2026-08-02T10:00:00Z",
  ...overrides,
});

/** Nul-data-medlem: intet uploadet, ingen pulse, tom profil — det
    fokuskortet hidtil mødte med "Upload dine juli-tal". */
const nulData = (overrides: Partial<FocusInputs> = {}): FocusInputs =>
  base({
    processedPeriodKeys: new Set(),
    committedPeriodKeys: new Set(),
    hasPulseThisMonth: false,
    askMeAboutMissing: true,
    ...overrides,
  });

describe("foersteRapportPeriode — regnestykket for slot (a)", () => {
  it("kontrakt fra den 1. → startmåneden selv er den første hele måned", () => {
    expect(foersteRapportPeriode("2026-09-01")).toBe("2026-09");
  });

  it("kontrakt midt i måneden → første hele måned er måneden efter", () => {
    expect(foersteRapportPeriode("2026-09-15")).toBe("2026-10");
    expect(foersteRapportPeriode("2026-09-30")).toBe("2026-10");
  });

  it("årsskiftet: 15. december → januar året efter", () => {
    expect(foersteRapportPeriode("2026-12-15")).toBe("2027-01");
  });

  it("ukendt eller ugyldig start → null (= som hidtil)", () => {
    expect(foersteRapportPeriode(null)).toBeNull();
    expect(foersteRapportPeriode(undefined)).toBeNull();
    expect(foersteRapportPeriode("")).toBeNull();
    expect(foersteRapportPeriode("ikke-en-dato")).toBeNull();
    expect(foersteRapportPeriode("2026-13-01")).toBeNull();
  });
});

describe("slot (a) og kontraktstarten", () => {
  it("oprettet i indeværende måned → beder IKKE om forrige måneds tal", () => {
    // NOW = 10. august 2026; kontrakt 3. august → første hele måned er
    // september; prevKey "2026-07" < "2026-09" → slottet tier.
    const items = deriveFocus(nulData({ contractStartDate: "2026-08-03", askMeAboutMissing: false }));
    expect(items.map((i) => i.kind)).not.toContain("missing-report");
    expect(items).toEqual([]);
  });

  it("oprettet i går (9. august) → samme: intet krav om juli-tal", () => {
    const items = deriveFocus(nulData({ contractStartDate: "2026-08-09", askMeAboutMissing: false }));
    expect(items).toEqual([]);
  });

  it("oprettet for et år siden → opfører sig som i dag: 'Upload dine juli-tal'", () => {
    const items = deriveFocus(nulData({ contractStartDate: "2025-08-10", askMeAboutMissing: false }));
    expect(items.map((i) => i.kind)).toEqual(["missing-report"]);
    expect(items[0].title).toBe("Upload dine juli-tal");
  });

  it("ukendt kontraktstart (null/udeladt) → som hidtil", () => {
    expect(deriveFocus(nulData({ contractStartDate: null, askMeAboutMissing: false }))[0]?.kind).toBe("missing-report");
    expect(deriveFocus(nulData({ askMeAboutMissing: false }))[0]?.kind).toBe("missing-report");
  });

  it("grænsen: kontrakt 1. juli → juli er første hele måned → juli-tal bedes om; 2. juli → tier", () => {
    expect(deriveFocus(nulData({ contractStartDate: "2026-07-01", askMeAboutMissing: false }))[0]?.kind).toBe("missing-report");
    expect(deriveFocus(nulData({ contractStartDate: "2026-07-02", askMeAboutMissing: false }))).toEqual([]);
  });

  it("værnet gælder KUN (a): findes der uploadede tal for perioden, fyrer (b) uanset kontraktstart", () => {
    const items = deriveFocus(
      base({ committedPeriodKeys: new Set(), contractStartDate: "2026-08-03" }),
    );
    expect(items.map((i) => i.kind)).toEqual(["pending-approval"]);
  });

  it("de øvrige slots er urørte af kontraktstarten — (i) står stadig alene når (a) tier", () => {
    const items = deriveFocus(nulData({ contractStartDate: "2026-08-03" }));
    expect(items.map((i) => i.kind)).toEqual(["empty-profile"]);
  });

  it("wrapperen deriveNextStep kender ingen kontraktstart og svarer som før", () => {
    const step = deriveNextStep({
      now: NOW,
      processedPeriodKeys: new Set(),
      committedPeriodKeys: new Set(),
      milestones: [],
      hasPulseThisMonth: true,
    });
    expect(step?.id).toBe("missing-report");
  });
});

describe("slot (0) — tjeklisten som fokuskortets kilde", () => {
  it("uafsluttet tjekliste → KUN ikke-gjorte punkter, i tjeklistens rækkefølge, med titel/beskrivelse/sti", () => {
    const tjekliste = byggTjekliste(tjeklisteAltGjort({ avatar_url: null, antal_rapporter: 0, last_member_message_at: null }));
    const items = deriveFocus(nulData({ tjekliste, contractStartDate: "2025-01-01" }));
    expect(items.map((i) => i.kind)).toEqual(["tjekliste", "tjekliste", "tjekliste"]);
    expect(items.map((i) => i.sourceId)).toEqual(["profil", "rapport", "besked"]);
    expect(items.every((i) => i.priority === 0)).toBe(true);
    expect(items[0]).toMatchObject({
      key: "tjekliste:profil",
      title: "Din profil",
      description: "Et billede, og hvad de andre kan spørge dig om.",
      ctaHref: "/settings",
      ctaLabel: "Gør det nu",
    });
    expect(items[1].ctaHref).toBe("/rapportering");
    expect(items[2].ctaHref).toBe("/chat");
  });

  it("nul-data-medlem med helt tom tjekliste → alle punkter, første ikke-gjorte er #1, INTET 'Upload dine juli-tal'", () => {
    const tjekliste = byggTjekliste({
      har_velkomstvideo: true,
      velkomstvideo_set_at: null,
      avatar_url: null,
      ask_me_about: null,
      website: null,
      industry_label: null,
      cvr_number: null,
      antal_rapporter: 0,
      antal_udfyldte_handouts: 0,
      last_member_message_at: null,
    });
    const items = deriveFocus(nulData({ tjekliste, contractStartDate: "2025-01-01" }));
    expect(items.map((i) => i.sourceId)).toEqual([...TJEKLISTE_RAEKKEFOELGE]);
    expect(items[0].title).toBe("Se velkomsten");
    expect(items.map((i) => i.kind)).not.toContain("missing-report");
    expect(items.map((i) => i.kind)).not.toContain("empty-profile");
  });

  it("velkomst-punktets sti '' bæres uændret som ctaHref (åbnes i boksen, ikke en side)", () => {
    const tjekliste = byggTjekliste(tjeklisteAltGjort({ velkomstvideo_set_at: null }));
    const items = deriveFocus(base({ tjekliste }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sourceId: "velkomst", ctaHref: "" });
  });

  it("uden velkomstvideo findes velkomst-punktet ikke — fem punkter, samme indbyrdes orden", () => {
    const tjekliste = byggTjekliste(tjeklisteAltGjort({ har_velkomstvideo: false, velkomstvideo_set_at: null, antal_udfyldte_handouts: 0 }));
    const items = deriveFocus(base({ tjekliste }));
    expect(items.map((i) => i.sourceId)).toEqual(["handout"]);
  });

  it("tjeklisten vinder over ALT andet mens den er uafsluttet — også beskeder, deadlines og ugens fokus", () => {
    const tjekliste = byggTjekliste(tjeklisteAltGjort({ last_member_message_at: null }));
    const items = deriveFocus(
      base({
        tjekliste,
        processedPeriodKeys: new Set(),
        committedPeriodKeys: new Set(),
        unreadUserMessages: 2,
        weeklyFocus: { headline: "X", seen: false },
        milestones: [{ title: "Deadline", deadline: daysFromNow(5), progress: 20, status: "active" }],
        openActions: [{ id: "a1", title: "Handling", priority: "high" }],
        askMeAboutMissing: true,
      }),
    );
    expect(items.map((i) => i.kind)).toEqual(["tjekliste"]);
    expect(items[0].sourceId).toBe("besked");
  });

  it("stabile, unikke keys på tværs af tjekliste-punkter", () => {
    const tjekliste = byggTjekliste(tjeklisteAltGjort({ avatar_url: null, website: null, antal_rapporter: 0 }));
    const keys = deriveFocus(base({ tjekliste })).map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(["tjekliste:profil", "tjekliste:virksomhed", "tjekliste:rapport"]);
  });
});

describe("overgangen — sidste tjeklistepunkt gjort", () => {
  it("ét punkt tilbage → kun det; samme punkt gjort → almindelig prioritering (a)-(i)", () => {
    const foer = byggTjekliste(tjeklisteAltGjort({ last_member_message_at: null }));
    expect(foer.faerdig).toBe(false);
    const inputsFoer = nulData({ tjekliste: foer, contractStartDate: "2025-01-01" });
    expect(deriveFocus(inputsFoer).map((i) => i.kind)).toEqual(["tjekliste"]);

    const efter = byggTjekliste(tjeklisteAltGjort());
    expect(efter.faerdig).toBe(true);
    const inputsEfter = nulData({ tjekliste: efter, contractStartDate: "2025-01-01" });
    expect(deriveFocus(inputsEfter).map((i) => i.kind)).toEqual(["missing-report", "empty-profile"]);
  });

  it("færdig tjekliste er identisk med ingen tjekliste — (a)-(i) uændret", () => {
    const efter = byggTjekliste(tjeklisteAltGjort());
    const medTjekliste = deriveFocus(base({ tjekliste: efter, unreadUserMessages: 1, askMeAboutMissing: true }));
    const uden = deriveFocus(base({ tjekliste: null, unreadUserMessages: 1, askMeAboutMissing: true }));
    const udeladt = deriveFocus(base({ unreadUserMessages: 1, askMeAboutMissing: true }));
    expect(medTjekliste).toEqual(uden);
    expect(medTjekliste).toEqual(udeladt);
    expect(medTjekliste.map((i) => i.kind)).toEqual(["unread-messages", "empty-profile"]);
  });

  it("færdig tjekliste + ny virksomhed: kontraktstart-værnet tager over, og kortet er tomt frem for at bede om tal", () => {
    const efter = byggTjekliste(tjeklisteAltGjort());
    const items = deriveFocus(nulData({ tjekliste: efter, contractStartDate: "2026-08-03", askMeAboutMissing: false }));
    expect(items).toEqual([]);
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
