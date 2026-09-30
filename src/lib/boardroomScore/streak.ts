/**
 * src/lib/boardroomScore/streak.ts — tal-streaken: «godkendte månedstal
 * senest den 10. i måneden efter» (docs/boardroom-score.md §4).
 *
 * REGLEN, kort:
 *   - En måned P tæller som «godkendt til tiden», når den har en MÅLT række
 *     (data_basis measured), og rækkens FØRSTE godkendelse (created_at —
 *     committed_at overskrives ved gen-godkendelse) er ≤ frist(P).
 *   - frist(P) = udgangen af den 10. i måneden efter P, dansk tid. Er den 10.
 *     ikke en hverdag (weekend, helligdag, lukkedag — hverdage.ts), rykkes
 *     fristen til udgangen af NÆSTE hverdag. Aldrig den anden vej.
 *   - Streaken tælles baglæns fra den seneste måned, hvis frist er passeret;
 *     den åbne måned lægger til, hvis den allerede er godkendt, og bryder
 *     aldrig.
 *   - Måneder før første HELE måned efter kontraktstart tæller ikke og bryder
 *     ikke (frysning ved start). Ingen anden nåde.
 *
 * Alt regnes i dansk tid gennem hverdage.ts og maanedsnoegle.ts.
 */
import { erHverdagDato, kbhDato, kbhTilUtc, laegDageTilDato, naesteHverdagFra } from "@/lib/hverdage";
import { maanedsNoegleKbh } from "@/lib/maanedsnoegle";
import type { ScoreMaaned, StreakDom } from "./typer";

/** Fristens dag i måneden EFTER perioden — «senest den 10.» (inklusiv). */
export const STREAK_FRIST_DAG = 10;

const MS = 1;

/** Måneden efter en nøgle: «2026-12» → «2027-01». Ugyldig nøgle kaster — en nøgle er vores egen. */
export function naesteMaaned(key: string): string {
  return flytMaaned(key, 1);
}

export function flytMaaned(key: string, antal: number): string {
  if (!/^\d{4}-\d{2}$/.test(key)) throw new Error(`boardroomScore: ugyldig månedsnøgle «${key}»`);
  const aar = Number(key.slice(0, 4));
  const md = Number(key.slice(5, 7)) - 1 + antal;
  const nyAar = aar + Math.floor(md / 12);
  const nyMd = ((md % 12) + 12) % 12;
  return `${nyAar}-${String(nyMd + 1).padStart(2, "0")}`;
}

/** Fristens DATO («YYYY-MM-DD»): den 10. i måneden efter P, rykket frem til en hverdag. */
export function fristDato(key: string): string {
  const raa = `${naesteMaaned(key)}-${String(STREAK_FRIST_DAG).padStart(2, "0")}`;
  return erHverdagDato(raa) ? raa : naesteHverdagFra(raa, false);
}

/**
 * Fristens TIDSPUNKT: udgangen af fristdatoen i dansk tid.
 *   frist = kbhTilUtc(dagen efter fristdatoen, 00:00) − 1 ms
 * Eksempel: frist("2026-09") → 10/10-2026 er lørdag → mandag 12/10 → 12/10-2026 23:59:59,999 dansk tid.
 */
export function frist(key: string): Date {
  const dagenEfter = laegDageTilDato(fristDato(key), 1);
  return new Date(kbhTilUtc(dagenEfter, 0, 0).getTime() - MS);
}

export function fristPasseret(key: string, nu: Date): boolean {
  return nu.getTime() > frist(key).getTime();
}

/** Måneden med den seneste passerede frist set fra `nu` — normalt måneden før forrige måned indtil den 10. */
export function senesteMaanedMedPasseretFrist(nu: Date): string {
  let p = flytMaaned(maanedsNoegleKbh(nu), -1);
  // Højst to skridt tilbage: fristen ligger altid i måneden efter P.
  for (let i = 0; i < 3 && !fristPasseret(p, nu); i++) p = flytMaaned(p, -1);
  return p;
}

/** Den åbne måned: første måned, hvis frist IKKE er passeret. */
export function aabenMaaned(nu: Date): string {
  return naesteMaaned(senesteMaanedMedPasseretFrist(nu));
}

/** Første tællende måned: første HELE måned efter kontraktstart; null uden kontraktstart. */
export function foersteTaellendeMaaned(kontraktStart: string | null): string | null {
  if (!kontraktStart || !/^\d{4}-\d{2}-\d{2}/.test(kontraktStart)) return null;
  return naesteMaaned(kontraktStart.slice(0, 7));
}

export function erMaalt(m: ScoreMaaned | undefined): m is ScoreMaaned {
  return !!m && m.basis === "measured";
}

/** Målt OG første godkendelse ≤ frist(P). Ukendt godkendelsestidspunkt = ikke til tiden (vi påstår ikke noget, vi ikke har). */
export function erGodkendtTilTiden(m: ScoreMaaned | undefined): boolean {
  if (!erMaalt(m) || !m.foersteGodkendtAt) return false;
  const t = new Date(m.foersteGodkendtAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t <= frist(m.key).getTime();
}

/** Opslag pr. nøgle — kun målte rækker; en estimeret række for samme nøgle ignoreres. */
export function maalteEfterNoegle(maaneder: readonly ScoreMaaned[]): Map<string, ScoreMaaned> {
  const ud = new Map<string, ScoreMaaned>();
  for (const m of maaneder) if (erMaalt(m)) ud.set(m.key, m);
  return ud;
}

/** Antal hverdage EFTER dags dato til og med fristdatoen (0 når fristen er i dag eller passeret). */
export function hverdageTil(fristDatoStr: string, nu: Date): number {
  let d = kbhDato(nu);
  let n = 0;
  for (let i = 0; i < 60 && d < fristDatoStr; i++) {
    d = laegDageTilDato(d, 1);
    if (erHverdagDato(d)) n++;
  }
  return n;
}

export function streakDom(maaneder: readonly ScoreMaaned[], kontraktStart: string | null, nu: Date): StreakDom {
  const maalte = maalteEfterNoegle(maaneder);
  const foerste = foersteTaellendeMaaned(kontraktStart);
  const senestePasseret = senesteMaanedMedPasseretFrist(nu);
  const aaben = naesteMaaned(senestePasseret);

  // Baglæns fra den seneste måned med passeret frist.
  let laengde = 0;
  let p = senestePasseret;
  for (let i = 0; i < 600; i++) {
    if (foerste !== null && p < foerste) break;
    if (!erGodkendtTilTiden(maalte.get(p))) break;
    laengde++;
    p = flytMaaned(p, -1);
  }
  const aabenGodkendt = erGodkendtTilTiden(maalte.get(aaben));
  if (aabenGodkendt) laengde++;

  // Bedste: længste ubrudte kæde af rettidige måneder blandt de tællende med passeret frist (+ den åbne, hvis godkendt).
  let bedste = laengde;
  const noegler = [...maalte.keys()].filter((k) => k <= senestePasseret && (foerste === null || k >= foerste)).sort();
  let loeb = 0;
  let forrige: string | null = null;
  for (const k of noegler) {
    const sammenhaengende = forrige !== null && naesteMaaned(forrige) === k;
    loeb = erGodkendtTilTiden(maalte.get(k)) ? (sammenhaengende ? loeb + 1 : 1) : 0;
    forrige = k;
    if (loeb > bedste) bedste = loeb;
  }

  const harNogenMaalt = maalte.size > 0;
  const status = laengde > 0 ? "aktiv" : harNogenMaalt ? "brudt" : "ingen";
  // Næste frist at holde: den åbne måneds — eller den følgende, når den åbne allerede er i hus.
  const naeste = aabenGodkendt ? naesteMaaned(aaben) : aaben;
  return {
    laengde,
    status,
    bedste,
    aabenMaanedGodkendt: aabenGodkendt,
    naesteFrist: { key: naeste, tidspunkt: frist(naeste), hverdageTil: hverdageTil(fristDato(naeste), nu) },
  };
}
