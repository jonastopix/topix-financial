/**
 * Datoer og tekst for certifikatet.
 * Alle datoer regnes som kalenderdage i Europe/Copenhagen.
 */

export const UNLOCK_DAYS_BEFORE = 7;
export const MEMBERSHIP_MONTHS = 12;

/** Lægger hele måneder til og holder dagen inden for måneden (31. jan + 1 md = 28./29. feb). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), lastDay));
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

/** Dato uden klokkeslæt i dansk tid. */
export function copenhagenDate(d: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d)
    .split("-")
    .map(Number);
  return new Date(parts[0]!, parts[1]! - 1, parts[2]!);
}

const monthYear = new Intl.DateTimeFormat("da-DK", { month: "long", year: "numeric" });
const dayMonthYear = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long", year: "numeric" });

/** "oktober 2025 – oktober 2026" (små bogstaver, tankestreg med mellemrum). */
export function formatPeriod(start: Date, end: Date): string {
  return `${monthYear.format(start)} – ${monthYear.format(end)}`;
}

/** "6. oktober 2026" */
export function formatDay(d: Date): string {
  return dayMonthYear.format(d);
}

export type CertificateState = "hidden" | "locked" | "open";

export interface CertificateStatus {
  state: CertificateState;
  /** Datoen hvor medlemmet runder 12 måneder. */
  twelveMonthDate: Date;
  /** Datoen hvor området åbner (12-månedersdatoen minus 7 dage). */
  unlockDate: Date;
  /** Hele dage til åbning (0 når åbent). */
  daysUntilUnlock: number;
  /** 1-12: hvilken medlemsmåned medlemmet er i nu. */
  currentMonth: number;
  /** 0-1: hvor langt medlemmet er mod 12-månedersdatoen (til fremdriftsbjælken). */
  progress: number;
  period: string;
}

/**
 * eligible: kun medlemmer der har fået certifikatet lovet (første hold). Andre ser intet.
 * Når området er åbnet, forbliver det åbent (også efter udløb), så medlemmet kan hente igen.
 */
export function getCertificateStatus(membershipStart: Date, eligible: boolean, now: Date = new Date()): CertificateStatus {
  const start = new Date(membershipStart.getFullYear(), membershipStart.getMonth(), membershipStart.getDate());
  const today = copenhagenDate(now);
  const twelveMonthDate = addMonths(start, MEMBERSHIP_MONTHS);
  const unlockDate = addDays(twelveMonthDate, -UNLOCK_DAYS_BEFORE);
  const msDay = 24 * 60 * 60 * 1000;
  const daysUntilUnlock = Math.max(0, Math.round((unlockDate.getTime() - today.getTime()) / msDay));

  let currentMonth = 1;
  while (currentMonth < MEMBERSHIP_MONTHS && addMonths(start, currentMonth) <= today) currentMonth++;

  const total = twelveMonthDate.getTime() - start.getTime();
  const progress = Math.min(1, Math.max(0, (today.getTime() - start.getTime()) / total));

  const state: CertificateState = !eligible ? "hidden" : today >= unlockDate ? "open" : "locked";
  return { state, twelveMonthDate, unlockDate, daysUntilUnlock, currentMonth, progress, period: formatPeriod(start, twelveMonthDate) };
}

/** "the-boardroom-certifikat-anne-sofie-holm" */
export function certificateFileName(memberName: string): string {
  const slug = memberName
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `the-boardroom-certifikat-${slug || "medlem"}`;
}
