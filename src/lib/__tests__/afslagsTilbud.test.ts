import { describe, expect, it } from "vitest";
import { grundTekst, koeNummer, koeSaetningTilAnsoeger, koeTekstTilRaadgiver, type Venteplads } from "@/lib/afslagsTilbud";
import { afgoerOvergang, afslagsFoelger, AFSLAGSGRUNDE, MENNESKE_HANDLINGER, TRAPPER_NAVNE } from "@/lib/ansoegningTrin";
import { TRAPPER, TRAPPER_PAA_LUKKET } from "@/lib/rykkerkoe";
import type { VentepladsRaekke } from "@/lib/ventelisteDom";

const ctx = { paaPause: false, lukketFraTrin: null };

describe("afslagsTilbud — grunden bag nej'et, ventelisten ved niche, afslagsmailen; «svarer ikke» og «andet» giver intet", () => {
  it("afslagsFoelger: niche → venteliste + afslagsmail; for_tidligt → afslagsmail; andet/ingen → intet", () => {
    expect(AFSLAGSGRUNDE).toEqual(["niche", "for_tidligt", "andet"]);
    expect(afslagsFoelger("niche")).toEqual({ venteliste: true, afslagsmail: true });
    expect(afslagsFoelger("for_tidligt")).toEqual({ venteliste: false, afslagsmail: true });
    expect(afslagsFoelger("andet")).toEqual({ venteliste: false, afslagsmail: false });
    expect(afslagsFoelger(null)).toEqual({ venteliste: false, afslagsmail: false });
  });

  it("afvis/afslag med grund skriver grunden og planlægger afslagsmailen (trappen afslag); «andet», ingen grund og «svarer ikke» planlægger intet", () => {
    const niche = afgoerOvergang("ny", { art: "afvis", grund: "niche" }, ctx);
    expect(niche.ok && niche.overgang).toMatchObject({ til: "lukket", lukkeaarsag: "afslag_efter_ansoegning", afslagsgrund: "niche", start: { trappe: "afslag", anker: "nu" }, annuller: "alle" });
    const forTidligt = afgoerOvergang("afholdt", { art: "afslag", grund: "for_tidligt" }, ctx);
    expect(forTidligt.ok && forTidligt.overgang).toMatchObject({ lukkeaarsag: "afslag_efter_samtale", afslagsgrund: "for_tidligt", start: { trappe: "afslag", anker: "nu" } });
    const andet = afgoerOvergang("ny", { art: "afvis", grund: "andet" }, ctx);
    expect(andet.ok && andet.overgang).toMatchObject({ afslagsgrund: "andet", start: null });
    const uden = afgoerOvergang("ny", { art: "afvis" }, ctx);
    expect(uden.ok && uden.overgang).toMatchObject({ afslagsgrund: null, start: null });
    // «svarer ikke» er køens lukning — ingen grund, ingen mail
    const svarerIkke = afgoerOvergang("indkaldt", { art: "svarer_ikke" }, ctx);
    expect(svarerIkke.ok && svarerIkke.overgang).toMatchObject({ lukkeaarsag: "svarer_ikke", afslagsgrund: null, start: null });
  });

  it("abonnementet er taget ud (Jonas 18/9): ingen handling, ingen trappe, intet i overgangen; lukket tillader kun genåbn", () => {
    expect(MENNESKE_HANDLINGER).not.toContain("tilbyd_abonnement");
    expect(TRAPPER_NAVNE).not.toContain("abonnement");
    expect(Object.keys(TRAPPER)).not.toContain("abonnement");
    expect(afgoerOvergang("lukket", { art: "tilbyd_abonnement" } as never, ctx).ok).toBe(false);
    const niche = afgoerOvergang("ny", { art: "afvis", grund: "niche" }, ctx);
    expect(niche.ok && "tilbydAbonnement" in niche.overgang).toBe(false);
  });

  it("trappen afslag: én mail dag 0; lever på en lukket ansøgning (TRAPPER_PAA_LUKKET) sammen med C's venteplads", () => {
    expect(TRAPPER.afslag).toEqual([{ trinNr: 0, dag: 0, handling: "send_mail", skabelon: "ansoegning-afslag", modtager: "ansoeger" }]);
    expect([...TRAPPER_PAA_LUKKET]).toEqual(["afslag", "venteplads"]);
  });

  it("koeNummer: C's rækkefølge (ældst afvist først, så sat_at, så id); kun «venter»; null når de ikke står der", () => {
    const r = (id: string, ansoegning_id: string, afvist_at: string | null, sat_at: string, status: VentepladsRaekke["status"] = "venter"): VentepladsRaekke => ({ id, ansoegning_id, company_id: "c1", status, sat_at, afvist_at });
    const koe = [
      r("p3", "a3", "2026-09-15T00:00:00Z", "2026-09-16T00:00:00Z"),
      r("p1", "a1", "2026-09-01T00:00:00Z", "2026-09-18T00:00:00Z"),
      r("p2", "a2", "2026-09-10T00:00:00Z", "2026-09-11T00:00:00Z"),
      r("p9", "a9", "2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z", "tilbudt"),
    ];
    expect(koeNummer(koe, "a1")).toBe(1);
    expect(koeNummer(koe, "a2")).toBe(2);
    expect(koeNummer(koe, "a3")).toBe(3);
    expect(koeNummer(koe, "a9")).toBeNull();
    expect(koeNummer(koe, "ukendt")).toBeNull();
    expect(koeNummer([], "a1")).toBeNull();
  });

  it("to tekster, to læsere: rådgiveren ser navnet, ansøgeren får kun nummeret (Jonas 18/9)", () => {
    expect(koeTekstTilRaadgiver({ virksomhed: "Homie", nummer: 1, hvorfor: null })).toBe("først i køen til pladsen hos Homie");
    expect(koeTekstTilRaadgiver({ virksomhed: "Homie", nummer: 3, hvorfor: null })).toBe("nummer 3 i køen til pladsen hos Homie");
    expect(koeSaetningTilAnsoeger([{ nummer: 1 }])).toBe("I står først i køen til pladsen i jeres niche");
    expect(koeSaetningTilAnsoeger([{ nummer: 2 }])).toBe("I står nummer 2 i køen til pladsen i jeres niche");
    expect(koeSaetningTilAnsoeger([{ nummer: 1 }, { nummer: 3 }])).toBe("I står i kø til 2 pladser i jeres niche: først og nummer 3");
    expect(koeSaetningTilAnsoeger([{ nummer: 2 }, { nummer: 1 }, { nummer: 4 }])).toBe("I står i kø til 3 pladser i jeres niche: nummer 2, først og nummer 4");
    expect(koeSaetningTilAnsoeger([])).toBe("");
    // Navnet kan ikke slippe med: rådgiverens plads passer strukturelt, men teksten bruger kun nummeret
    const raadgiverens: Venteplads = { virksomhed: "Homie", nummer: 2, hvorfor: "samme kunder" };
    expect(koeSaetningTilAnsoeger([raadgiverens])).not.toContain("Homie");
  });

  it("grunden i ansøgerens ord — aldrig nøglen råt", () => {
    expect(grundTekst("niche")).toMatch(/kun én i hver niche/);
    expect(grundTekst("for_tidligt")).toMatch(/for tidligt/);
    expect(grundTekst("andet")).toMatch(/ikke er det rigtige for jer lige nu/);
    expect(grundTekst(null)).toMatch(/ikke er det rigtige for jer lige nu/);
    expect(grundTekst("niche")).not.toMatch(/for_tidligt|niche_/);
  });
});
