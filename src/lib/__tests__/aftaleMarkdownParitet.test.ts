import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as web from "@/lib/aftaleMarkdown";
import * as deno from "../../../supabase/functions/_shared/aftaleMarkdown.ts";

const krop = (sti: string) => {
  const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");
  return kilde.slice(kilde.indexOf("*/") + 2);
};

describe("aftaleMarkdown — paritet mellem src/lib og supabase/functions/_shared", () => {
  it("kroppen er ordret ens efter filhovedet, ingen imports", () => {
    const a = krop("src/lib/aftaleMarkdown.ts");
    expect(a).toBe(krop("supabase/functions/_shared/aftaleMarkdown.ts"));
    expect(a.match(/^import /gm) ?? []).toHaveLength(0);
  });
  it("samme struktur af samme tekst", () => {
    const t = "# T\n\n**Mellem:**\n- **A:** b\n- c\n\n---\n*k* og **f** og <b>x</b>";
    expect(deno.parseAftaleTekst(t)).toEqual(web.parseAftaleTekst(t));
    expect(deno.aftaleSomRenTekst(t)).toBe(web.aftaleSomRenTekst(t));
  });
});
