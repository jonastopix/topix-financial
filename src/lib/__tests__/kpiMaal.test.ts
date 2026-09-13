import { describe, expect, it } from "vitest";
import { KPI_DEFS } from "@/lib/kpiDefs";
import {
  STANDARDMAAL_FORKLARING, STANDARDMAAL_KOMPAKT, STANDARDMAAL_TEKST,
  erStandardMaal, fletKpiMaal,
} from "@/lib/kpiMaal";

const alleNoegler = KPI_DEFS.map((d) => d.key);
const raekke = (kpi_key: string, target_value: number, target_label: string) => ({ kpi_key, target_value, target_label });

// Kort 40 (Jonas 11/9): et mål er noget der er AFTALT. Fallbacken
// (KPI_FALLBACK_TARGETS) er fjernet — en nøgle uden række i kpi_targets har
// intet mål og er FRAVÆRENDE i kortet, ikke 0 med etiketten «standard».
describe("fletKpiMaal — kun aftalte mål, intet fallback (kort 40, 11/9)", () => {
  it("mål fra databasen er «aftalt» og IKKE markeret", () => {
    const ud = fletKpiMaal(alleNoegler.map((k) => raekke(k, 42, "42")));
    for (const k of alleNoegler) {
      expect(ud[k]).toEqual({ value: 42, label: "42", kilde: "aftalt" });
      expect(erStandardMaal(ud[k])).toBe(false);
    }
  });

  it("ingen rækker: intet mål for nogen nøgle — kortet er tomt, ikke seks standardtal", () => {
    const ud = fletKpiMaal([]);
    expect(ud).toEqual({});
    for (const k of alleNoegler) {
      expect(ud[k]).toBeUndefined();
      expect(k in ud).toBe(false);
    }
  });

  it("en blanding: kun nøglerne med række kommer ud, alle «aftalt»", () => {
    const ud = fletKpiMaal([raekke("omsaetning", 40_000, "40.000"), raekke("db_margin", 35, "35%")]);
    expect(Object.keys(ud).sort()).toEqual(["db_margin", "omsaetning"]);
    expect(ud.omsaetning).toEqual({ value: 40_000, label: "40.000", kilde: "aftalt" });
    expect(ud.db_margin).toEqual({ value: 35, label: "35%", kilde: "aftalt" });
    for (const k of alleNoegler.filter((k) => k !== "omsaetning" && k !== "db_margin")) {
      expect(ud[k]).toBeUndefined();
    }
  });

  it("«intet mål» og «målet er nul» kan skelnes: nul er en post med value 0 og kilde aftalt", () => {
    const ud = fletKpiMaal([raekke("resultat", 0, "0")]);
    expect(ud.resultat).toEqual({ value: 0, label: "0", kilde: "aftalt" });
    expect("resultat" in ud).toBe(true);
    expect("omsaetning" in ud).toBe(false);
  });

  it("ingen post bærer nogensinde kilden «standard»", () => {
    for (const ud of [fletKpiMaal([]), fletKpiMaal([raekke("omsaetning", 1, "1")]), fletKpiMaal(alleNoegler.map((k) => raekke(k, 7, "7")))]) {
      for (const post of Object.values(ud)) {
        expect(post.kilde).toBe("aftalt");
        expect(erStandardMaal(post)).toBe(false);
      }
    }
  });

  it("target_value som streng fra databasen bliver et tal", () => {
    const ud = fletKpiMaal([{ kpi_key: "resultat", target_value: "12000", target_label: "12.000" }]);
    expect(ud.resultat.value).toBe(12000);
  });

  it("en række for en ukendt nøgle ignoreres — kun KPI_DEFS' nøgler kan komme ud", () => {
    const ud = fletKpiMaal([raekke("noget_andet", 1, "1"), raekke("omsaetning", 2, "2")]);
    expect(Object.keys(ud)).toEqual(["omsaetning"]);
    for (const k of Object.keys(ud)) expect(alleNoegler).toContain(k);
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

// Teksterne bruges stadig af StandardmaalMaerke (uden for kort 40) — låst
// indtil mærket ryddes sammen med kpiTone's standard-gren.
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
