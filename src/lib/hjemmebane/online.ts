/**
 * src/lib/hjemmebane/online.ts
 *
 * «Online nu» — hvilke medlemmer har appen åben lige nu, som profilbilleder
 * på rådgiverens forside (Jonas 16/9: «Ja» til: kun rådgivere må i realtid
 * se hvilke medlemmer der har appen åben, som profilbilleder med navn;
 * legatmodtagere og gæster vises også, legat med mærket «Legat»). Ren dom,
 * ingen React, ingen Supabase — testet i __tests__/online.test.ts. Hentning
 * og kanal bor i src/hooks/onlineTracking.ts (medlemmet tracker) og
 * src/hooks/onlineMedlemmer.ts (rådgiveren lytter); fladen i
 * RaadgiverForsideView.
 *
 * ONLINE = appen er åben med levende Realtime-forbindelse (Presence på én
 * PRIVAT kanal, migration 20260917100000_online_presence.sql). Ikke «aktiv
 * de sidste N minutter»; en fane i baggrunden tæller som online indtil
 * serveren dropper forbindelsen (heartbeat 25 s). Emnet står ÉT sted i TS
 * (ONLINE_KANAL) og som literal i migrationen — kildeværnet holder dem ens.
 *
 * PRESENCE-STATE → PERSONER: klienten tracker med presence-nøglen = user.id,
 * så flere faner fra samme bruger lander under samme nøgle («keeps a merged
 * view of all connected clients») — én person. Nøgler der ikke er UUID'er
 * (serverens UUIDv1 hvis en klient glemmer nøglen) vises ikke: en
 * fejlkonfigureret klient må aldrig stå som et medlem.
 *
 * DOMMEN — hvem vises: rådgivere ud (de tracker ikke, men dobbelt værn hvis
 * en rådgiverkonto også er medlem — Jonas · Topix.dk ApS); ikke-kunder ud
 * (erKunde, fail-open: kun et skrevet false udelukker); legat MED, mærket
 * «Legat» — «hvem er online» er et blik på hvem der er inde, ikke et tal om
 * porteføljen; gæster MED (vis_i_netvaerk gælder Netværket, ikke
 * rådgiveren); uden virksomhed MED (virksomhed null). Sorteret på navn.
 */

import { erKunde } from "@/lib/raadgiverensKunder";

export const ONLINE_KANAL = "online-medlemmer";
export const ONLINE_OVERSKRIFT = "Online nu";
export const INGEN_ONLINE_TEKST = "Ingen medlemmer online lige nu.";
export const LEGAT_MAERKE = "Legat";
/** Højst så mange billeder; resten er «+ N». */
export const ONLINE_LOFT = 12;

/** Kanalens tilstand på rådgiverens side — fejl og tom er to beskeder. */
export type OnlineStatus = "henter" | "live" | "fejl";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** presence-state → sorterede, unikke bruger-id'er. Nøglen ER user.id (flere faner = én person). */
export function onlineIds(state: Record<string, unknown> | null | undefined): string[] {
  if (!state) return [];
  return Object.keys(state)
    .filter((k) => UUID.test(k))
    .filter((k) => Array.isArray(state[k]) && (state[k] as unknown[]).length > 0)
    .sort();
}

export interface OnlineProfil {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface OnlineMedlemskab {
  user_id: string;
  company_id: string;
}

export interface OnlineVirksomhed {
  id: string;
  name: string;
  is_legat: boolean | null;
  er_kunde?: boolean | null;
}

export interface OnlineDomInput {
  ids: readonly string[];
  profiler: readonly OnlineProfil[];
  medlemskaber: readonly OnlineMedlemskab[];
  virksomheder: readonly OnlineVirksomhed[];
  raadgiverIds: Iterable<string>;
}

export interface OnlineMedlem {
  user_id: string;
  navn: string | null;
  avatar_url: string | null;
  /** Første kunde-virksomheds navn; null uden virksomhed. */
  virksomhed: string | null;
  legat: boolean;
}

export function onlineMedlemmer(i: OnlineDomInput): OnlineMedlem[] {
  const raadgivere = new Set(i.raadgiverIds);
  const profil = new Map(i.profiler.map((p) => [p.user_id, p]));
  const virksomhed = new Map(i.virksomheder.map((v) => [v.id, v]));
  const ud: OnlineMedlem[] = [];
  for (const id of new Set(i.ids)) {
    if (raadgivere.has(id)) continue;
    const egne = i.medlemskaber
      .filter((m) => m.user_id === id)
      .map((m) => virksomhed.get(m.company_id))
      .filter((v): v is OnlineVirksomhed => !!v);
    const kunder = egne.filter(erKunde);
    if (egne.length > 0 && kunder.length === 0) continue; // kun ikke-kunder: vores egen virksomhed
    const foerste = kunder[0] ?? null;
    const p = profil.get(id);
    ud.push({
      user_id: id,
      navn: p?.full_name?.trim() || null,
      avatar_url: p?.avatar_url || null,
      virksomhed: foerste?.name ?? null,
      legat: foerste?.is_legat === true,
    });
  }
  return ud.sort((a, b) => (a.navn ?? "").localeCompare(b.navn ?? "", "da") || a.user_id.localeCompare(b.user_id));
}

export function onlineUdsnit<T>(liste: readonly T[], loft: number = ONLINE_LOFT): { viste: T[]; flere: number } {
  const viste = liste.slice(0, loft);
  return { viste, flere: liste.length - viste.length };
}

/** «Online nu» / «Online nu · 3». */
export function onlineOverskrift(antal: number): string {
  return antal > 0 ? `${ONLINE_OVERSKRIFT} · ${antal}` : ONLINE_OVERSKRIFT;
}

/** Titlen ved hover og for skærmlæsere: navn (+ « · Legat»). */
export function onlineTitel(m: Pick<OnlineMedlem, "navn" | "legat">): string {
  const navn = m.navn ?? "Medlem";
  return m.legat ? `${navn} · ${LEGAT_MAERKE}` : navn;
}
