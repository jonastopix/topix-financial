/**
 * src/lib/tjenestekonto.ts — tjenestekonti (30/9-2026, Jonas' ja kl. 10:01).
 *
 * En tjenestekonto er en rådgiverkonto, som en maskine bruger til at SE
 * platformen (claude@topix.dk i Claude-appens browser — KUN læsning). Den
 * står i tabellen public.tjenestekonti (migration 20260930140000; kun admin
 * skriver, enhver indlogget læser user_id).
 *
 * TRE DOMME, alle rene (ingen React, ingen Supabase):
 *
 *   erSynligRaadgiver / synligeRaadgivere — kontoen kan SE alt, en rådgiver
 *     ser, men OPTRÆDER aldrig som en person: ikke i netværket, ikke i «Dine
 *     rådgivere», ikke i vælgere (opgaver, værter, pushets
 *     afsender), ikke i @-nævnelser. Filtret sker i klienten, fordi kilderne
 *     (get_all_advisor_profiles, get_member_directory, get_community_medlemmer)
 *     er SECURITY DEFINER og ikke må ændres (CLAUDE.md FORBIDDEN).
 *     Steder, der bruger rådgiverlisten som ROLLE (hvem er rådgiver → tæller
 *     ikke som medlem: svartid, ubesvarede opslag, online, «Kunne du bruge
 *     den?») eller som OPSLAG pr. id (navnet på den, der gjorde noget), filtrerer
 *     BEVIDST ikke: fjernes kontoen dér, bliver den et medlem i tallene. Hvert
 *     sted står i kildeværnet (tjenestekonto.guard) med sin grund.
 *
 *   laeseMarkeringTilladt — det at SE skriver intet spor fra en tjenestekonto
 *     (læst, set, visning, login-log). Stederne står i kildeværnet (dom 6).
 *
 *   inaktivitetsLogudAktiv — logud efter inaktivitet gælder alle UNDTAGEN en
 *     tjenestekonto. Fail-safe: kan tabellen ikke læses, gælder den normale
 *     regel. Mens svaret hentes, venter reglen: useInactivityLogout logger en
 *     session med et gammelt aktivitetsstempel ud i samme øjeblik, den slås
 *     til, og en tjenestekonto har netop et gammelt stempel.
 */

export interface MedBrugerId {
  user_id?: string | null;
}

/** Tabellens rækker → mængden af tjenestekonto-id'er (rækker uden id springes over). */
export function tjenestekontoIds(rows: readonly MedBrugerId[] | null | undefined): Set<string> {
  const ud = new Set<string>();
  for (const r of rows ?? []) if (r.user_id) ud.add(r.user_id);
  return ud;
}

/** Må denne rådgiver vises som person? Nej for en tjenestekonto og for en række uden id. */
export function erSynligRaadgiver(userId: string | null | undefined, tjenestekonti: ReadonlySet<string>): boolean {
  return !!userId && !tjenestekonti.has(userId);
}

/** Rækkerne uden tjenestekonti (og uden rækker uden id) — rækkefølgen bevares. */
export function synligeRaadgivere<T extends MedBrugerId>(rows: readonly T[] | null | undefined, tjenestekonti: ReadonlySet<string>): T[] {
  return (rows ?? []).filter((r) => erSynligRaadgiver(r.user_id, tjenestekonti));
}

/** react-querys status for opslaget «er jeg en tjenestekonto?». */
export type TjenestekontoStatus = "pending" | "error" | "success";

/**
 * Skal inaktivitets-logud være slået til?
 *   ingen bruger         → nej
 *   et ja står           → nej (også når en GENHENTNING fejlede: react-query
 *                          sætter status "error", men bevarer data — et
 *                          tidligere ja står ved magt, ellers ville kontoen
 *                          logges ud i samme øjeblik, et genopslag fejler)
 *   opslaget henter      → nej (vent — se filhovedet)
 *   opslaget fejlede     → JA (fail-safe: den normale regel)
 *   ellers               → ja
 */
export function inaktivitetsLogudAktiv(harBruger: boolean, status: TjenestekontoStatus, erTjenestekonto: boolean | undefined): boolean {
  if (!harBruger) return false;
  if (erTjenestekonto === true) return false;
  if (status === "pending") return false;
  return true; // "error" uden et ja → den normale regel; "success" uden ja → ja
}

/**
 * Må det at SE noget skrive et spor, andre kan se (læst-markeringer, «set»-
 * stempler, visninger, notifikationer markeret læst, login-loggen)? En
 * tjenestekonto KIGGER — medlemmet må ikke se «læst», fordi Claude åbnede
 * samtalen, og rådgivernes ulæst-tællere må ikke nulstilles af den.
 *   ingen bruger         → nej (intet at skrive for)
 *   et ja står           → nej (også ved en fejlet genhentning, som ovenfor)
 *   opslaget henter      → nej (vent; stederne genkører, når svaret kommer)
 *   opslaget fejlede     → JA (den normale regel: en ulæselig tabel må ikke
 *                          stoppe læst-markeringen for ALLE rådgivere og
 *                          medlemmer — prisen er, at en tjenestekonto, hvis
 *                          ALLERFØRSTE opslag fejler, markerer som alle andre)
 *   ellers               → ja
 */
export function laeseMarkeringTilladt(harBruger: boolean, status: TjenestekontoStatus, erTjenestekonto: boolean | undefined): boolean {
  if (!harBruger) return false;
  if (erTjenestekonto === true) return false;
  if (status === "pending") return false;
  return true;
}
