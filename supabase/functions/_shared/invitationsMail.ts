/**
 * Invitationsmailen — den mail et nyt medlem får EFTER betalingen, i husets
 * form (indgangsMail.ts). Skrevet 14/9 2026.
 *
 * HVORFOR DEN FINDES: send-invitation-email bar sin egen FALLBACK_HTML — en
 * fjerde kopi af «The Boardroom by Topix»-headeren med fire sætninger der
 * ikke passede: «by Topix» (udgik 1/9, se indgangsMail.ts :22-24), «Ignorer
 * denne besked hvis du ikke forventer den» (modtageren har lige betalt og
 * forventer den, :26-27), «Du kan oprette dig med en hvilken som helst
 * e-mail» (usand: mailfeltet er readOnly når invitationen bærer en adresse,
 * src/pages/Auth.tsx:111-115 og :363-364) og et hardkodet «The Boardroom»
 * hvor virksomhedens navn skulle stå. Målt i prod 14/9: email_templates-
 * rækken «Invitation til virksomhed» har enabled=false, så fallbacken ER den
 * mail nye medlemmer får.
 *
 * PLADSHOLDERNE bevares: send-invitation-email udfylder {{company_name}} og
 * {{signup_url}} med udfyldPladsholdere på BÅDE skabelon- og fallback-vejen,
 * så de to veje deler én mekanik. Derfor bygger invitationsMailSkabelon()
 * mailen MED pladsholderne som tekst; indgangsMailHtml's esc() rører ikke
 * krøllede parenteser. Værdierne indsættes rå, som før (samme adfærd som
 * DB-skabelonen). Virksomhedsnavnet escapes af invitationsVaerdier() nedenfor
 * FØR det udfyldes — se kommentaren dér.
 *
 * KONTAKTADRESSEN er kontakt@theboardroom.dk (besluttet af Jonas 14/9).
 * Mailen sendes fra noreply@theboardroom.dk (managedEmail.ts), så «skriv til
 * mig» ville love et svar ingen læser; adressen står derfor i teksten, så
 * modtageren kan se hvor hun skal skrive hen frem for at trykke svar.
 *
 * REN: ingen IO, ingen Supabase. Testet i
 * src/lib/__tests__/invitationsMail.test.ts; send-invitation-email låses til
 * modulet af invitationsMail.guard.test.ts.
 */
import { esc, HILSEN, indgangsMailHtml, KONTAKT_ADRESSE, tiltale, type IndgangsMail } from "./indgangsMail.ts";

export const PLADSHOLDER_VIRKSOMHED = "{{company_name}}";
export const PLADSHOLDER_LINK = "{{signup_url}}";
// Adressen bor i indgangsMail.ts siden 14/9 (dag 0 og fornyelsens kvittering
// deler den); re-eksporteret, så invitationsMail.test.ts og send-invitation-email
// læser den samme vej som før.
export { KONTAKT_ADRESSE };

/**
 * Selve mailen. `virksomhed` og `signupUrl` kan være pladsholdere (skabelon-
 * brug) eller færdige værdier. Fornavnet kendes ikke i send-invitation-email
 * i dag (rækken bærer kun e-mail), så tiltalen er «Hej,» — tiltale() udelader
 * navnet uden at efterlade «Hej ,».
 */
export function invitationsMail(a: {
  virksomhed: string;
  signupUrl: string;
  fornavn?: string | null;
}): IndgangsMail {
  return {
    subject: "Din adgang til The Boardroom er klar",
    html: indgangsMailHtml({
      overskrift: tiltale("Hej", a.fornavn),
      afsnit: [
        "Tak for din betaling. Din plads i The Boardroom er klar, og du opretter dit login herunder.",
        `Adgangen er til ${a.virksomhed}: det er din virksomhed og dine tal, vi arbejder med.`,
        "Opret dig med den e-mailadresse, denne mail er sendt til. Den står allerede udfyldt, når du åbner linket.",
      ],
      knap: { tekst: "Opret dit login", url: a.signupUrl },
      efterKnap: [`Går der noget galt undervejs, så skriv til ${KONTAKT_ADRESSE}.`],
      hilsen: HILSEN,
    }),
  };
}

/** Mailen med pladsholderne som tekst — det send-invitation-email bruger som fallback. */
export function invitationsMailSkabelon(): IndgangsMail {
  return invitationsMail({ virksomhed: PLADSHOLDER_VIRKSOMHED, signupUrl: PLADSHOLDER_LINK });
}

/**
 * Udfylder {{nøgle}} for hver nøgle i `vaerdier` — alle forekomster. Samme
 * adfærd som send-invitation-emails tidligere replaceVars (flyttet hertil
 * 14/9, så den kan testes). Værdier indsættes rå.
 */
export function udfyldPladsholdere(tekst: string, vaerdier: Record<string, string>): string {
  let resultat = tekst;
  for (const [noegle, vaerdi] of Object.entries(vaerdier)) {
    const pladsholder = `{{${noegle}}}`;
    while (resultat.includes(pladsholder)) resultat = resultat.replace(pladsholder, vaerdi);
  }
  return resultat;
}

/**
 * Værdierne til udfyldPladsholdere — emnet og HTML'en får hver sit sæt.
 *
 * company_name ESCAPES i HTML-sættet: navnet kommer fra companies.name eller
 * fra en service-role-kalder, og ansøgningsimporten tager navne fra en
 * formular — «Bang & Olufsen» eller et navn med «<» må ikke kunne bryde
 * mailen eller lægge markup ind i den. Husets egen esc() (indgangsMail.ts).
 * I emne-sættet står navnet RÅT: et emne er tekst, ikke HTML, og «&amp;» i
 * emnelinjen ville være en fejl.
 *
 * signup_url escapes IKKE: den bygges af koden selv (send-invitation-email
 * eller sikrIndgangsInvitation — https://app.theboardroom.dk/auth?mode=signup
 * &invite=<uuid>), bærer ingen brugertekst, og står i en href hvor «&amp;»
 * ville give et andet link end det der blev sendt. bulletproofButton()
 * escaper selv anførselstegn i href.
 *
 * MED VILJE rammer det begge veje: send-invitation-email udfylder DB-
 * skabelonen «Invitation til virksomhed» med de samme sæt, så den dag nogen
 * tænder rækken igen, er virksomhedsnavnet escapet dér også.
 */
export function invitationsVaerdier(a: { companyName: string; signupUrl: string }): {
  tilEmne: Record<string, string>;
  tilHtml: Record<string, string>;
} {
  return {
    tilEmne: { company_name: a.companyName, signup_url: a.signupUrl },
    tilHtml: { company_name: esc(a.companyName), signup_url: a.signupUrl },
  };
}
