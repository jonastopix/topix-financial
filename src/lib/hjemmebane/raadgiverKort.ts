/**
 * src/lib/hjemmebane/raadgiverKort.ts — «Din rådgiver» på medlemmets forside
 * (2/10-2026 eftermiddag, «forsidens to sidste kort»). REN: ingen React, ingen
 * Supabase. Testet i __tests__/raadgiverKort.test.ts; kildeværn
 * src/lib/__tests__/forsideKort.guard.test.ts.
 *
 * Kortet er en FORHÅNDSVISNING af medlemmets virksomhedssamtale: den seneste
 * menneskelige besked (message_type «user» — system-/AI-linjer er stille linjer
 * i chatten, ikke en besked fra nogen) + et lille sendefelt. Det markerer
 * INTET som læst (ingen mark_messages_read, ingen conversation_last_seen) —
 * det sker først i /chat.
 *
 * INGEN TILDELING (CLAUDE.md «Ingen tildeling af rådgiver», Jonas 1/10):
 * rådgiverne er sammen om alle medlemmer. Kortet siger aldrig «din rådgiver
 * X»; adressen er rådgivernes FORNAVNE fra den synlige rådgiverliste
 * (hentSynligeRaadgiverProfiler — tjenestekontoen står aldrig der), i
 * rækkefølgen listen giver: «Morten og Jonas». Uden navne: «dine rådgivere»
 * (chattens egen fallback er «Dine rådgivere»). assigned_advisor_id læses
 * aldrig.
 *
 * TIDEN: dansk kalenderdato og klokkeslæt (Europe/Copenhagen), `nu` gives
 * ind. Dagforskellen regnes på de to DANSKE datoer (år/måned/dag lagt i
 * Date.UTC og trukket fra hinanden ÷ 86 400 000) — aldrig på timer, så et
 * DST-døgn på 23/25 timer flytter ikke «i går».
 */
import { renTekst } from "@/lib/hjemmebane/richtext";
import { chatAfsendelse, tekstTilContent } from "@/lib/chatDokument";
import { MAX_MESSAGE_LENGTH } from "@/lib/chatShared";
import { kortDato } from "@/lib/hjemmebane/forsideDato";
import { kbhDato } from "@/lib/hverdage";

export const TIDSZONE = "Europe/Copenhagen";
/** Uddragets loft i tegn («…» medregnet). */
export const RAADGIVER_KORT_UDDRAG_LOFT = 140;

/** Kortets tekster — ÉT sted. */
export const RAADGIVER_KORT = {
  eyebrow: "Din rådgiver",
  aabnChatten: "Åbn chatten",
  chatSti: "/chat",
  send: "Send",
  sender: "Sender …",
  dig: "Dig",
  ukendtAfsender: "Rådgiver",
  foersteBesked: "Skriv din første besked til dine rådgivere",
  ingenSamtale: "Din samtale med dine rådgivere er ikke klar endnu. Åbn chatten for at se den.",
  hentefejl: "Din seneste besked kunne ikke hentes.",
  sendefejl: "Beskeden blev ikke sendt. Prøv igen.",
  udloebet: "Dit medlemskab er udløbet — beskeder kan ikke sendes.",
  forLang: `Beskeden er for lang (højst ${MAX_MESSAGE_LENGTH} tegn).`,
  feltLabel: "Besked til dine rådgivere",
} as const;

const DANSK_DATO = new Intl.DateTimeFormat("en-CA", { timeZone: TIDSZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const DANSK_KLOKKE = new Intl.DateTimeFormat("da-DK", { timeZone: TIDSZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const UGEDAG = new Intl.DateTimeFormat("da-DK", { timeZone: TIDSZONE, weekday: "long" });
const DAG_MAANED = new Intl.DateTimeFormat("da-DK", { timeZone: TIDSZONE, day: "numeric", month: "long" });
const DAG_MAANED_AAR = new Intl.DateTimeFormat("da-DK", { timeZone: TIDSZONE, day: "numeric", month: "long", year: "numeric" });

/** Dansk kalenderdato som [år, måned, dag]. */
function danskeTal(d: Date): [number, number, number] {
  const [a, m, dag] = DANSK_DATO.format(d).split("-").map(Number);
  return [a!, m!, dag!];
}

/** Hele danske kalenderdage fra `fra` til `til` (positiv når `til` er senere). */
export function danskeDageMellem(fra: Date, til: Date): number {
  const [a1, m1, d1] = danskeTal(fra);
  const [a2, m2, d2] = danskeTal(til);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** «14.12» — dansk klokkeslæt, punktum som skilletegn (husets form). */
export function danskKlokke(d: Date): string {
  return DANSK_KLOKKE.format(d).replace(":", ".");
}

/**
 * Relativ dansk tid for en besked:
 *   samme danske dato        → «i dag kl. 14.12»
 *   dagen før                → «i går kl. 14.12»
 *   2–6 dage før             → «tirsdag kl. 14.12»
 *   samme danske år          → «3. september kl. 14.12»
 *   ellers                   → «3. september 2025 kl. 14.12»
 * En tid i fremtiden (skævt ur) behandles som «i dag»/datoen — aldrig «om».
 * Ugyldig tid → "".
 */
export function relativDanskTid(iso: string | null | undefined, nu: Date): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const kl = `kl. ${danskKlokke(t)}`;
  const dage = danskeDageMellem(t, nu);
  if (dage <= 0) return dage === 0 ? `i dag ${kl}` : `${DAG_MAANED.format(t)} ${kl}`;
  if (dage === 1) return `i går ${kl}`;
  if (dage <= 6) return `${UGEDAG.format(t)} ${kl}`;
  if (danskeTal(t)[0] === danskeTal(nu)[0]) return `${DAG_MAANED.format(t)} ${kl}`;
  return `${DAG_MAANED_AAR.format(t)} ${kl}`;
}

/**
 * Beskedens tekst, pænt afkortet: ren tekst (renTekst — HTML fra editoren
 * bliver til tekst), højst `loft` tegn med «…» medregnet, skåret ved sidste
 * mellemrum når det ikke koster mere end en tredjedel af loftet.
 */
export function beskedForhaandsvisning(content: string | null | undefined, loft: number = RAADGIVER_KORT_UDDRAG_LOFT): string {
  const tekst = renTekst(content);
  if (tekst.length <= loft) return tekst;
  const raa = tekst.slice(0, loft - 1);
  const mellemrum = raa.lastIndexOf(" ");
  const skaaret = mellemrum >= Math.floor((loft * 2) / 3) ? raa.slice(0, mellemrum) : raa;
  return `${skaaret.replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** «Morten Munk» → «Morten». */
function fornavnAf(navn: string | null | undefined): string | null {
  const t = navn?.trim();
  return t ? t.split(/\s+/)[0]! : null;
}

/** «Morten og Jonas» / «Morten, Jonas og Anne» / «Morten» / «dine rådgivere». */
export function raadgiverAdresse(navne: readonly (string | null | undefined)[] | null | undefined): string {
  const f = [...new Set((navne ?? []).map(fornavnAf).filter((x): x is string => !!x))];
  if (f.length === 0) return "dine rådgivere";
  if (f.length === 1) return f[0]!;
  return `${f.slice(0, -1).join(", ")} og ${f[f.length - 1]}`;
}

/** Feltets pladsholder: «Skriv til Morten og Jonas …». */
export function skrivTilPladsholder(navne: readonly (string | null | undefined)[] | null | undefined): string {
  return `Skriv til ${raadgiverAdresse(navne)} …`;
}

export interface AfsenderProfil {
  user_id: string;
  full_name: string | null;
  is_advisor: boolean | null;
}

/** Afsenderens navn i kortet: «Dig» for medlemmet selv, ellers det fulde navn fra samtalens afsenderprofiler. */
export function afsenderNavn(senderId: string, egenId: string | null | undefined, profiler: readonly AfsenderProfil[] | null | undefined): string {
  if (egenId && senderId === egenId) return RAADGIVER_KORT.dig;
  const p = (profiler ?? []).find((x) => x.user_id === senderId);
  const navn = p?.full_name?.trim();
  if (navn) return navn;
  return p?.is_advisor === false ? "Medlem" : RAADGIVER_KORT.ukendtAfsender;
}

/**
 * Feltets tekst → beskedens `content`, PRÆCIS som chattens sendefelt bygger
 * den for ét afsnit uden #-henvisning: chatAfsendelse(tekst, editorens HTML,
 * dokument) med HTML = «<p>» + tekstTilContent(tekst) + «</p>» (Tiptap
 * escaper &, < og >). Ren tekst → content = teksten; med &, < eller > →
 * HTML-afsnittet (isPlain-reglen). Feltet er én linje, så der er altid ét
 * afsnit. null = intet at sende (tom) eller for langt (chattens loft).
 */
export function kortetsContent(tekst: string): string | null {
  const t = tekst.trim();
  if (!t || t.length > MAX_MESSAGE_LENGTH) return null;
  return chatAfsendelse(t, `<p>${tekstTilContent(t)}</p>`, null).content;
}

// ── Forside v3 (docs/forside-v3.md §5, 2/10-2026 aften) ────────────────────
/**
 * Kortet viser den seneste besked FRA EN RÅDGIVER — aldrig medlemmets egen (mockup v3: «Den seneste besked
 * FRA EN RÅDGIVER (aldrig medlemmets egen)»). Rådgiverne er den SYNLIGE rådgiverliste
 * (hentSynligeRaadgiverProfiler — tjenestekontoen står aldrig der); en afsender, der ikke er på listen, er
 * ikke en rådgiver. FAIL-CLOSED: uden liste vælges ingen besked (kalderen siger fejlen).
 */
export interface RaadgiverProfil {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface KortBesked {
  id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  context_meta?: unknown;
}

/** Den nyeste besked (beskederne kommer nyeste først) fra en på rådgiverlisten — ellers null. */
export function senesteFraRaadgiver<B extends KortBesked>(beskeder: readonly B[], raadgivere: readonly RaadgiverProfil[]): B | null {
  const ids = new Set(raadgivere.map((r) => r.user_id));
  return beskeder.find((b) => ids.has(b.sender_id)) ?? null;
}

/** Afsenderens fornavn fra rådgiverlisten («Jonas»); ukendt → «Rådgiver». */
export function raadgiverFornavn(senderId: string, raadgivere: readonly RaadgiverProfil[]): string {
  const navn = raadgivere.find((r) => r.user_id === senderId)?.full_name?.trim();
  return navn ? navn.split(/\s+/)[0]! : RAADGIVER_KORT.ukendtAfsender;
}

/**
 * Beskedens linje i kortet. En video (context_meta.video.guid — laesChatVideo, ét sted) og en besked uden
 * læsbar tekst siges i kursiv som det, der skete — aldrig «🎥 Video» eller en tom linje.
 */
export const SENDTE_EN_VIDEO = "Sendte en video";
export const SENDTE_EN_FIL = "Sendte en vedhæftning";
export function beskedLinje(b: Pick<KortBesked, "content" | "context_meta">, erVideo: (contextMeta: unknown) => boolean): { tekst: string; kursiv: boolean } {
  if (erVideo(b.context_meta)) return { tekst: SENDTE_EN_VIDEO, kursiv: true };
  const tekst = beskedForhaandsvisning(b.content);
  return tekst ? { tekst, kursiv: false } : { tekst: SENDTE_EN_FIL, kursiv: true };
}

/** Kvitteringen efter en afsendelse fra kortet (beskeden står i chatten — kortet viser kun rådgivernes). */
export function sendtKvittering(navne: readonly (string | null | undefined)[]): string {
  return `Sendt. ${raadgiverAdresse(navne)} svarer i chatten.`;
}

/** Beskedens tid i forsidens ene datoformat: «tirs. 29. sep. kl. 19.38» (kortDato + dansk klokke). Ugyldig → "". */
export function beskedTid(iso: string | null | undefined, nu: Date): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return `${kortDato(kbhDato(t), nu)} kl. ${danskKlokke(t)}`;
}
