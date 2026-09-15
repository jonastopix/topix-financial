import { describe, expect, it } from "vitest";
import { EKSPORT_VEJE, HISTORIK_MAANEDER, historikFoerst, tomListeTekst, uploadZoneTekst, vejledningAaben } from "../rapporteringTekst";

// Rapporteringens ord (9/9): en ny skal forstå at de ikke skal vente på
// næste måned — de skal uploade det de har, også fra før medlemskabet.
// En vant skal ikke læse introduktionen hver måned.
// Instruks F (16/9): månederne står ved navn — de tre seneste AFSLUTTEDE,
// regnet fra `nu` i dansk tid. 22/9-2026 → juni, juli og august.

const NU = new Date("2026-09-22T10:00:00Z");

describe("uploadZoneTekst — ny mod vant", () => {
  it("ny: beder om historik — de tre seneste afsluttede måneder ved navn, gerne mere, også fra før medlemskabet — og siger hvor tallene kommer fra", () => {
    const t = uploadZoneTekst(true, NU);
    expect(HISTORIK_MAANEDER).toBe(3);
    expect(t.overskrift).toBe("Upload dine tal — start med historikken");
    expect(t.linje).toBe(
      "Saldobalance eller resultatopgørelse fra dit regnskabsprogram, som PDF, Excel eller CSV. " +
        "Tag juni, juli og august med, gerne mere — også fra før du blev medlem. Klik eller træk hertil.",
    );
    expect(t.linje).not.toContain("seneste 3 måneder");
    expect(t.linje).toContain("gerne mere");
    // Månederne følger «nu»: 1/10 er september omme; 5/1 er det oktober–december.
    expect(uploadZoneTekst(true, new Date("2026-10-01T07:00:00Z")).linje).toContain("Tag juli, august og september med");
    expect(uploadZoneTekst(true, new Date("2027-01-05T07:00:00Z")).linje).toContain("Tag oktober, november og december med");
    expect(t.linje).toContain("før du blev medlem");
    expect(t.linje).toContain("regnskabsprogram");
    expect(t.linje).toContain("Klik eller træk hertil");
  });

  it("vant: den hidtidige korte tekst, ordret", () => {
    expect(uploadZoneTekst(false, NU)).toEqual({
      overskrift: "Upload din månedsrapport",
      linje: "Saldobalance eller resultatopgørelse — PDF, Excel eller CSV. Klik eller træk hertil.",
    });
  });
});

describe("tomListeTekst", () => {
  it("ny: siger hvad der skal til — månederne ved navn, ingen nuller", () => {
    const t = tomListeTekst(true, NU);
    expect(t).toBe("Ingen rapporter endnu. Upload juni, juli og august ovenfor — også fra før medlemskabet — så har vi et grundlag at starte fra.");
    expect(t).not.toContain("seneste 3 måneder");
    expect(t).not.toMatch(/\b0 /);
  });
  it("vant (fx et årsfilter uden rækker): kort", () => {
    expect(tomListeTekst(false, NU)).toBe("Ingen rapporter i denne visning.");
  });
});

// Instruks F (16/9): historikken og den udfoldede vejledning står INDTIL
// der findes en godkendt rapport — ikke kun til første række. Én upload af
// indeværende måned er limbo, og så må teksten der beder om historikken
// ikke forsvinde.
describe("historikFoerst — «første gang» varer til den første GODKENDTE rapport", () => {
  it("ingen godkendte: første gang — uanset hvor mange uploads der ligger", () => {
    expect(historikFoerst(0)).toBe(true);
  });
  it("én godkendt: vant", () => {
    expect(historikFoerst(1)).toBe(false);
    expect(historikFoerst(12)).toBe(false);
  });
  it("zonen og vejledningen følger dommen: første gang → historik + udfoldet; vant → kort + sammenfoldet", () => {
    expect(uploadZoneTekst(historikFoerst(0), NU).overskrift).toBe("Upload dine tal — start med historikken");
    expect(vejledningAaben(historikFoerst(0))).toBe(true);
    expect(uploadZoneTekst(historikFoerst(1), NU).overskrift).toBe("Upload din månedsrapport");
    expect(vejledningAaben(historikFoerst(1))).toBe(false);
  });
});

describe("EKSPORT_VEJE — systemerne står FØR uploaden, én linje hver", () => {
  it("de tre systemer fra fejlbeskederne, plus «Andre»", () => {
    expect(EKSPORT_VEJE.map((v) => v.system)).toEqual(["e-conomic", "Dinero", "Billy", "Andre"]);
    for (const v of EKSPORT_VEJE) expect(v.vej.length).toBeLessThan(140); // én linje, ikke en vejledning
  });
  it("vejledningen er foldet ud for den nye, sammen for den vante", () => {
    expect(vejledningAaben(true)).toBe(true);
    expect(vejledningAaben(false)).toBe(false);
  });
});

// ── Kilden → vejen (14/9, mangellistens nr. 8) ──
//
// Serverens fingeraftryk (economic | dinero | combined_dk | unknown) kobles
// til den linje der allerede står i EKSPORT_VEJE — samme objekt, så kortet,
// siden og historik-mailen (onboardingRytme.test.ts låser EKSPORT_VEJE_TEKST
// mod EKSPORT_VEJE) siger den samme vej. Ukendt kilde gætter aldrig.
import { eksportVejForKilde, kildeNavn, naesteSkridtTekst } from "../rapporteringTekst";

describe("eksportVejForKilde — kilden peger på SIN linje i EKSPORT_VEJE, ukendt gætter ikke", () => {
  const linje = (system: string) => EKSPORT_VEJE.find((v) => v.system === system)!;

  it("economic → e-conomic-linjen (samme objekt), dinero → Dinero-linjen", () => {
    expect(eksportVejForKilde("economic")).toBe(linje("e-conomic"));
    expect(eksportVejForKilde("dinero")).toBe(linje("Dinero"));
    expect(eksportVejForKilde(" Economic ")).toBe(linje("e-conomic")); // trim + små bogstaver
  });

  it("unknown, combined_dk, null, tomt og et ukendt ord → «Andre» — aldrig et gættet program", () => {
    for (const kilde of ["unknown", "combined_dk", null, undefined, "", "billy", "noget_nyt"]) {
      expect(eksportVejForKilde(kilde), String(kilde)).toBe(linje("Andre"));
      expect(kildeNavn(kilde), String(kilde)).toBeNull();
    }
    expect(kildeNavn("economic")).toBe("e-conomic");
    expect(kildeNavn("dinero")).toBe("Dinero");
  });

  it("paritet: enhver kilde lander på et objekt i EKSPORT_VEJE — en omdøbt linje fanges her", () => {
    for (const kilde of ["economic", "dinero", "combined_dk", "unknown", null]) {
      expect(EKSPORT_VEJE).toContain(eksportVejForKilde(kilde));
    }
    // Billy står i EKSPORT_VEJE men har intet fingeraftryk: ingen kilde fører dertil.
    expect(["economic", "dinero", "combined_dk", "unknown"].map((k) => eksportVejForKilde(k).system)).not.toContain("Billy");
  });
});

describe("naesteSkridtTekst — hvilken fil, og hvor den hentes, med vejen ordret", () => {
  it("e-conomic: saldobalancen som Excel (det stærkeste spor: HIGH fingeraftryk + to skabeloner), vejen ordret", () => {
    const t = naesteSkridtTekst("economic");
    expect(t).toBe("Den fil vi læser sikrest fra e-conomic, er saldobalancen som Excel: Regnskab → Rapporter → Balance (eller Saldobalance) → Excel.");
    expect(t).toContain(EKSPORT_VEJE[0].vej);
  });
  it("Dinero: dens linje ordret", () => {
    const t = naesteSkridtTekst("dinero");
    expect(t).toBe("Sådan henter du en fil vi kan læse fra Dinero: Rapporter → Resultatopgørelse → CSV eller PDF.");
    expect(t).toContain(EKSPORT_VEJE[1].vej);
  });
  it("ukendt kilde: nævner intet program, bruger «Andre»-linjen ordret", () => {
    for (const kilde of ["unknown", "combined_dk", null]) {
      const t = naesteSkridtTekst(kilde);
      expect(t).toBe("Vi kan ikke se, hvilket regnskabsprogram filen kommer fra. Resultatopgørelse eller saldobalance som PDF eller Excel — kan vi ikke læse den, indtaster du de vigtigste tal selv.");
      expect(t).not.toMatch(/e-conomic|Dinero|Billy/);
    }
  });
  it("hver tekst bærer sin linjes vej ordret — ændres EKSPORT_VEJE, følger kortet med", () => {
    for (const kilde of ["economic", "dinero", "unknown"]) {
      expect(naesteSkridtTekst(kilde)).toContain(eksportVejForKilde(kilde).vej);
    }
  });
});
