/**
 * webinarMotor/puls — hvad en puls må markere som SET, bitmappen og kurven
 * (skive 1, 30/9-2026).
 *
 * Spejlet ORDRET i supabase/functions/_shared/webinarMotor/puls.ts
 * (paritetstest src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports.
 *
 * BITMAPPEN er én bit pr. 5-sekundersstykke af hovedvideoen. Bit i ligger i
 * byte ⌊i/8⌋ med masken 1 << (i mod 8) — PRÆCIS Postgres' egen nummerering for
 * get_bit/set_bit på bytea (mindst betydende bit først), så SQL-funktionen
 * webinar_puls_skriv og denne fil læser samme bytes ens. Bits OR'es kun, så
 * set_procent går aldrig ned, og to enheder eller en gentaget puls giver aldrig
 * dobbelt kredit.
 */

export const STYKKE_SEK = 5;
/** En puls må højst ligge så meget foran serverens ur: Δpos ≤ Δserver + 5 s. */
export const MAKS_FORSPRING_SEK = 5;
/** En puls længere fra serverens forventede position end dette giver ingen kredit (spolet). */
export const MAKS_AFVIGELSE_SEK = 10;
/** Højst så mange pulser i ét kald (klienten samler op, når nettet hakker). */
export const MAKS_PULSER_PR_KALD = 4;
/** Højst så mange enheder pr. tilmelding. */
export const MAKS_ENHEDER = 5;
/**
 * Mindste afstand mellem to kald fra samme enhed. AFVIGELSE FRA SPEC'EN (§C3
 * sagde 4 s), begrundet: klienten skal sende en puls «med det samme» ved play,
 * pause og visibilitychange. Med 4 s ville en play-puls lige efter en pause blive
 * kastet, og ankeret stod så på «pause» — de næste 15 sekunders visning gav ingen
 * kredit. 1 s holder stadig en løbsk klient på højst ét kald pr. sekund pr. enhed.
 */
export const MIN_KALD_AFSTAND_MS = 1000;

export const antalStykker = (varighedSek: number): number => Math.max(0, Math.ceil(varighedSek / STYKKE_SEK));

// ── Dommen over én puls ──────────────────────────────────────────────────────

export interface PulsAnker {
  posSek: number;
  serverMs: number;
  tilstand: string;
}

export interface PulsInd {
  posSek: number;
  tilstand: string;
}

export type PulsGrund = "ok" | "ikke_spiller" | "intet_anker" | "tilbage" | "for_hurtigt" | "spolet" | "intet_nyt";

export interface Pulsdom {
  /** Stykkerne [fra, til] (begge med), der må markeres — null = ingen kredit. */
  stykker: [number, number] | null;
  grund: PulsGrund;
}

/**
 * Hvad en puls må markere som set. KUN serverens tal afgør:
 *   - kun strækket SIDEN ankeret (forrige puls fra samme enhed), og kun når
 *     ankeret var «spiller»: videoen har kørt fra ankeret til nu. Pulsens egen
 *     tilstand siger, hvad der sker FREMOVER — en pause-, slut- eller
 *     skjult-puls krediterer derfor stadig strækket op til sig selv (ellers
 *     tabte hver pause og videoens sidste stykke op til 15 s). En puls fra
 *     lobbyen krediterer aldrig. Uden et spillende anker bliver pulsen blot
 *     det nye anker.
 *   - kun fremad (Δpos ≥ 0)
 *   - Δpos ≤ Δserverur + 5 s (man kan ikke se hurtigere, end tiden går)
 *   - |pos − forventet| ≤ 10 s (en spolet position giver ingen kredit)
 * Stykkerne er ⌊forrige/5⌋ … ⌈pos/5⌉ − 1, afkortet til videoen: en hel
 * gennemsyning dækker hvert stykke, og et sammenhængende stræk tæller højst ét
 * stykke (5 s) for meget.
 */
export function pulsDom(
  forrige: PulsAnker | null,
  puls: PulsInd,
  serverMs: number,
  forventetPosSek: number,
  varighedSek: number,
): Pulsdom {
  if (forrige === null) return { stykker: null, grund: "intet_anker" };
  if (forrige.tilstand !== "spiller" || puls.tilstand === "lobby") return { stykker: null, grund: "ikke_spiller" };
  const dPos = puls.posSek - forrige.posSek;
  if (dPos < 0) return { stykker: null, grund: "tilbage" };
  if (dPos === 0) return { stykker: null, grund: "intet_nyt" }; // stillestående: intet er set siden ankeret
  const dServer = (serverMs - forrige.serverMs) / 1000;
  if (dPos > dServer + MAKS_FORSPRING_SEK) return { stykker: null, grund: "for_hurtigt" };
  if (Math.abs(puls.posSek - forventetPosSek) > MAKS_AFVIGELSE_SEK) return { stykker: null, grund: "spolet" };
  const n = antalStykker(varighedSek);
  const fra = Math.max(0, Math.floor(forrige.posSek / STYKKE_SEK));
  const til = Math.min(n - 1, Math.ceil(Math.min(puls.posSek, varighedSek) / STYKKE_SEK) - 1);
  if (til < fra) return { stykker: null, grund: "intet_nyt" };
  return { stykker: [fra, til], grund: "ok" };
}

/**
 * En samlet (batch) pulses servertid: kaldets tid minus klientens egen afstand
 * til batchens sidste puls, holdt inden for [forrige anker, nu]. Klientens ur
 * bruges KUN til afstanden mellem dens egne pulser — og kan aldrig give mere
 * tid, end serveren selv har set gå.
 */
export function pulsServerTid(nuMs: number, sidsteKlientMs: number, pulsKlientMs: number, ankerServerMs: number | null): number {
  const bud = nuMs - Math.max(0, sidsteKlientMs - pulsKlientMs);
  return Math.min(nuMs, Math.max(ankerServerMs ?? -Infinity, bud));
}

// ── Bitmappen ────────────────────────────────────────────────────────────────

export const tomBitmap = (varighedSek: number): Uint8Array => new Uint8Array(Math.ceil(antalStykker(varighedSek) / 8));

export function harBit(bits: Uint8Array, i: number): boolean {
  const b = bits[i >> 3];
  return b !== undefined && (b & (1 << (i & 7))) !== 0;
}

/** Sæt stykkerne fra…til (begge med) — en ny bitmap og antallet af NYE bits. Originalen røres ikke. */
export function saetBits(bits: Uint8Array, fra: number, til: number, antal: number): { bits: Uint8Array; nye: number } {
  const laengde = Math.max(bits.length, Math.ceil(antal / 8));
  const ud = new Uint8Array(laengde);
  ud.set(bits);
  let nye = 0;
  for (let i = Math.max(0, fra); i <= Math.min(til, antal - 1); i++) {
    const maske = 1 << (i & 7);
    if ((ud[i >> 3] & maske) === 0) {
      ud[i >> 3] |= maske;
      nye++;
    }
  }
  return { bits: ud, nye };
}

/** Antal satte stykker blandt de første `antal`. */
export function taelBits(bits: Uint8Array, antal: number): number {
  let n = 0;
  for (let i = 0; i < antal; i++) if (harBit(bits, i)) n++;
  return n;
}

/** set_sek = stykker · 5, afkortet ved videoens længde (sidste stykke er kortere). */
export const setSek = (setStykker: number, varighedSek: number): number => Math.min(setStykker * STYKKE_SEK, varighedSek);

/**
 * set_procent på eWebinars skala: andelen af videoen, der er set, 0–100, to
 * decimaler — samme regnestykke som SQL-funktionen webinar_puls_skriv:
 *   round(least(100, least(stykker · 5, varighed) · 100 / varighed), 2)
 */
export function bitsTilProcent(setStykker: number, varighedSek: number): number {
  if (!(varighedSek > 0)) return 0;
  return Math.round(Math.min(100, (setSek(setStykker, varighedSek) * 100) / varighedSek) * 100) / 100;
}

/** PostgREST sender bytea som «\x0a1b…». Alt andet (null, forkert form) er en tom bitmap. */
export function fraPgHex(v: unknown): Uint8Array {
  if (typeof v !== "string" || !/^\\x([0-9a-fA-F]{2})*$/.test(v)) return new Uint8Array(0);
  const hex = v.slice(2);
  const ud = new Uint8Array(hex.length / 2);
  for (let i = 0; i < ud.length; i++) ud[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return ud;
}

export function tilPgHex(bits: Uint8Array): string {
  let s = "\\x";
  for (const b of bits) s += b.toString(16).padStart(2, "0");
  return s;
}

// ── Faldkurven ───────────────────────────────────────────────────────────────

/** Under så mange fremmødte vises ingen andel — «for få» ERSTATTER procenten (husets regel). */
export const KURVE_MINDST = 5;

export interface KurvePunkt {
  stykke: number;
  fraSek: number;
  antal: number;
  /** antal / fremmødte (0–1, fire decimaler) — null, når der er for få. */
  andel: number | null;
}

/**
 * Faldkurven pr. 5 s: hvor mange af de FREMMØDTE (mindst ét set stykke) der så
 * hvert stykke. Tæller og nævner dækker samme sæt deltagere.
 */
export function faldkurve(bitmaps: readonly Uint8Array[], varighedSek: number): { fremmoedte: number; punkter: KurvePunkt[] } {
  const n = antalStykker(varighedSek);
  const fremmoedte = bitmaps.filter((b) => taelBits(b, n) > 0);
  const punkter: KurvePunkt[] = [];
  for (let i = 0; i < n; i++) {
    let antal = 0;
    for (const b of fremmoedte) if (harBit(b, i)) antal++;
    const andel = fremmoedte.length < KURVE_MINDST ? null : Math.round((antal / fremmoedte.length) * 10_000) / 10_000;
    punkter.push({ stykke: i, fraSek: i * STYKKE_SEK, antal, andel });
  }
  return { fremmoedte: fremmoedte.length, punkter };
}

// ── «X venter i rummet» — kun det reelle tal ─────────────────────────────────

/** Tallet vises først fra 10 personer, og ALDRIG pustet op (beslutning G1). */
export const I_RUMMET_MINDST = 10;
/** En seer er «i rummet», når der er kommet en puls inden for så mange sekunder. */
export const I_RUMMET_SEK = 60;

export const visAntalIRummet = (antal: number): number | null => (Number.isInteger(antal) && antal >= I_RUMMET_MINDST ? antal : null);

// ── Kaldets loft pr. enhed ───────────────────────────────────────────────────

export type PulsLoft = "ok" | "for_tidligt" | "for_mange_enheder";

/**
 * Loftet over for én enhed i ét kald. Over loftet svarer functionen 200 med
 * «ignoreret» og skriver intet — ALDRIG 429, som ville få klienten til at
 * gentage.
 */
export function pulsLoft(kendteEnheder: readonly string[], enhed: string, sidsteServerMs: number | null, nuMs: number): PulsLoft {
  if (!kendteEnheder.includes(enhed) && kendteEnheder.length >= MAKS_ENHEDER) return "for_mange_enheder";
  if (sidsteServerMs !== null && nuMs - sidsteServerMs < MIN_KALD_AFSTAND_MS) return "for_tidligt";
  return "ok";
}

// ── Loftet pr. (tilmelding, time) for spørgsmål og reaktioner ───────────────
//
// Rådets fund 30/9 (MELLEM): et gyldigt token kunne sende 10 handlinger pr.
// kald uden loft over tid — alene ét kald i sekundet er 10 × 3.600 = 36.000
// spørgsmål i timen i værtens kø, eller 72.000 skrivninger (log + tæller) af
// reaktioner. Loftet tælles i
// webinar_motor_log (art, tilmelding_id, tid) FØR indsættelsen.
//
// TALLENE (regnestykket, ikke kun resultatet):
//   spoergsmaal 10/time — et webinar er ~60 min; en rigtig seer stiller 1–3
//     spørgsmål. 10 er over tre gange det, og værtens kø kan højst få 10 pr.
//     token i timen (500 seere × 10 = 5.000 er stadig til at skumme, 36.000
//     pr. person er det ikke).
//   reaktion 120/time — én pr. 30 s i gennemsnit hele timen (60 × 60 / 120 =
//     30). Tælleren er aggregeret pr. 5-s-stykke (webinar_reaktion_tael), så
//     en ivrig seers byger af 5–10 hjerter rammer ikke loftet; en bot rammer
//     det efter to minutter med 1/s. Hver reaktion er to skrivninger → højst
//     240 pr. person i timen.
// «svar» (quiz, afstemning, CTA, feedback) har ingen loft her: det er allerede
// én række pr. (deltagelse, interaktion) i databasen (unik).

export const HANDLING_LOFT_VINDUE_MS = 60 * 60 * 1000;
export const HANDLING_LOFT_PR_TIME = { spoergsmaal: 10, reaktion: 120 } as const;
export type LoftArt = keyof typeof HANDLING_LOFT_PR_TIME;

/**
 * Er der plads til ÉN handling mere? `alleredeIVinduet` = de loggede i den
 * seneste time (talt FØR indsættelsen) + dem, der er skrevet tidligere i SAMME
 * kald. Ukendt eller negativt tal → nej (fail-closed).
 */
export function handlingUnderLoft(art: LoftArt, alleredeIVinduet: number): boolean {
  if (!Number.isInteger(alleredeIVinduet) || alleredeIVinduet < 0) return false;
  return alleredeIVinduet < HANDLING_LOFT_PR_TIME[art];
}

// ── Kroppen til webinar-puls ─────────────────────────────────────────────────

/** DE ENESTE felter, kroppen må bære (bodyFelter.guard: STRIKS). Ingen «forventet» — positionen er serverens. */
export const PULS_KENDTE_FELTER = ["t", "puls", "handlinger"] as const;
export const PULS_FELTER = ["enhed_id", "seq", "klient_ms", "pos_sek", "tilstand", "synlig", "lyd", "korrigeret"] as const;
export const HANDLING_FELTER = ["klient_id", "art", "interaktion_id", "svar", "tekst", "emoji"] as const;
export const HANDLING_ARTER = ["svar", "spoergsmaal", "reaktion"] as const;
export type HandlingArt = (typeof HANDLING_ARTER)[number];
export const MAKS_HANDLINGER_PR_KALD = 10;

const PULS_TILSTANDE = ["lobby", "spiller", "pause", "buffer", "slut", "skjult"];
const ID_FORM = /^[A-Za-z0-9_-]{8,64}$/;
const UUID_FORM_PULS = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface PulsRaa {
  enhed_id: string;
  seq: number;
  klient_ms: number;
  pos_sek: number;
  tilstand: string;
  synlig: boolean;
  lyd: boolean;
  korrigeret: boolean;
}

export interface HandlingRaa {
  klient_id: string;
  art: HandlingArt;
  interaktion_id: string | null;
  svar: unknown;
  tekst: string | null;
  emoji: string | null;
}

const kunKendte = (o: Record<string, unknown>, kendte: readonly string[]) => Object.keys(o).every((k) => kendte.includes(k));
const erObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export type Kropdom = { ok: true; pulser: PulsRaa[]; handlinger: HandlingRaa[] } | { ok: false; fejl: string };

/**
 * Dommen over kroppens «puls» og «handlinger». Også de INDLEJREDE objekter
 * afviser ukendte nøgler — en klient, der sender `forventet_pos_sek`, får 400,
 * ikke en stille standardkørsel.
 */
export function laesPulsKrop(puls: unknown, handlinger: unknown): Kropdom {
  const p = puls === undefined ? [] : puls;
  const h = handlinger === undefined ? [] : handlinger;
  if (!Array.isArray(p) || p.length > MAKS_PULSER_PR_KALD) return { ok: false, fejl: "puls" };
  if (!Array.isArray(h) || h.length > MAKS_HANDLINGER_PR_KALD) return { ok: false, fejl: "handlinger" };
  const pulser: PulsRaa[] = [];
  for (const x of p) {
    if (!erObj(x) || !kunKendte(x, PULS_FELTER)) return { ok: false, fejl: "puls_felt" };
    const { enhed_id, seq, klient_ms, pos_sek, tilstand } = x;
    if (typeof enhed_id !== "string" || !ID_FORM.test(enhed_id)) return { ok: false, fejl: "enhed_id" };
    if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0 || seq > 2_147_483_647) return { ok: false, fejl: "seq" };
    if (typeof klient_ms !== "number" || !Number.isFinite(klient_ms) || klient_ms < 0) return { ok: false, fejl: "klient_ms" };
    if (typeof pos_sek !== "number" || !Number.isFinite(pos_sek) || pos_sek < 0 || pos_sek > 86_400) return { ok: false, fejl: "pos_sek" };
    if (typeof tilstand !== "string" || !PULS_TILSTANDE.includes(tilstand)) return { ok: false, fejl: "tilstand" };
    for (const b of ["synlig", "lyd", "korrigeret"]) if (x[b] !== undefined && typeof x[b] !== "boolean") return { ok: false, fejl: b };
    pulser.push({ enhed_id, seq, klient_ms, pos_sek, tilstand, synlig: x.synlig !== false, lyd: x.lyd === true, korrigeret: x.korrigeret === true });
  }
  const handlingerUd: HandlingRaa[] = [];
  for (const x of h) {
    if (!erObj(x) || !kunKendte(x, HANDLING_FELTER)) return { ok: false, fejl: "handling_felt" };
    if (typeof x.klient_id !== "string" || !ID_FORM.test(x.klient_id)) return { ok: false, fejl: "klient_id" };
    if (!(HANDLING_ARTER as readonly string[]).includes(x.art as string)) return { ok: false, fejl: "art" };
    const interaktion = x.interaktion_id === undefined || x.interaktion_id === null ? null : x.interaktion_id;
    if (interaktion !== null && (typeof interaktion !== "string" || !UUID_FORM_PULS.test(interaktion))) return { ok: false, fejl: "interaktion_id" };
    if (x.art === "svar" && interaktion === null) return { ok: false, fejl: "interaktion_id" };
    const tekst = typeof x.tekst === "string" ? x.tekst.trim() : null;
    if (x.art === "spoergsmaal" && (tekst === null || tekst.length < 1 || tekst.length > 2000)) return { ok: false, fejl: "tekst" };
    const emoji = typeof x.emoji === "string" ? x.emoji : null;
    if (x.art === "reaktion" && (emoji === null || emoji.length < 1 || emoji.length > 16)) return { ok: false, fejl: "emoji" };
    handlingerUd.push({ klient_id: x.klient_id, art: x.art as HandlingArt, interaktion_id: interaktion as string | null, svar: x.svar, tekst, emoji });
  }
  return { ok: true, pulser, handlinger: handlingerUd };
}
