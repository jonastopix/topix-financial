import { describe, expect, it } from "vitest";
import { erSynligRaadgiver, inaktivitetsLogudAktiv, synligeRaadgivere, tjenestekontoIds } from "@/lib/tjenestekonto";

const CLAUDE = "c1";
const tjenestekonti = new Set([CLAUDE]);

describe("tjenestekonto — synlighed (30/9-2026)", () => {
  it("tjenestekontoIds: rækker uden id springes over", () => {
    expect([...tjenestekontoIds([{ user_id: "a" }, { user_id: null }, {}, { user_id: "b" }])]).toEqual(["a", "b"]);
    expect(tjenestekontoIds(null).size).toBe(0);
  });

  it("erSynligRaadgiver: nej for en tjenestekonto og for et manglende id; ja ellers", () => {
    expect(erSynligRaadgiver(CLAUDE, tjenestekonti)).toBe(false);
    expect(erSynligRaadgiver("morten", tjenestekonti)).toBe(true);
    expect(erSynligRaadgiver(null, tjenestekonti)).toBe(false);
    expect(erSynligRaadgiver("", tjenestekonti)).toBe(false);
    expect(erSynligRaadgiver("morten", new Set())).toBe(true);
  });

  it("synligeRaadgivere: fjerner kun tjenestekonti, bevarer rækkefølge og felter", () => {
    const rows = [
      { user_id: "jonas", full_name: "Jonas Herlev", is_advisor: true },
      { user_id: CLAUDE, full_name: "Claude", is_advisor: true },
      { user_id: "medlem", full_name: "Et Medlem", is_advisor: false },
      { user_id: "morten", full_name: "Morten Larsen", is_advisor: true },
    ];
    expect(synligeRaadgivere(rows, tjenestekonti).map((r) => r.full_name)).toEqual(["Jonas Herlev", "Et Medlem", "Morten Larsen"]);
    expect(synligeRaadgivere(rows, new Set())).toHaveLength(4);
    expect(synligeRaadgivere(null, tjenestekonti)).toEqual([]);
  });
});

describe("tjenestekonto — inaktivitets-logud", () => {
  it("ingen bruger → slået fra", () => {
    expect(inaktivitetsLogudAktiv(false, "success", false)).toBe(false);
    expect(inaktivitetsLogudAktiv(false, "error", undefined)).toBe(false);
  });
  it("mens opslaget henter → slået fra (et gammelt stempel ville logge tjenestekontoen ud straks)", () => {
    expect(inaktivitetsLogudAktiv(true, "pending", undefined)).toBe(false);
  });
  it("fejl i opslaget → den normale regel (fail-safe)", () => {
    expect(inaktivitetsLogudAktiv(true, "error", undefined)).toBe(true);
  });
  it("tjenestekonto → slået fra; alle andre → slået til", () => {
    expect(inaktivitetsLogudAktiv(true, "success", true)).toBe(false);
    expect(inaktivitetsLogudAktiv(true, "success", false)).toBe(true);
    expect(inaktivitetsLogudAktiv(true, "success", undefined)).toBe(true);
  });
});
