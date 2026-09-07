import { describe, it, expect } from "vitest";
import { afgoerForslagsgyldighed, erForslagGyldigt } from "@/lib/forslagUdloeb";
import { getISOWeekKey } from "@/lib/hjemmebane/week";

// Dommen «er forslaget stadig gyldigt» — ISO-ugen (besluttet 7/9).
// Datoer bygges af LOKALE komponenter, fordi getISOWeekKey læser lokale
// komponenter: så er facit det samme lokalt (CET/CEST) og under TZ=UTC.

/** Mandag 31/8 2026 kl. 09:00 lokal — ISO-uge 36. */
const FORSLAG = new Date(2026, 7, 31, 9, 0, 0).toISOString();

describe("afgoerForslagsgyldighed — ISO-ugen er grænsen", () => {
  it("samme uge: gyldigt, med begge ugenøgler i svaret", () => {
    const d = afgoerForslagsgyldighed(FORSLAG, new Date(2026, 8, 3, 12, 0, 0)); // torsdag 3/9
    expect(d).toEqual({
      gyldigt: true,
      forslagets_uge: "2026-W36",
      nu_uge: "2026-W36",
      grund: "forslaget er fra 2026-W36, som er indeværende uge",
    });
  });

  it("sidste øjeblik i forslagets uge: søndag 6/9 kl. 23:59:59.999 → gyldigt", () => {
    expect(erForslagGyldigt(FORSLAG, new Date(2026, 8, 6, 23, 59, 59, 999))).toBe(true);
  });

  it("første øjeblik i næste uge: mandag 7/9 kl. 00:00:00.000 → udløbet, og grunden siger hvor det ville lande", () => {
    const d = afgoerForslagsgyldighed(FORSLAG, new Date(2026, 8, 7, 0, 0, 0, 0));
    expect(d.gyldigt).toBe(false);
    expect(d.forslagets_uge).toBe("2026-W36");
    expect(d.nu_uge).toBe("2026-W37");
    expect(d.grund).toBe("forslaget er fra 2026-W36; en godkendelse ville lande i 2026-W37 — forslaget kan kun forkastes");
  });

  it("hændelsen 7/9: et forslag fra 25/8 (uge 35) kan ikke godkendes i uge 37", () => {
    const forslag25 = new Date(2026, 7, 25, 6, 5, 0).toISOString();
    const d = afgoerForslagsgyldighed(forslag25, new Date(2026, 8, 7, 10, 0, 0));
    expect(d).toMatchObject({ gyldigt: false, forslagets_uge: "2026-W35", nu_uge: "2026-W37" });
  });

  it("grænsen er ugen, ikke 7 × 24 timer: et forslag fra mandag er stadig gyldigt søndag (6 dage 15 timer senere)", () => {
    expect(erForslagGyldigt(FORSLAG, new Date(2026, 8, 6, 23, 0, 0))).toBe(true);
    // …og et forslag fra søndag kl. 23 er udløbet to timer senere.
    const soendagSent = new Date(2026, 8, 6, 23, 0, 0).toISOString();
    expect(erForslagGyldigt(soendagSent, new Date(2026, 8, 7, 1, 0, 0))).toBe(false);
  });

  it("årsskiftet: søndag 3/1 2027 hører til 2026-W53 — et forslag fra 28/12 2026 er stadig gyldigt dér, udløbet mandag 4/1", () => {
    const forslag = new Date(2026, 11, 28, 9, 0, 0).toISOString(); // mandag 28/12 2026
    expect(getISOWeekKey(new Date(forslag))).toBe("2026-W53");
    expect(erForslagGyldigt(forslag, new Date(2027, 0, 3, 23, 59, 59))).toBe(true);
    expect(afgoerForslagsgyldighed(forslag, new Date(2027, 0, 4, 0, 0, 0)).nu_uge).toBe("2027-W01");
    expect(erForslagGyldigt(forslag, new Date(2027, 0, 4, 0, 0, 0))).toBe(false);
  });

  it("ulæseligt proposed_at: udløbet (fail-closed), forslagets_uge null, kan kun forkastes", () => {
    const d = afgoerForslagsgyldighed("ikke-en-dato", new Date(2026, 8, 7, 10, 0, 0));
    expect(d).toEqual({
      gyldigt: false,
      forslagets_uge: null,
      nu_uge: "2026-W37",
      grund: "proposed_at kan ikke læses — forslaget kan kun forkastes",
    });
  });

  it("samme input giver samme output; dommen bruger kun de to tidspunkter", () => {
    const nu = new Date(2026, 8, 3, 12, 0, 0);
    expect(afgoerForslagsgyldighed(FORSLAG, nu)).toEqual(afgoerForslagsgyldighed(FORSLAG, nu));
  });
});
