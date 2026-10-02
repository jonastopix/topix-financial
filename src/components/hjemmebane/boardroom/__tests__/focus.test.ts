import { describe, expect, it } from "vitest";
import { deriveFocus, deriveNextStep, erHastendeSkridt, filtrerUdloebneForslag, foersteRapportPeriode, maalFristTillaeg, type FocusInputs, type NextStepInputs } from "../nextStep";
import { byggTjekliste, TJEKLISTE_RAEKKEFOELGE, type TjeklisteInput } from "@/lib/onboardingTjekliste";

/** Fokus-motoren (forside PR 1): hver kilde, rækkefølgen ved samtidige
    signaler, tom-tilstand og wrapper-regressionsværnet. Fast "nu":
    10. august 2026 → forrige måned = juli 2026 ("2026-07") — samme anker
    som nextStep.test.ts. */
const NOW = new Date(2026, 7, 10);
/** Forrige-forrige måned (juni 2026) er I ORDEN i alle fixtures (30/9):
    slot (a)/(b) dømmer de to seneste afsluttede måneder, ældste først, så
    en fixture, der kun vil vise JULIS tilstand, skal have juni med. */
const JUNI = "2026-06";

/** Deadline som ABSOLUT tidsstempel præcis N dage efter NOW —
    tidszone-uafhængigt: motorens ceil-aritmetik regner på epoch-
    differencen, så N·86400000 ms giver altid "N dage tilbage", uanset
    om testen kører i UTC (CI) eller Europe/Copenhagen. Vi tester
    RELATIONEN (N dage frem), ikke en kalenderdato. */
const daysFromNow = (days: number) => new Date(NOW.getTime() + days * 86400000).toISOString();

const base = (overrides: Partial<FocusInputs> = {}): FocusInputs => ({
  now: NOW,
  processedPeriodKeys: new Set([JUNI, "2026-07"]),
  committedPeriodKeys: new Set([JUNI, "2026-07"]),
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
    const items = deriveFocus(base({ processedPeriodKeys: new Set([JUNI]), committedPeriodKeys: new Set([JUNI]) }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "missing-report",
      priority: 1,
      title: "Upload dine juli-tal",
      ctaHref: "/reports",
    });
  });

  it("(b) uploadet men ikke godkendt — udelukker (a)", () => {
    const items = deriveFocus(base({ committedPeriodKeys: new Set([JUNI]) }));
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

  it("(d) weekly_focus IKKE set: forrest med «Ugens fokus er klar»; headline bæres i beskrivelsen", () => {
    const unseen = deriveFocus(base({ weeklyFocus: { headline: "Stram likviditeten", seen: false } }));
    expect(unseen[0]).toMatchObject({ kind: "weekly-focus", title: "Ugens fokus er klar", description: "Stram likviditeten", priority: 4 });
  });

  it("(d/j) weekly_focus SET (11/9): punktet forsvinder ikke — det rykker BAGERST, roligere ord, samme headline", () => {
    // Alene: stadig ét punkt, men det er ikke længere «klar», og prioriteten er sidst.
    const alene = deriveFocus(base({ weeklyFocus: { headline: "Stram likviditeten", seen: true } }));
    expect(alene).toHaveLength(1);
    expect(alene[0]).toMatchObject({ kind: "weekly-focus", title: "Ugens fokus", ctaLabel: "Læs igen", description: "Stram likviditeten", priority: 10 });
    // Med andet der kalder: set står bagerst, ikke-set står foran beskederne det ville stå bag som set.
    const medBesked = deriveFocus(base({ unreadUserMessages: 1, weeklyFocus: { headline: "Stram likviditeten", seen: true } }));
    expect(medBesked.map((i) => i.kind)).toEqual(["unread-messages", "weekly-focus"]);
    expect(medBesked[medBesked.length - 1].kind).toBe("weekly-focus");
    // Grænsen fra den anden side: ikke-set står FORAN aktive skridt (prioritet 4 < 6).
    // (Milepæls-slottet (e) er ude siden fase 3 — skridtet er nærmeste nabo.)
    const skridt = [{ id: "k1", title: "Ring til banken", priority: "high", status: "active", due_date: "2026-09-04" }];
    const ikkeSet = deriveFocus(base({ weeklyFocus: { headline: "x", seen: false }, openActions: skridt }));
    expect(ikkeSet[0].kind).toBe("weekly-focus");
    const set = deriveFocus(base({ weeklyFocus: { headline: "x", seen: true }, openActions: skridt }));
    expect(set[set.length - 1].kind).toBe("weekly-focus");
    // Uden ugefokus: intet punkt, hverken forrest eller bagerst.
    expect(deriveFocus(base({ weeklyFocus: null })).some((i) => i.kind === "weekly-focus")).toBe(false);
  });

  it("(e) den gamle milepæls-kilde er stadig væk: et `milestones`-input og kind «milestone-deadline» findes ikke", () => {
    const items = deriveFocus({ ...base(), ...({ milestones: [{ title: "x", deadline: daysFromNow(2), progress: 10, status: "active" }] } as object) });
    expect(items.some((i) => (i.kind as string) === "milestone-deadline")).toBe(false);
    expect(items).toEqual([]);
  });

  // (e) MÅLET (1/10-2026): ét punkt fra maalFokus — dommen selv testes i
  // src/lib/hjemmebane/__tests__/maalFokus.test.ts; her placeringen og formen.
  const maalRaekke = (o: Record<string, unknown>) => ({ id: "m1", title: "Ny sælger", status: "active", progress: 0, deadline: null, created_at: "2026-07-01T00:00:00Z", ...o });
  const skridtRaekke = (o: Record<string, unknown>) => ({ id: "s1", title: "Skriv jobopslag", status: "active", due_date: "2026-08-20", maal_id: "m1", ...o });

  it("(e) mål uden skridt → «Tilføj det første skridt mod …» til forsidens anker #dine-maal (rådets fund 13)", () => {
    const items = deriveFocus(base({ maalPlan: { maal: [maalRaekke({})], skridt: [] } }));
    expect(items).toEqual([
      expect.objectContaining({ kind: "maal", priority: 5, title: "Tilføj det første skridt mod Ny sælger", ctaHref: "#dine-maal", sourceId: "m1" }),
    ]);
  });

  it("(e) aktivt skridt under målet → «mod målet: …», og (f) nævner ikke samme skridt igen", () => {
    const items = deriveFocus(base({
      maalPlan: { maal: [maalRaekke({})], skridt: [skridtRaekke({})] },
      openActions: [
        { id: "s1", title: "Skriv jobopslag", priority: "high", status: "active", due_date: "2026-08-20" },
        { id: "s9", title: "Løst skridt", priority: "low", status: "active", due_date: "2026-08-12" },
      ],
    }));
    expect(items.map((i) => i.key)).toEqual(["maal:skridt:s1", "action:s9"]);
    expect(items[0]).toMatchObject({ kind: "maal", title: "Skriv jobopslag", ctaHref: "#dine-skridt", sourceId: "s1" });
    expect(items[0].description).toBe("Skal være gjort senest 20. august — mod målet: Ny sælger.");
  });

  it("(e) målets frist ≤ 30 dage står i skridtets linje", () => {
    const items = deriveFocus(base({ maalPlan: { maal: [maalRaekke({ deadline: "2026-08-30" })], skridt: [skridtRaekke({})] } }));
    expect(items[0].description).toBe("Skal være gjort senest 20. august — mod målet: Ny sælger. Målets frist: 20 dage tilbage.");
  });

  it("(e)(1) tillægget siger «passeret» og «i dag» som sætninger (rådets fund 12)", () => {
    const tekst = (deadline: string) =>
      deriveFocus(base({ maalPlan: { maal: [maalRaekke({ deadline })], skridt: [skridtRaekke({})] } }))[0].description;
    expect(tekst("2026-08-05")).toBe("Skal være gjort senest 20. august — mod målet: Ny sælger. Fristen for målet er passeret.");
    expect(tekst("2026-08-10")).toBe("Skal være gjort senest 20. august — mod målet: Ny sælger. Fristen for målet er i dag.");
    expect(tekst("2026-08-11")).toBe("Skal være gjort senest 20. august — mod målet: Ny sælger. Målets frist: 1 dag tilbage.");
    expect(maalFristTillaeg(null)).toBe("");
  });

  it("(e) (2)/(3) lægges UNDER et hastende aktivt (f)-skridt — forfaldent eller frist ≤ 7 danske dage (rådets fund 6)", () => {
    const loest = (id: string, due_date: string) => ({ id, title: `Løst ${id}`, priority: "high", status: "active", due_date });
    // (2) under et skridt med frist om 7 dage (17/8) — grænsen er med.
    const syv = deriveFocus(base({ maalPlan: { maal: [maalRaekke({})], skridt: [] }, openActions: [loest("x", "2026-08-17")] }));
    expect(syv.map((i) => i.key)).toEqual(["action:x", "maal:foerste:m1"]);
    // Prioriteten følger pladsen, så listen stadig er sorteret.
    expect(syv.map((i) => i.priority)).toEqual([6, 6]);
    // Forfaldent (9/8) — også under.
    expect(deriveFocus(base({ maalPlan: { maal: [maalRaekke({})], skridt: [] }, openActions: [loest("x", "2026-08-09")] })).map((i) => i.kind))
      .toEqual(["company-action", "maal"]);
    // (3) under det SIDSTE hastende; et ikke-hastende bliver under målpunktet.
    const frist = deriveFocus(base({
      maalPlan: { maal: [maalRaekke({ deadline: "2026-08-25" })], skridt: [skridtRaekke({ status: "proposed", due_date: null })] },
      openActions: [loest("a", "2026-08-12"), loest("b", "2026-09-30"), loest("c", "2026-08-14")],
    }));
    expect(frist.map((i) => i.key)).toEqual(["action:a", "action:b", "action:c", "maal:frist:m1"]);
    expect(frist.filter((i) => i.kind === "maal")).toHaveLength(1);
  });

  it("(e) skive 3: et UBEKRÆFTET mål (bekraeftet_at null) giver intet målpunkt; undefined (kolonnen ulæst) tæller som i dag", () => {
    expect(deriveFocus(base({ maalPlan: { maal: [maalRaekke({ bekraeftet_at: null })], skridt: [] } }))).toEqual([]);
    expect(deriveFocus(base({ maalPlan: { maal: [maalRaekke({ bekraeftet_at: "2026-07-01T00:00:00Z" })], skridt: [] } }))).toHaveLength(1);
    expect(deriveFocus(base({ maalPlan: { maal: [maalRaekke({})], skridt: [] } }))).toHaveLength(1);
  });

  it("(e2) skive 3: kvartalstjekket — ét punkt for det første ventende; under hastende skridt, ellers før (f); efter målets eget punkt", () => {
    const tjek = [{ maalId: "m1", maalTitel: "Ny sælger", companyId: "c1", kvartal: 2 as const, maaned: 6, dato: "2026-07-01" }, { maalId: "m2", maalTitel: "Andet", companyId: "c1", kvartal: 1 as const, maaned: 3, dato: "2026-08-01" }];
    const alene = deriveFocus(base({ kvartalstjek: tjek }));
    expect(alene).toEqual([expect.objectContaining({ kind: "kvartalstjek", key: "kvartalstjek:m1:2", priority: 5, title: "Kvartalstjek, måned 6: Ny sælger", ctaHref: "/milestones#kvartalstjek", sourceId: "m1" })]);
    // Under et hastende skridt, efter målets (2)-punkt.
    const loest = (id: string, due_date: string) => ({ id, title: `Løst ${id}`, priority: "high", status: "active", due_date });
    const under = deriveFocus(base({ maalPlan: { maal: [maalRaekke({})], skridt: [] }, openActions: [loest("x", "2026-08-12"), loest("y", "2026-09-30")], kvartalstjek: tjek }));
    expect(under.map((i) => i.key)).toEqual(["action:x", "maal:foerste:m1", "kvartalstjek:m1:2", "action:y"]);
    expect(under.map((i) => i.priority)).toEqual([6, 6, 6, 6]);
    // Uden hastende: før (f), efter målpunktet.
    const foer = deriveFocus(base({ maalPlan: { maal: [maalRaekke({})], skridt: [] }, openActions: [loest("y", "2026-09-30")], kvartalstjek: tjek }));
    expect(foer.map((i) => i.key)).toEqual(["maal:foerste:m1", "kvartalstjek:m1:2", "action:y"]);
    // Tom/null → intet punkt.
    expect(deriveFocus(base({ kvartalstjek: [] }))).toEqual([]);
    expect(deriveFocus(base({ kvartalstjek: null }))).toEqual([]);
  });

  it("(e) (2)/(3) står OVER (f), når intet (f)-skridt haster — 8 dage, forslag og arve-open tæller ikke", () => {
    const items = deriveFocus(base({
      maalPlan: { maal: [maalRaekke({})], skridt: [] },
      openActions: [
        { id: "otte", title: "Om 8 dage", priority: "high", status: "active", due_date: "2026-08-18" },
        { id: "forslag", title: "Forslag", priority: "high", status: "proposed", due_date: "2026-08-11" },
        { id: "arv", title: "Arv", priority: "high" },
      ],
    }));
    expect(items.map((i) => i.key)).toEqual(["maal:foerste:m1", "action:otte", "action:arv"]);
    expect(items[0].priority).toBe(5);
  });

  it("(e)(1) — skridtet under et mål — står over (f), også når et løst skridt haster", () => {
    const items = deriveFocus(base({
      maalPlan: { maal: [maalRaekke({})], skridt: [skridtRaekke({})] },
      openActions: [{ id: "x", title: "Haster", priority: "high", status: "active", due_date: "2026-08-09" }],
    }));
    expect(items.map((i) => i.key)).toEqual(["maal:skridt:s1", "action:x"]);
  });

  it("erHastendeSkridt: dansk dag, kun aktive med frist", () => {
    // 10/8 kl. 23:30 UTC = 11/8 01:30 dansk → «i dag» = 11/8; 18/8 er 7 dage væk.
    const sent = new Date("2026-08-10T23:30:00Z");
    expect(erHastendeSkridt({ status: "active", due_date: "2026-08-18" }, sent)).toBe(true);
    expect(erHastendeSkridt({ status: "active", due_date: "2026-08-19" }, sent)).toBe(false);
    expect(erHastendeSkridt({ status: "proposed", due_date: "2026-08-11" }, sent)).toBe(false);
    expect(erHastendeSkridt({ status: "active", due_date: null }, sent)).toBe(false);
  });

  it("(e) står UNDER rapport og beskeder og OVER løse skridt, pulse og profil", () => {
    const items = deriveFocus(base({
      processedPeriodKeys: new Set([JUNI]),
      committedPeriodKeys: new Set([JUNI]),
      unreadUserMessages: 1,
      askMeAboutMissing: true,
      // Ikke hastende (frist om 20 dage) — ellers lægges (2) under skridtet (fund 6, testet nedenfor).
      openActions: [{ id: "x", title: "Løst", priority: "high", status: "active", due_date: "2026-08-30" }],
      maalPlan: { maal: [maalRaekke({})], skridt: [] },
    }));
    expect(items.map((i) => i.kind)).toEqual(["missing-report", "unread-messages", "maal", "company-action", "empty-profile"]);
  });

  it("(e) ét punkt, aldrig flere — også med tre mål", () => {
    const items = deriveFocus(base({ maalPlan: { maal: [maalRaekke({ id: "a" }), maalRaekke({ id: "b" }), maalRaekke({ id: "c" })], skridt: [] } }));
    expect(items.filter((i) => i.kind === "maal")).toHaveLength(1);
  });

  it("(e) uden maalPlan (fx en fejlet hentning) → intet målpunkt", () => {
    expect(deriveFocus(base({ maalPlan: null }))).toEqual([]);
  });

  it("(e) én stemme med Score-kortet: målets punkt siger aldrig Score-løfterens «Sæt et mål med en frist.» og peger aldrig på /kpis", () => {
    for (const maalPlan of [
      { maal: [maalRaekke({})], skridt: [] },
      { maal: [maalRaekke({})], skridt: [skridtRaekke({})] },
      { maal: [maalRaekke({ deadline: "2026-08-15" })], skridt: [skridtRaekke({ status: "proposed", due_date: null })] },
    ]) {
      const [punkt] = deriveFocus(base({ maalPlan }));
      expect(punkt.kind).toBe("maal");
      expect(punkt.title).not.toMatch(/Sæt (dit første mål|et mål med en frist)/);
      expect(punkt.ctaHref).not.toBe("/kpis");
    }
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

  it("(f) 'proposed' giver INTET fokus-punkt — forslaget bor i Dine skridt (ét ad gangen)", () => {
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

  it("(f) 'active' siger hvornår den skal være gjort og peger på #dine-skridt", () => {
    const items = deriveFocus(
      base({
        openActions: [
          { id: "k1", title: "Ring til banken", priority: "high", status: "active", due_date: "2026-09-04", deferral_count: 1 },
        ],
      }),
    );
    expect(items[0].description).toBe("Skal være gjort senest 4. september.");
    expect(items[0].ctaHref).toBe("#dine-skridt");
    expect(items[0].ctaLabel).toBe("Se dine skridt");
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
    const gated = deriveFocus(base({ committedPeriodKeys: new Set([JUNI]), hasPulseThisMonth: false }));
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
    // Handouts i Akademiet (1/10 nat): uden sti → Akademiet; aldrig /handouts.
    expect(items[0]).toMatchObject({ kind: "unlinked-lever", priority: 8, ctaLabel: "Åbn øvelsen", ctaHref: "/akademiet" });
    expect(items[0].description).toContain('"Flere leads fra LinkedIn" (Salg)');
  });

  it("(h) med sti fra kalderen fører punktet til lektionen, der bærer øvelsen", () => {
    const items = deriveFocus(
      base({ unlinkedLevers: [{ lever: "Flere leads fra LinkedIn", moduleTitle: "Salg", sti: "/akademiet/classroom/salg-1" }] }),
    );
    expect(items[0]).toMatchObject({ kind: "unlinked-lever", ctaHref: "/akademiet/classroom/salg-1" });
    expect(items[0].ctaHref).not.toContain("/handouts");
  });

  it("(i) tom netværksprofil → punktet, lavest prioritet", () => {
    const items = deriveFocus(base({ askMeAboutMissing: true }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "empty-profile",
      priority: 9,
      title: "Fortæl de andre hvad du er god til",
      ctaHref: "/settings?fane=profil",
    });
  });

  it("(i) udfyldt ask_me_about → intet punkt", () => {
    expect(deriveFocus(base({ askMeAboutMissing: false }))).toEqual([]);
  });

  it("(i) står ALDRIG øverst når en anden kilde er aktiv", () => {
    const withReport = deriveFocus(
      base({ processedPeriodKeys: new Set([JUNI]), committedPeriodKeys: new Set([JUNI]), askMeAboutMissing: true }),
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
  it("alle slots samtidig → fast (a)-(i)-rækkefølge (uden (e), fase 3)", () => {
    const items = deriveFocus({
      now: NOW,
      processedPeriodKeys: new Set([JUNI]), // (a) — og pulse-gaten lukker (g)
      committedPeriodKeys: new Set([JUNI]),
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
          { id: "a3", title: "Z", priority: "low", status: "active", due_date: "2026-09-04" },
        ],
        unlinkedLevers: [{ lever: "L", moduleTitle: "Salg" }],
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
  // Præsentationen (11/9, kort 60): et fuldt medlem kan oprette tråde, og
  // «alt gjort» har også præsenteret sig.
  kan_oprette_traad: true,
  har_praesentation: true,
  ask_me_about: "Likviditet",
  // 17/9 (Jonas «C», forside PR 4b): fotoet er en del af «Din profil» — «alt gjort» har et.
  avatar_url: "https://x/avatars/u/avatar?v=1",
  website: "https://firma.dk",
  industry_label: "Håndværk",
  cvr_number: "12345678",
  antal_rapporter: 1,
  antal_godkendte: 1,
  antal_udfyldte_handouts: 1,
  last_member_message_at: "2026-08-02T10:00:00Z",
  ...overrides,
});

/** Nul-data-medlem: intet uploadet, ingen pulse, tom profil — det
    fokuskortet hidtil mødte med "Upload dine juli-tal". */
const nulData = (overrides: Partial<FocusInputs> = {}): FocusInputs =>
  base({
    processedPeriodKeys: new Set([JUNI]),
    committedPeriodKeys: new Set([JUNI]),
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
      base({ committedPeriodKeys: new Set([JUNI]), contractStartDate: "2026-08-03" }),
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
      processedPeriodKeys: new Set([JUNI]),
      committedPeriodKeys: new Set([JUNI]),
      hasPulseThisMonth: true,
    });
    expect(step?.id).toBe("missing-report");
  });
});

describe("slot (0) — tjeklisten som fokuskortets kilde", () => {
  it("uafsluttet tjekliste → KUN ikke-gjorte punkter, i tjeklistens rækkefølge, med titel/beskrivelse/sti", () => {
    const tjekliste = byggTjekliste(tjeklisteAltGjort({ ask_me_about: null, antal_rapporter: 0, antal_godkendte: 0, last_member_message_at: null }));
    const items = deriveFocus(nulData({ tjekliste, contractStartDate: "2025-01-01" }));
    expect(items.map((i) => i.kind)).toEqual(["tjekliste", "tjekliste", "tjekliste"]);
    expect(items.map((i) => i.sourceId)).toEqual(["profil", "rapport", "besked"]);
    expect(items.every((i) => i.priority === 0)).toBe(true);
    expect(items[0]).toMatchObject({
      key: "tjekliste:profil",
      title: "Din profil",
      // RETTET MED VILJE 17/9 (Jonas «C»): før "Hvad de andre kan spørge dig om." — fotoet er nu en del af punktet.
      description: "Et foto, og hvad de andre kan spørge dig om.",
      ctaHref: "/settings?fane=profil",
      ctaLabel: "Gør det nu",
    });
    expect(items[1].ctaHref).toBe("/rapportering");
    expect(items[2].ctaHref).toBe("/chat");
  });

  it("nul-data-medlem med helt tom tjekliste → alle punkter, første ikke-gjorte er #1, INTET 'Upload dine juli-tal'", () => {
    const tjekliste = byggTjekliste({
      har_velkomstvideo: true,
      velkomstvideo_set_at: null,
      // Præsentationen (11/9, kort 60): nyt fuldt medlem kan oprette tråde,
      // har ikke præsenteret sig endnu — så alle syv punkter er ikke-gjorte.
      kan_oprette_traad: true,
      har_praesentation: false,
      ask_me_about: null,
      avatar_url: null,
      website: null,
      industry_label: null,
      cvr_number: null,
      antal_rapporter: 0,
      antal_godkendte: 0,
      antal_udfyldte_handouts: 0,
      last_member_message_at: null,
      // Delingen (14/9): et nyt medlem er efter DELING_PUNKT_FRA — alle otte.
      medlem_siden: "2026-09-22T09:00:00.000Z",
    });
    const items = deriveFocus(nulData({ tjekliste, contractStartDate: "2025-01-01" }));
    expect(items.map((i) => i.sourceId)).toEqual([...TJEKLISTE_RAEKKEFOELGE]);
    expect(items[items.length - 1]).toMatchObject({ sourceId: "deling", ctaHref: "/deling", title: "Fortæl det videre" });
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
        processedPeriodKeys: new Set([JUNI]),
        committedPeriodKeys: new Set([JUNI]),
        unreadUserMessages: 2,
        weeklyFocus: { headline: "X", seen: false },
        openActions: [{ id: "a1", title: "Handling", priority: "high" }],
        askMeAboutMissing: true,
      }),
    );
    expect(items.map((i) => i.kind)).toEqual(["tjekliste"]);
    expect(items[0].sourceId).toBe("besked");
  });

  it("stabile, unikke keys på tværs af tjekliste-punkter", () => {
    const tjekliste = byggTjekliste(tjeklisteAltGjort({ ask_me_about: null, website: null, antal_rapporter: 0, antal_godkendte: 0 }));
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

describe("erfarne medlemmer (30/9) — tjeklisten slipper kortet efter 30 døgn", () => {
  // Tjekliste med tom profil (hverken ask_me_about eller foto — som 0 af 8
  // gamle og 16 af 17 nye i prod 30/9) og en uafsluttet tal-/beskedrække.
  const uafsluttet = () =>
    byggTjekliste(tjeklisteAltGjort({ ask_me_about: null, avatar_url: null, antal_godkendte: 0, last_member_message_at: null }));
  // NOW = 10/8 2026 lokal tid. 8 måneder før ≈ 10/12 2025; 5 døgn før = 5/8.
  const otteMaaneder = new Date(2025, 11, 10, 9).toISOString();
  const femDage = new Date(NOW.getTime() - 5 * 86_400_000).toISOString();

  it("8-måneders-medlem uden profil, juli uploadet men ikke godkendt → fokus = «Godkend dine juli-tal», ikke profilen", () => {
    const tjekliste = uafsluttet();
    expect(tjekliste.faerdig).toBe(false);
    const items = deriveFocus(
      base({ tjekliste, medlemSiden: otteMaaneder, committedPeriodKeys: new Set([JUNI]), askMeAboutMissing: true, contractStartDate: "2025-12-01" }),
    );
    expect(items[0]).toMatchObject({ kind: "pending-approval", title: "Godkend dine juli-tal" });
    expect(items.map((i) => i.kind)).not.toContain("tjekliste");
    // Den tomme profil står stadig — som det laveste punkt (i), ikke som #1.
    expect(items[items.length - 1].kind).toBe("empty-profile");
  });

  it("8-måneders-medlem uden profil og uden juli-tal → fokus = «Upload dine juli-tal»", () => {
    const items = deriveFocus(
      nulData({ tjekliste: uafsluttet(), medlemSiden: otteMaaneder, contractStartDate: "2025-12-01" }),
    );
    expect(items.map((i) => i.kind)).toEqual(["missing-report", "empty-profile"]);
  });

  it("8-måneders-medlem: beskeder og ugens fokus konkurrerer igen om kortet", () => {
    const items = deriveFocus(
      base({ tjekliste: uafsluttet(), medlemSiden: otteMaaneder, unreadUserMessages: 1, weeklyFocus: { headline: "X", seen: false } }),
    );
    expect(items.map((i) => i.kind)).toEqual(["unread-messages", "weekly-focus"]);
  });

  it("5-dages-medlem → UÆNDRET: tjeklisten er kortets eneste kilde", () => {
    const tjekliste = uafsluttet();
    const med = deriveFocus(nulData({ tjekliste, medlemSiden: femDage, unreadUserMessages: 2, contractStartDate: "2025-01-01" }));
    const uden = deriveFocus(nulData({ tjekliste, unreadUserMessages: 2, contractStartDate: "2025-01-01" }));
    expect(med).toEqual(uden);
    expect(med.every((i) => i.kind === "tjekliste")).toBe(true);
    expect(med.map((i) => i.sourceId)).toEqual(["profil", "rapport", "besked"]);
  });

  it("ukendt medlemSiden (null/udeladt) → som før 30/9: tjeklisten styrer", () => {
    const tjekliste = uafsluttet();
    expect(deriveFocus(base({ tjekliste, medlemSiden: null }))[0].kind).toBe("tjekliste");
    expect(deriveFocus(base({ tjekliste }))[0].kind).toBe("tjekliste");
  });

  it("grænsen: præcis 30 døgn = ny (tjekliste); 30 døgn + 1 ms = erfaren (almindelig prioritering)", () => {
    const tjekliste = uafsluttet();
    const praecis = new Date(NOW.getTime() - 30 * 86_400_000).toISOString();
    const lidtOver = new Date(NOW.getTime() - 30 * 86_400_000 - 1).toISOString();
    expect(deriveFocus(base({ tjekliste, medlemSiden: praecis }))[0].kind).toBe("tjekliste");
    expect(deriveFocus(base({ tjekliste, medlemSiden: lidtOver })).map((i) => i.kind)).not.toContain("tjekliste");
  });

  it("erfaren med FÆRDIG tjekliste → identisk med ny med færdig tjekliste (erfaringen ændrer kun den uafsluttede gren)", () => {
    const efter = byggTjekliste(tjeklisteAltGjort());
    expect(deriveFocus(base({ tjekliste: efter, medlemSiden: otteMaaneder, unreadUserMessages: 1 }))).toEqual(
      deriveFocus(base({ tjekliste: efter, medlemSiden: femDage, unreadUserMessages: 1 })),
    );
  });
});

describe("deriveNextStep — wrapper-regressionsværn (de fire oprindelige kilder)", () => {
  const old = (overrides: Partial<NextStepInputs> = {}): NextStepInputs => ({
    now: NOW,
    processedPeriodKeys: new Set([JUNI, "2026-07"]),
    committedPeriodKeys: new Set([JUNI, "2026-07"]),
    hasPulseThisMonth: true,
    ...overrides,
  });

  it("missing-report — ordret som før", () => {
    const step = deriveNextStep(old({ processedPeriodKeys: new Set([JUNI]), committedPeriodKeys: new Set([JUNI]) }));
    expect(step).toEqual({
      id: "missing-report",
      title: "Upload dine juli-tal",
      description: "Så er juli 2026 med, og din rådgiver kan se fremad med dig.",
      cta: "Upload tallene",
      link: "/reports",
    });
  });

  it("pending-approval — ordret som før", () => {
    const step = deriveNextStep(old({ committedPeriodKeys: new Set([JUNI]) }));
    expect(step).toEqual({
      id: "pending-approval",
      title: "Godkend dine juli-tal",
      description: "Tallene for juli 2026 er uploadet, men ikke godkendt endnu — godkend dem, så de kommer i drift.",
      cta: "Godkend tallene",
      link: "/reports",
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

/* ── (a)/(b) over de to seneste afsluttede måneder, ældste først (30/9,
      rådets gennemsyn af PR #1192). Fristen er den 20. i måneden efter;
      den 1/10 er augusts frist passeret, og september er lige begyndt at
      løbe. EKSEMPEL: now = 1/10-2026 → forrige-forrige = "2026-08"
      (august), forrige = "2026-09" (september). ── */
describe("slot (a)/(b) — de to seneste afsluttede måneder, ældste først", () => {
  const FOERSTE_OKT = new Date(2026, 9, 1, 9);
  const midtSep = new Date(2026, 8, 15, 9);

  it("1/10: august uploadet men ikke godkendt, september mangler → «Godkend dine august-tal»", () => {
    const items = deriveFocus(
      base({ now: FOERSTE_OKT, processedPeriodKeys: new Set(["2026-08"]), committedPeriodKeys: new Set() }),
    );
    const rapport = items.filter((i) => i.kind === "missing-report" || i.kind === "pending-approval");
    expect(rapport).toHaveLength(1); // ét rapportpunkt, som før
    expect(items[0]).toMatchObject({
      kind: "pending-approval",
      priority: 2,
      title: "Godkend dine august-tal",
      description: "Tallene for august 2026 er uploadet, men ikke godkendt endnu — godkend dem, så de kommer i drift.",
    });
  });

  it("1/10: august godkendt, september mangler → «Upload dine september-tal»", () => {
    const items = deriveFocus(
      base({ now: FOERSTE_OKT, processedPeriodKeys: new Set(["2026-08"]), committedPeriodKeys: new Set(["2026-08"]) }),
    );
    expect(items[0]).toMatchObject({
      kind: "missing-report",
      priority: 1,
      title: "Upload dine september-tal",
      description: "Så er september 2026 med, og din rådgiver kan se fremad med dig.",
    });
  });

  it("1/10: august mangler helt → «Upload dine august-tal» (ældste først), ikke september", () => {
    const items = deriveFocus(base({ now: FOERSTE_OKT, processedPeriodKeys: new Set(), committedPeriodKeys: new Set() }));
    expect(items[0]).toMatchObject({ kind: "missing-report", title: "Upload dine august-tal" });
    expect(items.some((i) => i.title.includes("september"))).toBe(false);
  });

  it("1/10: begge i orden → intet rapportpunkt", () => {
    const begge = new Set(["2026-08", "2026-09"]);
    const items = deriveFocus(base({ now: FOERSTE_OKT, processedPeriodKeys: begge, committedPeriodKeys: begge }));
    expect(items.some((i) => i.kind === "missing-report" || i.kind === "pending-approval")).toBe(false);
  });

  it("KUN de to seneste: et hul i juli er ikke med den 1/10", () => {
    const aug_sep = new Set(["2026-08", "2026-09"]);
    const items = deriveFocus(base({ now: FOERSTE_OKT, processedPeriodKeys: aug_sep, committedPeriodKeys: aug_sep }));
    expect(items.some((i) => i.title.includes("juli"))).toBe(false);
  });

  it("kontraktværnet gælder hver måned for sig: kontrakt 1/9 → august tier, september bedes om", () => {
    const items = deriveFocus(
      base({ now: FOERSTE_OKT, processedPeriodKeys: new Set(), committedPeriodKeys: new Set(), contractStartDate: "2026-09-01" }),
    );
    expect(items[0]).toMatchObject({ kind: "missing-report", title: "Upload dine september-tal" });
  });

  it("15/9 som i dag: juli i orden, august mangler → «Upload dine august-tal»; august uploadet → «Godkend dine august-tal»", () => {
    const juli = new Set(["2026-07"]);
    expect(deriveFocus(base({ now: midtSep, processedPeriodKeys: juli, committedPeriodKeys: juli }))[0]).toMatchObject({
      kind: "missing-report",
      title: "Upload dine august-tal",
    });
    expect(
      deriveFocus(base({ now: midtSep, processedPeriodKeys: new Set(["2026-07", "2026-08"]), committedPeriodKeys: juli }))[0],
    ).toMatchObject({ kind: "pending-approval", title: "Godkend dine august-tal" });
  });

  it("årsskiftet: 5/1-2027 → forrige-forrige = november 2026", () => {
    const items = deriveFocus(
      base({ now: new Date(2027, 0, 5), processedPeriodKeys: new Set(["2026-12"]), committedPeriodKeys: new Set(["2026-12"]) }),
    );
    expect(items[0]).toMatchObject({ kind: "missing-report", title: "Upload dine november-tal" });
  });
});
