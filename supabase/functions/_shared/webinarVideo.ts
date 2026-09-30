/**
 * webinarVideo — Mortens hilsen som video i mailen «dagen før» (udkast 30/9-2026).
 *
 * JONAS 30/9: Morten optager en kort, personlig håndholdt video, der skal ind i
 * mailen «dagen før» (arten `en_dag`). Den er ikke optaget endnu — derfor skal
 * mailen kunne TÆNDES, når videoen ligger på Bunny, uden ny kode og uden deploy.
 * Tændingen er én række i app_config: `webinar_en_dag_video` (jsonb).
 *
 * KONFIGURATIONEN (STRIKS — en ukendt nøgle er en stavefejl og afvises):
 *
 *   {
 *     "library_id":   "123456",                         Bunny Stream → biblioteket → API → Video Library ID (tal eller tal-streng)
 *     "video_id":     "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  Bunny → videoen → Video ID (GUID)
 *     "pull_zone":    "vz-xxxxxxxx-xxx.b-cdn.net",      bibliotekets CDN-værtsnavn (stillbilledet hentes derfra)
 *     "titel":        "Mortens hilsen før webinaret",    billedets alt-tekst (1–80 tegn)
 *     "varighed_min": 2,                                 knappens «(N min)», heltal 1–20
 *     "aktiv":        false                              false = KUN prøven til én adresse får videoen
 *   }
 *
 *   null (standard, sat af migrationen)  → mailen er PRÆCIS som i dag, også i prøven.
 *   ugyldig eller delvis                  → FAIL-CLOSED: mailen uden video, og grunden i svaret.
 *   gyldig, aktiv false                   → kun cronens prøve (`email` + `art`) får videoen.
 *   gyldig, aktiv true                    → alle `en_dag`-mails får videoen.
 *
 * HVORFOR «aktiv» OG IKKE ET BODY-FELT I PRØVEN: prøven skal vise den konfiguration,
 * der går i luften — ikke en kopi i en body, der kan være stavet anderledes. Jonas
 * sætter rækken med aktiv false, prøven læser NØJAGTIG den række, og tændingen er
 * én guarded UPDATE af ét felt. Samme form som låsen webinar_mail_aktiv.
 *
 * INGEN AFSPILLER I MAILEN — mailklienter kan ikke. Mailen bærer Bunnys
 * stillbillede (link-wrapped) og en knap; begge peger på husets klik-function
 * `webinar-video`, som logger klikket anonymt pr. mail-række og viderestiller
 * til Bunnys afspilningsside.
 *
 * LINKET BÆRER ET ID, ALDRIG EN MAIL: `?m=<webinar_mails.id>`. Cronen trækker
 * id'et (crypto.randomUUID) FØR mailen bygges og skriver sporet med SAMME id —
 * så klikket kan knyttes til rækken uden at en adresse står i URL'en. Id'et er
 * 122 tilfældige bit; det kan ikke gættes, og det er ikke persondata i sig selv.
 *
 * VIDERESTILLINGEN ER IKKE ÅBEN: målet bygges af konfigurationen (library_id =
 * cifre, video_id = GUID) på den FASTE vært iframe.mediadelivery.net — aldrig af
 * noget i URL'en. `bunnyAfspilUrl` tjekker værten en gang til.
 *
 * TO FORUDSÆTNINGER, VI IKKE KAN SE HERFRA (skal MÅLES før tændingen — se
 * CLAUDE.md «Platformens webinarmails» og docs/webinaret-og-annoncerne.md §7g):
 *   1. Stillbilledet hentes af mailklienten UDEN referrer. Hjemmebanes pull zone
 *      svarer 403 uden referrer (bunnyMedia.ts, målt 9/8) — ligger videoen dér,
 *      står billedet tomt i mailen (alt-teksten og knappen står stadig).
 *   2. Afspilningssiden `/play/<lib>/<video>` er USIGNERET. Et bibliotek med
 *      «embed view token authentication» (chat-biblioteket 765771 har det) afviser
 *      den. Videoen skal ligge i et bibliotek uden token-krav.
 *   Målingen: `curl -sI https://<pull_zone>/<video_id>/thumbnail.jpg` → 200
 *   image/jpeg, og `curl -sI https://iframe.mediadelivery.net/play/<lib>/<video>`
 *   → 200 — begge UDEN Referer-header.
 */
import type { MailArt } from "./webinarMailDom.ts";

/** Nøglen i app_config. */
export const VIDEO_KONFIG_NOEGLE = "webinar_en_dag_video";

/** Den ENE art, der kan bære videoen. */
export const VIDEO_ART: MailArt = "en_dag";

/** Afspilningssidens vært — fast, hvidlistet. */
export const BUNNY_AFSPIL_VAERT = "iframe.mediadelivery.net";

/** De nøgler, konfigurationen må have — og skal have. */
export const VIDEO_NOEGLER = ["library_id", "video_id", "pull_zone", "titel", "varighed_min", "aktiv"] as const;

export const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Bunnys bibliotek-id er et tal. Højst 12 cifre — et loft, ikke en måling. */
const LIBRARY_RE = /^[1-9][0-9]{0,11}$/;
/**
 * Pull zonens værtsnavn: ét label under b-cdn.net (Bunnys egne navne har formen
 * vz-xxxxxxxx-xxx.b-cdn.net). Et eget domæne afvises bevidst: værtsnavnet står i
 * en <img src> i en mail til hundreder, og kun Bunnys eget domæne er hvidlistet.
 */
const PULL_ZONE_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.b-cdn\.net$/;
export const TITEL_MAKS = 80;
export const VARIGHED_MAKS_MIN = 20;

export interface VideoKonfig {
  libraryId: string;
  videoId: string;
  pullZone: string;
  titel: string;
  varighedMin: number;
  aktiv: boolean;
}

/**
 * Dommen er diskrimineret på `status` (en streng), ikke på et `ok: boolean`:
 * tsconfig.app.json har strict = false, og uden strictNullChecks indsnævrer
 * TypeScript ikke på `!dom.ok` — en streng-diskriminant virker i begge.
 */
export type KonfigDom =
  | { status: "gyldig"; konfig: VideoKonfig }
  | { status: "ikke_sat" }
  | { status: "ugyldig"; grund: string };

/**
 * DOMMEN OVER KONFIGURATIONEN. Ren; kaster aldrig. Alt, der ikke er præcis den
 * form, filhovedet beskriver, er `ugyldig` med en grund — fail-closed.
 */
export function laesVideoKonfig(raa: unknown): KonfigDom {
  if (raa === null || raa === undefined) return { status: "ikke_sat" };
  if (typeof raa !== "object" || Array.isArray(raa)) return { status: "ugyldig", grund: "ikke et objekt" };
  const o = raa as Record<string, unknown>;
  const ukendte = Object.keys(o).filter((k) => !(VIDEO_NOEGLER as readonly string[]).includes(k));
  if (ukendte.length > 0) return { status: "ugyldig", grund: `ukendte nøgler: ${ukendte.sort().join(", ")}` };
  const mangler = VIDEO_NOEGLER.filter((k) => !(k in o));
  if (mangler.length > 0) return { status: "ugyldig", grund: `mangler: ${mangler.join(", ")}` };

  const lib = typeof o.library_id === "number" && Number.isSafeInteger(o.library_id) ? String(o.library_id)
    : typeof o.library_id === "string" ? o.library_id.trim() : "";
  if (!LIBRARY_RE.test(lib)) return { status: "ugyldig", grund: "library_id er ikke et bibliotek-id (cifre)" };

  const vid = typeof o.video_id === "string" ? o.video_id.trim().toLowerCase() : "";
  if (!GUID_RE.test(vid)) return { status: "ugyldig", grund: "video_id er ikke et GUID" };

  const zone = typeof o.pull_zone === "string" ? o.pull_zone.trim().toLowerCase() : "";
  if (!PULL_ZONE_RE.test(zone)) return { status: "ugyldig", grund: "pull_zone er ikke et værtsnavn under b-cdn.net" };

  const titel = typeof o.titel === "string" ? o.titel.trim() : "";
  if (titel.length === 0 || titel.length > TITEL_MAKS) return { status: "ugyldig", grund: `titel skal være 1–${TITEL_MAKS} tegn` };
  // Regel 6 i webinarMailTekster.ts: optagelsen loves ikke, og ordet står i ingen mail.
  if (/optagelse/i.test(titel)) return { status: "ugyldig", grund: "titel må ikke nævne en optagelse" };

  const min = o.varighed_min;
  if (typeof min !== "number" || !Number.isInteger(min) || min < 1 || min > VARIGHED_MAKS_MIN) {
    return { status: "ugyldig", grund: `varighed_min skal være et heltal 1–${VARIGHED_MAKS_MIN}` };
  }

  if (typeof o.aktiv !== "boolean") return { status: "ugyldig", grund: "aktiv skal være true eller false" };

  return { status: "gyldig", konfig: { libraryId: lib, videoId: vid, pullZone: zone, titel, varighedMin: min, aktiv: o.aktiv } };
}

/** Status i cronens svar — beviset for, at den nye kode kører, og hvorfor/hvorfor ikke. */
export type VideoStatus = "ikke_sat" | "ugyldig" | "laesefejl" | "slukket" | "proeve" | "taendt";

/**
 * FÅR DENNE KØRSEL VIDEOEN? Ren. `proeve` = kørslen er begrænset til én adresse
 * (cronens `email`). Kun `proeve` og `taendt` giver video.
 */
export function videoIKoerslen(dom: KonfigDom, proeve: boolean): { status: VideoStatus; konfig: VideoKonfig | null; grund: string | null } {
  if (dom.status === "ikke_sat") return { status: "ikke_sat", konfig: null, grund: null };
  if (dom.status === "ugyldig") return { status: "ugyldig", konfig: null, grund: dom.grund };
  if (dom.konfig.aktiv) return { status: "taendt", konfig: dom.konfig, grund: null };
  if (proeve) return { status: "proeve", konfig: dom.konfig, grund: null };
  return { status: "slukket", konfig: null, grund: null };
}

/** Bunnys stillbillede — samme form som src/lib/hjemmebane/bunnyMedia.ts. */
export function stillbilledeUrl(k: Pick<VideoKonfig, "pullZone" | "videoId">): string {
  return `https://${k.pullZone}/${k.videoId}/thumbnail.jpg`;
}

/**
 * Bunnys afspilningsside. Værten er FAST; library/video er dømt af
 * laesVideoKonfig. Tjekket her er værnet mod, at nogen en dag bygger målet af
 * noget andet: en URL med en anden vært giver null — og functionen viderestiller
 * så ingen steder hen.
 */
export function bunnyAfspilUrl(k: Pick<VideoKonfig, "libraryId" | "videoId">): string | null {
  if (!LIBRARY_RE.test(k.libraryId) || !GUID_RE.test(k.videoId)) return null;
  const u = new URL(`https://${BUNNY_AFSPIL_VAERT}/play/${k.libraryId}/${k.videoId}`);
  return u.host === BUNNY_AFSPIL_VAERT && u.protocol === "https:" ? u.toString() : null;
}

/** Klik-linket i mailen: husets function + mail-rækkens id. Aldrig en adresse. */
export function videoKlikUrl(basis: string, mailId: string): string {
  return `${basis.replace(/\/+$/, "")}?m=${encodeURIComponent(mailId)}`;
}

/** Det, byggeren skal bruge — alt færdigt, intet at slå op. */
export interface MailVideo {
  klikUrl: string;
  stillbilledeUrl: string;
  titel: string;
  varighedMin: number;
}

export function mailVideo(k: VideoKonfig, klikBasis: string, mailId: string): MailVideo {
  return { klikUrl: videoKlikUrl(klikBasis, mailId), stillbilledeUrl: stillbilledeUrl(k), titel: k.titel, varighedMin: k.varighedMin };
}

/** Knappens tekst — ét sted. */
export const knapTekst = (min: number): string => `Se Mortens hilsen (${min} min)`;

// ── Klik-functionen ─────────────────────────────────────────────────────────

/** Formen på `m` — et uuid (webinar_mails.id). Alt andet når aldrig databasen. */
export function laesKlikId(raa: unknown): string | null {
  if (typeof raa !== "string") return null;
  const s = raa.trim().toLowerCase();
  return GUID_RE.test(s) ? s : null;
}

/**
 * Den del af supabase-klienten, verifyVideoKlik bruger — så dommen kan prøves
 * uden Deno. `from` returnerer `unknown` BEVIDST: en strukturel type for hele
 * kæden får TypeScript til at sammenligne den med SupabaseClients generiske
 * typer, og det giver TS2589 («excessively deep») i functionen. Kæden
 * beskrives i stedet af KlikKaede, som kun bruges inde i dommen.
 */
export interface KlikOpslag {
  from(tabel: string): unknown;
}
interface KlikKaede {
  select(kolonner: string): {
    eq(k: string, v: string): {
      eq(k: string, v: string): {
        eq(k: string, v: string): {
          maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
  };
}

export type KlikDom = { kendt: true; mailId: string } | { kendt: false; grund: "form" | "ukendt" | "laesefejl" };

/**
 * LEGITIMATIONEN FOR ET KLIK: id'et er en RIGTIG, SENDT `en_dag`-mail. Formen
 * dømmes FØR noget opslag; et id, der ikke er en sendt en_dag-række, logges
 * aldrig (ét svar udadtil: viderestillingen — kun loggen ved hvorfor).
 */
export async function verifyVideoKlik(admin: KlikOpslag, raa: unknown): Promise<KlikDom> {
  const id = laesKlikId(raa);
  if (id === null) return { kendt: false, grund: "form" };
  try {
    const { data, error } = await (admin.from("webinar_mails") as KlikKaede).select("id")
      .eq("id", id).eq("art", VIDEO_ART).eq("udfald", "ok").maybeSingle();
    if (error) return { kendt: false, grund: "laesefejl" };
    return data ? { kendt: true, mailId: id } : { kendt: false, grund: "ukendt" };
  } catch {
    return { kendt: false, grund: "laesefejl" };
  }
}
