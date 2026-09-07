import { describe, it, expect } from "vitest";
import { beregnFornyelsesperiode, tolvMaanederFrem } from "@/lib/fornyelsesperiode";
// Parity import — the Deno copy is intentionally a verbatim mirror of the
// frontend copy (file header is the only allowed difference). We import it
// here so vitest fails loudly if the two drift.
import {
  beregnFornyelsesperiode as beregnFornyelsesperiodeDeno,
  tolvMaanederFrem as tolvMaanederFremDeno,
} from "../../../supabase/functions/_shared/fornyelsesperiode.ts";

// Parity gate — supabase/functions/_shared/fornyelsesperiode.ts must produce
// identical output for every input the frontend copy handles: begge grene,
// grænsen fra begge sider, 29. februar, null og en betaling langt efter.
// If this block fails, the two files have drifted and must be re-synced.

const GAMMEL = "2026-09-29";

describe("beregnFornyelsesperiode — parity between src/lib and supabase/functions/_shared", () => {
  const cases: { navn: string; slutdato: string | null; betalt: string }[] = [
    { navn: "før: 7/9 mod 29/9", slutdato: GAMMEL, betalt: "2026-09-07T10:00:00.000Z" },
    { navn: "efter: 5/10 mod 29/9", slutdato: GAMMEL, betalt: "2026-10-05T10:00:00.000Z" },
    { navn: "præcis på slutdatoen 00:00", slutdato: GAMMEL, betalt: "2026-09-29T00:00:00.000Z" },
    { navn: "præcis på slutdatoen 23:59", slutdato: GAMMEL, betalt: "2026-09-29T23:59:59.000Z" },
    { navn: "dagen efter 00:00", slutdato: GAMMEL, betalt: "2026-09-30T00:00:00.000Z" },
    { navn: "50 dage før", slutdato: GAMMEL, betalt: "2026-08-10T12:00:00.000Z" },
    { navn: "100 dage efter", slutdato: GAMMEL, betalt: "2027-01-07T12:00:00.000Z" },
    { navn: "null slutdato", slutdato: null, betalt: "2026-10-05T10:00:00.000Z" },
    { navn: "ulæselig slutdato", slutdato: "ikke-en-dato", betalt: "2026-10-05T10:00:00.000Z" },
    { navn: "slutdato som tidsstempel", slutdato: "2026-09-29T00:00:00+00:00", betalt: "2026-09-29T12:00:00.000Z" },
    { navn: "29/2 som gammel slutdato (før)", slutdato: "2028-02-29", betalt: "2028-02-10T12:00:00.000Z" },
    { navn: "29/2 som betalingsdag (efter)", slutdato: "2028-02-01", betalt: "2028-02-29T12:00:00.000Z" },
    { navn: "nytår", slutdato: "2026-12-31", betalt: "2027-01-01T00:00:00.000Z" },
  ];

  for (const c of cases) {
    it(`parity: ${c.navn}`, () => {
      const betalt = new Date(c.betalt);
      const fe = beregnFornyelsesperiode(c.slutdato, betalt);
      const deno = beregnFornyelsesperiodeDeno(c.slutdato, betalt);
      expect(deno).toEqual(fe);
    });
  }

  it("alle betalingsdage −60 … +60 dage omkring slutdatoen giver samme svar i begge kopier", () => {
    const slut = Date.UTC(2026, 8, 29);
    for (let d = -60; d <= 60; d++) {
      const betalt = new Date(slut + d * 86_400_000 + 8 * 3_600_000);
      expect(beregnFornyelsesperiodeDeno(GAMMEL, betalt)).toEqual(beregnFornyelsesperiode(GAMMEL, betalt));
    }
  });

  it("tolvMaanederFrem er ens for hver dag i skudåret 2028", () => {
    for (let t = Date.UTC(2028, 0, 1); t <= Date.UTC(2028, 11, 31); t += 86_400_000) {
      const dag = new Date(t).toISOString().slice(0, 10);
      expect(tolvMaanederFremDeno(dag)).toBe(tolvMaanederFrem(dag));
    }
  });
});
