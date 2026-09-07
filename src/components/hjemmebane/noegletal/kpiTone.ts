/** Målopfyldelses-dommen (kpi-design §b): mapping fra actual/target til
    tilstand + tone — ÉN dom, to visninger (hero-StateDots og kort-toner).
    Tone-kalibreringen (Mola): hit/no_target = quiet; near/off = attention.
    ALDRIG alert — tal-afvigelser er alvor, ikke alarm (alert er forbeholdt
    fejl-tilstande som rapport-error, jf. reportCardView).
    PRINCIP (benchmark-synligheds-beslutningen 2026-08-05): mål dømmer,
    benchmark oplyser — benchmark farver ALDRIG toner, prikker eller
    domme; den er stille kontekst (ink-soft), uanset kortets tone. Derfor
    tager dommen KUN actual/target som input — aldrig benchmark.

    EN DOM KRÆVER ET AFTALT MÅL (Jonas 7/9, set på skærm på CARMA STUDIO:
    «Omk. total 106.096 · mål < 80.000 standard» i RUST). Et standardmål
    (KPI_FALLBACK_TARGETS, kilde «standard» — lib/kpiMaal, #710) er husets
    tal, ikke virksomhedens; vi holdt op med at PÅSTÅ at det var deres, men
    dømte stadig som om det var. Nu: kilde «standard» giver tilstanden
    `standard` — stille, uden pct, målet vises stadig (med mærket). Ingen
    tredje tone er opfundet: «ingen dom» er allerede quiet. Et AFTALT mål
    dømmer præcis som før. Ukendt kilde (ældre hentning) dømmer også som
    før — ukendt er ikke standard. */
import type { MaalKilde } from "@/lib/kpiMaal";

export interface KpiToneInput {
  actual: number | null;
  target: number | null;
  lowerIsBetter: boolean;
  /** Målets oprindelse. «standard» → ingen dom (tilstand `standard`). */
  kilde?: MaalKilde | null;
}

export interface KpiToneView {
  /** `standard`: målet er husets standard — vises, men dømmer ikke. */
  state: "hit" | "near" | "off" | "no_target" | "standard";
  tone: "quiet" | "attention";
  /** Målopfyldelse i % (capped 0-150); null uden dom. */
  pct: number | null;
}

/** near-grænsen: ≥85 % af målet (ikke nået) dømmes "tæt på" (klik-valg K3). */
const NEAR_THRESHOLD = 85;

export function deriveKpiTone(input: KpiToneInput): KpiToneView {
  const { actual, target, lowerIsBetter, kilde } = input;
  if (actual == null || target == null || target <= 0) {
    return { state: "no_target", tone: "quiet", pct: null };
  }
  // Standardmål: der ER et mål at vise, men ingen dom at fælde.
  if (kilde === "standard") {
    return { state: "standard", tone: "quiet", pct: null };
  }

  // lowerIsBetter vendes: 100 % = på målet; under målet er bedre.
  const pct = lowerIsBetter
    ? Math.max(0, Math.min(150, 100 - ((actual - target) / target) * 100))
    : Math.max(0, Math.min(150, (actual / target) * 100));

  const hit = lowerIsBetter ? actual <= target : actual >= target;
  if (hit) return { state: "hit", tone: "quiet", pct };
  if (pct >= NEAR_THRESHOLD) return { state: "near", tone: "attention", pct };
  return { state: "off", tone: "attention", pct };
}
