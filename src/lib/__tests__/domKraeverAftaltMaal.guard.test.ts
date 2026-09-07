import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Driftværn (7/9): en dom kræver et aftalt mål. Efter #710 blev standardmål
// MÆRKET, men fladerne dømte stadig mod dem (CARMA: «Omk. total 106.096 ·
// mål < 80.000 standard» i rust). deriveKpiTone kender nu kilden og giver
// tilstanden `standard` (stille) — men kun hvis kalderen SENDER kilden med.
// Værnet læser de tre kaldesteder og låser at (1) hvert deriveKpiTone-kald
// bærer `kilde:`, og (2) mærket StandardmaalMaerke stadig vises begge steder
// — vi holder op med at dømme, ikke med at oplyse.

const kilder = {
  "src/components/hjemmebane/noegletal/NoegletalView.tsx": "",
  "src/components/hjemmebane/virksomhed/VirksomhedView.tsx": "",
};
for (const sti of Object.keys(kilder) as (keyof typeof kilder)[]) {
  kilder[sti] = readFileSync(resolve(process.cwd(), sti), "utf8");
}

/** Hvert `deriveKpiTone(` … `)`-kald som tekst (til matchende paren-niveau). */
function toneKald(kilde: string): string[] {
  const kald: string[] = [];
  let i = kilde.indexOf("deriveKpiTone(");
  while (i !== -1) {
    let dybde = 0;
    let j = i + "deriveKpiTone".length;
    for (; j < kilde.length; j++) {
      if (kilde[j] === "(") dybde++;
      else if (kilde[j] === ")") { dybde--; if (dybde === 0) break; }
    }
    kald.push(kilde.slice(i, j + 1));
    i = kilde.indexOf("deriveKpiTone(", j);
  }
  return kald;
}

describe("en dom kræver et aftalt mål — kilden sendes med til deriveKpiTone, mærket bliver", () => {
  const forventet: Record<keyof typeof kilder, number> = {
    "src/components/hjemmebane/noegletal/NoegletalView.tsx": 2, // hero + kort
    "src/components/hjemmebane/virksomhed/VirksomhedView.tsx": 1, // KpiKort-sorteringen
  };

  for (const [sti, kilde] of Object.entries(kilder) as [keyof typeof kilder, string][]) {
    it(`${sti}: ${forventet[sti]} deriveKpiTone-kald, alle med kilde`, () => {
      const kald = toneKald(kilde);
      expect(kald.length, "antal deriveKpiTone-kald har ændret sig — opdatér værnet bevidst").toBe(forventet[sti]);
      for (const k of kald) {
        expect(k, `kaldet bærer ikke kilden:\n${k}`).toMatch(/kilde:/);
      }
    });

    it(`${sti}: StandardmaalMaerke vises stadig`, () => {
      expect(kilde).toContain("<StandardmaalMaerke");
    });
  }

  it("dommen selv kender tilstanden standard og lader den være stille", () => {
    const tone = readFileSync(resolve(process.cwd(), "src/components/hjemmebane/noegletal/kpiTone.ts"), "utf8");
    expect(tone).toContain('if (kilde === "standard")');
    expect(tone).toContain('state: "standard", tone: "quiet", pct: null');
  });
});
