import { describe, expect, it } from "vitest";
import {
  FORKAST_KATEGORIER,
  UNDERSTOETTEDE_SKRIVEVEJE,
} from "../../../supabase/functions/_shared/forslagEngine.ts";
import {
  FORKAST_KATEGORI_LABELS,
  FORKAST_KATEGORIER_FLADE,
  UNDERSTOETTEDE_SKRIVEVEJE_FLADE,
} from "../forslagFlade";

// Paritetsværn — fladens spejl (src/lib/forslagFlade.ts) skal bære
// PRÆCIS motorens værdisæt (supabase/functions/_shared/forslagEngine.ts).
// Fejler en af disse, er spejlet drevet fra motoren og skal
// re-synkroniseres. Samme mønster som opgaveEngineSpejl.paritet.test.ts.

describe("forslagFlade — paritet mod motoren", () => {
  it("understøttede skriveveje matcher motorens sæt ordret", () => {
    expect([...UNDERSTOETTEDE_SKRIVEVEJE_FLADE].sort()).toEqual(
      [...UNDERSTOETTEDE_SKRIVEVEJE].sort(),
    );
  });

  it("forkast-kategorierne matcher motorens slugs ordret", () => {
    expect([...FORKAST_KATEGORIER_FLADE].sort()).toEqual(
      [...FORKAST_KATEGORIER].sort(),
    );
  });

  it("hver slug har en dansk label der ikke selv er en slug", () => {
    for (const slug of FORKAST_KATEGORIER) {
      const label = FORKAST_KATEGORI_LABELS[slug];
      expect(label, `label mangler for '${slug}'`).toBeTruthy();
      // Labels er visningstekst og må aldrig forveksles med slug'en —
      // fladen sender slug, aldrig label (design §4.4).
      expect(label).not.toBe(slug);
    }
    // Og labels kender ikke slugs som motoren ikke kender:
    expect(Object.keys(FORKAST_KATEGORI_LABELS).sort()).toEqual(
      [...FORKAST_KATEGORIER].sort(),
    );
  });
});
