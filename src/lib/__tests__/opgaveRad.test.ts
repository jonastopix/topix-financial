import { describe, expect, it } from "vitest";
import { parseDatoInput, tilDbDato } from "../../../supabase/functions/_shared/opgaveRad.ts";

// opgaveRad.ts har intet src-spejl (kun edge-laget bruger den) — testen
// importerer _shared direkte. Rådets fund B1 (1/10-2026): V8 ruller
// «2026-02-31» over til 2026-03-03, så opgave-accepter dømte én dato og
// skrev en anden. parseDatoInput kræver nu, at rundturen er ordret.

describe("parseDatoInput — kun rigtige kalenderdatoer (B1)", () => {
  it("afviser datoer, der ikke findes (rundturen ≠ input)", () => {
    for (const v of ["2026-02-31", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-09-00"]) {
      expect(parseDatoInput(v)).toBeNull();
    }
  });
  it("tager rigtige datoer, og det skrevne er inputtet ordret", () => {
    for (const v of ["2026-02-28", "2028-02-29", "2026-10-01", "2026-12-31"]) {
      const d = parseDatoInput(v);
      expect(d).not.toBeNull();
      expect(tilDbDato(d!)).toBe(v);
    }
  });
  it("afviser forkert form og andet end strenge, som før", () => {
    for (const v of [undefined, null, 42, "", "2026-9-1", "01-10-2026", "2026-10-01T00:00:00Z", " 2026-10-01"]) {
      expect(parseDatoInput(v)).toBeNull();
    }
  });
});
