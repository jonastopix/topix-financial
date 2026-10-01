/**
 * Webinarkoblingen — I/O (udkast 1/10-2026). Hook = I/O, lib = dom: forslaget
 * er src/lib/webinar/kobling.ts's `foreslaaWebinarKobling`, tragtens brug af
 * koblingen er dashboard.ts's `medWebinarKobling`. Her hentes og skrives kun.
 *
 * Tabellen `ansoegning_webinar_kobling` (migration 20261001090000): rådgivere
 * har SELECT/INSERT/DELETE, medlemmer intet. `as any` som hooks/webinar.ts,
 * indtil de genererede typer kender tabellen.
 *
 * TABELLEN KAN MANGLE (migrationen ikke kørt endnu): `erManglendeTabel` →
 * ingen koblinger, roligt. Fladen bliver rigtig af sig selv i samme sekund,
 * migrationen er kørt. Enhver ANDEN fejl kastes med kildens navn.
 */
import { supabase } from "@/integrations/supabase/client";
import { HentningsFejl, kraevRaekker } from "@/lib/kraevRaekker";
import { erManglendeTabel } from "@/lib/manglendeTabel";
import { KOBLING_MAKS_DAGE, type KoblingAnsoegning } from "@/lib/webinar/kobling";
import type { WebinarTilmelding } from "@/lib/webinarDom";
import { TILMELDING_KOLONNER } from "@/hooks/webinar";

/* eslint-disable @typescript-eslint/no-explicit-any */
const tabel = (navn: string) => supabase.from(navn as any) as any;

export const KOBLING_TABEL = "ansoegning_webinar_kobling";
export const WEBINAR_KOBLING_KEY = (ansoegningId: string) => ["webinar-kobling", ansoegningId] as const;

/** Tilmeldingen med id og rækkens created_at — det dommen og fladen skal bruge. */
export type KoblingsTilmelding = WebinarTilmelding & { id: string; created_at: string | null; telefon: null };

export interface Kobling {
  ansoegning_id: string;
  tilmelding_id: string;
  koblet_af: string;
  koblet_at: string;
  grund: string | null;
}

export interface KoblingsData {
  ansoegning: KoblingAnsoegning & { id: string };
  /** Den bekræftede kobling — null uden. */
  kobling: Kobling | null;
  /** Tilmeldingen bag koblingen (null uden kobling, eller hvis den ikke kunne læses). */
  koblet: KoblingsTilmelding | null;
  /** Kandidaterne i vinduet — dommen afgør, hvilke der er forslag. */
  kandidater: KoblingsTilmelding[];
  /** Tilmeldinger på ansøgerens EGEN mail (dommen viser intet forslag, når der er nogen). */
  mailMatcher: number;
  /** false = migrationen er ikke kørt; afsnittet står roligt. */
  tabelFindes: boolean;
}

const KOLONNER = `id, created_at, ${TILMELDING_KOLONNER}`;

function somRaekke(r: Record<string, unknown>): KoblingsTilmelding {
  const p = r.set_procent;
  return { ...(r as unknown as KoblingsTilmelding), set_procent: p === null || p === undefined ? null : Number(p), telefon: null };
}

/**
 * Alt til afsnittet på ansøgningen, i fire opslag: ansøgningen (navn, telefon,
 * mail, oprettelse), koblingen, kandidaterne i vinduet og mail-matcherne.
 *
 * KANDIDATERNE: alle tilmeldinger med `registreret_at` i vinduet ELLER uden
 * `registreret_at` (dommen falder da tilbage på rækkens created_at). Den
 * øvre grænse og mail-udelukkelsen sættes af DOMMEN, ikke her — ét sted.
 * TELEFON: ingen kolonne på tilmeldingen (UMÅLT i eWebinars `raa`) — null.
 */
export async function hentWebinarKobling(ansoegningId: string): Promise<KoblingsData> {
  const aRes = await tabel("ansoegninger").select("id, email, navn, telefon, created_at").eq("id", ansoegningId).limit(1);
  const aRaekker = kraevRaekker(aRes, "ansoegninger") as KoblingsData["ansoegning"][];
  if (aRaekker.length === 0) throw new HentningsFejl("ansoegninger", "ansøgningen findes ikke");
  const ansoegning = aRaekker[0];

  const kRes = await tabel(KOBLING_TABEL).select("ansoegning_id, tilmelding_id, koblet_af, koblet_at, grund").eq("ansoegning_id", ansoegningId).limit(1);
  if (kRes.error && erManglendeTabel(kRes.error)) {
    return { ansoegning, kobling: null, koblet: null, kandidater: [], mailMatcher: 0, tabelFindes: false };
  }
  const kobling = ((kraevRaekker(kRes, KOBLING_TABEL) as Kobling[])[0]) ?? null;

  const oprettet = Date.parse(ansoegning.created_at);
  const fra = new Date((Number.isNaN(oprettet) ? Date.now() : oprettet) - KOBLING_MAKS_DAGE * 24 * 60 * 60 * 1000).toISOString();
  const mail = (ansoegning.email ?? "").trim().toLowerCase();

  const [cRes, mRes, tRes] = await Promise.all([
    tabel("webinar_tilmeldinger").select(KOLONNER).or(`registreret_at.gte.${fra},registreret_at.is.null`).limit(5000),
    mail === "" ? Promise.resolve({ data: [], error: null }) : tabel("webinar_tilmeldinger").select("id").eq("email", mail).limit(50),
    kobling === null ? Promise.resolve({ data: [], error: null }) : tabel("webinar_tilmeldinger").select(KOLONNER).eq("id", kobling.tilmelding_id).limit(1),
  ]);
  const kandidater = (kraevRaekker(cRes, "webinar_tilmeldinger") as Record<string, unknown>[]).map(somRaekke);
  const mailMatcher = (kraevRaekker(mRes, "webinar_tilmeldinger") as unknown[]).length;
  const koblet = ((kraevRaekker(tRes, "webinar_tilmeldinger") as Record<string, unknown>[]).map(somRaekke))[0] ?? null;
  return { ansoegning, kobling, koblet, kandidater, mailMatcher, tabelFindes: true };
}

/** Rådgiverens klik. `koblet_af` sættes af databasen (default auth.uid(), policy kræver det). */
export async function koblTilWebinar(ansoegningId: string, tilmeldingId: string, grund: string): Promise<void> {
  const res = await tabel(KOBLING_TABEL).insert({ ansoegning_id: ansoegningId, tilmelding_id: tilmeldingId, grund });
  if (res.error) throw new HentningsFejl(KOBLING_TABEL, res.error.message || "ukendt fejl");
}

/** En fejlkobling fjernes — rækken slettes; tragten tæller hende ikke længere. */
export async function fjernWebinarKobling(ansoegningId: string): Promise<void> {
  const res = await tabel(KOBLING_TABEL).delete().eq("ansoegning_id", ansoegningId).select("ansoegning_id");
  const raekker = kraevRaekker(res, KOBLING_TABEL);
  if (raekker.length === 0) throw new HentningsFejl(KOBLING_TABEL, "ingen kobling blev fjernet");
}

/**
 * Koblingerne til tragten: ansøgnings-id → tilmeldingens mail. Én hentning
 * med den indlejrede tilmelding (FK tilmelding_id). Manglende tabel → tomt kort.
 */
export async function hentKoblingsMails(): Promise<Map<string, string>> {
  const res = await tabel(KOBLING_TABEL).select("ansoegning_id, webinar_tilmeldinger(email)").limit(5000);
  if (res.error && erManglendeTabel(res.error)) return new Map();
  const kort = new Map<string, string>();
  for (const r of kraevRaekker(res, KOBLING_TABEL) as { ansoegning_id: string; webinar_tilmeldinger: { email: string | null } | null }[]) {
    const m = (r.webinar_tilmeldinger?.email ?? "").trim().toLowerCase();
    if (m !== "") kort.set(r.ansoegning_id, m);
  }
  return kort;
}
