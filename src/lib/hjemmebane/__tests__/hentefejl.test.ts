import { describe, expect, it } from "vitest";
import { HentningsFejl } from "@/lib/kraevRaekker";
import { hentefejlTekst, hentetilstand, kildeAf, kildeOrd, listeMedOg, sektionsfejlTekst, uploadSpaerretTekst } from "../hentefejl";

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

  it("de nitten (10/9): hver flade har sit ord — og ordet er medlemmets, ikke tabellens", () => {
    expect(sektionsfejlTekst("community_traade")).toBe("Opslaget kunne ikke hentes lige nu.");
    expect(sektionsfejlTekst("community_svar")).toBe("Svarene kunne ikke hentes lige nu.");
    expect(sektionsfejlTekst("community_forslag")).toBe("Forslagene til @ og # kunne ikke hentes lige nu.");
    expect(sektionsfejlTekst("akademiet")).toBe("Akademiet kunne ikke hentes lige nu.");
    expect(sektionsfejlTekst("content_item_attachments")).toBe("Materialet kunne ikke hentes lige nu.");
    expect(sektionsfejlTekst("events_afholdte")).toBe("Afholdte events kunne ikke hentes lige nu.");
    expect(sektionsfejlTekst("events_detalje")).toBe("Eventet kunne ikke hentes lige nu.");
    expect(sektionsfejlTekst("event_registrations")).toBe("Deltagerne kunne ikke hentes lige nu.");
    expect(sektionsfejlTekst("financial_reports_papirkurv")).toBe("Papirkurven kunne ikke hentes lige nu.");
    expect(hentefejlTekst(["financial_report_facts"])).toBe("Dine tal kunne ikke hentes lige nu. Prøv igen.");
    for (const kilde of ["community_traade", "community_svar", "akademiet", "content_item_attachments", "events_afholdte", "events_detalje", "event_registrations", "financial_reports_papirkurv", "kpi_chart_comments"]) {
      expect(sektionsfejlTekst(kilde)).not.toMatch(/_|fejl|error/i);
    }
  });
});

describe("hentetilstand — tom og fejlet er to beskeder", () => {
  it("henter går forud for alt; fejlet går forud for tom", () => {
    expect(hentetilstand({ isLoading: true, isError: false }, true)).toBe("henter");
    expect(hentetilstand({ isLoading: false, isError: true }, true)).toBe("fejlet");
    expect(hentetilstand({ isLoading: false, isError: true }, false)).toBe("fejlet");
  });

  it("tom afsiges KUN når hentningen lykkedes — «ingen kommende events» er en tilstand, ikke en fejl", () => {
    expect(hentetilstand({ isLoading: false, isError: false }, true)).toBe("tom");
    expect(hentetilstand({ isLoading: false, isError: false }, false)).toBe("data");
  });

  it("«findes ikke» er den samme dom: en fejlet hentning af ét opslag er ikke et opslag der ikke findes", () => {
    const traad = null;
    expect(hentetilstand({ isLoading: false, isError: true }, traad === null)).toBe("fejlet");
    expect(hentetilstand({ isLoading: false, isError: false }, traad === null)).toBe("tom");
  });
});

describe("uploadSpaerretTekst — punkt 4: en fejlet liste lukker uploaden", () => {
  it("siger hvorfor (vi kan ikke se om rapporten ligger her) og hvad man gør — uden fejl-ord og skyld", () => {
    const t = uploadSpaerretTekst();
    expect(t).toMatch(/kunne ikke hentes/);
    expect(t).toMatch(/allerede ligger her/);
    expect(t).toMatch(/Prøv igen/);
    expect(t).not.toMatch(/!|fejl|error|_/i);
  });
});
