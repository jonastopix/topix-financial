/**
 * src/hooks/dagensSessioner.ts
 *
 * Hentningen bag «Sessioner i dag» (forsidens højre spalte, gruppen «I dag»,
 * 17/9). Den rene dom bor i src/lib/hjemmebane/dagensSessioner.ts. Mønstret
 * er hooks/kohorte.ts og hooks/ubesvaredeOpslag.ts: én react-query-nøgle,
 * egen hentning adskilt fra forsidens datalag, så en fejl her ikke vælter
 * dommen; alt gennem kraevRaekker (fejl → HentningsFejl med kildens navn —
 * aldrig «Ingen sessioner i dag» ved en fejl).
 *
 * TO KILDER, rådgiverens egen RLS — ingen SQL-ændring:
 *   session_bookings (id, company_id, advisor, status, start_tid, slut_tid)
 *     — «Advisors read all session bookings» (20260908190000, kørt 11/9).
 *   companies (id, name) for netop de bookede virksomheder — «Advisors can
 *     view all companies».
 * Vinduet er ét døgn før til to døgn efter nu (UTC), så dagens DANSKE dato
 * altid er dækket; dommen skærer til dagen. Kun status 'booked' hentes —
 * en betalt men ubooket session har ingen tid.
 */
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import {
  SESSIONER_VINDUE_EFTER_MS,
  SESSIONER_VINDUE_FOER_MS,
  type DagensSessionerInput,
  type SessionBooking,
  type SessionVirksomhed,
} from "@/lib/hjemmebane/dagensSessioner";

export const DAGENS_SESSIONER_KEY = ["forside", "dagens-sessioner"] as const;

export async function hentDagensSessioner(nu: Date = new Date()): Promise<Omit<DagensSessionerInput, "nu">> {
  const fra = new Date(nu.getTime() - SESSIONER_VINDUE_FOER_MS).toISOString();
  const til = new Date(nu.getTime() + SESSIONER_VINDUE_EFTER_MS).toISOString();
  const bookingRes = await supabase
    .from("session_bookings")
    .select("id, company_id, advisor, status, start_tid, slut_tid")
    .eq("status", "booked")
    .gte("start_tid", fra)
    .lte("start_tid", til)
    .order("start_tid", { ascending: true });
  const bookinger = kraevRaekker(bookingRes, "session_bookings") as SessionBooking[];

  const companyIds = [...new Set(bookinger.map((b) => b.company_id).filter((id): id is string => !!id))];
  const virksomheder: SessionVirksomhed[] =
    companyIds.length === 0
      ? []
      : (kraevRaekker(
          await supabase.from("companies").select("id, name").in("id", companyIds),
          "companies",
        ) as SessionVirksomhed[]);

  return { bookinger, virksomheder };
}
