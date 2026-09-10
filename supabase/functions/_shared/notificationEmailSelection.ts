/**
 * notificationEmailSelection — pure udvælgelseslogik for notifikations-mails.
 *
 * Ekstraheret fra send-notification-email så logikken kan testes fra vitest
 * (cross-boundary, samme mønster som canonicalEngine). Edge-funktionen laver
 * DB-arbejdet (fetch + join mod financial_reports/financial_report_facts) og
 * overlader beslutningen "hvilke notifikationer skal maile / disposes / vente"
 * til denne funktion.
 *
 * Fejlspor 2026-07-22 (natlige mails for slettede + duplikerede rapporter):
 * - Udvælgelsen joinede aldrig rapportens tilstand → soft-deletede og allerede
 *   committede rapporters notifikationer blev mailet.
 * - dedup_key er per-reportId → to rapporter for samme company+periode = to mails.
 * - Anti-spam-kvoten (UTC-midnat-reset) udskød over-kvote-notifikationer uden at
 *   markere dem → flush ved første cron-kørsel efter UTC-midnat (kl. 02 dansk).
 *
 * Bevidst designvalg: "godkendt" = committed (financial_report_facts ejer
 * rapporten via source_report_id). financial_reports.reviewed_at er advisorens
 * "markér som læst"-flag i chatten og må IKKE undertrykke medlemmets
 * review-mail — advisor-læsning er ikke medlems-godkendelse.
 *
 * ALDERSGRÆNSE PÅ BEGIVENHEDER (Jonas 10/9): køen havde ingen aldersgrænse.
 * Da vault var tom i otte timer og jobbet blev tændt kl. 08.57, gik 26
 * community-mails ud om et opslag fra dagen før — «Det er sådan lidt
 * træls.» Fejlen var timingen, ikke antallet. Næste gang noget er nede i
 * et døgn, gentager det sig — medmindre køen ved hvad der er for gammelt.
 *
 * PRINCIPPET: jo mere beskeden er en BEGIVENHED, jo hurtigere forældes
 * den; jo mere den er en OPGAVE, jo længere holder den.
 *   - Et community-opslag, et svar, en nævnelse er en invitation til en
 *     samtale. Kommer den et døgn efter, er samtalen i gang uden dig, og
 *     der er ingen værdi tilbage → 12 timer (BEGIVENHED_MAKS_ALDER_MS).
 *   - En event-påmindelse («I morgen», «Om en uge») er bundet til en dag;
 *     dagen efter er ordene forkerte → 12 timer.
 *   - En besked fra rådgiveren VENTER på dig og er relevant tre dage efter
 *     → ingen grænse (chat_reply, advisor_replied går desuden uden om
 *     denne funktion, samlet pr. bruger).
 *   - «Rapport klar til gennemsyn» og «rapport fejl» venter også — og har
 *     allerede deres grænse som TILSTAND: godkendt eller slettet rapport
 *     disposes i trin 1. Ingen tidsgrænse oveni.
 *   - Alerts (alert_*) er tal om en periode — de venter, indtil en nyere
 *     periode afløser dem (ikke bygget; ingen tidsgrænse her).
 *   - «Event aflyst» (event_cancelled) er en begivenhed, men også en
 *     opgave: du skal vide at det IKKE sker, også et døgn efter → ingen
 *     grænse.
 *   - session_booked, milestone_deadline_reminder m.fl. er opgaver → ingen.
 *
 * «SET I APPEN» DÆKKER NU COMMUNITY (Jonas 10/9): DB-forfilteret
 * `seen_at IS NULL` fanger kun klokken (NotificationCenter i den gamle
 * skal — Hjemmebane-skallen har ingen klokke), og rapporter fanges af
 * tilstanden. For community er kilden community_visninger (én række pr.
 * bruger pr. tråd, skrevet af registrer_community_visning når tråden
 * åbnes, CommunityTraadView). Har modtageren set tråden, får kandidaten
 * `set_i_app: true` af kalderen, og den disposes: de der læste Mortens
 * opslag i går, skulle ikke have haft mailen i morges.
 *
 * DISPOSE = email_sent_at stemples UDEN at der sendes. Kolonnen betyder
 * «behandlet», ikke «sendt» — det har den gjort siden commit-suppress
 * (10/8). Kalderen logger grunden (disposeGrund), så en senere læser ikke
 * tror mailen gik ud.
 */

/** Rapport-typer hvor notifikationen refererer en financial_reports-række. */
export const REPORT_NOTIFICATION_TYPES = new Set([
  "report_review_ready",
  "report_error",
]);

/**
 * Begivenheds-typer: forældes efter BEGIVENHED_MAKS_ALDER_MS (12 timer).
 * Se filhovedet for hvorfor hver af de øvrige typer IKKE står her.
 * community_svar har priority info og hentes aldrig af mail-motoren — den
 * står her for princippets skyld, så en fremtidig prioritetsændring ikke
 * gør den til en mail uden aldersgrænse.
 */
export const BEGIVENHED_TYPES = new Set([
  "community_opslag",
  "community_svar",
  "community_naevnelse",
  "event_reminder",
]);
export const BEGIVENHED_MAKS_ALDER_MS = 12 * 60 * 60 * 1000;

/** Typer hvor «set i appen» afgøres af community_visninger (tråden åbnet). Kalderen udfylder set_i_app. */
export const COMMUNITY_TRAAD_TYPES = new Set(["community_opslag", "community_svar", "community_naevnelse"]);

/** Hvorfor en kandidat disposes — logges af kalderen, så «behandlet» ikke læses som «sendt». */
export type DisposeGrund = "set_i_app" | "foraeldet" | "rapport_vaek" | "dublet";

/** En begivenhed er forældet når den er ÆLDRE end grænsen (præcis 12 t er ikke forældet). */
export function erForaeldet(c: { type: string; created_at: string }, now: Date): boolean {
  if (!BEGIVENHED_TYPES.has(c.type)) return false;
  const age = now.getTime() - new Date(c.created_at).getTime();
  return age > BEGIVENHED_MAKS_ALDER_MS;
}

/** Udskudte mails sendes kun i dette vindue (dansk tid, DST-sikkert via Intl). */
const SEND_WINDOW_START_HOUR = 7; // inklusiv
const SEND_WINDOW_END_HOUR = 20; // eksklusiv
/**
 * Notifikationer yngre end dette er "friske" og sendes straks døgnet rundt.
 *
 * ACCEPTERET RANDCASE (godkendt 2026-07-22, se BACKLOG.md P4): en notifikation
 * oprettet efter ca. kl. 21 dansk hos en bruger med opbrugt dagskvote er
 * stadig "frisk" (<6t) ved kvote-nulstillingen kl. 02 dansk (UTC-midnat) og
 * sendes derfor om natten. Kræver både opbrugt kvote (5 sends samme dag) og
 * sen-aftens-notifikation — sjælden kombination, og alternativet (lavere
 * tærskel) ville forsinke legitime aftenmails. Bevidst afvejning.
 *
 * Gælder efter 10-08-2026 KUN default-typer: de handlingsudløste typer
 * (EMAIL_DELAY_MINUTES_BY_TYPE) bærer altid afsendelsesvinduet, uanset
 * alder, og kan derfor ikke ramme natten.
 */
const DEFER_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/**
 * Handlingsudløste typer: notifikationen fortæller medlemmet hvad
 * medlemmet netop SELV har gjort, mens de sandsynligvis stadig sidder
 * i skærmen. En mail 15 minutter efter er en besked om noget de
 * allerede ved — og den slags underminerer tilliden til de øvrige
 * mails.
 *
 * Længere ventetid giver det naturlige forløb (upload → gennemgå →
 * godkend) tid til at fuldføre. Fuldføres det, disposes notifikationen
 * af rapport-tilstandsfilteret i trin 1 og mailen sendes aldrig.
 * Fuldføres det ikke, er mailen reel information: du startede noget og
 * gik fra det.
 *
 * Der findes intet aktivitetssignal i systemet (ingen heartbeat,
 * presence eller last_seen), så ventetid er det eneste tilgængelige
 * mål for "brugeren er gået videre".
 *
 * Beslutning 10-08-2026. Kilde: et medlem om "Dine tal er klar" —
 * "de er lidt dumme faktisk, for jeg ved jo de er klar".
 */
export const DEFAULT_EMAIL_DELAY_MINUTES = 15;

export const EMAIL_DELAY_MINUTES_BY_TYPE: Record<string, number> = {
  report_review_ready: 240,
  report_error: 240,
  alert_financial_summary: 240,
};

export function emailDelayMinutes(type: string): number {
  return EMAIL_DELAY_MINUTES_BY_TYPE[type] ?? DEFAULT_EMAIL_DELAY_MINUTES;
}

export interface ReportJoin {
  /** financial_reports.deleted_at — null = aktiv rapport */
  deleted_at: string | null;
  /** true når financial_report_facts har rækken som source_report_id (godkendt) */
  committed: boolean;
  /** Effektiv periode-nøgle "YYYY-MM" (manual_report_period_key ?? parset report_period) */
  period_key: string | null;
}

export interface EmailCandidate {
  id: string;
  user_id: string;
  type: string;
  company_id: string | null;
  reference_id: string | null;
  created_at: string;
  /**
   * Join mod financial_reports via reference_id.
   * undefined = ikke en rapport-notifikation (ingen join forsøgt).
   * null = join forsøgt men rapporten findes ikke længere (hard delete).
   */
  report?: ReportJoin | null;
  /**
   * Set i appen — for COMMUNITY_TRAAD_TYPES: findes der en
   * community_visninger-række (traad_id = reference_id, bruger_id = user_id)?
   * Kalderen slår op; undefined = ikke slået op (ingen dom).
   */
  set_i_app?: boolean;
}

export interface SelectionResult<T extends EmailCandidate> {
  /** Send mail for disse (én per element). */
  toEmail: T[];
  /**
   * Marker email_sent_at UDEN at sende (rapporten er slettet/godkendt/dublet)
   * så de aldrig flusher senere — samme dispose-mekanisme som commit-stien.
   */
  toDispose: T[];
  /** Grunden pr. disposed kandidat-id — til loggen («IKKE SENDT: forældet»). */
  disposeGrund: Map<string, DisposeGrund>;
  /**
   * VENTER (10/9): kandidater der hverken mailes eller disposes NU, men
   * samles op af en senere kørsel. Før stod de i ingen mængde, og
   * kalderens svar {processed: 1, sent: 0, skipped: 0} lignede en fejl —
   * det kostede en times fejlsøgning 10/9 (Livjas alert_financial_summary,
   * fem kørsler i træk, ventede med vilje til 240 min). Nu tælles de, hver
   * for sig, så svaret siger hvad der skete:
   *   venterPaaTid    — for ung for sin types ventetid (emailDelayMinutes)
   *   venterPaaVindue — gammel nok, men uden for afsendelsesvinduet 07–20
   * Invariant: toEmail + toDispose + venterPaaTid + venterPaaVindue = alle
   * kandidater (låst af testen «regnestykket går op»).
   */
  venterPaaTid: T[];
  venterPaaVindue: T[];
}

/**
 * TS-spejl af SQL-funktionen public.parse_dk_report_period_key:
 * "Juni 2026" → "2026-06". Samme semantik: første ord = dansk månedsnavn
 * (case-insensitivt), andet ord = 4-cifret år; ellers null.
 */
const DK_MONTHS: Record<string, number> = {
  januar: 1, februar: 2, marts: 3, april: 4, maj: 5, juni: 6,
  juli: 7, august: 8, september: 9, oktober: 10, november: 11, december: 12,
};

export function parseDkReportPeriodKey(period: string | null | undefined): string | null {
  if (!period) return null;
  const parts = period.trim().split(" ");
  const month = DK_MONTHS[(parts[0] || "").toLowerCase()];
  const year = /^\d{4}$/.test(parts[1] || "") ? parts[1] : null;
  if (!month || !year) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Time på døgnet i Europe/Copenhagen (0-23) for et givet tidspunkt. */
function copenhagenHour(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Copenhagen",
      hour: "numeric",
      hourCycle: "h23",
    }).format(d),
  );
}

/**
 * Afgør for hver pending notifikation om der skal sendes mail, disposes
 * eller ventes. Rene data ind, ren beslutning ud — ingen I/O.
 *
 * 0) Set i appen (set_i_app, community_visninger) → dispose. Forældet
 *    begivenhed (BEGIVENHED_TYPES ældre end 12 t) → dispose. Begge FØR
 *    rapport- og ventetidsreglerne: det der er set eller forældet, skal
 *    hverken vente eller sendes.
 * 1) Rapport-tilstandsfilter: slettet/godkendt/forsvundet rapport → dispose.
 * 2) Dedup: report_review_ready per (company_id, period_key) — nyeste vinder,
 *    taberne disposes.
 * 3) Ventetid pr. type + afsendelsesvindue: en kandidat yngre end sin types
 *    ventetid (emailDelayMinutes — default 15 min, handlingsudløste typer
 *    240 min) venter, hverken mail eller dispose. Udskudte kandidater
 *    (> 6 timer gamle, dvs. holdt tilbage af dagskvoten — samt ALLE
 *    handlingsudløste typer, uanset alder) sendes kun kl. 07-20 dansk
 *    tid — aldrig ved kvote-nulstillingen kl. 02 dansk nat. Friske
 *    default-kandidater sendes straks.
 */
export function selectNotificationEmails<T extends EmailCandidate>(
  candidates: T[],
  opts: { now?: Date } = {},
): SelectionResult<T> {
  const now = opts.now ?? new Date();
  const toDispose: T[] = [];
  const disposeGrund = new Map<string, DisposeGrund>();
  const dispose = (c: T, grund: DisposeGrund) => {
    toDispose.push(c);
    disposeGrund.set(c.id, grund);
  };

  // 0) Set i appen og forældede begivenheder (Jonas 10/9, se filhovedet).
  //    IKKE SENDT — kalderen stempler email_sent_at som «behandlet».
  const friske: T[] = [];
  for (const c of candidates) {
    if (c.set_i_app === true) {
      dispose(c, "set_i_app");
      continue;
    }
    if (erForaeldet(c, now)) {
      dispose(c, "foraeldet");
      continue;
    }
    friske.push(c);
  }

  // 1) Rapport-tilstandsfilter
  const alive: T[] = [];
  for (const c of friske) {
    if (REPORT_NOTIFICATION_TYPES.has(c.type) && c.report !== undefined) {
      const r = c.report;
      if (r === null || r.deleted_at !== null || r.committed) {
        dispose(c, "rapport_vaek");
        continue;
      }
    }
    alive.push(c);
  }

  // 2) Dedup per (company_id, period_key) for report_review_ready.
  // Uden company eller periode-nøgle dedupliseres ikke — hellere to mails
  // end at sluge en reel.
  const winners = new Map<string, T>();
  const passthrough: T[] = [];
  for (const c of alive) {
    const periodKey = c.report?.period_key;
    if (c.type !== "report_review_ready" || !c.company_id || !periodKey) {
      passthrough.push(c);
      continue;
    }
    const key = `${c.company_id}::${periodKey}`;
    const prev = winners.get(key);
    if (!prev) {
      winners.set(key, c);
    } else if (new Date(c.created_at) > new Date(prev.created_at)) {
      dispose(prev, "dublet");
      winners.set(key, c);
    } else {
      dispose(c, "dublet");
    }
  }

  // 3) Ventetid pr. type, derefter afsendelsesvindue.
  // Handlingsudløste typer bærer altid vinduet, uanset alder: en mail
  // om ens egen upload må ikke lande kl. 22.
  const hour = copenhagenHour(now);
  const inWindow = hour >= SEND_WINDOW_START_HOUR && hour < SEND_WINDOW_END_HOUR;
  const toEmail: T[] = [];
  const venterPaaTid: T[] = [];
  const venterPaaVindue: T[] = [];
  for (const c of [...passthrough, ...winners.values()]) {
    const ageMs = now.getTime() - new Date(c.created_at).getTime();
    const delayMs = emailDelayMinutes(c.type) * 60 * 1000;
    if (ageMs < delayMs) {
      venterPaaTid.push(c); // for ung — vent, hverken mail eller dispose
      continue;
    }

    const hasCustomDelay = c.type in EMAIL_DELAY_MINUTES_BY_TYPE;
    const deferred = hasCustomDelay || ageMs > DEFER_THRESHOLD_MS;
    if (deferred && !inWindow) {
      venterPaaVindue.push(c); // vent — samles op i vinduet
      continue;
    }
    toEmail.push(c);
  }

  return { toEmail, toDispose, disposeGrund, venterPaaTid, venterPaaVindue };
}
