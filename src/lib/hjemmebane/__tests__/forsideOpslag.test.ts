import { describe, expect, it } from "vitest";
import {
  ANTAL_RAEKKER,
  foersteBilledsti,
  opslagMetaLinje,
  vaelgForsideOpslag,
} from "@/lib/hjemmebane/forsideOpslag";

const t = (id: string, created_at: string) => ({ id, created_at });

describe("vaelgForsideOpslag — det nyeste får kortet, de to næste bliver rækker", () => {
  it("tom liste: intet fremhævet, ingen rækker", () => {
    expect(vaelgForsideOpslag([])).toEqual({ fremhaevet: null, resten: [] });
  });

  it("ét opslag: kortet, ingen rækker", () => {
    const a = t("a", "2026-09-03T10:00:00Z");
    expect(vaelgForsideOpslag([a])).toEqual({ fremhaevet: a, resten: [] });
  });

  it("nyeste = senest OPRETTET, ikke feedets første (fastgjort/seneste aktivitet)", () => {
    const fastgjort = t("gammel-fastgjort", "2026-08-11T08:00:00Z");
    const aktiv = t("gammel-med-nyt-svar", "2026-08-20T08:00:00Z");
    const ny = t("ny", "2026-09-03T09:00:00Z");
    const ud = vaelgForsideOpslag([fastgjort, aktiv, ny]);
    expect(ud.fremhaevet).toBe(ny);
    // Resten i feedets egen orden, uden det fremhævede.
    expect(ud.resten.map((x) => x.id)).toEqual(["gammel-fastgjort", "gammel-med-nyt-svar"]);
  });

  it("højst to rækker under kortet — tre synlige i alt, som før", () => {
    const liste = [
      t("a", "2026-09-01T00:00:00Z"),
      t("b", "2026-09-02T00:00:00Z"),
      t("c", "2026-09-03T00:00:00Z"),
      t("d", "2026-08-30T00:00:00Z"),
      t("e", "2026-08-29T00:00:00Z"),
    ];
    const ud = vaelgForsideOpslag(liste);
    expect(ud.fremhaevet?.id).toBe("c");
    expect(ud.resten.map((x) => x.id)).toEqual(["a", "b"]);
    expect(ANTAL_RAEKKER).toBe(2);
  });

  it("ved samme tidsstempel vinder den der står først i feedet", () => {
    const a = t("a", "2026-09-03T09:00:00Z");
    const b = t("b", "2026-09-03T09:00:00Z");
    expect(vaelgForsideOpslag([a, b]).fremhaevet).toBe(a);
    expect(vaelgForsideOpslag([b, a]).fremhaevet).toBe(b);
  });

  it("ændrer ikke listen den får", () => {
    const liste = [t("a", "2026-09-01T00:00:00Z"), t("b", "2026-09-02T00:00:00Z")];
    const kopi = [...liste];
    vaelgForsideOpslag(liste);
    expect(liste).toEqual(kopi);
  });
});

describe("foersteBilledsti — første hvidlistede billede i dokumentet", () => {
  const sti = "3f2504e0-4f89-11d3-9a0c-0305e82c3301/8a1b2c3d-0000-4000-8000-000000000000.jpg";
  const doc = (content: unknown[]) => ({ type: "doc", content });
  const p = (tekst: string) => ({ type: "paragraph", content: [{ type: "text", text: tekst }] });
  const img = (path: string) => ({ type: "image", attrs: { path, alt: "" } });

  it("null når der ikke er et billede, eller dokumentet ikke er et dokument", () => {
    expect(foersteBilledsti(doc([p("Hej")]))).toBeNull();
    expect(foersteBilledsti(null)).toBeNull();
    expect(foersteBilledsti("ikke json")).toBeNull();
    expect(foersteBilledsti({ type: "paragraph" })).toBeNull();
  });

  it("finder billedet på rodniveau — det første, når der er flere", () => {
    const anden = "3f2504e0-4f89-11d3-9a0c-0305e82c3301/anden.png";
    expect(foersteBilledsti(doc([p("Tekst"), img(sti), img(anden)]))).toBe(sti);
  });

  it("finder et billede nede i et blockquote og i et listItem", () => {
    expect(foersteBilledsti(doc([{ type: "blockquote", content: [p("Citat"), img(sti)] }]))).toBe(sti);
    expect(
      foersteBilledsti(
        doc([{ type: "bulletList", content: [{ type: "listItem", content: [p("Punkt"), img(sti)] }] }]),
      ),
    ).toBe(sti);
  });

  it("kasserer stier motoren ikke hvidlister — URL, traversal, ukendt endelse", () => {
    expect(foersteBilledsti(doc([img("https://evil.example/x.jpg")]))).toBeNull();
    expect(foersteBilledsti(doc([img("../../x.jpg")]))).toBeNull();
    expect(foersteBilledsti(doc([img("3f2504e0-4f89-11d3-9a0c-0305e82c3301/x.svg")]))).toBeNull();
  });

  it("et billede inde i et afsnit er ulovlig plads og tæller ikke", () => {
    expect(foersteBilledsti(doc([{ type: "paragraph", content: [img(sti)] }]))).toBeNull();
  });
});

describe("opslagMetaLinje — feedets ord", () => {
  it("svar er ens i ental og flertal, reaktion bøjes", () => {
    expect(opslagMetaLinje(1, 1, "I dag")).toBe("1 svar · 1 reaktion · I dag");
    expect(opslagMetaLinje(3, 2, "I går")).toBe("3 svar · 2 reaktioner · I går");
    expect(opslagMetaLinje(0, 0, "For 4 dage siden")).toBe("0 svar · 0 reaktioner · For 4 dage siden");
  });
});
