import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  udledBranchekode,
  normaliserBranchekode,
  DB25_AFDELINGER,
  DB25_GRUPPER,
  DB25_KLASSER,
  DB25_UNDERKLASSER,
} from "@/lib/branchekode";
import { INDUSTRY_OPTIONS, ALLE_BRANCHER } from "@/lib/brancher";
// Parity import — the Deno copies are intentionally mirrors of the frontend
// copies (import path is the only allowed difference). We import them here
// so vitest fails loudly if they drift.
import {
  udledBranchekode as udledBranchekodeDeno,
  normaliserBranchekode as normaliserBranchekodeDeno,
  DB25_AFDELINGER as DB25_AFDELINGER_DENO,
  DB25_GRUPPER as DB25_GRUPPER_DENO,
  DB25_KLASSER as DB25_KLASSER_DENO,
  DB25_UNDERKLASSER as DB25_UNDERKLASSER_DENO,
} from "../../../supabase/functions/_shared/branchekode.ts";
import {
  INDUSTRY_OPTIONS as INDUSTRY_OPTIONS_DENO,
  ALLE_BRANCHER as ALLE_BRANCHER_DENO,
} from "../../../supabase/functions/_shared/brancher.ts";

// Parity gate — the Deno copy at supabase/functions/_shared/branchekode.ts
// is what byggVirksomhedsRaekke actually runs with inside monday-webhook
// and import-application (via _shared/virksomhedsOprettelse.ts). The
// frontend copy is the one branchekode.test.ts locks, row by row. Testdata
// is the same DB25 fixture that test reads — HELE registret (738
// underklasser) går gennem begge kopier, plus normaliseringens kanter. If
// this block fails, the two files have drifted and must be re-synced.

const her = path.dirname(fileURLToPath(import.meta.url));
const DB25 = readFileSync(path.resolve(her, "../__fixtures__/db25-branchekoder.txt"), "utf-8")
  .split("\n")
  .filter(l => l && !l.startsWith("#"))
  .map(l => l.split(";")[0]);

describe("brancher — parity between src/lib and supabase/functions/_shared", () => {
  it("taksonomien er identisk felt for felt: 17 grupper, 48 underkategorier, samme labels og nøgler", () => {
    expect(INDUSTRY_OPTIONS_DENO).toEqual(INDUSTRY_OPTIONS);
    expect(ALLE_BRANCHER_DENO).toEqual(ALLE_BRANCHER);
    expect(ALLE_BRANCHER_DENO).toHaveLength(48);
  });
});

describe("udledBranchekode — parity between src/lib and supabase/functions/_shared", () => {
  it("de fire tabeller er identiske i de to kopier", () => {
    expect(DB25_AFDELINGER_DENO).toEqual(DB25_AFDELINGER);
    expect(DB25_GRUPPER_DENO).toEqual(DB25_GRUPPER);
    expect(DB25_KLASSER_DENO).toEqual(DB25_KLASSER);
    expect(DB25_UNDERKLASSER_DENO).toEqual(DB25_UNDERKLASSER);
  });

  it("hele DB25-registret (738 underklasser) giver samme svar i begge kopier", () => {
    expect(DB25).toHaveLength(738);
    let mappet = 0;
    for (const kode of DB25) {
      const fe = udledBranchekode(kode);
      expect(udledBranchekodeDeno(kode), kode).toEqual(fe);
      if (fe) mappet += 1;
    }
    expect(mappet).toBe(549); // samme målte dækning som branchekode.test.ts
  });

  const kanter: Array<string | number | null | undefined> = [
    "682040", 682040, "68.20.40", " 68 20 40 ", // FLOOR1 i fire former
    "11100", 11100, // tabt foranstillet nul
    "62", "6220", "47.71", // korte koder
    "551000", "642120", "649910", "479100", // bevidste null
    "", "abc", "6", "1234567", null, undefined, // ikke en kode
  ];
  for (const raa of kanter) {
    it(`parity, normalisering og opslag: ${JSON.stringify(raa)}`, () => {
      expect(normaliserBranchekodeDeno(raa)).toBe(normaliserBranchekode(raa));
      expect(udledBranchekodeDeno(raa)).toEqual(udledBranchekode(raa));
    });
  }

  it("FLOOR1's 682040 giver «Udlejning og administration» i begge kopier", () => {
    const forventet = { industry_code: "realestate_rental", industry_label: "Udlejning og administration" };
    expect(udledBranchekode("682040")).toEqual(forventet);
    expect(udledBranchekodeDeno("682040")).toEqual(forventet);
  });
});
