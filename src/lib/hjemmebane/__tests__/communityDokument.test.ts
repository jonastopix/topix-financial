import { describe, expect, it } from "vitest";
import { MAKS_DYBDE, parseCommunityDokument } from "../communityDokument";
import type { CommunityNode } from "../communityDokument";

/** Hjælper: et doc-objekt som Tiptap serialiserer det. */
const doc = (content: unknown[]) => ({ type: "doc", content });

const tekst = (text: string, marks?: unknown[]) =>
  marks === undefined ? { type: "text", text } : { type: "text", text, marks };

describe("parseCommunityDokument — rigtigt dokument", () => {
  it("overskrift, afsnit, fed tekst, punktopstilling og citat → korrekt træ", () => {
    const input = doc([
      { type: "heading", attrs: { level: 2 }, content: [tekst("Kvartalstal")] },
      {
        type: "paragraph",
        content: [
          tekst("Omsætningen er "),
          tekst("stærkt", [{ type: "bold" }]),
          tekst(" stigende."),
        ],
      },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [tekst("Punkt et")] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [tekst("Punkt to")] }] },
        ],
      },
      { type: "blockquote", content: [{ type: "paragraph", content: [tekst("Et citat")] }] },
    ]);

    const forventet: CommunityNode[] = [
      { type: "heading", level: 2, content: [{ type: "text", text: "Kvartalstal", marks: [] }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Omsætningen er ", marks: [] },
          { type: "text", text: "stærkt", marks: [{ type: "bold" }] },
          { type: "text", text: " stigende.", marks: [] },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Punkt et", marks: [] }] },
            ],
          },
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Punkt to", marks: [] }] },
            ],
          },
        ],
      },
      {
        type: "blockquote",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Et citat", marks: [] }] },
        ],
      },
    ];

    expect(parseCommunityDokument(input)).toEqual(forventet);
  });
});

describe("parseCommunityDokument — link-hærdning", () => {
  it("javascript:alert(1) som href → link fjernet, tekst bevaret", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [tekst("klik her", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "klik her", marks: [] }] },
    ]);
  });

  it('" JaVaScRiPt:alert(1) " med mellemrum og blandet case → også fjernet', () => {
    const input = doc([
      {
        type: "paragraph",
        content: [
          tekst("klik her", [{ type: "link", attrs: { href: " JaVaScRiPt:alert(1) " } }]),
        ],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "klik her", marks: [] }] },
    ]);
  });

  it("https-link består med href og evt. andre gyldige marks", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [
          tekst("Boardroom", [
            { type: "bold" },
            { type: "link", attrs: { href: "https://theboardroom.dk" } },
          ]),
        ],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Boardroom",
            marks: [{ type: "bold" }, { type: "link", href: "https://theboardroom.dk" }],
          },
        ],
      },
    ]);
  });

  it("mailto:-link består", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [tekst("skriv", [{ type: "link", attrs: { href: "mailto:jonas@topix.dk" } }])],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "skriv", marks: [{ type: "link", href: "mailto:jonas@topix.dk" }] },
        ],
      },
    ]);
  });
});

describe("parseCommunityDokument — billed-sti-hærdning", () => {
  const GYLDIG_STI = "3f2504e0-4f89-11d3-9a0c-0305e82c3301/foto-01.jpg";

  it("gyldig sti → bevaret med path og alt", () => {
    const input = doc([{ type: "image", attrs: { path: GYLDIG_STI, alt: "Foto" } }]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "image", path: GYLDIG_STI, alt: "Foto" },
    ]);
  });

  it("gyldig sti med .PNG i store bogstaver → bevaret", () => {
    const sti = "3f2504e0-4f89-11d3-9a0c-0305e82c3301/GRAF.PNG";
    const input = doc([{ type: "image", attrs: { path: sti, alt: "" } }]);
    expect(parseCommunityDokument(input)).toEqual([{ type: "image", path: sti, alt: "" }]);
  });

  it.each([
    ["https-URL som path (indeholder ':')", "https://cdn.example.dk/x.png"],
    ["data-URL som path", "data:text/html,<script>alert(1)</script>"],
    ["path-traversal", "../../etc/passwd"],
    ["absolut sti", "/absolut/sti.jpg"],
    ["dobbelt skråstreg", "3f2504e0-4f89-11d3-9a0c-0305e82c3301//dobbelt.jpg"],
    ["forkert endelse", "3f2504e0-4f89-11d3-9a0c-0305e82c3301/fil.txt"],
    ["ikke et uuid som mappe", "ikke-et-uuid/fil.jpg"],
    ["mellemrum i filnavnet", "3f2504e0-4f89-11d3-9a0c-0305e82c3301/mit foto.jpg"],
  ])("%s → billedet fjernet", (_navn, sti) => {
    const input = doc([
      { type: "paragraph", content: [tekst("før")] },
      { type: "image", attrs: { path: sti, alt: "x" } },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "før", marks: [] }] },
    ]);
  });

  it("image-node uden attrs → fjernet", () => {
    const input = doc([
      { type: "image" },
      { type: "paragraph", content: [tekst("beholdes")] },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "beholdes", marks: [] }] },
    ]);
  });
});

describe("parseCommunityDokument — ukendt fjernes stille", () => {
  it("ukendt nodetype midt i dokumentet → fjernet, resten bevaret", () => {
    const input = doc([
      { type: "paragraph", content: [tekst("før")] },
      { type: "iframeEmbed", attrs: { src: "https://evil.example" } },
      { type: "paragraph", content: [tekst("efter")] },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "før", marks: [] }] },
      { type: "paragraph", content: [{ type: "text", text: "efter", marks: [] }] },
    ]);
  });

  it("ukendt mark på text → mark fjernet, tekst bevaret", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [tekst("farvet", [{ type: "textStyle", attrs: { color: "#f00" } }])],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "farvet", marks: [] }] },
    ]);
  });
});

describe("parseCommunityDokument — heading-level tvinges", () => {
  it("level 1 og level 3 → begge tvunget til 2", () => {
    const input = doc([
      { type: "heading", attrs: { level: 1 }, content: [tekst("Stor")] },
      { type: "heading", attrs: { level: 3 }, content: [tekst("Lille")] },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "heading", level: 2, content: [{ type: "text", text: "Stor", marks: [] }] },
      { type: "heading", level: 2, content: [{ type: "text", text: "Lille", marks: [] }] },
    ]);
  });
});

describe("parseCommunityDokument — ugyldigt input giver [], aldrig exception", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ['"streng"', "streng"],
    ["42", 42],
    ["[]", []],
    ["{}", {}],
  ])("%s → []", (_navn, input) => {
    expect(parseCommunityDokument(input)).toEqual([]);
  });

  it("objekt med forkert type → []", () => {
    expect(parseCommunityDokument({ type: "paragraph", content: [] })).toEqual([]);
  });

  it("doc uden content-array → []", () => {
    expect(parseCommunityDokument({ type: "doc" })).toEqual([]);
    expect(parseCommunityDokument({ type: "doc", content: "ikke et array" })).toEqual([]);
  });
});

describe("parseCommunityDokument — nesting og tomme noder", () => {
  it("dybt nested punktopstilling → korrekt træ, rigtig rækkefølge", () => {
    const input = doc([
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [tekst("Ydre")] },
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [
                      { type: "paragraph", content: [tekst("Indre A")] },
                      {
                        type: "orderedList",
                        content: [
                          {
                            type: "listItem",
                            content: [{ type: "paragraph", content: [tekst("Inderst")] }],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "listItem",
                    content: [{ type: "paragraph", content: [tekst("Indre B")] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Ydre", marks: [] }] },
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [
                      { type: "paragraph", content: [{ type: "text", text: "Indre A", marks: [] }] },
                      {
                        type: "orderedList",
                        content: [
                          {
                            type: "listItem",
                            content: [
                              {
                                type: "paragraph",
                                content: [{ type: "text", text: "Inderst", marks: [] }],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "listItem",
                    content: [
                      { type: "paragraph", content: [{ type: "text", text: "Indre B", marks: [] }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("afsnit der bliver tomt efter filtrering → fjernet helt", () => {
    const input = doc([
      { type: "paragraph", content: [{ type: "mention", attrs: { id: "u1" } }] },
      { type: "paragraph", content: [tekst("beholdes")] },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "beholdes", marks: [] }] },
    ]);
  });

  it("liste hvis eneste listItem ender tomt → hele listen fjernet", () => {
    const input = doc([
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "video" }] }] },
        ],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([]);
  });
});

describe("parseCommunityDokument — fil-noder", () => {
  const GYLDIG_FIL_STI = "3f2504e0-4f89-11d3-9a0c-0305e82c3301/budget-2026.pdf";

  it("gyldig fil-node med .pdf → bevaret med path og navn", () => {
    const input = doc([
      { type: "fil", attrs: { path: GYLDIG_FIL_STI, navn: "Budget 2026.pdf" } },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "fil", path: GYLDIG_FIL_STI, navn: "Budget 2026.pdf" },
    ]);
  });

  it("gyldig .XLSX i store bogstaver → bevaret", () => {
    const sti = "3f2504e0-4f89-11d3-9a0c-0305e82c3301/TAL.XLSX";
    const input = doc([{ type: "fil", attrs: { path: sti, navn: "Tal" } }]);
    expect(parseCommunityDokument(input)).toEqual([{ type: "fil", path: sti, navn: "Tal" }]);
  });

  it.each([
    [".svg som endelse", "3f2504e0-4f89-11d3-9a0c-0305e82c3301/grafik.svg"],
    [".exe som endelse", "3f2504e0-4f89-11d3-9a0c-0305e82c3301/virus.exe"],
  ])("%s → fjernet", (_navn, sti) => {
    const input = doc([
      { type: "paragraph", content: [tekst("før")] },
      { type: "fil", attrs: { path: sti, navn: "Fil" } },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "før", marks: [] }] },
    ]);
  });

  it("gyldig sti men manglende navn → fjernet", () => {
    const input = doc([{ type: "fil", attrs: { path: GYLDIG_FIL_STI } }]);
    expect(parseCommunityDokument(input)).toEqual([]);
  });

  it("gyldig sti men navn som tom streng → fjernet", () => {
    const input = doc([{ type: "fil", attrs: { path: GYLDIG_FIL_STI, navn: "" } }]);
    expect(parseCommunityDokument(input)).toEqual([]);
  });

  it("navn med kontroltegn → kontroltegnet fjernet, resten bevaret", () => {
    const input = doc([
      { type: "fil", attrs: { path: GYLDIG_FIL_STI, navn: "\u0000rapport.pdf" } },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "fil", path: GYLDIG_FIL_STI, navn: "rapport.pdf" },
    ]);
  });

  it("navn på 300 tegn → afkortet til 120", () => {
    const input = doc([
      { type: "fil", attrs: { path: GYLDIG_FIL_STI, navn: "a".repeat(300) } },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "fil", path: GYLDIG_FIL_STI, navn: "a".repeat(120) },
    ]);
  });

  it("fil inde i en paragraph → fjernet (inline tillader kun text/hardBreak)", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [tekst("tekst"), { type: "fil", attrs: { path: GYLDIG_FIL_STI, navn: "F" } }],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "tekst", marks: [] }] },
    ]);
  });

  it("fil inde i et listItem → bevaret (blok-kontekst)", () => {
    const input = doc([
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "fil", attrs: { path: GYLDIG_FIL_STI, navn: "Bilag" } }],
          },
        ],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "fil", path: GYLDIG_FIL_STI, navn: "Bilag" }],
          },
        ],
      },
    ]);
  });
});

describe("parseCommunityDokument — naevnelse-noder", () => {
  const BRUGER_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

  it("gyldig nævnelse i et afsnit → bevaret med userId og navn", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [
          tekst("Spørg "),
          { type: "naevnelse", attrs: { userId: BRUGER_ID, navn: "Mette" } },
        ],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Spørg ", marks: [] },
          { type: "naevnelse", userId: BRUGER_ID, navn: "Mette" },
        ],
      },
    ]);
  });

  it("attrs.user_id i stedet for userId → bevaret", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [{ type: "naevnelse", attrs: { user_id: BRUGER_ID, navn: "Mette" } }],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "paragraph",
        content: [{ type: "naevnelse", userId: BRUGER_ID, navn: "Mette" }],
      },
    ]);
  });

  it("ugyldigt uuid → fjernet", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [
          tekst("før"),
          { type: "naevnelse", attrs: { userId: "ikke-et-uuid", navn: "Mette" } },
        ],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "før", marks: [] }] },
    ]);
  });

  it("manglende navn → fjernet", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [tekst("før"), { type: "naevnelse", attrs: { userId: BRUGER_ID } }],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "før", marks: [] }] },
    ]);
  });

  it("navn med kontroltegn → renset", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [{ type: "naevnelse", attrs: { userId: BRUGER_ID, navn: "\u0000Mette" } }],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "paragraph",
        content: [{ type: "naevnelse", userId: BRUGER_ID, navn: "Mette" }],
      },
    ]);
  });

  it("nævnelse som direkte barn af roden → fjernet (blok tillader den ikke)", () => {
    const input = doc([
      { type: "naevnelse", attrs: { userId: BRUGER_ID, navn: "Mette" } },
      { type: "paragraph", content: [tekst("beholdes")] },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "beholdes", marks: [] }] },
    ]);
  });

  it("nævnelse i en overskrift → bevaret (inline-kontekst)", () => {
    const input = doc([
      {
        type: "heading",
        attrs: { level: 2 },
        content: [
          tekst("Tak til "),
          { type: "naevnelse", attrs: { userId: BRUGER_ID, navn: "Mette" } },
        ],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "heading",
        level: 2,
        content: [
          { type: "text", text: "Tak til ", marks: [] },
          { type: "naevnelse", userId: BRUGER_ID, navn: "Mette" },
        ],
      },
    ]);
  });

  it("afsnit med KUN en nævnelse → afsnittet bevares (noden er ikke tom)", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [{ type: "naevnelse", attrs: { userId: BRUGER_ID, navn: "Mette" } }],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "paragraph",
        content: [{ type: "naevnelse", userId: BRUGER_ID, navn: "Mette" }],
      },
    ]);
  });
});

describe("parseCommunityDokument — henvisning-noder", () => {
  const GYLDIG = { area: "classroom", slug: "kom-godt-i-gang", titel: "Kom godt i gang" };

  it("gyldig henvisning i et afsnit → bevaret med area, slug og titel", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [tekst("Se "), { type: "henvisning", attrs: GYLDIG }],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Se ", marks: [] },
          { type: "henvisning", ...GYLDIG },
        ],
      },
    ]);
  });

  it.each([
    ['area "push"', { ...GYLDIG, area: "push" }],
    ['area "findes-ikke"', { ...GYLDIG, area: "findes-ikke" }],
    ["slug med skråstreg", { ...GYLDIG, slug: "../hemmelig" }],
    ["slug med mellemrum", { ...GYLDIG, slug: "kom godt i gang" }],
    ["slug med store bogstaver", { ...GYLDIG, slug: "Kom-Godt-I-Gang" }],
    ["manglende titel", { area: GYLDIG.area, slug: GYLDIG.slug }],
  ])("%s → fjernet", (_navn, attrs) => {
    const input = doc([
      { type: "paragraph", content: [tekst("før"), { type: "henvisning", attrs }] },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "før", marks: [] }] },
    ]);
  });

  it("henvisning som direkte barn af roden → fjernet (blok tillader den ikke)", () => {
    const input = doc([
      { type: "henvisning", attrs: GYLDIG },
      { type: "paragraph", content: [tekst("beholdes")] },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "beholdes", marks: [] }] },
    ]);
  });

  it("afsnit med KUN en henvisning → afsnittet bevares", () => {
    const input = doc([{ type: "paragraph", content: [{ type: "henvisning", attrs: GYLDIG }] }]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "henvisning", ...GYLDIG }] },
    ]);
  });
});

describe("parseCommunityDokument — kontekstafhængig hvidliste", () => {
  it("listItem som direkte barn af roden → fjernet", () => {
    const input = doc([
      { type: "listItem", content: [{ type: "paragraph", content: [tekst("løsrevet")] }] },
      { type: "paragraph", content: [tekst("beholdes")] },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "beholdes", marks: [] }] },
    ]);
  });

  it("paragraph som direkte barn af bulletList → fjernet, og den tomme liste falder væk", () => {
    const input = doc([
      { type: "bulletList", content: [{ type: "paragraph", content: [tekst("forkert plads")] }] },
      { type: "paragraph", content: [tekst("beholdes")] },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "beholdes", marks: [] }] },
    ]);
  });

  it("bulletList inde i et listItem → bevaret (lovlig nesting)", () => {
    const input = doc([
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [tekst("ydre")] },
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [{ type: "paragraph", content: [tekst("indre")] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "ydre", marks: [] }] },
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [
                      { type: "paragraph", content: [{ type: "text", text: "indre", marks: [] }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("image inde i et blockquote med gyldig sti → bevaret (kontekstreglen holder)", () => {
    const sti = "3f2504e0-4f89-11d3-9a0c-0305e82c3301/citat-billede.webp";
    const input = doc([
      {
        type: "blockquote",
        content: [{ type: "image", attrs: { path: sti, alt: "X" } }],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "blockquote",
        content: [{ type: "image", path: sti, alt: "X" }],
      },
    ]);
  });

  it("image inde i en paragraph → fjernet (inline tillader kun text/hardBreak)", () => {
    const input = doc([
      {
        type: "paragraph",
        content: [
          tekst("tekst"),
          {
            type: "image",
            attrs: { path: "3f2504e0-4f89-11d3-9a0c-0305e82c3301/x.jpg", alt: "X" },
          },
        ],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "tekst", marks: [] }] },
    ]);
  });

  it("heading inde i et listItem → bevaret", () => {
    const input = doc([
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "heading", attrs: { level: 2 }, content: [tekst("Punkt-titel")] }],
          },
        ],
      },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "heading",
                level: 2,
                content: [{ type: "text", text: "Punkt-titel", marks: [] }],
              },
            ],
          },
        ],
      },
    ]);
  });
});

describe("parseCommunityDokument — dybdegrænse", () => {
  it("25 niveauers nesting → returnerer uden at kaste, indhold under niveau 20 er væk", () => {
    /** Blockquote-kæde: lag-i er et blockquote på dybde i med et afsnit og
        det næste lag som indhold. Lovlig struktur hele vejen ned — kun
        dybden fælder de inderste lag. */
    let inderst: unknown = { type: "paragraph", content: [tekst("lag-25")] };
    for (let lag = 24; lag >= 1; lag--) {
      inderst = {
        type: "blockquote",
        content: [
          { type: "paragraph", content: [tekst(`lag-${String(lag).padStart(2, "0")}`)] },
          inderst,
        ],
      };
    }
    const resultat = parseCommunityDokument(doc([inderst]));
    const serialiseret = JSON.stringify(resultat);

    expect(resultat.length).toBeGreaterThan(0);
    expect(serialiseret).toContain("lag-01");
    expect(serialiseret).toContain("lag-18");
    expect(serialiseret).not.toContain("lag-21");
    expect(serialiseret).not.toContain("lag-25");
  });

  it("MAKS_DYBDE er 20", () => {
    expect(MAKS_DYBDE).toBe(20);
  });
});

describe("parseCommunityDokument — kun linjeskift er tomt", () => {
  it("afsnit med kun hardBreak → fjernet", () => {
    const input = doc([
      { type: "paragraph", content: [{ type: "hardBreak" }, { type: "hardBreak" }] },
      { type: "paragraph", content: [tekst("beholdes")] },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "beholdes", marks: [] }] },
    ]);
  });

  it("afsnit med tekst OG hardBreak → bevaret med begge", () => {
    const input = doc([
      { type: "paragraph", content: [tekst("linje et"), { type: "hardBreak" }, tekst("linje to")] },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "linje et", marks: [] },
          { type: "hardBreak" },
          { type: "text", text: "linje to", marks: [] },
        ],
      },
    ]);
  });
});
