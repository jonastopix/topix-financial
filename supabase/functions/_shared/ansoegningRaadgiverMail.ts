/**
 * ansoegningRaadgiverMail — mailen til Jonas og Morten når en ansøgning er
 * sendt (Jonas 18/9, flow-gennemgangen §3). Ren bygger; sendes af
 * ansoegningMotor.registrerIndsendelse til KONTAKT_ADRESSE (kontakt@
 * viderestilles til Jonas — bekræftet 18/9), én gang pr. ansøgning.
 *
 * HVORFOR IKKE KLOKKEN: advisor_notifications forlader aldrig browseren —
 * send-notification-email læser kun `notifications`, og dens
 * ADVISOR_EMAIL_DISABLED gælder medlemsnotifikationer til rådgivere (målt
 * 18/9: kommentaren siger «Advisors receive Slack notifications»; ingen
 * Slack-vej findes for ansøgninger). Derfor en direkte mail, uden om køen.
 * Rammen er husets (indgangsMailHtml). Testet i
 * src/lib/__tests__/ansoegningRaadgiverMail.test.ts.
 */
import { indgangsMailHtml } from "./indgangsMail.ts";
import type { Anbefaling } from "./ansoegningAnbefaling.ts";
import type { DubletDom } from "./ansoegningDubletter.ts";
import { OMSAETNINGSINTERVALLER } from "./ansoegningSkema.ts";

export interface RaadgiverMailInput {
  ansoegning: {
    id: string;
    navn: string | null;
    email: string | null;
    telefon: string | null;
    kilde: string;
    omsaetningsinterval: string | null;
    antal_ansatte: number | null;
    cvr: string | null;
    cvr_opslag: { navn?: string | null; branche?: string | null } | null;
    udfordring: string | null;
  };
  anbefaling: Anbefaling;
  dubletter: DubletDom;
  appUrl: string;
}

export interface RaadgiverMail {
  emne: string;
  html: string;
  tekst: string;
}

const KILDE_ORD: Record<string, string> = { webinar: "webinaret", anbefaling: "en anbefaling", linkedin: "LinkedIn", direkte: "theboardroom.dk", andet: "andet" };

function klip(t: string | null | undefined, maks = 400): string | null {
  const s = (t ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length <= maks ? s : `${s.slice(0, maks - 1).trimEnd()}…`;
}

export function raadgiverMailOmNyAnsoegning(i: RaadgiverMailInput): RaadgiverMail {
  const a = i.ansoegning;
  const virksomhed = (a.cvr_opslag?.navn ?? "").trim() || (a.navn ? `${a.navn}s virksomhed` : a.email ?? "Ukendt virksomhed");
  const udfald = i.anbefaling.udfald === "tal_med_dem" ? "Tal med dem" : i.anbefaling.udfald === "afvis" ? "Afvis" : "Tvivl";
  const obs = i.dubletter.alvorlig ? "OBS — " : "";
  const emne = `${obs}Ny ansøgning: ${virksomhed} — anbefaling: ${udfald}`;
  const interval = OMSAETNINGSINTERVALLER.find((o) => o.noegle === a.omsaetningsinterval)?.label ?? "omsætning ikke angivet";
  const afsnit = [
    `${a.navn ?? "Ukendt navn"} · ${a.email ?? "ingen mail"} · ${a.telefon ?? "ingen telefon"} · kom via ${KILDE_ORD[a.kilde] ?? a.kilde}.`,
    `${virksomhed}${a.cvr ? ` (CVR ${a.cvr})` : ""} · ${interval}${a.antal_ansatte !== null ? ` · ${a.antal_ansatte} ansatte` : ""}${a.cvr_opslag?.branche ? ` · ${a.cvr_opslag.branche}` : ""}.`,
    ...(i.dubletter.advarsler.length > 0 ? [`OBS: ${i.dubletter.advarsler.join("; ")}.`] : []),
    `Anbefaling: ${udfald}. ${i.anbefaling.grundlag.join(", ")}.`,
    ...(klip(a.udfordring) ? [`Største udfordring, med deres ord: «${klip(a.udfordring)}»`] : []),
  ];
  const link = `${i.appUrl}/ansoegninger/${a.id}`;
  const html = indgangsMailHtml({
    overskrift: emne,
    afsnit,
    knap: { tekst: "Åbn ansøgningen", url: link },
    efterKnap: ["Beslutningen — tal med dem eller afvis — træffes på ansøgningen. Køen gør intet, før I gør."],
    hilsen: "The Boardroom",
  });
  const tekst = [...afsnit, "", `Åbn ansøgningen: ${link}`, "", "Beslutningen træffes på ansøgningen. Køen gør intet, før I gør."].join("\n");
  return { emne, html, tekst };
}
