/**
 * afslagsTilbud — det et nej bliver til (Jonas 17/9 nat, 18/9): pladsen i
 * køen («I står nummer N i køen til pladsen i jeres niche»). Rene domme til
 * afslagsmailen og ansøgningens side. Spejl: src/lib/afslagsTilbud.ts
 * (kroppen efter filhovedet er ordret ens; pariteten låses af
 * afslagTilbud.guard.test.ts).
 *
 * KØ-NUMMERET er C's dom (ventelisteDom.sorterKoe: ældst afvist først, så
 * sat_at, så id) — regnet over ALLE levende pladser hos den virksomhed, så
 * mailen og siden siger det samme tal som rådgiverens venteliste.
 *
 * TO TEKSTER, TO LÆSERE (Jonas 18/9): rådgiveren ser virksomheden ved navn
 * (koeTekstTilRaadgiver). Ansøgeren får KUN nummeret (koeSaetningTilAnsoeger)
 * — «Det fortæller en fremmed hvem vores kunde er, og hvem deres konkurrent
 * er.» Ansøgerens tekst tager en type UDEN navnet (KoeNummer), så navnet ikke
 * kan slippe med ved et uheld; mailbyggeren kender ikke rådgiverteksten.
 *
 * ABONNEMENTET «Dine tal» er taget helt ud (Jonas 18/9: «Det skal slet ikke
 * nævnes») — README'en siger hvad der skal til, hvis det kobles på senere.
 */
import { sorterKoe, type VentepladsRaekke } from "./ventelisteDom.ts";

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
