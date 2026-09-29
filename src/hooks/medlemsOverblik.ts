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
import { erKunde } from "@/lib/raadgiverensKunder";
import {
  aktiviteterAf,
  overbliksDom,
  sessionStatus,
  type Aktivitet,
  type AktivitetsFelt,
  type AktivitetsInput,
  type OverbliksDom,
  type SessionDom,
  type SessionRaekke,
} from "@/lib/medlemsOverblik";

export const MEDLEMS_OVERBLIK_QUERY_KEY = ["medlems-overblik"] as const;

export interface OverbliksRaekke {
  companyId: string;
  antalBrugere: number;
  medlemSiden: string | null;
  sessioner: { morten: SessionDom; jonas: SessionDom };
  aktivitet: Record<AktivitetsFelt, Aktivitet>;
  dom: OverbliksDom;
}

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
  type Medlem = { company_id: string; user_id: string; created_at: string | null };
  type Booking = SessionRaekke & { company_id: string | null; advisor: string; amount_dkk: number };
  const [companies, medlemmer, bookinger, facts, uploads, refleksioner, samtaler, events, progress, traade, svar, reaktioner, maal] = await Promise.all([
    hentAlleSider<{ id: string; status: string | null; is_legat: boolean | null; er_kunde: boolean | null; intro_session_used_at: string | null; jonas_session_used_at: string | null }>((fra, til) =>
      supabase.from("companies").select("id, status, is_legat, er_kunde, intro_session_used_at, jonas_session_used_at").order("id").range(fra, til).then(side("companies"))),
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

  // Bruger → virksomhed (akademi, events, community, logins har intet company_id).
  const brugereByCompany = new Map<string, string[]>();
  const companyByUser = new Map<string, string[]>();
  const medlemSidenByCompany = new Map<string, string>();
  for (const m of medlemmer) {
    if (!m.company_id || !m.user_id) continue;
    brugereByCompany.set(m.company_id, [...(brugereByCompany.get(m.company_id) ?? []), m.user_id]);
    companyByUser.set(m.user_id, [...(companyByUser.get(m.user_id) ?? []), m.company_id]);
    if (m.created_at && (!medlemSidenByCompany.has(m.company_id) || m.created_at < (medlemSidenByCompany.get(m.company_id) as string))) medlemSidenByCompany.set(m.company_id, m.created_at);
  }
  const loginByUser = await nyesteLoginPrBruger([...companyByUser.keys()]);

  const laeg = (kort: Map<string, string[]>, id: string | null | undefined, stempel: string | null | undefined) => {
    if (!id || !stempel) return;
    kort.set(id, [...(kort.get(id) ?? []), stempel]);
  };
  const prBruger = (kort: Map<string, string[]>, userId: string | null | undefined, stempel: string | null | undefined) => {
    for (const cid of companyByUser.get(userId ?? "") ?? []) laeg(kort, cid, stempel);
  };
  const godkendt = new Map<string, string[]>(), uploadet = new Map<string, string[]>(), refl = new Map<string, string[]>(), besked = new Map<string, string[]>(),
    eventer = new Map<string, string[]>(), akademi = new Map<string, string[]>(), community = new Map<string, string[]>(), maalRoert = new Map<string, string[]>();
  const maaltByCompany = new Set<string>();
  const uploadsByCompany = new Map<string, number>();
  for (const f of facts) { laeg(godkendt, f.company_id, f.committed_at); if (f.data_basis === "measured") maaltByCompany.add(f.company_id); }
  for (const u of uploads) { laeg(uploadet, u.company_id, u.uploaded_at); if (u.company_id) uploadsByCompany.set(u.company_id, (uploadsByCompany.get(u.company_id) ?? 0) + 1); }
  for (const r of refleksioner) laeg(refl, r.company_id, r.created_at);
  for (const s of samtaler) laeg(besked, s.company_id, s.last_member_message_at);
  for (const e of events) if (e.response === "attending" && !e.cancelled_at) prBruger(eventer, e.user_id, e.registered_at);
  for (const p of progress) prBruger(akademi, p.user_id, p.updated_at);
  for (const t of traade) prBruger(community, t.forfatter_id, t.created_at);
  for (const s of svar) prBruger(community, s.forfatter_id, s.created_at);
  for (const r of reaktioner) prBruger(community, r.bruger_id, r.created_at);
  for (const m of maal) { laeg(maalRoert, m.company_id, m.created_at); laeg(maalRoert, m.company_id, m.progress_updated_at); laeg(maalRoert, m.company_id, m.completed_at); }
  const bookingerByCompany = new Map<string, Booking[]>();
  for (const b of bookinger) if (b.company_id) bookingerByCompany.set(b.company_id, [...(bookingerByCompany.get(b.company_id) ?? []), b]);

  const ud = new Map<string, OverbliksRaekke>();
  for (const c of companies) {
    // Samme univers som listen: aktive/status-løse kunder, ikke legat.
    if (c.is_legat || !(c.status === "active" || !c.status) || !erKunde(c)) continue;
    const brugere = brugereByCompany.get(c.id) ?? [];
    const rk = bookingerByCompany.get(c.id) ?? [];
    const input: AktivitetsInput = {
      login: brugere.map((u) => loginByUser.get(u)).filter((x): x is string => !!x),
      godkendt_rapport: godkendt.get(c.id) ?? [],
      uploadet_rapport: uploadet.get(c.id) ?? [],
      refleksion: refl.get(c.id) ?? [],
      medlemsbesked: besked.get(c.id) ?? [],
      event_tilmelding: eventer.get(c.id) ?? [],
      akademi: akademi.get(c.id) ?? [],
      community: community.get(c.id) ?? [],
      maal: maalRoert.get(c.id) ?? [],
    };
    const aktivitet = aktiviteterAf(input, nu);
    const sessioner = {
      morten: sessionStatus({ raadgiver: "morten", retAt: c.intro_session_used_at, raekker: rk.filter((b) => b.advisor === "morten"), nu }),
      jonas: sessionStatus({ raadgiver: "jonas", retAt: c.jonas_session_used_at, raekker: rk.filter((b) => b.advisor === "jonas"), nu }),
    };
    const medlemSiden = medlemSidenByCompany.get(c.id) ?? null;
    const dom = overbliksDom({
      nu, antalBrugere: brugere.length, medlemSiden, sessioner, aktivitet,
      harMaaltRapport: maaltByCompany.has(c.id), antalUploads: uploadsByCompany.get(c.id) ?? 0,
    });
    ud.set(c.id, { companyId: c.id, antalBrugere: brugere.length, medlemSiden, sessioner, aktivitet, dom });
  }
  return ud;
}

export function useMedlemsOverblik(enabled: boolean) {
  return useQuery({
    queryKey: MEDLEMS_OVERBLIK_QUERY_KEY,
    queryFn: hentMedlemsOverblik,
    enabled,
    staleTime: 2 * 60_000,
  });
}
