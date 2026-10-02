/**
 * src/lib/boardroomScore/soejler.ts — de fire søjler, hver en ren dom
 * (docs/boardroom-score.md §2). Alle omkostningssummer går gennem
 * omkostningsnoegler.ts (husets regel 17/9) — ingen lokal liste.
 *
 * KUN MÅLTE, AFSLUTTEDE måneder indgår (data_basis measured, key < måneden
 * «nu» i Danmark). Estimater er ikke måneder. En manglende nøgle er umålt,
 * aldrig 0. Fravær giver «ikke_nok_data» — undtagen i disciplin, hvor
 * fraværet ER adfærden.
 *
 * FRISKHED (rådets fund 3, 30/9): de tre tal-søjler siger «ikke_nok_data»,
 * når deres seneste måned er ældre end FRISKHED_MAANEDER måneder op til den
 * seneste måned med passeret frist — en score på et år gamle tal er ikke et
 * helbredstal «nu». Likviditetens banktal måles på samme regel (bankKey).
 */
import { CANONICAL, ebtRegnet, sumOmkostninger } from "@/lib/omkostningsnoegler";
import { erMaanedAfsluttet } from "@/lib/maanedsnoegle";
import { interpoler, type Knaek } from "./kurve";
import { erGodkendtTilTiden, erMaalt, flytMaaned, foersteTaellendeMaaned, maalteEfterNoegle, naesteMaaned, senesteMaanedMedPasseretFrist } from "./streak";
import type { ScoreGrundlag, ScoreMaaned, Soejler, SoejleDom, SoejleNavn } from "./typer";

/** Max pr. søjle — lige vægte er et VALG (ingen kalibrering findes), ikke en måling. Jonas kan flytte dem. */
export const SOEJLE_MAX: Record<SoejleNavn, number> = { likviditet: 250, indtjening: 250, vaekst: 250, disciplin: 250 };

/** Antal måneder i vinduet for likviditet, indtjening og vækst. */
export const VINDUE_MAANEDER = 3;
/** Indtjening kræver mindst så mange måneder med både omsætning og resultat. */
export const INDTJENING_MIN_MAANEDER = 2;
/** Vækst: sammenligningsgrundlaget (Σ omsætning over tre måneder) skal være mindst dette, ellers er procenten en bombe. */
export const VAEKST_MIN_GRUNDLAG_KR = 10_000;
/** Disciplinvinduet: de seneste N måneder med passeret frist. */
export const DISCIPLIN_MAANEDER = 6;
/** Friskhed: de tre tal-søjlers seneste måned (og banktallet) skal ligge inden for så mange måneder op til seneste måned med passeret frist. */
export const FRISKHED_MAANEDER = 6;

// Knæk (x → point). Begrundelserne står i docs/boardroom-score.md §2.1–2.3.
export const LIKVIDITET_KNAEK: Knaek = [[0, 0], [1, 50], [3, 150], [6, 225], [9, 250]];
export const INDTJENING_KNAEK: Knaek = [[-0.2, 0], [0, 100], [0.05, 160], [0.1, 200], [0.2, 250]];
export const VAEKST_KNAEK: Knaek = [[-0.2, 0], [0, 125], [0.1, 190], [0.25, 250]];

export const DISCIPLIN_RYTME_MAX = 150;
export const DISCIPLIN_RETTIDIGHED_MAX = 50;
export const DISCIPLIN_BUDGET_POINT = 25;
export const DISCIPLIN_MAAL_POINT = 25;

const tal = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Målte, afsluttede måneder set fra `nu`, sorteret ældste først; én pr. nøgle. */
export function maalteAfsluttede(maaneder: readonly ScoreMaaned[], nu: Date): ScoreMaaned[] {
  return [...maalteEfterNoegle(maaneder).values()]
    .filter((m) => erMaanedAfsluttet(m.key, nu))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Ældste måned, der stadig er «frisk» set fra `nu`:
 *   aeldsteFrisk = senesteMaanedMedPasseretFrist(nu) − (FRISKHED_MAANEDER − 1)
 * 30/9-2026: seneste passerede frist er august → marts–august er de seks friske måneder.
 */
export function aeldsteFriskeMaaned(nu: Date): string {
  return flytMaaned(senesteMaanedMedPasseretFrist(nu), -(FRISKHED_MAANEDER - 1));
}

const erFrisk = (key: string, nu: Date): boolean => key >= aeldsteFriskeMaaned(nu);

const forGammel = (hvad: string, key: string): string =>
  `${hvad} er fra ${key} — ældre end ${FRISKHED_MAANEDER} måneder. Godkend de seneste måneder, så tallet er nu.`;

/**
 * Kontantforbrug pr. måned (rådets fund 5): vareforbrug + drift + finansielle
 * omkostninger — IKKE afskrivninger, som ikke er penge ud af banken. Nøglerne
 * er husets (omkostningsnoegler.ts: omfanget «vareforbrug_og_drift» plus
 * CANONICAL.finans); ingen lokal liste. Σ|beløb|; `fundet` = antal målte poster.
 */
export function kontantforbrug(metrics: Record<string, number | null>): { sum: number; fundet: number } {
  const drift = sumOmkostninger(metrics, CANONICAL, "vareforbrug_og_drift");
  const finans = CANONICAL.finans ? tal(metrics[CANONICAL.finans]) : null;
  if (finans === null) return drift;
  return { sum: drift.sum + Math.abs(finans), fundet: drift.fundet + 1 };
}

/** Resultat før skat: `ebt` når målt, ellers regnet af posterne (ebtRegnet). */
export function resultatAf(m: ScoreMaaned): number | null {
  const ebt = tal(m.metrics.ebt);
  if (ebt !== null) return ebt;
  return ebtRegnet(tal(m.metrics.gross_profit), m.metrics, CANONICAL);
}

const ikkeNok = <N extends SoejleNavn>(navn: N, grund: string): SoejleDom<N> => ({ navn, max: SOEJLE_MAX[navn], status: "ikke_nok_data", grund });

// ── Likviditet ─────────────────────────────────────────────────────────────
//   runway = bank / gennemsnit(kontantforbrug over de seneste ≤ 3 målte afsluttede måneder med kontantforbrug)
//   point  = interpoler(LIKVIDITET_KNAEK, runway)
//   Friskhed: både banktallet og den seneste omkostningsmåned skal være ≥ aeldsteFriskeMaaned(nu).
export function likviditet(g: ScoreGrundlag, nu: Date): SoejleDom<"likviditet"> {
  const rows = maalteAfsluttede(g.maaneder, nu);
  const bankRow = [...rows].reverse().find((m) => tal(m.metrics.cash) !== null);
  if (!bankRow) return ikkeNok("likviditet", "Ingen målt måned har et banktal.");
  if (!erFrisk(bankRow.key, nu)) return ikkeNok("likviditet", forGammel("Det seneste banktal", bankRow.key));
  const medOmk = rows.filter((m) => kontantforbrug(m.metrics).fundet > 0).slice(-VINDUE_MAANEDER);
  if (medOmk.length === 0) return ikkeNok("likviditet", "Ingen målt måned har omkostninger.");
  const senesteOmk = medOmk[medOmk.length - 1].key;
  if (!erFrisk(senesteOmk, nu)) return ikkeNok("likviditet", forGammel("Den seneste måned med omkostninger", senesteOmk));
  const sum = medOmk.reduce((s, m) => s + kontantforbrug(m.metrics).sum, 0);
  const gennemsnit = sum / medOmk.length;
  if (gennemsnit <= 0) return ikkeNok("likviditet", "Omkostningerne er nul — runway kan ikke regnes.");
  const bank = tal(bankRow.metrics.cash) as number;
  const runway = bank / gennemsnit;
  return {
    navn: "likviditet",
    max: SOEJLE_MAX.likviditet,
    status: "ok",
    point: interpoler(LIKVIDITET_KNAEK, runway),
    detaljer: { bank, bankKey: bankRow.key, maanedligOmkostning: gennemsnit, omkostningsMaaneder: medOmk.length, runwayMaaneder: runway },
  };
}

// ── Indtjening ─────────────────────────────────────────────────────────────
//   margin = Σ resultat / Σ omsætning over de seneste ≤ 3 målte afsluttede måneder med begge tal (mindst 2)
//   point  = interpoler(INDTJENING_KNAEK, margin)
export function indtjening(g: ScoreGrundlag, nu: Date): SoejleDom<"indtjening"> {
  const rows = maalteAfsluttede(g.maaneder, nu)
    .slice(-VINDUE_MAANEDER)
    .map((m) => ({ key: m.key, oms: tal(m.metrics.revenue), res: resultatAf(m) }))
    .filter((r): r is { key: string; oms: number; res: number } => r.oms !== null && r.res !== null);
  if (rows.length < INDTJENING_MIN_MAANEDER) {
    return ikkeNok("indtjening", `Kræver mindst ${INDTJENING_MIN_MAANEDER} målte måneder med omsætning og resultat — der er ${rows.length}.`);
  }
  const senesteKey = rows[rows.length - 1].key;
  if (!erFrisk(senesteKey, nu)) return ikkeNok("indtjening", forGammel("Den seneste måned med omsætning og resultat", senesteKey));
  const omsaetning = rows.reduce((s, r) => s + r.oms, 0);
  const resultat = rows.reduce((s, r) => s + r.res, 0);
  if (omsaetning <= 0) return ikkeNok("indtjening", "Omsætningen i vinduet er nul eller negativ — marginen kan ikke regnes.");
  const margin = resultat / omsaetning;
  return {
    navn: "indtjening",
    max: SOEJLE_MAX.indtjening,
    status: "ok",
    point: interpoler(INDTJENING_KNAEK, margin),
    detaljer: { omsaetning, resultat, margin, maaneder: rows.map((r) => r.key) },
  };
}

// ── Vækst ──────────────────────────────────────────────────────────────────
//   vindue = de 3 seneste målte afsluttede måneder — skal være tre SAMMENHÆNGENDE kalendermåneder med omsætning
//   før    = samme tre måneder året før (alle målt m. omsætning)      → aar_til_aar
//            ellers de tre måneder umiddelbart før vinduet (alle målt) → kvartal_til_kvartal
//   vaekst = (Σ nu − Σ før) / Σ før ;  point = interpoler(VAEKST_KNAEK, vaekst)
export function vaekst(g: ScoreGrundlag, nu: Date): SoejleDom<"vaekst"> {
  const alle = maalteAfsluttede(g.maaneder, nu);
  const efterNoegle = new Map(alle.map((m) => [m.key, m]));
  const oms = (key: string): number | null => {
    const m = efterNoegle.get(key);
    return m ? tal(m.metrics.revenue) : null;
  };
  const vindue = alle.slice(-VINDUE_MAANEDER).map((m) => m.key);
  if (vindue.length < VINDUE_MAANEDER) return ikkeNok("vaekst", `Kræver ${VINDUE_MAANEDER} målte måneder — der er ${vindue.length}.`);
  const senesteKey = vindue[vindue.length - 1];
  if (!erFrisk(senesteKey, nu)) return ikkeNok("vaekst", forGammel("Den seneste målte måned", senesteKey));
  for (let i = 1; i < vindue.length; i++) {
    if (naesteMaaned(vindue[i - 1]) !== vindue[i]) return ikkeNok("vaekst", "De tre seneste målte måneder hænger ikke sammen — der mangler en måned.");
  }
  const nuTal = vindue.map(oms);
  if (nuTal.some((v) => v === null)) return ikkeNok("vaekst", "En af de tre seneste måneder mangler omsætning.");
  const sumAf = (keys: string[]): number | null => {
    const v = keys.map(oms);
    return v.some((x) => x === null) ? null : (v as number[]).reduce((s, x) => s + x, 0);
  };
  const aarFoer = sumAf(vindue.map((k) => flytMaaned(k, -12)));
  const kvartalFoer = sumAf(vindue.map((k) => flytMaaned(k, -VINDUE_MAANEDER)));
  const sammenligning: "aar_til_aar" | "kvartal_til_kvartal" | null = aarFoer !== null ? "aar_til_aar" : kvartalFoer !== null ? "kvartal_til_kvartal" : null;
  if (sammenligning === null) return ikkeNok("vaekst", "Ingen sammenligning: hverken samme kvartal sidste år eller kvartalet før er målt.");
  const foer = (sammenligning === "aar_til_aar" ? aarFoer : kvartalFoer) as number;
  if (foer < VAEKST_MIN_GRUNDLAG_KR) return ikkeNok("vaekst", `Sammenligningsgrundlaget er under ${VAEKST_MIN_GRUNDLAG_KR} kr. — en procent herfra siger intet.`);
  const nuSum = (nuTal as number[]).reduce((s, x) => s + x, 0);
  const v = (nuSum - foer) / foer;
  return {
    navn: "vaekst",
    max: SOEJLE_MAX.vaekst,
    status: "ok",
    point: interpoler(VAEKST_KNAEK, v),
    detaljer: { nu: nuSum, foer, vaekst: v, vindue, sammenligning },
  };
}

// ── Disciplin ──────────────────────────────────────────────────────────────
//   vindue      = de seneste 6 måneder med passeret frist, tidligst første tællende måned
//                 (kontraktstart den 1. = samme måned, ellers måneden efter; uden kontraktstart:
//                 måneden efter den tidligste første godkendelse — streak.ts:foersteTaellendeMaaned)
//   rytme       = 150 × maalte / vindue.length
//   rettidighed =  50 × rettidige / maalte          (0 når maalte = 0)
//   budget      =  25 hvis harBudgetForAaret ; maal = 25 hvis harMaal
//   harMaal (skive 3, 2/10-2026): mindst ét mål på DINE MÅL, der er aktivt, bekræftet af medlemmet
//   og har en frist — og for et tal-mål (art 'tal') et måltal; `art` kræves IKKE (0 af prods manual-mål
//   har en, målt 2/10) (lib/hjemmebane/maalBekraeft.ts:taellerSomScoreMaal; hooken
//   useBoardroomScore.hentHarMaal). Et ubekræftet forslag og et mål uden frist giver INGEN point.
export function disciplinVindue(kontraktStart: string | null, nu: Date, maaneder: readonly ScoreMaaned[] = []): string[] {
  const foerste = foersteTaellendeMaaned(kontraktStart, maaneder);
  const ud: string[] = [];
  let p = senesteMaanedMedPasseretFrist(nu);
  for (let i = 0; i < DISCIPLIN_MAANEDER; i++) {
    if (foerste !== null && p < foerste) break;
    ud.unshift(p);
    p = flytMaaned(p, -1);
  }
  return ud;
}

export function disciplin(g: ScoreGrundlag, nu: Date): SoejleDom<"disciplin"> {
  const vindue = disciplinVindue(g.kontraktStart, nu, g.maaneder);
  if (vindue.length === 0) return ikkeNok("disciplin", "Ingen hel måned er afsluttet siden starten endnu.");
  const maalte = maalteEfterNoegle(g.maaneder);
  const maalteN = vindue.filter((k) => erMaalt(maalte.get(k))).length;
  const rettidige = vindue.filter((k) => erGodkendtTilTiden(maalte.get(k))).length;
  const rytmePoint = (DISCIPLIN_RYTME_MAX * maalteN) / vindue.length;
  const rettidighedPoint = maalteN === 0 ? 0 : (DISCIPLIN_RETTIDIGHED_MAX * rettidige) / maalteN;
  const budgetPoint = g.harBudgetForAaret ? DISCIPLIN_BUDGET_POINT : 0;
  const maalPoint = g.harMaal ? DISCIPLIN_MAAL_POINT : 0;
  return {
    navn: "disciplin",
    max: SOEJLE_MAX.disciplin,
    status: "ok",
    point: rytmePoint + rettidighedPoint + budgetPoint + maalPoint,
    detaljer: { vindue, maalte: maalteN, rettidige, rytmePoint, rettidighedPoint, budgetPoint, maalPoint },
  };
}

export function alleSoejler(g: ScoreGrundlag, nu: Date): Soejler {
  return { likviditet: likviditet(g, nu), indtjening: indtjening(g, nu), vaekst: vaekst(g, nu), disciplin: disciplin(g, nu) };
}
