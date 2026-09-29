import { describe, expect, it } from "vitest";
import {
  afkortCitat,
  bygRefleksionsSvar,
  CITAT_MAKS,
  erRefleksionsNoegle,
  FELT_KORT,
  laesRefleksionsCitat,
  REFLEKSION_CONTEXT_TYPE,
  refleksionsTitel,
  SVAR_MAKS,
  svaretIChattenTekst,
} from "@/lib/refleksionSvar";

/** Rådgiverens svar på et refleksionsfelt (29/9-2026) — hver gren i motoren har sin prøve. */

const CHECKIN = { id: "5a1e0c8e-0000-4000-8000-000000000001", period_key: "2026-08" };

describe("refleksionSvar — bygRefleksionsSvar", () => {
  it("bygger beskeden: ren tekst, context_type «refleksion», id'et og et frosset citat med titel, felt og period_key", () => {
    const dom = bygRefleksionsSvar({ checkin: CHECKIN, felt: "biggest_challenge", feltTekst: "  Likviditeten i oktober.  ", svar: "  Lad os tage den på torsdag.  " });
    expect(dom).toEqual({
      ok: true,
      besked: {
        content: "Lad os tage den på torsdag.",
        context_type: "refleksion",
        context_id: CHECKIN.id,
        context_meta: {
          title: "Refleksion August 2026 · Største udfordring",
          felt: "biggest_challenge",
          citat: "Likviditeten i oktober.",
          period_key: "2026-08",
        },
      },
    });
    expect(REFLEKSION_CONTEXT_TYPE).toBe("refleksion");
  });

  it("afviser et tomt svar — også kun mellemrum", () => {
    expect(bygRefleksionsSvar({ checkin: CHECKIN, felt: "went_well", feltTekst: "x", svar: "" })).toEqual({ ok: false, grund: "tomt_svar" });
    expect(bygRefleksionsSvar({ checkin: CHECKIN, felt: "went_well", feltTekst: "x", svar: "   \n " })).toEqual({ ok: false, grund: "tomt_svar" });
  });

  it("afviser et tomt felt — der er intet at svare på", () => {
    expect(bygRefleksionsSvar({ checkin: CHECKIN, felt: "help_needed", feltTekst: null, svar: "Hej" })).toEqual({ ok: false, grund: "tomt_felt" });
    expect(bygRefleksionsSvar({ checkin: CHECKIN, felt: "help_needed", feltTekst: "   ", svar: "Hej" })).toEqual({ ok: false, grund: "tomt_felt" });
  });

  it("afviser et svar over SVAR_MAKS (rapportkommentarens 2000), et ukendt felt og en refleksion uden id/period_key", () => {
    expect(SVAR_MAKS).toBe(2000);
    expect(bygRefleksionsSvar({ checkin: CHECKIN, felt: "went_well", feltTekst: "x", svar: "a".repeat(2000) }).ok).toBe(true);
    expect(bygRefleksionsSvar({ checkin: CHECKIN, felt: "went_well", feltTekst: "x", svar: "a".repeat(2001) })).toEqual({ ok: false, grund: "for_langt_svar" });
    expect(bygRefleksionsSvar({ checkin: CHECKIN, felt: "milestone_progress", feltTekst: "x", svar: "Hej" })).toEqual({ ok: false, grund: "ukendt_felt" });
    expect(bygRefleksionsSvar({ checkin: { id: null, period_key: "2026-08" }, felt: "went_well", feltTekst: "x", svar: "Hej" })).toEqual({ ok: false, grund: "ingen_refleksion" });
    expect(bygRefleksionsSvar({ checkin: { id: CHECKIN.id, period_key: undefined }, felt: "went_well", feltTekst: "x", svar: "Hej" })).toEqual({ ok: false, grund: "ingen_refleksion" });
  });

  it("felterne er de tre kolonner, og de korte navne er virksomhedssidens etiketter", () => {
    expect(FELT_KORT).toEqual({ went_well: "Hvad gik godt", biggest_challenge: "Største udfordring", help_needed: "Søger hjælp til" });
    for (const f of ["went_well", "biggest_challenge", "help_needed"]) expect(erRefleksionsNoegle(f), f).toBe(true);
    expect(erRefleksionsNoegle("citat")).toBe(false);
  });
});

describe("refleksionSvar — citatet er frosset og afkortet", () => {
  it("afkortCitat: trimmer, bevarer linjeskift, og sætter «…» ved præcis CITAT_MAKS tegn", () => {
    expect(CITAT_MAKS).toBe(500);
    expect(afkortCitat("  to\nlinjer  ")).toBe("to\nlinjer");
    expect(afkortCitat("a".repeat(500))).toBe("a".repeat(500));
    const lang = afkortCitat("b".repeat(501));
    expect(lang.length).toBe(500);
    expect(lang.endsWith("…")).toBe(true);
    expect(afkortCitat("ord ".repeat(200)).endsWith("…")).toBe(true);
    expect(afkortCitat("ord ".repeat(200))).not.toMatch(/ …$/);
  });

  it("citatet i beskeden er afkortet — feltet på 3.000 tegn bliver 500", () => {
    const dom = bygRefleksionsSvar({ checkin: CHECKIN, felt: "went_well", feltTekst: "c".repeat(3000), svar: "Flot." });
    expect(dom.ok && dom.besked.context_meta.citat.length).toBe(500);
  });

  it("laesRefleksionsCitat læser KUN context_meta — og tomt/forkert meta giver null", () => {
    expect(laesRefleksionsCitat({ citat: "Likviditeten", felt: "biggest_challenge", title: "x" })).toEqual({ citat: "Likviditeten", felt: "biggest_challenge" });
    expect(laesRefleksionsCitat({ citat: "Likviditeten" })).toEqual({ citat: "Likviditeten", felt: null });
    expect(laesRefleksionsCitat({ citat: "   " })).toBeNull();
    expect(laesRefleksionsCitat({ title: "Rapport" })).toBeNull();
    expect(laesRefleksionsCitat(null)).toBeNull();
    expect(laesRefleksionsCitat("citat")).toBeNull();
  });
});

describe("refleksionSvar — ordene", () => {
  it("titlen bærer måned og år på dansk (husets maanedOrd) og feltets korte navn", () => {
    expect(refleksionsTitel("2026-09", "went_well")).toBe("Refleksion September 2026 · Hvad gik godt");
    expect(refleksionsTitel("2026-01", "help_needed")).toBe("Refleksion Januar 2026 · Søger hjælp til");
    expect(refleksionsTitel("2025-12", "biggest_challenge")).toBe("Refleksion December 2025 · Største udfordring");
    // En ulæselig nøgle vises, som den er — aldrig «undefined».
    expect(refleksionsTitel("2026-13", "went_well")).toBe("Refleksion 2026-13 · Hvad gik godt");
  });

  it("den stille linje: «Svaret i chatten kl. HH.MM» i dansk tid — uden klokkeslæt, når tiden ikke kan læses", () => {
    expect(svaretIChattenTekst("2026-09-29T08:42:00Z")).toBe("Svaret i chatten kl. 10.42");
    expect(svaretIChattenTekst(new Date("2026-12-01T07:05:00Z"))).toBe("Svaret i chatten kl. 08.05");
    expect(svaretIChattenTekst("ikke en tid")).toBe("Svaret i chatten");
  });
});
