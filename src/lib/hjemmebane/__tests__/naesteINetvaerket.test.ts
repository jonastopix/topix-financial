import { describe, expect, it } from "vitest";
import { NAESTE_I_NETVAERKET, naesteINetvaerket } from "@/lib/hjemmebane/naesteINetvaerket";

/** «Næste i Netværket» (seks steder, skridt 2, 2/10-2026) — ren dom. */
describe("naesteINetvaerket — næste event er listens første, nyeste opslag er det senest oprettede", () => {
  const e = (id: string) => ({ id });
  const t = (id: string, created_at: string, status = "aktiv") => ({ id, created_at, status });

  it("tager det første event (listUpcomingEvents er stigende) og sorterer ikke om", () => {
    expect(naesteINetvaerket([e("a"), e("b")], []).event).toEqual(e("a"));
  });
  it("vælger det senest OPRETTEDE opslag — ikke feedets orden (fastgjort/seneste aktivitet)", () => {
    const d = naesteINetvaerket([], [t("fastgjort", "2026-09-01T00:00:00Z"), t("ny", "2026-10-02T08:00:00Z"), t("gammel", "2026-08-01T00:00:00Z")]);
    expect(d.opslag?.id).toBe("ny");
  });
  it("vælger kun blandt AKTIVE opslag — en nyere skjult tråd fremhæves aldrig (rådets fund 3)", () => {
    const d = naesteINetvaerket([], [t("aktiv", "2026-10-01T08:00:00Z"), t("skjult", "2026-10-02T08:00:00Z", "skjult")]);
    expect(d.opslag?.id).toBe("aktiv");
    expect(naesteINetvaerket([], [t("skjult", "2026-10-02T08:00:00Z", "skjult")]).opslag).toBeNull();
  });
  it("tom tilstand for hver del hver for sig", () => {
    expect(naesteINetvaerket([], [])).toEqual({ event: null, opslag: null });
    expect(naesteINetvaerket([e("a")], []).opslag).toBeNull();
    expect(naesteINetvaerket([], [t("x", "2026-10-02T08:00:00Z")]).event).toBeNull();
  });
  it("ordene: linket går til Netværkets forside (Community), events til /events; ingen mail, ingen tal", () => {
    expect(NAESTE_I_NETVAERKET.linkTo).toBe("/community");
    expect(NAESTE_I_NETVAERKET.eventAlleTo).toBe("/events");
    expect(NAESTE_I_NETVAERKET.eyebrow).toBe("Næste i Netværket");
    for (const v of Object.values(NAESTE_I_NETVAERKET)) expect(v).not.toMatch(/@|\d/);
  });
});
