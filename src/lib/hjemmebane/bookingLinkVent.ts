/**
 * src/lib/hjemmebane/bookingLinkVent.ts
 *
 * Ventetiden på det personlige booking-link efter betaling af en session
 * (/book-session?success=true&session_id=…). Rene regler, testet i
 * __tests__/bookingLinkVent.test.ts.
 *
 * FEJLEN (analyse-medlemsrejse 30/9 §2.9, målt i koden 30/9):
 * BookSessionView pollede session_bookings med `refetchInterval: 2000`, så
 * længe `calendly_booking_url` manglede — uden loft og uden fejlbesked, og
 * queryFn'en læste kun `data`, aldrig `error`. Landede webhooken aldrig,
 * stod medlemmet med «Henter dit booking-link...» for evigt, og siden
 * spurgte databasen hvert andet sekund, så længe fanen var åben.
 *
 * REGLEN: poll hvert BOOKING_LINK_POLL_MS, højst BOOKING_LINK_FRIST_MS fra
 * ventetidens start. Derefter — eller når hentningen fejler — stopper
 * pollingen, og medlemmet får en rolig besked med «Prøv igen», der
 * starter en ny ventetid. Intervallet ryddes af React Query, når fladen
 * unmountes (observeren afmeldes); fristens egen timer ryddes af effekten.
 *
 * Regnestykket: 60 s / 2 s = 30 forespørgsler pr. ventetid, mod ubegrænset
 * før. Linket laves normalt på sekunder (Stripe-webhook → Calendly-link);
 * et minut er rigeligt til et normalt forløb og kort nok til, at
 * medlemmet ikke stirrer på en spinner.
 */

export const BOOKING_LINK_POLL_MS = 2_000;
export const BOOKING_LINK_FRIST_MS = 60_000;

export type BookingLinkTilstand = "klar" | "henter" | "udloebet" | "fejlet";

export interface BookingLinkInput {
  /** Rækken har et calendly_booking_url. */
  harLink: boolean;
  /** Hentningen er i fejltilstand (efter React Querys genforsøg). */
  fejlet: boolean;
  /** Millisekunder siden ventetiden startede (mount eller «Prøv igen»). */
  forloebetMs: number;
}

/** Fladens dom. Et link vinder altid — også hvis det kom efter fristen. */
export function bookingLinkTilstand(i: BookingLinkInput): BookingLinkTilstand {
  if (i.harLink) return "klar";
  if (i.fejlet) return "fejlet";
  if (i.forloebetMs >= BOOKING_LINK_FRIST_MS) return "udloebet";
  return "henter";
}

/** refetchInterval: poll KUN mens tilstanden er «henter». */
export function bookingLinkInterval(i: BookingLinkInput): number | false {
  return bookingLinkTilstand(i) === "henter" ? BOOKING_LINK_POLL_MS : false;
}

/** Beskeden, når linket ikke er kommet — betalingen ER modtaget, og intet er tabt. */
export const BOOKING_LINK_VENTER_TEKST =
  "Dit booking-link er ikke klar endnu. Din betaling er modtaget, og linket sendes også til din mail, når det er klar. Prøv igen om lidt — eller skriv til os, hvis det ikke kommer.";
