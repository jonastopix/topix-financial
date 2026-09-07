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

const APP_URL = "https://app.theboardroom.dk";

/** Forsiden — dér står fornyelsesbåndet med prisen og knappen. */
export const FORNYELSE_FORSIDE_URL = `${APP_URL}/`;

/** «En snak om din fornyelse» hos Jonas. Almindeligt link (se filhovedet). */
export const FORNYELSE_CALENDLY_URL = "https://calendly.com/topix-jonas/fornyelse";

/** template_name i email_send_log og label i køen — til næste PR's afsendelse. */
export const LABEL_VARSEL_1 = "fornyelse-varsel1";
export const LABEL_VARSEL_2 = "fornyelse-varsel2";

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
 * Varsel 2 — 7 dage før slutdato. Kortere: datoen, prisen, knappen.
 * Ingen ny information — en påmindelse, ikke en gentagelse af varsel 1.
 */
export function varsel2Mail(a: FornyelsesMailArgs): IndgangsMail {
  return {
    subject: "Om en uge slutter dit år med The Boardroom",
    html: indgangsMailHtml({
      overskrift: tiltale("Hej", a.fornavn),
      afsnit: [
        `En kort påmindelse: dit medlemskab slutter ${a.slutDato}, og det kan fornys med et par klik — ${formatKr(a.beloebKr)} kr. ekskl. moms for det næste år.`,
      ],
      knap: KNAP,
      hilsen: HILSEN,
    }),
  };
}
