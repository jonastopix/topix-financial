/**
 * Præsentationen som onboarding-ritual (11/9, kort 60): skabelonen er et
 * gyldigt Tiptap-dokument bygget af profilens tre felter, og kildeværdien
 * er den migrationen tillader.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  byggPraesentationsSkabelon,
  KILDE_PRAESENTATION,
  KILDE_PRAESENTATION_LABEL,
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

describe("byggPraesentationsSkabelon — dokumentet", () => {
  it("roden er type «doc» (opret_community_traad afviser alt andet)", () => {
    const { indholdJson } = byggPraesentationsSkabelon(FULD);
    expect(indholdJson.type).toBe("doc");
    expect(Array.isArray(indholdJson.content)).toBe(true);
  });

  it("de tre spørgsmål med etiketterne fra netvaerksprofil.ts, i profilens rækkefølge, hver med svaret under", () => {
    const { indholdJson } = byggPraesentationsSkabelon(FULD);
    expect(indholdJson.content).toHaveLength(6);
    const overskrifter = indholdJson.content.filter((n) => n.type === "heading");
    expect(overskrifter.map((n) => n.content[0].text)).toEqual(PROFIL_FELTER.map((f) => f.label));
    expect(overskrifter.map((n) => n.content[0].text)).toEqual(["Det laver vi", "Det har jeg været igennem", "Det leder jeg efter"]);
    expect(indholdJson.content[1]).toEqual({ type: "paragraph", content: [{ type: "text", text: FULD.detLaverVi }] });
    expect(indholdJson.content[3]).toEqual({ type: "paragraph", content: [{ type: "text", text: FULD.detHarJegVaeretIgennem }] });
    expect(indholdJson.content[5]).toEqual({ type: "paragraph", content: [{ type: "text", text: FULD.detLederJegEfter }] });
  });

  it("overskrifterne er level 2 — det ene niveau composeren og parseren kender", () => {
    const { indholdJson } = byggPraesentationsSkabelon(FULD);
    for (const n of indholdJson.content) {
      if (n.type === "heading") expect(n.attrs).toEqual({ level: 2 });
    }
  });

  it("tomt felt → et tomt afsnit under spørgsmålet (en linje at skrive i); mellemrum tæller som tomt", () => {
    const { indholdJson } = byggPraesentationsSkabelon({ ...FULD, detLaverVi: null, detLederJegEfter: "   " });
    expect(indholdJson.content[1]).toEqual({ type: "paragraph" });
    expect(indholdJson.content[3]).toEqual({ type: "paragraph", content: [{ type: "text", text: FULD.detHarJegVaeretIgennem }] });
    expect(indholdJson.content[5]).toEqual({ type: "paragraph" });
  });

  it("svarene trimmes", () => {
    const { indholdJson } = byggPraesentationsSkabelon({ ...FULD, detLaverVi: "  Møbler.  " });
    expect(indholdJson.content[1]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Møbler." }] });
  });

  it("titel og dokument følges ad", () => {
    const s = byggPraesentationsSkabelon(FULD);
    expect(s.titel).toBe("Hej, jeg er Mette Hansen fra Hansen Møbler");
  });
});

describe("byggPraesentationsSkabelon — parseren accepterer hver node (intet falder væk ved visning)", () => {
  it("fuldt udfyldt: tre overskrifter og tre afsnit overlever parseCommunityDokument uændret", () => {
    const { indholdJson } = byggPraesentationsSkabelon(FULD);
    const noder = parseCommunityDokument(indholdJson);
    expect(noder).toHaveLength(6);
    expect(noder.map((n) => n.type)).toEqual(["heading", "paragraph", "heading", "paragraph", "heading", "paragraph"]);
    const tekster = noder.map((n) => (n.type === "heading" || n.type === "paragraph" ? n.content.map((c) => (c.type === "text" ? c.text : "")).join("") : ""));
    expect(tekster).toEqual([
      "Det laver vi", FULD.detLaverVi,
      "Det har jeg været igennem", FULD.detHarJegVaeretIgennem,
      "Det leder jeg efter", FULD.detLederJegEfter,
    ]);
  });

  it("tomme felter: overskriften står, det tomme afsnit fjernes stille ved visning (parserens kontrakt)", () => {
    const { indholdJson } = byggPraesentationsSkabelon({ navn: "M", virksomhed: "V", detLaverVi: null, detHarJegVaeretIgennem: null, detLederJegEfter: null });
    const noder = parseCommunityDokument(indholdJson);
    expect(noder.map((n) => n.type)).toEqual(["heading", "heading", "heading"]);
  });
});
