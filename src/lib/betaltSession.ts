/**
 * src/lib/betaltSession.ts
 *
 * Dommen over de BETALTE 1:1-sessioner (advisor 'jonas', amount_dkk > 0) —
 * ren og testet (src/lib/__tests__/betaltSession.test.ts). Søsteren til
 * lib/introSession (Mortens gratis spor), som den låner formatIntroTid fra.
 *
 * BAGGRUND (kort 76, mangelliste «De betalte 1:1-sessioner stopper ved
 * booking_sent», prod målt 11/9 kl. 11:18): tre betalte stod som
 * booking_sent uden calendly_event_uri, ni som pending. Betalte bookinger
 * blev aldrig registreret tilbage i platformen: stripe-webhook skrev
 * Calendlys link råt uden booking-id, og calendly-webhook matchede kun
 * advisor = 'morten'. «Kræver Calendly premium» (3/9) var FALSK — målt
 * 13/9: planen tillader webhooks, der var blot nul abonnementer i Jonas'
 * org. REPARERET 13/9 aften (recon-calendly-reparationen.md): stripe-
 * webhook indlejrer nu rækkens id i linket, og calendly-webhook matcher
 * begge spor (advisor-filteret er flyttet til genåbnings-gaten, dommen i
 * _shared/calendlyWebhookDom.ts). Kæden lukker først når Jonas' abonnement
 * og signing key er oprettet (uden for repoet) — og kun for køb EFTER det.
 * De to Rallysupport-rækker (køb 23/6 og 30/6) fik status booked og
 * start_tid sat i HÅNDEN fra Calendly (målt 13/9: «Event started 25 June
 * at 09:45 (CEST)» og «1 July at 08:30 (CEST)»), fordi deres links (juni)
 * aldrig bar et id — webhooken kan ikke ramme dem. Sluttiden kender
 * Calendly-siden ikke, og en booking-dato har rækken ingen kolonne til.
 *
 * BESLUTTET 11/9: fladen siger det den VED — at pengene er betalt og
 * linket er sendt — og lader ikke som om den ved, om sessionen blev holdt.
 *
 * HVAD RÆKKEN VED — pr. status (CHECK i 20260407114258:8: pending | paid |
 * booking_sent | booked | cancelled | refunded):
 *
 *   pending       Skrevet af create-stripe-checkout:154 FØR betalingen; en
 *                 checkout der aldrig blev gennemført bliver stående her
 *                 for altid. Intet er betalt → INGEN linje (besluttet 11/9:
 *                 «pending vises ikke»). Tilstand «ikke_gennemfoert».
 *   paid          Står i CHECK'en, men ingen kode skriver den (grep 13/9:
 *                 0 i supabase/functions). Skulle den dukke op: betalingen
 *                 er registreret, linket er ikke → «Betalt {dato} ·
 *                 booking-link ikke sendt».
 *   booking_sent  stripe-webhook:1356-1362 sætter status, payment_intent og
 *                 calendly_booking_url i ÉN update efter
 *                 checkout.session.completed (mode = payment). Det er
 *                 «betalt» → «Betalt {dato} · booking-link sendt». Ingen
 *                 afholdt-dom: rækken ved ikke om linket blev brugt.
 *   booked        Sættes af calendly-webhook (fra 13/9 også for Jonas'
 *                 spor) eller i hånden. TIDEN ER BEVISET, IKKE URI'EN
 *                 (ændret 13/9): ordet booked alene beviser ingen tid, men
 *                 HAR rækken en start_tid eller slut_tid, ER der en tid.
 *                 URI'en var kun porten fordi webhooken plejede at sætte
 *                 begge — for håndsatte rækker findes den ikke, og den
 *                 beviser intet tiden ikke allerede beviser. Grænsen er
 *                 slut_tid når den findes, ellers start_tid: Calendly viser
 *                 kun «Event started», og at opfinde en varighed for at
 *                 kunne bruge slut_tid ville være at digte. En session der
 *                 er startet, er begyndt. Grænse passeret → «Betalt {dato}
 *                 · afholdt {mødedato}»; grænse forude → «Betalt {dato} ·
 *                 booket til {tid}». UDEN nogen tid behandles booked som
 *                 booking_sent — uanset URI.
 *   cancelled     Aflyst efter betaling. Om pengene kom tilbage, ved rækken
 *                 ikke (det ville være refunded) → «Betalt · aflyst».
 *   refunded      Ingen kode skriver den; står den der, er pengene sendt
 *                 retur → «Betalt · refunderet».
 *   (andet)       Ukendt status → ingen linje.
 *
 * «BETALT» udledes af rækken alene: amount_dkk > 0 (sporet koster penge —
 * gratis rækker har 0 og hører til introSession) OG status er forbi
 * pending. Kun stripe-webhook flytter en betalt række forbi pending, og
 * kun efter Stripes checkout.session.completed. amount_dkk > 0 alene
 * betyder kun at sessionen KOSTER, ikke at den er betalt.
 *
 * DATOEN på «Betalt {dato}» er created_at — IKKE updated_at (rettet 13/9):
 *
 *   created_at er checkout-STARTEN, og en Stripe-session kan i teorien
 *   betales op til 24 timer senere — men created_at er den eneste dato
 *   ingen trigger kan flytte. Målt på de to ægte køb (13/9): 12:18:15 →
 *   12:19:07 og 10:25:43 → 10:26:31, altså under et minut fra checkout til
 *   webhook. På dagsniveau er de identiske.
 *
 *   updated_at ER stadig betalingen for rækker webhooken alene har rørt —
 *   men fladen kan ikke skelne dem fra rækker en admin har rettet. Det
 *   skete 13/9: to rækker fik company_id rettet i SQL editoren
 *   (Rallysupports køb, som create-stripe-checkout havde efterladt uden
 *   virksomhed), og trigger update_session_bookings_updated_at
 *   (20260407114258:31) stemplede updated_at til nu. Skærmen sagde derpå
 *   «Betalt 13. september» for køb fra 23. og 30. juni, og forsøg på at
 *   sætte updated_at tilbage i SQL fejlede — triggeren vinder hver gang
 *   (målt 13/9 kl. 20:13: begge rækker 2026-09-13 18:13:36). En forkert
 *   dato er værre end en dato der er et minut for tidlig.
 *
 *   NOTE: stripe_payment_intent_id findes på rækken (målt 13/9) og bærer
 *   det præcise betalingstidspunkt i Stripe. Skal datoen være eksakt, er
 *   det kilden — det ville kræve et Stripe-opslag og er ikke gjort her.
 *
 * LINJEN BÆRER TO DATOER (besluttet 13/9): «Betalt {dato} · afholdt
 * {dato}» og «Betalt {dato} · booket til {tid}» — samme form som «Betalt
 * {dato} · booking-link sendt», så linjen læses ens uanset tilstand, og
 * pengene står først i alle. IKKE tre datoer: «booket den …» udelades,
 * fordi rækken ikke har en kolonne til bookingtidspunktet, og en ny
 * kolonne ville stå tom for alle fremtidige køb indtil Calendly-kæden er
 * repareret. Målt 13/9: Rallysupport bookede fire og atten minutter efter
 * betalingen — bookingdatoen er betalingsdatoen på dagsniveau.
 */

import { formatIntroTid } from "@/lib/introSession";

export interface BetaltBooking {
  /** session_bookings.status — se listen i filhovedet. */
  status: string;
  /** Prisen i kr. 0 = gratis spor (introSession); > 0 = betalt spor. */
  amount_dkk: number;
  /** Sat af calendly-webhook ved invitee.created. Læses IKKE af dommen (13/9): tiden er beviset. */
  calendly_event_uri: string | null;
  /** ISO (UTC) eller null — fra webhooken (20260908190000) eller sat i hånden fra Calendly. */
  start_tid: string | null;
  /** Kendes ikke for håndsatte rækker (Calendly viser kun «Event started»). */
  slut_tid: string | null;
  /** Checkout-start — betalingsdatoen på fladen (den eneste dato ingen trigger flytter). */
  created_at: string;
  /** Læses IKKE af dommen (13/9): trigger-stemplet, flyttes af enhver admin-rettelse. Tolereres i input. */
  updated_at?: string | null;
}

export type BetaltTilstand =
  /** Rækken er ikke på det betalte spor (amount_dkk = 0). */
  | "gratis_spor"
  /** Checkout startet, aldrig betalt. Vises ikke. */
  | "ikke_gennemfoert"
  /** Betalt, intet link (status paid — skrives ikke i dag). */
  | "betalt_uden_link"
  /** Betalt, link sendt — det mest vi ved i dag. */
  | "betalt_link_sendt"
  /** booked med tid, grænsen (slut_tid, ellers start_tid) passeret. */
  | "afholdt"
  /** booked med tid, grænsen forude. */
  | "booket"
  /* «booket_uden_tid» findes ikke længere (13/9): booked uden nogen tid er
     «betalt_link_sendt», uanset URI — ordet alene beviser ingen tid. */
  | "aflyst"
  | "refunderet"
  | "ukendt";

export interface BetaltDom {
  tilstand: BetaltTilstand;
  /** Betalingsdatoen (created_at — se filhovedet). Null når ikke betalt eller ugyldig dato. */
  betalt: Date | null;
  start: Date | null;
  slut: Date | null;
}

function somDato(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Betalt = koster penge OG forbi pending. Kun stripe-webhook flytter en
    betalt række forbi pending, og kun efter checkout.session.completed. */
export function erBetalt(b: Pick<BetaltBooking, "status" | "amount_dkk"> | null | undefined): boolean {
  if (!b) return false;
  if (!(b.amount_dkk > 0)) return false;
  return ["paid", "booking_sent", "booked", "cancelled", "refunded"].includes(b.status);
}

export function afgoerBetaltSession(b: BetaltBooking | null | undefined, nu: Date): BetaltDom {
  const tom: BetaltDom = { tilstand: "ukendt", betalt: null, start: null, slut: null };
  if (!b) return tom;
  if (!(b.amount_dkk > 0)) return { ...tom, tilstand: "gratis_spor" };
  if (b.status === "pending") return { ...tom, tilstand: "ikke_gennemfoert" };
  if (!erBetalt(b)) return tom;

  // created_at, aldrig updated_at: triggeren flytter updated_at ved enhver
  // rettelse, og fladen kan ikke se hvem der rørte rækken (13/9).
  const betalt = somDato(b.created_at);
  const start = somDato(b.start_tid);
  const slut = somDato(b.slut_tid);
  const dom = (tilstand: BetaltTilstand): BetaltDom => ({ tilstand, betalt, start, slut });

  switch (b.status) {
    case "paid":
      return dom("betalt_uden_link");
    case "booking_sent":
      return dom("betalt_link_sendt");
    case "booked": {
      // Tiden er beviset, ikke URI'en (13/9). Uden nogen tid beviser ordet
      // booked intet — så er det «link sendt». Grænsen er slut_tid når den
      // findes, ellers start_tid (Calendly giver kun «Event started»).
      const graense = slut ?? start;
      if (graense == null) return dom("betalt_link_sendt");
      if (graense.getTime() <= nu.getTime()) return dom("afholdt");
      return dom("booket");
    }
    case "cancelled":
      return dom("aflyst");
    case "refunded":
      return dom("refunderet");
    default:
      return tom;
  }
}

/** Linjens ord på virksomhedssiden. null = ingen linje (pending, gratis spor, ukendt). */
export function betaltSessionTekst(dom: BetaltDom): string | null {
  const betaltDato = dom.betalt ? ` ${formatIntroTid(dom.betalt, false)}` : "";
  switch (dom.tilstand) {
    case "betalt_link_sendt":
      return `Betalt${betaltDato} · booking-link sendt`;
    case "betalt_uden_link":
      return `Betalt${betaltDato} · booking-link ikke sendt`;
    // Begge datoer, pengene først — samme form som «booking-link sendt».
    // Mødedatoen er starten når den findes, ellers slutningen.
    case "afholdt":
      return `Betalt${betaltDato} · afholdt ${formatIntroTid(dom.start ?? (dom.slut as Date), false)}`;
    case "booket":
      return `Betalt${betaltDato} · booket til ${formatIntroTid(dom.start ?? (dom.slut as Date), true)}`;
    case "aflyst":
      return "Betalt · aflyst";
    case "refunderet":
      return "Betalt · refunderet";
    default:
      return null;
  }
}
