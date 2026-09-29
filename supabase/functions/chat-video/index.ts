// chat-video — videosvar i chatten gennem Bunny Stream (29/9-2026).
//
// BESLUTTET (Jonas 29/9): kun rådgivere sender video; Bunny Stream er lageret;
// højst 3 minutter; status uden webhook (der spørges hos Bunny); en slettet
// videobesked sletter også videoen hos Bunny. Grundlag:
// ~/Downloads/recon-video-bunny.md og ~/Downloads/recon-video-storage.md §2.
//
// EGET BIBLIOTEK (Jonas 29/9 aften): chatvideoerne ligger i deres EGET
// Bunny-bibliotek «boardroom-chat» (Library ID 765771) — Premium Encoding,
// Just-In-Time, Early-Play fra, 480p/720p H.264, embed view token
// authentication og block direct URL file access slået til. Free Encoding i
// Hjemmebanes delte bibliotek 720547 tog mange minutter pr. video (første
// chatvideo uploadet 17:46, afspillelig først længe efter). Derfor tre EGNE
// secrets, og de delte BUNNY_STREAM_* (bunny-content-admin, get-video-embed)
// bruges IKKE her — og der falder aldrig tilbage til dem: mangler en af de
// tre, svarer functionen 503 not_configured med navnene på dem, der mangler.
// Collection-kravet er væk (hele biblioteket er chattens); «ligger i
// chat-biblioteket» er iChatBibliotek (Get Videos videoLibraryId = secret'ens
// bibliotek, fail-closed) — samme styrke som iChatCollection havde
// (collectionId = secret), nu på bibliotek.
//
// Bucket A: authenticateUser FØRST, som bunny-content-admin. Ingen
// service-role-klient — adgangen er kalderens RLS (callerClient) og has_role.
// Dommen (status, bibliotek, hvem må slette) er ren og bor i
// _shared/chatVideo.ts (spejlet i src/lib/chatVideo.ts).
//
// Actions:
//   { action: "opret", title }
//     KUN rådgivere (gaten ordret som bunny-content-admin, FØR Bunny kaldes).
//     Opretter videoen hos Bunny i chat-biblioteket med title og returnerer
//     { videoGuid, signature, expires, libraryId } som create-video — browseren
//     uploader DIREKTE til Bunnys TUS-endpoint; API-nøglen forlader aldrig
//     functionen.
//   { action: "afspil", messageId }
//     Beskeden læses gennem callerClient (RLS afgør, om kalderen må se den —
//     samme form som get-chat-attachment-url). FØR der signeres: (a) afsenderen
//     er rådgiver, (b) Bunnys Get Video viser videoLibraryId = chat-biblioteket.
//     Ellers 403 uden signatur — så en akademivideos GUID i en besked ikke kan
//     omgå medlemskab og dryp i get-video-embed. Status: Get Video (status 4
//     eller en færdig opløsning) — og ved JIT Get Video play data
//     (/videos/{guid}/play, signeret med samme token/expires-par som embeddet):
//     isPlayable === true er Bunnys eneste dokumenterede «afspillelig nu».
//     Status 7/8 (JitSegmenting/JitPlaylistsCreated) betyder IKKE «klar» i sig
//     selv — dokumentationen giver dem kun et navn. Svar { status, embedUrl?,
//     expires? }; embedUrl kun når status er «klar», signeret som get-video-embed
//     (sha256hex(TOKEN_AUTH_KEY + guid + expires), TTL 3600).
//   { action: "slet", messageId }
//     Kun beskedens afsender eller en admin (maaSlette). Sletter videoen hos
//     Bunny (DELETE /library/{id}/videos/{guid}); 404 hos Bunny er ok (allerede
//     væk). Samme to tjek som afspil går FORAN sletningen: medlemmernes
//     INSERT-policy på messages begrænser ikke context_meta, så en besked kan
//     bære en fremmed GUID — og DELETE kan ikke fortrydes.
//
// Secrets (Lovable): BUNNY_CHAT_LIBRARY_ID (Bunny → Stream → boardroom-chat →
// API → Video Library ID), BUNNY_CHAT_API_KEY (samme side → API Key),
// BUNNY_CHAT_TOKEN_AUTH_KEY (samme bibliotek → Security → Embed view token
// authentication → Token Authentication Key).

import { authenticateUser, corsHeaders, type AuthenticatedUser } from "../_shared/edgeFunctionAuth.ts";
import { erAfspillelig, iChatBibliotek, laesChatVideo, maaSlette, videoStatus } from "../_shared/chatVideo.ts";

const BUNNY_API_BASE = "https://video.bunnycdn.com/library";
const TUS_GRANT_TTL_SECONDS = 6 * 60 * 60;
const EMBED_TTL_SECONDS = 3600;
/** Play data spørges lige nu — tokenet behøver kun leve et øjeblik. */
const PLAY_DATA_TTL_SECONDS = 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOG = "[chat-video]";

/** Chattens EGNE secrets — aldrig BUNNY_STREAM_* (Hjemmebanes bibliotek). */
const SECRETS = {
  libraryId: "BUNNY_CHAT_LIBRARY_ID",
  apiKey: "BUNNY_CHAT_API_KEY",
  tokenAuthKey: "BUNNY_CHAT_TOKEN_AUTH_KEY",
} as const;

type CallerClient = AuthenticatedUser["callerClient"];

interface Bunny {
  libraryId: string;
  apiKey: string;
  tokenAuthKey: string;
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

function laesBunny(): Bunny {
  return {
    libraryId: (Deno.env.get(SECRETS.libraryId) ?? "").trim(),
    apiKey: (Deno.env.get(SECRETS.apiKey) ?? "").trim(),
    tokenAuthKey: (Deno.env.get(SECRETS.tokenAuthKey) ?? "").trim(),
  };
}

/** Navnene på de secrets, der mangler — tom liste = sat op. Ingen fallback til de delte. */
function manglendeSecrets(b: Bunny): string[] {
  return (Object.keys(SECRETS) as Array<keyof Bunny>).filter((k) => b[k] === "").map((k) => SECRETS[k]);
}

function ikkeSatOp(mangler: string[]): Response {
  console.error(`${LOG} not_configured — mangler: ${mangler.join(", ")}`);
  return jsonResponse({ error: "not_configured", mangler }, 503);
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

  const bunny = laesBunny();

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

  const mangler = manglendeSecrets(bunny);
  if (mangler.length > 0) return ikkeSatOp(mangler);
  if (typeof title !== "string" || !title.trim() || title.length > 500) {
    return jsonResponse({ error: "Invalid title" }, 400);
  }

  const createResponse = await fetch(`${BUNNY_API_BASE}/${bunny.libraryId}/videos`, {
    method: "POST",
    headers: { AccessKey: bunny.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ title: title.trim() }),
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

/** (b) Bunnys Get Video — i CHAT-biblioteket, med chat-nøglen. */
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

/** Embed-view-tokenet: sha256hex(TOKEN_AUTH_KEY + guid + expires) — Bunnys dokumenterede algoritme (token-authentication.md:19-23). */
async function embedToken(bunny: Bunny, guid: string, expires: number): Promise<string> {
  return await sha256Hex(`${bunny.tokenAuthKey}${guid}${expires}`);
}

/**
 * Get Video play data — Bunnys «afspillelig nu» (isPlayable). Endepunktet kræver
 * token/expires-parret, når biblioteket har token authentication (det har
 * chat-biblioteket). Fail-soft: svarer Bunny ikke 2xx, dømmes videre på Get
 * Video alene (null) — en ustabil play-data-læsning må aldrig give «fejlet».
 */
async function hentBunnyAfspilData(bunny: Bunny, guid: string): Promise<unknown> {
  const expires = Math.floor(Date.now() / 1000) + PLAY_DATA_TTL_SECONDS;
  const token = await embedToken(bunny, guid, expires);
  const playResponse = await fetch(`${BUNNY_API_BASE}/${bunny.libraryId}/videos/${guid}/play?token=${token}&expires=${expires}`, {
    headers: { AccessKey: bunny.apiKey },
  });
  if (!playResponse.ok) {
    console.warn(`${LOG} get video play data failed: ${playResponse.status}`);
    return null;
  }
  return await playResponse.json();
}

// ── afspil ────────────────────────────────────────────────────────────────
async function afspil(callerClient: CallerClient, bunny: Bunny, messageId: unknown): Promise<Response> {
  const besked = await hentBeskedensVideo(callerClient, messageId);
  if (!besked.ok) return besked.svar;
  const mangler = manglendeSecrets(bunny);
  if (mangler.length > 0) return ikkeSatOp(mangler);

  // (a) FØR signering: afsenderen er rådgiver.
  if (!(await afsenderErRaadgiver(callerClient, besked.senderId))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }
  // (b) FØR signering: videoen ligger i chat-biblioteket.
  const opslag = await hentBunnyVideo(bunny, besked.guid);
  if (!opslag.ok) return opslag.svar;
  if (!iChatBibliotek(opslag.video, bunny.libraryId)) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  // Status: Get Video først; er den ikke «klar» af status/opløsninger, spørges
  // play data (JIT gør videoen afspillelig før nogen opløsning er færdig).
  let status = videoStatus(opslag.video);
  let afspillelig = false;
  if (status !== "klar") {
    const afspilData = await hentBunnyAfspilData(bunny, besked.guid);
    afspillelig = erAfspillelig(afspilData);
    status = videoStatus(opslag.video, afspilData);
  }
  if (status !== "klar") return jsonResponse({ status, afspillelig });
  return await signerEmbed(bunny, besked.guid, status);
}

/**
 * Signeringen — samme regnestykke som get-video-embed: sha256hex(TOKEN_AUTH_KEY + guid + expires), TTL 3600.
 *
 * INGEN AUTOSTART (Jonas 29/9 19:42: «de videoer … starter samtidig, når et
 * medlem åbner chatten»). Bunnys embed har `autoplay` og `preload` som standard
 * sand (bunny.net/docs/stream/embedding: autoplay «Starts playback
 * automatically», preload «Starts downloading the video before playback is
 * requested»). En chat med flere videoer startede dem alle og hentede dem alle.
 * Derfor sættes begge eksplicit til false: videoen starter først ved tryk, og
 * intet hentes før. Ekstra parametre ved siden af token/expires er husets
 * form (get-video-embed sender `&t=`).
 */
export const EMBED_VALG = "&autoplay=false&preload=false";

async function signerEmbed(bunny: Bunny, guid: string, status: "klar"): Promise<Response> {
  const expires = Math.floor(Date.now() / 1000) + EMBED_TTL_SECONDS;
  const token = await embedToken(bunny, guid, expires);
  const embedUrl =
    `https://iframe.mediadelivery.net/embed/${bunny.libraryId}/${guid}` +
    `?token=${token}&expires=${expires}` + EMBED_VALG;
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
  const mangler = manglendeSecrets(bunny);
  if (mangler.length > 0) return ikkeSatOp(mangler);

  // Samme to tjek som afspil, FØR en sletning, der ikke kan fortrydes.
  if (!(await afsenderErRaadgiver(callerClient, besked.senderId))) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }
  const opslag = await hentBunnyVideo(bunny, besked.guid);
  if (!opslag.ok) {
    // 404: allerede væk hos Bunny — målet er nået.
    return opslag.fandtesIkke ? jsonResponse({ slettet: true, fandtes: false }) : opslag.svar;
  }
  if (!iChatBibliotek(opslag.video, bunny.libraryId)) {
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
