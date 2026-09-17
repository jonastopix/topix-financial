import { describe, expect, it } from "vitest";
import { DAG1_DOEGN, erDag1, erIndenDoegn } from "@/lib/hjemmebane/forsideHilsen";
import {
  erFoersteUge,
  VELKOMST_MANCHET,
  VELKOMST_UGE_DOEGN,
  velkomstHovedhistorie,
} from "@/lib/hjemmebane/velkomstHistorie";

/* Velkomstvideoen som hovedhistorie den første uge (forside PR 5, 17/9 —
   Jonas «A» til valg 7): dag 0–7 efter kontraktstart (dansk tid), kun med
   video, kun indtil den er set. Samme dagsregning som erDag1 (én kilde). */

const NU = new Date("2026-09-24T09:00:00+02:00"); // torsdag 24/9 dansk tid
const dageFoer = (n: number) => {
  const d = new Date(NU);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

describe("erFoersteUge — 0–7 danske kalenderdage efter starten", () => {
  it("dag 0, 6 og 7 → første uge; dag 8 → ikke", () => {
    expect(erFoersteUge(dageFoer(0), NU)).toBe(true);
    expect(erFoersteUge(dageFoer(6), NU)).toBe(true);
    expect(erFoersteUge(dageFoer(7), NU)).toBe(true);
    expect(erFoersteUge(dageFoer(8), NU)).toBe(false);
    expect(VELKOMST_UGE_DOEGN).toBe(7);
  });
  it("ingen startdato (legacy), ulæselig, eller start i fremtiden → ikke", () => {
    expect(erFoersteUge(null, NU)).toBe(false);
    expect(erFoersteUge(undefined, NU)).toBe(false);
    expect(erFoersteUge("hest", NU)).toBe(false);
    expect(erFoersteUge(dageFoer(-1), NU)).toBe(false);
  });
  it("én kilde: erDag1 er samme dom med 14 døgn (dag 8 er stadig dag 1-tone, men ikke første uge)", () => {
    expect(DAG1_DOEGN).toBe(14);
    expect(erDag1(dageFoer(8), NU)).toBe(true);
    expect(erFoersteUge(dageFoer(8), NU)).toBe(false);
    expect(erIndenDoegn(dageFoer(7), NU, 7)).toBe(true);
    expect(erIndenDoegn(dageFoer(7), NU, 6)).toBe(false);
  });
  it("dansk midnat: et tidsstempel sent om aftenen dansk tid regnes som den dag", () => {
    // 16/9 23:30 dansk = 16/9 21:30Z; nu 24/9 → 8 dage → ikke første uge
    expect(erFoersteUge("2026-09-16T21:30:00Z", NU)).toBe(false);
    // 17/9 00:30 dansk = 16/9 22:30Z → 7 dage → første uge
    expect(erFoersteUge("2026-09-16T22:30:00Z", NU)).toBe(true);
  });
});

describe("velkomstHovedhistorie — første uge OG video OG ikke set", () => {
  const basis = { startDato: dageFoer(2), nu: NU, harVideo: true, setAt: null };
  it("ny, video sat, ikke set → hovedhistorien", () => {
    expect(velkomstHovedhistorie(basis)).toBe(true);
  });
  it("set (velkomstvideo_set_at) → falder tilbage til rykkelisten", () => {
    expect(velkomstHovedhistorie({ ...basis, setAt: "2026-09-23T10:00:00Z" })).toBe(false);
  });
  it("ingen video (GUID tom) → rykkelisten som før", () => {
    expect(velkomstHovedhistorie({ ...basis, harVideo: false })).toBe(false);
  });
  it("dag 7 ja, dag 8 nej; ingen startdato nej", () => {
    expect(velkomstHovedhistorie({ ...basis, startDato: dageFoer(7) })).toBe(true);
    expect(velkomstHovedhistorie({ ...basis, startDato: dageFoer(8) })).toBe(false);
    expect(velkomstHovedhistorie({ ...basis, startDato: null })).toBe(false);
  });
  it("manchetten er tjeklistens egen sætning om videoen", () => {
    expect(VELKOMST_MANCHET).toBe("En kort video om hvordan du får mest ud af The Boardroom.");
  });
});
