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

async function kald<T>(fn: "ansoegning-gem" | "ansoegning-cvr" | "ansoegning-link" | "ansoegning-samtale", body: Record<string, unknown>): Promise<T> {
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
  /** Samtalen i kalenderen (udkast 18/9): sluttid og Meet-linket fra Calendly-eventet — kun når booket. Der er intet booking_url længere: tiden vælges på siden. */
  samtale_slut: string | null;
  moede_link: string | null;
  aftale_url: string | null;
  /** E-underskriften på ansøgningen (brist 8, 18/9): url + tilstand fra aftale_underskrift; null = ingen aftale sendt den vej (så gælder aftale_url). */
  underskrift?: { url: string; tilstand: "kan_underskrives" | "underskrevet" | "udloebet" | "annulleret" | "ugyldig"; udloeber_at: string | null; underskrevet_at: string | null } | null;
  /** Ventelisten (19/9): kun for lukkede — antal køer de står i, og et tilbud ude med frist. Aldrig virksomhedens navn. null = ingen/ikke lukket. */
  ventepladser?: { venter: number; tilbud: { udloeber_at: string | null } | null } | null;
  virksomhedsnavn: string;
  fornavn: string | null;
}

/** Samtalen (ansoegning-samtale, samme token): de ledige tider og de tre handlinger. Serveren regner slottet igen; 409 = «tiden er ikke ledig længere». */
export interface TiderSvar {
  ok: true;
  slots: string[];
  varighed_min: number;
  samtale_start: string | null;
  samtale_slut: string | null;
  moede_link: string | null;
}
export interface SamtaleSvar {
  ok: true;
  trin: string;
  samtale_start: string | null;
  samtale_slut: string | null;
  moede_link: string | null;
  varighed_min: number;
}
export function hentTider(token: string): Promise<TiderSvar> {
  return kald<TiderSvar>("ansoegning-samtale", { token, handling: "tider" });
}
export function bookSamtale(token: string, start: string): Promise<SamtaleSvar> {
  return kald<SamtaleSvar>("ansoegning-samtale", { token, handling: "book", start });
}
export function flytSamtale(token: string, start: string): Promise<SamtaleSvar> {
  return kald<SamtaleSvar>("ansoegning-samtale", { token, handling: "flyt", start });
}
export function aflysSamtale(token: string): Promise<SamtaleSvar> {
  return kald<SamtaleSvar>("ansoegning-samtale", { token, handling: "aflys" });
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
/** Ventelisten (rettelse 19/9): ja/nej til en tilbudt plads — serverens tag_pladsen/afslaa_pladsen (svarPaaPlads). 409 = intet tilbud ude. */
export function svarPaaPladsen(token: string, svar: "ja" | "nej"): Promise<StatusSvar & { ok: true; svar: "ja" | "nej"; genaabnet: boolean }> {
  return kaldLink({ token, handling: svar === "ja" ? "tag_pladsen" : "afslaa_pladsen" });
}

/** Kvitteringens vej (18/9): «sendt» straks, «reserve» = køen tager den ved næste kørsel i vinduet. */
export type KvitteringsUdfald = "sendt" | "reserve" | "ingen_adresse" | "allerede";
export function indsendAnsoegning(token: string, svar: Partial<AnsoegningsSvar>): Promise<{ ok: true; indsendt: true; kvittering?: KvitteringsUdfald }> {
  return kald("ansoegning-gem", { handling: "indsend", token, svar });
}

export type CvrSvarTilFlade =
  | { udfald: "fundet"; visning: CvrVisning; saetning: string }
  | { udfald: "findes_ikke" }
  | { udfald: "utilgaengelig" };
export function slaaCvrOp(token: string, cvr: string): Promise<CvrSvarTilFlade> {
  return kald<CvrSvarTilFlade>("ansoegning-cvr", { token, cvr });
}
