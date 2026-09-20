import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as web from "@/lib/stilleDom";
import * as deno from "../../../supabase/functions/_shared/stilleDom.ts";

// Paritet mellem src/lib/stilleDom.ts og _shared/stilleDom.ts
// (webinarDom.paritet-mønstret): kildeteksten efter filhovedet er ordret ens,
// OG dommen giver samme svar. Driver de fra hinanden, fejler denne fil højt.

/** Kroppen: alt efter det første blokkommentar-filhoved. */
function krop(kilde: string): string {
  const slut = kilde.indexOf("*/");
  return slut === -1 ? kilde : kilde.slice(slut + 2);
}

describe("stilleDom.paritet", () => {
  it("kildeteksten er ordret ens efter filhovedet", () => {
    const a = krop(readFileSync(resolve(process.cwd(), "src/lib/stilleDom.ts"), "utf8"));
    const b = krop(readFileSync(resolve(process.cwd(), "supabase/functions/_shared/stilleDom.ts"), "utf8"));
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(500);
  });

  it("dommen svarer ens", () => {
    const nu = new Date("2026-09-20T12:00:00Z");
    const k = { companyId: "c1", navn: "Brick Works ApS", status: "active", erKunde: true, erLegat: false, periodeStart: "2026-04-07", periodeSlut: "2027-04-07", betalingsmodel: "rate12", prisEksMomsOere: 4_200_000, kontaktperson: "Caspar Bennedsen", kontaktEmail: null };
    const b = [{ companyId: "c1", userId: "u1", navn: null, oprettetAt: "2026-04-08T00:00:00Z" }];
    const l = [{ userId: "u1", sidsteLogin: "2026-04-28T10:00:00Z" }];
    expect(deno.doemStille(k, b, l, [], nu)).toEqual(web.doemStille(k, b, l, [], nu));
    expect(deno.stilleTekst(deno.doemStille(k, b, l, [], nu), k, b, null)).toEqual(web.stilleTekst(web.doemStille(k, b, l, [], nu), k, b, null));
    expect(deno.B_TRIN_DAGE).toEqual(web.B_TRIN_DAGE);
    expect(deno.A_TRIN_DAGE).toEqual(web.A_TRIN_DAGE);
  });
});
