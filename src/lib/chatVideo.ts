/**
 * chatVideo — videosvar i chatten: den rene dom (29/9-2026).
 *
 * SPEJL: ordret kopi af supabase/functions/_shared/chatVideo.ts (kroppen efter
 * dette filhoved er byte-ens; paritetsprøven
 * src/lib/__tests__/chatVideo.paritet.test.ts). Ret altid begge. Nul imports.
 * Fladen (optageknappen, afspilningen) læser herfra; edge-functionen
 * chat-video læser Deno-kopien.
 */

/** Højst 3 minutter (Jonas 29/9). Håndhæves ved optagelsen og valget af fil. */
export const MAKS_SEKUNDER = 180;

export type ChatVideoStatus = "behandles" | "klar" | "fejlet";

/**
 * VIDEOOBJEKTETS status (Get Video, felt `status`, enum `VideoModelStatus`):
 *   <https://bunny.net/docs/api-reference/stream/manage-videos/get-video>
 *   <https://video.bunnycdn.com/openapi/bunnynet-video-api.public.json>
 *   0 Created · 1 Uploaded · 2 Processing · 3 Transcoding · 4 Finished ·
 *   5 Error · 6 UploadFailed · 7 JitSegmenting · 8 JitPlaylistsCreated
 *
 * WEBHOOKENS tal er en ANDEN nummerering (3 = Finished, 4 = Resolution
 * finished, 5 = Failed, 6–8 = PresignedUpload …):
 *   <https://bunny.net/docs/stream/webhooks.md>
 * Vi bruger ingen webhook; tallene her er objektets — bland dem aldrig.
 */
export const BUNNY_VIDEO_STATUS = {
  CREATED: 0,
  UPLOADED: 1,
  PROCESSING: 2,
  TRANSCODING: 3,
  FINISHED: 4,
  ERROR: 5,
  UPLOAD_FAILED: 6,
  JIT_SEGMENTING: 7,
  JIT_PLAYLISTS_CREATED: 8,
} as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const erObjekt = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Videoen i en besked: KUN nøglen context_meta.video.guid, og kun når den er
 * et uuid (Bunny-GUID'er har uuid-form). Alt andet — manglende nøgle, forkert
 * form, et tal, en streng med mellemrum — er «ingen video».
 */
export function laesChatVideo(contextMeta: unknown): { guid: string } | null {
  if (!erObjekt(contextMeta)) return null;
  const video = contextMeta.video;
  if (!erObjekt(video)) return null;
  const guid = video.guid;
  if (typeof guid !== "string" || !UUID_RE.test(guid)) return null;
  return { guid: guid.toLowerCase() };
}

/** Er der mindst én færdig opløsning? `availableResolutions` er en kommasepareret streng («360p,720p»). */
function harOploesning(v: unknown): boolean {
  if (typeof v !== "string") return false;
  return v.split(",").some((del) => del.trim() !== "");
}

/**
 * Status for en chatvideo ud fra Bunnys videoobjekt (Get Video):
 *   «klar»      status 4 (Finished) ELLER availableResolutions ikke tom.
 *               Bunny: «Comma-separated list of resolution labels … that have
 *               finished encoding and are available for playback» (get-video,
 *               ovenfor). Husets library har Early-Play FRA
 *               (docs/hjemmebane/c0-bunny.md §3.5), så den første færdige
 *               opløsning er det første afspilbare øjeblik — webhookens
 *               «4 - Resolution finished … The first request also signals that
 *               the video is now playable» (webhooks.md, ovenfor).
 *   «fejlet»    status 5 (Error) eller 6 (UploadFailed).
 *   «behandles» alt andet: 0–3, 7, 8, et ukendt tal eller intet svar.
 * «klar» dømmes FØRST (opgavens rækkefølge): en video med en færdig opløsning
 * kan afspilles, også hvis en senere opløsning fejlede.
 */
export function videoStatus(bunnyVideo: unknown): ChatVideoStatus {
  const v = erObjekt(bunnyVideo) ? bunnyVideo : {};
  const status = typeof v.status === "number" ? v.status : null;
  if (status === BUNNY_VIDEO_STATUS.FINISHED || harOploesning(v.availableResolutions)) return "klar";
  if (status === BUNNY_VIDEO_STATUS.ERROR || status === BUNNY_VIDEO_STATUS.UPLOAD_FAILED) return "fejlet";
  return "behandles";
}

/**
 * Ligger videoen i chat-collectionen? Fail-closed: mangler den ene eller den
 * anden side, er svaret nej. Det er værnet mod, at en akademivideos GUID i en
 * besked kan omgå medlemskab og dryp (get-video-embed) — eller slettes.
 */
export function iChatCollection(bunnyVideo: unknown, chatCollectionId: string | null | undefined): boolean {
  const forventet = (chatCollectionId ?? "").trim().toLowerCase();
  if (!forventet || !erObjekt(bunnyVideo)) return false;
  const faktisk = typeof bunnyVideo.collectionId === "string" ? bunnyVideo.collectionId.trim().toLowerCase() : "";
  return faktisk !== "" && faktisk === forventet;
}

/** Må kalderen slette beskedens video? Kun afsenderen eller en admin. */
export function maaSlette(i: { callerId: string; senderId: string | null | undefined; erAdmin: boolean }): boolean {
  if (i.erAdmin === true) return true;
  return typeof i.senderId === "string" && i.senderId !== "" && i.senderId === i.callerId;
}
