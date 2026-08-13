/** Datalag for medlemsvisningen /akademiet (Hjemmebane C1 trin 3).
    Læsning: kun published (RLS gater i forvejen for medlemmer; det eksplicitte
    filter gør at advisors ser fladen som medlemmerne gør). Skrivning: kun
    member_progress (self-only RLS). Dryp filtreres i app-laget via drip.ts. */

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { isEventPast } from "./eventPhase";
import type { MemberProfile } from "./memberProfile";
import type {
  ContentCollection,
  ContentItem,
  ContentItemAttachment,
  EventRow,
  Partner,
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

/** Kommende publicerede events til forsiden (Dit Boardroom). "Afholdt"
    UDLEDES af sluttiden (isEventPast — ends_at, 90 min-fallback) i
    stedet for at afhænge af manuel status-flytning; et event der er i
    gang, står stadig som kommende. Filtrering + limit sker KLIENT-side
    EFTER hentning — forsvarligt med 15-30 events om året. */
export async function listUpcomingEvents(limit: number): Promise<EventRow[]> {
  const rows = throwIfError(
    await supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .order("starts_at", { ascending: true }),
  );
  return rows.filter((event) => !isEventPast(event)).slice(0, limit);
}

/** Alle kommende publicerede events til listefladen (/events) — samme
    dom som listUpcomingEvents, blot uden loft. */
export async function listAllUpcomingEvents(): Promise<EventRow[]> {
  const rows = throwIfError(
    await supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .order("starts_at", { ascending: true }),
  );
  return rows.filter((event) => !isEventPast(event));
}

/** Én event til /events/:id. Returnerer NULL ved ikke-fundet (også
    ugyldigt id og draft-status) — fladen viser en ordentlig tom-
    tilstand; throw er forbeholdt reelle fejl. */
export async function getEvent(id: string): Promise<EventRow | null> {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .in("status", ["published", "completed", "cancelled"])
    .maybeSingle();
  // 22P02 = ugyldig uuid-syntaks — et gættet/forvansket id er "ikke
  // fundet" for medlemmet, ikke en fejl.
  if (error) {
    if ((error as { code?: string }).code === "22P02") return null;
    throw new Error(error.message);
  }
  return data;
}

/** Historikken på /events: afholdte og aflyste, nyeste først. Afholdt =
    eksplicit completed/cancelled ELLER published m. sluttid i fortiden
    (samme udledte dom som ovenfor — "Markér afholdt" er fortsat en
    mulighed, ikke en forudsætning). Limit anvendes EFTER filtreringen. */
export async function listPastEvents(limit?: number): Promise<EventRow[]> {
  const rows = throwIfError(
    await supabase
      .from("events")
      .select("*")
      .in("status", ["published", "completed", "cancelled"])
      .order("starts_at", { ascending: false }),
  );
  const past = rows.filter(
    (event) =>
      event.status === "completed" ||
      event.status === "cancelled" ||
      (event.status === "published" && isEventPast(event)),
  );
  return limit != null ? past.slice(0, limit) : past;
}

/** Rabataftalerne til medlemsfladen (13-08-2026): published partnere i
    admin-rækkefølgen (position, derefter navn). RLS ("Members can view
    published partners") bærer adgangen — status-filteret her er den
    EKSPLICITTE hensigt i koden, så fladen ikke stiltiende arver alt,
    hvad en fremtidig policy-lempelse måtte gøre synligt. */
export type MedlemsPartner = Pick<
  Partner,
  | "id"
  | "name"
  | "category"
  | "description"
  | "discount_text"
  | "indhold"
  | "redemption_type"
  | "redemption_code"
  | "redemption_url"
  | "redemption_contact"
  | "logo_path"
  | "website_url"
  | "valid_until"
>;

export async function listMedlemsPartnere(): Promise<MedlemsPartner[]> {
  return throwIfError(
    await supabase
      .from("partners")
      .select(
        "id, name, category, description, discount_text, indhold, redemption_type, redemption_code, redemption_url, redemption_contact, logo_path, website_url, valid_until",
      )
      .eq("status", "published")
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
  );
}

/** Optagelsens item til eventsiden (B8): events.recording_item_id →
    content_items på id. RLS bærer adgangen (published-gate + abonnent-
    hvidlisten) — et upubliceret eller area-lukket item giver bare null,
    og eventsiden falder tilbage til afholdt-linjen. */
export async function getRecordingItem(
  itemId: string,
): Promise<Pick<
  ContentItem,
  "id" | "title" | "media_provider" | "bunny_video_id" | "external_url" | "duration_seconds"
> | null> {
  const { data, error } = await supabase
    .from("content_items")
    .select("id, title, media_provider, bunny_video_id, external_url, duration_seconds")
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Deltagerlisten på /events/:id (Events trin 3) — kolonnesættet fra
    get_event_participants (SECURITY DEFINER-RPC, migration 20260810120000
    + aktivt-medlemskabs-gaten i 20260810150000). RPC'en er ikke i de
    genererede typer endnu — deraf as any-kaldet (samme mønster som
    get_all_advisor_profiles i CompanyChatPane).
    Kolonnesættet er DELT på tværs af visnings-RPC'erne og bor som
    MemberProfile i memberProfile.ts — aliaset her består, så
    deltagerlistens kaldesteder kan blive stående. */
export type EventParticipant = MemberProfile;

export async function listEventParticipants(eventId: string): Promise<EventParticipant[]> {
  const { data, error } = await supabase.rpc("get_event_participants" as any, {
    p_event_id: eventId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as EventParticipant[];
}

/** Tilmelding. UNIQUE(event_id, user_id) + upsert: en tidligere
    afmeldt/afbudt række genbruges med cancelled_at nulstillet og svaret
    sat — historikken er altid én række pr. (event, bruger), aldrig
    dubletter. Self-only RLS håndhæver ejerskabet. */
export async function registerForEvent(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("event_registrations")
    .upsert(
      // response er ikke i de genererede typer endnu (migration 20260810210000) — as any-mønstret.
      { event_id: eventId, user_id: userId, response: "attending", cancelled_at: null } as any,
      { onConflict: "event_id,user_id" },
    );
  if (error) throw new Error(error.message);
}

/** Afbud — et AKTIVT svar (response='declined', cancelled_at null),
    ikke en afmelding. Vises aldrig på deltagerlisten (RPC'en filtrerer
    på attending), men udelukker uge-påmindelsen. */
export async function declineEvent(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("event_registrations")
    .upsert(
      { event_id: eventId, user_id: userId, response: "declined", cancelled_at: null } as any,
      { onConflict: "event_id,user_id" },
    );
  if (error) throw new Error(error.message);
}

export type EventResponse = "attending" | "declined";

/** Brugerens EGET svar — læses direkte fra event_registrations
    (self-only RLS), UAFHÆNGIGT af deltagerlisten: get_event_participants
    filtrerer på aktivt medlemskab OG attending, så både en gyldig
    tilmelding og et afbud kan eksistere uden at optræde i listen.
    null = intet aktivt svar (ingen række, eller trukket tilbage). */
export async function getMyEventResponse(
  eventId: string,
  userId: string,
): Promise<EventResponse | null> {
  const { data, error } = await supabase
    .from("event_registrations")
    .select("response" as any)
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .is("cancelled_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return ((data as any)?.response as EventResponse | undefined) ?? null;
}

/** Afmelding er en cancelled_at-UPDATE på egen række — ALDRIG DELETE.
    Kapacitetshistorikken bevares, og medlemmer har ingen DELETE-policy
    (baseline: event_registrations er SELECT/INSERT/UPDATE only). */
export async function cancelRegistration(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("event_registrations")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
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
