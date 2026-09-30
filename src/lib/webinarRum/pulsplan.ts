/**
 * webinarRum/pulsplan — HVORNÅR seerens klient sender en puls, og hvad den
 * bærer (skive 2, 30/9-2026). Kun klienten; tiden gives ind.
 *
 * Serveren afgør, hvad pulsen giver af kredit (webinarMotor/puls.ts:pulsDom);
 * klienten skal blot sende ærligt og ikke for tit. Frekvensen er spec §C3:
 *   hver 15 s mens videoen spiller
 *   hver 60 s i venteværelset og på pause
 *   hver 5 s, mens seeren venter på et svar fra værten (højst 10 min) —
 *     svaret rider med pulsens svar (ingen Realtime for seerne, spec §D3)
 *   straks ved play, pause, ended, fanen skjult/vist og fejl
 * Aldrig tættere end serverens loft (MIN_KALD_AFSTAND_MS pr. enhed): en puls
 * for tidligt kastes af serveren som «for_tidligt» og giver ingen kredit.
 */
import { MAKS_PULSER_PR_KALD, MIN_KALD_AFSTAND_MS, type PulsRaa } from "@/lib/webinarMotor/puls";
import type { AfspillerTilstand } from "@/lib/webinarMotor/spolning";

export const PULS_SPILLER_MS = 15_000;
export const PULS_ROLIG_MS = 60_000;
export const PULS_SPOERGSMAAL_MS = 5_000;
export const SPOERGSMAAL_VINDUE_MS = 10 * 60_000;
/** Lidt over serverens loft, så et kald aldrig lander på grænsen og kastes af et net, der samler op. */
export const MIN_AFSTAND_MS = MIN_KALD_AFSTAND_MS + 200;

/**
 * Tiden til næste puls. Venter seeren på et svar (spurgt for under 10 min
 * siden), går pulsen hver 5 s; ellers 15 s når videoen spiller, 60 s ellers.
 */
export function pulsInterval(tilstand: AfspillerTilstand, sidstSpurgtMs: number | null, nuMs: number): number {
  if (sidstSpurgtMs !== null && nuMs - sidstSpurgtMs >= 0 && nuMs - sidstSpurgtMs < SPOERGSMAAL_VINDUE_MS) return PULS_SPOERGSMAAL_MS;
  return tilstand === "spiller" ? PULS_SPILLER_MS : PULS_ROLIG_MS;
}

/** Afspillerhændelser, der sender en puls MED DET SAMME (spec §C3). */
export const STRAKS_HAENDELSER = ["play", "pause", "ended", "synlighed", "fejl"] as const;
export type StraksHaendelse = (typeof STRAKS_HAENDELSER)[number];

/** Må klienten sende nu? Ikke tættere end MIN_AFSTAND_MS efter sidste afsendelse. */
export function maaSendes(sidstSendtMs: number | null, nuMs: number): boolean {
  return sidstSendtMs === null || nuMs - sidstSendtMs >= MIN_AFSTAND_MS;
}

/** Hvornår et kald, der er for tidligt, kan gå: straks efter loftet. */
export function ventTil(sidstSendtMs: number | null, nuMs: number): number {
  return sidstSendtMs === null ? 0 : Math.max(0, sidstSendtMs + MIN_AFSTAND_MS - nuMs);
}

/**
 * Køen, når nettet hakker: højst MAKS_PULSER_PR_KALD (4) pulser, de NYESTE.
 * Serveren ignorerer en seq, den har set (dedup), så en gentaget puls er ufarlig;
 * den ældste, der skubbes ud, er kun et hul i kurven — ærligt.
 */
export function laegIKoe(koe: readonly PulsRaa[], ny: PulsRaa): PulsRaa[] {
  return [...koe, ny].slice(-MAKS_PULSER_PR_KALD);
}

/** Pulserne, serveren har kvitteret for (skrevet, dublet eller kastet af loftet), fjernes; resten beholdes kun ved en netfejl. */
export function efterSvar(koe: readonly PulsRaa[], sendt: readonly PulsRaa[], lykkedes: boolean): PulsRaa[] {
  if (!lykkedes) return [...koe];
  const sendteSeq = new Set(sendt.map((p) => p.seq));
  return koe.filter((p) => !sendteSeq.has(p.seq));
}

/** Enhedens id — [A-Za-z0-9_-]{8,64}, som serveren kræver (puls.ts:laesPulsKrop). */
export const ENHED_ID_FORM = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Pulsen, som klienten sender. `posSek` er AFSPILLERENS position (aldrig en
 * forventet — den er serverens). I venteværelset og i introen står
 * afspillerens position ikke for hovedvideoen: tilstanden er «lobby», og
 * positionen 0 — så ankeret aldrig lægges på et tal, der ikke er hovedvideoens.
 */
export function byggPuls(i: {
  enhedId: string;
  seq: number;
  klientMs: number;
  posSek: number;
  tilstand: AfspillerTilstand;
  iHovedvideo: boolean;
  synlig: boolean;
  lyd: boolean;
  korrigeret: boolean;
}): PulsRaa {
  const hoved = i.iHovedvideo && i.tilstand !== "lobby";
  const pos = hoved && Number.isFinite(i.posSek) ? Math.max(0, Math.round(i.posSek * 1000) / 1000) : 0;
  return {
    enhed_id: i.enhedId,
    seq: i.seq,
    klient_ms: Math.max(0, Math.round(i.klientMs)),
    pos_sek: pos,
    tilstand: hoved ? i.tilstand : "lobby",
    synlig: i.synlig,
    lyd: hoved && i.lyd,
    korrigeret: i.korrigeret,
  };
}
