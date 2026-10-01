import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { visEksport } from "@/lib/hjemmebane/noegletalEksport";

// m16 (1/10-2026): ingen eksport af ingenting.

describe("visEksport", () => {
  it("tegner ikke knapperne uden måneder", () => {
    expect(visEksport(0)).toBe(false);
    expect(visEksport(-1)).toBe(false);
    expect(visEksport(Number.NaN)).toBe(false);
  });
  it("tegner knapperne med mindst én måned", () => {
    expect(visEksport(1)).toBe(true);
    expect(visEksport(24)).toBe(true);
  });
});

/** Kildeværn: begge knapper står inde i blokken, som visEksport(monthlyData.length) åbner. */
export const knapperBagDommen = (kilde: string): boolean => {
  const start = kilde.indexOf("{visEksport(monthlyData.length) && (");
  if (start < 0) return false;
  const slut = kilde.indexOf("</section>", start);
  if (slut < 0) return false;
  const blok = kilde.slice(start, slut);
  const pdf = kilde.indexOf("Download PDF");
  const csv = kilde.indexOf("Download CSV");
  const iBlok = (i: number) => i > start && i < slut;
  // Kun én forekomst af hver knaptekst, og begge i blokken.
  return (
    iBlok(pdf) && iBlok(csv) &&
    kilde.indexOf("Download PDF", pdf + 1) < 0 &&
    kilde.indexOf("Download CSV", csv + 1) < 0 &&
    blok.includes("handleExport") && blok.includes("handleCsv")
  );
};

describe("NoegletalView — kildeværn", () => {
  const kilde = readFileSync(
    resolve(process.cwd(), "src/components/hjemmebane/noegletal/NoegletalView.tsx"),
    "utf8",
  );
  it("knapperne tegnes kun bag visEksport", () => {
    expect(knapperBagDommen(kilde)).toBe(true);
  });
  it("selvbevis: en kopi uden dommen fælder", () => {
    const oedelagt = kilde.replace("{visEksport(monthlyData.length) && (", "{true && (");
    expect(knapperBagDommen(oedelagt)).toBe(false);
  });
});
