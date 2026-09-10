import { describe, expect, it } from "vitest";
import { HentningsFejl } from "@/lib/kraevRaekker";
import { hentefejlTekst, kildeAf, kildeOrd, listeMedOg, sektionsfejlTekst } from "../hentefejl";

describe("kildeAf", () => {
  it("læser kilden af en HentningsFejl; alt andet er ukendt", () => {
    expect(kildeAf(new HentningsFejl("milestones", "boom"))).toBe("milestones");
    expect(kildeAf(new Error("x"))).toBe("ukendt");
    expect(kildeAf(null)).toBe("ukendt");
    expect(kildeAf({ message: "supabase-objekt" })).toBe("ukendt");
  });
});

describe("ordene — rolige, medlemmets, ingen teknik", () => {
  it("oversætter tabelnavne til medlemmets ord; ukendt bliver «noget af det du ser her»", () => {
    expect(kildeOrd("financial_reports")).toBe("dine rapporter");
    expect(kildeOrd("pulse_checkins")).toBe("din refleksion");
    expect(kildeOrd("handout_lever_milestones")).toBe("dine handouts");
    expect(kildeOrd("ukendt")).toBe("noget af det du ser her");
  });

  it("listeMedOg: a · a og b · a, b og c — uden dubletter", () => {
    expect(listeMedOg([])).toBe("");
    expect(listeMedOg(["a"])).toBe("a");
    expect(listeMedOg(["a", "b"])).toBe("a og b");
    expect(listeMedOg(["a", "b", "c"])).toBe("a, b og c");
    expect(listeMedOg(["dine handouts", "dine handouts"])).toBe("dine handouts");
  });

  it("hentefejlTekst: stort begyndelsesbogstav, «kunne ikke hentes lige nu. Prøv igen.», null uden kilder", () => {
    expect(hentefejlTekst([])).toBeNull();
    expect(hentefejlTekst(["milestones"])).toBe("Dine milepæle kunne ikke hentes lige nu. Prøv igen.");
    expect(hentefejlTekst(["milestones", "pulse_checkins", "handouts", "handout_lever_milestones"])).toBe(
      "Dine milepæle, din refleksion og dine handouts kunne ikke hentes lige nu. Prøv igen.",
    );
  });

  it("sektionsfejlTekst: én sektion, uden «Prøv igen»", () => {
    expect(sektionsfejlTekst("events")).toBe("Kommende events kunne ikke hentes lige nu.");
    expect(sektionsfejlTekst("community")).toBe("Fællesskabet kunne ikke hentes lige nu.");
  });

  it("ingen udråbstegn, ingen skyld, ingen tabelnavne i det medlemmet ser", () => {
    const alt = [hentefejlTekst(["financial_reports", "companies", "member_profiles"]) ?? "", sektionsfejlTekst("events")].join(" ");
    expect(alt).not.toMatch(/!/);
    expect(alt).not.toMatch(/fejl|error|financial|_/i);
  });
});
