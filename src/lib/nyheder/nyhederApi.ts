/**
 * Nyhedsagentens flade-lag (skive 1, 30/9-2026): læs udkastene, og rådgiverens
 * to klik — «Publicér i community» og «Afvis».
 *
 * PUBLICERINGEN går gennem husets EKSISTERENDE community-skrivevej, som
 * rådgiveren, i PRÆCIS CommunityViews rækkefølge (opretMutation):
 *   opretTraad (opret_community_traad) → notificerNaevnelser → notificerNytOpslag
 * — så klokker, opslagsmail og nævnelser følger husets regler uden en ny vej.
 * Rundt om den dømmer nyhed-udkast-afgoer (Bucket A) rækkefølgen:
 *   «tag» FØR tråden oprettes (to rådgivere kan ikke publicere samme uge to gange),
 *   «publiceret» EFTER (udkastet bærer trådens id),
 *   «slip» hvis oprettelsen fejlede (udkastet står som kladde igen).
 * Cronen kender ikke denne vej — intet publiceres uden rådgiverens klik
 * (nyhedAgent.guard).
 */
import { supabase } from "@/integrations/supabase/client";
import { notificerNaevnelser, notificerNytOpslag, opretTraad } from "@/lib/hjemmebane/communityApi";

export type NyhedStatus = "kladde" | "publiceres" | "godkendt" | "afvist";

export interface NyhedKilde {
  emne_id: string;
  kilde: string;
  titel: string;
  url: string;
  score: number;
  hvem: string;
  handling: string;
  begrundelse: string;
}

export interface NyhedUdkast {
  id: string;
  uge: string;
  titel: string;
  indhold_json: unknown;
  kilder: NyhedKilde[];
  status: NyhedStatus;
  traad_id: string | null;
  afgjort_af: string | null;
  afgjort_at: string | null;
  afvist_grund: string | null;
  uaendret: boolean | null;
  created_at: string;
}

export const NYHEDER_QUERY_KEY = ["nyheder", "udkast"] as const;

/** De seneste udkast, nyeste først. RLS: kun rådgivere kan læse tabellen. */
export async function hentNyhedsudkast(antal = 12): Promise<NyhedUdkast[]> {
  const { data, error } = await (supabase as any)
    .from("nyhed_udkast")
    .select("id, uge, titel, indhold_json, kilder, status, traad_id, afgjort_af, afgjort_at, afvist_grund, uaendret, created_at")
    .order("created_at", { ascending: false })
    .limit(antal);
  if (error) throw new Error(error.message);
  return ((data ?? []) as NyhedUdkast[]).map((u) => ({ ...u, kilder: Array.isArray(u.kilder) ? u.kilder : [] }));
}

async function afgoer(body: { handling: "tag" | "slip" | "publiceret" | "afvis"; udkast_id: string; traad_id?: string; grund?: string }): Promise<void> {
  const { data, error } = await supabase.functions.invoke("nyhed-udkast-afgoer", { body });
  if (error) {
    // functions.invoke lægger serverens fejltekst i context — vis den, ikke «non-2xx».
    let besked = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      const krop = ctx ? await ctx.json() : null;
      if (krop?.error) besked = String(krop.error);
    } catch {
      /* behold error.message */
    }
    throw new Error(besked);
  }
  if (!(data as { ok?: boolean } | null)?.ok) throw new Error("Afgørelsen blev ikke gemt");
}

/**
 * Rådgiverens «Publicér i community». Kaster ved fejl — kalderen viser den.
 * Returnerer den nye tråds id.
 */
export async function publicerNyhedsudkast(udkastId: string, titel: string, indholdJson: unknown): Promise<string> {
  await afgoer({ handling: "tag", udkast_id: udkastId });
  let traadId: string;
  try {
    traadId = await opretTraad({ titel, indhold: "", indholdJson });
  } catch (fejl) {
    // Tråden blev ikke oprettet: udkastet skal kunne publiceres igen.
    try {
      await afgoer({ handling: "slip", udkast_id: udkastId });
    } catch (slipFejl) {
      console.error("publicerNyhedsudkast: slip fejlede efter en fejlet oprettelse:", slipFejl);
    }
    throw fejl;
  }
  await afgoer({ handling: "publiceret", udkast_id: udkastId, traad_id: traadId });
  // Samme to bivirkninger og samme garanti som CommunityView — de kaster aldrig.
  await notificerNaevnelser({ traadId });
  await notificerNytOpslag(traadId);
  return traadId;
}

/** «Afvis» — udkastet publiceres aldrig; grunden (valgfri) står i sporet. */
export async function afvisNyhedsudkast(udkastId: string, grund: string): Promise<void> {
  await afgoer({ handling: "afvis", udkast_id: udkastId, grund: grund.trim() || undefined });
}

/** En «publiceres», der hænger (fanen blev lukket) — frigives af den, der tog den, eller af enhver efter 10 min. */
export async function slipNyhedsudkast(udkastId: string): Promise<void> {
  await afgoer({ handling: "slip", udkast_id: udkastId });
}

export const STATUS_TEKST: Record<NyhedStatus, string> = {
  kladde: "Venter på en rådgiver",
  publiceres: "Ved at blive publiceret",
  godkendt: "Publiceret i community",
  afvist: "Afvist",
};
