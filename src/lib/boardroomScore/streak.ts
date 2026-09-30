/**
 * src/lib/boardroomScore/streak.ts — tal-streaken: «godkendte månedstal
 * senest den 10. i måneden efter» (docs/boardroom-score.md §4).
 *
 * REGLEN, kort:
 *   - En måned P tæller som «godkendt til tiden», når den har en MÅLT række
 *     (data_basis measured), og månedens FØRSTE godkendelse er ≤ frist(P).
 *     Første godkendelse er hukommelsen `maaned_foerste_godkendelse`
 *     (migration 20260930130000 — skrives af en trigger, når en måned første
 *     gang bliver målt, og overlever «Erstat gammel data» og permanent
 *     sletning, som begge sletter facts-rækken), ellers rækkens created_at;
 *     den tidligste af de to (tidligsteGodkendelse). committed_at læses
 *     aldrig (overskrives ved gen-godkendelse).
 *   - frist(P) = udgangen af den 10. i måneden efter P, dansk tid. Er den 10.
 *     ikke en hverdag (weekend, helligdag, lukkedag — hverdage.ts), rykkes
 *     fristen til udgangen af NÆSTE hverdag. Aldrig den anden vej.
 *   - Streaken tælles baglæns fra den seneste måned, hvis frist er passeret;
 *     den åbne måned lægger til, hvis den allerede er godkendt, og bryder
 *     aldrig.
 *   - Måneder før den første tællende måned tæller ikke og bryder ikke
 *     (frysning ved start): med kontraktstart er det startmåneden, når
 *     starten er den 1., ellers måneden efter; uden kontraktstart er det
 *     måneden efter den tidligste første godkendelse. Ingen anden nåde.
 *
 * Alt regnes i dansk tid gennem hverdage.ts og maanedsnoegle.ts.
 */
import { erHverdagDato, kbhDato, kbhTilUtc, laegDageTilDato, naesteHverdagFra } from "@/lib/hverdage";
import { maanedsNoegleKbh } from "@/lib/maanedsnoegle";
import type { ScoreMaaned, StreakDom } from "./typer";

/** Fristens dag i måneden EFTER perioden — «senest den 10.» (inklusiv). */
export const STREAK_FRIST_DAG = 10;

const MS = 1;

/** Gyldigt tidspunkt i ms, ellers null. */
function tidMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Første godkendelse af en måned: den TIDLIGSTE af hukommelsen
 * (maaned_foerste_godkendelse.foerst_godkendt_at) og facts-rækkens created_at.
 * Hukommelsen kan aldrig være senere end rækken for rækker født efter
 * migrationen (triggeren skriver ved fødslen), og for ældre rækker er den
 * bagudfyldt af created_at — men en rettelse («Erstat gammel data» → ny række
 * med created_at = now()) giver en NYERE række, og så er hukommelsen det
 * sande svar. Mangler begge: null (vi påstår intet).
 */
export function tidligsteGodkendelse(hukommelse: string | null | undefined, createdAt: string | null | undefined): string | null {
  const h = tidMs(hukommelse);
  const c = tidMs(createdAt);
  if (h === null && c === null) return null;
  if (h === null) return new Date(c as number).toISOString();
  if (c === null) return new Date(h).toISOString();
  return new Date(Math.min(h, c)).toISOString();
}

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

/**
 * Første tællende måned — den første HELE måned, medlemmet har været med:
 *   - med kontraktstart: startmåneden, når starten er den 1. (måneden er hel),
 *     ellers måneden efter (et medlem, der kom 25/9, dømmes ikke på september);
 *   - uden kontraktstart: måneden EFTER den tidligste første godkendelse blandt
 *     de målte måneder (dansk tid) — den første måned, der er afsluttet som
 *     medlem; null uden nogen godkendelse (ingen afgrænsning: fravær er
 *     adfærden, og der er intet at afgrænse fra).
 */
export function foersteTaellendeMaaned(kontraktStart: string | null, maaneder: readonly ScoreMaaned[] = []): string | null {
  if (kontraktStart && /^\d{4}-\d{2}-\d{2}/.test(kontraktStart)) {
    const maaned = kontraktStart.slice(0, 7);
    return kontraktStart.slice(8, 10) === "01" ? maaned : naesteMaaned(maaned);
  }
  let tidligst: number | null = null;
  for (const m of maaneder) {
    if (!erMaalt(m)) continue;
    const t = tidMs(m.foersteGodkendtAt);
    if (t !== null && (tidligst === null || t < tidligst)) tidligst = t;
  }
  if (tidligst === null) return null;
  return naesteMaaned(maanedsNoegleKbh(new Date(tidligst)));
}

export function erMaalt(m: ScoreMaaned | undefined): m is ScoreMaaned {
  return !!m && m.basis === "measured";
}

/** Målt OG første godkendelse ≤ frist(P). Ukendt godkendelsestidspunkt = ikke til tiden (vi påstår ikke noget, vi ikke har). */
export function erGodkendtTilTiden(m: ScoreMaaned | undefined): boolean {
  if (!erMaalt(m)) return false;
  const t = tidMs(m.foersteGodkendtAt);
  if (t === null) return false;
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
  const foerste = foersteTaellendeMaaned(kontraktStart, maaneder);
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

  // «brudt» kræver en TÆLLENDE måned med passeret frist, der er målt (netop
  // `noegler`): der skal have været en flamme, som kunne gå ud. En målt måned
  // FØR medlemskabet (fx august for et medlem, der startede 20/8 → første
  // tællende måned september) er frosset (§2.4) og kan ikke bryde noget —
  // uden en tællende måned med passeret frist er status «ingen» (rådets fund 1, 30/9).
  const harTaellendeMaalt = noegler.length > 0;
  const status = laengde > 0 ? "aktiv" : harTaellendeMaalt ? "brudt" : "ingen";
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
