import { describe, expect, it } from "vitest";
import { erPlanPunkt, FORSIDE_MAAL_ORD, forsideMaalTilstand, forslagListe, SAET_MAAL_STI, skarptSti } from "../forsideMaal";

describe("forsideMaal — forsidens tre tilstande", () => {
  it("bekræftede mål vinder, også med ventende forslag", () => {
    expect(forsideMaalTilstand({ bekraeftedeViste: 1, ubekraeftede: 0 })).toBe("maal");
    expect(forsideMaalTilstand({ bekraeftedeViste: 3, ubekraeftede: 6 })).toBe("maal");
  });
  it("kun forslag giver forslagskortet", () => {
    expect(forsideMaalTilstand({ bekraeftedeViste: 0, ubekraeftede: 1 })).toBe("forslag");
  });
  it("intet giver det mørke kort", () => {
    expect(forsideMaalTilstand({ bekraeftedeViste: 0, ubekraeftede: 0 })).toBe("tom");
  });
  it("forslagslisten: højst tre titler, resten talt, tomme titler sprunget over", () => {
    expect(forslagListe([{ title: "A" }, { title: "B" }])).toEqual({ titler: ["A", "B"], flere: 0 });
    expect(forslagListe([{ title: "A" }, { title: " B " }, { title: "C" }, { title: "D" }, { title: "E" }])).toEqual({ titler: ["A", "B", "C"], flere: 2 });
    expect(forslagListe([{ title: "  " }, { title: "B" }])).toEqual({ titler: ["B"], flere: 0 });
  });
  it("ordene bøjer i ental og flertal", () => {
    expect(FORSIDE_MAAL_ORD.forslagOverskrift(1)).toBe("1 forslag til et mål venter på jer");
    expect(FORSIDE_MAAL_ORD.forslagOverskrift(3)).toBe("3 forslag til mål venter på jer");
    expect(FORSIDE_MAAL_ORD.flereMaal(1)).toBe("+1 aktivt mål mere på Dine mål");
    expect(FORSIDE_MAAL_ORD.flereMaal(2)).toBe("+2 aktive mål mere på Dine mål");
    expect(FORSIDE_MAAL_ORD.kvartalstjekLinje(2)).toBe("2 kvartalstjek venter");
  });
  it("guidens sti åbner Dine mål med parameteren", () => {
    expect(SAET_MAAL_STI).toBe("/milestones?saet=maal");
  });
  it("«Sæt et tal på» åbner guiden for præcis det mål", () => {
    expect(skarptSti("6fdbf491-6314-486e-91b4-da8ec37ad604")).toBe("/milestones?skarpt=6fdbf491-6314-486e-91b4-da8ec37ad604");
  });
  it("skridt og mål-punkter står ikke dobbelt i «Dit næste skridt» — alt andet gør", () => {
    expect(erPlanPunkt({ kind: "company-action" })).toBe(true);
    expect(erPlanPunkt({ kind: "maal" })).toBe(true);
    for (const kind of ["missing-report", "pending-approval", "unread-messages", "kvartalstjek", "tjekliste", "weekly-focus", "pulse"]) expect(erPlanPunkt({ kind })).toBe(false);
  });
  it("et gammelt mål siger «Uden tal endnu», aldrig motorens «Kan ikke afgøres endnu»", () => {
    expect(FORSIDE_MAAL_ORD.udenTal).toBe("Uden tal endnu");
    expect(FORSIDE_MAAL_ORD.saetTalPaa).toBe("Sæt et tal på");
  });
});
