import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBudgetTargetsMock, type BudgetTargetsMock } from "@/test/budgetTargetsMock";

/** Dybdetesten af budgettets dataveje (hb-ai-merge-recon §d): ALLE
    skriveveje W1-W7 køres end-to-end mod in-memory-simulationen af
    budget_targets (rigtig unik nøgle, delete-før-insert, upsert) —
    inkl. §7.3-scenarierne (to skribenter), U1/U2-beviserne og
    rundturene import→load og sim-events. */

const h = vi.hoisted(() => ({ current: null as unknown as BudgetTargetsMock }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (...args: any[]) => (h.current.supabase.from as any)(...args),
    functions: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoke: (...args: any[]) => (h.current.supabase.functions.invoke as any)(...args),
    },
  },
}));

import {
  confirmBudgetFromAccounts,
  hentAlleSider,
  confirmBudgetImport,
  confirmImportFraSkriveplan,
  copyBaseToScenario,
  generateAIScenario,
  loadBudget,
  loadSimEvents,
  saveScenarioEdits,
  saveSimEvents,
  writeTemplateMarker,
  type SimEvent,
} from "../budgetEngine";
import type { BudgetRow } from "@/components/budget/types";
import { byggSkriveplanInserts, type Skriveplan } from "@/lib/importSkrivning";

const USER = "member-1";
const ADVISOR = "advisor-1";
const COMPANY = "company-a";
const COMPANY_B = "company-b";

const fill = (v: number) => Array(12).fill(v);

const bRow = (key: string, group: string, monthly: number, label = key): BudgetRow => ({
  key,
  label,
  values: fill(monthly),
  isEditable: true,
  group,
});

/** 12 værdirækker for én kategori i ét scenarie. */
const seedScenario = (
  user: string,
  company: string,
  year: string,
  scenario: string,
  category: string,
  amount: number,
) =>
  Array.from({ length: 12 }, (_, i) => ({
    user_id: user,
    company_id: company,
    category,
    budget_amount: amount,
    period: `${year}-${scenario}-${i}`,
  }));

beforeEach(() => {
  h.current = createBudgetTargetsMock();
});

describe("mock-invarianter (unik nøgle)", () => {
  it("insert af dublet på (company, user, category, period) → 23505, intet skrevet", async () => {
    h.current.seed(seedScenario(USER, COMPANY, "2026", "base", "omsaetning", 1).slice(0, 1));
    const { error } = await h.current.supabase.from("budget_targets").insert({
      user_id: USER,
      company_id: COMPANY,
      category: "omsaetning",
      budget_amount: 2,
      period: "2026-base-0",
    });
    expect(error).toMatchObject({ code: "23505" });
    expect(h.current.table).toHaveLength(1);
    expect(h.current.table[0].budget_amount).toBe(1);
  });

  it("upsert m. onConflict opdaterer eksisterende række", async () => {
    h.current.seed(seedScenario(USER, COMPANY, "2026", "base", "omsaetning", 1).slice(0, 1));
    const { error } = await h.current.supabase.from("budget_targets").upsert(
      [
        {
          user_id: USER,
          company_id: COMPANY,
          category: "omsaetning",
          budget_amount: 99,
          period: "2026-base-0",
        },
      ],
      { onConflict: "company_id,user_id,category,period" },
    );
    expect(error).toBeNull();
    expect(h.current.table).toHaveLength(1);
    expect(h.current.table[0].budget_amount).toBe(99);
  });
});

describe("W1 — writeTemplateMarker", () => {
  it("skriver én markerrække m. period = skabelon-key", async () => {
    await writeTemplateMarker(USER, COMPANY, "service_b2b");
    expect(h.current.table).toHaveLength(1);
    expect(h.current.table[0]).toMatchObject({
      user_id: USER,
      company_id: COMPANY,
      category: "__template__",
      budget_amount: 0,
      period: "service_b2b",
    });
  });
});

describe("W2 — saveScenarioEdits (delete-før-insert)", () => {
  const save = (rows: BudgetRow[]) =>
    saveScenarioEdits({
      userId: USER,
      companyId: COMPANY,
      year: "2026",
      scenario: "base",
      rows,
      labelOverrides: { omsaetning: "Salg" },
      templateKeys: new Set(["omsaetning"]),
    });

  it("rammer kun årets+scenariets værdirækker og årets markers — alt andet består", async () => {
    h.current.seed([
      ...seedScenario(USER, COMPANY, "2026", "base", "omsaetning", 1),
      ...seedScenario(USER, COMPANY, "2026", "optimistisk", "omsaetning", 2),
      ...seedScenario(USER, COMPANY, "2025", "base", "omsaetning", 3),
      { user_id: USER, company_id: COMPANY, category: "__label__2026_gammel", budget_amount: 0, period: "Gammel label" },
      { user_id: USER, company_id: COMPANY, category: "__label__2025_x", budget_amount: 0, period: "Y" },
    ]);

    await save([bRow("omsaetning", "indtaegter", 100), bRow("ekstra", "drift", 50)]);

    const rows = h.current.table;
    // 2026-base genskrevet m. de nye tal
    expect(rows.filter((r) => r.period.startsWith("2026-base-") && r.category === "omsaetning")
      .every((r) => r.budget_amount === 100)).toBe(true);
    expect(rows.filter((r) => r.period.startsWith("2026-base-") && r.category === "ekstra")).toHaveLength(12);
    // Andre scenarier/år urørte
    expect(rows.filter((r) => r.period.startsWith("2026-optimistisk-")).every((r) => r.budget_amount === 2)).toBe(true);
    expect(rows.filter((r) => r.period.startsWith("2025-base-"))).toHaveLength(12);
    // Årets markers genskrevet: gammel label væk, ny label + gruppe for ikke-skabelon-linjen
    expect(rows.find((r) => r.category === "__label__2026_gammel")).toBeUndefined();
    expect(rows.find((r) => r.category === "__label__2026_omsaetning")?.period).toBe("Salg");
    expect(rows.find((r) => r.category === "__group__2026_ekstra")?.period).toBe("drift");
    expect(rows.find((r) => r.category === "__group__2026_omsaetning")).toBeUndefined();
    // Fremmed års marker består
    expect(rows.find((r) => r.category === "__label__2025_x")?.period).toBe("Y");
  });

  it("gem to gange = ingen dubletter (idempotent rækkebestand)", async () => {
    await save([bRow("omsaetning", "indtaegter", 100)]);
    const countAfterFirst = h.current.table.length;
    await save([bRow("omsaetning", "indtaegter", 100)]);
    expect(h.current.table).toHaveLength(countAfterFirst);
  });

  it("§7.3: medlem + advisor har hver deres række for samme celle — gem rydder BEGGE (én sandhed)", async () => {
    h.current.seed([
      { user_id: USER, company_id: COMPANY, category: "omsaetning", budget_amount: 111, period: "2026-base-0" },
      { user_id: ADVISOR, company_id: COMPANY, category: "omsaetning", budget_amount: 222, period: "2026-base-0" },
    ]);

    await save([bRow("omsaetning", "indtaegter", 100)]);

    const cellRows = h.current.rowsWhere((r) => r.period === "2026-base-0" && r.category === "omsaetning");
    expect(cellRows).toHaveLength(1);
    expect(cellRows[0]).toMatchObject({ user_id: USER, budget_amount: 100 });
  });
});

describe("W3 — copyBaseToScenario", () => {
  it("erstatter target-scenariet; base-rækkerne i tabellen består", async () => {
    h.current.seed([
      ...seedScenario(USER, COMPANY, "2026", "base", "omsaetning", 100),
      ...seedScenario(USER, COMPANY, "2026", "optimistisk", "omsaetning", 9),
    ]);

    const baseRows = [bRow("omsaetning", "indtaegter", 100)];
    const copied = await copyBaseToScenario({
      userId: USER,
      companyId: COMPANY,
      year: "2026",
      target: "optimistisk",
      baseRows,
    });

    const opt = h.current.rowsWhere((r) => r.period.startsWith("2026-optimistisk-"));
    expect(opt).toHaveLength(12);
    expect(opt.every((r) => r.budget_amount === 100)).toBe(true);
    expect(h.current.rowsWhere((r) => r.period.startsWith("2026-base-"))).toHaveLength(12);
    // Returværdien er en dyb kopi — mutation rammer ikke input
    expect(copied[0].values).not.toBe(baseRows[0].values);
  });
});

describe("W4 — generateAIScenario (m. U3-værnet) gennem harnesset", () => {
  const baseRows = [
    bRow("omsaetning", "indtaegter", 100_000, "Omsætning"),
    bRow("loenninger", "personale", 30_000, "Lønninger"),
  ];
  const args = { userId: USER, companyId: COMPANY, year: "2026", target: "pessimistisk" as const, baseRows };

  it("delvist match: matchede linjer får AI-tal, umatchede beholder base — begge skrives", async () => {
    h.current.setInvokeHandler("generate-budget-scenarios", () => ({
      data: {
        categories: [{ key: "Omsætning", monthly: fill(80_000) }],
        reasoning: "Omsætning reduceret 20 %.",
      },
      error: null,
    }));

    const res = await generateAIScenario(args);

    expect(res.matchedCount).toBe(1);
    expect(res.totalRowCount).toBe(2);
    const pess = h.current.rowsWhere((r) => r.period.startsWith("2026-pessimistisk-"));
    expect(pess.filter((r) => r.category === "omsaetning").every((r) => r.budget_amount === 80_000)).toBe(true);
    expect(pess.filter((r) => r.category === "loenninger").every((r) => r.budget_amount === 30_000)).toBe(true);
  });

  it("nul-match: fejl kastes og INTET skrives", async () => {
    h.current.setInvokeHandler("generate-budget-scenarios", () => ({
      data: { categories: [{ key: "revenue", monthly: fill(1) }], reasoning: "…" },
      error: null,
    }));

    await expect(generateAIScenario(args)).rejects.toThrow(/matchede ikke/i);
    expect(h.current.table).toHaveLength(0);
  });

  it("falsy-værnet: ugyldig monthly (forkert længde/type) tæller som umatchet", async () => {
    h.current.setInvokeHandler("generate-budget-scenarios", () => ({
      data: {
        categories: [
          { key: "Omsætning", monthly: fill(80_000).slice(0, 11) },
          { key: "Lønninger", monthly: [...fill(31_000).slice(0, 11), "31000"] },
        ],
        reasoning: "…",
      },
      error: null,
    }));

    await expect(generateAIScenario(args)).rejects.toThrow(/matchede ikke/i);
    expect(h.current.table).toHaveLength(0);
  });
});

describe("W5 — confirmBudgetImport", () => {
  it("sletter årets 3 scenarier (user+company), summerer dublet-keys og upserter ×3", async () => {
    h.current.seed([
      ...seedScenario(USER, COMPANY, "2026", "base", "gammel_kategori", 7),
      ...seedScenario(USER, COMPANY, "2026", "optimistisk", "gammel_kategori", 7),
    ]);

    await confirmBudgetImport({
      userId: USER,
      companyId: COMPANY,
      preview: {
        year: "2026",
        categories: [
          { key: "omsaetning", monthly: fill(5_000) },
          { key: "omsaetning", monthly: fill(1_000) },
        ],
      },
    });

    const rows = h.current.rowsWhere((r) => r.user_id === USER);
    expect(rows.filter((r) => r.category === "gammel_kategori")).toHaveLength(0);
    for (const scenario of ["base", "optimistisk", "pessimistisk"]) {
      const sc = rows.filter((r) => r.period.startsWith(`2026-${scenario}-`));
      expect(sc).toHaveLength(12);
      expect(sc.every((r) => r.category === "omsaetning" && r.budget_amount === 6_000)).toBe(true);
    }
  });

  it("§7.3-arven (bogført, uændret): en ANDEN skribents række for samme company overlever W5", async () => {
    h.current.seed([
      { user_id: ADVISOR, company_id: COMPANY, category: "omsaetning", budget_amount: 222, period: "2026-base-0" },
    ]);

    await confirmBudgetImport({
      userId: USER,
      companyId: COMPANY,
      preview: { year: "2026", categories: [{ key: "omsaetning", monthly: fill(5_000) }] },
    });

    expect(
      h.current.rowsWhere((r) => r.user_id === ADVISOR && r.period === "2026-base-0"),
    ).toHaveLength(1);
  });
});

describe("W6 — confirmBudgetFromAccounts (U1 + U2)", () => {
  it("U1: company-filteret — samme brugers rækker for en ANDEN virksomhed overlever", async () => {
    // Advisoren har base-2027-rækker + skabelonmarker for company A …
    h.current.seed([
      ...seedScenario(ADVISOR, COMPANY, "2027", "base", "omsaetning", 42),
      { user_id: ADVISOR, company_id: COMPANY, category: "__template__", budget_amount: 0, period: "service_b2b" },
    ]);

    // … og genererer nu budget fra regnskab for company B (target-år 2027).
    const { targetYear } = await confirmBudgetFromAccounts({
      userId: ADVISOR,
      companyId: COMPANY_B,
      sourceYear: "2026",
      categories: [{ key: "omsaetning", monthly: fill(10_000) }],
    });

    expect(targetYear).toBe("2027");
    // Company A urørt (den gamle kode slettede på user_id alene — recon §7.3)
    expect(h.current.rowsWhere((r) => r.company_id === COMPANY && r.period.startsWith("2027-base-"))).toHaveLength(12);
    expect(h.current.rowsWhere((r) => r.company_id === COMPANY && r.category === "__template__")).toHaveLength(1);
    // Company B har de nye rækker
    const bRows = h.current.rowsWhere((r) => r.company_id === COMPANY_B);
    expect(bRows.filter((r) => r.period.startsWith("2027-base-"))).toHaveLength(12);
    expect(bRows.every((r) => r.budget_amount === 10_000)).toBe(true);
  });

  it("U2: ingen __template__-marker skrives — og en eksisterende marker for target-company fjernes", async () => {
    h.current.seed([
      { user_id: ADVISOR, company_id: COMPANY_B, category: "__template__", budget_amount: 0, period: "webshop_b2c" },
    ]);

    await confirmBudgetFromAccounts({
      userId: ADVISOR,
      companyId: COMPANY_B,
      sourceYear: "2026",
      categories: [{ key: "omsaetning", monthly: fill(10_000) }],
    });

    expect(h.current.rowsWhere((r) => r.category === "__template__")).toHaveLength(0);
  });

  it("gentagen generering for samme company erstatter — ingen dubletter", async () => {
    const run = () =>
      confirmBudgetFromAccounts({
        userId: ADVISOR,
        companyId: COMPANY_B,
        sourceYear: "2026",
        categories: [{ key: "omsaetning", monthly: fill(10_000) }],
      });
    await run();
    await run();
    expect(h.current.rowsWhere((r) => r.company_id === COMPANY_B)).toHaveLength(12);
  });
});

describe("Rundtur — import → load", () => {
  it("confirmBudgetImport → loadBudget giver præcis preview-tallene, uden skabelonmarker", async () => {
    const monthly = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000];
    await confirmBudgetImport({
      userId: USER,
      companyId: COMPANY,
      preview: {
        year: "2026",
        categories: [
          { key: "omsaetning", monthly },
          { key: "vareforbrug", monthly: fill(4_000) },
        ],
      },
    });

    const result = await loadBudget(COMPANY, "2026");
    expect(result.empty).toBe(false);
    expect(result.availableYears).toEqual(["2026"]);
    const decoded = result.decoded!;
    expect(decoded.templateFromMarker).toBe(false);
    expect(decoded.scenarioData.base.find((r) => r.key === "omsaetning")!.values).toEqual(monthly);
    expect(decoded.scenarioData.pessimistisk.find((r) => r.key === "vareforbrug")!.values).toEqual(fill(4_000));
  });
});

describe("hentAlleSider — pagineret læsning over 1.000-rækkers-loftet (fix/loadbudget-over-tusind)", () => {
  it("paginerer indtil en kort side: 1.000 + 378 = alle 1.378 (remm-tallet)", async () => {
    const kald: [number, number][] = [];
    const raekker = Array.from({ length: 1378 }, (_, i) => ({ n: i }));
    const alle = await hentAlleSider<{ n: number }>((fra, til) => {
      kald.push([fra, til]);
      return Promise.resolve({ data: raekker.slice(fra, til + 1), error: null });
    });
    expect(alle).toHaveLength(1378);
    expect(alle[1377]).toEqual({ n: 1377 });
    expect(kald).toEqual([[0, 999], [1000, 1999]]);
  });

  it("en fejl fra supabase KASTES — aldrig en tom liste", async () => {
    await expect(
      hentAlleSider(() => Promise.resolve({ data: null, error: { message: "boom" } })),
    ).rejects.toEqual({ message: "boom" });
  });

  it("loadBudget ser rækker UD OVER de første tusind (medlemmets forsvundne rettelser)", async () => {
    // 1.000 fyldrækker lægger sig først i tabellen — den gamle ufiltrerede
    // hentning uden paginering så KUN dem, og alt herunder var usynligt.
    h.current.seed(
      Array.from({ length: 1000 }, (_, i) => ({
        user_id: USER,
        company_id: COMPANY,
        category: `filler_${i}`,
        budget_amount: 1,
        period: "2025-base-0",
      })),
    );
    h.current.seed(seedScenario(USER, COMPANY, "2026", "base", "sidste_raekke", 777));

    const result = await loadBudget(COMPANY, "2026");
    expect(result.empty).toBe(false);
    expect(result.availableYears).toContain("2026");
    const row = result.decoded!.scenarioData.base.find((r) => r.key === "sidste_raekke");
    expect(row, "rækken uden for de første tusind skal kunne læses").toBeDefined();
    expect(row!.values).toEqual(Array(12).fill(777));
  });

  it("saveScenarioEdits sletter gamle rækker UD OVER de første tusind (ingen genopstandne tal)", async () => {
    h.current.seed(
      Array.from({ length: 1000 }, (_, i) => ({
        user_id: USER,
        company_id: COMPANY,
        category: `filler_${i}`,
        budget_amount: 1,
        period: "2025-base-0",
      })),
    );
    // Gamle 2026-base-rækker EFTER fyldet — uden paginering usete og
    // dermed aldrig slettet: de ville overskrive de nye ved næste load.
    h.current.seed(seedScenario(USER, COMPANY, "2026", "base", "gammel_kategori", 999));

    await saveScenarioEdits({
      userId: USER,
      companyId: COMPANY,
      year: "2026",
      scenario: "base",
      rows: [bRow("omsaetning", "indtaegter", 100)],
      labelOverrides: {},
      templateKeys: new Set(["omsaetning"]),
    });

    expect(h.current.rowsWhere((r) => r.category === "gammel_kategori")).toEqual([]);
    expect(
      h.current.rowsWhere((r) => r.category === "omsaetning" && r.period.startsWith("2026-base-")),
    ).toHaveLength(12);
    expect(h.current.rowsWhere((r) => r.category.startsWith("filler_"))).toHaveLength(1000);
  });
});

describe("W8 — confirmImportFraSkriveplan sletter over 1.000-rækkers-loftet", () => {
  const plan: Skriveplan = {
    aar: "2026",
    raekker: [
      {
        noegle: "import_ny_linje_1",
        etiket: "Ny linje",
        gruppe: "drift",
        maanedsbeloeb: Array.from({ length: 12 }, () => 100),
        fordelinger: [],
      },
    ],
    aarsskift: null,
    grupper: [{ sektion: null, gruppe: "drift" }],
    utolkedeKolonner: [],
    sprungetOverKolonner: [],
    advarsler: [],
  };

  it("prod-scenariet (3ffccc0f): gamle import-rækker UDEN FOR de første tusind slettes alligevel", async () => {
    // 1.000 fyldrækker for et andet år lægger sig FØRST i tabellen…
    h.current.seed(
      Array.from({ length: 1000 }, (_, i) => ({
        user_id: USER,
        company_id: COMPANY,
        category: `filler_${i}`,
        budget_amount: 1,
        period: "2025-base-0",
      })),
    );
    // …og de seks overlevere fra prod ligger derefter — uden for loftet.
    const overlevere = [
      "import_stape_30",
      "import_telefon_internet_50",
      "import_udvikling_design_vedligeholdelse_28",
      "import_uforudsete_omkostninger_5_af_fast_base_54",
      "import_vand_varme_45",
      "import_zoom_31",
    ];
    h.current.seed(
      overlevere.map((category) => ({
        user_id: USER,
        company_id: COMPANY,
        category,
        budget_amount: 999,
        period: "2026-base-0",
      })),
    );
    // Markører: én for planens egen nøgle (skal væk), én for en anden
    // nøgle (skal overleve — noegleSet-semantikken).
    h.current.seed([
      { user_id: USER, company_id: COMPANY, category: "__label__2026_import_ny_linje_1", budget_amount: 0, period: "Gammel etiket" },
      { user_id: USER, company_id: COMPANY, category: "__label__2026_anden_noegle", budget_amount: 0, period: "Anden linje" },
    ]);

    // Fejlens forudsætning, bevist mod mocken: en UFILTRERET hentning (den
    // gamle fetchExistingRows-form) rammer loftet og ser ingen af de seks.
    const ufiltreret = await (h.current.supabase
      .from("budget_targets")
      .select("id, period, category") as never as {
      eq: (c: string, v: string) => PromiseLike<{ data: { category: string }[] }>;
    }).eq("company_id", COMPANY);
    expect(ufiltreret.data).toHaveLength(1000);
    expect(ufiltreret.data.some((r) => r.category.startsWith("import_"))).toBe(false);

    await confirmImportFraSkriveplan({ userId: USER, companyId: COMPANY, plan });

    // Alle seks overlevere er væk; kun planens egne rækker står for 2026.
    expect(h.current.rowsWhere((r) => overlevere.includes(r.category))).toEqual([]);
    const aarsRaekker = h.current.rowsWhere((r) => r.period.startsWith("2026-base-"));
    expect(aarsRaekker.every((r) => r.category === "import_ny_linje_1")).toBe(true);
    expect(aarsRaekker).toHaveLength(12);
    // Markøren for planens nøgle er erstattet; den fremmede står urørt.
    expect(
      h.current.rowsWhere((r) => r.category === "__label__2026_import_ny_linje_1").map((r) => r.period),
    ).toEqual(["Ny linje"]);
    expect(h.current.rowsWhere((r) => r.category === "__label__2026_anden_noegle")).toHaveLength(1);
    // Fyldrækkerne (andet år) er urørte.
    expect(h.current.rowsWhere((r) => r.category.startsWith("filler_"))).toHaveLength(1000);
  });

  it("paginering: over 1.000 rækker der ALLE matcher filteret slettes fuldt ud", async () => {
    // 100 kategorier × 12 måneder = 1.200 matchende rækker — mere end ét sidekald.
    h.current.seed(
      Array.from({ length: 100 }, (_, k) => k).flatMap((k) =>
        Array.from({ length: 12 }, (_, m) => ({
          user_id: USER,
          company_id: COMPANY,
          category: `import_gammel_${k}`,
          budget_amount: 1,
          period: `2026-base-${m}`,
        })),
      ),
    );
    await confirmImportFraSkriveplan({ userId: USER, companyId: COMPANY, plan });
    expect(h.current.rowsWhere((r) => r.category.startsWith("import_gammel_"))).toEqual([]);
    expect(h.current.rowsWhere((r) => r.period.startsWith("2026-base-"))).toHaveLength(12);
  });

  it("insert-dannelsen er uændret: præcis byggSkriveplanInserts' rækker skrives", async () => {
    await confirmImportFraSkriveplan({ userId: USER, companyId: COMPANY, plan });
    const forventet = byggSkriveplanInserts({ userId: USER, companyId: COMPANY, plan });
    const skrevet = h.current
      .rowsWhere(() => true)
      .map(({ id: _id, ...rest }) => rest);
    expect(skrevet).toEqual(forventet);
  });
});

describe("W7 + rundtur — sim-events", () => {
  const events: SimEvent[] = [
    { id: "e-1", type: "hire", label: "Ansæt én medarbejder", monthlyCost: 40_000, startMonth: 2, isRevenue: false },
    { id: "e-2", type: "custom", label: "Ny kunde", monthlyCost: 15_000, startMonth: 5, isRevenue: true },
  ];

  it("save → load er identitet; kontraktens felter ligger i tabellen", async () => {
    await saveSimEvents({ userId: USER, companyId: COMPANY, year: "2026", events });
    const loaded = await loadSimEvents(COMPANY, "2026");
    expect(loaded).toEqual(events);
    const rows = h.current.rowsWhere((r) => r.category.startsWith("__sim_event__"));
    expect(rows.map((r) => r.category).sort()).toEqual(["__sim_event__2026_0", "__sim_event__2026_1"]);
    expect(rows.find((r) => r.category === "__sim_event__2026_0")?.budget_amount).toBe(40_000);
  });

  it("tom liste rydder årets events — andre års events består", async () => {
    h.current.seed([
      { user_id: USER, company_id: COMPANY, category: "__sim_event__2025_0", budget_amount: 1, period: JSON.stringify(events[0]) },
    ]);
    await saveSimEvents({ userId: USER, companyId: COMPANY, year: "2026", events });
    await saveSimEvents({ userId: USER, companyId: COMPANY, year: "2026", events: [] });

    expect(h.current.rowsWhere((r) => r.category.startsWith("__sim_event__2026_"))).toHaveLength(0);
    expect(h.current.rowsWhere((r) => r.category === "__sim_event__2025_0")).toHaveLength(1);
  });

  it("ulæselig JSON i tabellen ignoreres stille ved load (kontraktens filter(Boolean))", async () => {
    h.current.seed([
      { user_id: USER, company_id: COMPANY, category: "__sim_event__2026_0", budget_amount: 1, period: "ikke json" },
      { user_id: USER, company_id: COMPANY, category: "__sim_event__2026_1", budget_amount: 15_000, period: JSON.stringify(events[1]) },
    ]);
    const loaded = await loadSimEvents(COMPANY, "2026");
    expect(loaded).toEqual([events[1]]);
  });
});
