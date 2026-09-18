/**
 * samtaleSlots — de ledige tider til afklaringssamtalen, med CALENDLY som den
 * ene sandhed (udkast 18/9-2026, rev. 2 efter Jonas: «Calendly er i dag
 * synkroniseret med Jonas' Google-kalender BEGGE VEJE»). Ren dom, ingen IO.
 * Spejl: src/lib/samtaleSlots.ts (paritet låses af samtaleSlots.test.ts).
 *
 * MÅLT 18/9 (Calendly API, Jonas' konto): eventtypen «Afklaringssamtale»
 * (30 min, Google Meet, ét påkrævet spørgsmål «Virksomhed»); arbejdstiderne
 * mandag 09.30–16, tirsdag/onsdag 09–16, torsdag 09–15, fredag ingen —
 * præcis de tider Jonas sendte. event_type_available_times giver de
 * bookbare slots FÆRDIGREGNET: hans Google-aftaler, Calendly-events, buffere
 * og varsel er allerede trukket fra. Derfor har platformen INGEN egne
 * vinduer eller blokeringer (rev. 1's raadgiver_samtaletider/raadgiver_
 * optaget udgik — en kopi ville drive fra hans kalender).
 *
 * DET PLATFORMEN LÆGGER OVENPÅ (denne fil): (1) danske helligdage — Calendly
 * kender dem kun hvis de står i kalenderen (erHverdagDato); (2) varsel 4 t og
 * horisont 60 dage som VORES vindue mod Calendly (Jonas 18/9); (3) slots der
 * allerede er booket i platformen men endnu ikke synlige i Calendly (bælte
 * og seler — UNIQUE-indekset på samtale_start er databasens værn).
 * Calendlys svar hentes i vinduer af højst 7 dage (API'ets grænse) —
 * vinduerForCalendly regner dem.
 */
import { erHverdagDato, kbhDato } from "./hverdage.ts";

/** Én rådgiver tager afklaringssamtalerne (Jonas D4). */
export const SAMTALE_ADVISOR = "jonas";
export const SAMTALE_VARIGHED_MIN = 30;
/** Jonas 18/9: 4 timer, ikke 24. */
export const SAMTALE_VARSEL_TIMER = 4;
/** Jonas 18/9: 60 dage, ikke 42. */
export const SAMTALE_HORISONT_DAGE = 60;
/** Calendlys grænse: start_time–end_time højst 7 dage pr. kald. */
export const CALENDLY_VINDUE_DAGE = 7;
/** Calendlys spørgsmål på eventtypen — svaret er ansøgerens virksomhed (målt 18/9: påkrævet, position 0). */
export const CALENDLY_SPOERGSMAAL_VIRKSOMHED = "Virksomhed";

/** Ét slot som Calendly giver det (event_type_available_times). */
export interface CalendlySlot {
  start_time: string;
  status: string;
  invitees_remaining?: number;
}

export interface SlotFilterInput {
  calendly: readonly CalendlySlot[];
  /** Starttider (ISO) der allerede er booket i platformen (trin booket) — egen ansøgning undtaget ved flytning. */
  platformBooket: readonly string[];
  nu: Date;
  varselTimer?: number;
  horisontDage?: number;
}

const iso = (s: string): string | null => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/** Calendlys slots → platformens liste: kun «available», inden for varsel/horisont, hverdage (danske helligdage fra), ikke booket her. Sorteret, uden dubletter. */
export function filtrerSamtaleSlots(i: SlotFilterInput): string[] {
  const varsel = i.varselTimer ?? SAMTALE_VARSEL_TIMER;
  const horisont = i.horisontDage ?? SAMTALE_HORISONT_DAGE;
  const tidligst = i.nu.getTime() + varsel * 3_600_000;
  const senest = i.nu.getTime() + horisont * 86_400_000;
  const booket = new Set(i.platformBooket.map(iso).filter((x): x is string => x !== null));
  const ud = new Set<string>();
  for (const s of i.calendly) {
    if (s.status !== "available") continue;
    const start = iso(s.start_time);
    if (!start) continue;
    const t = Date.parse(start);
    if (t < tidligst || t > senest) continue;
    if (!erHverdagDato(kbhDato(new Date(t)))) continue;
    if (booket.has(start)) continue;
    ud.add(start);
  }
  return [...ud].sort();
}

/** Er netop dette starttidspunkt ledigt? Serveren regner selv — klientens liste er et forslag. */
export function erSlotLedig(startIso: string, i: SlotFilterInput): boolean {
  const s = iso(startIso);
  return s !== null && filtrerSamtaleSlots(i).includes(s);
}

/** Vinduerne mod Calendly: [nu, nu + horisont] delt i stykker af højst 7 dage — hentes parallelt. */
export function vinduerForCalendly(nu: Date, horisontDage: number = SAMTALE_HORISONT_DAGE, vindueDage: number = CALENDLY_VINDUE_DAGE): Array<{ fra: string; til: string }> {
  const ud: Array<{ fra: string; til: string }> = [];
  const slut = nu.getTime() + horisontDage * 86_400_000;
  // Calendly afviser start_time i fortiden — start ét minut frem.
  let fra = nu.getTime() + 60_000;
  while (fra < slut) {
    const til = Math.min(fra + vindueDage * 86_400_000, slut);
    ud.push({ fra: new Date(fra).toISOString(), til: new Date(til).toISOString() });
    fra = til;
  }
  return ud;
}

export function slutAf(startIso: string, varighedMin: number = SAMTALE_VARIGHED_MIN): string {
  return new Date(new Date(startIso).getTime() + varighedMin * 60_000).toISOString();
}

/** Slots grupperet pr. dansk dato, i rækkefølge. */
export function grupperPrDag(slots: readonly string[]): Array<{ dato: string; slots: string[] }> {
  const m = new Map<string, string[]>();
  for (const s of slots) {
    const dato = kbhDato(new Date(s));
    if (!m.has(dato)) m.set(dato, []);
    m.get(dato)!.push(s);
  }
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([dato, ss]) => ({ dato, slots: ss.sort() }));
}
