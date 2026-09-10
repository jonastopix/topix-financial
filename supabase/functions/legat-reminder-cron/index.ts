/**
 * legat-reminder-cron — Momentumkald-påmindelsen til legatmedlemmer.
 *
 * HISTORIK (10/9): funktionen bestod alene af et Deno.cron-kald, og Deno.cron
 * kører ikke på Supabases runtime — den har derfor ALDRIG kørt. Ingen
 * legatmedlemmer har fået påmindelsen. Nu er den en Bucket B-funktion som de
 * øvrige crons: HTTP-indgang + authenticateServiceRole, planlagt via
 * pg_cron/kald_edge (migration 20260910210000_legat_reminder_cron.sql).
 *
 * LOGIKKEN er uændret: aktive legat_enrollments uden booket Momentumkald,
 * mindst 2 dage efter start, én besked pr. samtale (message_type
 * «legat-momentum-reminder» findes allerede → aldrig to gange), afsender er
 * den rådgiver der oprettede forløbet.
 *
 * TØRKØRSEL er standarden: uden body (eller uden { "dry_run": false })
 * findes kandidaterne og rapporteres, men intet skrives. Cron-jobbet sender
 * eksplicit dry_run: false.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Dage efter start_date før påmindelsen må sendes. */
export const MIN_DAGE_EFTER_START = 2;
export const REMINDER_MESSAGE_TYPE = "legat-momentum-reminder";

export function paamindelsesTekst(firstName: string): string {
  return `Hej ${firstName} 👋 Har du husket at booke dit Momentumkald? Det er en god mulighed for at afslutte forløbet og evt. høre mere om mulighederne for et videre samarbejde med Morten og Jonas — book her: https://theboardroom.dk/momentumkald`;
}

interface Resultat {
  ok: boolean;
  dry_run: boolean;
  enrollments: number;
  kandidater: { enrollment_id: string; user_id: string; dage_siden_start: number }[];
  ville_sende: number;
  sendt: number;
  sprunget_over: { for_ny: number; ingen_samtale: number; allerede_sendt: number; ingen_afsender: number };
  fejl: string[];
}

async function koerPaamindelser(supabase: SupabaseClient, toerKoersel: boolean): Promise<Resultat> {
  const resultat: Resultat = {
    ok: true,
    dry_run: toerKoersel,
    enrollments: 0,
    kandidater: [],
    ville_sende: 0,
    sendt: 0,
    sprunget_over: { for_ny: 0, ingen_samtale: 0, allerede_sendt: 0, ingen_afsender: 0 },
    fejl: [],
  };

  // 1. Aktive forløb uden booket Momentumkald
  const { data: enrollments, error: enrollErr } = await supabase
    .from("legat_enrollments")
    .select("id, user_id, start_date, created_by")
    .eq("status", "active")
    .eq("momentumkald_booked", false);

  if (enrollErr) {
    resultat.ok = false;
    resultat.fejl.push(`legat_enrollments: ${enrollErr.message}`);
    return resultat;
  }
  resultat.enrollments = enrollments?.length ?? 0;
  if (!enrollments?.length) return resultat;

  const now = Date.now();

  for (const enrollment of enrollments) {
    try {
      // 2. Mindst MIN_DAGE_EFTER_START dage efter start
      const dageSidenStart = Math.floor((now - new Date(enrollment.start_date).getTime()) / 86_400_000);
      if (dageSidenStart < MIN_DAGE_EFTER_START) {
        resultat.sprunget_over.for_ny++;
        continue;
      }

      // 3. Medlemmets samtale
      const { data: conversation, error: convErr } = await supabase
        .from("conversations")
        .select("id")
        .eq("member_id", enrollment.user_id)
        .limit(1)
        .maybeSingle();
      if (convErr) {
        resultat.fejl.push(`conversations ${enrollment.id}: ${convErr.message}`);
        continue;
      }
      if (!conversation) {
        resultat.sprunget_over.ingen_samtale++;
        continue;
      }

      // 4. Aldrig to gange — findes påmindelsen allerede i samtalen?
      const { data: existing, error: existErr } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation.id)
        .eq("message_type", REMINDER_MESSAGE_TYPE)
        .limit(1);
      if (existErr) {
        resultat.fejl.push(`messages ${enrollment.id}: ${existErr.message}`);
        continue;
      }
      if (existing?.length) {
        resultat.sprunget_over.allerede_sendt++;
        continue;
      }

      // 5. Afsenderen er den rådgiver der oprettede forløbet
      const senderId = enrollment.created_by;
      if (!senderId) {
        resultat.sprunget_over.ingen_afsender++;
        continue;
      }

      resultat.kandidater.push({ enrollment_id: enrollment.id, user_id: enrollment.user_id, dage_siden_start: dageSidenStart });
      resultat.ville_sende++;
      if (toerKoersel) continue;

      // 6. Fornavn + besked
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", enrollment.user_id)
        .maybeSingle();
      const firstName = profile?.full_name?.split(" ")[0] || "du";

      const { error: msgErr } = await supabase.from("messages").insert({
        conversation_id: conversation.id,
        sender_id: senderId,
        message_type: REMINDER_MESSAGE_TYPE,
        content: paamindelsesTekst(firstName),
      });
      if (msgErr) {
        resultat.fejl.push(`insert ${enrollment.id}: ${msgErr.message}`);
        continue;
      }

      // 7. Samtalens ur og hvem der skylder svar
      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString(), awaiting_reply_from: "company" })
        .eq("id", conversation.id);

      resultat.sendt++;
      console.log(`[legat-reminder] påmindelse sendt for enrollment ${enrollment.id}`);
    } catch (err) {
      resultat.fejl.push(`${enrollment.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return resultat;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  // TØRKØRSEL default: kun et eksplicit { "dry_run": false } skriver.
  let toerKoersel = true;
  try {
    const body = await req.json();
    if (body?.dry_run === false) toerKoersel = false;
  } catch {
    /* ingen body, sikker tørkørsel */
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const resultat = await koerPaamindelser(supabase, toerKoersel);
  console.log("[legat-reminder-cron] Summary:", JSON.stringify(resultat));

  return new Response(JSON.stringify(resultat), {
    status: resultat.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
