import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as web from "@/lib/ventelisteDom";
import * as deno from "../../../supabase/functions/_shared/ventelisteDom.ts";

const krop = (sti: string) => {
  const kilde = readFileSync(resolve(process.cwd(), sti), "utf8");
  return kilde.slice(kilde.indexOf("*/") + 2);
};

describe("ventelisteDom — paritet mellem src/lib og supabase/functions/_shared", () => {
  it("kroppen er ordret ens efter filhovedet, ingen imports", () => {
    const a = krop("src/lib/ventelisteDom.ts");
    expect(a).toBe(krop("supabase/functions/_shared/ventelisteDom.ts"));
    expect(a.match(/^import /gm) ?? []).toHaveLength(0);
  });
  it("samme domme", () => {
    const NU = new Date("2026-09-18T12:00:00.000Z");
    const rk = [
      { id: "b", ansoegning_id: "ab", company_id: "c", status: "venter" as const, sat_at: "2026-09-01T00:00:00.000Z", afvist_at: "2026-06-01T00:00:00.000Z" },
      { id: "a", ansoegning_id: "aa", company_id: "c", status: "venter" as const, sat_at: "2026-09-01T00:00:00.000Z", afvist_at: "2026-05-03T00:00:00.000Z" },
    ];
    expect(deno.sorterKoe(rk).map((x) => x.id)).toEqual(web.sorterKoe(rk).map((x) => x.id));
    expect(deno.erBloedUdgave("2025-08-01T00:00:00.000Z", NU)).toBe(web.erBloedUdgave("2025-08-01T00:00:00.000Z", NU));
    expect(deno.afgoerSvar(rk, "a", "accepteret")).toEqual(web.afgoerSvar(rk, "a", "accepteret"));
    expect(deno.forsidelinje({ virksomhedNavn: "H", naeste: { navn: "N", afvist_at: "2026-05-03T00:00:00.000Z", sat_at: "x" }, antalIKoen: 1, tilbudUde: false, nu: NU }))
      .toEqual(web.forsidelinje({ virksomhedNavn: "H", naeste: { navn: "N", afvist_at: "2026-05-03T00:00:00.000Z", sat_at: "x" }, antalIKoen: 1, tilbudUde: false, nu: NU }));
  });
});
