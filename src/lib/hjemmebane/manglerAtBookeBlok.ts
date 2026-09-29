/**
 * src/lib/hjemmebane/manglerAtBookeBlok.ts — forsidens «Mangler at booke»
 * (29/9-2026). Ren: ingen React, ingen Supabase.
 *
 * JONAS 29/9 (ordret): «Jeg vil gerne have et simpelt overblik over hvem og
 * hvor mange der mangler at booke. Der behøver ikke stå ikke omfattet osv.
 * Jeg skal bare vide hvor mange der mangler. Vi skal ikke komplicere unødigt.»
 *
 * To linjer — «Morten-session: N» og «Jonas-session: M» — og under hver
 * virksomhedernes navne. N = 0 → «Morten-session: Alle har booket.» Ingen
 * andre ord: ingen statusord pr. virksomhed, ingen mærker.
 *
 * DOMMEN er motorens manglerAtBooke (lib/medlemsOverblik) — her tælles og
 * sorteres der kun. Ingen egen sessionsregel (værn: medlemsOverblikFlade.guard).
 */
import { manglerAtBooke, type OverbliksRaekke } from "@/lib/medlemsOverblik";

export const MANGLER_OVERSKRIFT = "Mangler at booke";
export const ALLE_HAR_BOOKET = "Alle har booket.";

export interface ManglerVirksomhed {
  id: string;
  navn: string;
}

export interface ManglerLinje {
  raadgiver: "morten" | "jonas";
  tekst: string;
  virksomheder: ManglerVirksomhed[];
}

const ETIKET: Readonly<Record<ManglerLinje["raadgiver"], string>> = {
  morten: "Morten-session",
  jonas: "Jonas-session",
};

/** De to linjer, i den rækkefølge: Morten, så Jonas. Navnene sorteret som /virksomheder (dansk). */
export function manglerAtBookeLinjer(raekker: Iterable<OverbliksRaekke>): ManglerLinje[] {
  const liste: Record<ManglerLinje["raadgiver"], ManglerVirksomhed[]> = { morten: [], jonas: [] };
  for (const r of raekker) {
    const mangler = manglerAtBooke(r);
    if (mangler.morten) liste.morten.push({ id: r.companyId, navn: r.navn });
    if (mangler.jonas) liste.jonas.push({ id: r.companyId, navn: r.navn });
  }
  return (["morten", "jonas"] as const).map((raadgiver) => {
    const virksomheder = [...liste[raadgiver]].sort((a, b) => a.navn.localeCompare(b.navn, "da"));
    const antal = virksomheder.length;
    return { raadgiver, tekst: `${ETIKET[raadgiver]}: ${antal === 0 ? ALLE_HAR_BOOKET : antal}`, virksomheder };
  });
}
