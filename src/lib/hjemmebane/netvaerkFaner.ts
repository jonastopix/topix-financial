/**
 * src/lib/hjemmebane/netvaerkFaner.ts — Netværket som ÉT sted med faner
 * (seks steder, skridt 2, 2/10-2026; Jonas 2/10: «Fordele» under Netværket
 * — ja; forslagets «Netværket med faner»: «Community som forside, Events,
 * Medlemmerne, Fordele, Anbefal. Ruterne beholdes … fanerne er en skal over
 * dem»).
 *
 * REN dom, ingen React. Fanerne ER menuens fem børn (hbNav.ts
 * NETVAERKETS_BOERN — én liste, så menu og faner aldrig kan hedde to ting),
 * og den aktive fane dømmes af STIEN (stedsSaetninger.netvaerksSti), ikke
 * af `active`: /community/:id er en tråd INDE i Community, men hovedet med
 * fanerne hører KUN til de fem forsider — en underside får intet hoved,
 * ligesom den ingen sætning får. Ruterne er uændrede: /community, /events,
 * /medlemmer, /rabataftaler og /deling er links og mails udefra.
 *
 * HVEM ser fanerne: samme dom som sætningen (visStedsSaetning) — det fulde
 * medlem og en rådgiver i «Se som medlem». Abonnenten har intet Netværk
 * (hun har Rabataftaler som direkte punkt og ser /rabataftaler som før,
 * uden faner); rådgiveren på sine egne flader (/community er også hans
 * Community, /events og /medlemmer står under «Medlemmets flader») ser
 * siderne som før. Fail-closed: null tier = ingen faner.
 *
 * Testet i __tests__/netvaerkFaner.test.ts; låst af seksSteder.guard.
 */

import { NETVAERKETS_BOERN } from "./hbNav";
import { netvaerksSti, visStedsSaetning } from "./stedsSaetninger";

export interface NetvaerkFane {
  label: string;
  to: string;
  aktiv: boolean;
}

/** Netværkshovedets ord — eyebrow og h1 som i forslaget (ia-forslag 1/10:
    eyebrow «Netværket», h1 «Netværket»); sætningen er STEDS_SAETNINGER.netvaerket. */
export const NETVAERK_HOVED = { eyebrow: "Netværket", rubrik: "Netværket" } as const;

/** Fanerne for stien — eller null, når stien ikke er en af Netværkets fem
    forsider. Præcis én fane er aktiv, når listen findes. */
export function netvaerkFaner(pathname: string): NetvaerkFane[] | null {
  const sti = netvaerksSti(pathname);
  if (!sti) return null;
  const faner = NETVAERKETS_BOERN.map((b) => ({ label: b.label, to: b.to, aktiv: b.to === sti }));
  // Netværkets stier er menuens børn — er en sti et Netværks-sted uden en
  // fane, er listerne ude af takt (værnet fælder det); fail-closed her.
  return faner.some((f) => f.aktiv) ? faner : null;
}

/** HVEM ser netværkshovedet med fanerne — samme dom som stedsætningen, og
    af samme grund (stedsSaetninger.visStedsSaetning): fanerne er det fulde
    medlems sted. Én funktion, så de to aldrig kan skilles. */
export const visNetvaerkFaner = visStedsSaetning;
