import { describe, expect, it } from "vitest";
import {
  MAASKE_RELEVANT_LOFT,
  MAASKE_RELEVANT_PRAEFIKS,
  MODUL_FOR_TRIGGER,
  brugbarAndel,
  maaskeRelevant,
  maaskeRelevantTekst,
  modulerForFokus,
} from "@/lib/hjemmebane/maaskeRelevant";
import type { LektionRaekke } from "@/lib/hjemmebane/lektionerForModul";

/* «Måske relevant for dig» (Jonas 16/9): regelbaseret V1 — ugens fokus'
   triggere → handout-modul → lektionerForModul; gennemførte udelades;
   forløbsrækkefølge, derefter «brugbar»-andel; intet match → null. */

const raekke = (over: Partial<LektionRaekke> & Pick<LektionRaekke, "id">): LektionRaekke => ({
  area: "classroom",
  slug: over.id,
  title: `Lektion ${over.id}`,
  status: "published",
  handout_module: null,
  position: 0,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const katalog = [
  raekke({ id: "bog1", handout_module: "bogholderi", position: 1 }),
  raekke({ id: "bog2", handout_module: "bogholderi", position: 2 }),
  raekke({ id: "bog3", handout_module: "bogholderi", position: 3 }),
  raekke({ id: "salg1", handout_module: "salg", position: 1 }),
  raekke({ id: "maal1", handout_module: "overordnet", position: 1 }),
  raekke({ id: "kladde", handout_module: "bogholderi", position: 0, status: "draft" }),
  raekke({ id: "uden", handout_module: null, position: 0 }),
];

const fokus = (triggers: unknown, data: unknown = {}) => ({ triggers_fired: triggers, trigger_data: data });
const koer = (over: Partial<Parameters<typeof maaskeRelevant>[0]> = {}) =>
  maaskeRelevant({ fokus: fokus(["BUDGET_DEVIATION"]), lektioner: katalog, progress: [], ...over });

describe("modulerForFokus — triggere til handout-moduler", () => {
  it("økonomi-triggerne → bogholderi; milepæls-triggerne → overordnet; REPORT_UPLOADED alene → intet", () => {
    expect(modulerForFokus(fokus(["BUDGET_DEVIATION"]))).toEqual(["bogholderi"]);
    expect(modulerForFokus(fokus(["KPI_OFF_TARGET", "BENCHMARK_BELOW", "POSITIVE_MOMENTUM", "NO_REPORT_60_DAYS"]))).toEqual(["bogholderi"]);
    expect(modulerForFokus(fokus(["MILESTONE_DUE_SOON"]))).toEqual(["overordnet"]);
    expect(modulerForFokus(fokus(["MILESTONE_STALLED", "BUDGET_DEVIATION"]))).toEqual(["overordnet", "bogholderi"]);
    expect(modulerForFokus(fokus(["REPORT_UPLOADED"]))).toEqual([]);
  });
  it("HANDOUT_OVERDUE tager modulet fra trigger_data — og først", () => {
    expect(modulerForFokus(fokus(["BUDGET_DEVIATION", "HANDOUT_OVERDUE"], { HANDOUT_OVERDUE: [{ module: "salg", days_overdue: 50 }] }))).toEqual(["salg", "bogholderi"]);
    expect(modulerForFokus(fokus(["HANDOUT_OVERDUE"], { HANDOUT_OVERDUE: [{ module: "salg" }, { module: "salg" }, { module: "marketing" }] }))).toEqual(["salg", "marketing"]);
  });
  it("ukendt trigger, tom liste, ulæselig række → intet", () => {
    expect(modulerForFokus(fokus(["NOGET_NYT"]))).toEqual([]);
    expect(modulerForFokus(fokus([]))).toEqual([]);
    expect(modulerForFokus(fokus("ikke en liste"))).toEqual([]);
    expect(modulerForFokus(fokus(["HANDOUT_OVERDUE"], { HANDOUT_OVERDUE: "ikke en liste" }))).toEqual([]);
    expect(modulerForFokus(null)).toEqual([]);
    expect(modulerForFokus(undefined)).toEqual([]);
  });
  it("regeltabellen kender alle ni triggere fra generate-weekly-focus", () => {
    expect(Object.keys(MODUL_FOR_TRIGGER).sort()).toEqual(
      ["BENCHMARK_BELOW", "BUDGET_DEVIATION", "HANDOUT_OVERDUE", "KPI_OFF_TARGET", "MILESTONE_DUE_SOON", "MILESTONE_STALLED", "NO_REPORT_60_DAYS", "POSITIVE_MOMENTUM", "REPORT_UPLOADED"],
    );
  });
});

describe("maaskeRelevant — hvilke lektioner", () => {
  it("intet match → null (ingen linje): intet modul, ingen lektioner til modulet, eller tomt katalog", () => {
    expect(koer({ fokus: fokus(["REPORT_UPLOADED"]) })).toBeNull();
    expect(koer({ fokus: fokus(["HANDOUT_OVERDUE"], { HANDOUT_OVERDUE: [{ module: "marketing" }] }) })).toBeNull();
    expect(koer({ lektioner: [] })).toBeNull();
    expect(koer({ fokus: null })).toBeNull();
  });
  it("kun publicerede lektioner med modulet, i forløbsrækkefølge, højst loftet", () => {
    expect(koer()?.map((l) => l.id)).toEqual(["bog1", "bog2"]);
    expect(MAASKE_RELEVANT_LOFT).toBe(2);
    expect(koer({ loft: 1 })?.map((l) => l.id)).toEqual(["bog1"]);
    expect(koer({ loft: 5 })?.map((l) => l.id)).toEqual(["bog1", "bog2", "bog3"]);
  });
  it("gennemførte lektioner (acknowledged_at) udelades; startede og sprunget-over er med", () => {
    const progress = [
      { content_item_id: "bog1", seen_at: "2026-09-01T00:00:00Z", acknowledged_at: "2026-09-02T00:00:00Z", skipped_at: null },
      { content_item_id: "bog2", seen_at: "2026-09-01T00:00:00Z", acknowledged_at: null, skipped_at: null },
      { content_item_id: "bog3", seen_at: null, acknowledged_at: null, skipped_at: "2026-09-01T00:00:00Z" },
    ];
    expect(koer({ progress })?.map((l) => l.id)).toEqual(["bog2", "bog3"]);
  });
  it("alle gennemført → null", () => {
    const progress = ["bog1", "bog2", "bog3"].map((id) => ({ content_item_id: id, seen_at: null, acknowledged_at: "2026-09-02T00:00:00Z", skipped_at: null }));
    expect(koer({ progress })).toBeNull();
  });
  it("flere moduler: fokus-ordenen først (HANDOUT_OVERDUE-modulet før regel-modulet), ingen dubletter", () => {
    const r = koer({ fokus: fokus(["BUDGET_DEVIATION", "HANDOUT_OVERDUE"], { HANDOUT_OVERDUE: [{ module: "salg" }] }), loft: 5 });
    expect(r?.map((l) => l.id)).toEqual(["salg1", "bog1", "bog2", "bog3"]);
  });
  it("«brugbar»-andelen sorterer kun mellem lige positioner — forløbsrækkefølgen vinder", () => {
    const lige = [
      raekke({ id: "x", handout_module: "bogholderi", position: 1 }),
      raekke({ id: "y", handout_module: "bogholderi", position: 1, created_at: "2026-02-01T00:00:00Z" }),
      raekke({ id: "z", handout_module: "bogholderi", position: 0 }),
    ];
    const ratings = [
      { content_item_id: "x", brugbar: false, acknowledged_at: "2026-09-01T00:00:00Z" },
      { content_item_id: "y", brugbar: true, acknowledged_at: "2026-09-01T00:00:00Z" },
    ];
    expect(maaskeRelevant({ fokus: fokus(["BUDGET_DEVIATION"]), lektioner: lige, progress: [], ratings, loft: 3 })?.map((l) => l.id)).toEqual(["z", "y", "x"]);
    // Uden ratings: kursets orden (position, så created_at).
    expect(maaskeRelevant({ fokus: fokus(["BUDGET_DEVIATION"]), lektioner: lige, progress: [], loft: 3 })?.map((l) => l.id)).toEqual(["z", "x", "y"]);
  });
});

describe("brugbarAndel — ja / (ja + nej) blandt set-færdig-rækker", () => {
  it("tæller kun rækker med acknowledged_at og et svar; ubesvaret tæller ikke", () => {
    const andel = brugbarAndel([
      { content_item_id: "a", brugbar: true, acknowledged_at: "2026-09-01T00:00:00Z" },
      { content_item_id: "a", brugbar: false, acknowledged_at: "2026-09-01T00:00:00Z" },
      { content_item_id: "a", brugbar: true, acknowledged_at: "2026-09-01T00:00:00Z" },
      { content_item_id: "a", brugbar: null, acknowledged_at: "2026-09-01T00:00:00Z" },
      { content_item_id: "b", brugbar: true, acknowledged_at: null },
    ]);
    expect(andel.get("a")).toBeCloseTo(2 / 3);
    expect(andel.has("b")).toBe(false);
  });
});

describe("ordene", () => {
  it("«Måske relevant for dig: {titel}»", () => {
    expect(MAASKE_RELEVANT_PRAEFIKS).toBe("Måske relevant for dig");
    expect(maaskeRelevantTekst({ title: "Likviditet på 20 minutter" })).toBe("Måske relevant for dig: Likviditet på 20 minutter");
  });
});
