/**
 * src/hooks/kohorte.ts
 *
 * Hentningen bag kohortelinjen «Nye medlemmer (30 dage)» på rådgiverens
 * forside (Jonas 16/9). De rene dele — dommen og teksterne — bor i
 * src/lib/hjemmebane/kohorte.ts. Mønstret er hooks/ubesvaredeOpslag.ts og
 * hooks/sidenSidst.ts: én react-query-nøgle, egen hentning adskilt fra
 * forsidens datalag, så en fejl her ikke vælter dommen.
 *
 * TRE KILDER, ÉN NØGLE, alle med rådgiverens egen RLS — ingen SQL-ændring:
 *   companies (id, name, is_legat, er_kunde)          — «Advisors can view all companies»
 *   company_members (company_id, user_id, created_at) — rådgiveren læser alle
 *   user_login_log (user_id, logged_in_at)            — «Advisors can view all login logs»
 *                                                       (20260302213733:14-17)
 * Alle går gennem kraevRaekker: en fejl bliver en HentningsFejl med kildens
 * navn, og linjen viser husets fejltekst — aldrig «Ingen nye medlemmer»
 * som var det målt.
 *
 * ANKERET ER DEN FØRSTE RÆKKE: instruksen sagde «company_members for de
 * sidste 31 døgn», men start = MIN(created_at) pr. virksomhed — en
 * virksomhed der fik sit andet medlem i sidste uge og sit første for et
 * halvt år siden er IKKE ny. Derfor to trin: (1) rækker fra de sidste 31
 * døgn giver kandidat-virksomhederne, (2) ALLE rækker for netop de
 * virksomheder giver ankeret og medlemmerne. Dommen finder selv den første.
 * Logins hentes for netop de brugere, fra den tidligste start og frem.
 *
 * SIDE FOR SIDE (rettelse 16/9): PostgREST svarer højst 1.000 rækker pr.
 * forespørgsel (max-rows) — uden fejl, resten klippes stille. user_login_log
 * får én række pr. SIGNED_IN, og auth-js udsender SIGNED_IN ved hvert
 * faneskift tilbage til appen (useAuth.tsx:342-350); 15–45 nye medlemmer
 * over 30 døgn kan passere 1.000 rækker, og så ville en der kom igen stå som
 * «Ikke kommet igen». Derfor husets hjælper hentAlleSider (lib/budgetEngine,
 * prod-beviset 24/8: remm.s 1.378 budget-rækker) med stabil orden
 * (logged_in_at, id) og .range pr. side — hver side gennem kraevRaekker, så
 * en fejl på side 2 kaster med kildens navn. Samme for medlemsrækkerne.
 */
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { hentAlleSider } from "@/lib/budgetEngine";
import {
  KOHORTE_VINDUE_MS,
  type KohorteInput,
  type KohorteLogin,
  type KohorteMedlem,
  type KohorteVirksomhed,
} from "@/lib/hjemmebane/kohorte";

export const KOHORTE_KEY = ["forside", "kohorte"] as const;

/** Én dag ekstra over vinduet, så dansk dato-grænsen aldrig klipper en kandidat. */
const KANDIDAT_VINDUE_MS = KOHORTE_VINDUE_MS + 24 * 60 * 60 * 1000;

/** Én side gennem kraevRaekker: fejl → HentningsFejl(kilde), aldrig en tom side. */
const side = <T,>(kilde: string) =>
  (res: { data: T[] | null; error: { message: string } | null }) => ({ data: kraevRaekker(res, kilde), error: null });

export async function hentKohorte(nu: Date = new Date()): Promise<Omit<KohorteInput, "nu">> {
  const siden = new Date(nu.getTime() - KANDIDAT_VINDUE_MS).toISOString();

  const [companiesRes, nyeRes] = await Promise.all([
    supabase.from("companies").select("id, name, is_legat, er_kunde"),
    supabase.from("company_members").select("company_id, user_id, created_at").gte("created_at", siden),
  ]);
  const virksomheder = kraevRaekker(companiesRes, "companies") as KohorteVirksomhed[];
  const nye = kraevRaekker(nyeRes, "company_members") as KohorteMedlem[];

  const kandidatIds = [...new Set(nye.map((r) => r.company_id))];
  const medlemmer: KohorteMedlem[] =
    kandidatIds.length === 0
      ? []
      : await hentAlleSider<KohorteMedlem>((fra, til) =>
          supabase
            .from("company_members")
            .select("company_id, user_id, created_at")
            .in("company_id", kandidatIds)
            .order("created_at", { ascending: true })
            .order("id")
            .range(fra, til)
            .then(side<KohorteMedlem>("company_members")),
        );

  const brugerIds = [...new Set(medlemmer.map((r) => r.user_id))];
  const foersteStart = medlemmer.reduce<string | null>((min, r) => (min == null || r.created_at < min ? r.created_at : min), null);
  const logins: KohorteLogin[] =
    brugerIds.length === 0 || !foersteStart
      ? []
      : await hentAlleSider<KohorteLogin>((fra, til) =>
          supabase
            .from("user_login_log")
            .select("user_id, logged_in_at")
            .in("user_id", brugerIds)
            .gte("logged_in_at", foersteStart)
            .order("logged_in_at", { ascending: true })
            .order("id")
            .range(fra, til)
            .then(side<KohorteLogin>("user_login_log")),
        );

  return { virksomheder, medlemmer, logins };
}
