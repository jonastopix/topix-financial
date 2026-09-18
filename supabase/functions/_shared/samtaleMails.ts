/**
 * samtaleMails — de tre mails til ansøgeren når afklaringssamtalen bookes,
 * flyttes eller aflyses (udkast 18/9-2026). Sendes STRAKS (samtaleBesked.ts),
 * uden om rykkerkøen — derfor er de ikke i KOE_SKABELONER og ikke i BYGGERE
 * i ansoegningRykkerMails.ts, men bruger samme ramme (bygUdkast), samme
 * hilsen og samme statuslink. Teksterne er til Jonas' godkendelse (README).
 */
import { bygUdkast, formaterSamtaletid, type Mail, type MailKontekst, type Udkast } from "./ansoegningRykkerMails.ts";
import { SAMTALE_MAIL, type SamtaleAendring, type SamtaleAktoer } from "./samtaleBeskedDom.ts";

export interface SamtaleMailKontekst extends MailKontekst {
  af: SamtaleAktoer;
  nyStart: Date | null;
  gammelStart: Date | null;
  varighedMin: number;
}

const hej = (k: MailKontekst) => (k.fornavn ? `Hej ${k.fornavn}` : "Hej");
const tid = (d: Date | null) => (d ? formaterSamtaletid(d) : "det aftalte tidspunkt");

function udkast(aendring: SamtaleAendring, k: SamtaleMailKontekst): Udkast {
  const ny = tid(k.nyStart), gammel = tid(k.gammelStart);
  // Målt 18/9: eventtypen sender KUN kalenderinvitationen (med Meet-linket) — alt andet kommer fra os.
  const moede = k.moedeLink ? `Du får en kalenderinvitation med mødelinket i samme øjeblik — det er også her: ${k.moedeLink}` : "Du får en kalenderinvitation med mødelinket i samme øjeblik.";
  if (aendring === "book") {
    return {
      emne: `Samtalen er booket: ${ny}`,
      eyebrow: "Afklaringssamtalen",
      afsnit: [
        `${hej(k)},`,
        `Tak — vi ses ${ny}. Samtalen tager ${k.varighedMin} minutter, og vi holder den online. ${moede}`,
        "Skal du flytte eller aflyse, kan du gøre det på din side — det tager et minut.",
      ],
      knap: { tekst: "Se din booking", href: k.statusUrl },
      ikkeNu: false,
    };
  }
  if (aendring === "flyt") {
    return {
      emne: `Ny tid til vores samtale: ${ny}`,
      eyebrow: "Afklaringssamtalen",
      afsnit: [
        `${hej(k)},`,
        k.af === "raadgiver"
          ? `Jeg har måttet flytte vores samtale. Den nye tid er ${ny} — den var sat til ${gammel}. Passer det ikke, så vælg en anden tid på din side.`
          : `Du har flyttet vores samtale til ${ny} — den var sat til ${gammel}. Vi ses der.`,
        "Du får en ny kalenderinvitation; den gamle trækkes tilbage." + (k.moedeLink ? ` Mødelinket: ${k.moedeLink}` : ""),
      ],
      knap: { tekst: "Se din booking", href: k.statusUrl },
      ikkeNu: false,
    };
  }
  return {
    emne: `Samtalen ${gammel} er aflyst`,
    eyebrow: "Afklaringssamtalen",
    afsnit: [
      `${hej(k)},`,
      k.af === "raadgiver"
        ? `Jeg har måttet aflyse vores samtale ${gammel} — det beklager jeg. Vælg gerne en ny tid, der passer dig; det tager et minut.`
        : `Du har aflyst vores samtale ${gammel}. Vil du tale med os på et andet tidspunkt, kan du vælge en ny tid her.`,
      "Kalenderinvitationen trækkes tilbage af sig selv.",
    ],
    knap: { tekst: "Vælg en ny tid", href: k.statusUrl },
    // Ansøgeren der selv aflyste, må gerne sige «ikke nu» — det er den naturlige udgang; rådgiverens aflysning er ikke ansøgerens nej.
    ikkeNu: k.af === "ansoeger",
  };
}

export function bygSamtaleMail(aendring: SamtaleAendring, k: SamtaleMailKontekst): Mail & { label: string } {
  return { ...bygUdkast(udkast(aendring, k), k), label: SAMTALE_MAIL[aendring] };
}
