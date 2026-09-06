import { describe, it, expect } from "vitest";
import { erKunde } from "../raadgiverensKunder";

describe("erKunde — fail-open: kun eksplicit false betyder «ikke kunde»", () => {
  it("er_kunde: false → false (vores egen virksomhed)", () => {
    expect(erKunde({ er_kunde: false })).toBe(false);
  });

  it("er_kunde: true → true", () => {
    expect(erKunde({ er_kunde: true })).toBe(true);
  });

  it("er_kunde: null → true (et manglende felt er ikke en beslutning)", () => {
    expect(erKunde({ er_kunde: null })).toBe(true);
  });

  it("er_kunde: undefined → true (rækken er hentet uden kolonnen)", () => {
    expect(erKunde({ er_kunde: undefined })).toBe(true);
    expect(erKunde({})).toBe(true);
  });
});
