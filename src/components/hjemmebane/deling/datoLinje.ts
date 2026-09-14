/**
 * «Optaget {dato}» — én linje, tre layouts (14/9). Jonas: «Det kunne godt
 * være en tekst folk ikke er interesseret i står der. Så den skal simpelthen
 * være mulig at fjerne.»
 *
 * SÅDAN FJERNES DEN UDEN AT LAYOUTET BRÆKKER: i alle tre layouts flyder
 * overskriften EFTER datolinjen i en flex-kolonne (3a/3c: topblokken, som er
 * absolut placeret fra toppen, men indholdet i den flyder; 3b: hele
 * kolonnen flyder — label, overskrift, portræt, navn, logokort). Fjernes
 * elementet, rykker alt under det op med linjens højde + gap. Derfor
 * fjernes TEKSTEN, ikke boksen: linjen beholder sin højde (et hårdt
 * mellemrum) og sættes visibility: hidden, så intet flytter sig, og
 * html2canvas tegner den ikke. Tom dateLabel = skjult; det er også svaret
 * når virksomheden ingen contract_start_date har (aldrig en gættet dato).
 */
import type { CSSProperties } from "react";
import { TEKSTER } from "@/lib/delingskreativ";

export const harDato = (dateLabel: string | null | undefined): boolean => (dateLabel ?? "").trim() !== "";

/** Teksten i linjen — eller et hårdt mellemrum, så højden bevares. */
export const datoLinje = (dateLabel: string | null | undefined): string =>
  harDato(dateLabel) ? `${TEKSTER.optaget} ${(dateLabel ?? "").trim()}` : " ";

/** visibility: hidden når der ingen dato er — boksen står, teksten er væk. */
export const datoLinjeStil = (dateLabel: string | null | undefined): CSSProperties =>
  harDato(dateLabel) ? {} : { visibility: "hidden" };
