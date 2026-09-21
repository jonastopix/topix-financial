/**
 * src/lib/afslagsTilbud.ts — spejl af supabase/functions/_shared/afslagsTilbud.ts
 * (18/9-2026): pladsen i køen i ord — rådgiverens tekst med navn, ansøgerens uden.
 *
 * Enhver ændring her SKAL også laves i _shared-udgaven; pariteten (kroppen
 * efter filhovedet, import uden .ts) låses af afslagTilbud.guard.test.ts.
 * Begrundelserne står i _shared-udgavens filhoved.
 */
import { sorterKoe, type VentepladsRaekke } from "./ventelisteDom";

/** Nummeret i køen hos én virksomhed (1 = først), eller null når ansøgningen ikke står i den kø som «venter». */
export function koeNummer(pladserHosVirksomheden: readonly VentepladsRaekke[], ansoegningId: string): number | null {
  const i = sorterKoe(pladserHosVirksomheden).findIndex((r) => r.ansoegning_id === ansoegningId);
  return i === -1 ? null : i + 1;
}

/** Ansøgerens plads set af RÅDGIVEREN: virksomheden ved navn. */
export interface Venteplads {
  virksomhed: string;
  nummer: number;
  /** Én linje: hvorfor de venter på netop den plads (rådgiverens ord) — vises kun for rådgivere. */
  hvorfor: string | null;
}

/** «nummer 2 i køen til pladsen hos Homie» / «først i køen til pladsen hos Homie» — KUN til rådgiverens side. */
export function koeTekstTilRaadgiver(p: Venteplads): string {
  return `${nummerOrd(p.nummer)} i køen til pladsen hos ${p.virksomhed}`;
}

/** Ansøgerens plads set af ANSØGEREN: kun nummeret — navnet findes ikke i typen. */
export interface KoeNummer {
  nummer: number;
}

function nummerOrd(n: number): string {
  return n === 1 ? "først" : `nummer ${n}`;
}

/** «I står nummer 2 i køen til pladsen i jeres niche»; flere køer: «I står i kø til 2 pladser i jeres niche: først og nummer 3». Tom liste → tom streng. */
export function koeSaetningTilAnsoeger(pladser: readonly KoeNummer[]): string {
  if (pladser.length === 0) return "";
  if (pladser.length === 1) return `I står ${nummerOrd(pladser[0].nummer)} i køen til pladsen i jeres niche`;
  const ord = pladser.map((p) => nummerOrd(p.nummer));
  return `I står i kø til ${pladser.length} pladser i jeres niche: ${ord.slice(0, -1).join(", ")} og ${ord[ord.length - 1]}`;
}

export interface AfslagsIndhold {
  /** Grunden bag nej'et som ansøgeren læser den. */
  grundTekst: string;
  /** Pladserne i kø (0, 1 eller flere) — kun numre. */
  ventepladser: KoeNummer[];
  /** Var der en samtale (lukkeaarsag afslag_efter_samtale)? Styrer «tak for snakken». */
  efterSamtale: boolean;
}

/** Ansøgerens ord for grunden — aldrig «niche»/«for_tidligt» råt. */
export function grundTekst(grund: string | null): string {
  if (grund === "niche") return "Vi har allerede et medlem, der arbejder med de samme kunder som jer — og i The Boardroom sidder der kun én i hver niche.";
  if (grund === "for_tidligt") return "Vi tror, det er lidt for tidligt: The Boardroom giver mest, når der er drift og tal at arbejde med — og det tror vi kommer.";
  return "Vi har vurderet, at The Boardroom ikke er det rigtige for jer lige nu.";
}

/**
 * Nummeret en NY plads får hos en virksomhed — bagest. sorterKoe tæller kun
 * pladser med status «venter», ældst afvist først, og den, der lukkes nu, er
 * den seneste; koeNummer for den nye række bliver derfor antal ventende + 1
 * (en «tilbudt» plads står uden for køen). Bruges af dialogens forhåndsvisning,
 * som ikke kan spørge køen, før pladsen er sat. Bevist mod koeNummer/sorterKoe
 * i afslagLuk.test.ts.
 */
export function koeNummerForNy(ventendeHosVirksomheden: number): number {
  return Math.max(0, Math.floor(ventendeHosVirksomheden)) + 1;
}

export interface AfslagsMailInput {
  fornavn: string | null;
  virksomhedsnavn: string;
  afslag: AfslagsIndhold;
}

export interface AfslagsMailTekst {
  emne: string;
  /** Brødteksten, ét afsnit pr. streng — uden ramme, hilsen og footer (dem lægger ansoegningRykkerMails på). */
  afsnit: string[];
}

/**
 * Afslagsmailens emne og afsnit — ÉN bygger for det, der SENDES
 * (ansoegningRykkerMails.ts, BYGGERE["ansoegning-afslag"]) og det, rådgiveren
 * SER i dialogen før trykket (AnsoegningHandlinger.tsx). Så kan forhånds-
 * visningen ikke afvige fra mailen: samme kode, samme ord. «tak for snakken»
 * står KUN efter en samtale; køsætningen kun med pladser; det siddende medlem
 * nævnes aldrig (typen KoeNummer har intet navn).
 */
export function afslagsMailTekst(i: AfslagsMailInput): AfslagsMailTekst {
  const a = i.afslag;
  const hej = i.fornavn ? `Hej ${i.fornavn}` : "Hej";
  const tak = a.efterSamtale
    ? `Tak for din ansøgning for ${i.virksomhedsnavn} — og tak for snakken.`
    : `Tak for din ansøgning for ${i.virksomhedsnavn}.`;
  const afsnit = [`${hej},`, `${tak} Vi må sige nej denne gang. ${a.grundTekst}`.trim()];
  if (a.ventepladser.length > 0) {
    afsnit.push(`Men vi vil gerne have jer med, når der bliver plads: ${koeSaetningTilAnsoeger(a.ventepladser)}. Bliver pladsen ledig, skriver vi til dig — så har du syv dage til at sige ja, før den går videre til den næste.`);
  }
  afsnit.push("Har du spørgsmål, så svar bare på denne mail.");
  return {
    emne: a.ventepladser.length > 0 ? "Vores svar på din ansøgning — og din plads i køen" : "Vores svar på din ansøgning",
    afsnit,
  };
}
