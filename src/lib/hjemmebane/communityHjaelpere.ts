/**
 * src/lib/hjemmebane/communityHjaelpere.ts
 *
 * «Hvem kan hjælpe med …» — «Spørg mig om»-kortene i Community (2/10-2026).
 * Rene funktioner, ingen React, ingen Supabase. Testet i
 * __tests__/communityHjaelpere.test.ts.
 *
 * HVORFOR: «Spørg mig om» (member_profiles.ask_me_about — fladens etiket på
 * profilen er «Det har jeg været igennem», netvaerksprofil.ts) er netværkets
 * nøgle, og den er tom hos 26 af 29 (målt 2/10). Kortene står i Community,
 * hvor folk er — ikke kun bag Medlemmerne. Dit eget tomme kort er synligt,
 * til du skriver.
 *
 * DATA: Netværkets egne rækker (get_member_directory gennem
 * listMemberDirectory — tjenestekonti er filtreret dér, tjenestekonto.ts).
 * Ingen ny RPC, ingen migration.
 *
 * HVEM: medlemmer (ikke rådgivere) med en ikke-tom ask_me_about, aldrig
 * læseren selv. HØJST TRE (HJAELPERE_LOFT) — og ikke de samme tre hver dag:
 * kandidaterne ordnes alfabetisk, og vinduet på tre flyttes én plads pr.
 * dansk kalenderdag (dagsnummeret modulo antallet), så alle med en tekst
 * kommer forbi. Er der tre eller færre, vises alle.
 *
 * DIT EGET KORT: kun for et MEDLEM (rådgiveren retter sin netværksprofil på
 * /konto og har ingen plads her). Tom tekst → «Skriv én linje» med link til
 * profilfanen (profilUdfyldt.PROFIL_STI). Har du skrevet, vises din linje.
 */

import { PROFIL_STI } from "./profilUdfyldt";
import { uddrag } from "./uddrag";

/** Det kortene læser af en MemberProfile — et snit, så testene kan bygge rækker uden hele typen. */
export interface HjaelperProfil {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  ask_me_about: string | null;
  is_advisor: boolean;
}

export const HJAELPERE_LOFT = 3;
/** Én linje i et kort på en tredjedel af bredden. */
export const HJAELPER_MAKS_TEGN = 90;

export const HJAELPERE_EYEBROW = "Hvem kan hjælpe med …";
export const HJAELPERE_LINK_LABEL = "Alle medlemmer";
export const HJAELPERE_LINK_TO = "/medlemmer";
export const SPOERG_MIG_OM_PRAEFIKS = "Spørg mig om:";
export const EGET_KORT_NAVN = "Dig";
export const EGET_KORT_TOM_TEKST = "Du har ikke skrevet, hvad man kan spørge dig om.";
export const EGET_KORT_LINKTEKST = "Skriv én linje";
export const EGET_KORT_LINK_TO = PROFIL_STI;

export interface Hjaelpere<T extends HjaelperProfil> {
  /** Højst HJAELPERE_LOFT andre medlemmer med tekst, dagens vindue. */
  andre: T[];
  /** Læseren selv, når hun er medlem i kataloget — ellers null. */
  mig: T | null;
}

const harTekst = (p: Pick<HjaelperProfil, "ask_me_about">): boolean => (p.ask_me_about ?? "").trim() !== "";

/** Dansk kalenderdag som heltal — samme dag giver samme vindue hele dagen. */
export function dagsnummer(nu: Date): number {
  const dansk = new Date(nu.toLocaleString("en-US", { timeZone: "Europe/Copenhagen" }));
  return Math.floor(Date.UTC(dansk.getFullYear(), dansk.getMonth(), dansk.getDate()) / 86_400_000);
}

export function vaelgHjaelpere<T extends HjaelperProfil>(
  profiler: readonly T[],
  mitUserId: string | null | undefined,
  nu: Date,
  loft = HJAELPERE_LOFT,
): Hjaelpere<T> {
  const medlemmer = profiler.filter((p) => !p.is_advisor);
  const mig = mitUserId ? medlemmer.find((p) => p.user_id === mitUserId) ?? null : null;
  const kandidater = medlemmer
    .filter((p) => p.user_id !== mitUserId && harTekst(p))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "da"));
  if (kandidater.length <= loft) return { andre: kandidater, mig };
  const start = ((dagsnummer(nu) % kandidater.length) + kandidater.length) % kandidater.length;
  const andre: T[] = [];
  for (let i = 0; i < loft; i += 1) andre.push(kandidater[(start + i) % kandidater.length]);
  return { andre, mig };
}

/** Kortets linje: ÉN sætning af ask_me_about, højst HJAELPER_MAKS_TEGN, aldrig klippet midt i et ord. Null uden tekst. */
export function hjaelperLinje(p: Pick<HjaelperProfil, "ask_me_about">): string | null {
  if (!harTekst(p)) return null;
  const u = uddrag(p.ask_me_about, HJAELPER_MAKS_TEGN, 1);
  return u.tekst === "" ? null : u.tekst;
}

/** Skal sektionen tegnes? Ja, når der er mindst ét andet kort ELLER læseren er et medlem (eget kort). */
export function visHjaelpere(h: Hjaelpere<HjaelperProfil>): boolean {
  return h.andre.length > 0 || h.mig !== null;
}
