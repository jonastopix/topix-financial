import { describe, expect, it } from "vitest";
import { parseCommunityDokument } from "../communityDokument";
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

describe("parseCommunityDokument — billed-hærdning", () => {
  it("data:text/html som image.src → billedet fjernet", () => {
    const input = doc([
      { type: "paragraph", content: [tekst("før")] },
      { type: "image", attrs: { src: "data:text/html,<script>alert(1)</script>", alt: "x" } },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "før", marks: [] }] },
    ]);
  });

  it("https-billede består med src og alt", () => {
    const input = doc([
      { type: "image", attrs: { src: "https://cdn.example.dk/graf.png", alt: "Graf" } },
    ]);
    expect(parseCommunityDokument(input)).toEqual([
      { type: "image", src: "https://cdn.example.dk/graf.png", alt: "Graf" },
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
