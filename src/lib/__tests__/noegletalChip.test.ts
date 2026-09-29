import { describe, expect, it } from "vitest";
import {
  bygBeskedMeta,
  bygNoegletalChip,
  chipTekst,
  laesChipFraState,
  laesNoegletalChip,
  maaSpoergeRaadgiver,
  NAVN_MAKS,
  NOEGLETAL_META_NOEGLE,
  NOEGLETAL_STATE_NOEGLE,
  spoergRaadgiverRejse,
  VAERDI_MAKS,
} from "@/lib/noegletalChip";

/** «Spørg din rådgiver» ved et nøgletal — hver gren i motoren har sin prøve. */

const GYLDIG = { noegle: "omsaetning", navn: "Omsætning", vaerdi: "1.234.567", periodKey: "2026-09", estimat: false };

describe("noegletalChip — bygNoegletalChip", () => {
  it("bygger chippen: nøgle, navn, værdi som tekst, period_key og estimat-flag", () => {
    expect(bygNoegletalChip(GYLDIG)).toEqual({
      ok: true,
      chip: { noegle: "omsaetning", navn: "Omsætning", vaerdi: "1.234.567", periode: "2026-09", estimat: false },
    });
  });

  it("trimmer navn og værdi, og et estimat bevares", () => {
    const dom = bygNoegletalChip({ ...GYLDIG, navn: "  DB Margin ", vaerdi: " 45,7 % ", noegle: "db_margin", estimat: true });
    expect(dom).toEqual({ ok: true, chip: { noegle: "db_margin", navn: "DB Margin", vaerdi: "45,7 %", periode: "2026-09", estimat: true } });
  });

  it("chippen er frosset: en kopi, der ikke kan ændres, og som ikke følger kildeobjektet", () => {
    const kilde = { ...GYLDIG };
    const dom = bygNoegletalChip(kilde);
    if (dom.ok === false) throw new Error("skulle være gyldig");
    kilde.vaerdi = "999";
    kilde.navn = "Andet";
    expect(dom.chip.vaerdi).toBe("1.234.567");
    expect(dom.chip.navn).toBe("Omsætning");
    expect(Object.isFrozen(dom.chip)).toBe(true);
  });

  it("afviser en ukendt nøgle (stort, mellemrum, tom, for lang)", () => {
    for (const noegle of ["", "Omsaetning", "omsætning", "db margin", "1abc", "a".repeat(41)]) {
      expect(bygNoegletalChip({ ...GYLDIG, noegle }), noegle).toEqual({ ok: false, grund: "ukendt_noegle" });
    }
  });

  it("afviser et tomt eller for langt navn", () => {
    expect(bygNoegletalChip({ ...GYLDIG, navn: "   " })).toEqual({ ok: false, grund: "tomt_navn" });
    expect(bygNoegletalChip({ ...GYLDIG, navn: "a".repeat(NAVN_MAKS) }).ok).toBe(true);
    expect(bygNoegletalChip({ ...GYLDIG, navn: "a".repeat(NAVN_MAKS + 1) })).toEqual({ ok: false, grund: "for_langt_navn" });
  });

  it("afviser en tom eller for lang værdi", () => {
    expect(bygNoegletalChip({ ...GYLDIG, vaerdi: "" })).toEqual({ ok: false, grund: "tom_vaerdi" });
    expect(bygNoegletalChip({ ...GYLDIG, vaerdi: "1".repeat(VAERDI_MAKS) }).ok).toBe(true);
    expect(bygNoegletalChip({ ...GYLDIG, vaerdi: "1".repeat(VAERDI_MAKS + 1) })).toEqual({ ok: false, grund: "for_lang_vaerdi" });
  });

  it("afviser en periode, der ikke er en måned (måned 00 og 13, forkert form, tom)", () => {
    for (const periodKey of ["", "2026", "2026-13", "2026-00", "2026-9", "26-09", "2026-09-01", "september"]) {
      expect(bygNoegletalChip({ ...GYLDIG, periodKey }), periodKey).toEqual({ ok: false, grund: "ukendt_periode" });
    }
    expect(bygNoegletalChip({ ...GYLDIG, periodKey: "2026-12" }).ok).toBe(true);
    expect(bygNoegletalChip({ ...GYLDIG, periodKey: "2026-01" }).ok).toBe(true);
  });
});

describe("noegletalChip — chipTekst", () => {
  it("skriver måneden ud og siger estimat, når det er et estimat", () => {
    const m = bygNoegletalChip(GYLDIG);
    const e = bygNoegletalChip({ ...GYLDIG, estimat: true });
    if (m.ok === false || e.ok === false) throw new Error("skulle være gyldig");
    expect(chipTekst(m.chip)).toBe("Omsætning: 1.234.567 · September 2026");
    expect(chipTekst(e.chip)).toBe("Omsætning: 1.234.567 · September 2026 · estimat");
  });
});

describe("noegletalChip — laesNoegletalChip (visningen)", () => {
  const chip = { noegle: "resultat", navn: "Resultat", vaerdi: "-12.000", periode: "2026-08", estimat: false };

  it("læser chippen ud af context_meta.noegletal — og kun derfra", () => {
    expect(NOEGLETAL_META_NOEGLE).toBe("noegletal");
    expect(laesNoegletalChip({ noegletal: chip })).toEqual(chip);
    // Et estimat-flag, der ikke er sandt, er ikke et estimat.
    expect(laesNoegletalChip({ noegletal: { ...chip, estimat: "true" } })?.estimat).toBe(false);
    // Nøglen ligger ved siden af vedhæftninger og andet uden at forstyrre.
    expect(laesNoegletalChip({ attachments: [], noegletal: chip, feedback: "up" })).toEqual(chip);
  });

  it("er ingen chip, når formen er forkert — aldrig et kast", () => {
    for (const meta of [null, undefined, 5, "x", [], {}, { noegletal: null }, { noegletal: "x" }, { noegletal: [] }]) {
      expect(laesNoegletalChip(meta), JSON.stringify(meta)).toBeNull();
    }
    expect(laesNoegletalChip({ noegletal: { ...chip, vaerdi: 12 } })).toBeNull();
    expect(laesNoegletalChip({ noegletal: { ...chip, periode: "2026-13" } })).toBeNull();
    expect(laesNoegletalChip({ noegletal: { ...chip, navn: "" } })).toBeNull();
    // Chippen hører under nøglen noegletal, ikke på toppen (så title/citat fra andre typer ikke misforstås).
    expect(laesNoegletalChip(chip)).toBeNull();
  });
});

describe("noegletalChip — rejsen til chatten", () => {
  it("state bærer chippen under den ene nøgle, og laesChipFraState læser den igen", () => {
    const dom = bygNoegletalChip(GYLDIG);
    if (dom.ok === false) throw new Error("skulle være gyldig");
    const rejse = spoergRaadgiverRejse(dom.chip);
    expect(rejse.to).toBe("/chat");
    expect(Object.keys(rejse.state)).toEqual([NOEGLETAL_STATE_NOEGLE]);
    expect(laesChipFraState(rejse.state)).toEqual(dom.chip);
  });

  it("ukendt eller ødelagt state er ingen chip", () => {
    for (const state of [null, undefined, 1, "x", [], {}, { [NOEGLETAL_STATE_NOEGLE]: { noegle: "x" } }]) {
      expect(laesChipFraState(state), JSON.stringify(state)).toBeNull();
    }
  });
});

describe("noegletalChip — maaSpoergeRaadgiver", () => {
  it("kun et medlem med fuldt medlemskab", () => {
    expect(maaSpoergeRaadgiver({ erRaadgiver: false, tier: "full" })).toBe(true);
    expect(maaSpoergeRaadgiver({ erRaadgiver: true, tier: "full" })).toBe(false);
    expect(maaSpoergeRaadgiver({ erRaadgiver: false, tier: "subscriber" })).toBe(false);
    expect(maaSpoergeRaadgiver({ erRaadgiver: false, tier: "expired" })).toBe(false);
    expect(maaSpoergeRaadgiver({ erRaadgiver: false, tier: null })).toBe(false);
  });
});

describe("noegletalChip — bygBeskedMeta", () => {
  const dom = bygNoegletalChip(GYLDIG);
  if (dom.ok === false) throw new Error("skulle være gyldig");
  const vedhaeft = [{ path: "a/b.pdf", name: "b.pdf" }];

  it("uden vedhæftninger og uden chip: intet context_meta (som før)", () => {
    expect(bygBeskedMeta({})).toBeUndefined();
    expect(bygBeskedMeta({ attachments: [], chip: null })).toBeUndefined();
  });

  it("kun chip: context_meta.noegletal; kun vedhæftninger: som før", () => {
    expect(bygBeskedMeta({ chip: dom.chip })).toEqual({ noegletal: dom.chip });
    expect(bygBeskedMeta({ attachments: vedhaeft })).toEqual({ attachments: vedhaeft });
  });

  it("begge: side om side, ingen af dem overskriver den anden", () => {
    expect(bygBeskedMeta({ attachments: vedhaeft, chip: dom.chip })).toEqual({ attachments: vedhaeft, noegletal: dom.chip });
  });

  it("det byggede meta læses igen af visningen — rundtur", () => {
    expect(laesNoegletalChip(bygBeskedMeta({ chip: dom.chip }))).toEqual(dom.chip);
  });
});
