import { describe, expect, it } from "vitest";
import { detekterSkilletegn, laesCsvTilMatrix, parseCsvTilMatrix } from "@/lib/csvLaesning";

describe("detekterSkilletegn", () => {
  it("vælger det skilletegn der giver flest kolonner på headerlinjen", () => {
    expect(detekterSkilletegn("Post\tJan\tFeb\nLøn\t1\t2")).toBe("\t");
    expect(detekterSkilletegn("Post;jan;feb\nLøn;1;2")).toBe(";");
    expect(detekterSkilletegn("Post,Jan,Feb\nLøn,1,2")).toBe(",");
  });

  it("citationstegn beskytter skilletegn i felter mod at tælle med", () => {
    // Kommaerne bor i citerede tal — semikolon er det reelle skilletegn.
    expect(detekterSkilletegn('Post;"2,700,000";"1,500"\n')).toBe(";");
  });

  it("tom tekst falder tilbage til komma", () => {
    expect(detekterSkilletegn("")).toBe(",");
  });
});

describe("laesCsvTilMatrix", () => {
  it("parser med det detekterede skilletegn og bevarer citerede felter", () => {
    const matrix = laesCsvTilMatrix('Post;"Salg; indland";beløb\nLøn;"2,700";x\n');
    expect(matrix[0]).toEqual(["Post", "Salg; indland", "beløb"]);
    expect(matrix[1]).toEqual(["Løn", "2,700", "x"]);
  });

  it("tomme felter bliver null; escaped quotes bevares", () => {
    const matrix = parseCsvTilMatrix('a,,"si""ger"\n', ",");
    expect(matrix[0]).toEqual(["a", null, 'si"ger']);
  });
});
