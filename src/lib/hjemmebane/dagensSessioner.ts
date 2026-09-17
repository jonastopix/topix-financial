/**
 * src/lib/hjemmebane/dagensSessioner.ts
 *
 * «Sessioner i dag» i forsidens højre spalte, gruppen «I dag» (Jonas 17/9
 * «AA», valg 1 — analyse-raadgivernes-forside.md §2b og §6 forslag 2: fem
 * minutter før en session svarer forsiden ikke på «hvem har jeg i dag»).
 * Ren dom, ingen React, ingen Supabase — testet i
 * __tests__/dagensSessioner.test.ts; hentningen bor i src/hooks/dagensSessioner.ts.
 *
 * DOMMEN: en booking er «i dag» når dens start_tid falder på DAGENS DANSKE
 * dato (dagsNoegleKbh — samme nøgle som kohorten, aldrig browserens lokale
 * dag alene) og status er 'booked' (session_bookings.status: pending | paid |
 * booking_sent | booked | cancelled | refunded — kun 'booked' er en aftale
 * med en tid; lib/introSession.ts). Rækkefølgen er starttiden. Hver linje:
 * «10:00 Floren Engros · Morten» — klokkeslættet i dansk tid, virksomheden
 * (linket går til /virksomhed/{id}), rådgiveren (session_bookings.advisor:
 * 'jonas' | 'morten'). Uden virksomhedsnavn (rækken peger på en virksomhed
 * rådgiveren ikke ser): «Ukendt virksomhed» — aldrig en tavs udeladelse.
 */

import { TZ } from "@/lib/maanedsnoegle";
import { dagsNoegleKbh } from "@/lib/hjemmebane/kohorte";

export const SESSIONER_OVERSKRIFT = "Sessioner i dag";
export const INGEN_SESSIONER_TEKST = "Ingen sessioner i dag.";
export const UKENDT_VIRKSOMHED = "Ukendt virksomhed";

export interface SessionBooking {
  id: string;
  company_id: string | null;
  advisor: string | null;
  status: string;
  start_tid: string | null;
  slut_tid: string | null;
}

export interface SessionVirksomhed {
  id: string;
  name: string;
}

export interface DagensSessionerInput {
  bookinger: readonly SessionBooking[];
  virksomheder: readonly SessionVirksomhed[];
  nu: Date;
}

export interface DagensSession {
  id: string;
  companyId: string | null;
  navn: string;
  /** «10:00» i dansk tid. */
  klokken: string;
  /** «Morten» / «Jonas» — null når advisor er tom eller ukendt. */
  raadgiver: string | null;
  startMs: number;
}

/** «10:00» for et tidspunkt set fra Danmark. sv-SE som dagsNoegleKbh: den
    giver «HH:MM» med kolon i alle runtimes — da-DK giver «09.05» i Node's
    ICU og «09:05» i browseren, og linjen skal se ens ud begge steder. */
export function klokkenKbh(t: Date): string {
  return t.toLocaleTimeString("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

const RAADGIVER_NAVN: Record<string, string> = { jonas: "Jonas", morten: "Morten" };

export function dagensSessioner(input: DagensSessionerInput): DagensSession[] {
  const idag = dagsNoegleKbh(input.nu);
  const navne = new Map(input.virksomheder.map((v) => [v.id, v.name]));
  const ud: DagensSession[] = [];
  for (const b of input.bookinger) {
    if (b.status !== "booked" || !b.start_tid) continue;
    const start = new Date(b.start_tid);
    if (Number.isNaN(start.getTime())) continue;
    if (dagsNoegleKbh(start) !== idag) continue;
    const raadgiver = b.advisor ? (RAADGIVER_NAVN[b.advisor.toLowerCase()] ?? null) : null;
    ud.push({
      id: b.id,
      companyId: b.company_id,
      navn: (b.company_id && navne.get(b.company_id)) || UKENDT_VIRKSOMHED,
      klokken: klokkenKbh(start),
      raadgiver,
      startMs: start.getTime(),
    });
  }
  return ud.sort((a, b) => a.startMs - b.startMs || a.navn.localeCompare(b.navn, "da"));
}

/** «10:00 Floren Engros · Morten» — teksten uden link (linket er fladens). */
export function sessionLinjeTekst(s: Pick<DagensSession, "klokken" | "navn" | "raadgiver">): string {
  return `${s.klokken} ${s.navn}${s.raadgiver ? ` · ${s.raadgiver}` : ""}`;
}

/** Hentningens vindue: ét døgn før og to efter «nu» i UTC — så dagens danske
    dato altid er dækket uanset sommertid; dommen skærer til dagen. */
export const SESSIONER_VINDUE_FOER_MS = 24 * 60 * 60 * 1000;
export const SESSIONER_VINDUE_EFTER_MS = 2 * 24 * 60 * 60 * 1000;
