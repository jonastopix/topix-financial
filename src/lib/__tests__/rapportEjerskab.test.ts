import { describe, expect, it } from "vitest";
import { doemRapportEjer, doemRapportFil, gyldigtAarstal } from "../../../supabase/functions/_shared/rapportEjerskab.ts";

// Fund 2 og 5 (30/9-2026): rapporten og filen skal tilhøre kaldets virksomhed.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("doemRapportEjer", () => {
  it("egen rapport → ok", () => {
    expect(doemRapportEjer({ company_id: A, file_path: `${A}/annual/x.pdf` }, A)).toEqual({ ok: true });
  });
  it("ingen række (RLS skjulte den, eller den findes ikke) → 404", () => {
    expect(doemRapportEjer(null, A)).toEqual({ ok: false, status: 404, grund: "rapport_findes_ikke" });
    expect(doemRapportEjer(undefined, A)).toMatchObject({ status: 404 });
  });
  it("en anden virksomheds rapport → 403", () => {
    expect(doemRapportEjer({ company_id: B }, A)).toEqual({ ok: false, status: 403, grund: "rapport_tilhoerer_anden_virksomhed" });
    expect(doemRapportEjer({ company_id: null }, A)).toMatchObject({ status: 403 });
  });
});

describe("doemRapportFil", () => {
  it("fil i virksomhedens egen mappe (RapporteringView-formen) → ok med stien", () => {
    const sti = `${A}/annual/2024_1727000000000_aarsrapport.pdf`;
    expect(doemRapportFil({ company_id: A, file_path: sti }, A)).toEqual({ ok: true, filSti: sti });
  });
  it("fil i en anden virksomheds mappe → 403", () => {
    expect(doemRapportFil({ company_id: A, file_path: `${B}/annual/x.pdf` }, A)).toMatchObject({ ok: false, status: 403 });
  });
  it("snyde-stier → 403", () => {
    for (const sti of [
      `${A}/../${B}/annual/x.pdf`,
      `${A}/./x.pdf`,
      `${A}//x.pdf`,
      `${A}/`,
      `${A}\\..\\${B}\\x.pdf`,
      `${A}/x\u0000.pdf`,
      `${A}x/annual.pdf`,
      `/${A}/x.pdf`,
      "",
    ]) {
      expect(doemRapportFil({ company_id: A, file_path: sti }, A), sti).toMatchObject({ ok: false });
    }
    expect(doemRapportFil({ company_id: A, file_path: null }, A)).toMatchObject({ ok: false });
    expect(doemRapportFil(null, A)).toMatchObject({ ok: false });
    expect(doemRapportFil({ company_id: A, file_path: `${A}/x.pdf` }, "")).toMatchObject({ ok: false });
  });
});

describe("gyldigtAarstal", () => {
  it("fire cifre som tal eller streng", () => {
    expect(gyldigtAarstal("2024")).toBe(true);
    expect(gyldigtAarstal(2024)).toBe(true);
  });
  it("alt andet — også filter-tegn — afvises", () => {
    for (const y of ["%", "20%", "2024,id.neq.x", "24", "20245", "", null, undefined, {}, "2024 "]) {
      expect(gyldigtAarstal(y as unknown), String(y)).toBe(false);
    }
  });
});
