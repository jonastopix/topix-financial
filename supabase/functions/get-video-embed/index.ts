// get-video-embed — signerede Bunny-embed-URL'er til Akademiet (C1 trin 3).
//
// Bucket A: authenticateUser FØRST. Adgangskontrollen er RLS'ens
// published-gate via callerClient (medlemmer kan ikke læse drafts — advisors
// kan, hvilket giver dem preview). Ingen service-role-klient.
//
// D5 (godkendt): dryp-tjekket genberegnes SERVER-SIDE før signering — embed-
// URL'er, det eneste aktiv med reel lækage-værdi, udleveres aldrig for låst
// indhold. B6 er uændret (ingen RLS-dryp, ingen ny SECURITY DEFINER); anker
// er company_members.created_at (C0-afgørelse 3), advisors bypasser, og
// dryppet indhold uden anker fail-closer.
//
// Token-signering jf. c0-bunny.md §5: sha256hex(TOKEN_AUTH_KEY + guid +
// expires) — nøglen rører ALDRIG frontend; klienten modtager kun den
// færdige, tidsbegrænsede URL (TTL 1 time).
//
// POST { itemId, resumeAt? } → { embedUrl, expires }

import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMBED_TTL_SECONDS = 3600;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 1. Auth (Bucket A) — FØR alt andet ──────────────────────────────────
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // ── 2. Parse + validér input ────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { itemId, resumeAt } = (body ?? {}) as { itemId?: unknown; resumeAt?: unknown };
  if (typeof itemId !== "string" || !UUID_RE.test(itemId)) {
    return jsonResponse({ error: "Invalid itemId" }, 400);
  }
  const resume =
    typeof resumeAt === "number" && Number.isInteger(resumeAt) && resumeAt > 0 && resumeAt < 86400
      ? resumeAt
      : null;

  // ── 3. RLS-gated opslag via callerClient (published-gate for medlemmer) ─
  const { data: item, error: itemError } = await callerClient
    .from("content_items")
    .select("id, media_provider, bunny_video_id, drip_after_days, collection_id")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError) return jsonResponse({ error: "Lookup failed" }, 500);
  if (!item) return jsonResponse({ error: "Not found" }, 404);
  if (item.media_provider !== "bunny" || !item.bunny_video_id) {
    return jsonResponse({ error: "Item has no Bunny video" }, 400);
  }

  // ── 4. Dryp-tjek server-side (D5) — advisors bypasser ───────────────────
  const { data: isAdvisor } = await callerClient.rpc("has_role", {
    _user_id: callerId,
    _role: "advisor",
  });

  if (!isAdvisor) {
    let drip: number | null = item.drip_after_days ?? null;
    if (drip === null && item.collection_id) {
      const { data: collection } = await callerClient
        .from("content_collections")
        .select("drip_after_days")
        .eq("id", item.collection_id)
        .maybeSingle();
      drip = collection?.drip_after_days ?? null;
    }
    if (drip !== null) {
      const { data: membership } = await callerClient
        .from("company_members")
        .select("created_at")
        .eq("user_id", callerId)
        .maybeSingle();
      const joined = membership?.created_at ? new Date(membership.created_at).getTime() : NaN;
      // Fail-closed: dryppet indhold uden gyldigt anker er låst.
      if (Number.isNaN(joined) || Date.now() < joined + drip * MS_PER_DAY) {
        return jsonResponse({ error: "dripped" }, 403);
      }
    }
  }

  // ── 5. Signér embed-URL'en (c0-bunny.md §5) ─────────────────────────────
  const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID") ?? "";
  const tokenAuthKey = Deno.env.get("BUNNY_STREAM_TOKEN_AUTH_KEY") ?? "";
  if (!libraryId || !tokenAuthKey) {
    return jsonResponse({ error: "not_configured" }, 503);
  }

  const expires = Math.floor(Date.now() / 1000) + EMBED_TTL_SECONDS;
  const token = await sha256Hex(`${tokenAuthKey}${item.bunny_video_id}${expires}`);
  const embedUrl =
    `https://iframe.mediadelivery.net/embed/${libraryId}/${item.bunny_video_id}` +
    `?token=${token}&expires=${expires}` +
    (resume ? `&t=${resume}` : "");

  return jsonResponse({ embedUrl, expires });
});
