// Prisopslag på lookup_key i stedet for hardkodede price-id'er.
//
// HVORFOR NØGLE FREM FOR ID: et price-id er konto-specifikt — det findes
// kun på den konto der oprettede prisen, og brækker i samme øjeblik
// STRIPE_SECRET_KEY peger på en anden konto. En lookup_key er en ROLLE
// ("session_1on1", "abonnement_maanedlig"), som kan oprettes på begge
// konti og pege på det rigtige produkt hvert sted. Et opslag på nøgle
// virker derfor både før og efter et kontoskifte; et hardkodet id gør
// ikke.
//
// INGEN CACHING: ét opslag pr. kald er billigt, og en cache ville
// overleve et kontoskifte og servere et id fra den forkerte konto.

export async function hentPrisId(
  lookupKey: string,
  stripeSecretKey: string
): Promise<string> {
  const url = new URL("https://api.stripe.com/v1/prices");
  url.searchParams.set("lookup_keys[]", lookupKey);
  url.searchParams.set("active", "true");
  url.searchParams.set("limit", "2");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${stripeSecretKey}` },
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`[stripePris] price lookup failed for '${lookupKey}':`, err);
    throw new Error(`Stripe price lookup failed for lookup_key '${lookupKey}'`);
  }

  const { data } = await response.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No active Stripe price with lookup_key '${lookupKey}'`);
  }
  if (data.length > 1) {
    // To aktive priser med samme nøgle må ikke kunne ske. Sker det, skal
    // det stoppe frem for at vælge tilfældigt.
    throw new Error(
      `${data.length} active Stripe prices with lookup_key '${lookupKey}' — expected exactly one`
    );
  }

  return data[0].id;
}
