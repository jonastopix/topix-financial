/**
 * webinarRum/api — fladens kald til webinar-tilmeld, webinar-rum og
 * webinar-puls (skive 2, 30/9-2026).
 *
 * Alle tre er verify_jwt = false; supabase.functions.invoke sender
 * anon-nøglen, og tokenet i kroppen er legitimationen. Hvert kald måler sin
 * rundtur (sendt/modtaget på klientens ur), så urForskydning kan vælge den
 * måling med den mindste rundtur (spec §A5).
 *
 * CTA-klikket sendes med fetch({ keepalive: true }) FØR ansøgningen åbnes
 * (spec §A6: «sendBeacon før navigation»). sendBeacon kan ikke bære headers,
 * og Supabases gateway vil have anon-nøglen — keepalive kan begge dele og
 * overlever, at siden forlades.
 */
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { CtaVindue, Interaktion } from "@/lib/webinarMotor/interaktioner";
import type { PulsRaa } from "@/lib/webinarMotor/puls";
import type { Rum, SenIndgang, UrMaaling } from "@/lib/webinarMotor/ur";
import type { RumTider } from "./fase";

export class WebinarFejl extends Error {
  status: number;
  kode: string;
  constructor(status: number, kode: string) {
    super(kode);
    this.status = status;
    this.kode = kode;
  }
}

async function kald<T>(fn: "webinar-tilmeld" | "webinar-rum" | "webinar-puls", body: Record<string, unknown>): Promise<{ data: T; maaling: UrMaaling | null }> {
  const sendtMs = Date.now();
  const { data, error } = await supabase.functions.invoke(fn, { body });
  const modtagetMs = Date.now();
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const ctx = error.context as Response;
      const j = await ctx.json().catch(() => ({}));
      throw new WebinarFejl(ctx.status, typeof j?.fejl === "string" ? j.fejl : "ukendt");
    }
    throw new WebinarFejl(0, "net");
  }
  const serverMs = typeof (data as { server_nu_ms?: unknown })?.server_nu_ms === "number" ? (data as { server_nu_ms: number }).server_nu_ms : null;
  return { data: data as T, maaling: serverMs === null ? null : { sendtMs, modtagetMs, serverMs } };
}

// ── webinar-tilmeld ──────────────────────────────────────────────────────────

export interface SessionerSvar {
  motor: string;
  webinar: { slug: string; titel: string; beskrivelse: string | null; vaert_navn: string | null; vaert_billede: string | null; varighed_sek: number; intro_sek?: number };
  sessioner: Array<{ id: string; starter_at: string; type: string }>;
}

export async function hentSessioner(slug: string): Promise<SessionerSvar> {
  return (await kald<SessionerSvar>("webinar-tilmeld", { handling: "sessioner", slug })).data;
}

export interface TilmeldSvar {
  ok: true;
  dublet: "ny" | "samme" | "flyttet";
  session?: { id: string; starter_at: string };
  token: string | null;
  rum_sti?: string;
}

export async function tilmeld(body: Record<string, unknown>): Promise<TilmeldSvar> {
  return (await kald<TilmeldSvar>("webinar-tilmeld", { handling: "tilmeld", ...body })).data;
}

// ── webinar-rum ──────────────────────────────────────────────────────────────

export type SeerInteraktion = Interaktion & { cta_vindue?: CtaVindue };

export interface TilstandSvar {
  motor: string;
  server_nu_ms: number;
  rum: Rum;
  forventet_pos_sek: number;
  intro_pos_sek: number;
  sek_til_start: number;
  sek_til_slut: number;
  tider: RumTider;
  webinar: { slug: string; titel: string; vaert_navn: string | null; vaert_billede: string | null; varighed_sek: number; intro_sek: number };
  embed: { url: string; udloeber: number } | null;
  embed_status: string;
  sen_indgang: SenIndgang | null;
  naeste_session: { id: string; starter_at: string } | null;
  tidslinje: SeerInteraktion[];
  egne_svar: Record<string, unknown>;
  hilsen: { fornavn: string | null };
  kapitler: Array<{ id: string; fraSek: number; titel: string }>;
  tidslinje_version: number | null;
  set_procent: number;
}

export async function hentTilstand(t: string): Promise<{ data: TilstandSvar; maaling: UrMaaling | null }> {
  return kald<TilstandSvar>("webinar-rum", { t, handling: "tilstand" });
}

export interface GenTilmeldSvar {
  ok: true;
  dublet: "ny" | "samme" | "flyt";
  session: { id: string; starter_at: string };
  token: string;
  rum_sti: string;
}

export async function genTilmeld(t: string): Promise<GenTilmeldSvar> {
  return (await kald<GenTilmeldSvar>("webinar-rum", { t, handling: "gen_tilmeld" })).data;
}

export async function forudfyld(t: string): Promise<{ navn: string; email: string }> {
  const { data } = await kald<{ forudfyld: { navn: string; email: string } }>("webinar-rum", { t, handling: "forudfyld" });
  return data.forudfyld;
}

// ── webinar-puls ─────────────────────────────────────────────────────────────

export interface HandlingUd {
  klient_id: string;
  art: "svar" | "spoergsmaal" | "reaktion";
  interaktion_id?: string;
  svar?: Record<string, unknown>;
  tekst?: string;
  emoji?: string;
}

export interface PulsSvar {
  motor: string;
  server_nu_ms: number;
  rum: Rum;
  forventet_pos_sek: number;
  sek_til_start: number;
  set_procent: number | null;
  pulser: { modtaget: number; skrevet: number; dubletter: number; ignoreret: Record<string, number> };
  handlinger: Array<{ klient_id: string; udfald: string }>;
  svar: Array<{ spoergsmaal_id: string; spoergsmaal: string; svar: string; svaret_at: string | null }>;
  i_rummet: number | null;
  tidslinje_version: number | null;
}

export async function sendPuls(t: string, puls: PulsRaa[], handlinger: HandlingUd[]): Promise<{ data: PulsSvar; maaling: UrMaaling | null }> {
  return kald<PulsSvar>("webinar-puls", { t, puls, handlinger });
}

/**
 * Et kald, der skal overleve, at fanen skifter eller lukkes: CTA-klikket og
 * den sidste puls ved «pagehide». Fejler det, går seeren alligevel videre — et
 * tabt klik er et hul i tragten, ikke en stoppet ansøgning.
 */
export function sendFoerNavigation(t: string, krop: { puls?: PulsRaa[]; handlinger?: HandlingUd[] }): void {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const noegle = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !noegle) return;
  try {
    void fetch(`${url.replace(/\/+$/, "")}/functions/v1/webinar-puls`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", apikey: noegle, Authorization: `Bearer ${noegle}` },
      body: JSON.stringify({ t, ...krop }),
    }).catch(() => undefined);
  } catch {
    // keepalive findes ikke i en meget gammel browser — klikket er tabt, knappen virker.
  }
}

/** Klient-id til en handling: [A-Za-z0-9_-]{8,64} (serverens idempotensnøgle). */
export function nytKlientId(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

