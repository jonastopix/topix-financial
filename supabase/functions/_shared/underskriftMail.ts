/**
 * E-underskriftens mails — rene byggere, samme layout som indgangens
 * (indgangsMailHtml i _shared/indgangsMail.ts): sendes af
 * send-til-underskrift (linket) og aftale-underskrift (koden, kvitteringen).
 *
 *   aftaleLinkMail             til modtageren: «Læs og underskriv» + udløbsdato
 *   aftaleKodeMail             til modtageren: den sekscifrede kode, 15 min
 *   aftaleKvitteringMail       til modtageren efter underskrift: tid, aftryk,
 *                              link til dokumentet (siden henter PDF'en)
 *   aftaleKvitteringRaadgiverMail  til rådgiverne: hvem, hvornår, aftryk,
 *                              link til virksomheden
 *
 * INGEN VEDHÆFTNING: Lovables mail-API (npm:@lovable.dev/email-js@0.1.0)
 * har intet attachment-felt (målt 18/9, dist/index.d.ts:5-20). Kvitteringen
 * bærer derfor et LINK til dokumentet; edge-funktionen svarer med en
 * signeret URL (10 min) mod bucket aftaler. Se README §3.
 *
 * Koden står i mailen med stor skrift og INTET andet sted. Den logges
 * aldrig (kildeværn).
 *
 * Testes med `deno test supabase/functions/_shared/underskriftMail_test.ts`.
 */
import { HILSEN, KONTAKT_ADRESSE, esc, indgangsMailHtml, tiltale, type IndgangsMail } from "./indgangsMail.ts";
import { KODE_GYLDIG_MINUTTER, LINK_GYLDIG_DAGE } from "./underskriftDom.ts";
import { formaterAftryk } from "./aftryk.ts";

const APP_URL = "https://app.theboardroom.dk";

export function aftaleUrl(token: string): string {
  return `${APP_URL}/aftale?token=${encodeURIComponent(token)}`;
}

export function aftaleLinkMail(a: {
  fornavn: string | null | undefined;
  virksomhed: string;
  url: string;
  udloeberDato: string;
}): IndgangsMail {
  return {
    subject: `Aftalegrundlag til underskrift — ${a.virksomhed}`,
    html: indgangsMailHtml({
      overskrift: tiltale("Kære", a.fornavn),
      afsnit: [
        `Her er aftalegrundlaget for ${a.virksomhed}s medlemskab af The Boardroom. Du læser det på siden og skriver under med dit navn og en kode, vi sender til denne mailadresse — ingen udskrift, ingen app.`,
      ],
      knap: { tekst: "Læs og underskriv", url: a.url },
      efterKnap: [
        `Linket virker i ${LINK_GYLDIG_DAGE} dage, til og med ${a.udloeberDato}. Er du i tvivl om noget i teksten, så skriv til ${KONTAKT_ADRESSE} før du skriver under.`,
        "Jeg glæder mig til at komme i gang sammen med dig.",
      ],
      hilsen: HILSEN,
    }),
  };
}

export function aftaleKodeMail(a: { fornavn: string | null | undefined; kode: string }): IndgangsMail {
  const kodeHtml =
    `<p style="font-family:'Manrope',Arial,sans-serif;font-size:32px;letter-spacing:6px;font-weight:700;color:#133332;margin:8px 0 18px">${esc(a.kode)}</p>`;
  const html = indgangsMailHtml({
    overskrift: tiltale("Hej", a.fornavn),
    afsnit: ["Din kode til at underskrive aftalegrundlaget:"],
    efterKnap: [
      `Koden gælder i ${KODE_GYLDIG_MINUTTER} minutter og kan kun bruges én gang. Har du ikke bedt om den, kan du se bort fra denne mail — ingen kan skrive under uden koden.`,
    ],
    hilsen: "The Boardroom",
  });
  // Koden sættes ind som sit eget element efter det første afsnit —
  // indgangsMailHtml escaper afsnit, så koden kan ikke stå i «afsnit».
  return {
    subject: `Din kode: ${a.kode}`,
    html: html.replace("</p>\n", `</p>\n${kodeHtml}\n`),
  };
}

export function aftaleKvitteringMail(a: {
  fornavn: string | null | undefined;
  virksomhed: string;
  navn: string;
  tidspunkt: string;
  aftryk: string;
  url: string;
}): IndgangsMail {
  return {
    subject: `Kvittering — aftalegrundlaget for ${a.virksomhed} er underskrevet`,
    html: indgangsMailHtml({
      overskrift: tiltale("Kære", a.fornavn),
      afsnit: [
        `Tak. Aftalegrundlaget for ${a.virksomhed} er underskrevet af ${a.navn} den ${a.tidspunkt}.`,
        `Dokumentets aftryk (SHA-256): ${formaterAftryk(a.aftryk)}. Det står også på dokumentets sidste side sammen med revisionssporet.`,
      ],
      knap: { tekst: "Hent det underskrevne dokument", url: a.url },
      efterKnap: [
        "Gem gerne dokumentet. Næste skridt kommer i en mail for sig: betalingen, som åbner adgangen til platformen.",
        `Spørgsmål? Skriv til ${KONTAKT_ADRESSE}.`,
      ],
      hilsen: HILSEN,
    }),
  };
}

export function aftaleKvitteringRaadgiverMail(a: {
  virksomhed: string;
  navn: string;
  tidspunkt: string;
  aftryk: string;
  /** Virksomheden når den findes (også lige oprettet af motoren); ellers null. */
  companyId: string | null;
  /** Ansøgningen når aftalen kom den vej — linket går dertil hvis virksomheden mangler. */
  ansoegningId: string | null;
  ip: string | null;
  browser: string;
}): IndgangsMail {
  const url = a.companyId
    ? `${APP_URL}/virksomheder/${encodeURIComponent(a.companyId)}`
    : a.ansoegningId
      ? `${APP_URL}/ansoegninger/${encodeURIComponent(a.ansoegningId)}`
      : `${APP_URL}/members`;
  return {
    subject: `Underskrevet: ${a.virksomhed} (${a.navn})`,
    html: indgangsMailHtml({
      overskrift: "Aftalegrundlag underskrevet",
      afsnit: [
        `${a.navn} har underskrevet aftalegrundlaget for ${a.virksomhed} den ${a.tidspunkt}${a.ip ? ` fra ${a.ip}` : ""} (${a.browser}).`,
        `Aftryk (SHA-256): ${formaterAftryk(a.aftryk)}.`,
        "Betalingsmailen (dag 0) er udløst i samme kald — se virksomhedens side for status.",
      ],
      knap: { tekst: a.companyId ? "Åbn virksomheden" : "Åbn ansøgningen", url },
      hilsen: "The Boardroom",
    }),
  };
}
