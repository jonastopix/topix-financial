import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

async function verifyStripeSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  const parts = signature.split(",");
  const timestamp = parts.find(p => p.startsWith("t="))?.slice(2);
  const v1 = parts.find(p => p.startsWith("v1="))?.slice(3);
  if (!timestamp || !v1) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return expected === v1;
}

async function getCalendlyEventTypeUri(apiKey: string, slug: string): Promise<string> {
  const response = await fetch("https://api.calendly.com/event_types?count=100", {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  const data = await response.json();
  console.log("[stripe-webhook] Calendly response status:", response.status);
  console.log("[stripe-webhook] Calendly event types:", JSON.stringify(data?.collection?.map((e: any) => ({ slug: e.slug, uri: e.uri, name: e.name })) || data));
  const eventType = (data.collection || []).find((e: any) =>
    e.slug === slug || e.scheduling_url?.includes(slug)
  );
  if (!eventType) throw new Error(`Calendly event type not found for slug: ${slug}. Available: ${JSON.stringify(data?.collection?.map((e: any) => e.slug))}`);
  return eventType.uri;
}

async function createCalendlySingleUseLink(apiKey: string, eventTypeUri: string): Promise<string> {
  const response = await fetch("https://api.calendly.com/scheduling_links", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ max_event_count: 1, owner: eventTypeUri, owner_type: "EventType" }),
  });
  const data = await response.json();
  if (!data.resource?.booking_url) throw new Error("Failed to create Calendly link");
  return data.resource.booking_url;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
  const stripeSignature = req.headers.get("stripe-signature") || "";
  const payload = await req.text();

  const isValid = await verifyStripeSignature(payload, stripeSignature, webhookSecret);
  if (!isValid) {
    console.error("Invalid Stripe signature");
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(payload);
  console.log("[stripe-webhook] Event type:", event.type);

  if (event.type !== "checkout.session.completed") {
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = event.data.object;
  const userId = session.metadata?.user_id;
  const companyId = session.metadata?.company_id || null;
  const stripeSessionId = session.id;
  const paymentIntentId = session.payment_intent;

  if (!userId) {
    console.error("No user_id in session metadata");
    return new Response("Missing metadata", { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const calendlyApiKey = Deno.env.get("CALENDLY_API_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
    // Generate Calendly single-use link
    const eventTypeUri = await getCalendlyEventTypeUri(calendlyApiKey, "1to1-session-45");
    const bookingUrl = await createCalendlySingleUseLink(calendlyApiKey, eventTypeUri);

    // Update booking record
    await adminClient
      .from("session_bookings")
      .update({
        status: "booking_sent",
        stripe_payment_intent_id: paymentIntentId,
        calendly_booking_url: bookingUrl,
      })
      .eq("stripe_session_id", stripeSessionId);

    // Get user email for notification
    const { data: userData } = await adminClient.auth.admin.getUserById(userId);
    const userEmail = userData?.user?.email;

    // Get profile for first name
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle();
    const firstName = profile?.full_name?.split(" ")[0] || "dig";

    // Send in-app notification
    await adminClient.from("notifications").insert({
      user_id: userId,
      company_id: companyId || null,
      type: "session_booked",
      priority: "important",
      title: "Din betaling er modtaget — book din session nu",
      body: "Klik her for at vælge et tidspunkt til din 1:1 session med Jonas.",
      deep_link: "/book-session",
      dedup_key: `session_booked:${stripeSessionId}`,
    });

    // Send email with booking link
    if (userEmail) {
      const subject = "Din 1:1 session med Jonas — vælg et tidspunkt";
      const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <div style="background:#1a1a2e;padding:28px 32px;text-align:center">
    <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:0.5px">The Boardroom</span>
  </div>
  <div style="padding:32px">
    <p style="color:#64748b;font-size:13px;margin:0 0 6px;text-transform:uppercase;letter-spacing:1px">1:1 Session · Jonas Herlev</p>
    <h1 style="color:#1a1a2e;font-size:22px;margin:0 0 20px;font-weight:700">Hej ${firstName} — tak for din betaling!</h1>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 24px">Din betaling er bekræftet. Brug linket herunder til at vælge et tidspunkt der passer dig. Linket er personligt og kan kun bruges én gang.</p>
    <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:14px 18px;border-radius:8px;margin:0 0 28px">
      <p style="color:#15803d;font-size:14px;margin:0">Sessionen varer 45 minutter og afholdes online via Google Meet.</p>
    </div>
    <a href="${bookingUrl}" style="display:inline-block;background:#22c55e;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
      Vælg tidspunkt →
    </a>
  </div>
  <div style="padding:20px 32px;border-top:1px solid #f1f5f9;text-align:center">
    <p style="color:#94a3b8;font-size:12px;margin:0">
      The Boardroom · theboardroom.dk
    </p>
  </div>
</div>`;

      const messageId = crypto.randomUUID();
      await adminClient.from("email_send_log").insert({
        message_id: messageId,
        template_name: "session-booking-confirmation",
        recipient_email: userEmail,
        status: "pending",
      });

      await adminClient.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: userEmail,
          from: "The Boardroom <noreply@mail.topix.dk>",
          sender_domain: "mail.topix.dk",
          subject,
          html,
          text: `Hej ${firstName} — tak for din betaling. Book din session her: ${bookingUrl}`,
          purpose: "transactional",
          label: "session-booking-confirmation",
          queued_at: new Date().toISOString(),
        },
      });
    }

    console.log(`[stripe-webhook] Booking confirmed for user ${userId}, link: ${bookingUrl}`);
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[stripe-webhook] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
