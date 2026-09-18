/**
 * samtaleTider — IO'et bag samtalen i kalenderen (udkast 18/9-2026, rev. 2):
 * ledige tider fra Calendly (den ene sandhed) filtreret af platformens dom
 * (samtaleSlots), og bookingen skrevet TIL Calendly (calendlyApi), så Jonas'
 * Google-kalender og Meet-linket følger med af sig selv — som i dag.
 *
 * FAIL-CLOSED: kan Calendly ikke læses, kastes der (503 i kalderen) — hellere
 * «ingen ledige tider lige nu» end et slot der ikke findes. Skrivningen: Calendly
 * FØRST (den kan afvise), platformen bagefter; fejler platformen, aflyses
 * Calendly-bookingen igen (kompensation) — se ansoegning-samtale.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { afklaringEventType, aflysBooking, hentLedigeTider, hentMoedeLink, opretBooking } from "./calendlyApi.ts";
import { filtrerSamtaleSlots, SAMTALE_VARIGHED_MIN, type SlotFilterInput, vinduerForCalendly } from "./samtaleSlots.ts";
import { virksomhedsnavnAf, type AnsoegningRaekke } from "./ansoegningMotor.ts";

export interface LedigeTider {
  input: SlotFilterInput;
  slots: string[];
  varighedMin: number;
}

/** Calendlys slots i 7-dages vinduer (parallelt) + platformens egne bookede starter → dommen. */
export async function hentLedigeSamtaletider(admin: SupabaseClient, args: { nu: Date; udenAnsoegningId?: string | null }): Promise<LedigeTider> {
  const eventType = afklaringEventType();
  const fra = new Date(args.nu.getTime() - 24 * 3_600_000).toISOString();
  const [vinduer, booket] = await Promise.all([
    Promise.all(vinduerForCalendly(args.nu).map((v) => hentLedigeTider(eventType, v.fra, v.til))),
    admin.from("ansoegninger").select("id, samtale_start").eq("trin", "booket").gte("samtale_start", fra),
  ]);
  if (booket.error) throw new Error(`ansoegninger: ${booket.error.message}`);
  const platformBooket = ((booket.data ?? []) as Array<{ id: string; samtale_start: string | null }>)
    .filter((r) => r.id !== args.udenAnsoegningId && typeof r.samtale_start === "string")
    .map((r) => r.samtale_start as string);
  const input: SlotFilterInput = { calendly: vinduer.flat(), platformBooket, nu: args.nu };
  return { input, slots: filtrerSamtaleSlots(input), varighedMin: SAMTALE_VARIGHED_MIN };
}

export interface KalenderBooking {
  eventUri: string;
  moedeLink: string | null;
}

/** Bookingen oprettes i Calendly på Jonas' eventtype; Meet-linket læses fra det oprettede event (fail-soft: null hvis det ikke kan læses). */
export async function bookIKalenderen(a: AnsoegningRaekke, start: string): Promise<KalenderBooking> {
  const ny = await opretBooking({ eventType: afklaringEventType(), start, email: a.email ?? "", navn: a.navn ?? "", virksomhed: virksomhedsnavnAf(a), ansoegningId: a.id });
  let moedeLink: string | null = null;
  try {
    moedeLink = await hentMoedeLink(ny.eventUri);
  } catch (err) {
    console.error(`[samtaleTider] mødelinket kunne ikke læses for ${ny.eventUri} — sendes uden:`, err);
  }
  return { eventUri: ny.eventUri, moedeLink };
}

/** Aflyser i Calendly. true = aflyst; false = kunne ikke (logget) — kalderen afgør om det er et stop. */
export async function aflysIKalenderen(eventUri: string | null, grund: string): Promise<boolean> {
  if (!eventUri) return false;
  try {
    await aflysBooking(eventUri, grund);
    return true;
  } catch (err) {
    console.error(`[samtaleTider] Calendly-aflysning af ${eventUri} fejlede:`, err);
    return false;
  }
}
