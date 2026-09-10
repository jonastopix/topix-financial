import { describe, expect, it } from "vitest";
import { LIVE_MAERKE, liveEvent, liveEventSti, liveEventTitel } from "../liveEvent";

// Faste tidspunkter i UTC — dommen er absolut tid, ikke kalenderdage.
const T = (min: number) => new Date(Date.UTC(2026, 8, 10, 9, min)).toISOString(); // 09:xx Z
const NU = (min: number) => new Date(Date.UTC(2026, 8, 10, 9, min));
const ev = (id: string, startMin: number, slutMin: number | null, status = "published") => ({
  id, title: `Event ${id}`, starts_at: T(startMin), ends_at: slutMin == null ? null : T(slutMin), status,
});

describe("liveEvent — samme dom som Meet-knappen", () => {
  it("grænsen før: 16 min før start er ikke live, PRÆCIS 15 min før er live", () => {
    const e = ev("a", 30, 60);
    expect(liveEvent([e], NU(14))).toBeNull();
    expect(liveEvent([e], NU(15))?.id).toBe("a");
  });

  it("grænsen efter: præcis ved sluttiden er stadig live, ét minut efter er den ikke", () => {
    const e = ev("a", 0, 30);
    expect(liveEvent([e], NU(30))?.id).toBe("a");
    expect(liveEvent([e], NU(31))).toBeNull();
  });

  it("uden ends_at gælder 90 minutter fra start (eventEndTime)", () => {
    const e = ev("a", 0, null);
    expect(liveEvent([e], new Date(Date.UTC(2026, 8, 10, 10, 30)))?.id).toBe("a");
    expect(liveEvent([e], new Date(Date.UTC(2026, 8, 10, 10, 31)))).toBeNull();
  });

  it("ingen events, eller kun aflyste/kladder → null", () => {
    expect(liveEvent([], NU(0))).toBeNull();
    expect(liveEvent([ev("a", 0, 30, "cancelled"), ev("b", 0, 30, "draft")], NU(10))).toBeNull();
    expect(liveEvent([{ id: "c", title: "c", starts_at: T(0), ends_at: T(30) }], NU(10))?.id).toBe("c"); // uden status = published
  });

  it("flere overlapper: det der er begyndt vinder over det der begynder om lidt", () => {
    const igang = ev("igang", 0, 60);        // begyndte kl. 09:00
    const snart = ev("snart", 40, 90);       // begynder 09:40 → live fra 09:25
    expect(liveEvent([snart, igang], NU(30))?.id).toBe("igang");
    // kl. 09:45 er begge begyndt → den tidligste start
    expect(liveEvent([snart, igang], NU(45))?.id).toBe("igang");
    // kl. 09:20: kun «igang» er live (snart er live først 09:25)
    expect(liveEvent([snart, igang], NU(20))?.id).toBe("igang");
  });

  it("ingen er begyndt endnu, to er i 15-minutters-vinduet → den tidligste start", () => {
    const a = ev("a", 12, 60); // live fra 08:57
    const b = ev("b", 14, 60); // live fra 08:59
    expect(liveEvent([b, a], NU(0))?.id).toBe("a");
  });

  it("input ændres ikke", () => {
    const liste = [ev("b", 40, 90), ev("a", 0, 60)];
    liveEvent(liste, NU(45));
    expect(liste.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("mærket", () => {
  it("siger «Live nu», fører til eventets side, og skærmlæseren får titlen", () => {
    expect(LIVE_MAERKE).toBe("Live nu");
    expect(liveEventSti({ id: "abc" })).toBe("/events/abc");
    expect(liveEventTitel({ title: "Live sparring om likviditet" })).toBe("Live nu: Live sparring om likviditet");
  });
});
