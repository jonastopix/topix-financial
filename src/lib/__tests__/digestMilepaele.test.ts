import { describe, expect, it } from "vitest";
import {
  FORFALDEN_MAKS_DAGE,
  KOMMENDE_DAGE,
  MAKS_FORFALDNE,
  MAKS_KOMMENDE,
  digestMilepaeleTekst,
  formatKortDato,
  udvaelgDigestMilepaele,
  type DigestMilepael,
} from "../../../supabase/functions/_shared/digestMilepaele.ts";

// Månedsdigestens milepæle (8/9): dommen er motorens (milepaelDom), her
// testes udvælgelsen (grænser, lofter, rækkefølge) og teksten.

const NU = new Date(2026, 8, 22, 8, 0); // 22. september 2026 — digestens dag
const ms = (title: string, deadline: string | null, progress = 20, status = "active", ekstra: Partial<DigestMilepael> = {}): DigestMilepael => ({
  title, deadline, progress, status, target_value: null, current_value: null, unit: null, ...ekstra,
});

describe("udvaelgDigestMilepaele — kommende: i dag..+30, nærmeste først, højst tre", () => {
  it("fristdagen er kommende (dag 0), dag 30 er med, dag 31 er ikke", () => {
    const u = udvaelgDigestMilepaele([ms("i dag", "2026-09-22"), ms("dag 30", "2026-10-22"), ms("dag 31", "2026-10-23")], NU);
    expect(u.kommende.map((m) => m.title)).toEqual(["i dag", "dag 30"]);
    expect(KOMMENDE_DAGE).toBe(30);
  });
  it("nærmeste først og loft på tre", () => {
    const u = udvaelgDigestMilepaele([ms("d", "2026-10-10"), ms("a", "2026-09-25"), ms("c", "2026-10-01"), ms("b", "2026-09-28")], NU);
    expect(u.kommende.map((m) => m.title)).toEqual(["a", "b", "c"]);
    expect(MAKS_KOMMENDE).toBe(3);
  });
  it("færdige og parkerede er hverken kommende eller forfaldne", () => {
    const u = udvaelgDigestMilepaele([
      ms("100 %", "2026-09-25", 100),
      ms("completed", "2026-09-25", 10, "completed"),
      ms("parkeret", "2026-04-01", 10, "parked"),
      ms("uden frist", null),
    ], NU);
    expect(u.kommende).toEqual([]);
    expect(u.forfaldneIAlt).toBe(0);
  });
});

describe("udvaelgDigestMilepaele — forfaldne: i går..−60 ved navn, ældre kun som tal", () => {
  it("i går er forfalden, i dag er ikke; dag −60 nævnes, dag −61 tælles som ældre", () => {
    const u = udvaelgDigestMilepaele([
      ms("i går", "2026-09-21"),
      ms("i dag", "2026-09-22"),
      ms("dag -60", "2026-07-24"),
      ms("dag -61", "2026-07-23"),
    ], NU);
    expect(u.forfaldne.map((m) => m.title)).toEqual(["i går", "dag -60"]);
    expect(u.forfaldneIAlt).toBe(3);
    expect(u.aeldre).toBe(1);
    expect(FORFALDEN_MAKS_DAGE).toBe(60);
  });
  it("Rallysupport-tilfældet: ni forfaldne, ældste 145 dage — tre nævnes (senest passerede først), seks tælles", () => {
    const raekker = [
      ms("145 dage", "2026-04-30"), ms("120 dage", "2026-05-25"), ms("90 dage", "2026-06-24"), ms("70 dage", "2026-07-14"),
      ms("50 dage", "2026-08-03"), ms("30 dage", "2026-08-23"), ms("10 dage", "2026-09-12"), ms("5 dage", "2026-09-17"), ms("2 dage", "2026-09-20"),
    ];
    const u = udvaelgDigestMilepaele(raekker, NU);
    expect(u.forfaldne.map((m) => m.title)).toEqual(["2 dage", "5 dage", "10 dage"]);
    expect(u.forfaldneIAlt).toBe(9);
    expect(u.aeldre).toBe(4);
    expect(MAKS_FORFALDNE).toBe(MAKS_KOMMENDE);
  });
});

describe("digestMilepaeleTekst", () => {
  it("null når der intet er", () => {
    expect(digestMilepaeleTekst(udvaelgDigestMilepaele([], NU))).toBeNull();
  });
  it("kommende siges som før: titel, fremdrift, «deadline 25. september»", () => {
    const t = digestMilepaeleTekst(udvaelgDigestMilepaele([
      ms("Ny hjemmeside", "2026-09-25", 40),
      ms("Kunder", "2026-10-01", 30, "active", { target_value: 10, current_value: 3, unit: "kunder" }),
    ], NU));
    expect(t).toBe("\nMilestones med deadline snart:\n• Ny hjemmeside (40%), deadline 25. september\n• Kunder: 3/10 kunder, deadline 1. oktober");
  });
  it("forfaldne står for sig, efter de kommende, med «fristen var», resten som tal og en udvej", () => {
    const t = digestMilepaeleTekst(udvaelgDigestMilepaele([
      ms("Kommende", "2026-09-30", 10),
      ms("Budget", "2026-09-15", 40),
      ms("Ansæt sælger", "2026-08-01", 0),
      ms("Gammel", "2026-04-16", 0),
      ms("Ældgammel", "2026-03-01", 0),
    ], NU));
    expect(t).toBe(
      "\nMilestones med deadline snart:\n• Kommende (10%), deadline 30. september\n" +
        "\nFristen er passeret på:\n• Budget (40%) · fristen var 15. september\n• Ansæt sælger (0%) · fristen var 1. august\n" +
        "… og 2 andre med passeret frist.\n" +
        "Passer fristen ikke længere, så ret den eller læg milestonen i køleskabet.",
    );
  });
  it("kun ældre forfaldne: ét tal, ingen navne", () => {
    const t = digestMilepaeleTekst(udvaelgDigestMilepaele([ms("Gammel", "2026-04-16"), ms("Ældre", "2026-03-01")], NU));
    expect(t).toBe("\nDu har 2 milestones med passeret frist.\nPasser fristen ikke længere, så ret den eller læg milestonen i køleskabet.");
  });
  it("ental: «1 anden»", () => {
    const raekker = [ms("a", "2026-09-21"), ms("b", "2026-09-20"), ms("c", "2026-09-19"), ms("d", "2026-09-18")];
    expect(digestMilepaeleTekst(udvaelgDigestMilepaele(raekker, NU))).toContain("… og 1 anden med passeret frist.");
  });
  it("medlemsskrevne titler og enheder escapes", () => {
    const t = digestMilepaeleTekst(udvaelgDigestMilepaele([ms("<b>x</b> & co", "2026-09-25", 5, "active", { target_value: 2, current_value: 1, unit: "<i>" })], NU));
    expect(t).toContain("• &lt;b&gt;x&lt;/b&gt; &amp; co: 1/2 &lt;i&gt;, deadline 25. september");
  });
  it("formatKortDato: date-kolonnens dag uden tidszone-omvej", () => {
    expect(formatKortDato("2026-04-16")).toBe("16. april");
    expect(formatKortDato(null)).toBe("");
    expect(formatKortDato("nej")).toBe("");
  });
});
