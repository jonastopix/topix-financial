/**
 * src/lib/hjemmebane/online.ts
 *
 * «Online nu» — hvilke medlemmer har appen åben lige nu, som profilbilleder
 * på rådgiverens forside (Jonas 16/9: «Ja» til: kun rådgivere må se hvilke
 * medlemmer der har appen åben, som profilbilleder med navn;
 * legatmodtagere og gæster vises også, legat med mærket «Legat»). Ren dom,
 * ingen React, ingen Supabase — testet i __tests__/online.test.ts. Hentning
 * bor i src/hooks/onlineTracking.ts (medlemmet slår hjerteslag) og
 * src/hooks/onlineMedlemmer.ts (rådgiveren henter); fladen i
 * RaadgiverForsideView.
 *
 * ONLINE = HJERTESLAG I EN TABEL (30/9-2026, migration
 * 20260930120000_online_hjerteslag.sql). Presence-kanalen fra 16/9 viste
 * aldrig et navn (Jonas 30/9): medlemmet havde kun INSERT på den private
 * kanal og blev sandsynligvis afvist ved join — tavst (recon-online-nu.md;
 * ubevist). SELECT til medlemmer ville lade alle medlemmer se hinanden —
 * derfor en tabel, hvis RLS kan måles:
 *   medlemmet  upsert af EGEN række (user_id = auth.uid()) ved montering og
 *              hvert ONLINE_HJERTESLAG_MS, mens fanen er synlig; et slag
 *              springes over, hvis det forrige er < ONLINE_MIN_AFSTAND_MS
 *              gammelt (skallen monteres pr. side). Serveren sætter
 *              sidst_set = now() (trigger) — klientens ur tæller ikke.
 *   rådgiveren online_hjerteslag_friske(ONLINE_VINDUE_S) hvert
 *              ONLINE_GENHENT_MS og ved fokus — sammenlignet med serverens
 *              now(); RLS: rådgiveren ser alle, medlemmet kun sig selv.
 * En fane i baggrunden slår ikke hjerteslag og falder ud efter højst
 * ONLINE_VINDUE_S. Den gamle migration og dens realtime-politikker står.
 *
 * REGNESTYKKET (vinduetHolder): værste afstand mellem to slag for et
 * medlem med fanen åben = interval + mindste afstand (et slag ved montering
 * springes over, når det forrige er næsten mindste afstand gammelt, og det
 * næste kommer et helt interval senere) = 60 s + 20 s = 80 s. Det skal være
 * < vinduet 150 s, ellers blinker et medlem ud midt i et besøg; 80 + 60 =
 * 140 s < 150 s betyder, at ét tabt slag også holder.
 *
 * RÆKKER → PERSONER: user_id er primærnøglen (én række pr. person, flere
 * faner = samme række). Id'er, der ikke er UUID'er, vises ikke: en
 * fejlkonfigureret kilde må aldrig stå som et medlem.
 *
 * DOMMEN — hvem vises: rådgivere ud (de slår ikke hjerteslag, men dobbelt
 * værn hvis en rådgiverkonto også er medlem — Jonas · Topix.dk ApS);
 * ikke-kunder ud (erKunde, fail-open: kun et skrevet false udelukker —
 * testkontoen kontakt@topix.dk, Topix.dk ApS er_kunde=false, vises derfor
 * ALDRIG, med vilje); legat MED, mærket «Legat» — «hvem er online» er et
 * blik på hvem der er inde, ikke et tal om porteføljen; gæster MED
 * (vis_i_netvaerk gælder Netværket, ikke rådgiveren); uden virksomhed MED
 * (virksomhed null). Sorteret på navn.
 */

import { erKunde } from "@/lib/raadgiverensKunder";
import { CHAT_STI } from "@/lib/hjemmebane/klokke";

/** Tabellen og læsefunktionen (migration 20260930120000_online_hjerteslag.sql). */
export const ONLINE_TABEL = "online_hjerteslag";
export const ONLINE_FRISKE_FUNKTION = "online_hjerteslag_friske";
/** Medlemmets hjerteslag, mens fanen er synlig. */
export const ONLINE_HJERTESLAG_MS = 60_000;
/** Et slag springes over, hvis det forrige er yngre end dette (skallen monteres pr. side). */
export const ONLINE_MIN_AFSTAND_MS = 20_000;
/** Online = hjerteslag inden for så mange sekunder (serverens ur). */
export const ONLINE_VINDUE_S = 150;
/** Rådgiverens genhentning (og ved fokus). */
export const ONLINE_GENHENT_MS = 30_000;
export const ONLINE_OVERSKRIFT = "Online nu";
export const INGEN_ONLINE_TEKST = "Ingen medlemmer online lige nu.";
export const LEGAT_MAERKE = "Legat";
/** Højst så mange billeder; resten er «+ N». */
export const ONLINE_LOFT = 12;

/** Hentningens tilstand på rådgiverens side — fejl og tom er to beskeder. */
export type OnlineStatus = "henter" | "live" | "fejl";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Holder vinduet? Værste afstand mellem to slag (interval + mindste afstand)
 * skal være STRENGT mindre end vinduet — regnestykket står i filhovedet.
 */
export function vinduetHolder(p: { hjerteslagMs: number; minAfstandMs: number; vindueS: number }): boolean {
  const vaersteAfstandMs = p.hjerteslagMs + p.minAfstandMs;
  return p.hjerteslagMs > 0 && p.minAfstandMs >= 0 && p.minAfstandMs < p.hjerteslagMs && vaersteAfstandMs < p.vindueS * 1000;
}

/** Skal medlemmet slå et hjerteslag nu? Kun med synlig fane og når det forrige er mindst minAfstandMs gammelt. */
export function skalSlaa(p: { synlig: boolean; nuMs: number; sidsteMs: number | null; minAfstandMs?: number }): boolean {
  if (!p.synlig) return false;
  if (p.sidsteMs === null) return true;
  return p.nuMs - p.sidsteMs >= (p.minAfstandMs ?? ONLINE_MIN_AFSTAND_MS);
}

/** Hjerteslagsrækker → sorterede, unikke bruger-id'er (kun UUID'er). */
export function onlineIds(raekker: readonly { user_id: unknown }[] | null | undefined): string[] {
  if (!raekker) return [];
  const ids = raekker
    .map((r) => r?.user_id)
    .filter((id): id is string => typeof id === "string" && UUID.test(id));
  return [...new Set(ids)].sort();
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
  /** Samme virksomheds id (company_members → companies) — chattens nøgle; null uden virksomhed. */
  company_id: string | null;
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
      company_id: foerste?.id ?? null,
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

/* KLIKBARE BILLEDER (Jonas 1/10 09:20: «De små "online" billeder på
   rådgivernes forside skal være klikbare, så vi kommer ind på medlemmets
   chat»). Vejen er den samme som rådgiverens klokke (klokke.chatSti):
   /chat?companyId=<id> — CompanyChatPane slår samtalen op på virksomheden
   (én samtale pr. virksomhed). Koblingen user → company er dommens egen
   (company_members → første KUNDE-virksomhed, samme som navnet under
   billedet) — ingen ny tabel, intet nyt opslag. Uden virksomhed er der
   ingen samtale at pege på: null, og billedet står uden link. */
export function onlineChatSti(m: Pick<OnlineMedlem, "company_id">): string | null {
  return m.company_id ? `${CHAT_STI}?companyId=${encodeURIComponent(m.company_id)}` : null;
}

/** Linkets navn for skærmlæsere: «Skriv til {navn} ({virksomhed}) — online nu». */
export function onlineLinkEtiket(m: Pick<OnlineMedlem, "navn" | "virksomhed">): string {
  const navn = m.navn ?? "Medlem";
  return m.virksomhed ? `Skriv til ${navn} (${m.virksomhed}) — online nu` : `Skriv til ${navn} — online nu`;
}
