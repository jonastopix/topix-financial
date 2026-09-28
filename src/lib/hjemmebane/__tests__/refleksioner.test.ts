import { describe, expect, it } from "vitest";
import {
  fremgangLinje, REFLEKSIONER_ANKER, REFLEKSIONER_STI, REFLEKSIONS_FELTER, refleksionerTilVisning, refleksionTilVisning,
  SE_ALLE_REFLEKSIONER, seAlleRefleksionerHandling, sorterRefleksioner, udenTekstLinje, type RefleksionRaekke,
} from "@/lib/hjemmebane/refleksioner";
import { maanedOrd } from "@/lib/factsCsv";

/**
 * Medlemmets egne refleksioner (28/9-2026): måneden i ord, tomme felter, nyeste
 * øverst — husets domme, ikke fladens.
 */
const R = (r: Partial<RefleksionRaekke> & { period_key: string }): RefleksionRaekke => ({
  went_well: "En ny kunde", biggest_challenge: "Likviditeten", help_needed: null,
  milestone_progress: 40, created_at: "2026-10-03T10:00:00Z", ...r,
});

describe("refleksionTilVisning — én måned", () => {
  it("måneden i ord kommer fra maanedOrd — «September 2026»", () => {
    const v = refleksionTilVisning(R({ period_key: "2026-09" }));
    expect(v.maaned).toBe("September 2026");
    expect(v.maaned).toBe(maanedOrd("2026-09"));
    expect(v.periodKey).toBe("2026-09");
  });

  it("felterne står i modalens rækkefølge med modalens spørgsmål", () => {
    const v = refleksionTilVisning(R({ period_key: "2026-09", help_needed: "Prisen" }));
    expect(v.felter.map((f) => f.noegle)).toEqual(["went_well", "biggest_challenge", "help_needed"]);
    expect(v.felter.map((f) => f.spoergsmaal)).toEqual(REFLEKSIONS_FELTER.map((f) => f.spoergsmaal));
    expect(v.felter[2].tekst).toBe("Prisen");
  });

  it("TOMME FELTER: null, tom og kun mellemrum tegnes ikke — teksten trimmes", () => {
    const v = refleksionTilVisning(R({ period_key: "2026-08", went_well: "  ", biggest_challenge: null, help_needed: "  Hjælp til budget \n" }));
    expect(v.felter.map((f) => f.noegle)).toEqual(["help_needed"]);
    expect(v.felter[0].tekst).toBe("Hjælp til budget");
    expect(v.udenTekst).toBe(false);
  });

  it("alle tre tomme OG intet milestone-tal → «uden tekst»", () => {
    const v = refleksionTilVisning(R({ period_key: "2026-07", went_well: "", biggest_challenge: " ", help_needed: null, milestone_progress: null }));
    expect(v.felter).toEqual([]);
    expect(v.udenTekst).toBe(true);
    expect(udenTekstLinje(v.maaned)).toBe("Du sendte refleksionen for Juli 2026 uden tekst.");
  });

  it("alle tre tomme, men et milestone-tal → IKKE uden tekst (tallet er indhold)", () => {
    const v = refleksionTilVisning(R({ period_key: "2026-07", went_well: null, biggest_challenge: null, help_needed: null, milestone_progress: 0 }));
    expect(v.udenTekst).toBe(false);
    expect(v.fremgang).toBe(0);
  });

  it("milestone-tallet siges som det blev regnet — ikke som en vurdering", () => {
    expect(fremgangLinje(40)).toBe("Dine milestones stod på 40 % — regnet af dine aktive mål, da du sendte den.");
    expect(refleksionTilVisning(R({ period_key: "2026-09", milestone_progress: null })).fremgang).toBeNull();
    expect(refleksionTilVisning(R({ period_key: "2026-09", milestone_progress: Number.NaN })).fremgang).toBeNull();
  });

  it("en ulæselig period_key tegnes som den er — aldrig et gæt", () => {
    expect(refleksionTilVisning(R({ period_key: "ukendt" })).maaned).toBe("ukendt");
  });
});

describe("sorterRefleksioner / refleksionerTilVisning — nyeste øverst", () => {
  it("sorterer på period_key faldende, uanset rækkefølgen i svaret", () => {
    const ud = refleksionerTilVisning([R({ period_key: "2026-07" }), R({ period_key: "2026-09" }), R({ period_key: "2026-08" })]);
    expect(ud.map((v) => v.periodKey)).toEqual(["2026-09", "2026-08", "2026-07"]);
    expect(ud.map((v) => v.maaned)).toEqual(["September 2026", "August 2026", "Juli 2026"]);
  });

  it("hen over et årsskifte: januar 2027 står over december 2026", () => {
    const ud = sorterRefleksioner([R({ period_key: "2026-12" }), R({ period_key: "2027-01" })]);
    expect(ud.map((r) => r.period_key)).toEqual(["2027-01", "2026-12"]);
  });

  it("samme måned to gange (kan ikke ske i basen — UNIQUE): den senest skrevne først, og inputtet røres ikke", () => {
    const a = R({ period_key: "2026-09", created_at: "2026-10-01T00:00:00Z" });
    const b = R({ period_key: "2026-09", created_at: "2026-10-05T00:00:00Z" });
    const input = [a, b];
    expect(sorterRefleksioner(input)[0]).toBe(b);
    expect(input[0]).toBe(a);
  });

  it("tom liste giver tom liste", () => {
    expect(refleksionerTilVisning([])).toEqual([]);
  });
});

describe("linket den anden vej — «Se alle dine refleksioner» (28/9)", () => {
  it("peger på sektionen på /reports, og ordene står ét sted", () => {
    expect(REFLEKSIONER_ANKER).toBe("dine-refleksioner");
    expect(REFLEKSIONER_STI).toBe("/reports#dine-refleksioner");
    expect(SE_ALLE_REFLEKSIONER).toBe("Se alle dine refleksioner");
  });

  it("scroller direkte, når man allerede står på ankeret — en navigation dér ville ikke skifte hash", () => {
    expect(seAlleRefleksionerHandling("/reports", "#dine-refleksioner")).toBe("scroll");
  });

  it("navigerer alle andre steder: /pulse, /reports uden eller med andet anker", () => {
    expect(seAlleRefleksionerHandling("/pulse", "")).toBe("naviger");
    expect(seAlleRefleksionerHandling("/reports", "")).toBe("naviger");
    expect(seAlleRefleksionerHandling("/reports", "#upload")).toBe("naviger");
    expect(seAlleRefleksionerHandling("/", "#dine-refleksioner")).toBe("naviger");
  });
});
