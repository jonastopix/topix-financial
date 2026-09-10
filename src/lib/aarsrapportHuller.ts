/**
 * aarsrapportHuller — et manglende tal er ikke nul.
 *
 * HVORFOR (recon-aarsrapporten §3b/§5, målt 7/9 og 10/9-2026): et årsrapport-
 * udtræk er én AI-læsning af en PDF, der giver årets tal, som divideres med 12
 * og skrives som tolv identiske rækker med data_basis = 'estimated'. Ni af
 * elleve udtræk mangler ét til fire af de fem resultatfelter. Fladerne
 * behandlede hullerne på tre måder, der alle lignede tal:
 *   - factsAdapter dropper nøglen → KPI'en forsvinder uden ord;
 *   - calcTotalExpenses regner et manglende omkostningsfelt som 0 → «Omk.
 *     total» = de felter der tilfældigvis blev læst, præsenteret som samlede;
 *   - grafens historik `?? 0` → et hul tegnes på nullinjen.
 * Og ét sted var nul skrevet SOM tal: YKRG 2024 har omsætning 0 i ti rækker
 * ved siden af et bruttoresultat på 45.565 — «ingen omsætning» for en
 * virksomhed der har det. Udtrækket skriver i dag null (ikke 0) for en
 * manglende omsætning, men rækkerne fra før står.
 *
 * REGLERNE her gælder KUN estimerede rækker (årsrapport /12). For en målt
 * måned er en manglende omkostningspost en post rapporten ikke har (ingen
 * lokaleomkostninger = 0 kr.), og det er den konvention motoren og
 * læserne bruger. For en estimeret række er en manglende post et felt
 * udtrækket ikke kunne læse — og så er summen ukendt, ikke mindre.
 *
 * Rene funktioner; testet i __tests__/aarsrapportHuller.test.ts.
 */
import type { DataBasis } from "@/lib/dataGrundlag";
import { factsToDanishMetrics } from "@/lib/factsAdapter";
import { calcTotalExpenses } from "@/lib/financialUtils";

/** De fem resultatfelter årsrapport-udtrækket lover (danske nøgler som fladerne bruger). */
export const AARSRAPPORT_FELTER = [
  "omsaetning",
  "direkte_omkostninger",
  "loenninger",
  "daekningsbidrag",
  "administrationsomkostninger",
] as const;

export const AARSRAPPORT_FELT_ORD: Readonly<Record<(typeof AARSRAPPORT_FELTER)[number], string>> = {
  omsaetning: "omsætning",
  direkte_omkostninger: "vareforbrug",
  loenninger: "personaleomkostninger",
  daekningsbidrag: "bruttoresultat",
  administrationsomkostninger: "øvrige omkostninger",
};

/** Omkostningsfelterne årsrapport-vejen skriver — summen kræver dem alle i en estimeret række. */
const AARSRAPPORT_OMKOSTNINGER = ["direkte_omkostninger", "loenninger", "administrationsomkostninger", "afskrivninger"] as const;

type Kf = Record<string, number>;

/**
 * Renser en estimeret rækkes nøgletal for nuller der ikke er tal: omsætning 0
 * ved siden af et bruttoresultat eller vareforbrug ≠ 0 er aritmetisk umuligt
 * (omsætning = vareforbrug + bruttoresultat) og betyder «ikke læst». Nøglen
 * fjernes, så den behandles som manglende — ikke som nul kroner. Målte
 * rækker røres ikke: dér er 0 et tal.
 */
export function renskEstimatKf(kf: Kf, dataBasis: DataBasis): Kf {
  if (dataBasis !== "estimated") return kf;
  const ud: Kf = { ...kf };
  const db = ud.daekningsbidrag ?? 0;
  const cogs = ud.direkte_omkostninger ?? 0;
  if (ud.omsaetning === 0 && (db !== 0 || cogs !== 0)) {
    delete ud.omsaetning;
  }
  return ud;
}

/** Fra en fact-række til fladernes danske nøgletal — med renselsen for estimerede rækker. */
export function faktaTilKf(fact: { metrics: Record<string, number | null> | null | undefined; data_basis: DataBasis }): Kf {
  return renskEstimatKf(factsToDanishMetrics(fact.metrics), fact.data_basis);
}

/** Hvilke af de fem felter mangler (null/udeladt) — i årsrapportens rækkefølge. */
export function manglendeAarsrapportFelter(kf: Kf): (typeof AARSRAPPORT_FELTER)[number][] {
  return AARSRAPPORT_FELTER.filter((felt) => kf[felt] == null);
}

/**
 * «Omk. total» med respekt for grundlaget: for en målt måned den kanoniske
 * sum (manglende post = post rapporten ikke har). For en estimeret række er
 * summen kun kendt når alle fire omkostningsfelter udtrækket lover er læst —
 * ellers null: en sum af det der tilfældigvis blev læst er ikke «samlede
 * omkostninger».
 */
export function omkostningerKendte(kf: Kf, dataBasis: DataBasis | undefined): number | null {
  if (dataBasis === "estimated") {
    const mangler = AARSRAPPORT_OMKOSTNINGER.some((felt) => kf[felt] == null);
    if (mangler) return null;
  }
  const v = calcTotalExpenses(kf);
  return v > 0 ? v : null;
}

/** «a», «a og b», «a, b og c». */
function listeMedOg(ord: readonly string[]): string {
  if (ord.length === 0) return "";
  if (ord.length === 1) return ord[0];
  return `${ord.slice(0, -1).join(", ")} og ${ord[ord.length - 1]}`;
}

/**
 * Beskeden til fladen når den seneste række er et estimat med huller. Rolig:
 * siger hvad der ikke kunne læses, at felterne står tomme, og at tomt ikke er
 * nul — for den der aldrig har uploadet andet, er årsrapporten alt.
 */
export function aarsrapportHulTekst(mangler: readonly (typeof AARSRAPPORT_FELTER)[number][]): string | null {
  if (mangler.length === 0) return null;
  const ord = mangler.map((felt) => AARSRAPPORT_FELT_ORD[felt]);
  const flertal = ord.length > 1;
  return `I årsrapporten kunne vi ikke læse ${listeMedOg(ord)}. ${flertal ? "De felter" : "Det felt"} står ${flertal ? "tomme" : "tomt"} her — ikke som nul. Tal der bygger på ${flertal ? "dem" : "det"} (fx samlede omkostninger) vises heller ikke.`;
}
