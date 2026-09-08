/**
 * Fornyelsens to varsler — rene funktioner, husets mailfamilie.
 *
 * BESLUTTET (Jonas 7/9): varsel 1 ved 30 dage før slutdato, varsel 2 ved
 * 7 dage. Motoren afgoerForfaldentVarsel (_shared/fornyelsesvarsel.ts)
 * afgør HVEM der står til HVAD; denne fil afgør kun HVAD DER STÅR i
 * mailen. Afsendelsen og stemplingen (varsel_1_sendt_at /
 * varsel_2_sendt_at, #674) bygges i fornyelsesvarsel-cron i NÆSTE PR —
 * denne fil kan læses og rettes uden at noget kan sende.
 *
 * KUN _shared, INTET SPEJL i src/lib: frontenden viser aldrig mailene,
 * kun cronen (Deno) bygger dem. Samme placering som indgangsMail.ts og
 * opslagsMail.ts. Testet fra vitest ved direkte import
 * (src/lib/__tests__/fornyelsesMail.test.ts — opslagsMail-mønstret).
 *
 * FORMEN er indgangsMail.ts: samme layout (indgangsMailHtml), samme
 * knap, samme escaping, formatKr og tiltale genbrugt. Ingen ny familie.
 *
 * TONEN er invitation, ikke advarsel — som fornyelsesbåndet på forsiden
 * (FornyelsesBaand.tsx): medlemmet har fuld adgang og mister ingen dage
 * ved at handle nu, for den nye periode begynder hvor den nuværende
 * slutter (beregnFornyelsesperiode, #684).
 *
 * INGEN «Betal nu»-knap til Stripe: checkout kræver en session og skal
 * åbnes fra platformen, hvor tilstanden er dømt (opret-fornyelse-checkout
 * kræver klar_til_tilbud eller udloebet_tilbyd). Knappen peger på
 * forsiden, hvor båndet står, og hedder som båndets knap.
 *
 * CALENDLY-LINKET er et ALMINDELIGT link, ikke et engangslink: betalte
 * bookinger registreres aldrig tilbage i platformen (målt 3/9), så vi
 * lover ikke en måling vi ikke kan holde. Det står som tekst i mailen
 * (layoutet har én knap, og den er forsidens).
 *
 * REN: ingen IO, ingen datoer. Kalderen formaterer slutDato som tekst
 * («27. september 2026», formatDanskDato) og sender beløbet i hele kroner.
 * Virksomhedens navn escapes af layoutet.
 */
import { formatKr, indgangsMailHtml, tiltale, type IndgangsMail } from "./indgangsMail.ts";
import type { Betalingsmodel } from "./fornyelsespris.ts";

const APP_URL = "https://app.theboardroom.dk";

/** Forsiden — dér står fornyelsesbåndet med prisen og knappen. */
export const FORNYELSE_FORSIDE_URL = `${APP_URL}/`;

/** «En snak om din fornyelse» hos Jonas. Almindeligt link (se filhovedet). */
export const FORNYELSE_CALENDLY_URL = "https://calendly.com/topix-jonas/fornyelse";

/** template_name i email_send_log og label i køen — til næste PR's afsendelse. */
export const LABEL_VARSEL_1 = "fornyelse-varsel1";
export const LABEL_VARSEL_2 = "fornyelse-varsel2";
/** Kvitteringen efter betalingen (8/9) — template_name i email_send_log og label hos Lovable. */
export const LABEL_KVITTERING = "fornyelse-kvittering";

const HILSEN = "Venlig hilsen\nJonas Herlev";
const KNAP = { tekst: "Forny medlemskabet", url: FORNYELSE_FORSIDE_URL };

export interface FornyelsesMailArgs {
  fornavn: string | null | undefined;
  /** companies.name — går ind i teksten, escapes af layoutet. */
  virksomhed: string;
  /** Slutdatoen som tekst («27. september 2026»). */
  slutDato: string;
  /** Fornyelsesprisen i hele kroner ekskl. moms (grundbeløbet, ikke ratesummen). */
  beloebKr: number;
}

/**
 * Varsel 1 — 30 dage før slutdato. Hele invitationen: datoen, prisen, at
 * de kan forny nu uden at miste dage, knappen til forsiden, og
 * Calendly-linket hvis de er i tvivl.
 */
export function varsel1Mail(a: FornyelsesMailArgs): IndgangsMail {
  return {
    subject: `Dit år med The Boardroom slutter ${a.slutDato}`,
    html: indgangsMailHtml({
      overskrift: tiltale("Kære", a.fornavn),
      afsnit: [
        `Dit år med The Boardroom slutter ${a.slutDato}. Vi vil gerne have ${a.virksomhed} med et år mere.`,
        `Prisen for det næste år er ${formatKr(a.beloebKr)} kr. ekskl. moms.`,
        "Du kan forny allerede nu. Den nye periode begynder dér, hvor den nuværende slutter, så du mister ingen dage ved at gøre det i dag.",
      ],
      knap: KNAP,
      efterKnap: [
        `Er du i tvivl, så tag en snak med Jonas først. Book et kvarter her: ${FORNYELSE_CALENDLY_URL}`,
        "Vi glæder os til at fortsætte sammen med dig.",
      ],
      hilsen: HILSEN,
    }),
  };
}

/**
 * Hvornår slutter det, sagt som man selv ville sige det (besluttet 7/9):
 *   dag 0  → «i dag»      dag 1 → «i morgen»      dag 2-7 → datoen.
 * Fundet i tørkørsel 7/9: varsel 2 sendes ved SYV DAGE ELLER FÆRRE — også
 * på dag 0 — og «Om en uge» var usandt på CARMA STUDIOs sidste dag.
 * Dagtallet er motorens (afgoerForfaldentVarsel → dage_til_udloeb) og
 * regnes aldrig her; null (slutdatoen kunne ikke læses — motoren sender
 * så ikke) og alt uden for 0-1 giver datoformen. På dag 0 og 1 bærer
 * brødteksten datoen som præcisering («i dag, 7. september 2026»), så
 * emne og tekst siger det samme, og datoen stadig står ét sted.
 */
function slutterHvornaar(dageTilUdloeb: number | null, slutDato: string): { emne: string; tekst: string } {
  if (dageTilUdloeb === 0) return { emne: "i dag", tekst: `i dag, ${slutDato}` };
  if (dageTilUdloeb === 1) return { emne: "i morgen", tekst: `i morgen, ${slutDato}` };
  return { emne: slutDato, tekst: slutDato };
}

/**
 * Varsel 2 — 7 dage eller færre før slutdato. Kortere: hvornår, prisen,
 * knappen. Ingen ny information — en påmindelse, ikke en gentagelse af
 * varsel 1. dageTilUdloeb er en tilføjelse KUN til varsel 2 (varsel 1
 * bruger den ikke, og dens signatur er urørt).
 */
export function varsel2Mail(a: FornyelsesMailArgs & { dageTilUdloeb: number | null }): IndgangsMail {
  const slutter = slutterHvornaar(a.dageTilUdloeb, a.slutDato);
  return {
    subject: `Påmindelse: dit medlemskab slutter ${slutter.emne}`,
    html: indgangsMailHtml({
      overskrift: tiltale("Hej", a.fornavn),
      afsnit: [
        `En kort påmindelse: dit medlemskab slutter ${slutter.tekst}, og det kan fornys med et par klik — ${formatKr(a.beloebKr)} kr. ekskl. moms for det næste år.`,
      ],
      knap: KNAP,
      hilsen: HILSEN,
    }),
  };
}

// ── Kvitteringen — efter betalingen (8/9) ────────────────────────────────
//
// HVORFOR: medlemmet betalte for et helt år og fik en toast der
// forsvandt (recon-efter-fornyelsen.md §2). Ingen mail, intet skriftligt
// spor fra os — kun Stripes egen kvittering. Denne mail siger tak, HVAD de
// har købt (beløbet og betalingsmodellen, ved rater hvad der trækkes
// hvornår), HVOR LÆNGE (den nye slutdato, skrevet ud) og et link ind.
// Sendes af stripe-webhookens fornyelsesgren EFTER at perioden er skrevet
// og contract_end_date er sat — aldrig før — og fejler den, rulles intet
// tilbage (webhooken fanger og logger).
//
// REN som varslerne: kalderen formaterer slutdatoen som tekst
// (formatDanskDato) og sender beløbene i ØRE, som Stripe og
// company_perioder bærer dem; raterne kan have ører (2.187,50), og de må
// ikke forsvinde i formateringen (samme regel som MembershipExpiredGate.kr).

/** Øre → dansk kronestreng: hele beløb uden decimaler («2.000»), skæve med to («2.187,50»). */
export function formatKrOere(oere: number): string {
  const kroner = oere / 100;
  const hel = Math.trunc(kroner);
  const rest = Math.round(Math.abs(kroner - hel) * 100);
  const helTekst = formatKr(hel);
  return rest === 0 ? helTekst : `${helTekst},${String(rest).padStart(2, "0")}`;
}

/** Hvor mange træk hver model giver — samme tal som fornyelsespris.ts' TRAEK. */
const ANTAL_TRAEK: Record<Betalingsmodel, number> = { fuld: 1, rate2: 2, rate12: 12 };

export interface FornyelsesKvitteringArgs {
  fornavn: string | null | undefined;
  /** companies.name — escapes af layoutet. */
  virksomhed: string;
  /** Den NYE slutdato som tekst («29. september 2027»). */
  nySlutDato: string;
  betalingsmodel: Betalingsmodel;
  /** Det samlede beløb for perioden i øre (metadata.samlet_oere — rate12 bærer 5 %-tillægget). */
  samletOere: number;
}

/**
 * Sætningen om hvad der er købt — én pr. betalingsmodel. Datoer for
 * raterne skrives ikke ud: Stripe afgør trækdagen ud fra abonnementets
 * start, og et forkert tal er værre end «om seks måneder».
 */
function koebsSaetning(a: FornyelsesKvitteringArgs): string {
  const samlet = formatKrOere(a.samletOere);
  const rate = formatKrOere(a.samletOere / ANTAL_TRAEK[a.betalingsmodel]);
  switch (a.betalingsmodel) {
    case "fuld":
      return `Du har fornyet medlemskabet for ${a.virksomhed} med et år: ${samlet} kr. ekskl. moms, betalt på én gang.`;
    case "rate2":
      return `Du har fornyet medlemskabet for ${a.virksomhed} med et år: ${samlet} kr. ekskl. moms i to rater à ${rate} kr. — den første er trukket nu, den anden om seks måneder.`;
    case "rate12":
      return `Du har fornyet medlemskabet for ${a.virksomhed} med et år: ${samlet} kr. ekskl. moms i tolv rater à ${rate} kr. — den første er trukket nu, derefter én gang om måneden i elleve måneder.`;
  }
}

/** Kvitteringen. Emnet bærer den nye slutdato, så mailen kan findes igen. */
export function kvitteringMail(a: FornyelsesKvitteringArgs): IndgangsMail {
  return {
    subject: `Tak — dit medlemskab er fornyet til ${a.nySlutDato}`,
    html: indgangsMailHtml({
      overskrift: tiltale("Kære", a.fornavn),
      afsnit: [
        "Tak for fornyelsen — vi glæder os til et år mere sammen.",
        koebsSaetning(a),
        `Din adgang løber til og med ${a.nySlutDato}. Kvitteringen for selve betalingen kommer fra Stripe i en separat mail.`,
      ],
      knap: { tekst: "Gå til The Boardroom", url: FORNYELSE_FORSIDE_URL },
      efterKnap: ["Har du spørgsmål til fornyelsen, så svar på denne mail eller skriv til jonas@topix.dk."],
      hilsen: HILSEN,
    }),
  };
}
