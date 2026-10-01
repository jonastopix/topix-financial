/**
 * scoreKort — ordene på medlemmets Boardroom Score-kort (forsiden, 30/9-2026;
 * Jonas D3 «Boardroom Score (0–1000) plus tal-streak først»; designet i
 * docs/boardroom-score.md §7). REN: tager motorens færdige dom
 * (src/lib/boardroomScore) og giver sætninger — regner INGEN point, ingen
 * gevinst, ingen frist selv. Kortet (components/hjemmebane/boardroom/
 * ScoreKort.tsx) tegner kun det, der står her.
 *
 * Husets «Din måned»-mønster (§7): retning i ORD, ingen procent, ingen
 * farve for op/ned. «Scoren er et helbredstal, ikke en kreditvurdering»
 * (§5 pkt. 2) står på kortet.
 */
import { krTekst } from "@/lib/boardroomScore/score";
import { flytMaaned, fristDato } from "@/lib/boardroomScore/streak";
import { loefterMitTal } from "@/lib/boardroomScore/loefter";
import type { Handling, ScoreDom, Soejler, SoejleNavn, StreakDom } from "@/lib/boardroomScore/typer";
import { maanedsnavn } from "@/lib/maanedsnoegle";

export const SCORE_FORBEHOLD = "Scoren er et helbredstal, ikke en kreditvurdering.";
/** Rolig tomtilstand, mens hukommelsen om første godkendelse (migration 20260930130000) ikke findes i drift. */
export const SCORE_AFVENTER_OVERSKRIFT = "Din Boardroom Score er på vej";
export const SCORE_AFVENTER_TEKST = "Vi gør din score og din tal-streak klar. Den dukker op her af sig selv — du skal ikke gøre noget.";
export const SCORE_FEJL_TEKST = "Din score kunne ikke hentes.";
export const SCORE_LOEFTER_OVERSKRIFT = "Hvad løfter dit tal";
/** Knappen, der folder resten ud (de øvrige løftere, søjlernes tal i ord, streakens status) — lukket som standard. */
export const SCORE_DETALJER_KNAP = "Se hvad der tæller";
export const SCORE_DETALJER_KNAP_LUK = "Skjul detaljer";
export const SCORE_INGEN_TAL = "Ikke nok tal endnu";
export const SCORE_SOEJLER_OVERSKRIFT = "Søjlerne";
/** Overskriften over løfter nr. 2–3 i detaljerne — den øverste står altid synlig under SCORE_LOEFTER_OVERSKRIFT. */
export const SCORE_OEVRIGE_OVERSKRIFT = "Også værd at gøre";
/** Mærket på en løfter-linje uden link (motorens «mere i banken/margin/omsætning»): et mål, ikke en knap (rådets fund 6, 30/9). */
export const LOEFTER_MAAL_MAERKE = "Mål";
/** Effekten, når scoren endnu er null: et tal ville stå over for «Ikke nok tal endnu» (rådets fund 2). */
export const EFFEKT_FOERSTE_SCORE = "Giver dig din første score";
/** Effekten uden regnet gevinst, når søjlen mangler data. */
export const EFFEKT_LAASER_OP = "Låser en søjle op";
/** Effekten uden regnet gevinst, når søjlen HAR data (fx disciplin: en manglende måned) — der er intet at låse op (rådets fund 3). */
export const EFFEKT_GIVER_SCORE = "Tæller med i din score";

export const SOEJLE_ORDEN: readonly SoejleNavn[] = ["likviditet", "indtjening", "vaekst", "disciplin"];
export const SOEJLE_LABEL: Record<SoejleNavn, string> = {
  likviditet: "Likviditet",
  indtjening: "Indtjening",
  vaekst: "Vækst",
  disciplin: "Disciplin",
};

/** «4,2» — én decimal, dansk komma. */
function enDecimal(v: number): string {
  return (Math.round(v * 10) / 10).toFixed(1).replace(".", ",").replace(/,0$/, "");
}

/** «12/10» af en «YYYY-MM-DD». */
function datoKort(dato: string): string {
  return `${Number(dato.slice(8, 10))}/${Number(dato.slice(5, 7))}`;
}

const maaned = (key: string): string => maanedsnavn(key) ?? key;
const storForbogstav = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Statussen uden streak (designgennemsynet 1/10 fund 2): fristen står i fristlinjen og handlingen i løfteren —
 *  før sagde kortet «senest den 20.» tre gange på 60 px. */
export const STREAK_INGEN_TEKST = "Ingen streak endnu";

/** Retningen («Op fra …/Ned fra … for en måned siden») vises først, når scoren har FANDTES i en måned.
 *  Scoren gik i drift 30/9-2026; `forrige` regnes baglæns på data, ingen har set som et tal, så
 *  «Op fra 0» (alle søjler stod på 0) eller et «Ned fra 540» ved første visning er et artefakt af
 *  dataene, ikke noget medlemmet har gjort (designgennemsynet 1/10 fund 3).
 *  Regnestykket: 30/9 + én måned = 30/10. Sommertiden slutter søndag 25/10-2026, så 30/10 er dansk
 *  tid UTC+1: 30/10 00:00 UTC = 30/10 kl. 01:00 dansk. */
export const RETNING_VISES_FRA = new Date("2026-10-30T00:00:00Z");
export function retningVises(nu: Date): boolean {
  return nu.getTime() >= RETNING_VISES_FRA.getTime();
}

/** Retningen mod `forrige` i ord — ingen procent, ingen farve. null når den ikke kan siges. */
export function retningTekst(score: number | null, forrige: number | null): string | null {
  if (score === null || forrige === null) return null;
  if (score > forrige) return `Op fra ${forrige} for en måned siden`;
  if (score < forrige) return `Ned fra ${forrige} for en måned siden`;
  return "Samme som for en måned siden";
}

/** «Bygget på 3 af 4 søjler» — kun når scoren ikke hviler på alle fire (§2.5). */
export function daekningTekst(dom: Pick<ScoreDom, "score" | "soejler">): string | null {
  if (dom.score === null) return null;
  const medData = SOEJLE_ORDEN.filter((n) => dom.soejler[n].status === "ok").length;
  return medData < SOEJLE_ORDEN.length ? `Bygget på ${medData} af ${SOEJLE_ORDEN.length} søjler` : null;
}

export interface SoejleLinje {
  navn: SoejleNavn;
  label: string;
  /** Afrundede point; null = ikke nok data. */
  point: number | null;
  max: number;
  /** 0–1 til hairline-baren; 0 uden data. */
  andel: number;
  /** Tallet bag i ord, eller motorens grund, når søjlen mangler data. */
  detalje: string;
}

/** Tallet bag en søjle med data, i ord. Hver gren læser sin egen søjle (Soejler bevarer navn → detaljer). */
function detaljeTekst(soejler: Soejler, navn: SoejleNavn, score: number | null): string | null {
  if (navn === "likviditet") {
    const s = soejler.likviditet;
    if (s.status !== "ok") return null;
    return `${enDecimal(Math.max(0, s.detaljer.runwayMaaneder))} måneders omkostninger i banken (bank pr. ${maaned(s.detaljer.bankKey)})`;
  }
  if (navn === "indtjening") {
    const s = soejler.indtjening;
    if (s.status !== "ok") return null;
    return `${s.detaljer.resultat < 0 ? "Underskud" : "Resultat"} ${krTekst(s.detaljer.resultat)} kr. på ${krTekst(s.detaljer.omsaetning)} kr. i omsætning`;
  }
  if (navn === "vaekst") {
    const s = soejler.vaekst;
    if (s.status !== "ok") return null;
    const mod = s.detaljer.sammenligning === "aar_til_aar" ? "samme måneder sidste år" : "kvartalet før (sæson kan spille ind)";
    return `Omsætning ${krTekst(s.detaljer.nu)} kr. mod ${krTekst(s.detaljer.foer)} kr. ${mod}`;
  }
  const s = soejler.disciplin;
  if (s.status !== "ok") return null;
  // Uden score (nyt medlem) er «0 af 6 måneder godkendt, 0 til tiden» en anklage, ikke en oplysning —
  // streaken ved siden af siger allerede, hvad der skal ske (rådets fund 5). Tom detalje = ingen linje.
  if (score === null) return null;
  // «0 af 6 måneder godkendt, 0 til tiden» lyder som en anklage (designgennemsynet 1/10 fund 4) — sig det roligt.
  if (s.detaljer.maalte === 0) return `Ingen godkendte måneder i de seneste ${s.detaljer.vindue.length} endnu`;
  return `${s.detaljer.maalte} af ${s.detaljer.vindue.length} måneder godkendt, ${s.detaljer.rettidige} til tiden`;
}

export function soejleLinjer(dom: Pick<ScoreDom, "score" | "soejler">): SoejleLinje[] {
  return SOEJLE_ORDEN.map((navn) => {
    const s = dom.soejler[navn];
    const label = SOEJLE_LABEL[navn];
    if (s.status !== "ok") return { navn, label, point: null, max: s.max, andel: 0, detalje: s.grund };
    const andel = s.max > 0 ? Math.min(1, Math.max(0, s.point / s.max)) : 0;
    return { navn, label, point: Math.round(s.point), max: s.max, andel, detalje: detaljeTekst(dom.soejler, navn, dom.score) ?? "" };
  });
}

export interface StreakLinjer {
  /** Tallet i flammetælleren (måneder i træk). */
  laengde: number;
  enhed: string;
  status: string;
  /** «Næste frist: september senest 20/10 (14 hverdage)» — eller «… er i hus». */
  frist: string;
  bedste: string | null;
}

export function streakLinjer(streak: StreakDom): StreakLinjer {
  const enhed = streak.laengde === 1 ? "måned i træk" : "måneder i træk";
  const status =
    streak.status === "aktiv"
      ? "Dine tal er godkendt til tiden"
      : streak.status === "brudt"
        ? "Streaken er brudt — næste frist starter en ny"
        : STREAK_INGEN_TEKST;
  const n = streak.naesteFrist;
  const hverdage = n.hverdageTil === 0 ? "i dag" : n.hverdageTil === 1 ? "1 hverdag" : `${n.hverdageTil} hverdage`;
  const fristLinje = `Næste frist: ${maaned(n.key)} senest ${datoKort(fristDato(n.key))} (${hverdage})`;
  // Den åbne måned er allerede i hus: sig det, og peg på den følgende frist.
  // (naesteFrist.key er da måneden EFTER den åbne — streak.ts:streakDom.)
  const frist = streak.aabenMaanedGodkendt ? `${fristLinje}. ${storForbogstav(maaned(flytMaaned(n.key, -1)))} er allerede i hus.` : fristLinje;
  const bedste = streak.bedste > streak.laengde ? `Din bedste: ${streak.bedste}` : null;
  return { laengde: streak.laengde, enhed, status, frist, bedste };
}

export interface LoefterLinje {
  tekst: string;
  /** «+18 point», «Giver dig din første score», «Låser en søjle op» eller «Tæller med i din score» (effektTekst). */
  effekt: string;
  sti: Handling["sti"];
  soejle: SoejleNavn;
  /** «handling» (har et link — noget, man kan gøre nu) eller «maal» (intet link — et tal at nå; kortet mærker den LOEFTER_MAAL_MAERKE). */
  art: "handling" | "maal";
}

/**
 * Effekten i ord — aldrig et tal, kortet ikke kan stå inde for:
 *   gevinst regnet, score null     → «Giver dig din første score» (motoren regner gevinsten mod en
 *                                    simuleret score; et «+400 point» over «Ikke nok tal endnu» er nonsens)
 *   gevinst regnet, score findes   → «+N point»
 *   gevinst null, søjlen uden data → «Låser en søjle op»
 *   gevinst null, søjlen har data  → «Tæller med i din score»
 */
export function effektTekst(h: Pick<Handling, "gevinst" | "soejle">, dom: Pick<ScoreDom, "score" | "soejler">): string {
  if (h.gevinst !== null) return dom.score === null ? EFFEKT_FOERSTE_SCORE : `+${Math.round(h.gevinst)} point`;
  return dom.soejler[h.soejle].status !== "ok" ? EFFEKT_LAASER_OP : EFFEKT_GIVER_SCORE;
}

/**
 * De 1–3 handlinger fra loefterMitTal i ord — teksten er motorens, ordret, og
 * RÆKKEFØLGEN er motorens (størst regnet gevinst først; første = loefterMest).
 * En linje uden link er et MÅL og mærkes som det (rådets fund 6): at sortere
 * links først ville sætte en mindre gevinst over en større under overskriften
 * «Hvad løfter dit tal» og gøre kortet uenigt med motorens loefterMest.
 */
export function loefterLinjer(dom: Pick<ScoreDom, "handlinger" | "score" | "soejler">): LoefterLinje[] {
  return loefterMitTal(dom).map((h) => ({
    tekst: h.tekst,
    effekt: effektTekst(h, dom),
    sti: h.sti,
    soejle: h.soejle,
    art: h.sti ? "handling" : "maal",
  }));
}

/** Når scoren er null: hvilke søjler der mangler, i medlemmets ord. */
export function ikkeNokDataTekst(dom: Pick<ScoreDom, "score" | "soejler">): string | null {
  if (dom.score !== null) return null;
  const mangler = SOEJLE_ORDEN.filter((n) => dom.soejler[n].status !== "ok").map((n) => SOEJLE_LABEL[n].toLowerCase());
  const liste = mangler.length <= 1 ? mangler.join("") : `${mangler.slice(0, -1).join(", ")} og ${mangler[mangler.length - 1]}`;
  return `Scoren kræver tal i mindst to af de fire søjler. Der mangler endnu tal til ${liste}.`;
}

// ── Tælleren ────────────────────────────────────────────────────────────────
/** Varigheden af tallets optælling (ms). Diskret: kort, ingen overskydning. */
export const TAEL_OP_MS = 900;

/**
 * Tallet undervejs i optællingen fra `fra` til `til` efter `t` ms:
 *   p = min(1, t / varighed);  e = 1 − (1 − p)³  (ease-out cubic — hurtig start, blød landing)
 *   værdi = round(fra + (til − fra) × e)
 * t ≤ 0 → fra; t ≥ varighed → til (præcist, ingen afrundingsrest).
 */
export function taelOpVaerdi(fra: number, til: number, t: number, varighed: number = TAEL_OP_MS): number {
  if (!(varighed > 0) || t >= varighed) return til;
  if (t <= 0) return fra;
  const p = t / varighed;
  const e = 1 - Math.pow(1 - p, 3);
  return Math.round(fra + (til - fra) * e);
}

// ── Ringen ──────────────────────────────────────────────────────────────────
/** Ringens radius i SVG-enheder (viewBox 0 0 120 120, streg 5 → 60 − 5/2 − luft). */
export const RING_RADIUS = 54;

/**
 * Buen for et tal på skalaen 0–max (i skala, ingen pynt):
 *   omkreds = 2π × radius
 *   laengde = omkreds × clamp(vaerdi / max, 0, 1)
 * Eksempel: 733 af 1000 med r = 54 → omkreds 339,29 → buen 248,70.
 * null/NaN/max ≤ 0 → laengde 0 (kun sporet tegnes).
 */
export function ringBue(vaerdi: number | null, max: number = 1000, radius: number = RING_RADIUS): { omkreds: number; laengde: number } {
  const omkreds = 2 * Math.PI * radius;
  if (vaerdi === null || !Number.isFinite(vaerdi) || !(max > 0)) return { omkreds, laengde: 0 };
  const andel = Math.min(1, Math.max(0, vaerdi / max));
  return { omkreds, laengde: omkreds * andel };
}

/**
 * Streaken som ÉN linje ved siden af flammen: «7 måneder i træk» + fristen.
 * Uden streak (længde 0 — nyt medlem eller brudt) er «0 måneder i træk» en
 * anklage, ikke en opmuntring (rådets gennemsyn af #1189): linjen bærer da
 * statussen selv («Ingen streak endnu» /
 * «Streaken er brudt — næste frist starter en ny»), stadig med næste frist.
 * `erStatus` fortæller kortet, at statussen allerede står i linjen, så den
 * ikke gentages i detaljerne.
 */
export function streakKortLinje(streak: StreakDom): { tal: string; frist: string; erStatus: boolean } {
  const l = streakLinjer(streak);
  if (l.laengde === 0) return { tal: l.status, frist: l.frist, erStatus: true };
  return { tal: `${l.laengde} ${l.enhed}`, frist: l.frist, erStatus: false };
}
