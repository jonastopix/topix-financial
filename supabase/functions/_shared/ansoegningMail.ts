/**
 * supabase/functions/_shared/ansoegningMail.ts
 *
 * Den ENE påmindelse til en ansøger der ikke blev færdig — ren HTML- og
 * tekstbygger, ingen Deno, ingen afsendelse (den bor i
 * ansoegning-paamindelse-cron). Testet i
 * src/lib/ansoegning/__tests__/ansoegningMail.test.ts.
 *
 * RAMMEN ER HUSETS: indgangsMailHtml (indgangsMail.ts) — samme header,
 * knap (bulletproofButton) og hilsen som dag 0/14/25/31-mailene; kun
 * ordene er nye. tiltale/HILSEN/KONTAKT_ADRESSE genbruges. fornavnAf
 * findes også i indgangsMailAfsendelse.ts:138, men den fil importerer
 * managedEmail (npm) og kan ikke læses af vitest — derfor en lokal kopi
 * med samme regel (første ord). Linket bærer tokenet som
 * TOKEN_PARAM — samme parameter som fladen læser, så mailen og siden ikke
 * kan skride fra hinanden. Fornavnet er tiltale, ikke krav: uden navn
 * hedder det «Hej».
 *
 * TEKSTEN ER ET UDKAST til Jonas' godkendelse (README §7).
 */
import { HILSEN, indgangsMailHtml, KONTAKT_ADRESSE, tiltale } from "./indgangsMail.ts";
import { ANSOEG_STI, TOKEN_PARAM } from "./ansoegningSkema.ts";

export const APP_URL = "https://app.theboardroom.dk";

/** Linket der sender ansøgeren tilbage hvor de slap. */
export function genoptagLink(token: string, appUrl: string = APP_URL): string {
  return `${appUrl}${ANSOEG_STI}?${TOKEN_PARAM}=${encodeURIComponent(token)}`;
}

/** «Morten Larsen Hansen» → «Morten»; tomt → null. */
export function fornavnAf(navn: string | null | undefined): string | null {
  const t = (navn ?? "").trim();
  if (!t) return null;
  return t.split(/\s+/)[0];
}

/** Kun html — tekstudgaven laves af htmlTilTekst (indgangsMailAfsendelse.ts:92), som er skrevet til netop indgangsMailHtml-layoutet. */
export interface PaamindelsesMail {
  subject: string;
  html: string;
}

export const PAAMINDELSE_EMNE = "Din ansøgning til The Boardroom venter på dig";

export function paamindelsesMail(a: { navn: string | null; token: string; besvarede: number; ialt: number }): PaamindelsesMail {
  const fornavn = fornavnAf(a.navn);
  const link = genoptagLink(a.token);
  const rest = Math.max(0, a.ialt - a.besvarede);
  const status = rest === 0
    ? "Du har svaret på det hele — der mangler kun at trykke send."
    : rest === 1
      ? "Du mangler ét spørgsmål."
      : `Du mangler ${rest} spørgsmål — det tager et par minutter.`;

  const html = indgangsMailHtml({
    overskrift: tiltale("Hej", fornavn),
    afsnit: ["Du begyndte på en ansøgning til The Boardroom, men blev ikke færdig. Dine svar er gemt.", status],
    knap: { tekst: "Fortsæt ansøgningen", url: link },
    efterKnap: [
      "Linket er dit — det åbner ansøgningen præcis hvor du slap. Er det ikke aktuelt længere, kan du bare lade det ligge; vi skriver ikke igen.",
      `Spørgsmål? Skriv til ${KONTAKT_ADRESSE}.`,
    ],
    hilsen: HILSEN,
  });

  return { subject: PAAMINDELSE_EMNE, html };
}
