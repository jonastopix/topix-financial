import { describe, expect, it } from "vitest";
import { fristTekst, sorterAktive, vaelgForslag } from "../aftaler";

describe("sorterAktive — due_date stigende, forfaldne øverst", () => {
  it("sorterer på due_date stigende", () => {
    const sorteret = sorterAktive([
      { id: "b", due_date: "2026-09-11", created_at: "2026-08-01" },
      { id: "a", due_date: "2026-08-28", created_at: "2026-08-02" },
      { id: "c", due_date: "2026-09-04", created_at: "2026-08-03" },
    ]);
    expect(sorteret.map((r: any) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("tie-break på ældste created_at; manglende due_date defensivt sidst", () => {
    const sorteret = sorterAktive([
      { id: "uden", due_date: null, created_at: "2026-08-01" },
      { id: "yngst", due_date: "2026-09-04", created_at: "2026-08-20" },
      { id: "aeldst", due_date: "2026-09-04", created_at: "2026-08-10" },
    ]);
    expect(sorteret.map((r: any) => r.id)).toEqual(["aeldst", "yngst", "uden"]);
  });

  it("muterer ikke input", () => {
    const input = [
      { id: "b", due_date: "2026-09-11" },
      { id: "a", due_date: "2026-08-28" },
    ];
    sorterAktive(input);
    expect(input.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("vaelgForslag — prioritet, derefter ældste", () => {
  it("high vinder over medium og low", () => {
    const valgt = vaelgForslag([
      { id: "m", priority: "medium", created_at: "2026-08-01" },
      { id: "h", priority: "high", created_at: "2026-08-20" },
      { id: "l", priority: "low", created_at: "2026-08-02" },
    ]);
    expect((valgt as any).id).toBe("h");
  });

  it("samme prioritet: ældste created_at først — tættest på udløb (B8)", () => {
    const valgt = vaelgForslag([
      { id: "ny", priority: "high", created_at: "2026-08-30" },
      { id: "gammel", priority: "high", created_at: "2026-08-24" },
    ]);
    expect((valgt as any).id).toBe("gammel");
  });

  it("ukendt/manglende prioritet behandles som medium (fladens sortering)", () => {
    const valgt = vaelgForslag([
      { id: "ukendt", priority: "???", created_at: "2026-08-01" },
      { id: "low", priority: "low", created_at: "2026-08-01" },
    ]);
    expect((valgt as any).id).toBe("ukendt");
  });

  it("tom liste → null", () => {
    expect(vaelgForslag([])).toBeNull();
  });
});

describe("fristTekst — klar tekst, forfald dagen efter fristen", () => {
  it("kommende og dags dato frist: 'Frist …'", () => {
    expect(fristTekst("2026-09-04", "2026-08-31")).toBe("Frist 4. september");
    expect(fristTekst("2026-08-31", "2026-08-31")).toBe("Frist 31. august");
  });

  it("passeret frist: 'Fristen var …'", () => {
    expect(fristTekst("2026-08-28", "2026-08-31")).toBe("Fristen var 28. august");
  });
});
