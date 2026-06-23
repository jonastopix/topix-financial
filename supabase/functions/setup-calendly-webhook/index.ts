// Engangs-opsaetning: opretter Mortens Calendly webhook-abonnement og returnerer signing key.
// Beskyttet af CALENDLY_SETUP_SECRET. Fjernes efter brug.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WEBHOOK_URL = "https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/calendly-webhook";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const provided = url.searchParams.get("key");
  const expected = Deno.env.get("CALENDLY_SETUP_SECRET");
  if (!expected) return json({ error: "CALENDLY_SETUP_SECRET er ikke sat" }, 500);
  if (provided !== expected) return json({ error: "Forkert eller manglende key" }, 403);

  const token = Deno.env.get("MORTEN_CALENDLY_API_KEY");
  if (!token) return json({ error: "MORTEN_CALENDLY_API_KEY mangler" }, 500);

  const signingKey = Deno.env.get("CALENDLY_WEBHOOK_SIGNING_KEY");
  if (!signingKey) return json({ error: "CALENDLY_WEBHOOK_SIGNING_KEY skal saettes foer denne koeres" }, 500);

  // 1. Hent Mortens bruger-uri + organisation
  const meRes = await fetch("https://api.calendly.com/users/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meText = await meRes.text();
  if (!meRes.ok) return json({ step: "users/me", status: meRes.status, detail: meText }, 502);
  const me = JSON.parse(meText);
  const userUri = me.resource?.uri;
  const orgUri = me.resource?.current_organization;
  if (!userUri || !orgUri) return json({ step: "users/me", error: "uri/organization mangler", detail: me }, 502);

  // 2. Slet eksisterende abonnementer for vores URL (idempotent oprydning, fjerner ogsaa det signing-loese)
  const listUrl = `https://api.calendly.com/webhook_subscriptions?organization=${encodeURIComponent(orgUri)}&user=${encodeURIComponent(userUri)}&scope=user&count=100`;
  const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
  const listText = await listRes.text();
  if (!listRes.ok) return json({ step: "list", status: listRes.status, detail: listText }, 502);
  const list = JSON.parse(listText);
  const existing = (list.collection || []).filter((s: any) => s.callback_url === WEBHOOK_URL);
  let deleted = 0;
  for (const s of existing) {
    const delRes = await fetch(s.uri, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (delRes.ok) deleted++;
  }

  // 3. Opret nyt abonnement MED signing key
  const subRes = await fetch("https://api.calendly.com/webhook_subscriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: WEBHOOK_URL,
      events: ["invitee.created", "invitee.canceled"],
      organization: orgUri,
      user: userUri,
      scope: "user",
      signing_key: signingKey,
    }),
  });
  const subText = await subRes.text();
  if (!subRes.ok) return json({ step: "webhook_subscriptions", status: subRes.status, detail: subText }, 502);
  const sub = JSON.parse(subText);

  return json({
    ok: true,
    deleted,
    subscription_uri: sub.resource?.uri,
    next: "Webhooken er nu aktiv med signing key. Fjern denne funktion + CALENDLY_SETUP_SECRET ved naeste oprydning.",
  });
});
