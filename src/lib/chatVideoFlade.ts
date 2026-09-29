/**
 * chatVideoFlade — videosvar i chatten: fladens rene regler (29/9-2026).
 *
 * Serverdelen er chat-video (#1119) med dommen i src/lib/chatVideo.ts
 * (spejlet i _shared). Denne fil er KUN fladens: markøren, optageformatet,
 * længdetjekket på en valgt fil, hvornår afspilningen spørges igen, og
 * beskedens form. Rene funktioner — ingen React, ingen Supabase, ingen DOM.
 * Testet i __tests__/chatVideoFlade.test.ts; fladen låst af
 * chatVideoFlade.guard.test.ts.
 */
import { MAKS_SEKUNDER, type ChatVideoStatus } from "@/lib/chatVideo";

/**
 * Beskedens content, når den er en video. En FAST markør, så Slack-uddraget,
 * klokken, samtalelisten og svarcitatet får en meningsfuld tekst — ikke en
 * tom streng. Boblen skjuler den (som «📎»); videoen står under.
 */
export const VIDEO_MARKOER = "🎥 Video";

/** Boblens tekst skjules, når content er præcis en af de to markører. */
export function erSkjultBobletekst(content: string | null | undefined): boolean {
  return content === "📎" || content === VIDEO_MARKOER;
}

/**
 * Optageformaterne i den rækkefølge, de prøves (det første, browseren
 * understøtter, vinder).
 *
 * HVORFOR MP4 FØRST: Bunnys liste over lyd-codecs nævner AAC, MP3, LPCM, FLAC,
 * ALAC og WMA — IKKE Opus (<https://bunny.net/docs/stream/video-specification.md>,
 * recon-video-bunny.md §7d). En WebM fra MediaRecorder bærer typisk Opus-lyd, og
 * om Bunny encoder den, siger dokumentationen ikke. MP4 med H.264/AAC står på
 * begge lister. WebM er med som fald-tilbage for browsere uden MP4-optagelse
 * (WebM, VP8 og VP9 står på Bunnys liste).
 */
export const OPTAGEFORMATER = [
  "video/mp4;codecs=avc1,mp4a",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm",
] as const;

/** Det første understøttede format — eller null (så vælger browseren selv). */
export function vaelgOptageformat(erUnderstoettet: (mimeType: string) => boolean): string | null {
  for (const f of OPTAGEFORMATER) {
    try {
      if (erUnderstoettet(f)) return f;
    } catch {
      /* en browser, der kaster på et ukendt format, understøtter det ikke */
    }
  }
  return null;
}

/**
 * INGEN TOM VIDEO (Jonas 29/9): en fil eller optagelse på 0 bytes må aldrig
 * uploades — optageren samler blob'en af de chunks, der kom
 * (ChatVideoOptager.tsx: new Blob(stykker)), så en tom liste giver 0 bytes, og
 * intet tjekkede størrelsen før upload (recon-video-storage.md §3,
 * recon-video-hurtigere.md §4). Ét tjek, brugt tre steder:
 * optagerens «Send», «Vælg fil» og uploadChatVideo (før «opret», så der aldrig
 * oprettes et tomt objekt hos Bunny). INGEN øvre bytegrænse: Bunny
 * dokumenterer ingen (recon-video-hurtigere.md §4), og 3 minutter er loftet.
 */
export function erTomFil(fil: { size: unknown } | null | undefined): boolean {
  const size = fil?.size;
  return typeof size !== "number" || !Number.isFinite(size) || size <= 0;
}

export const TOM_TEKST = {
  optagelse: "Optagelsen blev tom. Prøv at optage igen.",
  fil: "Filen er tom.",
} as const;

export type FilLaengdeDom = "ok" | "for_lang" | "ukendt";

/**
 * Længden af en valgt fil (sekunder fra <video>.duration efter loadedmetadata).
 * Over MAKS_SEKUNDER afvises. En længde, der ikke kan aflæses (NaN, Infinity,
 * 0 eller negativ), afvises også — loftet på 3 minutter kan ikke holdes på en
 * fil, hvis længde ingen kender.
 */
export function doemFilLaengde(sekunder: number): FilLaengdeDom {
  if (!Number.isFinite(sekunder) || sekunder <= 0) return "ukendt";
  return sekunder > MAKS_SEKUNDER ? "for_lang" : "ok";
}

/** «1:23» — til tælleren og boblen. */
export function formatVarighed(sekunder: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(sekunder) ? sekunder : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Varigheden, der gemmes på beskeden: hele sekunder, aldrig over loftet. */
export function varighedTilBesked(sekunder: number): number {
  const s = Math.round(Number.isFinite(sekunder) ? sekunder : 0);
  return Math.min(Math.max(s, 0), MAKS_SEKUNDER);
}

/** Beskedens content og context_meta for en video. Kun nøglen video.guid læses af laesChatVideo. */
export function byggVideoBesked(i: { guid: string; varighed: number }): {
  content: string;
  context_meta: { video: { guid: string; varighed: number } };
} {
  return {
    content: VIDEO_MARKOER,
    context_meta: { video: { guid: i.guid, varighed: varighedTilBesked(i.varighed) } },
  };
}

/**
 * «behandles» spørges igen hvert 2. sekund det FØRSTE minut fra første svar
 * (Jonas 29/9: «den bedste oplevelse for alle» — med JIT er videoen typisk
 * afspillelig «within 10–15 seconds», premium-encoding.md:15, og ti sekunders
 * takt gav op til ti sekunders unødig ventetid) …
 */
export const AFSPIL_POLL_HURTIG_MS = 2_000;
/** … indtil der er gået så længe fra første svar; derefter den rolige takt. */
export const AFSPIL_POLL_HURTIG_INDTIL_MS = 60_000;
/** Den rolige takt: hvert 10. sekund … */
export const AFSPIL_POLL_MS = 10_000;
/** … i højst 10 minutter fra første svar (uændret). */
export const AFSPIL_POLL_MAKS_MS = 10 * 60_000;
/** En «klar»-URL fornys så længe før `expires` (TTL er 3600 s i chat-video). */
export const FORNY_FOER_MS = 60_000;
/** Aldrig oftere end dette, heller ikke hvis `expires` allerede er tæt på. */
export const FORNY_MINDST_MS = 10_000;

/**
 * Hvornår spørges «afspil» igen? Millisekunder, eller false for aldrig.
 *   behandles → hvert AFSPIL_POLL_HURTIG_MS, så længe der er gået under
 *               AFSPIL_POLL_HURTIG_INDTIL_MS siden første svar; derefter hvert
 *               AFSPIL_POLL_MS, så længe der er gået under AFSPIL_POLL_MAKS_MS.
 *   klar      → FORNY_FOER_MS før `expires` (sekunder), dog mindst FORNY_MINDST_MS.
 *               Uden `expires`: aldrig. (Uændret 29/9.)
 *   fejlet    → aldrig.
 *
 * REGNESTYKKET (29/9): afspil-kald pr. åben visning fra mount til «klar» efter
 * T sekunder fra første svar, inkl. det første kald ved mount. Hvert
 * «behandles»-svar koster 2 Bunny-kald (Get Video + play data), «klar» 1
 * (recon-video-hurtigere.md §3).
 *   FØR  (10 s hele vejen):        kald = 1 + ⌈T/10⌉
 *   EFTER (2 s i 60 s, så 10 s):   kald = 1 + ⌈T/2⌉ for T ≤ 60; 31 + ⌈(T−60)/10⌉ derover
 *   klar efter 10 s:  før 2 kald (3 Bunny)  → efter 6 kald (11 Bunny)
 *   klar efter 30 s:  før 4 kald (7 Bunny)  → efter 16 kald (31 Bunny)
 *   klar efter 60 s:  før 7 kald (13 Bunny) → efter 31 kald (61 Bunny)
 *   loftet 10 min:    før 61 kald (121 Bunny) → efter 85 kald (169 Bunny)
 * Ventetiden efter «klar» hos Bunny falder fra op til 10 s til op til 2 s det
 * første minut. Det er den handel, Jonas valgte.
 */
export function naesteAfspilForespoergsel(i: {
  status: ChatVideoStatus | null | undefined;
  expires?: number | null;
  nuMs: number;
  foersteMs: number;
}): number | false {
  if (i.status === "behandles") {
    const gaaet = i.nuMs - i.foersteMs;
    if (gaaet < AFSPIL_POLL_HURTIG_INDTIL_MS) return AFSPIL_POLL_HURTIG_MS;
    return gaaet < AFSPIL_POLL_MAKS_MS ? AFSPIL_POLL_MS : false;
  }
  if (i.status === "klar") {
    if (typeof i.expires !== "number" || !Number.isFinite(i.expires)) return false;
    return Math.max(i.expires * 1000 - FORNY_FOER_MS - i.nuMs, FORNY_MINDST_MS);
  }
  return false;
}

/**
 * SENDELINJEN over skrivefeltet (Jonas 29/9): afsenderen skal SE, at videoen
 * sendes — ikke kun en procent på kameraknappen. Tilstandene:
 *   sender → «Sender video … 42 %» (procenten er TUS' fremdrift, kun filen)
 *   sendt  → «Videoen er sendt.» — forsvinder af sig selv, når beskeden er
 *            indsat (fladen ser rækken komme via realtime)
 *   fejl   → beskeden fra uploaden + «Prøv igen», som sender den SAMME fil
 *            igen uden at optage forfra (og uden ny upload, hvis kun
 *            beskeden fejlede — guid'et gemmes)
 * Ren tekstfunktion, så linjens ord kan prøves uden React.
 */
export type VideoSendeTilstand =
  | { tilstand: "sender"; procent: number }
  | { tilstand: "sendt" }
  | { tilstand: "fejl"; besked: string };

export function videoSendeTekst(t: VideoSendeTilstand): string {
  if (t.tilstand === "sender") {
    const p = Math.min(100, Math.max(0, Math.round(Number.isFinite(t.procent) ? t.procent : 0)));
    return `Sender video … ${p} %`;
  }
  if (t.tilstand === "sendt") return "Videoen er sendt.";
  return t.besked;
}

/**
 * Er «slet»-svaret en gennemført sletning? Kun { slettet: true } — også når
 * videoen allerede var væk (fandtes: false). Alt andet (fejl, 403, 503, intet
 * svar) betyder, at beskeden IKKE må slettes: uden beskeden kan videoen ikke
 * længere findes.
 */
export function sletGennemfoert(svar: unknown): boolean {
  return typeof svar === "object" && svar !== null && (svar as { slettet?: unknown }).slettet === true;
}
