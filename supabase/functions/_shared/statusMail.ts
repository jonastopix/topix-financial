/**
 * statusMail — den ugentlige statusmail til rådgiverne med medlemsoverblikket
 * (29/9-2026, TRIN 1: kun de rene dele — ingen function, ingen cron endnu).
 *
 * JONAS 29/9: «Vi har brug for et samlet overblik, så vi ikke skal tjekke på
 * hver enkelt kunde» — og en ugentlig mail med status på det hele. Grundlaget
 * er ~/Downloads/recon-statusmail.md: husets periodiske rådgivermail er
 * klokke-mail-cron (Bucket B, sendManagedEmail + indgangsMailHtml, opslag i
 * email_send_log på nøglen FØR afsendelsen, rådgiverne fra user_roles).
 * Denne fil er teksten og nøglen i den form — {emne, titel, afsnit, blokke,
 * tekst}, som klokkeMail.ts og webinarMailAlarm.ts.
 *
 * ORDENE for mærkerne kommer fra ÉN kilde: MAERKE_ORD/FILTER_MAERKER i
 * medlemsOverblik.ts (Deno-spejlet af motoren). Ingen egen kopi her.
 *
 * NØGLEN er én pr. rådgiver pr. ISO-UGE i dansk tid: «statusmail:<modtagerId>:
 * <ISO-år>-W<uge>» — mailen er ugens, ikke kørslens, så en gentaget kørsel i
 * samme uge (cron efter en fejl, en håndkørsel) rammer email_send_log og sender
 * ikke igen. Ugen er husets ene uge-nøgle (_shared/isoUge.ts) på den danske dato; regnestykket står ved isoUgeNoegle.
 *
 * REN: ingen Supabase, ingen miljø, intet ur — `nu` gives ind. Importerer kun
 * fra _shared-filer uden Deno (medlemsOverblik.ts, hverdage.ts). Prøvet i
 * src/lib/__tests__/statusMail.test.ts.
 */
import { kbhDele } from "./hverdage.ts";
import { getISOWeekKey } from "./isoUge.ts";
import { FILTER_MAERKER, harMaerke, MAERKE_ORD, sammenlignOverblik, type Maerke, type OverbliksRaekke } from "./medlemsOverblik.ts";

/** Idempotensnøglens præfiks (email_send_log.message_id). */
export const STATUSMAIL_NOEGLE_PRAEFIKS = "statusmail:";
/** template_name i email_send_log og label hos Lovable. */
export const STATUSMAIL_LABEL = "statusmail";
/** Listen, mailens links peger på — med ?maerke=<mærke> (lib/hjemmebane/overblikOrd MAERKE_PARAM). */
export const VIRKSOMHEDER_URL = "https://app.theboardroom.dk/virksomheder";
export const MAERKE_PARAM = "maerke";

/**
 * ISO-ugen i DANSK tid — regnet af husets ENE uge-nøgle, _shared/isoUge.ts
 * (getISOWeekKey; kildeværnet isoUge.test fælder enhver inline-kopi).
 *
 * REGNESTYKKET (ISO 8601, som isoUge.ts gør det): ugen begynder mandag; uge 1
 * er den uge, der indeholder årets første torsdag. Gå til TORSDAGEN i samme
 * uge (dato + 4 − ugedag, ugedag 1=mandag … 7=søndag); torsdagens år er
 * ISO-året, og ugenummeret er ⌈(dage siden 1. januar + 1) / 7⌉.
 *
 * DANSK TID: getISOWeekKey læser Date'ens LOKALE kalenderdato, og en edge
 * function kører i UTC — søndag 23:59 dansk er allerede mandag i UTC. Derfor
 * tages den danske kalenderdato først (kbhDele, Europe/Copenhagen) og gives
 * som en lokal middagsdato, så nøglen er den danske uges — uanset hvor koden
 * kører. Prøvet på årsskiftet (28/12-2026 → 2026-W53, 4/1-2027 → 2027-W01) og
 * søndag/mandag i dansk tid.
 */
export function isoUgeNoegle(nu: Date): string {
  const p = kbhDele(nu);
  return getISOWeekKey(new Date(p.aar, p.maaned - 1, p.dag, 12));
}

/** «2026-W40» → { aar: 2026, uge: 40 }. */
export function isoUge(nu: Date): { aar: number; uge: number } {
  const [aar, uge] = isoUgeNoegle(nu).split("-W");
  return { aar: Number(aar), uge: Number(uge) };
}

/** «2026-W40». */
export function isoUgeTekst(nu: Date): string {
  return isoUgeNoegle(nu);
}

/** «statusmail:<modtagerId>:2026-W40» — én pr. rådgiver pr. dansk ISO-uge. */
export function statusMailNoegle(modtagerId: string, nu: Date): string {
  return `${STATUSMAIL_NOEGLE_PRAEFIKS}${modtagerId}:${isoUgeTekst(nu)}`;
}

export interface StatusMailTekst {
  emne: string;
  /** Til en evt. klokke — bærer ugen, så dedup giver én pr. uge. */
  titel: string;
  afsnit: string[];
  blokke: { overskrift: string; tekst: string }[];
  /** Ren tekst-udgaven af mailen. */
  tekst: string;
}

/** Linket til listen filtreret på ét mærke. */
export function maerkeLink(m: Maerke): string {
  return `${VIRKSOMHEDER_URL}?${MAERKE_PARAM}=${m}`;
}

const INGEN_MAERKER = "Ingen virksomheder trænger, mangler session, står i stampe eller er uden bruger lige nu. Godt gået.";

/**
 * Teksten. `overblik` er byggOverblik's rækker; `navne` er virksomhedens navn
 * pr. id (companies.name) — mailen viser navne, aldrig id'er; mangler navnet,
 * står id'et, så en linje aldrig forsvinder i stilhed.
 */
export function statusMailTekst(overblik: ReadonlyMap<string, OverbliksRaekke> | readonly OverbliksRaekke[], navne: ReadonlyMap<string, string>, nu: Date): StatusMailTekst {
  const raekker = overblik instanceof Map ? [...overblik.values()] : [...(overblik as readonly OverbliksRaekke[])];
  const uge = isoUge(nu);
  const navnFor = (r: OverbliksRaekke) => navne.get(r.companyId) ?? r.companyId;
  const prMaerke = FILTER_MAERKER.map((m) => ({
    m,
    virksomheder: raekker.filter((r) => harMaerke(r.dom, m)).map((r) => ({ dom: r.dom, navn: navnFor(r) })).sort(sammenlignOverblik),
  }));
  const antal = (m: Maerke) => prMaerke.find((x) => x.m === m)?.virksomheder.length ?? 0;
  const traenger = antal("traenger");

  const emne = `Medlemsoverblik uge ${uge.uge}: ${traenger} trænger`;
  const titel = `Medlemsoverblik uge ${uge.uge} (${isoUgeTekst(nu)})`;

  const tal = FILTER_MAERKER.map((m) => `${MAERKE_ORD[m]}: ${antal(m)}`).join(" · ");
  const afsnit: string[] = [
    `Ugens overblik over ${raekker.length} ${raekker.length === 1 ? "virksomhed" : "virksomheder"} — ${tal}.`,
  ];
  const blokke: { overskrift: string; tekst: string }[] = [];
  const nogen = prMaerke.some((x) => x.virksomheder.length > 0);
  if (!nogen) {
    afsnit.push(INGEN_MAERKER);
  } else {
    for (const { m, virksomheder } of prMaerke) {
      if (virksomheder.length === 0) continue;
      blokke.push({
        overskrift: `${MAERKE_ORD[m]} (${virksomheder.length})`,
        tekst: `${virksomheder.map((v) => v.navn).join("\n")}\n${maerkeLink(m)}`,
      });
    }
    afsnit.push(`Hele listen, sorteret med dem, der trænger, først: ${VIRKSOMHEDER_URL}`);
  }

  const tekst = [
    ...afsnit,
    "",
    ...blokke.map((b) => `${b.overskrift}\n${b.tekst}`),
  ].join("\n").trimEnd();
  return { emne, titel, afsnit, blokke, tekst };
}

// ── Vinduet: mandag kl. 7 dansk tid (TRIN 2, 29/9) ───────────────────────────

/** Ugedagen for mailen — mandag (kbhDele.ugedag: 0 = søndag, 1 = mandag). */
export const STATUSMAIL_UGEDAG = 1;
/** Den danske time, mailen tidligst går. */
export const STATUSMAIL_TIME = 7;

/**
 * Er kørslen inde i vinduet? SAMME mekanisme som klokke-mail-cronens morgenmail
 * (klokkeMail.ts erMorgenkoersel: dansk ugedag og dansk time fra kbhDele — pg_cron
 * kører i UTC og kan ikke udtrykke «kl. 7 dansk» året rundt).
 *
 * REGNESTYKKET: cron-jobbet kører mandag kl. 05:33 OG 06:33 UTC.
 *   SOMMER (CEST, UTC+2): 05:33 UTC = 07:33 dansk → inde; 06:33 UTC = 08:33 → inde,
 *     men ugenøglen står i email_send_log fra den første kørsel → «fandtes».
 *   VINTER (CET, UTC+1): 05:33 UTC = 06:33 dansk → time 6 < 7 → uden_for_vindue
 *     (intet hentes); 06:33 UTC = 07:33 dansk → inde → sendes.
 * Mailen går derfor kl. 07:33 dansk sommer som vinter. Nøglen (én pr. ISO-uge)
 * er dørstopperen, ikke vinduet — en håndkørsel senere samme mandag sender ikke igen.
 */
export function erStatusmailVindue(nu: Date): boolean {
  const p = kbhDele(nu);
  return p.ugedag === STATUSMAIL_UGEDAG && p.time >= STATUSMAIL_TIME;
}
