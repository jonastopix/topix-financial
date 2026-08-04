/** Datalag for admin-fladen /admin/indhold (Hjemmebane C1 trin 2).
    Små, rene funktioner pr. entitet — komponenterne ejer React Query-siden.
    Skriveadgang håndhæves af RLS (advisor-policies); UI'et er aldrig
    forsvarslinjen. Sletning i normal drift er arkivering (B10). */

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];

export type ContentCollection = Tables["content_collections"]["Row"];
export type ContentCollectionInsert = Tables["content_collections"]["Insert"];
export type ContentItem = Tables["content_items"]["Row"];
export type ContentItemInsert = Tables["content_items"]["Insert"];
export type Partner = Tables["partners"]["Row"];
export type PartnerInsert = Tables["partners"]["Insert"];
export type EventRow = Tables["events"]["Row"];
export type EventInsert = Tables["events"]["Insert"];
export type ContentItemAttachment = Tables["content_item_attachments"]["Row"];
export type ContentItemAttachmentInsert = Tables["content_item_attachments"]["Insert"];

export type ContentStatus = "draft" | "published" | "archived";

/** De seks medlemsflader (B2) — rækkefølgen her er visningsrækkefølgen i admin.
    Labels er visningsnavne (DB-nøglerne i `key` er urørte); `hint` vises som
    stille hjælpelinje under område-rækken for det valgte område. */
export const AREAS = [
  {
    key: "start_her",
    label: "Start her",
    hint: "Onboarding-indholdet nye medlemmer møder først",
  },
  {
    key: "classroom",
    label: "Grundforløbet",
    hint: "Det store sammenhængende forløb (Circles Classroom)",
  },
  {
    key: "academy",
    label: "Kurser",
    hint: "Enkeltstående emnekurser (Circles Academy)",
  },
  {
    key: "skabeloner",
    label: "Skabeloner",
    hint: "Dokumenter og ressourcer til download",
  },
  {
    key: "talks",
    label: "Talks",
    hint: "Optagelser af live sessions og video-talks — podcast-episoder hentes automatisk via RSS (C2), ikke her",
  },
  {
    key: "quick_wins",
    label: "Quick Wins",
    hint: "Korte, hurtige videoer",
  },
] as const;

export type AreaKey = (typeof AREAS)[number]["key"];

export const ITEM_TYPES: { key: string; label: string }[] = [
  { key: "video", label: "Video" },
  { key: "lektion", label: "Lektion" },
  { key: "skabelon", label: "Skabelon" },
  { key: "rabataftale", label: "Rabataftale" },
  { key: "episode", label: "Episode" },
  { key: "push_indslag", label: "Push-indslag" },
];

function throwIfError<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

// ── Collections ────────────────────────────────────────────────────────────

export async function listCollections(area: AreaKey): Promise<ContentCollection[]> {
  return throwIfError(
    await supabase
      .from("content_collections")
      .select("*")
      .eq("area", area)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  );
}

export async function createCollection(input: ContentCollectionInsert): Promise<ContentCollection> {
  return throwIfError(
    await supabase.from("content_collections").insert(input).select().single(),
  );
}

export async function updateCollection(
  id: string,
  patch: Tables["content_collections"]["Update"],
): Promise<ContentCollection> {
  return throwIfError(
    await supabase.from("content_collections").update(patch).eq("id", id).select().single(),
  );
}

// ── Items ──────────────────────────────────────────────────────────────────

export async function listItems(area: AreaKey): Promise<ContentItem[]> {
  return throwIfError(
    await supabase
      .from("content_items")
      .select("*")
      .eq("area", area)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  );
}

/** Kandidater til events.recording_item_id (B8): published episoder/videoer. */
export async function listRecordingCandidates(): Promise<
  Pick<ContentItem, "id" | "title" | "type">[]
> {
  return throwIfError(
    await supabase
      .from("content_items")
      .select("id, title, type")
      .in("type", ["episode", "video"])
      .eq("status", "published")
      .order("title", { ascending: true }),
  );
}

export async function createItem(input: ContentItemInsert): Promise<ContentItem> {
  return throwIfError(await supabase.from("content_items").insert(input).select().single());
}

export async function updateItem(
  id: string,
  patch: Tables["content_items"]["Update"],
): Promise<ContentItem> {
  return throwIfError(
    await supabase.from("content_items").update(patch).eq("id", id).select().single(),
  );
}

// ── Partners ───────────────────────────────────────────────────────────────

export async function listPartners(): Promise<Partner[]> {
  return throwIfError(
    await supabase
      .from("partners")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  );
}

export async function createPartner(input: PartnerInsert): Promise<Partner> {
  return throwIfError(await supabase.from("partners").insert(input).select().single());
}

export async function updatePartner(
  id: string,
  patch: Tables["partners"]["Update"],
): Promise<Partner> {
  return throwIfError(
    await supabase.from("partners").update(patch).eq("id", id).select().single(),
  );
}

// ── Events ─────────────────────────────────────────────────────────────────

export async function listEvents(): Promise<EventRow[]> {
  return throwIfError(
    await supabase.from("events").select("*").order("starts_at", { ascending: false }),
  );
}

/** Aktive tilmeldinger pr. event (cancelled_at IS NULL), grupperet klient-side.
    Advisor-SELECT på event_registrations findes i RLS. */
export async function countRegistrations(): Promise<Record<string, number>> {
  const rows = throwIfError(
    await supabase.from("event_registrations").select("event_id, cancelled_at"),
  );
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.cancelled_at) continue;
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  }
  return counts;
}

export async function createEvent(input: EventInsert): Promise<EventRow> {
  return throwIfError(await supabase.from("events").insert(input).select().single());
}

export async function updateEvent(
  id: string,
  patch: Tables["events"]["Update"],
): Promise<EventRow> {
  return throwIfError(await supabase.from("events").update(patch).eq("id", id).select().single());
}

// ── Vedhæftninger/materialer (content_item_attachments) ────────────────────
// Bilag er rækker, ikke item-kolonner — de persisterer straks (uden om
// ⌘S-draftmodellen, jf. c3-vedhaeftninger-design.md §5). React Query-nøgle:
// ["admin-content", "attachments", itemId].

export async function listAttachments(itemId: string): Promise<ContentItemAttachment[]> {
  return throwIfError(
    await supabase
      .from("content_item_attachments")
      .select("*")
      .eq("item_id", itemId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  );
}

export async function createAttachment(
  input: ContentItemAttachmentInsert,
): Promise<ContentItemAttachment> {
  return throwIfError(
    await supabase.from("content_item_attachments").insert(input).select().single(),
  );
}

export async function updateAttachment(
  id: string,
  patch: Tables["content_item_attachments"]["Update"],
): Promise<ContentItemAttachment> {
  return throwIfError(
    await supabase.from("content_item_attachments").update(patch).eq("id", id).select().single(),
  );
}

export async function deleteAttachment(id: string): Promise<void> {
  const { error } = await supabase.from("content_item_attachments").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Permanent sletning (kun fra arkivet — UI'et gater, RLS håndhæver) ──────
// Advisor-DELETE-policies findes på alle fire tabeller. Kaskade-adfærd pr.
// migrationen: items → member_progress CASCADE; events → registrations
// CASCADE; partner-sletning SET NULL'er content_items.partner_id; samlinger
// CASCADE'r under-samlinger og SET NULL'er items — derfor NÆGTER UI'et
// sletning af ikke-tomme samlinger (struktur går tabt ellers).

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from("content_collections").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from("content_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePartner(id: string): Promise<void> {
  const { error } = await supabase.from("partners").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Rækkefølge ─────────────────────────────────────────────────────────────

/** Persistér ny rækkefølge for en søskendegruppe: position = index (0..n).
    Kaldes efter optimistisk UI-opdatering; kører som parallelle UPDATEs. */
export async function persistOrder(
  table: "content_collections" | "content_items" | "partners" | "content_item_attachments",
  orderedIds: string[],
): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from(table).update({ position: index }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}

// ── Storage (content-assets) ───────────────────────────────────────────────

/** Path-konventionen fra baseline §9. Filnavn saneres til slug-venlig form. */
export function buildAssetPath(
  kind: "covers" | "templates" | "partners" | "attachments",
  ownerId: string,
  filename: string,
): string {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const safeBase =
    base
      .toLowerCase()
      .replace(/[æøå]/g, (ch) => ({ æ: "ae", ø: "oe", å: "aa" })[ch] as string)
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "fil";
  return `${kind}/${ownerId}/${safeBase}${ext ? `.${ext}` : ""}`;
}

export async function uploadAsset(path: string, file: File): Promise<string> {
  const { error } = await supabase.storage
    .from("content-assets")
    .upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

export async function getAssetPreviewUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("content-assets")
    .createSignedUrl(path, 3600);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
