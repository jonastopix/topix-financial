import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { maanedOgAar } from "@/lib/maanedTekst";

// analyse-medlemsrejse 30/9 §2.5: notifikationen sagde «…for 2026-07».

describe("maanedOgAar", () => {
  it("«2026-07» → «juli 2026»", () => {
    expect(maanedOgAar("2026-07")).toBe("juli 2026");
  });
  it("årets første og sidste måned", () => {
    expect(maanedOgAar("2027-01")).toBe("januar 2027");
    expect(maanedOgAar("2025-12")).toBe("december 2025");
  });
  it("en ugyldig nøgle gives uændret tilbage — aldrig en tom sætning", () => {
    expect(maanedOgAar("2026-13")).toBe("2026-13");
    expect(maanedOgAar("2026-00")).toBe("2026-00");
    expect(maanedOgAar("juli")).toBe("juli");
    expect(maanedOgAar("")).toBe("");
  });
});

const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/[^\n]*/g, "");
const VIEW = udenKommentarer(
  readFileSync(resolve(process.cwd(), "src/components/hjemmebane/noegletal/NoegletalView.tsx"), "utf8"),
);

export const notifikationenSigerMaaned = (kilde: string): boolean =>
  kilde.includes("period_label: maanedOgAar(commentPopover.periodKey)") &&
  !kilde.includes("period_label: commentPopover.periodKey");

describe("NoegletalView — kildeværn", () => {
  it("notify-kpi-comment får månedsnavnet, ikke nøglen", () => {
    expect(notifikationenSigerMaaned(VIEW)).toBe(true);
  });
  it("selvbevis: den gamle linje fælder værnet", () => {
    const gammel = VIEW.replace("period_label: maanedOgAar(commentPopover.periodKey)", "period_label: commentPopover.periodKey");
    expect(gammel).not.toBe(VIEW);
    expect(notifikationenSigerMaaned(gammel)).toBe(false);
  });
});
