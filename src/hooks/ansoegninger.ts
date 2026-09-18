/**
 * Ansøgningerne — I/O for rådgiverens side af ansøgningsmotoren (18/9).
 * Hook = I/O, lib = dom (raadgiverOpgaver-mønstret): dommene om knapper,
 * spor og visning bor i src/lib/ansoegninger/*.
 *
 * Tre tabeller (migration 20260918200000). De genererede typer fik dem
 * 18/9 (Lovable-commit 0e27b27a), men rækkerne her er husets egne, smalle
 * typer, og `as any` holdes som raadgiver_opgaver — skift til de
 * genererede Row-typer er ét lille næste skridt, ikke en betingelse. Rådgivere LÆSER dem (RLS advisor select); alt der
 * ændrer trin går gennem edge functionen ansoegning-handling (Bucket A) —
 * triggeren protect_ansoegning_motor_fields afviser en direkte update af
 * trin/lukkeaarsag/… fra klienten. Kun note og pris_oere må rettes direkte.
 *
 * Hentningerne kaster gennem kraevRaekker (HentningsFejl med kildens navn);
 * fladen oversætter med raadgiverHentefejlTekst. Kladder (indsendt_at null)
 * hentes aldrig.
 */
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import type { Lukkeaarsag, Trin } from "@/lib/ansoegningTrin";
import type { Anbefaling } from "@/lib/ansoegningAnbefaling";
import type { MenneskeHandling } from "@/lib/ansoegninger/ansoegningHandlinger";
import type { Afslagsgrund } from "@/lib/ansoegningTrin";
import { koeNummer } from "@/lib/afslagsTilbud";
import type { VentepladsRaekke } from "@/lib/ventelisteDom";

/* eslint-disable @typescript-eslint/no-explicit-any */
const tabel = (navn: string) => supabase.from(navn as any) as any;

export const ANSOEGNINGER_KEY = ["ansoegninger"] as const;
export const ANSOEGNING_KEY = (id: string) => ["ansoegning", id] as const;

/** Listens række — kun det listen viser (de tre svar er MED: læsbare uden klik). */
export interface AnsoegningRaekke {
  id: string;
  indsendt_at: string | null;
  trin: Trin;
  trin_sat_at: string;
  lukkeaarsag: Lukkeaarsag | null;
  rykkere_sendt: number;
  paa_pause_til: string | null;
  kilde: string;
  navn: string | null;
  email: string | null;
  telefon: string | null;
  cvr: string | null;
  cvr_opslag: Record<string, unknown> | null;
  omsaetningsinterval: string | null;
  antal_ansatte: number | null;
  udfordring: string | null;
  proevet: string | null;
  om_tolv_maaneder: string | null;
  set_webinar: string | null;
  anbefaling: Anbefaling | null;
  samtale_start: string | null;
  pris_oere: number | null;
  aftale_url: string | null;
  company_id: string | null;
  lukket_at: string | null;
  lukket_fra_trin: Trin | null;
  afslagsgrund: Afslagsgrund | null;
}

export const LISTE_KOLONNER =
  "id, indsendt_at, trin, trin_sat_at, lukkeaarsag, lukket_at, lukket_fra_trin, rykkere_sendt, paa_pause_til, kilde, navn, email, telefon, cvr, cvr_opslag, omsaetningsinterval, antal_ansatte, udfordring, proevet, om_tolv_maaneder, set_webinar, anbefaling, samtale_start, pris_oere, aftale_url, company_id, afslagsgrund";

export async function hentAnsoegninger(): Promise<AnsoegningRaekke[]> {
  const res = await tabel("ansoegninger")
    .select(LISTE_KOLONNER)
    .not("indsendt_at", "is", null)
    .order("trin_sat_at", { ascending: false })
    .limit(500);
  return kraevRaekker(res, "ansoegninger") as AnsoegningRaekke[];
}

/** Detaljesidens række: alle svar + motorens felter. */
export interface AnsoegningDetalje extends AnsoegningRaekke {
  created_at: string;
  kilde_raa: string | null;
  hjemmeside: string | null;
  cvr_bekraeftet: boolean;
  start_tidspunkt: string | null;
  lukket_af: string | null;
  samtale_slut: string | null;
  calendly_event_uri: string | null;
  konverteret_at: string | null;
  note: string | null;
}

export interface Beslutning {
  id: string;
  handling: string;
  fra_trin: Trin;
  til_trin: Trin;
  lukkeaarsag: Lukkeaarsag | null;
  truffet_af: string | null;
  truffet_via: string;
  begrundelse: string | null;
  truffet_at: string;
}

export interface PlanlagtHaendelse {
  id: string;
  trappe: string;
  trin_nr: number;
  handling: string;
  skabelon: string | null;
  modtager: string;
  planlagt_til: string;
  status: string;
  udfoert_at: string | null;
  sendt_til: string | null;
  annulleret_at: string | null;
  annulleret_grund: string | null;
  fejl: string | null;
}

export interface AnsoegningMedSpor {
  ansoegning: AnsoegningDetalje;
  beslutninger: Beslutning[];
  haendelser: PlanlagtHaendelse[];
}

export async function hentAnsoegning(id: string): Promise<AnsoegningMedSpor> {
  const [aRes, bRes, hRes] = await Promise.all([
    tabel("ansoegninger").select("*").eq("id", id).not("indsendt_at", "is", null).limit(1),
    tabel("ansoegning_beslutninger").select("id, handling, fra_trin, til_trin, lukkeaarsag, truffet_af, truffet_via, begrundelse, truffet_at").eq("ansoegning_id", id).order("truffet_at", { ascending: false }).limit(200),
    tabel("planlagte_haendelser").select("id, trappe, trin_nr, handling, skabelon, modtager, planlagt_til, status, udfoert_at, sendt_til, annulleret_at, annulleret_grund, fejl").eq("ansoegning_id", id).order("planlagt_til", { ascending: true }).limit(200),
  ]);
  const raekker = kraevRaekker(aRes, "ansoegninger") as AnsoegningDetalje[];
  if (raekker.length === 0) throw new Error("Ansøgningen findes ikke");
  return {
    ansoegning: raekker[0],
    beslutninger: kraevRaekker(bRes, "ansoegning_beslutninger") as Beslutning[],
    haendelser: kraevRaekker(hRes, "planlagte_haendelser") as PlanlagtHaendelse[],
  };
}

/** Svaret fra ansoegning-handling (filhovedet der er kontrakten). */
export interface HandlingsSvar {
  ok: true;
  fra: Trin;
  til: Trin;
  planlagt: number;
  annulleret: number;
  company_id?: string;
}

/**
 * Kalder edge functionen ansoegning-handling (Bucket A: rådgiverens JWT
 * som Bearer, samme form som saet-indgangs-prisniveau). To fejl-tjek:
 * `error` (en 4xx/5xx kommer som FunctionsHttpError) og `data.error`.
 * Dommens grund (409) hentes ud af fejlkroppen, så rådgiveren læser
 * hvorfor — «direkte tilbud findes ikke …» — ikke «non-2xx».
 */
export async function udfoerHandling(input: {
  ansoegningId: string;
  handling: MenneskeHandling;
  begrundelse?: string | null;
  lukkeaarsag?: Lukkeaarsag | null;
  aftaleUrl?: string | null;
  prisOere?: number | null;
  /** saet_pause: «YYYY-MM-DD» efter i dag. */
  pauseTil?: string | null;
  /** afvis/afslag: grunden bag nej'et (afslagsmailen planlægges ved niche og for_tidligt; ved niche sætter fladen C's venteliste bagefter). */
  afslagsgrund?: Afslagsgrund | null;
}): Promise<HandlingsSvar> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke("ansoegning-handling", {
    body: {
      ansoegning_id: input.ansoegningId,
      handling: input.handling,
      ...(input.begrundelse ? { begrundelse: input.begrundelse } : {}),
      ...(input.lukkeaarsag ? { lukkeaarsag: input.lukkeaarsag } : {}),
      ...(input.aftaleUrl ? { aftale_url: input.aftaleUrl } : {}),
      ...(input.prisOere ? { pris_oere: input.prisOere } : {}),
      ...(input.pauseTil ? { pause_til: input.pauseTil } : {}),
      ...(input.afslagsgrund ? { afslagsgrund: input.afslagsgrund } : {}),
    },
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  if (error) throw new Error(await laesFejl(error));
  if (data?.error) throw new Error(String(data.error));
  return data as HandlingsSvar;
}

/** FunctionsHttpError bærer svaret i `context` (en Response); kroppens `error` er dommens grund. */
async function laesFejl(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx && typeof (ctx as Response).json === "function") {
    try {
      const body = await (ctx as Response).clone().json();
      if (body && typeof body.error === "string") return body.error;
    } catch {
      /* ingen læselig krop — falder tilbage til fejlens egen tekst */
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/** Note og pris må rettes direkte (RLS advisor update; triggeren tillader netop de to). */
export async function gemNoteOgPris(id: string, felter: { note?: string | null; pris_oere?: number | null }): Promise<void> {
  const { data, error } = await tabel("ansoegninger").update(felter).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Skrivningen ramte nul rækker — ansøgningen er IKKE gemt (RLS).");
}

/** Aktive kunder til «venter på virksomhed» — samme kilde som virksomhedslisten (status active, er_kunde). */
export interface AktivKunde { id: string; name: string }
export const AKTIVE_KUNDER_KEY = ["ansoegning-aktive-kunder"] as const;
export async function hentAktiveKunder(): Promise<AktivKunde[]> {
  const res = await supabase.from("companies").select("id, name").eq("status", "active").eq("er_kunde", true).order("name");
  return (kraevRaekker(res, "companies") as AktivKunde[]).slice();
}

/** Ansøgningens pladser i kø (C's ventepladser, RLS advisor SELECT) med virksomhedens navn og nummeret i køen (C's sorterKoe over hele køen hos virksomheden). */
export interface VentepladsVisning {
  id: string;
  company_id: string;
  virksomhed: string;
  status: string;
  hvorfor: string | null;
  sat_at: string;
  nummer: number | null;
}
export const VENTEPLADSER_KEY = (id: string) => ["ansoegning-ventepladser", id] as const;
export async function hentVentepladserForAnsoegning(ansoegningId: string): Promise<VentepladsVisning[]> {
  type Rad = { id: string; ansoegning_id: string; company_id: string; status: string; hvorfor: string | null; sat_at: string; ansoegninger: { lukket_at: string | null } | null; companies: { name: string } | null };
  const FELTER = "id, ansoegning_id, company_id, status, hvorfor, sat_at, ansoegninger!inner(lukket_at), companies(name)";
  const egne = kraevRaekker(await tabel("ventepladser").select(FELTER).eq("ansoegning_id", ansoegningId).in("status", ["venter", "tilbudt"]), "ventepladser") as Rad[];
  const ud: VentepladsVisning[] = [];
  for (const p of egne) {
    const koe = kraevRaekker(await tabel("ventepladser").select(FELTER).eq("company_id", p.company_id).in("status", ["venter", "tilbudt"]), "ventepladser") as Rad[];
    const raekker: VentepladsRaekke[] = koe.map((r) => ({ id: r.id, ansoegning_id: r.ansoegning_id, company_id: r.company_id, status: r.status as VentepladsRaekke["status"], sat_at: r.sat_at, afvist_at: r.ansoegninger?.lukket_at ?? null }));
    ud.push({ id: p.id, company_id: p.company_id, virksomhed: p.companies?.name ?? "virksomheden", status: p.status, hvorfor: p.hvorfor, sat_at: p.sat_at, nummer: koeNummer(raekker, ansoegningId) });
  }
  return ud;
}

/** Efter en handling: listen, ansøgningen og forsiden (dommens linje) hentes igen. */
export async function invaliderAnsoegninger(queryClient: QueryClient, id?: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [...ANSOEGNINGER_KEY] }),
    ...(id ? [queryClient.invalidateQueries({ queryKey: [...ANSOEGNING_KEY(id)] }), queryClient.invalidateQueries({ queryKey: [...VENTEPLADSER_KEY(id)] })] : []),
    queryClient.invalidateQueries({ queryKey: ["advisor-dashboard"] }),
  ]);
}
