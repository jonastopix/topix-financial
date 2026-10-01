/**
 * src/lib/hjemmebane/vaerterApi.ts — datalaget for event_vaerter (PR 4b).
 * Tabellen er ikke i de genererede Supabase-typer før Lovable regenererer
 * (migration 20260918130000 køres i hånden) — derfor `as any`, samme mønster
 * som member_profiles/get_member_directory havde (memberProfile.ts, filhovedet).
 * Læsning KASTER (kraevRaekker — fejl er ikke tom). Skrivning (rettet 1/10,
 * værtsfejlen): planen er den rene vaertPlan (lib/hjemmebane/vaerter) —
 * eksisterende rådgiver-værter BEHOLDES (kun raekkefoelge opdateres), nye
 * rådgivere og gæster indsættes, og de gamle, der ikke er med, slettes TIL
 * SIDST, så en fejl aldrig efterlader eventet uden værter (ingen transaktion
 * fra klienten; en RPC kan komme senere). Rækkefølgen: indsæt → opdatér → slet.
 */
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { buildAssetPath, uploadAsset } from "./adminContentApi";
import { vaertPlan, type VaertRaekke, type VaertUdkast } from "./vaerter";

const KOLONNER = "id, event_id, user_id, gaest_navn, gaest_titel, gaest_foto_path, raekkefoelge";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabel = () => (supabase.from("event_vaerter" as any) as any);

/** Værterne for et sæt events (forsidens «Kommende», eventsiden, admin). Tom liste → ingen kald. */
export async function listVaerterForEvents(eventIds: readonly string[]): Promise<VaertRaekke[]> {
  if (eventIds.length === 0) return [];
  return kraevRaekker(
    await tabel().select(KOLONNER).in("event_id", [...eventIds]).order("raekkefoelge", { ascending: true }),
    "event_vaerter",
  ) as VaertRaekke[];
}

/** Gem hele værtslisten for ét event i den givne rækkefølge — efter vaertPlan:
    indsæt de nye, opdatér pladsen på de beholdte rådgivere, slet de gamle til sidst. */
export async function saveVaerter(eventId: string, udkast: readonly VaertUdkast[]): Promise<void> {
  const gamle = kraevRaekker(
    await tabel().select("id, user_id, raekkefoelge").eq("event_id", eventId),
    "event_vaerter",
  ) as Pick<VaertRaekke, "id" | "user_id" | "raekkefoelge">[];
  const plan = vaertPlan(gamle, udkast);
  if (plan.indsaet.length > 0) {
    const { error } = await tabel().insert(plan.indsaet.map((r) => ({ event_id: eventId, ...r })));
    if (error) throw new Error(error.message);
  }
  for (const o of plan.opdater) {
    const { error } = await tabel().update({ raekkefoelge: o.raekkefoelge }).eq("id", o.id);
    if (error) throw new Error(error.message);
  }
  if (plan.slet.length > 0) {
    const { error } = await tabel().delete().in("id", plan.slet);
    if (error) throw new Error(error.message);
  }
}

/** Gæsteværtens foto → content-assets under vaerter/{event_id}/ (buildAssetPath-konventionen). Returnerer stien. */
export async function uploadGaestFoto(eventId: string, file: File): Promise<string> {
  return uploadAsset(buildAssetPath("vaerter", eventId, file.name), file);
}
