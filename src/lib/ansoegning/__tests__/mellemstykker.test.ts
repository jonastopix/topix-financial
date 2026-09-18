import { describe, expect, it } from "vitest";
import { CITAT_DANIEL_SAND, MELLEMSTYKKER, mellemstykkeEfter } from "@/lib/ansoegning/mellemstykker";

const CITAT = MELLEMSTYKKER.find((m) => m.id === "citat")!;

describe("mellemstykkerne — tre, efter grupperne, og citatet ordret", () => {
  it("vises efter skærm 3, 5 og 8 — aldrig midt i en gruppe", () => {
    expect(MELLEMSTYKKER.map((m) => m.efterSkaerm)).toEqual([3, 5, 8]);
    expect(mellemstykkeEfter(3)?.id).toBe("morten");
    expect(mellemstykkeEfter(5)?.id).toBe("moedet");
    expect(mellemstykkeEfter(8)?.id).toBe("citat");
    expect(mellemstykkeEfter(0)).toBeNull();
  });

  it("citatet er Jonas' godkendte to første sætninger (18/9 kl. 10:10), ordret, med afsender", () => {
    expect(CITAT.tekst).toBe(CITAT_DANIEL_SAND);
    expect(CITAT.tekst).toBe(
      "The Boardroom har givet mig ro i maven, når jeg skal træffe større økonomiske beslutninger for remm. I mine tidligere virksomheder har jeg altid haft en økonomiansvarlig med, så da jeg for første gang selv skulle stå for administration og økonomi, følte jeg mig virkelig på dybt vand.",
    );
    expect(CITAT.tekst!.split(/(?<=\.)\s+/)).toHaveLength(2); // præcis to sætninger — resten er en kommentar i kilden
    expect(CITAT.afsender).toBe("Daniel Sand, Founder & Ejer af remm.dk");
  });

  it("et tomt citat vises ikke", () => {
    const uden = { ...CITAT, tekst: null };
    expect(uden.tekst).toBeNull();
  });
});
