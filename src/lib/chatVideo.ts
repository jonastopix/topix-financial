/**
 * chatVideo — videosvar i chatten: den rene dom (29/9-2026).
 *
 * SPEJL: ordret kopi af supabase/functions/_shared/chatVideo.ts (kroppen efter
 * dette filhoved er byte-ens; paritetsprøven
 * src/lib/__tests__/chatVideo.paritet.test.ts). Ret altid begge. Nul imports.
 * Fladen (optageknappen, afspilningen) læser herfra; edge-functionen
 * chat-video læser Deno-kopien.
 *
 * EGET BIBLIOTEK (Jonas 29/9 aften): chatten har sit eget Bunny-bibliotek
 * «boardroom-chat» (secrets BUNNY_CHAT_*), Premium Encoding + Just-In-Time —
 * ikke længere en collection i Hjemmebanes bibliotek. Derfor iChatBibliotek
 * (videoLibraryId) i stedet for iChatCollection, og erAfspillelig (play data)
 * ved siden af status/opløsninger.
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
 * 7 og 8 har i Bunnys dokumentation KUN et navn — ingen tekst siger, at
 * nogen af dem betyder «afspillelig» (get-video.md:295-335, Stream API 1.6.5,
 * hentet 29/9-2026). Derfor dømmes de ALDRIG som «klar» i sig selv; det
 * afspillelige ved JIT læses af Get Video play data (nedenfor).
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
 * Bunnys ENESTE dokumenterede «er den afspillelig nu»-signal: Get Video play
 * data (GET /library/{id}/videos/{guid}/play, `VideoPlayDataModel`):
 *   isPlayable — «Determines if the video is currently playable using either
 *   playlist or original source.» (get-video-play-data.md:258-262)
 * Kun et ordret `true` tæller; alt andet (mangler, null, "true", 1) er nej.
 */
export function erAfspillelig(afspilData: unknown): boolean {
  return erObjekt(afspilData) && afspilData.isPlayable === true;
}

/**
 * Status for en chatvideo ud fra Bunnys videoobjekt (Get Video) og — når det
 * gives med — Get Video play data:
 *   «klar»      status 4 (Finished), ELLER availableResolutions ikke tom, ELLER
 *               play data siger isPlayable === true (erAfspillelig). Bunny:
 *               availableResolutions er «Comma-separated list of resolution
 *               labels … that have finished encoding and are available for
 *               playback» (get-video, ovenfor). Chat-biblioteket kører
 *               Just-In-Time (Premium Encoding, Early-Play FRA); JIT gør
 *               videoen afspillelig «within 10–15 seconds» (premium-
 *               encoding.md:15) FØR nogen opløsning er færdig — det er
 *               isPlayable, der bærer det øjeblik, ikke status 7/8.
 *   «fejlet»    status 5 (Error) eller 6 (UploadFailed).
 *   «behandles» alt andet: 0–3, 7, 8, et ukendt tal eller intet svar.
 * «klar» dømmes FØRST (opgavens rækkefølge): en video, der kan afspilles,
 * vises, også hvis en senere opløsning fejlede.
 */
export function videoStatus(bunnyVideo: unknown, afspilData?: unknown): ChatVideoStatus {
  const v = erObjekt(bunnyVideo) ? bunnyVideo : {};
  const status = typeof v.status === "number" ? v.status : null;
  if (status === BUNNY_VIDEO_STATUS.FINISHED || harOploesning(v.availableResolutions) || erAfspillelig(afspilData)) return "klar";
  if (status === BUNNY_VIDEO_STATUS.ERROR || status === BUNNY_VIDEO_STATUS.UPLOAD_FAILED) return "fejlet";
  return "behandles";
}

/**
 * Ligger videoen i CHAT-biblioteket? Get Video svarer med `videoLibraryId`
 * («The ID of the video library that the video belongs to», int64 —
 * get-video.md:94), og det skal være PRÆCIS det bibliotek, secret'en
 * BUNNY_CHAT_LIBRARY_ID peger på. Fail-closed: mangler den ene eller den
 * anden side, eller er id'et ikke et helt positivt tal, er svaret nej. Det er
 * værnet mod, at en fremmed GUID i en besked (medlemmernes INSERT-policy
 * begrænser ikke context_meta) kan afspilles eller SLETTES gennem chatten —
 * det, som iChatCollection (collectionId = secret) var indtil 29/9, nu på
 * bibliotek i stedet for collection, fordi hele biblioteket er chattens.
 */
export function iChatBibliotek(bunnyVideo: unknown, chatLibraryId: string | number | null | undefined): boolean {
  const forventet = typeof chatLibraryId === "number" ? chatLibraryId : Number.parseInt(String(chatLibraryId ?? "").trim(), 10);
  if (!Number.isInteger(forventet) || forventet <= 0 || String(forventet) !== String(chatLibraryId ?? "").trim()) return false;
  if (!erObjekt(bunnyVideo)) return false;
  const faktisk = bunnyVideo.videoLibraryId;
  return typeof faktisk === "number" && Number.isInteger(faktisk) && faktisk === forventet;
}

/** Må kalderen slette beskedens video? Kun afsenderen eller en admin. */
export function maaSlette(i: { callerId: string; senderId: string | null | undefined; erAdmin: boolean }): boolean {
  if (i.erAdmin === true) return true;
  return typeof i.senderId === "string" && i.senderId !== "" && i.senderId === i.callerId;
}
