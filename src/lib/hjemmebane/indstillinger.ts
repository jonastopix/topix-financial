/**
 * src/lib/hjemmebane/indstillinger.ts
 *
 * De rene dele af /settings i Hjemmebane (10/9): aftalen for medlemmet,
 * betalingslinjerne og notifikationsindstillingerne. Ingen React, ingen
 * Supabase. Testet i __tests__/indstillinger.test.ts. Fladen er
 * components/hjemmebane/indstillinger/IndstillingerView.tsx.
 *
 * AFTALEN FOR MEDLEMMET (Jonas 10/9): rådgiveren har blok 7 «Aftalen» på
 * virksomhedssiden; medlemmet havde intet modstykke — kunne ikke se hvad de
 * betaler eller hvornår medlemskabet udløber. Policyerne fra 9/9 (#756,
 * migration 20260909120000) lader medlemmet læse company_perioder og
 * company_traek for egen virksomhed, MEN målt samme dag: 27 af 27 har nul
 * perioder og nul træk — tabellerne er fra 1. og 3. september, og ingen har
 * betalt gennem den nye kæde endnu (PHILBERT bliver den første, efter 22/9).
 * Derfor bygges det medlemmet KAN se i dag — slutdato og pris fra egen
 * companies-række — og perioder/træk vises KUN når der er nogen.
 *
 * VORES NOTER ER IKKE DERES AFTALE: company_fornyelse (beslutningen «vi
 * tilbyder»/«vi tilbyder ikke», noten, varselsstemplerne) læses ALDRIG her.
 * Migrationen gav bevidst ingen medlemspolicy på den tabel; AFTALE_KILDER
 * nedenfor er de eneste kolonner der må læses, og testen låser både listen
 * og fladens kildekode mod company_fornyelse.
 *
 * NOTIFIKATIONERNE (afgjort 10/9, Jonas' udgangspunkt: (b) hvis mindst to
 * ting kan slås fra): medlemmet KAN slå seks ting til og fra — fem
 * mailtyper i profiles.notification_email_prefs (learnt af koden:
 * action_required/important i send-notification-email, report_reminders i
 * send-report-reminder, monthly_digest i send-monthly-digest,
 * intro_reminders i intro-reminder-cron) og Ugens Fokus
 * (companies.weekly_focus_enabled, som generate-weekly-focus' gate læser,
 * #749). Så fanen bliver en RIGTIG indstilling. To ting rettes samtidig:
 *   - pulse_reminders vises ikke længere: send-pulse-reminder blev
 *     unscheduleret 12/6 (mailfortegnelsen M13) — en kontakt til en mail
 *     der aldrig kommer, er en løgn. Nøglen bevares i JSON'en (flet).
 *   - beskrivelserne siger det koden gør: digesten kommer d. 22 (flyttet
 *     fra d. 5 den 10/8), rapportpåmindelsen d. 7/15/20 KUN når en måned
 *     mangler, og «ny AI-analyse klar» mailes ikke (info-prioritet).
 * Rådgiverens tekst («Du modtager Slack-notifikationer…») er væk: rådgivere
 * sendes til /konto og så aldrig den fane.
 */

import { beloebKr } from "@/lib/traek";
import type { MembershipTier } from "@/lib/membershipTier";
import { kalenderdageTil } from "./aftaler";

// ── Aftalen ───────────────────────────────────────────────────────────────

/** De kolonner på companies medlemmets aftale læser — og INTET andet. */
export const AFTALE_KILDER = [
  "contract_start_date",
  "contract_end_date",
  "indgangspris_oere",
  "fornyelsespris_oere",
  "subscription_status",
  "subscription_current_period_end",
] as const;

/** Det der er VORES noter (company_fornyelse) — må aldrig læses af medlemmets flade. */
export const FORBUDTE_KILDER = ["company_fornyelse", "beslutning", "besluttet_at", "varsel_1_sendt_at", "varsel_2_sendt_at"] as const;

export interface AftaleInput {
  contract_start_date: string | null;
  contract_end_date: string | null;
  indgangspris_oere: number | null;
  fornyelsespris_oere: number | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
}

export interface AftaleLinje {
  label: string;
  vaerdi: string;
  /** Sandt når linjen er en advarsel (udløbet, ingen slutdato). */
  rust?: boolean;
}

export function formatDato(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
}

/** «Medlemskabet gælder til 22. september 2026 — 12 dage endnu» osv. */
export function medlemskabStatus(a: Pick<AftaleInput, "contract_end_date" | "subscription_status" | "subscription_current_period_end">, tier: MembershipTier, nu: Date): AftaleLinje {
  const slut = formatDato(a.contract_end_date);
  if (tier === "full" && slut && a.contract_end_date) {
    const dage = kalenderdageTil(new Date(a.contract_end_date), nu);
    const rest = dage === 0 ? "sidste dag i dag" : dage === 1 ? "1 dag endnu" : `${dage} dage endnu`;
    return { label: "Medlemskab", vaerdi: `Gælder til ${slut} — ${rest}` };
  }
  if (tier === "subscriber") {
    const til = formatDato(a.subscription_current_period_end);
    return { label: "Medlemskab", vaerdi: til ? `Abonnement — næste periode fra ${til}` : "Abonnement" };
  }
  if (tier === "expired" && slut) return { label: "Medlemskab", vaerdi: `Udløb ${slut}`, rust: true };
  return { label: "Medlemskab", vaerdi: "Ingen slutdato registreret — spørg din rådgiver", rust: true };
}

/** Linjerne i aftalekortet, i rækkefølge. Kun det der er sat vises — bortset fra status og slutdato. */
export function aftaleLinjer(a: AftaleInput, tier: MembershipTier, nu: Date): AftaleLinje[] {
  const linjer: AftaleLinje[] = [medlemskabStatus(a, tier, nu)];
  const start = formatDato(a.contract_start_date);
  if (start) linjer.push({ label: "Start", vaerdi: start });
  linjer.push({ label: "Slut", vaerdi: formatDato(a.contract_end_date) ?? "Ikke registreret", rust: !a.contract_end_date });
  if (a.indgangspris_oere != null) linjer.push({ label: "Pris", vaerdi: `${beloebKr(a.indgangspris_oere)} for medlemskabet` });
  if (a.fornyelsespris_oere != null) linjer.push({ label: "Fornyelsespris", vaerdi: beloebKr(a.fornyelsespris_oere) });
  return linjer;
}

/** Når hverken pris eller slutdato er registreret — så aftalen ikke ser tom ud uden ord. */
export const AFTALE_UDEN_TAL = "Vi har ikke registreret pris og datoer på din aftale endnu. Skriv til din rådgiver, hvis du vil have dem på plads.";

// ── Betalingen (perioder og træk) ─────────────────────────────────────────

export const BETALINGSMODEL_LABEL: Readonly<Record<string, string>> = {
  fuld: "Fuld betaling",
  rate2: "2 rater",
  rate12: "12 rater",
};

export interface PeriodeInput {
  id: string;
  art: string;
  betalingsmodel: string;
  beloeb_oere: number;
  periode_start: string;
  periode_slut: string;
}

export interface TraekInput {
  stripe_invoice_id: string;
  status: string;
  beloeb_oere: number;
  betalt_at: string | null;
  fejlet_at: string | null;
  faktura_nummer: string | null;
  hosted_invoice_url: string | null;
}

export interface BetalingsLinje {
  id: string;
  label: string;
  vaerdi: string;
  rust?: boolean;
  /** Link til Stripes faktura, når der er én. */
  fakturaUrl?: string | null;
}

const ART_LABEL: Readonly<Record<string, string>> = { indgang: "Medlemskab", fornyelse: "Fornyelse", abonnement: "Abonnement" };

export function periodeLinje(p: PeriodeInput): BetalingsLinje {
  const model = BETALINGSMODEL_LABEL[p.betalingsmodel] ?? p.betalingsmodel;
  return {
    id: p.id,
    label: `${formatDato(p.periode_start) ?? p.periode_start} – ${formatDato(p.periode_slut) ?? p.periode_slut}`,
    vaerdi: `${beloebKr(p.beloeb_oere)} · ${model} · ${ART_LABEL[p.art] ?? p.art}`,
  };
}

/** Status i medlemmets ord — ikke databasens. */
export function traekStatusOrd(status: string): string {
  if (status === "betalt") return "Betalt";
  if (status === "fejlet") return "Betalingen fejlede";
  if (status === "afventer" || status === "aaben" || status === "open") return "Afventer betaling";
  return status;
}

export function traekLinje(t: TraekInput): BetalingsLinje {
  const dato = t.status === "betalt" ? formatDato(t.betalt_at) : t.status === "fejlet" ? formatDato(t.fejlet_at) : null;
  return {
    id: t.stripe_invoice_id,
    label: t.faktura_nummer ? `Faktura ${t.faktura_nummer}` : "Faktura",
    vaerdi: `${beloebKr(t.beloeb_oere)} · ${traekStatusOrd(t.status)}${dato ? ` ${dato}` : ""}`,
    rust: t.status === "fejlet",
    fakturaUrl: t.hosted_invoice_url,
  };
}

/** Perioder først (nyeste øverst, som rådgiverens kort), så træk. Tom liste = kortet vises ikke. */
export function betalingsLinjer(perioder: readonly PeriodeInput[], traek: readonly TraekInput[]): BetalingsLinje[] {
  return [...perioder.map(periodeLinje), ...traek.map(traekLinje)];
}

// ── Notifikationerne ──────────────────────────────────────────────────────

export type EmailIndstillingNoegle = "action_required" | "important" | "report_reminders" | "monthly_digest" | "intro_reminders";

export interface EmailIndstilling {
  noegle: EmailIndstillingNoegle;
  label: string;
  beskrivelse: string;
}

/** De fem mailtyper koden faktisk læser — i den rækkefølge de vises. */
export const EMAIL_INDSTILLINGER: readonly EmailIndstilling[] = [
  { noegle: "action_required", label: "Når dine tal venter på dig", beskrivelse: "Rapport klar til gennemsyn, eller en rapport vi ikke kunne læse." },
  { noegle: "important", label: "Opdateringer", beskrivelse: "Svar fra din rådgiver, nye opslag i Community og påmindelser om events." },
  { noegle: "report_reminders", label: "Rapportpåmindelser", beskrivelse: "Den 7., 15. og 20. i måneden — kun når en måned mangler." },
  { noegle: "monthly_digest", label: "Månedsoverblik", beskrivelse: "Den 22. i måneden: dine tal, milepæle og ulæste beskeder." },
  { noegle: "intro_reminders", label: "Din sparring med Morten", beskrivelse: "En påmindelse om den inkluderede sparring, indtil du har booket den." },
];

/** Nøgler der findes i gemte data men ikke længere vises — bevares uændret ved gem. */
export const SKJULTE_NOEGLER = ["pulse_reminders"] as const;

export type EmailPraeferencer = Record<EmailIndstillingNoegle, boolean>;

/** Læser JSON'en: alt er slået til medmindre det udtrykkeligt er false (samme regel som koden). */
export function laesPraeferencer(json: unknown): EmailPraeferencer {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const ud = {} as EmailPraeferencer;
  for (const i of EMAIL_INDSTILLINGER) ud[i.noegle] = o[i.noegle] !== false;
  return ud;
}

/** Fletter valgene ind i den gemte JSON — ukendte og skjulte nøgler bevares. */
export function fletPraeferencer(eksisterende: unknown, valg: EmailPraeferencer): Record<string, unknown> {
  const o = (eksisterende && typeof eksisterende === "object" ? { ...(eksisterende as Record<string, unknown>) } : {}) as Record<string, unknown>;
  for (const i of EMAIL_INDSTILLINGER) o[i.noegle] = valg[i.noegle];
  return o;
}

export const UGENS_FOKUS_TEKST = {
  label: "Ugens fokus",
  beskrivelse: "Hver mandag morgen ser vores AI dine rapporter, milepæle og handouts igennem og foreslår højst tre konkrete ting. Kræver mindst én godkendt rapport.",
} as const;
