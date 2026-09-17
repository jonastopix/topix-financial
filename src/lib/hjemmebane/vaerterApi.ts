/**
 * src/lib/hjemmebane/vaerterApi.ts — datalaget for event_vaerter (PR 4b).
 * Tabellen er ikke i de genererede Supabase-typer før Lovable regenererer
 * (migration 20260918130000 køres i hånden) — derfor `as any`, samme mønster
 * som member_profiles/get_member_directory havde (memberProfile.ts, filhovedet).
 * Læsning KASTER (kraevRaekker — fejl er ikke tom). Skrivning: nye rækker
 * indsættes FØR de gamle slettes, så en fejl aldrig efterlader eventet uden
 * værter (ingen transaktion fra klienten; en RPC kan komme senere).
 */
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { buildAssetPath, uploadAsset } from "./adminContentApi";
import type { VaertRaekke, VaertUdkast } from "./vaerter";

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

/** Gem hele værtslisten for ét event i den givne rækkefølge — nye rækker først, så de gamle væk. */
export async function saveVaerter(eventId: string, udkast: readonly VaertUdkast[]): Promise<void> {
  const gamle = (kraevRaekker(await tabel().select("id").eq("event_id", eventId), "event_vaerter") as { id: string }[]).map((r) => r.id);
  if (udkast.length > 0) {
    const { error } = await tabel().insert(
      udkast.map((v, i) => ({
        event_id: eventId,
        user_id: v.user_id,
        gaest_navn: v.user_id ? null : (v.gaest_navn ?? "").trim() || null,
        gaest_titel: v.user_id ? null : (v.gaest_titel ?? "").trim() || null,
        gaest_foto_path: v.user_id ? null : v.gaest_foto_path || null,
        raekkefoelge: i,
      })),
    );
    if (error) throw new Error(error.message);
  }
  if (gamle.length > 0) {
    const { error } = await tabel().delete().in("id", gamle);
    if (error) throw new Error(error.message);
  }
}

/** Gæsteværtens foto → content-assets under vaerter/{event_id}/ (buildAssetPath-konventionen). Returnerer stien. */
export async function uploadGaestFoto(eventId: string, file: File): Promise<string> {
  return uploadAsset(buildAssetPath("vaerter", eventId, file.name), file);
}
