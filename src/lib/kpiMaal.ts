/**
 * kpiMaal — KPI-målenes fletning og oprindelse, ét sted.
 *
 * ET MÅL ER NOGET DER ER AFTALT (Jonas 11/9, kort 40). Indtil da fik en nøgle
 * uden række i kpi_targets husets fallback (KPI_FALLBACK_TARGETS i appConfig,
 * seks tal for alle virksomheder — fire absolutte kronebeløb, to marginer på
 * 60 % og 15 %), fra 7/9 mærket «standard». Ingen havde aftalt de tal, og de
 * dømte engros (45,7 %) som «under» mens en konsulent (96,9 %) «ramte».
 * Prod 11/9: 4 af 30 aktive virksomheder havde en eneste række i kpi_targets.
 * Fallbacken er fjernet: en nøgle uden aftalt mål har INTET mål. Branchen
 * oplyses allerede som sin egen linje (benchmark), og den dømmer ikke.
 *
 * FORMEN: kortet indeholder KUN de nøgler der har en række i databasen, alle
 * med kilde «aftalt». En nøgle uden aftalt mål er FRAVÆRENDE — ikke 0 med en
 * etiket. Så kan aftagerne skelne:
 *   «intet mål»     → `targets[key]` er undefined
 *   «målet er nul»  → `targets[key]` er { value: 0, …, kilde: "aftalt" }
 * Begge aftagere (deriveKpiMetrics, NoegletalViews getTarget) læser allerede
 * `targets[key] ?? { value: 0, label: "—" }`, og fladerne tegner intet mål
 * ved value ≤ 0 (target > 0-værnene før deriveKpiTone/«mål …»-linjerne).
 *
 * OPRINDELSEN bæres stadig som et FELT PÅ VÆRDIEN (`kilde`): målet rejser
 * som ét objekt pr. nøgle gennem deriveKpiMetrics, TanStack-cachen og
 * setTargets. Værdien «standard» PRODUCERES ikke længere af nogen kodesti;
 * typemedlemmet, erStandardMaal og STANDARDMAAL_* står tilbage fordi
 * kpiTone.ts og StandardmaalMaerke.tsx stadig refererer dem — oprydningen
 * af mærket er en opfølgning, ikke en del af kort 40.
 */
import { KPI_DEFS } from "@/lib/kpiDefs";

export type MaalKilde = "aftalt" | "standard";

export type ResolvedTarget = { value: number; label: string; kilde?: MaalKilde };
/** Kun nøgler med et aftalt mål er til stede — opslag kan give undefined. */
export type ResolvedTargets = Record<string, ResolvedTarget>;

export type KpiMaalRaekke = { kpi_key: string; target_value: number | string; target_label: string };

/** Fletningen fra useKpiTargets/useVirksomhed: én post pr. KPI_DEFS-nøgle der
    HAR en række i kpi_targets (kilde «aftalt»). Nøgler uden række udelades —
    intet mål, og fladerne tegner intet. Rækker for ukendte nøgler ignoreres. */
export function fletKpiMaal(raekker: readonly KpiMaalRaekke[]): ResolvedTargets {
  const db = new Map(raekker.map((r) => [r.kpi_key, r]));
  const ud: ResolvedTargets = {};
  for (const def of KPI_DEFS) {
    const ut = db.get(def.key);
    if (ut) ud[def.key] = { value: Number(ut.target_value), label: ut.target_label, kilde: "aftalt" };
  }
  return ud;
}

/** Skal målet mærkes «standard»? Kun når oprindelsen er KENDT og er
    «standard». Efter kort 40 producerer fletningen aldrig den kilde, så
    dommen er falsk for alt fletKpiMaal returnerer; den bliver for aftagere
    uden for kortets filliste (NoegletalView) indtil mærket ryddes. */
export function erStandardMaal(maal: { value?: number; label?: string; kilde?: MaalKilde | null } | null | undefined): boolean {
  return maal?.kilde === "standard";
}

/** Mærkets tekster — bruges af StandardmaalMaerke (uden for kort 40). */
export const STANDARDMAAL_TEKST = "Standardmål";
export const STANDARDMAAL_KOMPAKT = "standard";
export const STANDARDMAAL_FORKLARING =
  "Standardmål: The Boardrooms standard for alle virksomheder, ikke et mål aftalt med jer. Jeres egne mål sættes under «Ret mål».";
