/**
 * webinarMotor/fremmoede — fremmødet efter en session, dømt af bitmappen (skive 3, 30/9-2026).
 *
 * Spejlet ORDRET i supabase/functions/_shared/webinarMotor/fremmoede.ts
 * (paritetstest src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports.
 * Tiden gives ind.
 *
 * webinar-motor-cron kalder den, når en session er slut, og skriver svaret i
 * webinar_tilmeldinger med EWEBINARS ORD — så webinarDom.doemSetGrad, Klaviyos
 * fremmødehændelser (afgoerOvergang/byggFremmoede), /webinar og meta-send
 * læser motorens rækker UÆNDRET (spec §C5).
 */

/**
 * `webinar_tilmeldinger.set_procent_kilde` for motorens rækker — ÉT navn
 * (rådets fund 30/9, LAV): kolonnen siger, HVORFRA procenten kom (for eWebinar
 * et felt i payloaden), og for motoren er det altid bitmappen — hvad enten
 * webinar_puls_skriv (SQL, under sessionen) eller webinar-motor-cron (efter)
 * skriver den. Før stod der «boardroom-1» i SQL'en og MOTOR_VERSION
 * («boardroom-3») i cronen: to navne for samme kilde, og det ene skiftede
 * med hver skive. SQL'en bærer strengen ORDRET (webinarMotorRaad.guard).
 */
export const SET_PROCENT_KILDE_MOTOR = "boardroom-bitmap";

/** eWebinars tilstande, i den rækkefølge en tilmelding kan gå frem. En dom går aldrig baglæns. */
export const STATE_RANG: Readonly<Record<string, number>> = { Registered: 0, NotJoined: 0, Missed: 1, Joined: 2, Watched: 3 };

/**
 * Hvornår en session må dømmes: FREMMOEDE_MARGIN_MS efter exitrummets slut.
 * Regnestykket: bitmappen får ingen kredit efter videoens slut (pulsDom), men
 * den sidste puls fra en seer kommer op til 15 s (pulsplanen) + keepalive ved
 * pagehide efter; exitrummet er 15 min som standard (lobby_min/exitrum_min).
 * exitrummets slut + 5 min > videoens slut + 15 min + 15 s — ingen puls, der
 * kan give kredit, kommer efter dommen. «Mødte ikke op» først efter
 * afslutningen + 5 min er også spec'ens regel (§C5).
 */
export const FREMMOEDE_MARGIN_MS = 5 * 60_000;

/**
 * En session ældre end det dømmes ikke af cronen (den er gledet ud af vinduet
 * — cronens svar tæller den som `for_gammel`, og det er et driftsfund).
 * 7 døgn = to uger før erFrisk-vinduet (3 døgn) ikke betyder noget, og
 * rigeligt til at en stoppet cron når at blive set.
 */
export const DOM_VINDUE_DAGE = 7;

/**
 * OPBEVARING af de RÅ pulser (webinar_pulser): 90 dage.
 * Begrundelsen: dommen står i aggregatet (webinar_deltagelser.set_bits/
 * set_procent) og i webinar_tilmeldinger — de rå pulser bruges kun til at
 * efterprøve synk (afvigelse_sek) og bitmappen. Det længste bevis, der har brug
 * for dem, er parallelkørslen (spec §E: P0 skygge → P1 → P2) plus en måned til
 * efterprøvning: ≈ 60 + 30 dage. Længere er persondata uden formål (§C6);
 * kortere kunne slette beviset, før det er læst. Volumen: ~120.000 rækker pr.
 * 60-min-session med 500 seere (spec §D4).
 */
export const PULS_OPBEVARING_DAGE = 90;

/** Grænsen: pulser modtaget FØR dette tidspunkt slettes. */
export function pulsGraenseMs(nuMs: number): number {
  return nuMs - PULS_OPBEVARING_DAGE * 86_400_000;
}

/** Må sessionen dømmes nu? */
export function sessionKlarTilDom(exitrumSlutMs: number, nuMs: number): boolean {
  return Number.isFinite(exitrumSlutMs) && nuMs >= exitrumSlutMs + FREMMOEDE_MARGIN_MS;
}

/** Er sessionen gledet ud af cronens vindue? */
export function sessionForGammel(starterMs: number, nuMs: number): boolean {
  return nuMs - starterMs > DOM_VINDUE_DAGE * 86_400_000;
}

export interface DeltagelseTilDom {
  /** Første indgang i hovedvideoen (webinar-rum «gik ind»). null = aldrig inde. */
  foerste_ind_at: string | null;
  set_procent: number | string | null;
}

export interface TilmeldingTilDom {
  state: string | null;
  sidste_action: string | null;
  set_procent: number | string | null;
}

export interface Fremmoede {
  state: "Watched" | "Joined" | "Missed";
  sidste_action: "WatchedWebinar" | "Left" | "MissedWebinar";
  /** null = ingen deltagelse; så røres kolonnen ikke. */
  set_procent: number | null;
}

const tal = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Fremmødet med eWebinars ord (spec §C5):
 *   set_procent > 0                   → Watched · WatchedWebinar (tallet afgør graden i doemSetGrad)
 *   gik ind, men intet stykke set     → Joined · Left            (doemSetGrad: «delvist» — var der)
 *   aldrig inde (kun lobby, eller slet ikke) → Missed · MissedWebinar (doemSetGrad efter sessionen: «moedte_ikke»)
 *
 * «Watched» uden tal ville doemSetGrad læse som «set» — derfor ALDRIG Watched
 * uden en procent over nul. Procenten er den højeste af tilmeldingens og
 * deltagelsens: webinar_puls_skriv skriver kun tilmeldingen, når et helt
 * procentpoint krydses, så deltagelsens tal er det præcise.
 *
 * Lobbyen alene tæller ikke som fremmøde her (eWebinar skrev «Joined» i
 * venteværelset; motoren skriver det først ved indgangen i hovedvideoen) —
 * en bevidst forskel, bogført i docs/webinarmotor.md §7.
 */
export function fremmoedeDom(d: DeltagelseTilDom | null, t: TilmeldingTilDom): Fremmoede {
  const pct = Math.max(tal(d?.set_procent) ?? 0, tal(t.set_procent) ?? 0);
  if (pct > 0) return { state: "Watched", sidste_action: "WatchedWebinar", set_procent: Math.min(100, Math.round(pct * 100) / 100) };
  if (d && d.foerste_ind_at) return { state: "Joined", sidste_action: "Left", set_procent: 0 };
  return { state: "Missed", sidste_action: "MissedWebinar", set_procent: d ? 0 : null };
}

/** De ord, der betyder «har bedt sig fri» — samme som webinarAfmelding.ts: AFMELDT_ORD. Står der ét, røres sidste_action aldrig. */
export const AFMELDT_HANDLINGER: readonly string[] = ["unsubscribed"];

/**
 * Rettelsen, cronen skriver — KUN de felter, der ændres, og aldrig baglæns:
 *   state         kun op i STATE_RANG
 *   sidste_action kun sammen med en state, der går op — og ALDRIG over en
 *                 afmelding («Unsubscribed» er afmeldingens port for
 *                 fremmødehændelserne, webinarAfmelding.erAfmeldt)
 *   set_procent   kun op (samme regel som webinar_puls_skriv: greatest)
 * null = intet at skrive.
 */
export function fremmoedeRettelse(t: TilmeldingTilDom, f: Fremmoede): Partial<Fremmoede> | null {
  const ud: Partial<Fremmoede> = {};
  const foer = STATE_RANG[t.state ?? ""] ?? 0;
  const efter = STATE_RANG[f.state];
  if (efter > foer) {
    ud.state = f.state;
    const afmeldt = AFMELDT_HANDLINGER.includes((t.sidste_action ?? "").trim().toLowerCase());
    if (!afmeldt) ud.sidste_action = f.sidste_action;
  }
  const gammel = tal(t.set_procent);
  if (f.set_procent !== null && (gammel === null || f.set_procent > gammel)) ud.set_procent = f.set_procent;
  return Object.keys(ud).length > 0 ? ud : null;
}

/**
 * Tilmeldingen, som den står EFTER rettelsen — det, cronen giver
 * webinarDom.doemSetGrad for at finde graden «efter».
 */
export function efterRettelse<T extends TilmeldingTilDom>(t: T, r: Partial<Fremmoede> | null): T {
  return r ? { ...t, ...r } : t;
}

/**
 * TIDSBUDGETTET for én kørsel (samme form som webinarMailBudget.ts).
 * Regnestykket: jobbets kald_edge-timeout er 60 000 ms. Én tilmeldings VÆRSTE
 * forløb er en opdatering (DB, ≤ 5 000 ms) + Klaviyo (klaviyo.ts TIMEOUT_MS
 * 3 000) + sporet og loggen (≤ 5 000) = 13 000 ms. Seneste start =
 * 60 000 − 5 000 (margin) − 13 000 = 42 000 ms. Det, der ikke nås, tages af
 * næste kørsel: sessionen markeres først «afholdt», når ALLE er dømt.
 */
export const JOB_TIMEOUT_MS = 60_000;
export const MARGIN_MS = 5_000;
export const RESTTID_PR_TILMELDING_MS = 5_000 + 3_000 + 5_000;
export const SENESTE_START_MS = JOB_TIMEOUT_MS - MARGIN_MS - RESTTID_PR_TILMELDING_MS;

export function budgetTilladerFremmoede(forloebetMs: number): boolean {
  return forloebetMs <= SENESTE_START_MS;
}
