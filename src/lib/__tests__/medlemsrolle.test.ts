/** Første medlem i en virksomhed er owner (10/9) — migrationens regel (20260904110000), nu delt af de tre edge-veje. */
import { describe, expect, it } from "vitest";
import { foersteMedlemsRolle, MEDLEM_ROLLE, OWNER_ROLLE } from "../../../supabase/functions/_shared/medlemsrolle.ts";

describe("foersteMedlemsRolle", () => {
  it("ingen medlemmer i forvejen → owner", () => {
    expect(foersteMedlemsRolle(0)).toBe(OWNER_ROLLE);
  });
  it("ét eller flere medlemmer → member (også når den eksisterende er en fejlagtig member uden owner — det er en datarettelse, ikke kode)", () => {
    expect(foersteMedlemsRolle(1)).toBe(MEDLEM_ROLLE);
    expect(foersteMedlemsRolle(7)).toBe(MEDLEM_ROLLE);
  });
  it("ukendt tal (null/undefined/NaN/negativt) regnes som 0 → owner", () => {
    expect(foersteMedlemsRolle(null)).toBe(OWNER_ROLLE);
    expect(foersteMedlemsRolle(undefined)).toBe(OWNER_ROLLE);
    expect(foersteMedlemsRolle(Number.NaN)).toBe(OWNER_ROLLE);
    expect(foersteMedlemsRolle(-1)).toBe(OWNER_ROLLE);
  });
  it("rollerne er præcis dem der findes i drift", () => {
    expect([OWNER_ROLLE, MEDLEM_ROLLE]).toEqual(["owner", "member"]);
  });
});
