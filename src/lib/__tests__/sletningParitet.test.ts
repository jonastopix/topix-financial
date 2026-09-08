import { describe, expect, it } from "vitest";
import {
  afgoerSletning,
  SLETTEFRIST_ANMODNING_DAGE,
  SLETTEFRIST_EFTER_SLUTDATO_DAGE,
  SLETTEFRIST_EFTER_VINDUE_DAGE,
  type SletningInput,
  type Slettevej,
} from "@/lib/sletning";
import { FORNYELSE_IKRAFT_DATO } from "@/lib/fornyelse";
// Paritetsimport — Deno-kopien er et spejl (importstien er den eneste
// tilladte forskel). vitest fejler højt hvis de to driver.
import {
  afgoerSletning as afgoerSletningDeno,
  SLETTEFRIST_ANMODNING_DAGE as SLETTEFRIST_ANMODNING_DAGE_DENO,
  SLETTEFRIST_EFTER_SLUTDATO_DAGE as SLETTEFRIST_EFTER_SLUTDATO_DAGE_DENO,
  SLETTEFRIST_EFTER_VINDUE_DAGE as SLETTEFRIST_EFTER_VINDUE_DAGE_DENO,
} from "../../../supabase/functions/_shared/sletning.ts";

// Fast «nu» langt efter ikrafttrædelsen (10/9-2026), så slutdatoer der
// ligger 45+ dage tilbage stadig kan være INDE i ordningen.
const NOW = new Date("2026-12-01T12:00:00Z");
const INGEN_SUB = { subscription_status: null, subscription_current_period_end: null };
const AKTIV_SUB = { subscription_status: "active", subscription_current_period_end: "2027-06-01T00:00:00Z" };

/** Kalenderdag n dage FØR NOW's UTC-dag (n > 0 = fortid). */
function dageFoer(n: number): string {
  return new Date(Date.UTC(2026, 11, 1) - n * 86_400_000).toISOString().slice(0, 10);
}

function base(over: Partial<SletningInput>): SletningInput {
  return {
    contract_end_date: null,
    offboarding_requested_at: null,
    beslutning: null,
    status: "tidligere",
    data_slettet_at: null,
    ...INGEN_SUB,
    ...over,
  };
}

const ALLE_VEJE: Record<Slettevej, true> = { anmodning: true, tilbud_ubesvaret: true, aldrig_tilbudt: true };

describe("afgoerSletning — grænserne, låst fra begge sider", () => {
  it("vej 1: dag 6 efter anmodning sletter IKKE, dag 7 sletter", () => {
    const d6 = afgoerSletning(base({ offboarding_requested_at: dageFoer(6) }), NOW);
    const d7 = afgoerSletning(base({ offboarding_requested_at: dageFoer(7) }), NOW);
    expect(d6.skal_slettes).toBe(false);
    expect(d6.vej).toBe("anmodning");
    expect(d6.dage_over_frist).toBe(-1);
    expect(d7.skal_slettes).toBe(true);
    expect(d7.vej).toBe("anmodning");
    expect(d7.dage_over_frist).toBe(0);
    expect(d7.frist).toBe(dageFoer(0));
  });

  it("vej 1 har forrang: en anmodning dømmes som anmodning, også med slutdato der ellers giver vej 2/3", () => {
    const d = afgoerSletning(
      base({ offboarding_requested_at: dageFoer(7), contract_end_date: dageFoer(60), beslutning: "tilbyd" }),
      NOW,
    );
    expect(d.vej).toBe("anmodning");
    expect(d.skal_slettes).toBe(true);
  });

  it("vej 1 er ikke gated på ikrafttrædelsen: anmodning før 10/9 tæller (Alina-formen; hun stemples i migrationen)", () => {
    const d = afgoerSletning(base({ offboarding_requested_at: "2026-06-02T19:28:00Z", contract_end_date: "2026-05-29" }), NOW);
    expect(d.skal_slettes).toBe(true);
    expect(d.vej).toBe("anmodning");
  });

  it("vej 2 (tilbyd): dag 44 efter slutdato sletter IKKE, dag 45 sletter", () => {
    const d44 = afgoerSletning(base({ contract_end_date: dageFoer(44), beslutning: "tilbyd" }), NOW);
    const d45 = afgoerSletning(base({ contract_end_date: dageFoer(45), beslutning: "tilbyd" }), NOW);
    expect(d44.skal_slettes).toBe(false);
    expect(d44.vej).toBe("tilbud_ubesvaret");
    expect(d44.dage_over_frist).toBe(-1);
    expect(d45.skal_slettes).toBe(true);
    expect(d45.vej).toBe("tilbud_ubesvaret");
    expect(d45.dage_over_frist).toBe(0);
    expect(d45.frist).toBe(dageFoer(0));
  });

  it("vej 3 (ingen beslutning / tilbyd_ikke): dag 44 nej, dag 45 ja", () => {
    for (const beslutning of [null, "tilbyd_ikke"] as const) {
      const d44 = afgoerSletning(base({ contract_end_date: dageFoer(44), beslutning }), NOW);
      const d45 = afgoerSletning(base({ contract_end_date: dageFoer(45), beslutning }), NOW);
      expect(d44.skal_slettes).toBe(false);
      expect(d44.vej).toBe("aldrig_tilbudt");
      expect(d45.skal_slettes).toBe(true);
      expect(d45.vej).toBe("aldrig_tilbudt");
    }
  });

  it("de gamle er en beslutning, ikke en regel: slutdato på eller før ikrafttrædelsen giver aldrig vej 2/3", () => {
    // De otte fra 20260902113000: maj–september 2026, alle ≤ 10/9.
    for (const slut of ["2026-05-06", "2026-05-21", "2026-05-29", "2026-08-22", "2026-09-01", FORNYELSE_IKRAFT_DATO]) {
      for (const beslutning of [null, "tilbyd", "tilbyd_ikke"] as const) {
        const d = afgoerSletning(base({ contract_end_date: slut, beslutning }), NOW);
        expect(d.skal_slettes, `${slut} ${beslutning}`).toBe(false);
        expect(d.vej).toBeNull();
        expect(d.grund).toContain("uden for ordningen");
      }
    }
    // Dagen efter ikrafttrædelsen er INDE.
    const d = afgoerSletning(base({ contract_end_date: "2026-09-11", beslutning: null }), NOW);
    expect(d.vej).toBe("aldrig_tilbudt");
  });

  it("allerede slettet dømmes aldrig igen — uanset vej", () => {
    const d = afgoerSletning(
      base({ data_slettet_at: "2026-09-08T10:08:00Z", offboarding_requested_at: dageFoer(100), contract_end_date: dageFoer(100) }),
      NOW,
    );
    expect(d.skal_slettes).toBe(false);
    expect(d.vej).toBeNull();
    expect(d.grund).toContain("allerede slettet");
  });

  it("aktivt abonnement (selvbetjener) slettes aldrig ad vej 2/3", () => {
    const d = afgoerSletning(base({ contract_end_date: dageFoer(60), beslutning: null, ...AKTIV_SUB }), NOW);
    expect(d.skal_slettes).toBe(false);
    expect(d.vej).toBeNull();
  });

  it("ingen slutdato og ingen anmodning: nej", () => {
    expect(afgoerSletning(base({}), NOW).skal_slettes).toBe(false);
  });

  it("konstanterne hænger sammen: 15 + 30 = 45", () => {
    expect(SLETTEFRIST_EFTER_SLUTDATO_DAGE).toBe(45);
    expect(SLETTEFRIST_EFTER_VINDUE_DAGE).toBe(30);
    expect(SLETTEFRIST_ANMODNING_DAGE).toBe(7);
  });

  it("hver Slettevej har mindst én sletning i testen", () => {
    const veje = new Set<Slettevej>();
    veje.add(afgoerSletning(base({ offboarding_requested_at: dageFoer(7) }), NOW).vej!);
    veje.add(afgoerSletning(base({ contract_end_date: dageFoer(45), beslutning: "tilbyd" }), NOW).vej!);
    veje.add(afgoerSletning(base({ contract_end_date: dageFoer(45), beslutning: null }), NOW).vej!);
    for (const v of Object.keys(ALLE_VEJE) as Slettevej[]) expect(veje.has(v), v).toBe(true);
  });
});

describe("afgoerSletning — paritet mellem src/lib og supabase/functions/_shared", () => {
  it("alle dage −5…+120 for anmodning og slutdato × tre beslutninger × med/uden abonnement × med/uden stempel", () => {
    for (let dage = -5; dage <= 120; dage++) {
      for (const beslutning of [null, "tilbyd", "tilbyd_ikke"] as const) {
        for (const sub of [INGEN_SUB, AKTIV_SUB]) {
          for (const stempel of [null, "2026-09-08T10:08:00Z"]) {
            const varianter: SletningInput[] = [
              base({ offboarding_requested_at: dageFoer(dage), beslutning, data_slettet_at: stempel, ...sub }),
              base({ contract_end_date: dageFoer(dage), beslutning, data_slettet_at: stempel, ...sub }),
              base({ contract_end_date: dageFoer(dage), offboarding_requested_at: dageFoer(dage), beslutning, data_slettet_at: stempel, ...sub }),
            ];
            for (const i of varianter) {
              expect(afgoerSletningDeno(i, NOW)).toEqual(afgoerSletning(i, NOW));
            }
          }
        }
      }
    }
  });

  it("låsene er ens i begge kopier", () => {
    expect(SLETTEFRIST_ANMODNING_DAGE_DENO).toBe(SLETTEFRIST_ANMODNING_DAGE);
    expect(SLETTEFRIST_EFTER_VINDUE_DAGE_DENO).toBe(SLETTEFRIST_EFTER_VINDUE_DAGE);
    expect(SLETTEFRIST_EFTER_SLUTDATO_DAGE_DENO).toBe(SLETTEFRIST_EFTER_SLUTDATO_DAGE);
  });
});
