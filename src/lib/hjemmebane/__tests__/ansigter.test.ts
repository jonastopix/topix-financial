import { describe, expect, it } from "vitest";
import {
  afsender,
  AKTIVE_MAKS,
  aktiveMedlemmer,
  aktiveTekst,
  fornavn,
  raadgiverAnsigt,
  raadgiverOpslag,
  synligeMedlemmer,
} from "@/lib/hjemmebane/ansigter";

/* Ansigterne (forside PR 4, 17/9 — Jonas «A» til valg 6): rådgiverens
   ansigt kun ved rådgiverens skridt med kendt proposed_by; AI får intet;
   de seneste aktive medlemmer fra feedet, kun Netværkets, højst 6. */

const raadgivere = raadgiverOpslag([
  { user_id: "morten", full_name: "Morten Munk", avatar_url: "https://x/morten.jpg" },
  { user_id: "jonas", full_name: "Jonas Herlev", avatar_url: null },
  { user_id: null, full_name: "Ingen id", avatar_url: null },
  { user_id: "navnloes", full_name: "  ", avatar_url: "https://x/n.jpg" },
]);

describe("raadgiverAnsigt — kun rådgiverens skridt med kendt proposed_by", () => {
  it("rådgiverforslag fra Morten → «Fra Morten» med portræt", () => {
    expect(raadgiverAnsigt({ source_type: "advisor", proposed_by: "morten" }, raadgivere)).toEqual({
      userId: "morten", navn: "Morten Munk", avatarUrl: "https://x/morten.jpg", linje: "Fra Morten",
    });
  });
  it("rådgiver uden portræt → ansigt med avatarUrl null (initialen tegnes i fladen)", () => {
    expect(raadgiverAnsigt({ source_type: "advisor", proposed_by: "jonas" }, raadgivere)).toMatchObject({ navn: "Jonas Herlev", avatarUrl: null, linje: "Fra Jonas" });
  });
  it("AI-forslag og refleksion → intet ansigt, også med et proposed_by", () => {
    expect(raadgiverAnsigt({ source_type: "ai_weekly", proposed_by: "morten" }, raadgivere)).toBeNull();
    expect(raadgiverAnsigt({ source_type: "agent", proposed_by: null }, raadgivere)).toBeNull();
    expect(raadgiverAnsigt({ source_type: "reflection", proposed_by: "morten" }, raadgivere)).toBeNull();
  });
  it("uden proposed_by, ukendt proposed_by, eller rådgiver uden navn → null (aldrig et gæt)", () => {
    expect(raadgiverAnsigt({ source_type: "advisor", proposed_by: null }, raadgivere)).toBeNull();
    expect(raadgiverAnsigt({ source_type: "advisor" }, raadgivere)).toBeNull();
    expect(raadgiverAnsigt({ source_type: "advisor", proposed_by: "ukendt" }, raadgivere)).toBeNull();
    expect(raadgiverAnsigt({ source_type: "advisor", proposed_by: "navnloes" }, raadgivere)).toBeNull();
  });
  it("raadgiverOpslag springer rækker uden user_id over og trimmer", () => {
    expect(raadgivere.has("morten")).toBe(true);
    expect(raadgivere.size).toBe(3);
    expect(raadgivere.get("navnloes")?.full_name).toBeNull();
  });
  it("fornavn", () => {
    expect(fornavn("Morten Munk")).toBe("Morten");
    expect(fornavn("  Lisbeth   Gade ")).toBe("Lisbeth");
    expect(fornavn("")).toBeNull();
    expect(fornavn(null)).toBeNull();
  });
});

describe("afsender — pushets afsender fra samme opslag", () => {
  it("kendt id → navn + portræt; ukendt/null → null", () => {
    expect(afsender("morten", raadgivere)).toEqual({ full_name: "Morten Munk", avatar_url: "https://x/morten.jpg" });
    expect(afsender("ukendt", raadgivere)).toBeNull();
    expect(afsender(null, raadgivere)).toBeNull();
  });
});

const NU = new Date("2026-09-17T12:00:00Z");
const t = (id: string, dageSiden: number, over: Partial<{ forfatter_navn: string | null; forfatter_avatar_url: string | null }> = {}) => ({
  forfatter_id: id,
  forfatter_navn: over.forfatter_navn === undefined ? `Navn ${id}` : over.forfatter_navn,
  forfatter_avatar_url: over.forfatter_avatar_url === undefined ? null : over.forfatter_avatar_url,
  created_at: new Date(NU.getTime() - dageSiden * 86_400_000).toISOString(),
});
const synlige = new Set(["lisbeth", "anders", "mette", "per", "sofie", "kim", "ida", "bo"]);

describe("aktiveMedlemmer — de seneste 7 døgn, kun Netværkets, dublet-frit, højst 6", () => {
  it("forfattere inden for 7 døgn, nyeste først, dubletter samlet; tallet tæller alle", () => {
    const a = aktiveMedlemmer([t("anders", 2), t("lisbeth", 0.5, { forfatter_avatar_url: "https://x/l.jpg" }), t("anders", 6), t("mette", 8)], synlige, NU);
    expect(a.medlemmer.map((m) => m.userId)).toEqual(["lisbeth", "anders"]);
    expect(a.medlemmer[0].avatarUrl).toBe("https://x/l.jpg");
    expect(a.antal).toBe(2);
    expect(a.tekst).toBe("2 medlemmer har skrevet den seneste uge");
  });
  it("kun dem der står i Netværket (vis_i_netvaerk, ingen rådgivere); ikke-synlige tælles ikke", () => {
    const a = aktiveMedlemmer([t("gaest", 1), t("morten", 1), t("lisbeth", 1)], synlige, NU);
    expect(a.medlemmer.map((m) => m.userId)).toEqual(["lisbeth"]);
    expect(a.antal).toBe(1);
    expect(a.tekst).toBe("1 medlem har skrevet den seneste uge");
  });
  it("Netværket ikke hentet (null) → ingen — fail-closed, aldrig «alle indtil videre»", () => {
    expect(aktiveMedlemmer([t("lisbeth", 1)], null, NU)).toEqual({ medlemmer: [], antal: 0, tekst: null });
  });
  it("højst 6 portrætter, men tallet siger 8", () => {
    const a = aktiveMedlemmer([...synlige].map((id, i) => t(id, i * 0.5)), synlige, NU);
    expect(a.medlemmer).toHaveLength(AKTIVE_MAKS);
    expect(a.antal).toBe(8);
    expect(a.tekst).toBe("8 medlemmer har skrevet den seneste uge");
  });
  it("ingen i vinduet → tekst null (rækken vises ikke); ulæseligt tidsstempel springes over", () => {
    expect(aktiveMedlemmer([t("lisbeth", 9)], synlige, NU).tekst).toBeNull();
    expect(aktiveMedlemmer([{ forfatter_id: "lisbeth", forfatter_navn: "L", forfatter_avatar_url: null, created_at: "hest" }], synlige, NU).antal).toBe(0);
    expect(aktiveTekst(0)).toBeNull();
  });
  it("synligeMedlemmer udelader rådgiverne fra Netværkets liste", () => {
    expect(synligeMedlemmer([{ user_id: "a", is_advisor: false }, { user_id: "m", is_advisor: true }])).toEqual(new Set(["a"]));
  });
});
