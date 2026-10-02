/**
 * src/hooks/svartid.ts
 *
 * Hentningen bag «Svartids-uret» på rådgiverens forside (30/9-2026). Den rene
 * dom — ventetider, tal, trend, streak — bor i src/lib/svartid.ts. Mønstret
 * er hooks/kohorte.ts og hooks/ubesvaredeOpslag.ts: én react-query-nøgle,
 * egen hentning adskilt fra forsidens datalag, så en fejl her ikke vælter
 * dommen.
 *
 * FIRE KILDER, ÉN NØGLE, alle med rådgiverens EGEN klient og RLS — ingen
 * service role, ingen migration. Policies læst i migrationerne 30/9 (IKKE
 * målt i pg_policy):
 *   messages       (id, conversation_id, sender_id, created_at, message_type)
 *                  — «Advisors can view all messages» (20260223152943:80,
 *                  has_role(…,'advisor'); admin arver). Ingen senere
 *                  DROP POLICY af den.
 *   conversations  (id, company_id, awaiting_reply_from)
 *                  — «Advisors can view all conversations» (20260223152943:60)
 *   companies      (id, name, is_demo) — «Advisors can view all companies»
 *                  (20260224222456:47)
 *   get_all_advisor_profiles() — rådgiver-id'erne. user_roles kan IKKE læses
 *                  bredt af en rådgiver; RPC'en er SECURITY DEFINER over
 *                  user_roles.role IN ('advisor','admin') (20260314211810) —
 *                  samme rolleliste som triggeren. OBS: den joiner profiles,
 *                  så en rådgiver uden profilrække ville tælle som medlem.
 *
 * AFGRÆNSNING: kun beskeder med message_type = 'user' fra de sidste
 * HENT_DAGE (30 + 7 døgns forløb, se lib/svartid) og kun de kolonner, dommen
 * bruger. SIDE FOR SIDE uden tavst loft: PostgREST klipper stille ved 1.000
 * rækker, så beskeder, samtaler og virksomheder hentes med husets
 * hentAlleSider og stabil orden (id som sidste nøgle) — hver side gennem
 * kraevRaekker, så en fejl på side 2 kaster med kildens navn. Ingen N+1:
 * fire kæder i parallel, uanset antallet af samtaler.
 */
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { hentAlleSider } from "@/lib/budgetEngine";
import { HENT_DAGE, type SvartidBesked, type SvartidInput, type SvartidSamtale, type SvartidVirksomhed } from "@/lib/svartid";

export const SVARTID_KEY = ["forside", "svartids-uret"] as const;

/** Én side gennem kraevRaekker: fejl → HentningsFejl(kilde), aldrig en tom side. */
const side =
  <T,>(kilde: string) =>
  (res: { data: T[] | null; error: { message: string } | null }) => ({ data: kraevRaekker(res, kilde), error: null });

export async function hentSvartid(nu: Date = new Date()): Promise<Omit<SvartidInput, "nu">> {
  const siden = new Date(nu.getTime() - HENT_DAGE * 24 * 60 * 60 * 1000).toISOString();

  const [beskeder, samtaler, virksomheder, raadgivereRes] = await Promise.all([
    hentAlleSider<SvartidBesked>((fra, til) =>
      supabase
        .from("messages")
        .select("id, conversation_id, sender_id, created_at, message_type")
        .eq("message_type", "user")
        .gte("created_at", siden)
        .order("created_at", { ascending: true })
        .order("id")
        .range(fra, til)
        .then(side<SvartidBesked>("messages")),
    ),
    hentAlleSider<SvartidSamtale>((fra, til) =>
      supabase
        .from("conversations")
        .select("id, company_id, awaiting_reply_from")
        .order("id")
        .range(fra, til)
        .then(side<SvartidSamtale>("conversations")),
    ),
    hentAlleSider<SvartidVirksomhed>((fra, til) =>
      supabase
        .from("companies")
        .select("id, name, is_demo")
        .order("id")
        .range(fra, til)
        .then(side<SvartidVirksomhed>("companies")),
    ),
    supabase.rpc("get_all_advisor_profiles"),
  ]);
  const raadgiverIds = (kraevRaekker(raadgivereRes, "get_all_advisor_profiles") as { user_id: string }[])
    .map((r) => r.user_id)
    .filter(Boolean);

  return { beskeder, samtaler, virksomheder, raadgiverIds };
}
