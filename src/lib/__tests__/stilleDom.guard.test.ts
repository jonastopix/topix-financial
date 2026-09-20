import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FORNYELSES_VINDUE_DAGE } from "@/lib/fornyelse";
import { TYPE_INGEN_BRUGER, TYPE_INGEN_LOGIN, VINDUE_DAGE } from "@/lib/stilleDom";

// Kildeværn (20/9-2026): stilleDom.ts er import-fri og gentager derfor
// fornyelsens vindue som sit eget tal. Glider de fra hinanden, ringer B4 på en
// anden dag end beslutningsvinduet åbner — og ingen ser det.
// Og: cronen må aldrig sende reference_id — dedup går på titlen (regel 6),
// fordi reference_id er uuid og ikke kan bære et trin.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const CRON = "supabase/functions/stille-klokker-cron/index.ts";

export const dedupGaarPaaTitlen = (kilde: string): boolean =>
  kilde.includes("skrivRaadgiverBesked(") && /reference_id:\s*null\b/.test(kilde) && !/reference_id:(?!\s*null\b)/.test(kilde);

describe("stilleDom.guard", () => {
  it("B4's vindue er fornyelsens vindue", () => {
    expect(VINDUE_DAGE).toBe(FORNYELSES_VINDUE_DAGE);
  });
  it("typerne er husets navneform og forskellige", () => {
    expect(TYPE_INGEN_BRUGER).toMatch(/^[a-z_]+$/);
    expect(TYPE_INGEN_LOGIN).toMatch(/^[a-z_]+$/);
    expect(TYPE_INGEN_BRUGER).not.toBe(TYPE_INGEN_LOGIN);
  });
  it("cronen sender ingen reference_id — dedup går på titlen", () => {
    expect(dedupGaarPaaTitlen(laes(CRON))).toBe(true);
  });
  it("selvbevis: en reference_id i cronen fanges", () => {
    expect(dedupGaarPaaTitlen(laes(CRON).replace(/reference_id: null/g, "reference_id: k.companyId"))).toBe(false);
    expect(dedupGaarPaaTitlen("ingen klokke her")).toBe(false);
  });
});
