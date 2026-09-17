/**
 * indgangBetaltBesked — de RENE tekster til klokken «nyt medlem har betalt»
 * (før webinaret 22/9 — recon-webinar-22-9.md §7 pkt. 3; Jonas 17/9 «1. Ja»).
 * Spejl af fornyelsesBeskedTekst, men i egen fil: teksten bærer invitationens
 * udfald (også «spærret»), og invitationSpaerret.guard låser at
 * raadgiverBeskedTekst.ts ikke kender den variant. Uden Supabase-import, så
 * vitest kan dække den (src/lib/__tests__/raadgiverBesked.test.ts). Typen
 * TYPE_INDGANG_BETALT bor sammen med de andre typer i raadgiverBeskedTekst.ts;
 * writeren er skrivRaadgiverBesked (raadgiverBesked.ts).
 */
import { formatKrOere } from "./fornyelsesMail.ts";

/** Indgangens modeller — også fakturaen (dag 31), som fornyelsen ikke har. */
const INDGANG_MODEL_TEKST: Record<string, string> = {
  fuld: "på én gang",
  rate2: "i to rater",
  rate12: "i tolv rater",
  faktura: "efter faktura",
};

/** Invitationens udfald i én sætning — det rådgiveren skal vide om loginet. */
export function indgangLoginTekst(invitation: { udfald: string; email?: string }): string {
  const mail = "email" in invitation && invitation.email ? invitation.email : null;
  switch (invitation.udfald) {
    case "sendt":
      return mail ? `login-mailen er sendt til ${mail}` : "login-mailen er sendt";
    case "fandtes_allerede":
      return mail ? `invitationen til ${mail} lå der allerede — ingen ny mail` : "invitationen lå der allerede — ingen ny mail";
    case "allerede_medlem":
      return mail ? `${mail} har allerede et login` : "har allerede et login";
    case "spaerret":
      return mail ? `login-mailen blev IKKE sendt — ${mail} er spærret hos mailudbyderen` : "login-mailen blev IKKE sendt — adressen er spærret";
    default:
      return "login-mailen blev IKKE sendt — invitér manuelt fra /virksomheder";
  }
}

/** «Din Forsikringsret er nyt medlem — har betalt» · «50.000 kr. ekskl. moms på én gang · til 15. september 2027 · login-mailen er sendt til tgn@…». */
export function indgangBetaltBeskedTekst(a: {
  virksomhed: string;
  samletOere: number;
  betalingsmodel: string;
  slutDatoTekst: string;
  invitation: { udfald: string; email?: string };
}): { title: string; body: string } {
  const model = INDGANG_MODEL_TEKST[a.betalingsmodel] ?? a.betalingsmodel;
  return {
    title: `${a.virksomhed} er nyt medlem — har betalt`,
    body: `${formatKrOere(a.samletOere)} kr. ekskl. moms ${model} · til ${a.slutDatoTekst} · ${indgangLoginTekst(a.invitation)}`,
  };
}
