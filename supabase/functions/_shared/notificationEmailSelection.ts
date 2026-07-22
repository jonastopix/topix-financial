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
 */

/** Rapport-typer hvor notifikationen refererer en financial_reports-række. */
export const REPORT_NOTIFICATION_TYPES = new Set([
  "report_review_ready",
  "report_error",
]);

/** Udskudte mails sendes kun i dette vindue (dansk tid, DST-sikkert via Intl). */
const SEND_WINDOW_START_HOUR = 7; // inklusiv
const SEND_WINDOW_END_HOUR = 20; // eksklusiv
/** Notifikationer yngre end dette er "friske" og sendes straks døgnet rundt. */
const DEFER_THRESHOLD_MS = 6 * 60 * 60 * 1000;

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
}

export interface SelectionResult<T extends EmailCandidate> {
  /** Send mail for disse (én per element). */
  toEmail: T[];
  /**
   * Marker email_sent_at UDEN at sende (rapporten er slettet/godkendt/dublet)
   * så de aldrig flusher senere — samme dispose-mekanisme som commit-stien.
   */
  toDispose: T[];
  // Kandidater i hverken toEmail eller toDispose venter (uden for
  // afsendelsesvinduet) og samles op af en senere cron-kørsel.
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
 * 1) Rapport-tilstandsfilter: slettet/godkendt/forsvundet rapport → dispose.
 * 2) Dedup: report_review_ready per (company_id, period_key) — nyeste vinder,
 *    taberne disposes.
 * 3) Afsendelsesvindue: udskudte kandidater (> 6 timer gamle, dvs. holdt
 *    tilbage af dagskvoten) sendes kun kl. 07-20 dansk tid — aldrig ved
 *    kvote-nulstillingen kl. 02 dansk nat. Friske sendes straks.
 */
export function selectNotificationEmails<T extends EmailCandidate>(
  candidates: T[],
  opts: { now?: Date } = {},
): SelectionResult<T> {
  const now = opts.now ?? new Date();
  const toDispose: T[] = [];

  // 1) Rapport-tilstandsfilter
  const alive: T[] = [];
  for (const c of candidates) {
    if (REPORT_NOTIFICATION_TYPES.has(c.type) && c.report !== undefined) {
      const r = c.report;
      if (r === null || r.deleted_at !== null || r.committed) {
        toDispose.push(c);
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
      toDispose.push(prev);
      winners.set(key, c);
    } else {
      toDispose.push(c);
    }
  }

  // 3) Afsendelsesvindue for udskudte kandidater
  const hour = copenhagenHour(now);
  const inWindow = hour >= SEND_WINDOW_START_HOUR && hour < SEND_WINDOW_END_HOUR;
  const toEmail: T[] = [];
  for (const c of [...passthrough, ...winners.values()]) {
    const deferred = now.getTime() - new Date(c.created_at).getTime() > DEFER_THRESHOLD_MS;
    if (deferred && !inWindow) continue; // vent — samles op i vinduet
    toEmail.push(c);
  }

  return { toEmail, toDispose };
}
