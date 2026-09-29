/**
 * src/lib/hjemmebane/overblikOrd.ts — medlemsoverblikkets ord (29/9-2026).
 *
 * FORENKLET 29/9 (Jonas: «Det her overblik er virkelig blevet noget rod … Jeg
 * skal bare vide hvor mange der mangler.»): /virksomheder er tilbage som før
 * #1122 — ingen kolonner, prikker, chips, ?maerke=-filter eller «Overblik»-
 * sortering. Ordene til dem er fjernet herfra (sessionOrd, prikTitle,
 * sidstTekst, FELT_ORD, laesMaerkeParam, maerkeOverskrift, tomMaerkeTekst …).
 *
 * TILBAGE er kun det, der har en bruger (grep 29/9): mærkernes ord og
 * ?maerke=-parameteren, som statusmailens spejl (_shared/statusMail.ts) og
 * dens prøve (__tests__/statusMail.test.ts) læser — statusmailen er sat på
 * pause på en anden gren, men dens kode og prøve ligger på main.
 */
import { FILTER_MAERKER, MAERKE_ORD } from "@/lib/medlemsOverblik";

// Mærkernes ord og de fire filtre bor i MOTOREN (29/9, statusmailen læser dem
// gennem Deno-spejlet) — her kun re-eksporteret. Ingen tredje kopi.
export { FILTER_MAERKER, MAERKE_ORD };

/** Parameteren, statusmailens links bærer (_shared/statusMail.ts: maerkeLink). */
export const MAERKE_PARAM = "maerke";
