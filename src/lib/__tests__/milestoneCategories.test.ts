/**
 * Kategoripillerne (10/9, kort #93): husets palet, ikonet bærer forskellen.
 * Låser at alle kategorier stadig kan skelnes — via ikon og label, ikke via
 * fjorten farver — og at ingen rå Tailwind-farve sniger sig ind igen.
 */
import { describe, expect, it } from "vitest";
import { CATEGORY_OPTIONS, MILESTONE_CATEGORIES, PILLE, PILLE_ANDET } from "../milestoneCategories";

const RAA_PALET = /\b(bg|text)-(emerald|blue|indigo|pink|cyan|violet|purple|amber|orange|slate|teal|rose|zinc|red|green|yellow|lime|sky|fuchsia|gray|neutral|stone)-\d/;

describe("milestoneCategories — husets palet, ikonet bærer forskellen", () => {
  const alle = Object.entries(MILESTONE_CATEGORIES);

  it("fjorten kategorier, fjorten forskellige ikoner — alle kan skelnes uden farve", () => {
    expect(alle.length).toBe(14);
    const ikoner = new Set(alle.map(([, cfg]) => cfg.icon));
    expect(ikoner.size).toBe(14);
    const labels = new Set(alle.map(([, cfg]) => cfg.label));
    expect(labels.size).toBe(14);
  });

  it("ingen rå Tailwind-farve og ingen dark:-variant på nogen pille", () => {
    for (const [, cfg] of alle) {
      expect(cfg.badgeClass).not.toMatch(RAA_PALET);
      expect(cfg.badgeClass).not.toMatch(/dark:/);
      for (const klasse of cfg.badgeClass.split(/\s+/)) {
        expect(klasse).toMatch(/^(bg|text)-hb-/);
      }
    }
  });

  it("én pille for alle — «Andet» må være stillere", () => {
    for (const [key, cfg] of alle) {
      expect(cfg.badgeClass).toBe(key === "other" ? PILLE_ANDET : PILLE);
    }
  });

  it("CATEGORY_OPTIONS: dansk sorteret, «Andet» sidst", () => {
    expect(CATEGORY_OPTIONS.at(-1)?.value).toBe("other");
    const labels = CATEGORY_OPTIONS.slice(0, -1).map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "da")));
  });
});
