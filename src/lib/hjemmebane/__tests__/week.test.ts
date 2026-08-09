import { describe, expect, it } from "vitest";
import { getISOWeekKey, isoWeekNumber } from "../week";

/** Uge-helperne (PR B1 — løftet ordret fra DashboardActionCenter:13-20).
    Datoer bygges m. lokal-konstruktøren (år, måned, dag) — aritmetikken
    arbejder på lokale dato-DELE via Date.UTC, så resultatet er ens i
    enhver tidszone. Kendte ISO-fakta som ankre. */
describe("getISOWeekKey / isoWeekNumber", () => {
  it("kendte ankre: 1. jan 2026 (torsdag) er 2026-W01; 30. dec 2024 (mandag) hører til 2025-W01", () => {
    expect(getISOWeekKey(new Date(2026, 0, 1))).toBe("2026-W01");
    expect(getISOWeekKey(new Date(2024, 11, 30))).toBe("2025-W01");
  });

  it("nummer og nøgle er konsistente", () => {
    const d = new Date(2026, 7, 7);
    expect(getISOWeekKey(d).endsWith(String(isoWeekNumber(d)).padStart(2, "0"))).toBe(true);
  });

  it("ugeskifte: søndag og mandag ligger i forskellige uger; torsdag og fredag i samme", () => {
    const soendag = new Date(2026, 7, 9); // 9. aug 2026
    const mandag = new Date(2026, 7, 10);
    expect(getISOWeekKey(soendag)).not.toBe(getISOWeekKey(mandag));
    const torsdag = new Date(2026, 7, 6);
    const fredag = new Date(2026, 7, 7);
    expect(getISOWeekKey(torsdag)).toBe(getISOWeekKey(fredag));
  });
});
