import { describe, expect, it } from "vitest";
import { kortDato } from "@/lib/hjemmebane/forsideDato";

// Forsidens ENE datoformat (docs/forside-v3.md §0).
const NU = new Date("2026-10-02T18:00:00Z");

describe("kortDato — «tirs. 20. okt.», år kun når det ikke er i år", () => {
  it("i år: kort ugedag, dag, kort måned — 20/10-2026 er en tirsdag", () => {
    expect(kortDato("2026-10-20", NU)).toBe("tirs. 20. okt.");
  });
  it("i år, andre dage og måneder", () => {
    expect(kortDato("2026-09-21", NU)).toBe("man. 21. sep.");
    expect(kortDato("2026-12-31", NU)).toBe("tors. 31. dec.");
    expect(kortDato("2026-01-01", NU)).toBe("tors. 1. jan.");
  });
  it("et andet år: uden ugedag, med år", () => {
    expect(kortDato("2027-03-30", NU)).toBe("30. mar. 2027");
    expect(kortDato("2025-12-22", NU)).toBe("22. dec. 2025");
  });
  it("«i år» er det DANSKE år: nytårsaften kl. 23:30 dansk (22:30Z) er stadig 2026, nytårsnat kl. 00:30 dansk (23:30Z) er 2027", () => {
    expect(kortDato("2027-01-20", new Date("2026-12-31T22:30:00Z"))).toBe("20. jan. 2027");
    expect(kortDato("2027-01-20", new Date("2026-12-31T23:30:00Z"))).toBe("ons. 20. jan.");
  });
  it("datoen er en kalenderdato — samme dag på begge sider af sommertidens skift (25/10-2026)", () => {
    expect(kortDato("2026-10-25", NU)).toBe("søn. 25. okt.");
    expect(kortDato("2026-10-26", NU)).toBe("man. 26. okt.");
    expect(kortDato("2026-03-29", NU)).toBe("søn. 29. mar.");
  });
  it("en ugyldig dato kaster", () => {
    expect(() => kortDato("2026-02-31", NU)).toThrow();
    expect(() => kortDato("20/10", NU)).toThrow();
    expect(() => kortDato("", NU)).toThrow();
  });
});

import { fristKort } from "../forsideDato";
describe("fristKort", () => {
  const nu = new Date("2026-10-02T18:00:00Z");
  it("i dag / i morgen / passeret / senere / andet år", () => {
    expect(fristKort("2026-10-02", nu)).toEqual({ tekst: "frist i dag", forfalden: false, iDag: true });
    expect(fristKort("2026-10-03", nu).tekst).toBe("frist i morgen");
    expect(fristKort("2026-09-29", nu)).toEqual({ tekst: "fristen var tirs. 29. sep.", forfalden: true, iDag: false });
    expect(fristKort("2026-10-12", nu).tekst).toBe("frist man. 12. okt.");
    expect(fristKort("2027-03-30", nu).tekst).toBe("frist 30. mar. 2027");
  });
  it("dansk midnat: 2/10 kl. 23.30 dansk er stadig 2/10", () => {
    expect(fristKort("2026-10-02", new Date("2026-10-02T21:30:00Z")).iDag).toBe(true);
  });
});

import { foreslaaetKort } from "../forsideDato";
describe("foreslaaetKort", () => {
  const nu = new Date("2026-10-02T18:00:00Z");
  it("i dag / i går / dato", () => {
    expect(foreslaaetKort("2026-10-02T06:00:00Z", nu)).toBe("foreslået i dag");
    expect(foreslaaetKort("2026-10-01T06:00:00Z", nu)).toBe("foreslået i går");
    expect(foreslaaetKort("2026-09-23T09:00:00Z", nu)).toBe("foreslået ons. 23. sep.");
    expect(foreslaaetKort(null, nu)).toBeNull();
  });
});
