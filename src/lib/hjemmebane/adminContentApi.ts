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

/** Områderne — rækkefølgen her er visningsrækkefølgen i admin. Labels er
    visningsnavne (DB-nøglerne i `key` er urørte); `hint` vises som stille
    hjælpelinje under område-rækken for det valgte område.
    `akademi`: true = forløbsområde i /akademiet; false = området har hjem
    et andet sted (push → forsidens hero) og må ALDRIG optræde i Akademiet
    (ForsideView/OmraadeView/ElementView gater på flaget). */
export const AREAS = [
  {
    key: "start_her",
    label: "Start her",
    akademi: true,
    hint: "Akademiets introduktion — det første, medlemmet møder her (platform-onboarding bor udenfor, jf. BACKLOG-epic)",
  },
  {
    key: "classroom",
    label: "Grundforløbet",
    akademi: true,
    hint: "Det store sammenhængende forløb (Circles Classroom)",
  },
  {
    key: "academy",
    label: "Kurser",
    akademi: true,
    hint: "Enkeltstående emnekurser (Circles Academy)",
  },
  {
    key: "skabeloner",
    label: "Skabeloner",
    akademi: true,
    hint: "Dokumenter og ressourcer til download",
  },
  {
    key: "talks",
    label: "Talks",
    akademi: true,
    hint: "Optagelser af live sessions og video-talks — podcast-episoder hentes automatisk via RSS (C2), ikke her",
  },
  {
    key: "quick_wins",
    label: "Quick Wins",
    akademi: true,
    hint: "Korte, hurtige videoer",
  },
  {
    key: "push",
    label: "Ugens push",
    akademi: false,
    hint: "Forsidens hero — seneste publicerede indslag er det, medlemmet møder først på Dit Boardroom",
  },
  {
    key: "ugens_video",
    label: "Ugens video",
    akademi: false,
    hint: "Forsidens kuraterede videoindslag — nyeste publicerede, ikke-udløbne vinder (Bunny-id eller ekstern URL); kræver migration 20260809140000 kørt i Lovable",
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

/** UPDATE-veje bruger maybeSingle: 0 rækker er et legitimt udfald (slettet
    række, RLS, tom patch) og skal give en menneskelig besked — ikke
    PostgRESTs "Cannot coerce..." (PGRST116). CREATE-veje beholder .single():
    0 rækker fra INSERT+RETURNING er en reel invariantbrist. */
function throwIfMissing<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data == null) throw new Error("Elementet findes ikke længere — genindlæs siden");
  return result.data;
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
  return throwIfMissing(
    await supabase.from("content_collections").update(patch).eq("id", id).select().maybeSingle(),
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
  return throwIfMissing(
    await supabase.from("content_items").update(patch).eq("id", id).select().maybeSingle(),
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
  return throwIfMissing(
    await supabase.from("partners").update(patch).eq("id", id).select().maybeSingle(),
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
  return throwIfMissing(
    await supabase.from("events").update(patch).eq("id", id).select().maybeSingle(),
  );
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
  return throwIfMissing(
    await supabase.from("content_item_attachments").update(patch).eq("id", id).select().maybeSingle(),
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

// ── Fremdrift (advisor-værktøjet, /admin/indhold/fremdrift) ────────────────
// Læsning bæres af advisor-SELECT-policyen; skrivning af advisor-INSERT/
// UPDATE-policies (migration 20260805200000). Medlemmer skriver fortsat kun
// egne rækker via akademiApi.upsertProgress.

/** Rå fremdriftsrækker for en mængde items (typisk alle published) — én
    samlet SELECT. Sparse: kun rækker der findes. */
export type AdminProgressRow = {
  user_id: string;
  content_item_id: string;
  seen_at: string | null;
  acknowledged_at: string | null;
  skipped_at: string | null;
};

export async function listAllMemberProgress(itemIds: string[]): Promise<AdminProgressRow[]> {
  if (itemIds.length === 0) return [];
  return throwIfError(
    await supabase
      .from("member_progress")
      .select("user_id, content_item_id, seen_at, acknowledged_at, skipped_at")
      .in("content_item_id", itemIds),
  );
}

/** Medlemslisten til Fremdrift-fanen: company_members × profiles ×
    companies — minimal udgave af Members-mønstret. Legat filtreres FRA
    (kurateret forløb, eget dashboard); advisors optræder ikke i
    company_members og er dermed automatisk udeladt. Medlemmer uden
    profil-række beholdes med fallback-navn. Alfabetisk sortering. */
export type AdminMember = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  companyName: string;
};

export async function listMembers(): Promise<AdminMember[]> {
  const [membersRes, profilesRes, companiesRes] = await Promise.all([
    supabase.from("company_members").select("user_id, company_id"),
    supabase.from("profiles").select("user_id, full_name, avatar_url"),
    supabase.from("companies").select("id, name, is_legat"),
  ]);
  for (const res of [membersRes, profilesRes, companiesRes])
    if (res.error) throw new Error(res.error.message);

  const profileByUser = new Map((profilesRes.data ?? []).map((p) => [p.user_id, p]));
  const companyById = new Map((companiesRes.data ?? []).map((c) => [c.id, c]));

  return (membersRes.data ?? [])
    .filter((m) => companyById.get(m.company_id)?.is_legat !== true)
    .map((m) => {
      const profile = profileByUser.get(m.user_id);
      return {
        userId: m.user_id,
        name: profile?.full_name?.trim() || "Ukendt medlem",
        avatarUrl: profile?.avatar_url ?? null,
        companyName: companyById.get(m.company_id)?.name ?? "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "da"));
}

/** Batch-markering: manglende TRACKED videoer i ét array-upsert (én
    request, atomisk). Kalderen leverer eksisterende seen_at pr. item, så
    "startet"-tidsstempler bevares; nye rækker får seen_at = nu. KUN sæt —
    fortryd sker celle-for-celle (clearAcknowledge). */
export async function batchAcknowledge(
  userId: string,
  entries: { itemId: string; seenAt: string | null }[],
): Promise<void> {
  if (entries.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("member_progress").upsert(
    entries.map((entry) => ({
      user_id: userId,
      content_item_id: entry.itemId,
      seen_at: entry.seenAt ?? now,
      acknowledged_at: now,
    })),
    { onConflict: "user_id,content_item_id" },
  );
  if (error) throw new Error(error.message);
}

/** Fortryd én markering (advisor): acknowledged_at → null. Rækkens øvrige
    tidsstempler (seen_at m.v.) bevares — samme fortryd-semantik som
    medlemmets egen unacknowledge i ElementView. */
export async function clearAcknowledge(userId: string, itemId: string): Promise<void> {
  const { error } = await supabase
    .from("member_progress")
    .update({ acknowledged_at: null })
    .eq("user_id", userId)
    .eq("content_item_id", itemId);
  if (error) throw new Error(error.message);
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
