import { describe, expect, it } from "vitest";
import { datoOrd, vejenIndTekst } from "@/lib/ansoegninger/vejenInd";

const nu = new Date("2026-09-25T10:00:00Z");
const a = { id: "x", indsendt_at: "2026-09-12T18:30:00Z", samtale_start: "2026-09-18T08:00:00Z", konverteret_at: "2026-09-25T09:00:00Z", kilde: "webinar" };

describe("vejenInd — hvor medlemmet kom fra, på én linje (18/9 aften)", () => {
  it("alle tre led med kilde", () => {
    expect(vejenIndTekst(a, nu)).toBe("Kom ind via ansøgning 12. september (webinaret) · samtale 18. september · underskrevet 25. september");
  });
  it("led der mangler udelades; ukendt kilde nævnes ikke; ingen ansøgning → null", () => {
    expect(vejenIndTekst({ ...a, samtale_start: null, kilde: "noget" }, nu)).toBe("Kom ind via ansøgning 12. september · underskrevet 25. september");
    expect(vejenIndTekst({ ...a, indsendt_at: null, konverteret_at: null, kilde: null }, nu)).toBe("Kom ind via ansøgning · samtale 18. september");
    expect(vejenIndTekst(null, nu)).toBeNull();
  });
  it("datoOrd: dansk tid, året kun når det ikke er nuværende, ulæseligt → null", () => {
    expect(datoOrd("2026-09-12T23:30:00Z", nu)).toBe("13. september"); // 01:30 dansk
    expect(datoOrd("2025-12-01T10:00:00Z", nu)).toBe("1. december 2025");
    expect(datoOrd("nix", nu)).toBeNull();
  });
});
