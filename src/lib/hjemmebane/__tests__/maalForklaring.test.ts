import { describe, expect, it } from "vitest";
import { MAAL_EKSEMPLER, MAAL_FORKLARING_OVERSKRIFT, MAAL_FORKLARING_TEKST, maalEksemplerHjaelp } from "@/lib/hjemmebane/maalForklaring";

/* «Hvad er et mål?» (forside PR 3, tillæg 17/9 — Jonas: «det er vigtigt de
   forstår hvad et mål er eller kan være»). Teksterne ordret, eksemplerne i
   rækkefølge. */

describe("maalForklaring — teksterne ordret", () => {
  it("overskriften og teksten", () => {
    expect(MAAL_FORKLARING_OVERSKRIFT).toBe("Hvad er et mål?");
    expect(MAAL_FORKLARING_TEKST).toBe(
      "Et mål er det, du vil nå med din virksomhed det næste halve til hele år. Skridtene er de konkrete ting, du gør for at komme dertil. Et godt mål kan mærkes på bundlinjen eller i hverdagen, og du ved, hvornår du er i mål.",
    );
  });

  it("eksemplerne (mål → skridt) i Jonas' rækkefølge", () => {
    expect(MAAL_EKSEMPLER).toEqual([
      { maal: "Positiv bundlinje hver måned inden jul", skridt: ["Gennemgå de faste udgifter", "Hæv timeprisen", "Aftal rammeaftale med de tre største kunder"] },
      { maal: "Ansætte den første medarbejder i foråret", skridt: ["Regn lønnen ind i budgettet", "Skriv jobopslaget"] },
      { maal: "Tre måneders udgifter i banken", skridt: ["Lav et likviditetsbudget", "Kortere betalingsfrist på nye fakturaer"] },
    ]);
  });

  it("hjælpelinjen under titelfeltet begynder med «Fx: Positiv bundlinje hver måned inden jul» og bærer alle tre mål", () => {
    expect(maalEksemplerHjaelp()).toBe("Fx: Positiv bundlinje hver måned inden jul · Ansætte den første medarbejder i foråret · Tre måneders udgifter i banken");
    expect(maalEksemplerHjaelp().startsWith("Fx: Positiv bundlinje hver måned inden jul")).toBe(true);
  });
});
