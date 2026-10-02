import { describe, expect, it } from "vitest";
import { NETVAERK_HOVED, netvaerkFaner, visNetvaerkFaner } from "@/lib/hjemmebane/netvaerkFaner";
import { NETVAERKETS_BOERN } from "@/lib/hjemmebane/hbNav";
import { visStedsSaetning } from "@/lib/hjemmebane/stedsSaetninger";

/** Netværket som ét sted med faner (seks steder, skridt 2, 2/10-2026) — ren dom. */
describe("netvaerkFaner — fanerne er menuens fem børn, dømt af stien", () => {
  it("de fem forsider får fanerne i menuens orden med præcis én aktiv — den, stien er", () => {
    for (const b of NETVAERKETS_BOERN) {
      const f = netvaerkFaner(b.to);
      expect(f).not.toBeNull();
      expect(f!.map((x) => x.label)).toEqual(["Community", "Events", "Medlemmerne", "Fordele", "Anbefal"]);
      expect(f!.map((x) => x.to)).toEqual(NETVAERKETS_BOERN.map((x) => x.to));
      expect(f!.filter((x) => x.aktiv).map((x) => x.to)).toEqual([b.to]);
    }
  });
  it("stien normaliseres: efterstillet skråstreg, query og hash ændrer intet", () => {
    expect(netvaerkFaner("/events/")?.find((x) => x.aktiv)?.to).toBe("/events");
    expect(netvaerkFaner("/community?praesentation=1")?.find((x) => x.aktiv)?.to).toBe("/community");
    expect(netvaerkFaner("/deling#x")?.find((x) => x.aktiv)?.to).toBe("/deling");
  });
  it("undersider og alle andre stier får ingen faner", () => {
    for (const sti of ["/community/abc", "/events/abc", "/medlemmer/abc", "/", "/akademiet", "/chat", "/nyheder", "/kpis", "", "/rabataftaler/x"]) {
      expect(netvaerkFaner(sti), sti).toBeNull();
    }
  });
  it("gaten er sætningens — samme funktion", () => {
    expect(visNetvaerkFaner).toBe(visStedsSaetning);
  });
  it("hovedets ord er forslagets", () => {
    expect(NETVAERK_HOVED).toEqual({ eyebrow: "Netværket", rubrik: "Netværket" });
  });
});
