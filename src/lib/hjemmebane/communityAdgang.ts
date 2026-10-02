/**
 * src/lib/hjemmebane/communityAdgang.ts — gæstens grænse i Community (2/10-2026;
 * Jonas 14/9: «En gæst ser Community, men skriver ikke»; morgenlisten 2/10:
 * «Gæsten læser, skriver ikke (ny læse-dom)»; mangellistens w13).
 *
 * REN: ingen React, ingen Supabase, ingen Date.now — tiden gives ind som `nu`.
 * Hooken bor i src/hooks/communityAdgang.ts; værnet communityGaest.guard holder
 * SQL'ens prædikater (migration 20261002242000) og ordene her i takt.
 *
 * ÉN REGEL, TO STEDER — klientens spejl af de to SQL-domme:
 *   kan_laese_community(uid)  = har_aktivt_medlemskab(uid) OR gæst
 *   har_aktivt_medlemskab(uid) = harAdgangEfterRls (eventSvar.ts — spejlet ordret)
 *   gæst                       = vis_i_netvaerk = false AND is_legat = false AND contract_end_date IS NULL
 * Skrivning (opslag, svar, reaktion) dømmes STADIG af har_aktivt_medlemskab —
 * klienten viser gæsten grænsen i stedet for at lade databasen afvise.
 *
 * HVAD «GÆST» ER (målt 2/10): companies.vis_i_netvaerk = false — kolonnen blev
 * lavet til gæster (20260902110000), rådgiverens formular hedder «Gæst — har
 * adgang til platformen, men vises ikke i Netværket», og Jonas 14/9 kaldte de
 * to virksomheder med flaget «GÆSTER». Snittet med «ingen slutdato» er valgt
 * (migrationens filhoved): en UDLØBET virksomhed med flaget er ikke en gæst.
 */
import { harAdgangEfterRls } from "./eventSvar";

/** Det af companies-rækken dommen læser — samme tre felter som SQL'en. */
export interface VirksomhedTilCommunity {
  vis_i_netvaerk: boolean | null;
  is_legat: boolean;
  contract_end_date: string | null;
}

/** Gæsten: flaget, ikke legat, OG ingen slutdato — alle tre (migration 20261002242000). */
export function erCommunityGaest(v: VirksomhedTilCommunity): boolean {
  return v.vis_i_netvaerk === false && v.is_legat === false && v.contract_end_date === null;
}

/** kan_laese_community: fuldt medlemskab (slutdagen talt med) ELLER gæst i mindst én virksomhed. */
export function kanLaeseCommunity(virksomheder: readonly VirksomhedTilCommunity[], nu: Date): boolean {
  return harAdgangEfterRls(virksomheder, nu) || virksomheder.some(erCommunityGaest);
}

/** har_aktivt_medlemskab — skrivning: uændret, aldrig gæsten. */
export function kanSkriveICommunity(virksomheder: readonly VirksomhedTilCommunity[], nu: Date): boolean {
  return harAdgangEfterRls(virksomheder, nu);
}

/**
 * Grænsen som fladen viser den — i stedet for composeren, aldrig som en fejl
 * (w13: «en gæst skal møde en grænse, ikke en fejl»). Ét sted; feedet og
 * trådsiden viser den samme.
 */
export const GAEST_LAESER_TEKST = "Som gæst kan du læse med — opslag, svar og reaktioner er for medlemmer.";

/**
 * Hvad fladen gør med gæsten — én dom for feedet, trådsiden og tjeklisten:
 *   null  → ukendt endnu (henter): composeren vises ikke, grænsen heller ikke
 *   true  → gæst: ingen composer, ingen like, grænsen vises; tjeklistens «Præsentér dig» udgår
 *   false → som i dag
 */
export type GaestDom = boolean | null;

export function visComposer(gaest: GaestDom): boolean {
  return gaest === false;
}
export function visGaestGraense(gaest: GaestDom): boolean {
  return gaest === true;
}
