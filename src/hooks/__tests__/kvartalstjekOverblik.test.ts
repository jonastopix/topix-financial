import { describe, expect, it } from "vitest";
import { filtrerTilUniverset, KVARTALSTJEK_VIRKSOMHED_KOLONNER, type VirksomhedTilKvartalstjek } from "../kvartalstjekOverblik";
import type { KvartalstjekPrVirksomhed } from "@/lib/hjemmebane/maalBekraeft";

/* Rådgiverforsidens kvartalstjek-linje (skive 3; rådets fund 5, 2/10-2026): kun
   virksomheder i husets univers — kunde, ikke demo, ikke legat, aktiv/status-løs
   (medlemsOverblik.iUniverset) — og ikke slettede tæller, som «Mangler at booke». */

const pr = (companyId: string, antal = 1): KvartalstjekPrVirksomhed => ({ companyId, antal, maal: [] });
const c = (over: Partial<VirksomhedTilKvartalstjek> & { id: string }): VirksomhedTilKvartalstjek => ({
  name: `V ${over.id}`, status: "active", is_legat: false, er_kunde: true, is_demo: false, data_slettet_at: null, ...over,
});

describe("filtrerTilUniverset", () => {
  it("kunde i universet tæller; demo, legat, ikke-kunde, slettet og ukendt tæller ikke", () => {
    const ud = filtrerTilUniverset(
      [pr("kunde", 2), pr("demo"), pr("legat"), pr("egen"), pr("slettet"), pr("ukendt"), pr("statusloes")],
      [
        c({ id: "kunde" }),
        c({ id: "demo", is_demo: true }),
        c({ id: "legat", is_legat: true }),
        c({ id: "egen", er_kunde: false }),
        c({ id: "slettet", data_slettet_at: "2026-09-01T00:00:00Z" }),
        c({ id: "statusloes", status: null }),
      ],
    );
    expect(ud.map((v) => [v.companyId, v.antal, v.navn])).toEqual([["kunde", 2, "V kunde"], ["statusloes", 1, "V statusloes"]]);
  });
  it("hentningen læser universets kolonner", () => {
    for (const k of ["status", "is_legat", "er_kunde", "is_demo", "data_slettet_at", "name"]) expect(KVARTALSTJEK_VIRKSOMHED_KOLONNER).toContain(k);
  });
});
