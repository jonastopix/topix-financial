import { describe, expect, it } from "vitest";
import {
  afgoerAnbefaling,
  ANBEFALING_VERSION,
  erHeltNyt,
  erOphoert,
  grundlagSomTekst,
  MODENT_AAR,
  NYSTIFTET_AAR,
  OMSAETNING_MINIMUM_KR,
  OMSAETNINGSINTERVALLER_KR,
  opfylderMinimum,
  type AnbefalingsInput,
} from "@/lib/ansoegningAnbefaling";
import { OMSAETNINGSINTERVALLER } from "@/lib/ansoegning/skema";

const NU = new Date("2026-09-18T10:00:00Z");
const basis: AnbefalingsInput = {
  omsaetningsnoegle: null,
  antalAnsatte: null,
  branche: null,
  stiftetAar: null,
  selskabsform: null,
  cvrStatus: null,
  setWebinar: null,
  kilde: "direkte",
  kildeRaa: null,
  udfordring: null,
  proevet: null,
  omTolvMaaneder: null,
  startTidspunkt: null,
  nu: NU,
};
const KONKRET = "Vi har svært ved at se om vi tjener penge på de enkelte sager, og bogholderen kommer for sent med tallene.";
/** Begge hovedkriterier opfyldt, intet imod. */
const GOD: AnbefalingsInput = { ...basis, omsaetningsnoegle: "D", stiftetAar: 2019, udfordring: KONKRET };

describe("ansoegningAnbefaling — aldrig et tal alene", () => {
  it("Jonas' eksempel i B's felter: omsætning 2–5 mio., 12 ansatte, tømrer, selskab fra 2019, har set webinaret, har selv prøvet …", () => {
    const a = afgoerAnbefaling({
      ...GOD,
      antalAnsatte: 12,
      branche: "Tømrer- og bygningssnedkervirksomhed",
      selskabsform: "ApS",
      setWebinar: "ja",
      proevet: "Har selv prøvet at ansætte en projektleder, men det gav ikke det overblik vi manglede.",
      startTidspunkt: "hurtigst_muligt",
    });
    expect(a.udfald).toBe("tal_med_dem");
    expect(grundlagSomTekst(a)).toBe(
      "omsætning 2 – 5 mio. kr., 12 ansatte, tømrer- og bygningssnedkervirksomhed, selskab fra 2019, ApS, har set webinaret, har selv prøvet: Har selv prøvet at ansætte en projektleder, men det gav ikke det overblik vi ma…, kan starte hurtigst muligt",
    );
    expect(a.for).toEqual(["omsætning mindst 2 mio.", "mindst tre års drift", "har set webinaret", "har beskrevet konkret hvad de vil"]);
    expect(a.imod).toEqual([]);
    expect(a.version).toBe(ANBEFALING_VERSION);
  });

  it("udfaldet bærer altid et grundlag med ord — også ved afvis og tvivl", () => {
    const afvis = afgoerAnbefaling({ ...basis, omsaetningsnoegle: "A" });
    expect(afvis.udfald).toBe("afvis");
    expect(afvis.grundlag[0]).toBe("omsætning under 500.000 kr.");
    expect(afvis.imod).toContain("omsætning under 2 mio.");
    const tvivl = afgoerAnbefaling({ ...basis, omsaetningsnoegle: "E" });
    expect(tvivl.udfald).toBe("tvivl");
    expect(tvivl.grundlag).toContain("stiftelsesår ukendt");
    expect(tvivl.grundlag.length).toBeGreaterThan(0);
  });
});

describe("ansoegningAnbefaling — de to hovedkriterier (Jonas 18/9: minimum 2 mio., ingen helt nye)", () => {
  it("intervallerne er B's syv; D er det første der opfylder minimum", () => {
    expect(Object.keys(OMSAETNINGSINTERVALLER_KR)).toEqual(OMSAETNINGSINTERVALLER.map((o) => o.noegle));
    expect(OMSAETNING_MINIMUM_KR).toBe(2_000_000);
    expect(["A", "B", "C"].map(opfylderMinimum)).toEqual([false, false, false]);
    expect(["D", "E", "F", "G"].map(opfylderMinimum)).toEqual([true, true, true, true]);
    expect(opfylderMinimum(null)).toBeNull();
    expect(opfylderMinimum("X")).toBeNull();
  });

  it("A–C trækker klart ned: afvis uden anbefaling — også C (1–2 mio.) er under minimum", () => {
    for (const n of ["A", "B", "C"]) expect(afgoerAnbefaling({ ...GOD, omsaetningsnoegle: n }).udfald).toBe("afvis");
    for (const n of ["D", "E", "F", "G"]) expect(afgoerAnbefaling({ ...GOD, omsaetningsnoegle: n }).udfald).toBe("tal_med_dem");
  });

  it("helt ny virksomhed (under ét år) trækker klart ned; ≥ 3 år taler for; 1–2 år er hverken/eller", () => {
    expect(NYSTIFTET_AAR).toBe(1);
    expect(MODENT_AAR).toBe(3);
    expect(erHeltNyt(2026, NU)).toBe(true);
    expect(erHeltNyt(2025, NU)).toBe(false);
    expect(erHeltNyt(null, NU)).toBeNull();
    expect(erHeltNyt(2030, NU)).toBeNull();
    const ny = afgoerAnbefaling({ ...GOD, stiftetAar: 2026 });
    expect(ny.udfald).toBe("tvivl");
    expect(ny.imod).toContain("helt ny virksomhed (under et år)");
    // To år: ikke helt ny (hovedkriteriet holder), men heller ikke tre års drift (intet «for») — stadig «tal med dem», kun «helt ny» trækker ned.
    const toAar = afgoerAnbefaling({ ...GOD, stiftetAar: 2024 });
    expect(toAar.udfald).toBe("tal_med_dem");
    expect(toAar.for).not.toContain("mindst tre års drift");
  });

  it("begge hovedkriterier fejler (under 2 mio. OG helt ny) → afvis, selv med anbefaling", () => {
    expect(afgoerAnbefaling({ ...GOD, omsaetningsnoegle: "C", stiftetAar: 2026, kilde: "anbefaling", kildeRaa: "Morten" }).udfald).toBe("afvis");
  });

  it("under 2 mio. men kilden er anbefaling → tvivl, ikke afvis (nogen står inde for dem)", () => {
    const a = afgoerAnbefaling({ ...GOD, omsaetningsnoegle: "C", kilde: "anbefaling", kildeRaa: "Morten" });
    expect(a.udfald).toBe("tvivl");
    expect(a.grundlag).toContain("anbefalet af Morten");
    expect(a.for).toContain("kommer på anbefaling");
  });

  it("ukendt omsætning eller ukendt alder giver aldrig «tal med dem» — det er menneskets vurdering", () => {
    expect(afgoerAnbefaling({ ...GOD, omsaetningsnoegle: null }).udfald).toBe("tvivl");
    expect(afgoerAnbefaling({ ...GOD, stiftetAar: null }).udfald).toBe("tvivl");
  });

  it("et ophørt selskab afvises uanset; status nævnes i grundlaget", () => {
    expect(erOphoert("Ophørt")).toBe(true);
    expect(erOphoert("Under konkurs")).toBe(true);
    expect(erOphoert("Aktiv")).toBe(false);
    expect(erOphoert(null)).toBe(false);
    const a = afgoerAnbefaling({ ...GOD, omsaetningsnoegle: "G", cvrStatus: "Ophørt" });
    expect(a.udfald).toBe("afvis");
    expect(a.grundlag).toContain("registret siger: ophørt");
  });

  it("de øvrige vipper kun til tvivl: tynd tekst, «senere», selskabsform og ansatte nævnes, lange tekster klippes", () => {
    const tynd = afgoerAnbefaling({ ...GOD, udfordring: "Hjælp til økonomi" });
    expect(tynd.udfald).toBe("tvivl");
    expect(tynd.imod).toEqual(["ansøgningen er tynd: intet konkret om udfordring, forsøg eller mål"]);
    expect(tynd.grundlag).toContain("udfordringen: Hjælp til økonomi");
    const senere = afgoerAnbefaling({ ...GOD, startTidspunkt: "senere" });
    expect(senere.udfald).toBe("tvivl");
    expect(senere.imod).toContain("vil først vide mere før start");
    const a = afgoerAnbefaling({ ...basis, kilde: "linkedin", setWebinar: "nej", proevet: "x".repeat(200), selskabsform: "A/S", antalAnsatte: 1250 });
    expect(a.grundlag).toContain("kom via LinkedIn");
    expect(a.grundlag).toContain("A/S");
    expect(a.grundlag).toContain("1.250 ansatte");
    const p = a.grundlag.find((g) => g.startsWith("har selv prøvet:"))!;
    expect(p.length).toBeLessThanOrEqual(80 + "har selv prøvet: ".length);
    expect(p.endsWith("…")).toBe(true);
    expect(a.grundlag).not.toContain("har set webinaret");
    expect(afgoerAnbefaling({ ...basis, antalAnsatte: 0 }).grundlag).toContain("ingen ansatte");
    expect(afgoerAnbefaling({ ...basis, antalAnsatte: 1 }).grundlag).toContain("1 ansat");
  });
});
