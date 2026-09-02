/**
 * Værnet mod dobbeltbetaling — én åben Checkout-session ad gangen.
 *
 * PROBLEMET, målt 2/9: ingen af husets fire checkout-funktioner gemte
 * session-id'et, sendte en idempotency-nøgle eller tjekkede efter en åben
 * session. Tilstandsværnene (udloebet_tilbyd, hent_betalingsdata_til_checkout)
 * virker FØRST efter webhooken har skrevet — indtil da levede sessionen i
 * 24 timer og kunne betales uanset hvad databasen sagde. To faner = to
 * sessioner = to betalinger, og ved rater to abonnementer på samme kort.
 * Bevist i drift: en åben session på 5.468,75 kr. lå betalbar tyve timer
 * efter fanen var lukket.
 *
 * MÅLT OM STRIPE: der findes ingen indstilling for «kun én åben session
 * ad gangen». Dokumentationen siger: «Check for open Checkout Sessions
 * after a successful completion. Expire any open Sessions for the same
 * Customer using the /expire API endpoint. Implement this logic manually
 * as it's not provided out-of-the-box.» GET /v1/checkout/sessions har
 * intet metadata-filter, så vi GEMMER id'et (company_betalingslink /
 * companies.sidste_checkout_session_id, session_bookings.stripe_session_id)
 * frem for at søge.
 *
 * MØNSTRET i hver checkout-funktion, i denne rækkefølge:
 *   a) FØR sessionen oprettes: læs det gemte id og kald
 *      udloebTidligereSession. Fejler det, fortsæt — en betaling må ikke
 *      blokeres fordi en gammel session ikke kunne lukkes.
 *   b) Sæt expires_at på den nye session til udloebsTidspunkt().
 *   c) EFTER oprettelsen, FØR url'en returneres: gem session.id. Fejler
 *      skrivningen, log tydeligt, men returnér stadig url'en.
 * Webhooken nulstiller feltet når betalingen er behandlet.
 */

/**
 * 30 minutter er Stripes MINIMUM for expires_at (grænsen er 30 minutter
 * til 24 timer; default er 24 timer). Det korte vindue er selve værnet:
 * jo kortere en session lever, jo mindre er risikoen for at en glemt fane
 * bliver betalt efter at en anden session er gennemført.
 */
export const CHECKOUT_UDLOEB_MINUTTER = 30;

/** Unix-sekunder for now + CHECKOUT_UDLOEB_MINUTTER — værdien til Stripes expires_at. */
export function udloebsTidspunkt(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000) + CHECKOUT_UDLOEB_MINUTTER * 60;
}

/**
 * Udløber en tidligere Checkout-session med det samme via
 * POST /v1/checkout/sessions/{id}/expire.
 *
 * KASTER ALDRIG. Fejler kaldet — typisk fordi sessionen allerede er
 * complete (betalt) eller expired (død) — logges det som info, og der
 * fortsættes. En session der ikke kan udløbes, er enten allerede brugt
 * eller allerede død; begge dele er fine. Er sessionId null eller tom,
 * gøres intet.
 */
export async function udloebTidligereSession(
  sessionId: string | null | undefined,
  stripeSecretKey: string,
): Promise<void> {
  const id = (sessionId ?? "").trim();
  if (!id) return;

  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(id)}/expire`, {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    });
    if (res.ok) {
      console.log(`[checkoutSession] tidligere session ${id} udløbet`);
      return;
    }
    const tekst = await res.text().catch(() => "");
    // Forventet ved complete/expired: Stripe svarer 400 med en besked om
    // at sessionen ikke er open. Info, ikke fejl.
    console.log(`[checkoutSession] tidligere session ${id} kunne ikke udløbes (status ${res.status}) — formentlig allerede betalt eller udløbet: ${tekst.slice(0, 200)}`);
  } catch (err) {
    console.log(`[checkoutSession] tidligere session ${id} kunne ikke udløbes (netværk):`, err instanceof Error ? err.message : err);
  }
}
