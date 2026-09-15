/**
 * Præsentationen som onboarding-ritual (11/9, kort 60): skabelonen er et
 * gyldigt Tiptap-dokument bygget af profilens tre felter, og kildeværdien
 * er den migrationen tillader. UDEN OVERSKRIFTER (Jonas 16/9, DE TYVE (18)):
 * felterne står som almindelige afsnit, kun de udfyldte; inspirationen er
 * composerens placeholder og aldrig indhold.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  byggPraesentationsSkabelon,
  KILDE_PRAESENTATION,
  KILDE_PRAESENTATION_LABEL,
  PRAESENTATION_INSPIRATION,
  PRAESENTATION_PARAM,
  PRAESENTATION_STI,
  praesentationsTitel,
} from "@/lib/hjemmebane/praesentation";
import { PROFIL_FELTER } from "@/lib/hjemmebane/netvaerksprofil";
import { parseCommunityDokument } from "@/lib/hjemmebane/communityDokument";

const FULD = {
  navn: "Mette Hansen",
  virksomhed: "Hansen Møbler",
  detLaverVi: "Vi designer møbler til hoteller.",
  detHarJegVaeretIgennem: "Et generationsskifte og en fyringsrunde.",
  detLederJegEfter: "Nogen der har ansat sin første sælger.",
};

/* Værnet: kilde_type-værdien og migrationen skal blive ved med at passe
   sammen — glider én af dem, afviser CHECK'en indsendelsen i prod (23514)
   uden at nogen anden test ville se det. */
describe("kildeværn: 'praesentation' står i begge CHECK'er i migrationen", () => {
  const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260911120000_praesentation_kilde.sql"), "utf8");
  // Kun de udførte ALTER-sætninger — filhovedets FØR-værdier (uden
  // 'praesentation') må ikke kunne give et falsk grønt.
  const udfoert = migration
    .split("\n")
    .filter((linje) => !linje.trimStart().startsWith("--"))
    .join("\n");
  const vaerdiliste = udfoert.split("ADD CONSTRAINT community_traade_kilde_type_check")[1]?.split(";")[0] ?? "";
  const kombination = udfoert.split("ADD CONSTRAINT community_traade_kilde_check")[1]?.split(";")[0] ?? "";

  it("KILDE_PRAESENTATION er præcis strengen 'praesentation'", () => {
    expect(KILDE_PRAESENTATION).toBe("praesentation");
  });
  it("værdilisten: 'praesentation' ved siden af content_item og event", () => {
    expect(vaerdiliste).toContain(`'${KILDE_PRAESENTATION}'::text`);
    expect(vaerdiliste).toContain("'content_item'::text");
    expect(vaerdiliste).toContain("'event'::text");
  });
  it("kombinationen: grenen kilde_type = 'praesentation' uden kilde-id'er", () => {
    expect(kombination).toContain(`(kilde_type = '${KILDE_PRAESENTATION}'::text) AND (kilde_item_id IS NULL) AND (kilde_event_id IS NULL)`);
  });
  it("de to andre grene står ordret som prod (målt 11/9)", () => {
    expect(kombination).toContain("(kilde_type = 'content_item'::text) AND (kilde_item_id IS NOT NULL) AND (kilde_event_id IS NULL)");
    expect(kombination).toContain("(kilde_type = 'event'::text) AND (kilde_event_id IS NOT NULL) AND (kilde_item_id IS NULL)");
    expect(kombination).toContain("(kilde_type IS NULL) AND (kilde_item_id IS NULL) AND (kilde_event_id IS NULL)");
  });
});

describe("konstanterne fladen og tjeklisten deler", () => {
  it("tagget, parameteren og stien", () => {
    expect(KILDE_PRAESENTATION_LABEL).toBe("Præsentation");
    expect(PRAESENTATION_PARAM).toBe("praesentation");
    expect(PRAESENTATION_STI).toBe("/community?praesentation=1");
  });
});

describe("titlen: «Hej, jeg er {navn} fra {virksomhed}»", () => {
  it("begge sat", () => {
    expect(praesentationsTitel("Mette Hansen", "Hansen Møbler")).toBe("Hej, jeg er Mette Hansen fra Hansen Møbler");
  });
  it("trimmes", () => {
    expect(praesentationsTitel("  Mette ", " Hansen Møbler  ")).toBe("Hej, jeg er Mette fra Hansen Møbler");
  });
  it("uden virksomhed: intet hængende «fra»", () => {
    expect(praesentationsTitel("Mette", null)).toBe("Hej, jeg er Mette");
    expect(praesentationsTitel("Mette", "   ")).toBe("Hej, jeg er Mette");
  });
  it("uden navn / uden begge", () => {
    expect(praesentationsTitel(null, "Hansen Møbler")).toBe("Hej fra Hansen Møbler");
    expect(praesentationsTitel(undefined, undefined)).toBe("Hej");
  });
});

describe("byggPraesentationsSkabelon — dokumentet (uden overskrifter, 16/9)", () => {
  const afsnitTekster = (indholdJson: ReturnType<typeof byggPraesentationsSkabelon>["indholdJson"]) =>
    indholdJson.content.map((n) => (n.content ?? []).map((c) => c.text).join(""));

  it("roden er type «doc» (opret_community_traad afviser alt andet)", () => {
    const { indholdJson } = byggPraesentationsSkabelon(FULD);
    expect(indholdJson.type).toBe("doc");
    expect(Array.isArray(indholdJson.content)).toBe(true);
  });

  it("INGEN heading-noder i nogen tilstand — Jonas 16/9: overskrifter sætter tingene i bås", () => {
    const tilstande = [
      FULD,
      { ...FULD, detLaverVi: null },
      { ...FULD, detHarJegVaeretIgennem: null, detLederJegEfter: null },
      { navn: "M", virksomhed: "V", detLaverVi: null, detHarJegVaeretIgennem: null, detLederJegEfter: null },
      { navn: null, virksomhed: null, detLaverVi: "   ", detHarJegVaeretIgennem: "", detLederJegEfter: undefined },
    ];
    for (const t of tilstande) {
      const { indholdJson } = byggPraesentationsSkabelon(t);
      expect(indholdJson.content.every((n) => n.type === "paragraph")).toBe(true);
      expect(JSON.stringify(indholdJson)).not.toContain("heading");
      for (const label of PROFIL_FELTER.map((f) => f.label)) expect(JSON.stringify(indholdJson)).not.toContain(label);
    }
  });

  it("tre udfyldte felter → tre afsnit i profilens rækkefølge (PROFIL_FELTER), ordret tekst, ingen etiketter", () => {
    const { indholdJson } = byggPraesentationsSkabelon(FULD);
    expect(indholdJson.content).toHaveLength(3);
    expect(afsnitTekster(indholdJson)).toEqual([FULD.detLaverVi, FULD.detHarJegVaeretIgennem, FULD.detLederJegEfter]);
    expect(PROFIL_FELTER.map((f) => f.noegle)).toEqual(["det_laver_vi", "vaeret_igennem", "leder_efter"]);
    expect(indholdJson.content[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: FULD.detLaverVi }] });
  });

  it("delvist udfyldt → kun de ikke-tomme, i samme rækkefølge", () => {
    const kunMidt = byggPraesentationsSkabelon({ ...FULD, detLaverVi: null, detLederJegEfter: "   " });
    expect(afsnitTekster(kunMidt.indholdJson)).toEqual([FULD.detHarJegVaeretIgennem]);
    const foersteOgSidste = byggPraesentationsSkabelon({ ...FULD, detHarJegVaeretIgennem: "" });
    expect(afsnitTekster(foersteOgSidste.indholdJson)).toEqual([FULD.detLaverVi, FULD.detLederJegEfter]);
  });

  it("ingen udfyldt → ét tomt afsnit (en linje at skrive i); mellemrum tæller som tomt", () => {
    for (const t of [
      { navn: "M", virksomhed: "V", detLaverVi: null, detHarJegVaeretIgennem: null, detLederJegEfter: null },
      { navn: "M", virksomhed: "V", detLaverVi: "   ", detHarJegVaeretIgennem: "", detLederJegEfter: undefined },
    ]) {
      const { indholdJson } = byggPraesentationsSkabelon(t);
      expect(indholdJson.content).toEqual([{ type: "paragraph" }]);
    }
  });

  it("svarene trimmes", () => {
    const { indholdJson } = byggPraesentationsSkabelon({ ...FULD, detLaverVi: "  Møbler.  " });
    expect(indholdJson.content[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Møbler." }] });
  });

  it("titel og dokument følges ad — titlens fire former er uændrede", () => {
    expect(byggPraesentationsSkabelon(FULD).titel).toBe("Hej, jeg er Mette Hansen fra Hansen Møbler");
    expect(byggPraesentationsSkabelon({ ...FULD, virksomhed: null }).titel).toBe("Hej, jeg er Mette Hansen");
    expect(byggPraesentationsSkabelon({ ...FULD, navn: null }).titel).toBe("Hej fra Hansen Møbler");
    expect(byggPraesentationsSkabelon({ ...FULD, navn: null, virksomhed: null }).titel).toBe("Hej");
  });

  it("inspirationslinjen er ordret Jonas' valg A — og står ALDRIG i indholdJson (den er placeholder, ikke indhold)", () => {
    expect(PRAESENTATION_INSPIRATION).toBe(
      "Fortæl med dine egne ord, hvem du er — fx hvad I laver, hvad der fylder lige nu, eller hvad du gerne vil have ud af netværket.",
    );
    for (const t of [FULD, { navn: "M", virksomhed: "V", detLaverVi: null, detHarJegVaeretIgennem: null, detLederJegEfter: null }]) {
      const s = byggPraesentationsSkabelon(t);
      expect(JSON.stringify(s.indholdJson)).not.toContain(PRAESENTATION_INSPIRATION);
      expect(JSON.stringify(s.indholdJson)).not.toContain("Fortæl med dine egne ord");
      expect(s.titel).not.toContain("Fortæl med dine egne ord");
    }
  });
});

describe("byggPraesentationsSkabelon — parseren accepterer hver node (intet falder væk ved visning)", () => {
  it("fuldt udfyldt: tre afsnit overlever parseCommunityDokument uændret", () => {
    const { indholdJson } = byggPraesentationsSkabelon(FULD);
    const noder = parseCommunityDokument(indholdJson);
    expect(noder).toHaveLength(3);
    expect(noder.map((n) => n.type)).toEqual(["paragraph", "paragraph", "paragraph"]);
    const tekster = noder.map((n) => (n.type === "heading" || n.type === "paragraph" ? n.content.map((c) => (c.type === "text" ? c.text : "")).join("") : ""));
    expect(tekster).toEqual([FULD.detLaverVi, FULD.detHarJegVaeretIgennem, FULD.detLederJegEfter]);
  });

  it("ingen udfyldt: det tomme afsnit fjernes stille ved visning (parserens kontrakt) — og tomt kan ikke sendes, så det når aldrig feedet", () => {
    const { indholdJson } = byggPraesentationsSkabelon({ navn: "M", virksomhed: "V", detLaverVi: null, detHarJegVaeretIgennem: null, detLederJegEfter: null });
    expect(parseCommunityDokument(indholdJson)).toEqual([]);
  });
});
