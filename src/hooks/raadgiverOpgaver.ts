/**
 * src/hooks/raadgiverOpgaver.ts
 *
 * Hentning og DEN ENE skrivevej til raadgiver_opgaver (som fornyelsens
 * skrivFornyelsesbeslutning, #709, og lukningens lukOpgave, #744): hver
 * skrivning har husets to tjek — error OG antal berørte rækker (en
 * advisor-write der rammer nul rækker tavst er den kendte RLS-fælde) — og
 * ingen optimistisk patch: sandheden hentes igen af invaliderOpgaver, som
 * kalderen awaiter.
 *
 * Tabellen (migration 20260908170000) står ikke i de genererede typer
 * endnu (Lovable regenererer) — derfor `as any`, som andre nye tabeller.
 * Dommen (rækkefølge, forfalden, gammel) bor i src/lib/raadgiverOpgaver.ts.
 */

import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import type { RaadgiverOpgave } from "@/lib/raadgiverOpgaver";

export const RAADGIVER_OPGAVER_KEY = ["raadgiver-opgaver"] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
const tabel = () => supabase.from("raadgiver_opgaver" as any) as any;

/** Alle punkter — åbne og gjorte; dommen deler dem (lib/raadgiverOpgaver.delListe). */
export async function hentRaadgiverOpgaver(): Promise<RaadgiverOpgave[]> {
  const res = await tabel()
    .select("id, tekst, ejer_id, oprettet_af, company_id, frist, status, gjort_at, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  return kraevRaekker(res, "raadgiver_opgaver") as RaadgiverOpgave[];
}

export interface NytPunkt {
  tekst: string;
  ejerId: string;
  oprettetAf: string;
  companyId: string | null;
  /** «YYYY-MM-DD» eller null. */
  frist: string | null;
}

export async function opretOpgave(input: NytPunkt): Promise<void> {
  const tekst = input.tekst.trim();
  if (!tekst) throw new Error("Skriv hvad der skal gøres.");
  const { data, error } = await tabel()
    .insert({
      tekst,
      ejer_id: input.ejerId,
      oprettet_af: input.oprettetAf,
      company_id: input.companyId,
      frist: input.frist,
      status: "aaben",
    })
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Skrivningen ramte nul rækker — punktet er IKKE gemt (RLS).");
}

/** Ret tekst, frist, virksomhed eller ejer («giv den til Morten»). */
export async function retOpgave(
  id: string,
  felter: Partial<{ tekst: string; frist: string | null; company_id: string | null; ejer_id: string }>,
): Promise<void> {
  const patch: Record<string, unknown> = { ...felter };
  if (typeof patch.tekst === "string") {
    patch.tekst = (patch.tekst as string).trim();
    if (!patch.tekst) throw new Error("Punktet kan ikke være tomt.");
  }
  const { data, error } = await tabel().update(patch).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Skrivningen ramte nul rækker — rettelsen er IKKE gemt (RLS).");
}

/** Gjort / fortryd gjort. Status og gjort_at følges ad (CHECK i tabellen). */
export async function saetGjort(id: string, gjort: boolean): Promise<void> {
  const { data, error } = await tabel()
    .update(gjort ? { status: "gjort", gjort_at: new Date().toISOString() } : { status: "aaben", gjort_at: null })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Skrivningen ramte nul rækker — punktet er IKKE ændret (RLS).");
}

export async function sletOpgave(id: string): Promise<void> {
  const { data, error } = await tabel().delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Sletningen ramte nul rækker — punktet står stadig (RLS).");
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Listen selv og forsidens linje under stregen læser begge tabellen. */
export async function invaliderOpgaver(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: [...RAADGIVER_OPGAVER_KEY] });
}
