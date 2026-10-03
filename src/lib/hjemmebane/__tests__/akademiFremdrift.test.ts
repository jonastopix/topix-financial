// Dommen bag /engagement-kolonnen «Akademiet» (3/10-2026). Regnestykkerne står ved hver prøve.
import { describe, expect, it } from "vitest";
import {
  akademiFremdrift,
  akademiFremdriftPrVirksomhed,
  akademiKatalog,
  akademiSorteringsnoegle,
  akademiSporTekst,
  akademiTekst,
  type AkademiFremdriftRaekke,
} from "../akademiFremdrift";

const OMRAADER = [
  { key: "start_her", akademi: true },
  { key: "classroom", akademi: true },
  { key: "academy", akademi: true },
  { key: "talks", akademi: false },
  { key: "quick_wins", akademi: false },
];
const video = (id: string, area = "classroom") => ({ id, area, media_provider: "bunny", bunny_video_id: `v-${id}` });

const r = (user_id: string, content_item_id: string, felter: Partial<AkademiFremdriftRaekke> = {}): AkademiFremdriftRaekke => ({
  user_id,
  content_item_id,
  seen_at: null,
  acknowledged_at: null,
  skipped_at: null,
  brugbar_at: null,
  markeret_at: null,
  ...felter,
});

describe("akademiKatalog", () => {
  it("tæller kun sporede videoer i Akademiets områder", () => {
    const katalog = akademiKatalog(
      [
        video("a", "start_her"),
        video("b", "classroom"),
        video("c", "academy"),
        video("d", "talks"), // optagelse: ikke i Akademiet
        video("e", "quick_wins"), // skjult 1/10
        { id: "f", area: "classroom", media_provider: "bunny", bunny_video_id: null }, // intet video-id
        { id: "g", area: "classroom", media_provider: "youtube", bunny_video_id: "x" }, // ikke bunny
      ],
      OMRAADER,
    );
    // 3 (a, b, c) af 7 rækker.
    expect([...katalog].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("akademiFremdrift", () => {
  const katalog = new Set(["a", "b", "c", "d"]);

  it("set = egne done; påbegyndt = rørt men ikke done; procent = round(100 · set / M)", () => {
    const f = akademiFremdrift(
      [
        r("u1", "a", { acknowledged_at: "2026-09-01T10:00:00Z", seen_at: "2026-09-01T09:00:00Z" }), // done
        r("u1", "b", { seen_at: "2026-09-20T08:00:00Z" }), // started
        r("u1", "c", { skipped_at: "2026-09-10T08:00:00Z" }), // skipped = rørt
        r("u1", "x", { acknowledged_at: "2026-10-01T08:00:00Z" }), // uden for kataloget: tæller ikke, heller ikke som seneste
      ],
      katalog,
    );
    // set = {a} = 1; påbegyndt = {b} = 1; sprunget over = {c} = 1 (et fravalg er ikke påbegyndt);
    // M = 4; procent = round(100 · 1 / 4) = 25.
    expect(f).toEqual({
      set: 1,
      paabegyndt: 1,
      sprunget: 1,
      gennemgaaetMedRaadgiver: 0,
      ialt: 4,
      procent: 25,
      senesteAktivitet: "2026-09-20T08:00:00.000Z",
    });
  });

  it("rådgiverens stempel tæller ALDRIG som set — det står for sig", () => {
    const stempel = "2026-08-05T12:00:00Z";
    const f = akademiFremdrift(
      [
        // Backfillet batch-række: acknowledged_at = seen_at = markeret_at → rådgiverens.
        r("u1", "a", { acknowledged_at: stempel, seen_at: stempel, markeret_at: stempel }),
        // Kun rådgiverens markering, intet af medlemmet.
        r("u1", "b", { markeret_at: "2026-10-02T12:00:00Z" }),
        // Gennemgået OG hendes eget senere klik → set (≠ markeret_at).
        r("u1", "c", { markeret_at: stempel, acknowledged_at: "2026-09-01T10:00:00Z" }),
      ],
      katalog,
    );
    // set = {c} = 1; gennemgået = {a, b, c} = 3; påbegyndt = 0;
    // seneste = kun egne stempler: c's 2026-09-01 (a's stempler er rådgiverens, b har ingen).
    expect(f.set).toBe(1);
    expect(f.gennemgaaetMedRaadgiver).toBe(3);
    expect(f.paabegyndt).toBe(0);
    expect(f.senesteAktivitet).toBe("2026-09-01T10:00:00.000Z");
  });

  it("foreningsmængde over medlemmer: samme video set af to er 1, aldrig over M", () => {
    const f = akademiFremdrift(
      [
        r("u1", "a", { acknowledged_at: "2026-09-01T10:00:00Z" }),
        r("u2", "a", { acknowledged_at: "2026-09-02T10:00:00Z" }),
        r("u2", "b", { seen_at: "2026-09-03T10:00:00Z" }),
        r("u1", "b", { acknowledged_at: "2026-09-04T10:00:00Z" }), // b er done hos u1 → ikke påbegyndt
      ],
      katalog,
    );
    // set = {a, b} = 2 (ikke 3); påbegyndt = {} (b er done hos u1); procent = round(100 · 2 / 4) = 50.
    expect(f.set).toBe(2);
    expect(f.paabegyndt).toBe(0);
    expect(f.procent).toBe(50);
  });

  it("procenten afrundes: 1 af 3 = round(33,33…) = 33; M = 0 giver null", () => {
    expect(akademiFremdrift([r("u", "a", { acknowledged_at: "2026-09-01T10:00:00Z" })], new Set(["a", "b", "c"])).procent).toBe(33);
    // 2 af 3 = round(66,66…) = 67.
    expect(
      akademiFremdrift(
        [r("u", "a", { acknowledged_at: "2026-09-01T10:00:00Z" }), r("u", "b", { acknowledged_at: "2026-09-01T10:00:00Z" })],
        new Set(["a", "b", "c"]),
      ).procent,
    ).toBe(67);
    expect(akademiFremdrift([], new Set()).procent).toBeNull();
  });

  it("uden rækker: 0 af M og ingen seneste", () => {
    expect(akademiFremdrift([], katalog)).toEqual({ set: 0, paabegyndt: 0, sprunget: 0, gennemgaaetMedRaadgiver: 0, ialt: 4, procent: 0, senesteAktivitet: null });
  });
});

describe("sprunget over er ikke påbegyndt", () => {
  it("én lektion: set > påbegyndt > sprunget over over medlemmerne", () => {
    const k = new Set(["a", "b", "c"]);
    const f = akademiFremdrift(
      [
        r("u1", "a", { skipped_at: "2026-09-01T10:00:00Z" }),
        r("u2", "a", { seen_at: "2026-09-02T10:00:00Z" }), // a: påbegyndt hos u2 slår sprunget hos u1
        r("u1", "b", { skipped_at: "2026-09-01T10:00:00Z" }),
        r("u2", "b", { acknowledged_at: "2026-09-02T10:00:00Z" }), // b: set slår alt
        r("u1", "c", { skipped_at: "2026-09-01T10:00:00Z" }), // c: kun sprunget over
      ],
      k,
    );
    // set = {b} = 1; påbegyndt = {a} = 1; sprunget = {c} = 1.
    expect([f.set, f.paabegyndt, f.sprunget]).toEqual([1, 1, 1]);
  });
});

describe("akademiFremdriftPrVirksomhed", () => {
  const katalog = new Set(["a", "b"]);
  it("rådgivere og tjenestekonti tæller ikke, selv som company_members; et medlem af to virksomheder tæller i begge", () => {
    const raekker = [
      r("medlem", "a", { acknowledged_at: "2026-09-01T10:00:00Z" }),
      r("raadgiver", "b", { acknowledged_at: "2026-09-01T10:00:00Z" }),
      r("fremmed", "b", { acknowledged_at: "2026-09-01T10:00:00Z" }), // ikke i kortet
    ];
    const pr = akademiFremdriftPrVirksomhed(
      raekker,
      new Map([
        ["c1", ["medlem", "raadgiver"]],
        ["c2", ["medlem"]],
      ]),
      new Set(["raadgiver"]),
      ["c1", "c2", "c3"],
      katalog,
    );
    // c1: kun «medlem» → {a} = 1 af 2 (rådgiverens b tæller ikke). c2: samme medlem → 1 af 2. c3: ingen → 0 af 2.
    expect(pr.get("c1")?.set).toBe(1);
    expect(pr.get("c2")?.set).toBe(1);
    expect(pr.get("c3")?.set).toBe(0);
    expect(pr.get("c3")?.ialt).toBe(2);
  });
});

describe("tekster og sortering", () => {
  const f = { set: 4, paabegyndt: 2, sprunget: 0, gennemgaaetMedRaadgiver: 1, ialt: 77, procent: 5, senesteAktivitet: null };
  it("«N af M set», «—» uden data", () => {
    expect(akademiTekst(f)).toBe("4 af 77 set");
    expect(akademiTekst(null)).toBe("—");
  });
  it("sporet nævner kun det, der findes", () => {
    expect(akademiSporTekst(f)).toBe("2 påbegyndt · 1 gennemgået med rådgiver");
    expect(akademiSporTekst({ ...f, paabegyndt: 0, gennemgaaetMedRaadgiver: 0 })).toBeNull();
    expect(akademiSporTekst({ ...f, paabegyndt: 0, sprunget: 3, gennemgaaetMedRaadgiver: 0 })).toBe("3 sprunget over");
    expect(akademiSporTekst(null)).toBeNull();
  });
  it("sorteringsnøglen er antal set; ikke hentet = −1", () => {
    expect(akademiSorteringsnoegle(f)).toBe(4);
    expect(akademiSorteringsnoegle(null)).toBe(-1);
  });
});
