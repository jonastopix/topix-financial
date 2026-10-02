import { describe, expect, it } from "vitest";
import { leveringsbaandDom, type LeveringsPladsInd } from "@/lib/hjemmebane/leveringsbaand";
import { foersteTaellendeMaaned } from "@/lib/boardroomScore/streak";
import type { ScoreMaaned } from "@/lib/boardroomScore";
import type { SlotState } from "@/lib/deliveryMonths";

// 2/10-2026 kl. 12 dansk (CEST = UTC+2). Septembers frist er 20/10 → seneste
// måned med passeret frist er august.
const NU = new Date("2026-10-02T10:00:00Z");

/** Årets pladser jan → okt (som buildYearGroups for indeværende år 2/10). */
function pladser(stater: Partial<Record<string, SlotState>>, standard: SlotState = "missing"): LeveringsPladsInd[] {
  return Array.from({ length: 10 }, (_, i) => {
    const key = `2026-${String(i + 1).padStart(2, "0")}`;
    return { key, state: stater[key] ?? (key >= "2026-10" ? "upcoming" : standard) };
  });
}

describe("leveringsbaandDom", () => {
  it("(a) medlem startet 29/9 med to historiske måneder: første tællende = oktober → aldrig «0 af 0», men første måned og frist", () => {
    const foerste = foersteTaellendeMaaned("2026-09-29");
    expect(foerste).toBe("2026-10");
    const dom = leveringsbaandDom({ aar: "2026", pladser: pladser({ "2026-07": "delivered", "2026-08": "delivered" }), foerste, nu: NU });
    expect(dom.taeller).toBeNull();
    expect(dom.linje).toBe("Din første måned er oktober — frist 20. november");
    expect(dom.linje).not.toMatch(/\baf\b/);
    expect(dom.pladser.filter((p) => p.foerMedlemskab).map((p) => p.key)).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
    ]);
    expect(dom.pladser.find((p) => p.key === "2026-08")?.etiket).toBe("August — Godkendt, før dit medlemskab");
    expect(dom.pladser.find((p) => p.key === "2026-10")?.foerMedlemskab).toBe(false);
    expect(dom.note).toBe("Grå måneder ligger før dit medlemskab og tæller ikke med.");
  });

  it("(b) medlem startet 1/3 med alle måneder leveret: marts..august = 6 af 6; september (frist 20/10) tæller ikke endnu", () => {
    const foerste = foersteTaellendeMaaned("2026-03-01");
    expect(foerste).toBe("2026-03");
    const alle: Partial<Record<string, SlotState>> = {};
    for (const k of ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]) alle[k] = "delivered";
    const dom = leveringsbaandDom({ aar: "2026", pladser: pladser(alle), foerste, nu: NU });
    expect(dom.taeller).toEqual({ godkendt: 6, ialt: 6 });
    expect(dom.linje).toBe("6 af 6 måneder godkendt");
    expect(dom.note).toBe("Grå måneder ligger før dit medlemskab og tæller ikke med.");
  });

  it("kontraktstart midt i måneden: måneden efter tæller først (15/3 → april)", () => {
    const dom = leveringsbaandDom({ aar: "2026", pladser: pladser({ "2026-05": "delivered", "2026-06": "pending" }), foerste: foersteTaellendeMaaned("2026-03-15"), nu: NU });
    expect(dom.taeller).toEqual({ godkendt: 1, ialt: 5 });
    expect(dom.linje).toBe("1 af 5 måneder godkendt");
  });

  it("nævneren følger fristen: 21/10 er septembers frist passeret → september tæller med", () => {
    const efter = new Date("2026-10-21T10:00:00Z");
    const dom = leveringsbaandDom({ aar: "2026", pladser: pladser({ "2026-09": "delivered" }), foerste: "2026-09", nu: efter });
    expect(dom.taeller).toEqual({ godkendt: 1, ialt: 1 });
    expect(dom.linje).toBe("1 af 1 måned godkendt");
    const foer = leveringsbaandDom({ aar: "2026", pladser: pladser({ "2026-09": "delivered" }), foerste: "2026-09", nu: new Date("2026-10-20T10:00:00Z") });
    expect(foer.taeller).toBeNull();
    expect(foer.linje).toBe("Din første måned er september — frist 20. oktober");
  });

  it("uden kontraktstart: måneden efter tidligste første godkendelse (Score's dom, genbrugt)", () => {
    const maaneder: ScoreMaaned[] = [
      { key: "2026-01", basis: "measured", foersteGodkendtAt: "2026-04-10T08:00:00Z", metrics: {} },
      { key: "2026-02", basis: "estimated", foersteGodkendtAt: "2026-01-01T08:00:00Z", metrics: {} },
    ];
    const foerste = foersteTaellendeMaaned(null, maaneder);
    expect(foerste).toBe("2026-05");
    const dom = leveringsbaandDom({ aar: "2026", pladser: pladser({ "2026-01": "delivered" }), foerste, nu: NU });
    expect(dom.taeller).toEqual({ godkendt: 0, ialt: 4 });
  });

  it("foerste = null (intet at afgrænse fra, som Score): alle årets måneder med passeret frist tæller, ingen dæmpning", () => {
    const dom = leveringsbaandDom({ aar: "2026", pladser: pladser({ "2026-01": "delivered" }), foerste: null, nu: NU });
    expect(dom.taeller).toEqual({ godkendt: 1, ialt: 8 });
    expect(dom.note).toBeNull();
    expect(dom.pladser.some((p) => p.foerMedlemskab)).toBe(false);
  });

  it("ukendt første måned (Score-grundlaget hentes/fejlede): ingen tæller, ingen dæmpning — aldrig den gamle løgn", () => {
    const dom = leveringsbaandDom({ aar: "2026", pladser: pladser({ "2026-01": "delivered" }), foerste: undefined, nu: NU });
    expect(dom.taeller).toBeNull();
    expect(dom.linje).toBeNull();
    expect(dom.note).toBeNull();
  });

  it("første måned i næste år: året står ved måned og frist", () => {
    const dom = leveringsbaandDom({ aar: "2026", pladser: pladser({}), foerste: foersteTaellendeMaaned("2026-12-15"), nu: NU });
    // 20/2-2027 er en lørdag → mandag 22/2.
    expect(dom.linje).toBe("Din første måned er januar 2027 — frist 22. februar 2027");
    expect(dom.pladser.every((p) => p.foerMedlemskab)).toBe(true);
  });

  it("januar før årets første frist: «Januars frist er …», ikke «0 af 0»", () => {
    const jan = new Date("2026-01-05T10:00:00Z");
    const dom = leveringsbaandDom({ aar: "2026", pladser: [{ key: "2026-01", state: "upcoming" }], foerste: "2025-06", nu: jan });
    expect(dom.taeller).toBeNull();
    // 20/2-2026 er en fredag.
    expect(dom.linje).toBe("Januars frist er 20. februar");
  });

  it("rådgiveren ser medlemmets side: «før medlemskabet» og «Første tællende måned»", () => {
    const dom = leveringsbaandDom({ aar: "2026", pladser: pladser({}), foerste: "2026-10", nu: NU, raadgiver: true });
    expect(dom.linje).toBe("Første tællende måned er oktober — frist 20. november");
    expect(dom.note).toBe("Grå måneder ligger før medlemskabet og tæller ikke med.");
    expect(dom.pladser[0].etiket).toBe("Januar — Mangler, før medlemskabet");
  });
});
