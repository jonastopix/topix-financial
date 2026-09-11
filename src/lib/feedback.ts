/**
 * src/lib/feedback.ts — feedback-motoren (11/9, mangellistens kort 85).
 *
 * HVORFOR: FeedbackDialog (den gamle skal, AppLayouts flydende knap) bar
 * validering, sti, grænser og hele skrivevejen inde i komponenten. Hb-
 * skallen fik sin egen dialog (HbFeedbackDialog), og to dialoger med hver
 * sin skrivevej er to steder at få det forkert. Derfor ÉN skrivevej her,
 * og de rene dele for sig, så vitest kan låse dem
 * (src/lib/__tests__/feedback.test.ts).
 *
 * Adfærden er FLYTTET, ikke ændret: samme grænser (image/*, 5 MB, 120 og
 * 2000 tegn), samme sti, samme rækkefølge i indsendelsen (upload → rpc
 * user_company_id → insert med .select("id").single() → notify) og samme
 * felter som FeedbackDialog.tsx:51-115 havde. Kategoriernes VÆRDIER
 * (bug/suggestion/other) er urørte — admin-fladen filtrerer på dem
 * (FeedbackView.tsx:159) og databasen bærer dem; kun etiketterne er danske.
 */
import { supabase } from "@/integrations/supabase/client";
import { notifyFeedbackSubmitted } from "@/lib/feedbackNotify";

export const FEEDBACK_KATEGORIER = [
  { key: "bug", label: "Fejl" },
  { key: "suggestion", label: "Forslag" },
  { key: "other", label: "Andet" },
] as const;

export type FeedbackKategori = (typeof FEEDBACK_KATEGORIER)[number]["key"];

export const FEEDBACK_STANDARD_KATEGORI: FeedbackKategori = "suggestion";

export const FEEDBACK_TITEL_MAX = 120;
export const FEEDBACK_BESKRIVELSE_MAX = 2000;
export const SKAERMBILLEDE_MAX_BYTES = 5 * 1024 * 1024;
export const SKAERMBILLEDE_BUCKET = "feedback-screenshots";

// ── Rene dele ───────────────────────────────────────────────────────

export type SkaermbilledeDom = { ok: true } | { ok: false; titel: string; tekst: string };

/** image/* og højst 5 MB — teksterne er dialogens (FeedbackDialog.tsx:55, :59). */
export function doemSkaermbillede(fil: { type: string; size: number }): SkaermbilledeDom {
  if (!fil.type.startsWith("image/")) {
    return { ok: false, titel: "Kun billeder", tekst: "Upload venligst et billede (PNG, JPG, etc.)." };
  }
  if (fil.size > SKAERMBILLEDE_MAX_BYTES) {
    return { ok: false, titel: "For stort", tekst: "Billedet må max fylde 5 MB." };
  }
  return { ok: true };
}

/**
 * Stien i bucketen: `{userId}/{tidsstempel}.{ext}`. FØRSTE MAPPE SKAL VÆRE
 * BRUGERENS ID: storage-policyen «Users can upload own feedback screenshots»
 * (migration 20260911030000_feedback_bucket_mappetjek.sql) kræver
 * `(storage.foldername(name))[1] = auth.uid()::text`, og SELECT-policyen for
 * egen mappe (20260314164757) det samme. Ændres formen, afvises uploaden.
 * Låst i feedback.test.ts, som også læser migrationen.
 * Endelsen er filnavnets sidste «.»-led, ellers «png» (som før).
 */
export function skaermbilledeSti(userId: string, filnavn: string, nu: number = Date.now()): string {
  const ext = filnavn.split(".").pop() || "png";
  return `${userId}/${nu}.${ext}`;
}

/** Titlen som den sendes: højst 120 tegn (inputtets maxLength), trimmet. */
export function klargoerTitel(titel: string): string {
  return titel.slice(0, FEEDBACK_TITEL_MAX).trim();
}

/** Beskrivelsen som den sendes: højst 2000 tegn, trimmet; tom er tilladt. */
export function klargoerBeskrivelse(beskrivelse: string): string {
  return beskrivelse.slice(0, FEEDBACK_BESKRIVELSE_MAX).trim();
}

/** Knappen er aktiv når titlen ikke er tom efter trimning (som `!title.trim()` før). */
export function kanSendeFeedback(titel: string): boolean {
  return klargoerTitel(titel) !== "";
}

// ── Skrivevejen (IO) ────────────────────────────────────────────────

export interface SendFeedbackInput {
  userId: string;
  category: FeedbackKategori;
  title: string;
  description: string;
  screenshot: File | null;
}

export type SendFeedbackResultat =
  | { ok: true; id: string }
  | { ok: false; trin: "upload" | "insert"; fejl: string };

/**
 * Samme rækkefølge og samme felter som FeedbackDialog.tsx:77-115 før 11/9:
 * 1. skærmbilledet uploades (hvis der er et) — fejler det, stopper vi før
 *    noget er skrevet i tabellen;
 * 2. company_id via rpc user_company_id (null for rådgivere — og fejlen
 *    ignoreres som før: feedback uden virksomhed er stadig feedback);
 * 3. insert i feedback med .select("id").single();
 * 4. notifyFeedbackSubmitted — fire-and-forget (Slack + rådgiverklokke).
 * Kaster ikke: udfaldet siger hvad der skete, og dialogen viser det.
 */
export async function sendFeedback(input: SendFeedbackInput): Promise<SendFeedbackResultat> {
  let screenshotPath: string | null = null;

  if (input.screenshot) {
    const path = skaermbilledeSti(input.userId, input.screenshot.name);
    const { error: uploadError } = await supabase.storage
      .from(SKAERMBILLEDE_BUCKET)
      .upload(path, input.screenshot, { contentType: input.screenshot.type });
    if (uploadError) return { ok: false, trin: "upload", fejl: uploadError.message };
    screenshotPath = path;
  }

  const { data: companyData } = await supabase.rpc("user_company_id", { _user_id: input.userId });

  const { data: inserted, error } = await supabase
    .from("feedback")
    .insert({
      user_id: input.userId,
      company_id: companyData || null,
      category: input.category,
      title: klargoerTitel(input.title),
      description: klargoerBeskrivelse(input.description),
      screenshot_path: screenshotPath,
    })
    .select("id")
    .single();

  if (error || !inserted) return { ok: false, trin: "insert", fejl: error?.message ?? "Ingen række" };

  notifyFeedbackSubmitted(inserted.id);
  return { ok: true, id: inserted.id };
}
