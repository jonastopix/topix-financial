/**
 * src/hooks/medlemsOverblik.ts — datalaget til medlemsoverblikket på
 * /virksomheder (29/9-2026). Én hentning for ALLE aktive virksomheder, ikke
 * én pr. række; reglerne bor i lib/medlemsOverblik.ts (sessionStatus,
 * aktiviteterAf, overbliksDom) — her hentes og joines der kun.
 *
 * HVAD DER GENBRUGES, OG HVAD DER IKKE GØR (målt 29/9 mod
 * VirksomhedslisteView.hentVirksomhedsliste og AdvisorDashboard.hentAdvisorDashboard):
 *   - REGLERNE er forsidens: medlemSiden = MIN(company_members.created_at)
 *     (AdvisorDashboard:929-934), harMaaltRapport = en facts-række med
 *     data_basis 'measured' (:935-936), antalUploads = financial_reports uden
 *     deleted_at (:937-940), medlemsbesked = conversations.last_member_message_at
 *     (:924-926). Samme definitioner, så listen og forsiden siger det samme.
 *   - DATAENE hentes IKKE gennem hentAdvisorDashboard: den henter 18 kilder
 *     (mål, forslag, fornyelse, venteliste …) for forsidens dom og udstiller
 *     ikke stemplerne pr. virksomhed (facts uden committed_at pr. række i
 *     svaret, ingen sessioner, logins, events, akademi, community). Listen
 *     henter den kun ved ?grund=. Hentningen her er sin egen nøgle — som
 *     hooks/kohorte.ts — så en fejl her ikke vælter listen: kolonnerne står
 *     tomme, og en linje siger det (BERIGELSE, forsidenKaster-mønstret).
 *   - Listens egen hentVirksomhedsliste henter company_members, conversations
 *     og facts (period_key/label) til sine syv felter — de er små og hentes
 *     igen her med de kolonner, motoren behøver (committed_at, created_at).
 *     «Sidst online» i listen er auth.users.last_sign_in_at (RPC); kolonnen
 *     «Sidst logget ind» her er user_login_log — de to var enige om datoen
 *     24 af 24 (målt 9/9, lib/sidstOnline.ts), og loggen er den, Jonas bad om.
 *
 * ALDRIG ET TAVST LOFT: hver kilde hentes side for side (hentAlleSider,
 * lib/budgetEngine — prod-beviset 24/8) med stabil orden, hver side gennem
 * kraevRaekker, så en fejl på side 2 kaster med kildens navn. user_login_log
 * hentes nyeste først pr. bruger-bidder (200 id'er, URL-længden) og stopper
 * først, når HVER bruger har fået sit nyeste stempel — ikke ved et tal.
 *
 * KILDERNE (alle med rådgiverens egen RLS, recon-raadgiver-overblik.md §5):
 *   companies · company_members · session_bookings (amount_dkk 0) ·
 *   user_login_log · financial_report_facts · financial_reports (uden
 *   sentinel, uden slettede) · pulse_checkins · conversations ·
 *   event_registrations (attending, ikke afmeldt) · member_progress (via
 *   company_members) · community_traade/svar/reaktioner · milestones.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { hentAlleSider } from "@/lib/budgetEngine";
import { byggOverblik, type OverbliksKilder, type OverbliksRaekke } from "@/lib/medlemsOverblik";

// ÉN SAMMENKOBLING (29/9): joinen bor i lib/medlemsOverblik.byggOverblik — den
// deles med statusmailens function (Deno-spejlet). Hooken HENTER kun. Typen
// re-eksporteres, så fladen kan blive ved med at importere den herfra.
export type { OverbliksRaekke };

export const MEDLEMS_OVERBLIK_QUERY_KEY = ["medlems-overblik"] as const;

type Svar<T> = { data: T[] | null; error: { message: string } | null };
/** Hver side gennem kraevRaekker: fejlen bærer kildens navn. */
const side = <T,>(kilde: string) => (res: Svar<T>) => ({ data: kraevRaekker(res, kilde), error: null });

/** Del en liste i bidder (URL-længden på .in()). */
const bidder = <T,>(liste: readonly T[], n: number): T[][] => {
  const ud: T[][] = [];
  for (let i = 0; i < liste.length; i += n) ud.push(liste.slice(i, i + n));
  return ud;
};

/** Nyeste login pr. bruger: nyeste først, og vi stopper, når alle brugere i bidden er set — aldrig ved et tal. */
async function nyesteLoginPrBruger(brugerIds: readonly string[]): Promise<Map<string, string>> {
  const ud = new Map<string, string>();
  for (const del of bidder(brugerIds, 200)) {
    const mangler = new Set(del);
    const SIDE = 1000;
    for (let fra = 0; mangler.size > 0; fra += SIDE) {
      const rk = kraevRaekker(
        await supabase.from("user_login_log").select("user_id, logged_in_at").in("user_id", del)
          .order("logged_in_at", { ascending: false }).order("id").range(fra, fra + SIDE - 1),
        "user_login_log",
      );
      for (const l of rk) {
        if (l.user_id && l.logged_in_at && !ud.has(l.user_id)) { ud.set(l.user_id, l.logged_in_at); mangler.delete(l.user_id); }
      }
      if (rk.length < SIDE) break;
    }
  }
  return ud;
}

export async function hentMedlemsOverblik(): Promise<Map<string, OverbliksRaekke>> {
  const nu = new Date();
  type Medlem = OverbliksKilder["medlemmer"][number];
  type Booking = OverbliksKilder["bookinger"][number] & { amount_dkk: number };
  const [companies, medlemmer, bookinger, facts, uploads, refleksioner, samtaler, events, progress, traade, svar, reaktioner, maal] = await Promise.all([
    // is_demo med (29/9): universfiltret i byggOverblik udelukker demo-virksomheden — ens for hook og function.
    hentAlleSider<OverbliksKilder["companies"][number]>((fra, til) =>
      supabase.from("companies").select("id, status, is_legat, er_kunde, is_demo, intro_session_used_at, jonas_session_used_at").order("id").range(fra, til).then(side("companies"))),
    hentAlleSider<Medlem>((fra, til) =>
      supabase.from("company_members").select("company_id, user_id, created_at").order("created_at", { ascending: true }).order("id").range(fra, til).then(side("company_members"))),
    hentAlleSider<Booking>((fra, til) =>
      supabase.from("session_bookings").select("company_id, advisor, amount_dkk, status, start_tid, slut_tid, created_at").eq("amount_dkk", 0).order("created_at").order("id").range(fra, til).then(side("session_bookings"))),
    hentAlleSider<{ company_id: string; committed_at: string | null; data_basis: string | null }>((fra, til) =>
      supabase.from("financial_report_facts").select("company_id, committed_at, data_basis").order("company_id").order("period_key").order("id").range(fra, til).then(side("financial_report_facts"))),
    hentAlleSider<{ company_id: string | null; uploaded_at: string | null }>((fra, til) =>
      supabase.from("financial_reports").select("company_id, uploaded_at").is("deleted_at", null).neq("file_path", "_sentinel").order("uploaded_at").order("id").range(fra, til).then(side("financial_reports"))),
    hentAlleSider<{ company_id: string; created_at: string }>((fra, til) =>
      supabase.from("pulse_checkins").select("company_id, created_at").order("created_at").order("id").range(fra, til).then(side("pulse_checkins"))),
    hentAlleSider<{ company_id: string | null; last_member_message_at: string | null }>((fra, til) =>
      supabase.from("conversations").select("company_id, last_member_message_at").order("id").range(fra, til).then(side("conversations"))),
    hentAlleSider<{ user_id: string; registered_at: string; response: string | null; cancelled_at: string | null }>((fra, til) =>
      supabase.from("event_registrations").select("user_id, registered_at, response, cancelled_at").order("registered_at").order("id").range(fra, til).then(side("event_registrations"))),
    hentAlleSider<{ user_id: string; updated_at: string }>((fra, til) =>
      supabase.from("member_progress").select("user_id, updated_at").order("updated_at").order("id").range(fra, til).then(side("member_progress"))),
    hentAlleSider<{ forfatter_id: string; created_at: string }>((fra, til) =>
      supabase.from("community_traade").select("forfatter_id, created_at").order("created_at").order("id").range(fra, til).then(side("community_traade"))),
    hentAlleSider<{ forfatter_id: string; created_at: string }>((fra, til) =>
      supabase.from("community_svar").select("forfatter_id, created_at").order("created_at").order("id").range(fra, til).then(side("community_svar"))),
    hentAlleSider<{ bruger_id: string; created_at: string }>((fra, til) =>
      supabase.from("community_reaktioner").select("bruger_id, created_at").order("created_at").order("bruger_id").range(fra, til).then(side("community_reaktioner"))),
    hentAlleSider<{ company_id: string; created_at: string; progress_updated_at: string | null; completed_at: string | null }>((fra, til) =>
      supabase.from("milestones").select("company_id, created_at, progress_updated_at, completed_at").order("created_at").order("id").range(fra, til).then(side("milestones"))),
  ]);

  // Logins: brugerne kendes først, når medlemmerne er hentet — én bid pr. 200.
  const brugerIds = [...new Set(medlemmer.map((m) => m.user_id).filter((x): x is string => !!x))];
  const loginByUser = await nyesteLoginPrBruger(brugerIds);
  const logins = [...loginByUser].map(([user_id, logged_in_at]) => ({ user_id, logged_in_at }));

  // Sammenkoblingen er motorens (byggOverblik) — ingen join her.
  return byggOverblik({ companies, medlemmer, bookinger, logins, facts, uploads, refleksioner, samtaler, events, progress, traade, svar, reaktioner, maal }, nu);
}

export function useMedlemsOverblik(enabled: boolean) {
  return useQuery({
    queryKey: MEDLEMS_OVERBLIK_QUERY_KEY,
    queryFn: hentMedlemsOverblik,
    enabled,
    staleTime: 2 * 60_000,
  });
}
