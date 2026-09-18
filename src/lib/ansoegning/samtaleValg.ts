/**
 * src/lib/ansoegning/samtaleValg.ts — tidsvælgerens rene domme (udkast 18/9):
 * slots (ISO fra serveren) → dage med tider i dansk tid, med ord. Ingen
 * React, ingen IO. Bruges af både ansøgerens side og rådgiverens «Samtalen».
 */
import { grupperPrDag } from "@/lib/samtaleSlots";

export const TZ = "Europe/Copenhagen";

export interface Tidsvalg {
  iso: string;
  /** «09.00» */
  tid: string;
}
export interface Dagsvalg {
  dato: string;
  /** «mandag 21. september» */
  label: string;
  tider: Tidsvalg[];
}

/** «09.00» i dansk tid. sv-SE giver «09:00» stabilt på tværs af ICU — vi skriver punktum selv (huset: «kl. 09.00»). */
export function tidOrd(iso: string): string {
  return new Date(iso).toLocaleTimeString("sv-SE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).replace(":", ".");
}

/** «mandag 21. september» (ugedag i små bogstaver, som huset skriver). */
export function dagOrd(dato: string): string {
  const d = new Date(`${dato}T12:00:00Z`);
  return new Intl.DateTimeFormat("da-DK", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
}

/** «mandag den 21. september kl. 09.00» — samme form som mailenes formaterSamtaletid. */
export function samtaleOrd(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dag = new Intl.DateTimeFormat("da-DK", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
  return `${dag.replace(/^(\S+) /, "$1 den ")} kl. ${tidOrd(iso)}`;
}

/** Slots → dage i rækkefølge, hver med sine tider. Ugyldige/dubletter falder væk gennem grupperPrDag. */
export function dageMedTider(slots: readonly string[]): Dagsvalg[] {
  return grupperPrDag(slots).map((d) => ({ dato: d.dato, label: dagOrd(d.dato), tider: d.slots.map((iso) => ({ iso, tid: tidOrd(iso) })) }));
}

/** Den dag der vises først: den valgte tids dag, ellers den første med tider. */
export function startDag(dage: readonly Dagsvalg[], valgtIso: string | null): string | null {
  if (valgtIso) {
    const d = dage.find((x) => x.tider.some((t) => t.iso === valgtIso));
    if (d) return d.dato;
  }
  return dage[0]?.dato ?? null;
}

/** Knappens ord: «Book mandag den 21. september kl. 09.00» / «Flyt til …». */
export function bekraeftOrd(art: "book" | "flyt", valgtIso: string | null): string {
  if (!valgtIso) return art === "book" ? "Vælg et tidspunkt" : "Vælg en ny tid";
  return `${art === "book" ? "Book" : "Flyt til"} ${samtaleOrd(valgtIso)}`;
}
