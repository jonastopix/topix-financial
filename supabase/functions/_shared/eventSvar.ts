/**
 * _shared/eventSvar.ts — de tre svargrupper på et event (udkast 21/9-2026,
 * Jonas' beslutning 21/9; recon-eventflytning.md).
 *
 * SPEJLET ORDRET i src/lib/hjemmebane/eventSvar.ts (paritetstest
 * eventSvar.paritet.test.ts). Nul imports, ingen Deno-afhængighed.
 *
 * ÉN REGEL, TO STEDER: denne rene funktion og SQL-funktionen
 * public.event_svar_grupper(uuid) (migration 20260921210000) dømmer det samme;
 * kildeværnet eventSvar.guard låser SQL'ens prædikater til ordene her.
 *
 *   tilmeldt         aktiv række (cancelled_at null) med response = attending
 *   kan_ikke         aktiv række med response = declined
 *   har_ikke_svaret  ingen aktiv række
 *
 * HVEM TÆLLER MED: kun personer med ADGANG til eventet, og aldrig rådgivere.
 * Adgangen er events-RLS'ens regel (har_aktivt_medlemskab, fail-closed:
 * company_members → companies med is_legat = false, contract_end_date sat og
 * slutdagen talt med) — IKKE publiceringsmailens (get_event_non_responders:
 * is_membership_active, fail-open, + ikke legat_enrollments). Forskellen står
 * i udkastets README §2. En rådgiver tæller aldrig — hverken som tilmeldt
 * eller som «har ikke svaret» (has_role advisor; admin arver advisor).
 *
 * En tilmeldt UDEN adgang (medlemskabet udløb efter tilmeldingen) tæller
 * ikke — hun kan ikke åbne eventet, og får derfor heller ikke besked om en
 * flytning. Det er den ene forskel fra flyt-event før 21/9, som sendte til
 * alle attending-rækker uanset adgang (README §3).
 */

export type Svargruppe = "tilmeldt" | "kan_ikke" | "har_ikke_svaret";

export const SVARGRUPPER: readonly Svargruppe[] = ["tilmeldt", "kan_ikke", "har_ikke_svaret"];

/** Én persons aktive række i event_registrations — null når der ingen er. */
export interface AktivRaekke {
  response: "attending" | "declined";
  cancelled_at: string | null;
}

/**
 * Adgangsreglen, som events-RLS'en dømmer den (har_aktivt_medlemskab):
 * mindst ét medlemskab i en virksomhed, der ikke er legat, har en slutdato,
 * og hvor slutdagen (til og med) ikke er passeret. `nu` gives ind.
 */
export function harAdgangEfterRls(
  virksomheder: readonly { is_legat: boolean; contract_end_date: string | null }[],
  nu: Date,
): boolean {
  return virksomheder.some((v) => {
    if (v.is_legat) return false;
    if (v.contract_end_date === null) return false;
    const slut = Date.parse(v.contract_end_date);
    if (!Number.isFinite(slut)) return false;
    // contract_end_date + 1 dag > now(): slutdagen tæller med (7/9).
    return slut + 86_400_000 > nu.getTime();
  });
}

/**
 * Dommen for én person. null = tæller ikke med (rådgiver, eller ingen adgang).
 * Rækken er kun aktiv, når cancelled_at er null — en afmelding og et trukket
 * afbud er samme handling (cancelled_at sat) og giver «har ikke svaret».
 */
export function doemSvargruppe(p: { erRaadgiver: boolean; harAdgang: boolean; raekke: AktivRaekke | null }): Svargruppe | null {
  if (p.erRaadgiver) return null;
  if (!p.harAdgang) return null;
  const aktiv = p.raekke !== null && p.raekke.cancelled_at === null;
  if (!aktiv) return "har_ikke_svaret";
  return p.raekke!.response === "attending" ? "tilmeldt" : "kan_ikke";
}

export interface GruppeRaekke {
  user_id: string;
  gruppe: Svargruppe;
}

/** Tæller pr. gruppe — nul for grupper uden rækker. */
export function taelGrupper(raekker: readonly GruppeRaekke[]): Record<Svargruppe, number> {
  const tal: Record<Svargruppe, number> = { tilmeldt: 0, kan_ikke: 0, har_ikke_svaret: 0 };
  for (const r of raekker) if (r.gruppe in tal) tal[r.gruppe]++;
  return tal;
}

/**
 * Modtagerne ved en flytning: de tilmeldte får tekst A, de andre (kan ikke +
 * har ikke svaret) får tekst B. Unikke id'er, én person i én liste.
 */
export function delModtagere(raekker: readonly GruppeRaekke[]): { tilmeldte: string[]; andre: string[] } {
  const tilmeldte = new Set<string>();
  const andre = new Set<string>();
  for (const r of raekker) {
    if (r.gruppe === "tilmeldt") tilmeldte.add(r.user_id);
    else if (r.gruppe === "kan_ikke" || r.gruppe === "har_ikke_svaret") andre.add(r.user_id);
  }
  for (const id of tilmeldte) andre.delete(id);
  return { tilmeldte: [...tilmeldte], andre: [...andre] };
}
