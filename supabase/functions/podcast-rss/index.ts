// podcast-rss — dum CORS-proxy for IVÆRKSÆTTERLIVET-feedet (forside PR B2,
// hb-forside-prb-recon §1). INGEN parsing i Deno — parseren er en ren,
// testbar klientfunktion (src/lib/hjemmebane/podcastRss.ts, DOMParser).
//
// Bucket A-skabelonen fra bunny-content-admin: authenticateUser FØRST,
// INGEN service-role-klient — funktionen rører aldrig databasen. Modsat
// bunny-content-admin er der BEVIDST intet advisor-tjek: medlemmer må
// kalde (feedet vises på forsiden).
//
// Feed-URL'en er en KONSTANT — ikke fra requesten: dette er en proxy for
// ÉT kendt feed, aldrig en åben proxy.
//
// Svar: rå XML m. Cache-Control: public, max-age=1800 (CDN/browser
// aflaster; klienten lægger React Query-staleTime ovenpå). Upstream-fejl
// → 502 m. kort JSON; funktionen kaster aldrig.

import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const FEED_URL = "https://anchor.fm/s/101a8bd38/podcast/rss";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── 1. Auth (Bucket A) — FØR alt andet ──────────────────────────────
    const auth = await authenticateUser(req);
    if (auth instanceof Response) return auth;

    // ── 2. Hent feedet ──────────────────────────────────────────────────
    const upstream = await fetch(FEED_URL, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Feed unavailable (upstream ${upstream.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const xml = await upstream.text();
    return new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=1800",
      },
    });
  } catch (error: unknown) {
    console.error("podcast-rss error:", error);
    return new Response(
      JSON.stringify({ error: "Feed unavailable" }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
