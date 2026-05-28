// Deploy-nudge 2026-05-28: PR #39 (commit b6619f8c) merged uden
// at Lovable auto-deployede denne nye edge function — verificeret
// fraværende i Lovable Edge functions-listen. Denne minimale
// ændring tvinger en ny deploy-cyklus. Funktionens logik er
// uændret.

// Mints a short-lived signed URL for a chat attachment after verifying the
// caller can see the underlying message row via RLS.
//
// Bucket A: authenticateUser → callerClient SELECT (RLS gate) → adminClient
// createSignedUrl. The callerClient (JWT-scoped, anon key) is what enforces
// access — RLS on `messages` / `group_messages` already encodes "who may see
// this message", so re-using it as the gate keeps the security model in one
// place. The adminClient is constructed only AFTER the row is returned and
// is used solely for createSignedUrl.
//
// PR 2 in the chat-attachments private-bucket migration. PR 1 wired the
// message-id/source props through the frontend. PR 3 will swap the
// passthrough helper to call this function. PR 4 flips the bucket to
// private — this function works against the still-public bucket today
// (returns a signed URL pointing at a still-publicly-readable object) and
// will continue to work unchanged once the bucket flips.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC_URL_MARKER = "/storage/v1/object/public/chat-attachments/";
const SIGNED_URL_TTL_SEC = 600;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 1. Auth (Bucket A) — MUST precede any service-role construction ──
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerClient } = auth;

  // ── 2. Parse body ──
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { source, messageId, attachmentIndex } = (body ?? {}) as {
    source?: unknown;
    messageId?: unknown;
    attachmentIndex?: unknown;
  };

  // ── 3. Validate input — hard whitelist, no dynamic table name ──
  if (source !== "messages" && source !== "group_messages") {
    return jsonResponse({ error: "Invalid source" }, 400);
  }
  if (typeof messageId !== "string" || !UUID_RE.test(messageId)) {
    return jsonResponse({ error: "Invalid messageId" }, 400);
  }
  if (!Number.isInteger(attachmentIndex) || (attachmentIndex as number) < 0) {
    return jsonResponse({ error: "Invalid attachmentIndex" }, 400);
  }

  // ── 4. Authz via callerClient — RLS gates the message row ──
  // Use callerClient (JWT-scoped), NEVER adminClient here. `source` has been
  // whitelisted to the two literal table names above.
  const { data: row, error: rowErr } = await callerClient
    .from(source as "messages")
    .select("id, context_meta")
    .eq("id", messageId)
    .maybeSingle();

  if (rowErr) {
    console.error("[get-chat-attachment-url] callerClient select failed:", rowErr);
    return jsonResponse({ error: "Internal error" }, 500);
  }
  if (!row) {
    // Could be "RLS denied" or "row doesn't exist" — do NOT differentiate.
    // Differentiating would leak existence info to unauthorised callers.
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  // ── 5. Attachment-level lookup — 404 is safe to differentiate here,
  //       because caller has already proved access to the message row. ──
  const attachments = (row as { context_meta?: { attachments?: unknown } }).context_meta?.attachments;
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return jsonResponse({ error: "No attachments on message" }, 404);
  }
  if ((attachmentIndex as number) >= attachments.length) {
    return jsonResponse({ error: "Attachment index out of bounds" }, 404);
  }

  const att = attachments[attachmentIndex as number] as {
    url?: unknown;
    path?: unknown;
  };

  // ── 6. Parse storage path — handles legacy public-URL form and
  //       future path-only form. Both shapes verified safe by recon. ──
  let path: string | null = null;
  if (typeof att?.url === "string" && att.url.startsWith("http") && att.url.includes(PUBLIC_URL_MARKER)) {
    const candidate = att.url.split(PUBLIC_URL_MARKER)[1];
    if (!candidate || candidate.includes("?") || candidate.startsWith("/")) {
      return jsonResponse({ error: "Malformed attachment URL" }, 400);
    }
    path = candidate;
  } else if (typeof att?.path === "string" && !att.path.startsWith("http")) {
    path = att.path;
  } else {
    return jsonResponse({ error: "Unknown attachment reference format" }, 400);
  }

  // ── 7. Service-role action — sign the URL. adminClient is a SEPARATE
  //       client object, constructed only after authz has passed. ──
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: signed, error: signErr } = await adminClient
    .storage.from("chat-attachments")
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);

  if (signErr || !signed?.signedUrl) {
    console.error("[get-chat-attachment-url] createSignedUrl failed:", signErr);
    return jsonResponse({ error: "Failed to sign URL" }, 500);
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString();
  return jsonResponse({ url: signed.signedUrl, expiresAt });
});
