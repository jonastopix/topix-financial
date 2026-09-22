/**
 * webinarAfmelding — den rene dom: er DENNE eWebinar-besked en afmelding?
 * (udkast 22/9-2026, ~/Downloads/recon-ewebinar-afmelding.md)
 *
 * BESLUTTET (Jonas 22/9): en afmelding i eWebinar = GLOBAL afmelding fra
 * e-mailmarkedsføring i Klaviyo (consent UNSUBSCRIBED, uden list_id). Ikke
 * undertrykkelse. Afsendelsen ligger i klaviyoAfmelding.ts; HER er kun dommen.
 *
 * TO FELTER, TO BETYDNINGER (recon §1.2) — eWebinar sender begge, og de er
 * ikke samme mængde:
 *   `action`     «The Action that caused the current update» — HÆNDELSEN.
 *                Ordret fra ewebinar.com/help/webhook, en af ni værdier,
 *                hvoraf «Unsubscribed» er den ene.
 *   `subscribed` «Is the registrant currently subscribed to receive email
 *                notifications» — TILSTANDEN. Importvejen sætter KUN den
 *                (webinarImport.ts: optOut: true → "Unsubscribed").
 *
 * DERFOR TO VEJE IND (og det er hele dommen):
 *   1. `action = Unsubscribed`  — beskeden ER afmeldingen.
 *   2. `subscribed` SKIFTER til Unsubscribed — tilstanden gik fra ikke-afmeldt
 *      til afmeldt, uden at vi fik hændelsen (importen, eller en besked hvor
 *      eWebinar kun opdaterede feltet).
 *
 * LOWER() OVERALT. «Et felt, vi ikke selv sætter, er en observation — aldrig
 * en nøgle» (CLAUDE.md). eWebinar skriver i dag «Unsubscribed» med stort U;
 * skifter de kapitalisering en dag, må dommen ikke tie.
 *
 * ÉN GANG PR. MAIL — men IKKE her. Dommen svarer på «er denne besked en
 * afmelding», og den kan med rette svare ja to gange for samme person (to
 * webinarer, to registranter, samme mail). Idempotensen bor i SPORET:
 * `klaviyo_afmeldinger` har en unik regel på (email) WHERE udfald = 'ok', så
 * en mail, der ÉN gang er afmeldt, aldrig afmeldes igen. Det er samme valg som
 * `unique_id` på Klaviyos hændelser — nøglen ligger dér, hvor den kan holdes,
 * ikke i en ren funktion uden hukommelse.
 *
 * REN OG DENO-FRI: ingen `Deno`, ingen `fetch`, ingen klient. Kan prøves i
 * vitest (src/lib/__tests__/webinarAfmelding.test.ts).
 */

/** eWebinars ord for «afmeldt», som vi møder det i `action` og i `subscribed`. */
export const AFMELDT_ORD = "unsubscribed";

/**
 * Så lidt af en tilmelding, som dommen behøver. Begge felter er eWebinars egne
 * (webinarDom.ts: `sidste_action` ← payload.action, `subscribed` ← payload.subscribed).
 */
export interface AfmeldTilstand {
  subscribed: string | null;
  sidste_action: string | null;
}

/** Normaliseret sammenligning — trimmet og med små bogstaver. */
function er(v: string | null | undefined, ord: string): boolean {
  return typeof v === "string" && v.trim().toLowerCase() === ord;
}

/**
 * STÅR tilmeldingen som afmeldt lige nu? Sand, hvis ENTEN tilstanden
 * (`subscribed`) ELLER den seneste hændelse (`sidste_action`) siger det.
 *
 * Bruges to steder: her i `skalAfmeldes`, og som PORT foran fremmøde-
 * hændelserne (ewebinar-webhook) — vi sender ikke «deltog»/«mødte ikke op»
 * til Klaviyo om en person, der netop har bedt sig fri.
 */
export function erAfmeldt(t: AfmeldTilstand | null | undefined): boolean {
  if (!t) return false;
  return er(t.subscribed, AFMELDT_ORD) || er(t.sidste_action, AFMELDT_ORD);
}

/**
 * GÅR tilmeldingen til afmeldt med DENNE besked?
 *
 * @param gammel Rækken, som den stod FØR beskeden (null = vi har ikke set
 *               registranten før).
 * @param ny     DEN NYE BESKEDS EGNE FELTER — det, `plukTilmelding` plukkede,
 *               IKKE den flettede række. Det er med vilje: fletningen lader
 *               null stå (`fletTilmelding`, webinarDom.ts), så en besked UDEN
 *               `action` ville arve en ældre «Unsubscribed» og se ud som en ny
 *               afmelding hver eneste gang. Dommen skal se beskeden, ikke
 *               summen af alle beskeder.
 *
 * Sand, når:
 *   (1) beskedens egen `action` er Unsubscribed — hændelsen er ankommet, eller
 *   (2) `subscribed` skifter fra ikke-afmeldt (eller ukendt) til Unsubscribed.
 *
 * Falsk, når tilstanden allerede VAR afmeldt og beskeden ikke selv er
 * afmeldingen — ellers ville hver eneste senere besked om samme registrant
 * (eWebinar POSTer ved hver ændring) tælle som en ny afmelding.
 */
export function skalAfmeldes(gammel: AfmeldTilstand | null | undefined, ny: AfmeldTilstand): boolean {
  // (1) Hændelsen selv. Den står, uanset hvad tilstanden sagde før.
  if (er(ny.sidste_action, AFMELDT_ORD)) return true;
  // (2) Tilstanden skifter. Var den afmeldt i forvejen, er der intet nyt.
  return er(ny.subscribed, AFMELDT_ORD) && !er(gammel?.subscribed ?? null, AFMELDT_ORD);
}
