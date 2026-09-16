import { describe, expect, it } from "vitest";
import { erHoejstTreFejl, HOEJST_TRE_TEKST, loeftestangStatus, loeftestangToast, maalFejlTekst } from "@/lib/hjemmebane/maalFejl";

/* Fase 2 (16/9): medlemmet ejer sine mål; «højst tre aktive» gælder alle.
   Databasens trigger-fejl bliver til husets tekst, og løftestangen falder
   tilbage til parkeret når der er tre. */

const TRIGGER = { code: "P0001", message: "milestones: virksomheden har allerede 3 aktive mål — parkér eller markér et som nået først" };

describe("erHoejstTreFejl — triggerens signal", () => {
  it("triggerens tekst rammes — på ordene, og på P0001 + milestones", () => {
    expect(erHoejstTreFejl(TRIGGER)).toBe(true);
    expect(erHoejstTreFejl({ code: "P0001", message: "milestones: noget andet" })).toBe(true);
    expect(erHoejstTreFejl({ code: null, message: "… har allerede 3 aktive mål …" })).toBe(true);
  });
  it("andre fejl rammes ikke: RLS (42501), unik nøgle (23505), tom, null", () => {
    expect(erHoejstTreFejl({ code: "42501", message: "new row violates row-level security policy" })).toBe(false);
    expect(erHoejstTreFejl({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(erHoejstTreFejl({ code: "P0001", message: "company_traek: noget" })).toBe(false);
    expect(erHoejstTreFejl(null)).toBe(false);
    expect(erHoejstTreFejl(undefined)).toBe(false);
    expect(erHoejstTreFejl({})).toBe(false);
  });
});

describe("maalFejlTekst — husets ord, aldrig den rå fejl", () => {
  it("højst tre → husets tekst; ellers kalderens", () => {
    expect(HOEJST_TRE_TEKST).toBe("Du har allerede 3 aktive mål — parkér eller markér et som nået først");
    expect(maalFejlTekst(TRIGGER, "Kunne ikke oprette milestone")).toBe(HOEJST_TRE_TEKST);
    expect(maalFejlTekst({ code: "42501", message: "rls" }, "Kunne ikke gemme")).toBe("Kunne ikke gemme");
    expect(maalFejlTekst(TRIGGER, "x")).not.toContain("milestones:");
  });
});

describe("loeftestangStatus — aktiv når der er plads, ellers parkeret", () => {
  it("0–2 aktive → active; 3+ → parked; ulæseligt → parked", () => {
    expect(loeftestangStatus(0)).toBe("active");
    expect(loeftestangStatus(2)).toBe("active");
    expect(loeftestangStatus(3)).toBe("parked");
    expect(loeftestangStatus(7)).toBe("parked");
    expect(loeftestangStatus(Number.NaN)).toBe("parked");
    expect(loeftestangStatus(-1)).toBe("parked");
  });
  it("toasten pr. status — ordret", () => {
    expect(loeftestangToast("parked", "Flere leads")).toEqual({ title: "Gemt som parkeret mål", description: "Gemt som parkeret mål — du har allerede 3 aktive. Aktivér det når der er plads." });
    expect(loeftestangToast("active", "Flere leads")).toEqual({ title: "Milestone oprettet", description: '"Flere leads" er nu en aktiv milestone. Åbn Milestones for at tilføje et konkret talmål.' });
  });
});
