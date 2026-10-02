/**
 * src/lib/boardroomScore/score.ts — den samlede Boardroom Score, retningen
 * og «hvad løfter mest nu» (docs/boardroom-score.md §2.5, §2.6, §3).
 *
 *   score    = round( Σ point(søjler med data) / Σ max(ALLE fire søjler) × 1000 )
 *            = round( Σ point(søjler med data) )      (Σ max = 4 × 250 = 1000)
 *   daekning = Σ max(søjler med data) / 1000
 *   En søjle uden data giver 0 point (Jonas 1/10-2026 11:29: «drop
 *   opskaleringen»). Den gamle regel delte med Σ max(søjler MED data) og
 *   skalerede op — Brilleværk (indtjening 250, disciplin 150, likviditet og
 *   vækst uden data) fik (250 + 150) / 500 × 1000 = 800; nu 250 + 150 = 400.
 *   Opskaleringen belønnede huller: at lægge banktallet ind kunne SÆNKE
 *   scoren. Nu kan mere data kun løfte tallet (en søjle går fra 0 til ≥ 0).
 *   score er stadig null, når færre end MIN_SOEJLER_MED_DATA søjler har data;
 *   daekning siger, hvor mange af de 1000 point der KAN optjenes nu.
 *
 *   forrige  = samme dom med `nu` én måned tilbage på de rækker, der DA var
 *              godkendt (første godkendelse ≤ det tidligere tidspunkt; en
 *              række uden kendt godkendelse var der ikke) — retningen uden
 *              lager. Begrænsning (rådets fund 4): budget og mål har intet
 *              tidspunkt i grundlaget og regnes som nu.
 *
 *   En handling, der LÅSER en søjle op, har nu en reel gevinst (0 → søjlens
 *   point), men den er ikke regnet: søjlens point afhænger af tal, vi ikke
 *   har (bankbeløbet, marginen, væksten), og alle tre kurver starter i 0
 *   (LIKVIDITET/INDTJENING/VAEKST_KNAEK), så den eneste sande nedre grænse er
 *   0. gevinst = null → fladen siger «Låser en søjle op».
 *
 *   Handlinger: én pr. søjle, regnet som marginal effekt på den SAMLEDE score
 *   (disciplin ved simulering af handlingen, de tre tal ved et skridt på
 *   kurven). loefterMest = størst gevinst; ved lige: disciplin, likviditet,
 *   indtjening, vækst (adfærd før tal).
 */
import { kortDato } from "@/lib/hjemmebane/forsideDato";
import { kbhDato, kbhDele, kbhTilUtc, laegMaanederTilDato } from "@/lib/hverdage";
import { maanedsnavn } from "@/lib/maanedsnoegle";
import { MAX_AKTIVE_MAAL } from "@/lib/hjemmebane/maal";
import { interpoler } from "./kurve";
import { alleSoejler, INDTJENING_KNAEK, LIKVIDITET_KNAEK, VAEKST_KNAEK } from "./soejler";
import { aabenMaaned, erMaalt, frist, fristDato, maalteEfterNoegle, senesteMaanedMedPasseretFrist, streakDom } from "./streak";
import type { Handling, ScoreDom, ScoreGrundlag, ScoreMaaned, Soejler, SoejleDom, SoejleNavn } from "./typer";

export const MIN_SOEJLER_MED_DATA = 2;
export const SCORE_MAX = 1000;

/** Mål-løfterens to ord (skive 3): «Sæt …» når der er plads; «Sig ja …» når ubekræftede fylder pladserne (vejen er «Behold»). */
export const LOEFTER_SAET_MAAL_TEKST = "Sæt et mål med en frist.";
export const LOEFTER_SIG_JA_TEKST = "Sig ja til et af jeres mål med en frist.";

const RAEKKEFOELGE: SoejleNavn[] = ["disciplin", "likviditet", "indtjening", "vaekst"];

export function samlet(soejler: Soejler): { score: number | null; daekning: number; medData: number } {
  let point = 0;
  let maxMedData = 0;
  let maxAlle = 0;
  let medData = 0;
  for (const navn of RAEKKEFOELGE) {
    const s = soejler[navn];
    maxAlle += s.max;
    if (s.status !== "ok") continue; // uden data: 0 point — nævneren bærer stadig søjlens max
    point += s.point;
    maxMedData += s.max;
    medData++;
  }
  const daekning = maxMedData / SCORE_MAX;
  if (medData < MIN_SOEJLER_MED_DATA || maxAlle === 0) return { score: null, daekning, medData };
  return { score: Math.round((point / maxAlle) * SCORE_MAX), daekning, medData };
}

/** «15.721» — hele kroner, dansk tusindtal, uden fortegn. */
export function krTekst(v: number): string {
  return Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** «12/10» af en «YYYY-MM-DD». */
/** Fristen i forsidens ENE datoformat (docs/forside-v3.md §0; UX-rådet 2/10: «senest 20/10» brød det):
    «tirs. 20. okt.». Året vises ikke — fristen ligger altid i den kommende måned. */
function datoTekst(dato: string): string {
  return kortDato(dato, new Date(`${dato}T12:00:00Z`));
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
    // Skive 3 (2/10-2026): målet bor på Dine mål (/milestones) — ikke KPI-pejlemærkerne på /kpis.
    // Ordene er sande (rådets fund 4): pointet gives for et aktivt, bekræftet mål MED FRIST (taellerSomScoreMaal) —
    // en virksomhed kan have mål uden frist og stadig mangle pointet, så «dit første mål» ville lyve.
    // Runde 2, fund 1: fylder de UBEKRÆFTEDE databasens pladser (≥ MAX_AKTIVE_MAAL — triggeren tæller dem),
    // afviser databasen «Sæt et mål», og vejen er «Behold»/«Det er vores mål» på et mål med frist.
    // Punkt 13 (2/10, migration 20261002241000): tæller triggeren kun bekræftede (pladserTaellerKunBekraeftede,
    // målt — ikke antaget), fylder de ubekræftede ingen plads, og «Sæt et mål …» er sandt igen.
    const pladserneFuldeAfUbekraeftede = g.pladserTaellerKunBekraeftede !== true && (g.ubekraeftedeMaal ?? 0) >= MAX_AKTIVE_MAAL;
    const tekst = pladserneFuldeAfUbekraeftede ? LOEFTER_SIG_JA_TEKST : LOEFTER_SAET_MAAL_TEKST;
    ud.push({ soejle: "disciplin", tekst, gevinst: gevinstVed(soejler, med.disciplin), sti: "/milestones" });
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
