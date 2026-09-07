import { describe, expect, it } from "vitest";
import { KPI_DEFS } from "@/lib/kpiDefs";
import { KPI_FALLBACK_TARGETS } from "@/lib/appConfig";
import {
  STANDARDMAAL_FORKLARING, STANDARDMAAL_KOMPAKT, STANDARDMAAL_TEKST,
  erStandardMaal, fletKpiMaal,
} from "@/lib/kpiMaal";

const alleNoegler = KPI_DEFS.map((d) => d.key);
const raekke = (kpi_key: string, target_value: number, target_label: string) => ({ kpi_key, target_value, target_label });

describe("fletKpiMaal — oprindelsen følger med målet (Jonas 7/9)", () => {
  it("mål fra databasen er «aftalt» og IKKE markeret", () => {
    const ud = fletKpiMaal(alleNoegler.map((k) => raekke(k, 42, "42")));
    for (const k of alleNoegler) {
      expect(ud[k]).toEqual({ value: 42, label: "42", kilde: "aftalt" });
      expect(erStandardMaal(ud[k])).toBe(false);
    }
  });

  it("ingen rækker: alle mål er fallbacken og markeret «standard» — tallene er de seks fra appConfig, urørt", () => {
    const ud = fletKpiMaal([]);
    for (const k of alleNoegler) {
      expect(ud[k].kilde).toBe("standard");
      expect(erStandardMaal(ud[k])).toBe(true);
      expect(ud[k].value).toBe(KPI_FALLBACK_TARGETS[k].value);
      expect(ud[k].label).toBe(KPI_FALLBACK_TARGETS[k].label);
    }
  });

  it("en blanding markerer kun de rigtige", () => {
    const ud = fletKpiMaal([raekke("omsaetning", 40_000, "40.000"), raekke("db_margin", 35, "35%")]);
    expect(erStandardMaal(ud.omsaetning)).toBe(false);
    expect(ud.omsaetning).toEqual({ value: 40_000, label: "40.000", kilde: "aftalt" });
    expect(erStandardMaal(ud.db_margin)).toBe(false);
    for (const k of alleNoegler.filter((k) => k !== "omsaetning" && k !== "db_margin")) {
      expect(erStandardMaal(ud[k])).toBe(true);
    }
  });

  it("target_value som streng fra databasen bliver et tal", () => {
    const ud = fletKpiMaal([{ kpi_key: "resultat", target_value: "12000", target_label: "12.000" }]);
    expect(ud.resultat.value).toBe(12000);
  });

  it("en række for en ukendt nøgle ignoreres — kun KPI_DEFS' nøgler kommer ud", () => {
    const ud = fletKpiMaal([raekke("noget_andet", 1, "1")]);
    expect(Object.keys(ud).sort()).toEqual([...alleNoegler].sort());
  });
});

describe("erStandardMaal — ukendt oprindelse er ikke standard", () => {
  it("uden kilde (ældre hentning) markeres ikke", () => {
    expect(erStandardMaal({ value: 120000, label: "120.000" })).toBe(false);
    expect(erStandardMaal({ value: 120000, label: "120.000", kilde: null })).toBe(false);
  });
  it("null/undefined markeres ikke", () => {
    expect(erStandardMaal(null)).toBe(false);
    expect(erStandardMaal(undefined)).toBe(false);
  });
});

describe("teksterne — en oplysning, ikke en fejl", () => {
  it("er korte og siger «standard»", () => {
    expect(STANDARDMAAL_TEKST).toBe("Standardmål");
    expect(STANDARDMAAL_KOMPAKT).toBe("standard");
    expect(STANDARDMAAL_FORKLARING).toContain("ikke et mål aftalt med jer");
  });
  it("bebrejder ikke — ingen «fejl», «forkert» eller «mangler»", () => {
    for (const t of [STANDARDMAAL_TEKST, STANDARDMAAL_KOMPAKT, STANDARDMAAL_FORKLARING]) {
      expect(t.toLowerCase()).not.toMatch(/fejl|forkert|mangler|glemt/);
    }
  });
});
