/**
 * src/lib/ansoegning/api.ts
 *
 * Fladens kald til ansoegning-gem og ansoegning-cvr. Begge er verify_jwt =
 * false, og supabase.functions.invoke sender anon-nøglen — tokenet i body
 * er legitimationen. Fejl fra funktionen (400 med feltfejl, 404 lukket,
 * 429 for mange) læses ud af FunctionsHttpError's context, så fladen kan
 * vise dem ved feltet frem for en generisk toast.
 */
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AnsoegningsSvar, CvrVisning, FeltId, Fremdrift, Kilde } from "./skema";

export class AnsoegningsFejl extends Error {
  status: number;
  fejl: Partial<Record<FeltId, string>>;
  constructor(status: number, besked: string, fejl: Partial<Record<FeltId, string>> = {}) {
    super(besked);
    this.status = status;
    this.fejl = fejl;
  }
}

async function kald<T>(fn: "ansoegning-gem" | "ansoegning-cvr", body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const ctx = error.context as Response;
      const j = await ctx.json().catch(() => ({}));
      throw new AnsoegningsFejl(ctx.status, typeof j?.error === "string" ? j.error : "Noget gik galt", j?.fejl ?? {});
    }
    throw new AnsoegningsFejl(0, "Ingen forbindelse — prøv igen.");
  }
  return data as T;
}

export interface OpretSvar {
  token: string;
  fremdrift: Fremdrift;
}
/** `firma` er honningfeltet — tomt for et menneske. Serveren svarer som om alt gik godt, når det er udfyldt. */
export function opretAnsoegning(args: { kilde: Kilde; kilde_raa: string | null; svar: Partial<AnsoegningsSvar>; firma: string }): Promise<OpretSvar> {
  return kald<OpretSvar>("ansoegning-gem", { handling: "opret", ...args });
}

export interface HentSvar {
  svar: AnsoegningsSvar;
  cvr_opslag: (CvrVisning & { cvr: string }) | null;
  cvr_bekraeftet: boolean;
  fremdrift: Fremdrift;
}
export function hentAnsoegning(token: string): Promise<HentSvar> {
  return kald<HentSvar>("ansoegning-gem", { handling: "hent", token });
}

export function gemSvar(
  token: string,
  svar: Partial<AnsoegningsSvar>,
  cvrBekraeftet = false,
  /** Fallback (18/9): virksomhedsnavnet tastet af ansøgeren, når CVR ikke kunne slås op. */
  virksomhedsnavn?: string,
): Promise<{ ok: true; fremdrift: Fremdrift }> {
  return kald("ansoegning-gem", { handling: "gem", token, svar, cvr_bekraeftet: cvrBekraeftet, ...(virksomhedsnavn ? { virksomhedsnavn } : {}) });
}

// ── Efter indsendelse: ansøgerens statusside (/ansoeg/status) → ansoegning-link (A's function) ──

export interface StatusSvar {
  trin: string;
  paa_pause_til: string | null;
  samtale_start: string | null;
  booking_url: string | null;
  aftale_url: string | null;
  virksomhedsnavn: string;
  fornavn: string | null;
}
async function kaldLink<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ansoegning-link", { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const ctx = error.context as Response;
      const j = await ctx.json().catch(() => ({}));
      throw new AnsoegningsFejl(ctx.status, typeof j?.error === "string" ? j.error : "Noget gik galt");
    }
    throw new AnsoegningsFejl(0, "Ingen forbindelse — prøv igen.");
  }
  return data as T;
}
export function hentStatus(token: string): Promise<StatusSvar> {
  return kaldLink<StatusSvar>({ token, handling: "hent" });
}
export function sigIkkeNu(token: string): Promise<StatusSvar & { ok: true; allerede: boolean }> {
  return kaldLink({ token, handling: "ikke_nu" });
}

export function indsendAnsoegning(token: string, svar: Partial<AnsoegningsSvar>): Promise<{ ok: true; indsendt: true }> {
  return kald("ansoegning-gem", { handling: "indsend", token, svar });
}

export type CvrSvarTilFlade =
  | { udfald: "fundet"; visning: CvrVisning; saetning: string }
  | { udfald: "findes_ikke" }
  | { udfald: "utilgaengelig" };
export function slaaCvrOp(token: string, cvr: string): Promise<CvrSvarTilFlade> {
  return kald<CvrSvarTilFlade>("ansoegning-cvr", { token, cvr });
}
