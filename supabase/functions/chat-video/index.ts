// chat-video — videosvar i chatten gennem Bunny Stream (29/9-2026).
//
// BESLUTTET (Jonas 29/9): kun rådgivere sender video; Bunny Stream er lageret;
// en chatvideo ligger i en EGEN Bunny-collection; højst 3 minutter; status
// uden webhook (der spørges hos Bunny); en slettet videobesked sletter også
// videoen hos Bunny. Grundlag: ~/Downloads/recon-video-bunny.md.
//
// Bucket A: authenticateUser FØRST, som bunny-content-admin. Ingen
// service-role-klient — adgangen er kalderens RLS (callerClient) og has_role.
// Dommen (status, collection, hvem må slette) er ren og bor i
// _shared/chatVideo.ts (spejlet i src/lib/chatVideo.ts).
//
// Actions:
//   { action: "opret", title }
//     KUN rådgivere (gaten ordret som bunny-content-admin, FØR Bunny kaldes).
//     Opretter videoen hos Bunny med title og collectionId =
//     BUNNY_STREAM_CHAT_COLLECTION_ID og returnerer
//     { videoGuid, signature, expires, libraryId } som create-video — browseren
//     uploader DIREKTE til Bunnys TUS-endpoint; API-nøglen forlader aldrig
//     functionen. Mangler secret'en: 503 not_configured.
//   { action: "afspil", messageId }
//     Beskeden læses gennem callerClient (RLS afgør, om kalderen må se den —
//     samme form som get-chat-attachment-url). FØR der signeres: (a) afsenderen
//     er rådgiver, (b) Bunnys Get Video viser collectionId = chat-collectionen.
//     Ellers 403 uden signatur — så en akademivideos GUID i en besked ikke kan
//     omgå medlemskab og dryp i get-video-embed. Svar { status, embedUrl?, expires? };
//     embedUrl kun når status er «klar», signeret som get-video-embed
//     (sha256hex(TOKEN_AUTH_KEY + guid + expires), TTL 3600).
//   { action: "slet", messageId }
//     Kun beskedens afsender eller en admin (maaSlette). Sletter videoen hos
//     Bunny (DELETE /library/{id}/videos/{guid}); 404 hos Bunny er ok (allerede
//     væk). Samme to tjek som afspil går FORAN sletningen: medlemmernes
//     INSERT-policy på messages begrænser ikke context_meta, så en besked kan
//     bære en fremmed GUID — og DELETE kan ikke fortrydes.
//
// Secrets (Lovable): BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY,
// BUNNY_STREAM_TOKEN_AUTH_KEY (som bunny-content-admin/get-video-embed) og den
// nye BUNNY_STREAM_CHAT_COLLECTION_ID (chat-collectionens GUID i samme library).

import { authenticateUser, corsHeaders, type AuthenticatedUser } from "../_shared/edgeFunctionAuth.ts";
import { iChatCollection, laesChatVideo, maaSlette, videoStatus } from "../_shared/chatVideo.ts";

const BUNNY_API_BASE = "https://video.bunnycdn.com/library";
const TUS_GRANT_TTL_SECONDS = 6 * 60 * 60;
const EMBED_TTL_SECONDS = 3600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOG = "[chat-video]";

type CallerClient = AuthenticatedUser["callerClient"];

interface Bunny {
  libraryId: string;
  apiKey: string;
  tokenAuthKey: string;
  chatCollectionId: string;
}

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

function bunnyKonfigureret(b: Bunny): boolean {
  return Boolean(b.libraryId && b.apiKey && b.tokenAuthKey && b.chatCollectionId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── 1. Auth (Bucket A) — FØR alt andet ──────────────────────────────────
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  const { callerId, callerClient } = auth;

  // ── 2. Parse body ───────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { action, title, messageId } = (body ?? {}) as {
    action?: unknown;
    title?: unknown;
    messageId?: unknown;
  };

  const bunny: Bunny = {
    libraryId: Deno.env.get("BUNNY_STREAM_LIBRARY_ID") ?? "",
    apiKey: Deno.env.get("BUNNY_STREAM_API_KEY") ?? "",
    tokenAuthKey: Deno.env.get("BUNNY_STREAM_TOKEN_AUTH_KEY") ?? "",
    chatCollectionId: (Deno.env.get("BUNNY_STREAM_CHAT_COLLECTION_ID") ?? "").trim(),
  };

  // ── 3. Actions ──────────────────────────────────────────────────────────
  try {
    if (action === "opret") return await opret(callerId, callerClient, bunny, title);
    if (action === "afspil") return await afspil(callerClient, bunny, messageId);
    if (action === "slet") return await slet(callerId, callerClient, bunny, messageId);
  } catch (err) {
    console.error(`${LOG} uventet fejl:`, err instanceof Error ? err.message : String(err));
    return jsonResponse({ error: "Internal error" }, 500);
  }
  return jsonResponse({ error: "Unknown action" }, 400);
});

// ── opret ─────────────────────────────────────────────────────────────────
async function opret(callerId: string, callerClient: CallerClient, bunny: Bunny, title: unknown): Promise<Response> {
  // Advisor-gate — KUN rådgivere sender video (ordret som bunny-content-admin).
  const { data: isAdvisor, error: roleError } = await callerClient.rpc("has_role", {
    _user_id: callerId,
    _role: "advisor",
  });
  if (roleError || !isAdvisor) {
    return jsonResponse({ error: "Forbidden — advisor role required" }, 403);
  }

  if (!bunnyKonfigureret(bunny)) {
    return jsonResponse({ error: "not_configured" }, 503);
  }
  if (typeof title !== "string" || !title.trim() || title.length > 500) {
    return jsonResponse({ error: "Invalid title" }, 400);
  }

  const createResponse = await fetch(`${BUNNY_API_BASE}/${bunny.libraryId}/videos`, {
    method: "POST",
    headers: { AccessKey: bunny.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ title: title.trim(), collectionId: bunny.chatCollectionId }),
  });
  if (!createResponse.ok) {
    console.error(`${LOG} create video failed: ${createResponse.status}`);
    return jsonResponse({ error: "Bunny API rejected video creation" }, 502);
  }
  const video = (await createResponse.json()) as { guid?: string };
  if (!video.guid) {
    return jsonResponse({ error: "Bunny API returned no video guid" }, 502);
  }

  const expires = Math.floor(Date.now() / 1000) + TUS_GRANT_TTL_SECONDS;
  const signature = await sha256Hex(`${bunny.libraryId}${bunny.apiKey}${expires}${video.guid}`);

  return jsonResponse({ videoGuid: video.guid, signature, expires, libraryId: bunny.libraryId });
}

// ── Fælles for afspil og slet: beskeden, dens video og de to tjek ─────────

type Opslag =
  | { ok: true; senderId: string; guid: string }
  | { ok: false; svar: Response };

/** Beskeden gennem callerClient (RLS), og dens video. Samme form som get-chat-attachment-url. */
async function hentBeskedensVideo(callerClient: CallerClient, messageId: unknown): Promise<Opslag> {
  if (typeof messageId !== "string" || !UUID_RE.test(messageId)) {
    return { ok: false, svar: jsonResponse({ error: "Invalid messageId" }, 400) };
  }
  const { data: row, error: rowErr } = await callerClient
    .from("messages")
    .select("id, sender_id, context_meta")
    .eq("id", messageId)
    .maybeSingle();
  if (rowErr) {
    console.error(`${LOG} callerClient select failed:`, rowErr.message);
    return { ok: false, svar: jsonResponse({ error: "Internal error" }, 500) };
  }
  if (!row) {
    // «RLS nægtede» og «findes ikke» skelnes IKKE — det ville lække eksistens.
    return { ok: false, svar: jsonResponse({ error: "Forbidden" }, 403) };
  }
  const r = row as { sender_id?: string | null; context_meta?: unknown };
  const video = laesChatVideo(r.context_meta);
  if (!video) return { ok: false, svar: jsonResponse({ error: "no_video" }, 404) };
  return { ok: true, senderId: r.sender_id ?? "", guid: video.guid };
}

/** (a) Afsenderen er rådgiver — kun rådgivere sender video. */
async function afsenderErRaadgiver(callerClient: CallerClient, senderId: string): Promise<boolean> {
  if (!senderId) return false;
  const { data, error } = await callerClient.rpc("has_role", { _user_id: senderId, _role: "advisor" });
  return !error && data === true;
}

type BunnyOpslag =
  | { ok: true; video: unknown }
  | { ok: false; fandtesIkke: boolean; svar: Response };

/** (b) Bunnys Get Video. */
async function hentBunnyVideo(bunny: Bunny, guid: string): Promise<BunnyOpslag> {
  const infoResponse = await fetch(`${BUNNY_API_BASE}/${bunny.libraryId}/videos/${guid}`, {
    headers: { AccessKey: bunny.apiKey },
  });
  if (infoResponse.status === 404) {
    return { ok: false, fandtesIkke: true, svar: jsonResponse({ error: "video_findes_ikke" }, 404) };
  }
  if (!infoResponse.ok) {
    console.error(`${LOG} get video failed: ${infoResponse.status}`);
    return { ok: false, fandtesIkke: false, svar: jsonResponse({ error: "Bunny API rejected lookup" }, 502) };
  }
  return { ok: true, video: await infoResponse.json() };
}

// ── afspil ────────────────────────────────────────────────────────────────
async function afspil(callerClient: CallerClient, bunny: Bunny, messageId: unknown): Promise<Response> {
  const besked = await hentBeskedensVideo(callerClient, messageId);
  if (!besked.ok) return besked.svar;
  if (!bunnyKonfigureret(bunny)) return jsonResponse({ error: "not_configured" }, 503);

  // (a) FØR signering: afsenderen er rådgiver.
  if (!(await afsenderErRaadgiver(callerClient, besked.senderId))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }
  // (b) FØR signering: videoen ligger i chat-collectionen.
  const opslag = await hentBunnyVideo(bunny, besked.guid);
  if (!opslag.ok) return opslag.svar;
  if (!iChatCollection(opslag.video, bunny.chatCollectionId)) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const status = videoStatus(opslag.video);
  if (status !== "klar") return jsonResponse({ status });
  return await signerEmbed(bunny, besked.guid, status);
}

/** Signeringen — samme regnestykke som get-video-embed: sha256hex(TOKEN_AUTH_KEY + guid + expires), TTL 3600. */
async function signerEmbed(bunny: Bunny, guid: string, status: "klar"): Promise<Response> {
  const expires = Math.floor(Date.now() / 1000) + EMBED_TTL_SECONDS;
  const token = await sha256Hex(`${bunny.tokenAuthKey}${guid}${expires}`);
  const embedUrl =
    `https://iframe.mediadelivery.net/embed/${bunny.libraryId}/${guid}` +
    `?token=${token}&expires=${expires}`;
  return jsonResponse({ status, embedUrl, expires });
}

// ── slet ──────────────────────────────────────────────────────────────────
async function slet(callerId: string, callerClient: CallerClient, bunny: Bunny, messageId: unknown): Promise<Response> {
  const besked = await hentBeskedensVideo(callerClient, messageId);
  if (!besked.ok) return besked.svar;

  // Kun beskedens afsender eller en admin.
  const { data: erAdmin, error: adminFejl } = await callerClient.rpc("has_role", {
    _user_id: callerId,
    _role: "admin",
  });
  if (!maaSlette({ callerId, senderId: besked.senderId, erAdmin: !adminFejl && erAdmin === true })) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }
  if (!bunnyKonfigureret(bunny)) return jsonResponse({ error: "not_configured" }, 503);

  // Samme to tjek som afspil, FØR en sletning, der ikke kan fortrydes.
  if (!(await afsenderErRaadgiver(callerClient, besked.senderId))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }
  const opslag = await hentBunnyVideo(bunny, besked.guid);
  if (!opslag.ok) {
    // 404: allerede væk hos Bunny — målet er nået.
    return opslag.fandtesIkke ? jsonResponse({ slettet: true, fandtes: false }) : opslag.svar;
  }
  if (!iChatCollection(opslag.video, bunny.chatCollectionId)) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const sletResponse = await fetch(`${BUNNY_API_BASE}/${bunny.libraryId}/videos/${besked.guid}`, {
    method: "DELETE",
    headers: { AccessKey: bunny.apiKey },
  });
  if (sletResponse.status === 404) return jsonResponse({ slettet: true, fandtes: false });
  if (!sletResponse.ok) {
    console.error(`${LOG} delete video failed: ${sletResponse.status}`);
    return jsonResponse({ error: "Bunny API rejected deletion" }, 502);
  }
  return jsonResponse({ slettet: true, fandtes: true });
}
