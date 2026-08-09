/** Datalag for medlemsvisningen /akademiet (Hjemmebane C1 trin 3).
    Læsning: kun published (RLS gater i forvejen for medlemmer; det eksplicitte
    filter gør at advisors ser fladen som medlemmerne gør). Skrivning: kun
    member_progress (self-only RLS). Dryp filtreres i app-laget via drip.ts. */

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type {
  ContentCollection,
  ContentItem,
  ContentItemAttachment,
  EventRow,
} from "./adminContentApi";

export type MemberProgress = {
  id: string;
  user_id: string;
  content_item_id: string;
  seen_at: string | null;
  acknowledged_at: string | null;
  skipped_at: string | null;
  last_position_seconds: number | null;
  created_at: string;
  updated_at: string;
};

function throwIfError<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** Hele det publicerede katalog — lille nok til ét fetch pr. type; forsiden,
    område- og element-siderne deler cachen. */
export async function listPublishedCollections(): Promise<ContentCollection[]> {
  return throwIfError(
    await supabase
      .from("content_collections")
      .select("*")
      .eq("status", "published")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  );
}

export async function listPublishedItems(): Promise<ContentItem[]> {
  return throwIfError(
    await supabase
      .from("content_items")
      .select("*")
      .eq("status", "published")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  );
}

/** Dryp-ankeret (C0-afgørelse 3): virksomhedens indmeldelse, ikke brugerens.
    Advisors har typisk ingen række → null (drip.ts håndterer advisor-bypass). */
export async function getMyJoinedAt(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("company_members")
    .select("created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.created_at ?? null;
}

export async function getMyProgress(userId: string): Promise<MemberProgress[]> {
  return throwIfError(
    await supabase.from("member_progress").select("*").eq("user_id", userId),
  );
}

export type ProgressPatch = Partial<
  Pick<MemberProgress, "seen_at" | "acknowledged_at" | "skipped_at" | "last_position_seconds">
>;

/** Upsert på UNIQUE(user_id, content_item_id). Medlemmers ejerskab
    håndhæves af self-only RLS; advisors har egne write-policies
    (fremdriftsværktøjet, migration 20260805200000) og skriver via
    adminContentApi's batchAcknowledge/clearAcknowledge. */
export async function upsertProgress(
  userId: string,
  contentItemId: string,
  patch: ProgressPatch,
): Promise<void> {
  const { error } = await supabase
    .from("member_progress")
    .upsert(
      { user_id: userId, content_item_id: contentItemId, ...patch },
      { onConflict: "user_id,content_item_id" },
    );
  if (error) throw new Error(error.message);
}

/** Tilstandsprikken pr. element — afledt af de uafhængige tidsstempler.
    Accepterer et strukturelt subset, så advisor-værktøjets AdminProgressRow
    (uden id/positions-felter) kan bruge samme dom. */
export type ItemProgressState = "done" | "started" | "skipped" | "untouched";

export function itemProgressState(
  progress: Pick<MemberProgress, "seen_at" | "acknowledged_at" | "skipped_at"> | undefined,
): ItemProgressState {
  if (!progress) return "untouched";
  if (progress.acknowledged_at) return "done";
  if (progress.skipped_at) return "skipped";
  if (progress.seen_at) return "started";
  return "untouched";
}

/** Medlemmets egen handouts-række for et modul (lektion→handout-koblingen,
    refleksionskortet i ElementView). Self-only RLS dækker; user_id-filteret
    er alligevel eksplicit, fordi advisors' brede SELECT ellers ville matche
    alle medlemmers rækker. Ingen række = "Ikke startet" — et normalt udfald,
    derfor maybeSingle. */
export type OwnHandout = Pick<
  Database["public"]["Tables"]["handouts"]["Row"],
  "responses" | "checklist" | "levers" | "status"
>;

export async function getOwnHandout(
  userId: string,
  module: string,
): Promise<OwnHandout | null> {
  const { data, error } = await supabase
    .from("handouts")
    .select("responses, checklist, levers, status")
    .eq("user_id", userId)
    .eq("module", module)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Materialer på et element (kun element-siden henter dem). RLS gater:
    medlemmer ser kun bilag på published items (forælder-gated EXISTS-policy);
    ingen fremdriftssporing på bilag. */
export async function listItemAttachments(itemId: string): Promise<ContentItemAttachment[]> {
  return throwIfError(
    await supabase
      .from("content_item_attachments")
      .select("*")
      .eq("item_id", itemId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  );
}

/** Kommende publicerede events til forsiden (Dit Boardroom). Medlems-RLS
    tillader published/cancelled/completed — vi viser kun published og
    fremtidige, nærmeste først. */
export async function listUpcomingEvents(limit: number): Promise<EventRow[]> {
  return throwIfError(
    await supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(limit),
  );
}

/** Alle kommende publicerede events til listefladen (/events) — samme
    dom som listUpcomingEvents, blot uden loft. */
export async function listAllUpcomingEvents(): Promise<EventRow[]> {
  return throwIfError(
    await supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true }),
  );
}

/** Historikken på /events: afholdte og aflyste events, nyeste først.
    Medlems-RLS tillader completed/cancelled (jf. noten ovenfor). */
export async function listPastEvents(limit?: number): Promise<EventRow[]> {
  let query = supabase
    .from("events")
    .select("*")
    .in("status", ["completed", "cancelled"])
    .order("starts_at", { ascending: false });
  if (limit != null) query = query.limit(limit);
  return throwIfError(await query);
}

/** Signeret Bunny-embed fra get-video-embed (Bucket A). Token-signering sker
    KUN server-side — frontend modtager den færdige, tidsbegrænsede URL. */
export async function getVideoEmbed(
  itemId: string,
  resumeAt?: number,
): Promise<{ embedUrl: string; expires: number }> {
  const { data, error } = await supabase.functions.invoke("get-video-embed", {
    body: { itemId, ...(resumeAt && resumeAt > 0 ? { resumeAt: Math.floor(resumeAt) } : {}) },
  });
  if (error) throw new Error(error.message);
  return data as { embedUrl: string; expires: number };
}
