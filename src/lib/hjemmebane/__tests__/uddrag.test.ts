import { describe, expect, it } from "vitest";
import { UDDRAG_MAKS_SAETNINGER, UDDRAG_MAKS_TEGN, uddrag } from "@/lib/hjemmebane/uddrag";
// Paritet mod mailens udgave: motoren blev skrevet i opslagsmailen (#576)
// og bor dér indtil mailen næste gang åbnes. Indtil da må de to ikke
// drive fra hinanden — samme input, samme uddrag.
import {
  UDDRAG_MAKS_SAETNINGER as MAIL_MAKS_SAETNINGER,
  UDDRAG_MAKS_TEGN as MAIL_MAKS_TEGN,
  uddrag as uddragMail,
} from "../../../../supabase/functions/_shared/opslagsMail.ts";

describe("uddrag — de første par sætninger, aldrig midt i et ord", () => {
  it("kort tekst kommer helt med, ikke afkortet", () => {
    expect(uddrag("Vi har landet en ny kunde. Det er stort!")).toEqual({
      tekst: "Vi har landet en ny kunde. Det er stort!",
      afkortet: false,
    });
  });

  it("tom/null giver tom tekst", () => {
    expect(uddrag(null)).toEqual({ tekst: "", afkortet: false });
    expect(uddrag(undefined)).toEqual({ tekst: "", afkortet: false });
    expect(uddrag("   ")).toEqual({ tekst: "", afkortet: false });
  });

  it("whitespace normaliseres", () => {
    expect(uddrag("Hej   verden.\n\nMere.").tekst).toBe("Hej verden. Mere.");
  });

  it("højst tre sætninger, også når teksten er kort", () => {
    const r = uddrag("En. To. Tre. Fire. Fem.");
    expect(r.tekst).toBe("En. To. Tre.");
    expect(r.afkortet).toBe(true);
  });

  it("hele sætninger inden for grænsen, ingen «…» ved sætningsgrænse", () => {
    const s1 = "A".repeat(120) + ".";
    const s2 = "B".repeat(120) + ".";
    const s3 = "C".repeat(120) + ".";
    const r = uddrag(`${s1} ${s2} ${s3}`);
    expect(r.tekst).toBe(`${s1} ${s2}`);
    expect(r.afkortet).toBe(true);
    expect(r.tekst.endsWith("…")).toBe(false);
  });

  it("én lang sætning klippes ved ordgrænse med «…», under grænsen", () => {
    const ord = Array.from({ length: 80 }, (_, i) => `ord${i}`).join(" ");
    const r = uddrag(ord);
    expect(r.afkortet).toBe(true);
    expect(r.tekst.endsWith("…")).toBe(true);
    expect(r.tekst.length).toBeLessThanOrEqual(UDDRAG_MAKS_TEGN);
    expect(r.tekst.slice(0, -1).endsWith(" ")).toBe(false);
  });

  it("ét ord længere end grænsen hårdklippes", () => {
    const r = uddrag("x".repeat(400), 50);
    expect(r.tekst.length).toBe(50);
    expect(r.tekst.endsWith("…")).toBe(true);
  });

  it("grænserne er mailens: 280 tegn, tre sætninger", () => {
    expect(UDDRAG_MAKS_TEGN).toBe(280);
    expect(UDDRAG_MAKS_SAETNINGER).toBe(3);
  });
});

describe("uddrag — paritet med supabase/functions/_shared/opslagsMail.ts", () => {
  it("konstanterne er ens", () => {
    expect(MAIL_MAKS_TEGN).toBe(UDDRAG_MAKS_TEGN);
    expect(MAIL_MAKS_SAETNINGER).toBe(UDDRAG_MAKS_SAETNINGER);
  });

  const cases: Array<[string, string | null | undefined, number?, number?]> = [
    ["kort", "Vi har landet en ny kunde. Det er stort!"],
    ["tom", ""],
    ["null", null],
    ["undefined", undefined],
    ["whitespace", "  Hej   verden.\n\nMere.  "],
    ["fem sætninger", "En. To. Tre. Fire. Fem."],
    ["tre lange sætninger", `${"A".repeat(120)}. ${"B".repeat(120)}. ${"C".repeat(120)}.`],
    ["én lang sætning", Array.from({ length: 80 }, (_, i) => `ord${i}`).join(" ")],
    ["ét langt ord", "x".repeat(400), 50],
    ["komma før grænsen", "Dette er en sætning, som fortsætter langt ud over grænsen for hvad der er plads til her", 30],
    ["udråb og spørgsmål", "Er det rigtigt? Ja! Helt sikkert. Og mere endnu."],
    ["forkortelse", "Prisen er kr. 5.000 om måneden. Det er billigt."],
    ["egen grænse", "En. To. Tre. Fire.", 200, 2],
  ];

  for (const [navn, input, maksTegn, maksSaetninger] of cases) {
    it(`paritet: ${navn}`, () => {
      expect(uddragMail(input, maksTegn, maksSaetninger)).toEqual(uddrag(input, maksTegn, maksSaetninger));
    });
  }
});
