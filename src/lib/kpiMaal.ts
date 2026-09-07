/**
 * kpiMaal — KPI-målenes fletning og oprindelse, ét sted.
 *
 * BESLUTTET (Jonas 7/9): fallback-mål MARKERES som standard. KPI_FALLBACK_
 * TARGETS (appConfig.ts) er seks tal, ét sæt for alle virksomheder — fire af
 * dem absolutte kronebeløb. På skærmen var der ingen forskel på et mål aftalt
 * med virksomheden og husets standard: en virksomhed der omsætter for 40.000
 * fik «mål 120.000» som var det deres. Benchmarks har haft princippet siden
 * 5/8 (`source: "Estimat, The Boardroom"` — source_label påstår aldrig mere
 * end vi kan dokumentere); målene får det her.
 *
 * OPRINDELSEN bæres som et FELT PÅ VÆRDIEN (`kilde`), ikke som en separat
 * mængde: målet rejser som ét objekt pr. nøgle gennem deriveKpiMetrics,
 * TanStack-cachen og setTargets — en mængde ved siden af skulle tråde gennem
 * hver aftager og ville blive forældet i samme øjeblik et mål gemmes.
 * Feltet er valgfrit i typen, så en hentning der endnu ikke sætter det
 * (useVirksomhed) kompilerer og bare IKKE markerer — ukendt er ikke standard.
 *
 * Tallene er IKKE rørt: at de fire kronebeløb kun passer én virksomheds-
 * størrelse er en faglig opgave, bogført separat (mangellisten).
 */
import { KPI_DEFS } from "@/lib/kpiDefs";
import { KPI_FALLBACK_TARGETS } from "@/lib/appConfig";

export type MaalKilde = "aftalt" | "standard";

export type ResolvedTarget = { value: number; label: string; kilde?: MaalKilde };
export type ResolvedTargets = Record<string, ResolvedTarget>;

export type KpiMaalRaekke = { kpi_key: string; target_value: number | string; target_label: string };

/** Ordret fletningen fra useKpiTargets/useVirksomhed: DB-værdi hvis den
    findes (kilde «aftalt»), ellers KPI_FALLBACK_TARGETS (kilde «standard»).
    En nøgle uden fallback får 0/«—» — ingen mål, og fladerne tegner intet. */
export function fletKpiMaal(raekker: readonly KpiMaalRaekke[]): ResolvedTargets {
  const db = new Map(raekker.map((r) => [r.kpi_key, r]));
  const ud: ResolvedTargets = {};
  for (const def of KPI_DEFS) {
    const ut = db.get(def.key);
    if (ut) {
      ud[def.key] = { value: Number(ut.target_value), label: ut.target_label, kilde: "aftalt" };
    } else {
      const fb = KPI_FALLBACK_TARGETS[def.key];
      ud[def.key] = fb ? { value: fb.value, label: fb.label, kilde: "standard" } : { value: 0, label: "—", kilde: "standard" };
    }
  }
  return ud;
}

/** Skal målet mærkes «standard»? Kun når oprindelsen er KENDT og er
    fallbacken — et mål uden kilde (ældre hentning) mærkes ikke. */
export function erStandardMaal(maal: { value?: number; label?: string; kilde?: MaalKilde | null } | null | undefined): boolean {
  return maal?.kilde === "standard";
}

/** Mærkets tekster — en oplysning, ikke en fejl. Kort på skærmen, forklaringen som title. */
export const STANDARDMAAL_TEKST = "Standardmål";
export const STANDARDMAAL_KOMPAKT = "standard";
export const STANDARDMAAL_FORKLARING =
  "Standardmål: The Boardrooms standard for alle virksomheder, ikke et mål aftalt med jer. Jeres egne mål sættes under «Ret mål».";
