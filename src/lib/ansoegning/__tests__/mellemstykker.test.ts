import { describe, expect, it } from "vitest";
import { foersteToSaetninger, MELLEMSTYKKER, mellemstykkeEfter } from "@/lib/ansoegning/mellemstykker";

const CITAT = MELLEMSTYKKER.find((m) => m.id === "citat")!;

describe("mellemstykkerne — tre, efter grupperne, og citatet ordret", () => {
  it("vises efter skærm 3, 5 og 8 — aldrig midt i en gruppe", () => {
    expect(MELLEMSTYKKER.map((m) => m.efterSkaerm)).toEqual([3, 5, 8]);
    expect(mellemstykkeEfter(3)?.id).toBe("morten");
    expect(mellemstykkeEfter(5)?.id).toBe("moedet");
    expect(mellemstykkeEfter(8)?.id).toBe("citat");
    expect(mellemstykkeEfter(0)).toBeNull();
  });

  it("citatet er Jonas' godkendte (18/9), ordret, med afsender", () => {
    expect(CITAT.tekst?.startsWith("The Boardroom har givet mig ro i maven")).toBe(true);
    expect(CITAT.tekst?.endsWith("som står samme sted som mig.")).toBe(true);
    expect(CITAT.afsender).toBe("Daniel Sand, Founder & Ejer af remm.dk");
  });

  it("mobilforkortelsen er præcis de to første sætninger, samme ord", () => {
    const kort = foersteToSaetninger(CITAT.tekst!);
    expect(kort).toBe(
      "The Boardroom har givet mig ro i maven, når jeg skal træffe større økonomiske beslutninger for remm. I mine tidligere virksomheder har jeg altid haft en økonomiansvarlig med, så da jeg for første gang selv skulle stå for administration og økonomi, følte jeg mig virkelig på dybt vand.",
    );
    expect(CITAT.tekst!.startsWith(kort)).toBe(true);
    expect(foersteToSaetninger("Én sætning.")).toBe("Én sætning.");
    expect(foersteToSaetninger("To. Sætninger.")).toBe("To. Sætninger.");
  });

  it("et tomt citat vises ikke", () => {
    const uden = { ...CITAT, tekst: null };
    expect(uden.tekst).toBeNull();
  });
});
