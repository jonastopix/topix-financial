/**
 * src/lib/samtaleSlots.ts — spejl af supabase/functions/_shared/samtaleSlots.ts
 * (udkast 18/9-2026, rev. 2): Calendlys slots → platformens liste, ren dom.
 *
 * Enhver ændring her SKAL også laves i _shared-udgaven; pariteten (kroppen
 * efter filhovedet, import uden .ts) låses af samtaleSlots.test.ts. Reglerne
 * og målingen står i _shared-udgavens filhoved.
 */
import { erHverdagDato, kbhDato } from "./hverdage";

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
