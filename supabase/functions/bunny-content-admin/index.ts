// bunny-content-admin — Bunny Stream-administration for admin-fladen
// /admin/indhold (Hjemmebane C1 trin 2).
//
// Bucket A: authenticateUser FØRST, derefter advisor-tjek via has_role
// (SECURITY DEFINER, kaldt gennem callerClient) FØR nogen Bunny-handling.
// Ingen service-role-klient — funktionen rører aldrig databasen.
//
// Actions:
//   { action: "status" }
//     → { configured: boolean } — findes de tre BUNNY_STREAM_*-secrets?
//       Bruges af frontend til graceful "Bunny ikke konfigureret"-tilstand.
//   { action: "create-video", title }
//     → { videoGuid, signature, expires, libraryId } — opretter video-
//       objektet via Bunny API og returnerer en tidsbegrænset, video-scoped
//       TUS-signatur (sha256(libraryId + apiKey + expires + videoGuid)),
//       så browseren uploader DIREKTE til Bunnys TUS-endpoint uden at
//       API-nøglen nogensinde rører frontend (jf. c0-bunny.md §4).
//
// Secrets (Lovable): BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY,
// BUNNY_STREAM_TOKEN_AUTH_KEY (sidstnævnte bruges først i trin 3-signering
// af embed-URL'er, men indgår i configured-tjekket så opsætningen er komplet).

import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";

const BUNNY_API_BASE = "https://video.bunnycdn.com/library";
const TUS_GRANT_TTL_SECONDS = 6 * 60 * 60;
// Samme mønster som frontends GUID_RE (HbBunnyPicker.tsx) — det bor kun
// dér, så tjekket spejles her frem for at importeres på tværs af lag.
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // ── 2. Advisor-gate — admin-fladen er advisor-only ──────────────────────
  const { data: isAdvisor, error: roleError } = await callerClient.rpc("has_role", {
    _user_id: callerId,
    _role: "advisor",
  });
  if (roleError || !isAdvisor) {
    return jsonResponse({ error: "Forbidden — advisor role required" }, 403);
  }

  // ── 3. Parse body ───────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { action, title, videoId } = (body ?? {}) as {
    action?: unknown;
    title?: unknown;
    videoId?: unknown;
  };

  const libraryId = Deno.env.get("BUNNY_STREAM_LIBRARY_ID") ?? "";
  const apiKey = Deno.env.get("BUNNY_STREAM_API_KEY") ?? "";
  const tokenAuthKey = Deno.env.get("BUNNY_STREAM_TOKEN_AUTH_KEY") ?? "";
  const configured = Boolean(libraryId && apiKey && tokenAuthKey);

  // ── 4. Actions ──────────────────────────────────────────────────────────
  if (action === "status") {
    return jsonResponse({ configured });
  }

  if (action === "create-video") {
    if (!configured) {
      return jsonResponse({ error: "not_configured" }, 503);
    }
    if (typeof title !== "string" || !title.trim() || title.length > 500) {
      return jsonResponse({ error: "Invalid title" }, 400);
    }

    const createResponse = await fetch(`${BUNNY_API_BASE}/${libraryId}/videos`, {
      method: "POST",
      headers: { AccessKey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    if (!createResponse.ok) {
      console.error(`[bunny-content-admin] create video failed: ${createResponse.status}`);
      return jsonResponse({ error: "Bunny API rejected video creation" }, 502);
    }
    const video = (await createResponse.json()) as { guid?: string };
    if (!video.guid) {
      return jsonResponse({ error: "Bunny API returned no video guid" }, 502);
    }

    const expires = Math.floor(Date.now() / 1000) + TUS_GRANT_TTL_SECONDS;
    const signature = await sha256Hex(`${libraryId}${apiKey}${expires}${video.guid}`);

    return jsonResponse({ videoGuid: video.guid, signature, expires, libraryId });
  }

  if (action === "video-info") {
    if (!configured) {
      return jsonResponse({ error: "not_configured" }, 503);
    }
    if (typeof videoId !== "string" || !GUID_RE.test(videoId)) {
      return jsonResponse({ error: "Ugyldigt videoId" }, 400);
    }

    const infoResponse = await fetch(`${BUNNY_API_BASE}/${libraryId}/videos/${videoId}`, {
      headers: { AccessKey: apiKey },
    });
    if (!infoResponse.ok) {
      // Ikke-200 returneres med status og body, så fejlsøgningen kan se
      // hvad Bunny faktisk svarede — ikke en generisk fejl.
      const fejlBody = await infoResponse.text();
      return jsonResponse({ ok: false, status: infoResponse.status, body: fejlBody }, 502);
    }

    /* Hele svaret returneres BEVIDST urørt under `raw`: formålet er at
       efterprøve hvilke felter Bunny faktisk leverer (varighed?), før
       der bygges automatisk varighedsudfyldning på en antagelse om et
       fremmed API. Denne action skal STRAMMES til kun de nødvendige
       felter, når feltlisten er afklaret. */
    const raw = await infoResponse.json();
    return jsonResponse({ ok: true, raw });
  }

  return jsonResponse({ error: "Unknown action" }, 400);
});
