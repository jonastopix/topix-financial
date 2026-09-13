/**
 * betalKvittering — dommen over /betal i øjeblikket EFTER en betaling.
 *
 * FEJLEN (fund A, recon-de-nye-medlemmer.md §4, 14/9): Stripe sender
 * ansøgeren tilbage til /betal?token=…&betalt=1 i samme øjeblik betalingen
 * er gennemført (opret-indgangs-checkout/index.ts:114), mens stripe-webhook,
 * der skriver companies.contract_end_date, fyrer selvstændigt. Siden læste
 * aldrig `betalt` og slog status op ÉN gang: var webhooken ikke landet, sagde
 * hent_betalingstilbud 'afventer_betaling', og ansøgeren så betalingsskærmen
 * IGEN med tre aktive knapper — lige efter at have betalt op til 50.000 kr.
 * Et klik gav en NY Checkout-session (eller en 403-toast, hvis webhooken
 * nåede at lande imens).
 *
 * FORLÆG: fornyelses-låsen i src/pages/Index.tsx:30-55 og
 * FornyelseKvittering.tsx — samme kapløb, samme to tilstande («venter» og
 * «overskredet»), samme tal (3 s mellem forsøg, 30 s vindue), og samme lære:
 * grænsen er STATE med sin egen timer, aldrig en beregning ved render.
 * Forskellen: Betal ejer sit eget rpc-opslag og kan hente stille uden reload.
 *
 * HINTET ER IKKE BEVIS. `betalt=1` er en fast streng i URL'en og kan skrives
 * af hvem som helst. Derfor afgør det ALDRIG dommen «betalt» — den kommer
 * kun fra databasen (contract_end_date + 1 > now(), 20260911050000). Hintet
 * vælger kun VENTESKÆRMEN: uden knapper, med en ærlig udgang. En der skriver
 * parameteren selv, får ingen adgang, ingen invitation, og kan fjerne den og
 * betale. Skal hintet en dag være bevis, er vejen {CHECKOUT_SESSION_ID} i
 * success_url + et serverside-opslag hos Stripe — uden for denne fil.
 *
 * Ren og testet (src/lib/__tests__/betalKvittering.test.ts); Betal.tsx låses
 * til dommen af betalKvittering.guard.test.ts.
 */

/** URL-parameteren opret-indgangs-checkout sætter i success_url — og KUN dér. */
export const BETALT_PARAM = "betalt";

/** Pause mellem to stille opslag, mens webhooken skriver (FORNYELSE_RETRY_MS). */
export const KVITTERING_RETRY_MS = 3_000;

/** Vinduet vi venter i, før siden siger at bekræftelsen mangler (FORNYELSE_GRAENSE_MS). */
export const KVITTERING_GRAENSE_MS = 30_000;

/** Sidens opslagstilstande uden svar (spejler Opslag i Betal.tsx) plus SQL'ens fem statusser. */
export type KvitteringsStatus =
  | "henter"
  | "ukendt"
  | "fejl"
  | "betalt"
  | "afventer_pris"
  | "klar_til_mail"
  | "afventer_betaling"
  | "frist_overskredet";

/**
 *   ingen        Hintet er ikke sat, eller dommen er faldet — siden viser sine
 *                egne skærme (herunder «Tak — du er inde» ved 'betalt').
 *   bekraefter   Hintet er sat, databasen siger endnu ikke betalt, vinduet er
 *                åbent: «Tak — vi bekræfter din betaling», ingen knapper,
 *                siden henter stille igen.
 *   ubekraeftet  Vinduet er lukket uden 'betalt': en ærlig skærm — ikke
 *                betalingsknapperne, som om intet var sket.
 */
export type KvitteringsVisning = "ingen" | "bekraefter" | "ubekraeftet";

/** ?betalt=1 → true. Alt andet (null, "", "0", "true", "yes") → false — kun det checkout skriver. */
export function laesBetaltHint(raa: string | null | undefined): boolean {
  return raa === "1";
}

export function afgoerKvittering(input: {
  betaltHint: boolean;
  status: KvitteringsStatus;
  overskredet: boolean;
}): KvitteringsVisning {
  if (!input.betaltHint) return "ingen";
  // Dommen er faldet: databasen siger betalt. Skærm 7 i Betal.tsx ER
  // kvitteringen («Tak — du er inde», med login-mailen).
  if (input.status === "betalt") return "ingen";
  // Tokenet findes ikke (null fra hent_betalingstilbud). Et opslag mere
  // ændrer intet, og en kvittering på et ukendt link ville være at digte:
  // siden viser «Vi kan ikke finde det link» som ellers.
  if (input.status === "ukendt") return "ingen";
  // Alt andet — henter, fejl (netværket kan blinke lige efter Stripe),
  // afventer_betaling (webhooken er ikke landet), og de øvrige — er «vi
  // venter på webhooken» inden for vinduet, og «bekræftelsen mangler» efter.
  return input.overskredet ? "ubekraeftet" : "bekraefter";
}

/** Der hentes stille igen så længe vi bekræfter — og kun da. */
export function skalHenteIgen(visning: KvitteringsVisning): boolean {
  return visning === "bekraefter";
}
