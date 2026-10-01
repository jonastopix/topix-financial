/**
 * src/lib/boardroomScore/score.ts — den samlede Boardroom Score, retningen
 * og «hvad løfter mest nu» (docs/boardroom-score.md §2.5, §2.6, §3).
 *
 *   score    = round( Σ point(søjler med data) / Σ max(søjler med data) × 1000 )
 *   daekning = Σ max(søjler med data) / 1000
 *   score er null, når færre end MIN_SOEJLER_MED_DATA søjler har data —
 *   manglende data straffes aldrig; de øvrige søjler skaleres op, og
 *   daekning siger, hvor meget scoren hviler på.
 *
 *   forrige  = samme dom med `nu` én måned tilbage på de rækker, der DA var
 *              godkendt (første godkendelse ≤ det tidligere tidspunkt; en
 *              række uden kendt godkendelse var der ikke) — retningen uden
 *              lager. Begrænsning (rådets fund 4): budget og mål har intet
 *              tidspunkt i grundlaget og regnes som nu.
 *
 *   Handlinger: én pr. søjle, regnet som marginal effekt på den SAMLEDE score
 *   (disciplin ved simulering af handlingen, de tre tal ved et skridt på
 *   kurven). loefterMest = størst gevinst; ved lige: disciplin, likviditet,
 *   indtjening, vækst (adfærd før tal).
 */
import { kbhDato, kbhDele, kbhTilUtc, laegMaanederTilDato } from "@/lib/hverdage";
import { maanedsnavn } from "@/lib/maanedsnoegle";
import { interpoler } from "./kurve";
import { alleSoejler, INDTJENING_KNAEK, LIKVIDITET_KNAEK, VAEKST_KNAEK } from "./soejler";
import { aabenMaaned, erMaalt, frist, fristDato, maalteEfterNoegle, senesteMaanedMedPasseretFrist, streakDom } from "./streak";
import type { Handling, ScoreDom, ScoreGrundlag, ScoreMaaned, Soejler, SoejleDom, SoejleNavn } from "./typer";

export const MIN_SOEJLER_MED_DATA = 2;
export const SCORE_MAX = 1000;

const RAEKKEFOELGE: SoejleNavn[] = ["disciplin", "likviditet", "indtjening", "vaekst"];

export function samlet(soejler: Soejler): { score: number | null; daekning: number; medData: number } {
  let point = 0;
  let max = 0;
  let medData = 0;
  for (const navn of RAEKKEFOELGE) {
    const s = soejler[navn];
    if (s.status !== "ok") continue;
    point += s.point;
    max += s.max;
    medData++;
  }
  const daekning = max / SCORE_MAX;
  if (medData < MIN_SOEJLER_MED_DATA || max === 0) return { score: null, daekning, medData };
  return { score: Math.round((point / max) * SCORE_MAX), daekning, medData };
}

/** «15.721» — hele kroner, dansk tusindtal, uden fortegn. */
export function krTekst(v: number): string {
  return Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** «12/10» af en «YYYY-MM-DD». */
function datoTekst(dato: string): string {
  return `${Number(dato.slice(8, 10))}/${Number(dato.slice(5, 7))}`;
}

/** Samme klokkeslæt én måned tilbage, dansk tid. */
export function enMaanedTilbage(nu: Date): Date {
  const { time, minut } = kbhDele(nu);
  return kbhTilUtc(laegMaanederTilDato(kbhDato(nu), -1), time, minut);
}

/** Samlet score, når én søjle erstattes — den samlede gevinst af en handling. null når scoren ikke findes på nogen side. */
function gevinstVed(soejler: Soejler, erstat: SoejleDom): number | null {
  const foer = samlet(soejler).score;
  const efter = samlet({ ...soejler, [erstat.navn]: erstat } as Soejler).score;
  if (foer === null || efter === null) return null;
  return efter - foer;
}

function medPoint<N extends SoejleNavn>(s: SoejleDom<N>, point: number): SoejleDom<N> {
  return s.status === "ok" ? { ...s, point } : s;
}

function handlingerFor(g: ScoreGrundlag, nu: Date, soejler: Soejler): Handling[] {
  const ud: Handling[] = [];

  // ── Disciplin: simuleringen, ikke en tabel ──
  const maalte = maalteEfterNoegle(g.maaneder);
  const aaben = aabenMaaned(nu);
  const passeret = senesteMaanedMedPasseretFrist(nu);
  if (!erMaalt(maalte.get(aaben))) {
    // Godkend den åbne måned senest fristen: dommen ved fristens udløb MED rækken (rettidig) mod UDEN.
    const fd = fristDato(aaben);
    const efterFrist = new Date(frist(aaben).getTime() + 1);
    const simuleret: ScoreMaaned = { key: aaben, basis: "measured", foersteGodkendtAt: nu.toISOString(), metrics: {} };
    // Kun disciplinsøjlen simuleres; de tre tal-søjler holdes som nu (den simulerede række bærer ingen tal).
    const uden = alleSoejler(g, efterFrist).disciplin;
    const med = alleSoejler({ ...g, maaneder: [...g.maaneder, simuleret] }, efterFrist).disciplin;
    const basis = { ...soejler, disciplin: uden };
    const gevinst = uden.status === "ok" && med.status === "ok" && samlet(basis).score !== null ? gevinstVed(basis, med) : null;
    ud.push({ soejle: "disciplin", tekst: `Upload og godkend ${maanedsnavn(aaben)} senest ${datoTekst(fd)}.`, gevinst, sti: "/reports" });
  } else if (!erMaalt(maalte.get(passeret))) {
    const simuleret: ScoreMaaned = { key: passeret, basis: "measured", foersteGodkendtAt: nu.toISOString(), metrics: {} };
    const med = alleSoejler({ ...g, maaneder: [...g.maaneder, simuleret] }, nu);
    const gevinst = med.disciplin.status === "ok" ? gevinstVed(soejler, med.disciplin) : null;
    ud.push({ soejle: "disciplin", tekst: `Upload og godkend ${maanedsnavn(passeret)} — måneden mangler.`, gevinst, sti: "/reports" });
  } else if (!g.harBudgetForAaret) {
    const med = alleSoejler({ ...g, harBudgetForAaret: true }, nu);
    ud.push({ soejle: "disciplin", tekst: `Læg et budget for ${kbhDele(nu).aar}.`, gevinst: gevinstVed(soejler, med.disciplin), sti: "/budget" });
  } else if (!g.harMaal) {
    const med = alleSoejler({ ...g, harMaal: true }, nu);
    ud.push({ soejle: "disciplin", tekst: "Sæt dit første mål.", gevinst: gevinstVed(soejler, med.disciplin), sti: "/kpis" });
  }

  // ── Likviditet: én måneds omkostninger mere i banken ──
  const l = soejler.likviditet;
  if (l.status === "ok") {
    const point = interpoler(LIKVIDITET_KNAEK, l.detaljer.runwayMaaneder + 1);
    ud.push({
      soejle: "likviditet",
      tekst: `Én måneds omkostninger mere i banken (${krTekst(l.detaljer.maanedligOmkostning)} kr.).`,
      gevinst: gevinstVed(soejler, medPoint(l, point)),
      sti: null,
    });
  } else {
    ud.push({ soejle: "likviditet", tekst: "Upload en rapport med banksaldo, så likviditeten kan regnes.", gevinst: null, sti: "/reports" });
  }

  // ── Indtjening: ét procentpoint mere i margin ──
  const i = soejler.indtjening;
  if (i.status === "ok") {
    const point = interpoler(INDTJENING_KNAEK, i.detaljer.margin + 0.01);
    ud.push({ soejle: "indtjening", tekst: "Ét procentpoint mere i resultatmargin.", gevinst: gevinstVed(soejler, medPoint(i, point)), sti: null });
  } else {
    ud.push({ soejle: "indtjening", tekst: "Godkend flere måneder, så marginen kan regnes.", gevinst: null, sti: "/reports" });
  }

  // ── Vækst: fem procent mere end sammenligningen ──
  const v = soejler.vaekst;
  if (v.status === "ok") {
    const point = interpoler(VAEKST_KNAEK, v.detaljer.vaekst + 0.05);
    ud.push({ soejle: "vaekst", tekst: "Fem procent mere omsætning end sammenligningen.", gevinst: gevinstVed(soejler, medPoint(v, point)), sti: null });
  } else {
    ud.push({ soejle: "vaekst", tekst: "Godkend flere måneder i træk, så væksten kan regnes.", gevinst: null, sti: "/reports" });
  }

  return ud;
}

/** Størst gevinst vinder; ved lige: rækkefølgen disciplin → likviditet → indtjening → vækst. Uden nogen gevinst > 0: første handling uden data, ellers null. */
export function vaelgLoefterMest(handlinger: readonly Handling[]): Handling | null {
  let bedst: Handling | null = null;
  for (const navn of RAEKKEFOELGE) {
    const h = handlinger.find((x) => x.soejle === navn);
    if (!h || h.gevinst === null || h.gevinst <= 0) continue;
    if (bedst === null || h.gevinst > (bedst.gevinst as number)) bedst = h;
  }
  if (bedst) return bedst;
  return handlinger.find((h) => h.gevinst === null) ?? null;
}

/** Grundlaget, som det så ud på `tidspunkt`: kun måneder, hvis første godkendelse er ≤ tidspunktet. Ukendt godkendelse = ikke med. */
export function grundlagPaa(g: ScoreGrundlag, tidspunkt: Date): ScoreGrundlag {
  const t = tidspunkt.getTime();
  return {
    ...g,
    maaneder: g.maaneder.filter((m) => {
      if (!m.foersteGodkendtAt) return false;
      const g0 = new Date(m.foersteGodkendtAt).getTime();
      return Number.isFinite(g0) && g0 <= t;
    }),
  };
}

export function boardroomScore(g: ScoreGrundlag, nu: Date): ScoreDom {
  const soejler = alleSoejler(g, nu);
  const { score, daekning, medData } = samlet(soejler);
  const foer = enMaanedTilbage(nu);
  const forrige = samlet(alleSoejler(grundlagPaa(g, foer), foer)).score;
  const handlinger = handlingerFor(g, nu, soejler);
  const mangler = RAEKKEFOELGE.filter((n) => soejler[n].status !== "ok");
  return {
    score,
    daekning,
    soejler,
    forrige,
    streak: streakDom(g.maaneder, g.kontraktStart, nu),
    handlinger,
    loefterMest: vaelgLoefterMest(handlinger),
    ikkeNokData:
      score === null
        ? `Scoren kræver data i mindst ${MIN_SOEJLER_MED_DATA} søjler — der er ${medData}. Mangler: ${mangler.join(", ")}.`
        : null,
  };
}
