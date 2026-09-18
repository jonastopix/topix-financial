import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as web from "@/lib/revisionsspor";
import * as deno from "../../../supabase/functions/_shared/revisionsspor.ts";

const krop = (sti: string) => {
  const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");
  return kilde.slice(kilde.indexOf("*/") + 2);
};

describe("revisionsspor — paritet mellem src/lib og supabase/functions/_shared", () => {
  it("kroppen er ordret ens efter filhovedet, ingen imports", () => {
    const a = krop("src/lib/revisionsspor.ts");
    expect(a).toBe(krop("supabase/functions/_shared/revisionsspor.ts"));
    expect(a.match(/^import /gm) ?? []).toHaveLength(0);
  });
  it("samme linjer for samme spor", () => {
    const spor = [
      { tidspunkt: "2026-09-18T12:00:00.000Z", haendelse: "link_aabnet" as const, ip: "1.2.3.4", user_agent: "Chrome/1 Safari/1 Windows", detaljer: null },
      { tidspunkt: "2026-09-18T12:01:00.000Z", haendelse: "underskrevet" as const, ip: "1.2.3.4", user_agent: null, detaljer: { navn: "A B", aftryk: "ff" } },
    ];
    expect(deno.sporTilLinjer(spor)).toEqual(web.sporTilLinjer(spor));
  });
});
