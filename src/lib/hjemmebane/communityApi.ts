/** Datalag for community-fladen (forum light, ét feed).
    Al læsning OG skrivning går gennem SECURITY DEFINER-RPC'erne
    (20260811170000 + 20260811180000) — medlemmer kan ikke læse andres
    profiler eller reaktioner direkte, og skrivereglerne bor i databasen. */

import { supabase } from "@/integrations/supabase/client";

/** RPC'erne og community-tabellerne er endnu ikke i de genererede
    Supabase-typer (migrationerne køres manuelt i Lovable; typegen følger
    efter) — deraf de manuelle interfaces og as any-kaldene, samme mønster
    som get_member_directory i memberProfile.ts. */
export interface CommunityTraad {
  id: string;
  titel: string;
  indhold: string;
  status: string;
  fastgjort: boolean;
  antal_svar: number;
  antal_visninger: number;
  sidste_svar_at: string | null;
  created_at: string;
  updated_at: string;
  kilde_type: "content_item" | "event" | null;
  kilde_item_id: string | null;
  kilde_event_id: string | null;
  forfatter_id: string;
  forfatter_navn: string | null;
  forfatter_avatar_url: string | null;
  antal_reaktioner: number;
  jeg_har_reageret: boolean;
  seneste_aktivitet_at: string;
  /** Tiptap-dokumentet bag indhold-teksten. Valgfrit: læse-RPC'erne
      (get_community_feed/get_community_traad) returnerer det IKKE endnu —
      de skal udvides i et senere led, og indtil da er feltet undefined. */
  indhold_json?: unknown | null;
}

export interface CommunitySvar {
  id: string;
  traad_id: string;
  indhold: string;
  status: string;
  created_at: string;
  updated_at: string;
  forfatter_id: string;
  forfatter_navn: string | null;
  forfatter_avatar_url: string | null;
  antal_reaktioner: number;
  jeg_har_reageret: boolean;
  /** Som på CommunityTraad: get_community_svar returnerer det ikke endnu. */
  indhold_json?: unknown | null;
}

function throwIfError<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** RPC'erne returnerer antal_reaktioner som bigint, og PostgREST leverer
    bigint som STRENG i JSON, ikke som tal. Konverteringen hører hjemme
    her i datalaget — fladen skal aldrig se "3" hvor den venter 3. */
function normaliserAntalReaktioner<T extends { antal_reaktioner: unknown }>(raekke: T): T {
  return { ...raekke, antal_reaktioner: Number(raekke.antal_reaktioner ?? 0) };
}

// ── Læsning ────────────────────────────────────────────────────────────────

export async function hentFeed(limit = 30, offset = 0): Promise<CommunityTraad[]> {
  const rows = throwIfError(
    await (supabase.rpc as any)("get_community_feed", { p_limit: limit, p_offset: offset }),
  ) as CommunityTraad[] | null;
  return (rows ?? []).map(normaliserAntalReaktioner);
}

/** Første række eller null. Tom = ingen adgang ELLER tråden findes
    ikke/er lukket — de to kan ikke skelnes udefra, og det er bevidst
    (RPC'en returnerer tomt frem for at afsløre om en skjult tråd
    eksisterer). */
export async function hentTraad(traadId: string): Promise<CommunityTraad | null> {
  const rows = throwIfError(
    await (supabase.rpc as any)("get_community_traad", { p_traad_id: traadId }),
  ) as CommunityTraad[] | null;
  const foerste = rows?.[0];
  return foerste ? normaliserAntalReaktioner(foerste) : null;
}

export async function hentSvar(traadId: string): Promise<CommunitySvar[]> {
  const rows = throwIfError(
    await (supabase.rpc as any)("get_community_svar", { p_traad_id: traadId }),
  ) as CommunitySvar[] | null;
  return (rows ?? []).map(normaliserAntalReaktioner);
}

// ── Skrivning ──────────────────────────────────────────────────────────────

export async function opretTraad(input: {
  titel: string;
  indhold: string;
  indholdJson?: unknown;
  kildeType?: "content_item" | "event";
  kildeItemId?: string;
  kildeEventId?: string;
}): Promise<string> {
  return throwIfError(
    await (supabase.rpc as any)("opret_community_traad", {
      p_titel: input.titel,
      p_indhold: input.indhold,
      p_indhold_json: input.indholdJson ?? null,
      p_kilde_type: input.kildeType ?? null,
      p_kilde_item_id: input.kildeItemId ?? null,
      p_kilde_event_id: input.kildeEventId ?? null,
    }),
  ) as string;
}

export async function opretSvar(
  traadId: string,
  indhold: string,
  indholdJson?: unknown,
): Promise<string> {
  return throwIfError(
    await (supabase.rpc as any)("opret_community_svar", {
      p_traad_id: traadId,
      p_indhold: indhold,
      p_indhold_json: indholdJson ?? null,
    }),
  ) as string;
}

/** Toggle. Returværdien er "har jeg nu reageret". Kun den satte parameter
    sendes — RPC'en kræver præcis ét mål og rejser ellers fejl. */
export async function saetReaktion(
  maal: { traadId: string } | { svarId: string },
): Promise<boolean> {
  const params =
    "traadId" in maal ? { p_traad_id: maal.traadId } : { p_svar_id: maal.svarId };
  const result = throwIfError(
    await (supabase.rpc as any)("saet_community_reaktion", params),
  );
  return Boolean(result);
}

/** Signeret URL til et community-billede. Edge-funktionen
    get-community-billed-url signerer kun efter databasens adgangsdom
    (maa_se_community_billede) — stien skal optræde i et aktivt dokument,
    kalderen må se. expiresAt er ISO, så klienten kan planlægge genhentning. */
export async function hentBilledUrl(sti: string): Promise<{ url: string; expiresAt: string }> {
  const { data, error } = await supabase.functions.invoke("get-community-billed-url", {
    body: { sti },
  });
  if (error) throw new Error(`Billedet kunne ikke hentes: ${error.message}`);
  return data as { url: string; expiresAt: string };
}

/** Kaster bevidst IKKE ved manglende adgang: RPC'en returnerer stille
    (RETURN, ikke RAISE), fordi en visning er en bivirkning af at kigge,
    ikke en handling — og idempotent via ON CONFLICT DO NOTHING. Kun
    reelle fejl (netværk m.v.) når frem som exceptions. */
export async function registrerVisning(traadId: string): Promise<void> {
  const { error } = await (supabase.rpc as any)("registrer_community_visning", {
    p_traad_id: traadId,
  });
  if (error) throw new Error(error.message);
}
