/**
 * De private links til /webinar — rådgiverens I/O (udkast 21/9-2026).
 * Hook = I/O, lib = dom: listen udledes af src/lib/webinar/deling.ts
 * (delingsOversigt) — «sidst set» og «antal visninger» er sporets tal.
 *
 * LÆSNINGEN går gennem RLS (rådgivere har SELECT på webinar_delinger og
 * webinar_deling_spor). SKRIVNINGERNE går ALLE gennem edge-funktionen
 * webinar-deling (Bucket A): opret · forlaeng · luk — så en deling aldrig
 * findes uden spor, og tokenet aldrig dannes i browseren. Tokenet står KUN i
 * svaret fra «opret»; hooken gemmer det ikke.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { HentningsFejl, kraevRaekker } from "@/lib/kraevRaekker";
import { delingsOversigt, type DelingsLinje, type DelingsRaekke, type SporRaekke } from "@/lib/webinar/deling";

/* eslint-disable @typescript-eslint/no-explicit-any */
const tabel = (navn: string) => supabase.from(navn as any) as any;

export const WEBINAR_DELINGER_KEY = ["webinar", "delinger"] as const;

export async function hentDelinger(nu: Date): Promise<DelingsLinje[]> {
  const dRes = await tabel("webinar_delinger").select("id, navn, oprettet_at, udloeber_at, lukket_at").order("oprettet_at", { ascending: false }).limit(500);
  const delinger = kraevRaekker(dRes, "webinar_delinger") as DelingsRaekke[];
  const sRes = await tabel("webinar_deling_spor").select("deling_id, tidspunkt, haendelse").eq("haendelse", "vist").limit(5000);
  if (sRes.error) throw new HentningsFejl("webinar_deling_spor", sRes.error.message || "ukendt fejl");
  return delingsOversigt(delinger, (sRes.data ?? []) as SporRaekke[], nu);
}

/** Rådgivere alene — RLS ville ellers give tomme lister. */
export function useWebinarDelinger(nu: Date = new Date()) {
  const { user, isAdvisor } = useAuth();
  return useQuery({
    queryKey: WEBINAR_DELINGER_KEY,
    enabled: !!user && isAdvisor === true,
    staleTime: 60 * 1000,
    queryFn: () => hentDelinger(nu),
  });
}

export interface OprettetLink {
  id: string;
  navn: string;
  token: string;
  url: string;
  udloeber_at: string;
}

type Handling = { handling: "opret"; navn: string; dage: number } | { handling: "forlaeng"; id: string; dage: number } | { handling: "luk"; id: string };

async function kald(body: Handling): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("webinar-deling", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let grund = error.message;
    try {
      const t = await ctx?.text();
      const b = t ? (JSON.parse(t) as { error?: string }) : null;
      if (b?.error) grund = b.error;
    } catch { /* råt fejlsvar */ }
    throw new Error(grund);
  }
  return (data as Record<string, unknown>) ?? {};
}

export function useWebinarDelingHandling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Handling) => kald(body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: WEBINAR_DELINGER_KEY }),
  });
}
