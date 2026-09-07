/**
 * fornyelsesOrd — fornyelsens ord på en skærm, ét sted.
 *
 * BESLUTNINGEN (Jonas 7/9): `company_fornyelse.beslutning` er en instruks
 * til systemet («tilbyd» / «tilbyd_ikke»), ikke dansk. Set på skærm efter
 * #700: «Besluttet: tilbyd · 2. sep. 2026». Værdierne hedder nu «vi
 * tilbyder» og «vi tilbyder ikke» — og de hedder det SAMME i Aftalen-kortet
 * (VirksomhedView), i FornyelsesSektion på /members og i forsidens dom.
 * Ordene er forskellige to steder, er det værre end at de er forkerte ét.
 *
 * BADGET: motoren (afgoerFornyelsestilstand) kender ikke varslerne — den
 * siger `klar_til_tilbud` også efter at fornyelsesvarsel-cron har sendt
 * varsel 1 og stemplet `varsel_1_sendt_at`. Forsidens dom lægger stemplet
 * VED SIDEN AF motoren (forsidensDom.ts, grundFraFornyelse: «Varslet er
 * sendt» med egen signaltype klar_til_tilbud_varslet). Samme greb her:
 * `fornyelsesBadge` giver badgets nøgle ud fra status + stempel, og
 * motoren røres ikke.
 */
import type { Fornyelsesbeslutning, FornyelseStatus } from "@/lib/fornyelse";
import { afgoerVarselTrin } from "@/lib/varselTrin";

export const BESLUTNINGS_ORD: Record<Fornyelsesbeslutning, string> = {
  tilbyd: "vi tilbyder",
  tilbyd_ikke: "vi tilbyder ikke",
};

/** Beslutningens ord på skærmen. Alt andet end «tilbyd» læses som «vi
    tilbyder ikke» — samme dom som de to flader havde inline før 7/9. */
export function beslutningsOrd(beslutning: string | null | undefined): string {
  return beslutning === "tilbyd" ? BESLUTNINGS_ORD.tilbyd : BESLUTNINGS_ORD.tilbyd_ikke;
}

/** Badgets nøgle: motorens status, plus to trin motoren ikke kender —
    varsel 1 sendt, og påmindelsen (varsel 2) sendt. */
export type FornyelseBadge = FornyelseStatus | "klar_til_tilbud_varslet" | "klar_til_tilbud_paamindet";

/** Samme regel som forsidens dom (lib/varselTrin, ÉN regel): KUN
    klar_til_tilbud + stempel bliver til et varslet trin — varsel 2 vinder
    over varsel 1 (CARMA 7/9: kun varsel 2 sat, badget sagde «Klar til
    tilbud»). For andre statusser siger stemplerne intet nyt (udløbet er
    udløbet, uanset om der gik et varsel). */
export function fornyelsesBadge(
  status: FornyelseStatus,
  varsel1SendtAt: string | null | undefined,
  varsel2SendtAt: string | null | undefined = null,
): FornyelseBadge {
  if (status !== "klar_til_tilbud") return status;
  const trin = afgoerVarselTrin(varsel1SendtAt, varsel2SendtAt);
  return trin === "varsel_2" ? "klar_til_tilbud_paamindet" : trin === "varsel_1" ? "klar_til_tilbud_varslet" : status;
}
