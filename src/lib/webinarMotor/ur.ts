/**
 * webinarMotor/ur — serverens ur og afspilningspositionen (skive 1, 30/9-2026).
 *
 * Spejlet ORDRET i supabase/functions/_shared/webinarMotor/ur.ts (paritetstest
 * src/lib/__tests__/webinarMotor.paritet.test.ts). Nul imports i begge. Tiden
 * gives ind (`nuMs`) — aldrig `Date.now()` indeni.
 */

// ── Grænsen for «har set» ────────────────────────────────────────────────────

/**
 * «Har set webinaret» = 75 % eller mere — SAMME tal som
 * _shared/webinarDom.ts:SET_GRAENSE_PROCENT (Jonas 19/9). Filen må ikke
 * importere, så tallet står her igen, og webinarMotor.test.ts fælder en
 * afvigelse mellem de to. Sen-indgangs-grænsen afledes af den og flytter sig med.
 */
export const SET_GRAENSE_PROCENT_MOTOR = 75;

// ── Sessionens tidslinje ─────────────────────────────────────────────────────

/**
 * Rummene i den rækkefølge, en seer oplever dem. «aflyst» er en tilstand,
 * ikke et rum i tidslinjen: en aflyst session har ingen afspilning.
 */
export const RUM = ["foer_lobby", "lobby", "intro", "afspilning", "exitrum", "afsluttet", "aflyst"] as const;
export type Rum = (typeof RUM)[number];

export interface SessionUr {
  /** Sessionens start (webinar_sessioner.starter_at) som UTC-millisekunder. */
  starterMs: number;
  /** Hovedvideoens længde — fra Bunnys video-info, aldrig tastet. */
  varighedSek: number;
  /** Intro-videoens længde (0 = ingen). Tæller aldrig med i set_procent. */
  introSek: number;
  /** Rummet åbner så mange minutter før start. */
  lobbyMin: number;
  /** Exitrummet står så mange minutter efter videoens slut. */
  exitrumMin: number;
  /** webinar_sessioner.status — «aflyst» vinder over uret. */
  status?: string | null;
}

export interface SessionTider {
  lobbyAabnerMs: number;
  afspilningStartMs: number;
  afspilningSlutMs: number;
  exitrumSlutMs: number;
}

/**
 * Grænserne, regnet ÉT sted:
 *   lobby åbner     = start − lobby_min · 60 000
 *   afspilning      = start + intro_sek · 1000
 *   afspilning slut = start + (intro_sek + varighed_sek) · 1000
 *   exitrum slut    = afspilning slut + exitrum_min · 60 000
 */
export function sessionTider(s: SessionUr): SessionTider {
  const afspilningStartMs = s.starterMs + s.introSek * 1000;
  const afspilningSlutMs = afspilningStartMs + s.varighedSek * 1000;
  return {
    lobbyAabnerMs: s.starterMs - s.lobbyMin * 60_000,
    afspilningStartMs,
    afspilningSlutMs,
    exitrumSlutMs: afspilningSlutMs + s.exitrumMin * 60_000,
  };
}

export interface Position {
  rum: Rum;
  /**
   * Hvor videoen SKAL være nu: (nu − start − intro) / 1000, afkortet til
   * [0, varighed]. Det er serverens tal og det eneste, klienten styrer efter.
   */
  forventetPosSek: number;
  /** Positionen i intro-videoen (0 uden intro) — tæller aldrig i set_procent. */
  introPosSek: number;
  /** Hele sekunder til start (0, når den er begyndt). */
  sekTilStart: number;
  /** Hele sekunder til exitrummet lukker (0, når det er lukket). */
  sekTilSlut: number;
  tider: SessionTider;
}

const tre = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Rummet og positionen på et tidspunkt. Alt er UTC-millisekunder, så et
 * sommertidsskifte midt i en session (25/10) flytter intet: positionen er
 * forskellen mellem to øjeblikke, ikke mellem to vægure.
 *
 * Grænserne er halvåbne: præcis ved start er man i intro (eller afspilning,
 * når der ingen intro er), præcis ved afspilningens slut er man i exitrummet.
 */
export function positionDom(s: SessionUr, nuMs: number): Position {
  const tider = sessionTider(s);
  const raa = (nuMs - tider.afspilningStartMs) / 1000;
  const forventetPosSek = tre(Math.min(Math.max(raa, 0), s.varighedSek));
  const introPosSek = tre(Math.min(Math.max((nuMs - s.starterMs) / 1000, 0), s.introSek));
  const sekTilStart = Math.max(0, Math.ceil((s.starterMs - nuMs) / 1000));
  const sekTilSlut = Math.max(0, Math.ceil((tider.exitrumSlutMs - nuMs) / 1000));
  let rum: Rum;
  if (s.status === "aflyst") rum = "aflyst";
  else if (nuMs < tider.lobbyAabnerMs) rum = "foer_lobby";
  else if (nuMs < s.starterMs) rum = "lobby";
  else if (nuMs < tider.afspilningStartMs) rum = "intro";
  else if (nuMs < tider.afspilningSlutMs) rum = "afspilning";
  else if (nuMs < tider.exitrumSlutMs) rum = "exitrum";
  else rum = "afsluttet";
  return { rum, forventetPosSek, introPosSek, sekTilStart, sekTilSlut, tider };
}

// ── Sen indgang ──────────────────────────────────────────────────────────────

export interface SenIndgang {
  /** Kan personen stadig nå SET_GRAENSE_PROCENT_MOTOR ved at se resten? */
  kanNaaSet: boolean;
  /** Rummet skal ærligt tilbyde næste session (og «se med alligevel»). */
  tilbydNaeste: boolean;
  /** Andel af videoen, der allerede er gået (0–1). */
  andelForbi: number;
}

/**
 * Den højeste procent, en sen seer kan nå, er (varighed − pos) / varighed.
 * Den er ≥ 75 %, præcis når pos / varighed ≤ 1 − 75/100 = 25 %.
 * Regnet i heltal for at undgå flydende-komma-kanter:
 *   pos · 100 ≤ varighed · (100 − 75)  ⇔  kan nå «set».
 * På PRÆCIS 25 % kan man nå præcis 75 % — altså stadig «set».
 */
export function senIndgangDom(forventetPosSek: number, varighedSek: number): SenIndgang {
  if (!(varighedSek > 0)) return { kanNaaSet: false, tilbydNaeste: true, andelForbi: 1 };
  const pos = Math.min(Math.max(forventetPosSek, 0), varighedSek);
  const kanNaaSet = pos * 100 <= varighedSek * (100 - SET_GRAENSE_PROCENT_MOTOR);
  return { kanNaaSet, tilbydNaeste: !kanNaaSet, andelForbi: Math.round((pos / varighedSek) * 10_000) / 10_000 };
}

// ── Urets synkronisering i klienten (NTP-agtigt) ─────────────────────────────

export interface UrMaaling {
  /** Klientens ur, da kaldet blev sendt. */
  sendtMs: number;
  /** Klientens ur, da svaret kom. */
  modtagetMs: number;
  /** server_nu_ms fra svaret. */
  serverMs: number;
}

/**
 * Forskydningen mellem serverens og klientens ur: den måling med den MINDSTE
 * rundtur vinder, og forskydningen er server − (sendt + rtt/2). Tom liste = 0.
 * Klienten lægger forskydningen til sit eget ur og viser derefter serverens tid.
 */
export function urForskydning(maalinger: readonly UrMaaling[]): number {
  let bedst: UrMaaling | null = null;
  for (const m of maalinger) {
    const rtt = m.modtagetMs - m.sendtMs;
    if (!(rtt >= 0)) continue;
    if (bedst === null || rtt < bedst.modtagetMs - bedst.sendtMs) bedst = m;
  }
  if (bedst === null) return 0;
  const rtt = bedst.modtagetMs - bedst.sendtMs;
  return Math.round(bedst.serverMs - (bedst.sendtMs + rtt / 2));
}

// ── Bunnys embed ─────────────────────────────────────────────────────────────

/**
 * Parametrene til Bunnys embed (docs.bunny.net/stream/embedding). Bunny har
 * ingen parameter, der fjerner søgebjælken; spolespærren er spoleDom i
 * klienten. `t` er serverens forventede position i hele sekunder.
 */
export function embedParametre(forventetPosSek: number): string {
  const t = Math.max(0, Math.floor(forventetPosSek));
  return `&autoplay=true&playsinline=true&showSpeed=false&rememberPosition=false&chromecast=false&disableAirplay=true&t=${t}`;
}

/**
 * Embed-tokenets udløb i unix-SEKUNDER: exitrummets slut + 30 minutter — ikke
 * 3600 blindt. Et link, der udløber midt i en session, er en fejl; et, der
 * lever i døgn, er en lækage.
 */
export const EMBED_EFTER_SLUT_MIN = 30;
export function embedUdloebSek(s: SessionUr): number {
  return Math.floor((sessionTider(s).exitrumSlutMs + EMBED_EFTER_SLUT_MIN * 60_000) / 1000);
}

/** Må rummet få en signeret embed-URL nu? Kun når der afspilles (intro eller hovedvideo). */
export function faarEmbed(rum: Rum): boolean {
  return rum === "intro" || rum === "afspilning";
}
