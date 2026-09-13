/**
 * src/lib/betaltSession.ts
 *
 * Dommen over de BETALTE 1:1-sessioner (advisor 'jonas', amount_dkk > 0) —
 * ren og testet (src/lib/__tests__/betaltSession.test.ts). Søsteren til
 * lib/introSession (Mortens gratis spor), som den låner formatIntroTid fra.
 *
 * BAGGRUND (kort 76, mangelliste «De betalte 1:1-sessioner stopper ved
 * booking_sent», prod målt 11/9 kl. 11:18): tre betalte står som
 * booking_sent uden calendly_event_uri, ni som pending. Betalte bookinger
 * registreres aldrig tilbage i platformen: stripe-webhook (index.ts:1356)
 * skriver Calendlys link råt uden booking-id, calendly-webhook matcher kun
 * advisor = 'morten' (:122, :157), og Jonas' Calendly-organisation har ét
 * medlem. Der kommer derfor aldrig booked, tid eller URI på dette spor.
 * Reparationen kræver Calendly premium — nedprioriteret 3/9.
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
 *   booked        Kan kun sættes af calendly-webhook, som i dag filtrerer
 *                 Morten væk. KUN med calendly_event_uri tror vi på ordet:
 *                 med URI og slut_tid passeret → «Afholdt {dato}» (samme
 *                 grænse som introSession.erAfholdt: nu >= slut); med URI og
 *                 tid forude → «Booket til {tid}»; med URI uden tid →
 *                 «Booket — tidspunktet er ikke registreret». UDEN URI
 *                 behandles booked som booking_sent — ordet alene beviser
 *                 ingen tid, og «afholdt» må ikke påstås uden Calendlys URI.
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
 * DATOEN på «Betalt {dato}» er updated_at: den eneste update på dette spor
 * er webhookens (calendly-webhook filtrerer advisor = 'morten' i begge
 * grene; slet-medlemsdata-cron sletter kun), og trigger
 * update_session_bookings_updated_at (20260407114258:31) stempler den.
 * created_at er checkout-STARTEN, ikke betalingen; Stripe-sessionen kan
 * betales op til 24 timer senere. Mangler updated_at, falder vi tilbage
 * på created_at.
 */

import { formatIntroTid } from "@/lib/introSession";

export interface BetaltBooking {
  /** session_bookings.status — se listen i filhovedet. */
  status: string;
  /** Prisen i kr. 0 = gratis spor (introSession); > 0 = betalt spor. */
  amount_dkk: number;
  /** Sat af calendly-webhook ved invitee.created. Uden den tror vi ikke på booked. */
  calendly_event_uri: string | null;
  /** ISO (UTC) eller null — fra webhooken (20260908190000). */
  start_tid: string | null;
  slut_tid: string | null;
  /** Checkout-start. */
  created_at: string;
  /** Webhookens skrivning (trigger). Null tolereres — så bruges created_at. */
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
  /** booked med URI, sluttid passeret. */
  | "afholdt"
  /** booked med URI, tid forude. */
  | "booket"
  /** booked med URI, ingen tid. */
  | "booket_uden_tid"
  | "aflyst"
  | "refunderet"
  | "ukendt";

export interface BetaltDom {
  tilstand: BetaltTilstand;
  /** Betalingsdatoen (updated_at, ellers created_at). Null når ikke betalt. */
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

  const betalt = somDato(b.updated_at) ?? somDato(b.created_at);
  const start = somDato(b.start_tid);
  const slut = somDato(b.slut_tid);
  const dom = (tilstand: BetaltTilstand): BetaltDom => ({ tilstand, betalt, start, slut });

  switch (b.status) {
    case "paid":
      return dom("betalt_uden_link");
    case "booking_sent":
      return dom("betalt_link_sendt");
    case "booked": {
      // Ordet booked beviser intet uden Calendlys URI — så er det «link sendt».
      if (!b.calendly_event_uri) return dom("betalt_link_sendt");
      if (slut != null && slut.getTime() <= nu.getTime()) return dom("afholdt");
      return dom(slut ? "booket" : "booket_uden_tid");
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
    case "afholdt":
      return `Afholdt ${formatIntroTid(dom.start ?? (dom.slut as Date), false)}`;
    case "booket":
      return `Booket til ${formatIntroTid(dom.start ?? (dom.slut as Date), true)}`;
    case "booket_uden_tid":
      return "Booket — tidspunktet er ikke registreret";
    case "aflyst":
      return "Betalt · aflyst";
    case "refunderet":
      return "Betalt · refunderet";
    default:
      return null;
  }
}
