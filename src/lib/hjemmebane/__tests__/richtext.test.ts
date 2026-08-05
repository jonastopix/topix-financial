import { describe, expect, it } from "vitest";
import { hasRichTextContent } from "../richtext";

describe("hasRichTextContent — tom-body-dommen", () => {
  it("null og tom streng er tomme", () => {
    expect(hasRichTextContent(null)).toBe(false);
    expect(hasRichTextContent("")).toBe(false);
  });

  it("richtext-skaller uden indhold er tomme", () => {
    expect(hasRichTextContent("<p></p>")).toBe(false);
    expect(hasRichTextContent("<p> </p>")).toBe(false);
    expect(hasRichTextContent("<p><br></p>")).toBe(false);
    expect(hasRichTextContent("&nbsp;")).toBe(false);
  });

  it("reelt indhold er ikke tomt", () => {
    expect(hasRichTextContent("<p>Ugens vigtigste pointe.</p>")).toBe(true);
    expect(hasRichTextContent("ren tekst uden tags")).toBe(true);
  });
});
