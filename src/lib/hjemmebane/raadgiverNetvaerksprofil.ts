/**
 * src/lib/hjemmebane/raadgiverNetvaerksprofil.ts
 *
 * Rådgiverens netværksprofil (Jonas 30/9 21:21: «Som rådgiver har vi ikke
 * mulighed for at udfylde oplysninger på vores profil til netværket.»).
 * Rene funktioner — ingen React, ingen Supabase. Testet i
 * __tests__/raadgiverNetvaerksprofil.test.ts; kildeværnet i
 * src/lib/__tests__/raadgiverNetvaerksprofil.guard.test.ts.
 *
 * MÅLT I PROD 30/9 (Lovable, SELECT på pg_policies og member_profiles):
 *   - member_profiles har self-only SELECT/INSERT/UPDATE (auth.uid() =
 *     user_id) for ALLE authenticated — også rådgivere. Ingen RESTRICTIVE
 *     policy, ingen trigger ud over updated_at. Rådgiveren KAN skrive sin
 *     egen række i dag; der manglede kun en flade.
 *   - get_member_directory's rådgivergren (user_roles advisor/admin) læser
 *     mp.linkedin_url, mp.expertise, mp.ask_me_about, mp.working_on — og
 *     sætter company_description (og resten af virksomheden) til NULL.
 *   - Fladen manglede, fordi /settings sender rådgivere til /konto
 *     (Settings.tsx), og /konto kun havde navn, billede og login.
 *   Derfor: INGEN migration, ingen ændring af en SECURITY DEFINER-funktion.
 *
 * HVILKE FELTER (samme som medlemmets, hvor de giver mening):
 *   «Det har jeg været igennem» (ask_me_about) — kortets undertekst for en
 *     rådgiver (company_description er altid NULL i rådgivergrenen) og
 *     profilsidens ord-blok. Samme etiket og grænse som medlemmets, så
 *     profilsiden (PROFIL_FELTER) og kortet ikke skal kende to ord.
 *   LinkedIn og Spidskompetencer — som medlemmets.
 *   IKKE «Det laver vi» — det er companies.description, og rådgiveren har
 *     ingen virksomhed i netværket (RPC'en giver NULL).
 *   IKKE «Det leder jeg efter» — medlemmets bøn til netværket; en rådgiver
 *     er den, der svarer. working_on RØRES ALDRIG af rådgiverens gem
 *     (payloaden har ikke kolonnen, og upsert opdaterer kun de medsendte).
 */

import { PROFIL_GRAENSE, profilFelt, tilGemmevaerdi, type ProfilFelt } from "./netvaerksprofil";

/** Ankeret på /konto — profilsidens «skriv det»-link lander her. */
export const RAADGIVER_PROFIL_ANKER = "netvaerksprofil";
export const RAADGIVER_PROFIL_STI = `/konto#${RAADGIVER_PROFIL_ANKER}`;

/** «Det har jeg været igennem» med rådgiverens hjælpetekst — etiket, nøgle og grænse er medlemmets. */
export const RAADGIVER_VAERET_IGENNEM: ProfilFelt = {
  ...profilFelt("vaeret_igennem"),
  hjaelp:
    "Det medlemmerne kan spørge dig om, fordi du selv har stået i det — ikke en titel. Egne virksomheder, et salg, en krise, et generationsskifte du har været med i.",
  eksempel: "Fx: Har bygget og solgt to virksomheder og siddet i bestyrelser i fem — også dem, der gik galt.",
};

/** Kolonnerne rådgiverens gem skriver — og KUN dem. */
export const RAADGIVER_PROFIL_KOLONNER = ["linkedin_url", "expertise", "ask_me_about"] as const;

export type RaadgiverProfilFelter = {
  linkedin_url: string | null;
  expertise: string[];
  ask_me_about: string | null;
};

/** Gemmeværdien: trimmet, tom → null; tags trimmet, tomme og dubletter væk; teksten klippet til grænsen. */
export function raadgiverProfilPayload(input: {
  linkedin_url: string | null | undefined;
  expertise: readonly string[] | null | undefined;
  ask_me_about: string | null | undefined;
}): RaadgiverProfilFelter {
  const tags: string[] = [];
  for (const t of input.expertise ?? []) {
    const tag = t.trim();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  const tekst = tilGemmevaerdi(input.ask_me_about);
  return {
    linkedin_url: tilGemmevaerdi(input.linkedin_url),
    expertise: tags,
    ask_me_about: tekst === null ? null : tekst.slice(0, PROFIL_GRAENSE.vaeret_igennem),
  };
}

/** Flet et komma-separeret input ind i taglisten (samme regel som /settings). */
export function fletEkspertise(tags: readonly string[], raa: string): string[] {
  let next = [...tags];
  for (const del of raa.split(",")) {
    const tag = del.trim();
    if (tag && !next.includes(tag)) next = [...next, tag];
  }
  return next;
}

/**
 * Må kortet vises på /konto? Rådgiver (isAdvisor dækker admin) — men aldrig
 * en tjenestekonto (claude@topix.dk ser platformen og optræder aldrig som
 * person; src/lib/tjenestekonto.ts). Mens tjenestekonto-opslaget henter
 * eller er fejlet, vises kortet ikke: en maskine må ikke få en skriveflade,
 * fordi et opslag var langsomt (fail-closed).
 */
export function visRaadgiverProfilKort(
  isAdvisor: boolean,
  tjenestekontoStatus: "pending" | "error" | "success",
  erTjenestekonto: boolean | undefined,
): boolean {
  if (!isAdvisor) return false;
  if (tjenestekontoStatus !== "success") return false;
  return erTjenestekonto === false;
}

/** «Du har ikke skrevet hvad du har været igennem.» på rådgiverens EGEN profilside — null når det er skrevet. */
export function raadgiverManglerSaetning(p: { ask_me_about: string | null | undefined }): string | null {
  return tilGemmevaerdi(p.ask_me_about) === null ? `Du har ikke skrevet ${RAADGIVER_VAERET_IGENNEM.mangler}.` : null;
}
