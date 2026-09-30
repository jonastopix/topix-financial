/**
 * nyhedAgent — NYHEDSAGENTENS motor, skive 1 (30/9-2026).
 *
 * Jonas 30/9: «En agent der altid holder øje med hvad der sker af nyt i
 * verdenen (tech, regler etc.) som er relevant for medlemmerne. Og så skal der
 * laves et opslag i community med nyhederne.» (godkendt). Arkitekturen:
 * docs/agentarkitektur.md §1.2–1.4 (tørkørsel, lås, spor, niveauer, budget) og
 * §4.2 (nyhedsagenten: N1 PERMANENT — det er rådgiverens stemme).
 *
 * REN (ingen Supabase, ingen Deno, ingen fetch): parseren, dedup-nøglen, de to
 * LLM-værktøjers skema, valideringen af LLM-svaret, dokumentbyggeren og
 * afgørelsens tilstandsovergange. Vitest dækker den
 * (src/lib/__tests__/nyhedAgent.test.ts); kildeværnet står i
 * src/lib/__tests__/nyhedAgent.guard.test.ts. Functionerne nyhed-agent-cron
 * (Bucket B) og nyhed-udkast-afgoer (Bucket A) henter, kalder og skriver.
 *
 * NIVEAU N1 (arkitekturen §1.3): agenten skriver KUN et udkast i sin egen
 * tabel (nyhed_udkast) og ringer rådgivernes klokke. Intet når community, før
 * en rådgiver har trykket «Publicér i community» på /nyheder — og det tryk
 * bruger husets EKSISTERENDE skrivevej (opret_community_traad som rådgiveren,
 * derefter notify-community-naevnelse og notify-community-opslag), så
 * klokker og mails følger husets regler. Cronen kender ikke skrivevejen
 * (kildeværnet fælder den, hvis den gør).
 *
 * LLM'EN SKRIVER ALDRIG UDAD (§1.2 pkt. 6): dens svar er et felt, som koden
 * dømmer. Tre domme gør «ingen opfundne tal/datoer» til en TEST, ikke en
 * instruks:
 *   1. Skemaet: præcis de felter, vi beder om, med længdegrænser.
 *   2. Kilden: hvert punkt peger på et emne, vi selv har valgt; linket bygges af
 *      os ud fra emnets URL — modellen kan aldrig skrive et link (et «http» eller
 *      «www.» i teksten er en afvisning).
 *   3. Tallene: hvert tal i et punkt (cifre, datoer, beløb, procenter, paragraffer)
 *      skal stå ordret i det emnes egen titel eller uddrag; titlen, indledningen
 *      og afslutningen må slet ikke have cifre. Et tal, kilden ikke siger, er en
 *      afvisning af hele udkastet.
 *
 * INGEN PERSONDATA TIL LLM'EN: modellen får KUN offentlige feed-felter (titel,
 * uddrag, kildenavn, dato) under korte id'er (n1, n2 …). Ingen medlemsrække,
 * intet navn, ingen branche fra platformen — kildeværnet fælder et opslag i en
 * medlemstabel i cronen.
 */
import { kbhDato } from "./hverdage.ts";
import { getISOWeekKey } from "./isoUge.ts";

/** Markøren i svaret, som KUN den nye kode kan svare (CLAUDE.md-beviset). */
export const NYHED_AGENT_SKIVE = "skive-1" as const;

/** Låsen: rigtig skrivning kræver dry_run: false OG app_config['nyhedsagent_aktiv'] = true. */
export const LAAS_NOEGLE = "nyhedsagent_aktiv";

/** Klokken, der ringer, når ugens udkast er klar (MORGEN-listen i klokkeMail.ts). */
export const TYPE_NYHED_UDKAST_KLAR = "nyhed_udkast_klar";
export const KLOKKE_REFERENCE_TYPE = "nyhed_udkast";
export const KLOKKE_TITEL = "Ugens nyheder er klar til gennemsyn";
export function klokkeTekst(antal: number, kilder: readonly string[]): string {
  const hvorfra = kilder.length > 0 ? ` fra ${[...new Set(kilder)].join(", ")}` : "";
  return `${antal} nyheder${hvorfra}. Intet er publiceret — ret, publicér eller afvis på /nyheder.`;
}

// ── Kilderne ────────────────────────────────────────────────────────────────

export interface Kilde {
  /** Kort nøgle — står i nyhed_emne.kilde. */
  noegle: string;
  /** Navnet, som det står i opslaget («Kilde: …»). */
  navn: string;
  url: string;
  format: "rss" | "atom";
  /** Hvorfor kilden er med — hvem af medlemmerne rammes. */
  hvorfor: string;
  /** Hvornår og hvordan URL'en er SLÅET OP (WebFetch), og hvad den svarede. */
  maalt: string;
}

/**
 * KUN kilder, hvis feed-URL er SLÅET OP og svarede med gyldigt XML (WebFetch
 * 30/9-2026). Ingen betalte medier skrabes: vi læser feedets egne felter (titel,
 * uddrag, link) og henter aldrig selve artiklen.
 *
 * UMÅLT og derfor IKKE med (30/9): Skattestyrelsens «Juridisk nyt»
 * (https://rss.skat.dk/rss.aspx?oid=117355 — står på info.skat.dk/data.aspx?oid=117355,
 * men selve feedet kunne ikke hentes: WebFetch krævede en godkendelse, der ikke
 * kom), Høringsportalens «Skatter og afgifter» (formAreaId=15, samme grund),
 * EU-Kommissionens repræsentation i Danmark (/node/2578/rss_da, samme grund),
 * Nationalbanken og Danmarks Statistik (feed-listerne er ikke i sidernes tekst),
 * Erhvervsstyrelsens og Finanstilsynets egne nyheder (intet feed fundet på
 * erhvervsstyrelsen.dk/nyheder, /abonner og finanstilsynet.dk/nyheder-og-presse).
 * En kilde tages ind ved at slå den op og skrive målingen her.
 */
export const KILDER: readonly Kilde[] = [
  {
    noegle: "hoering_erst",
    navn: "Høringsportalen (Erhvervsstyrelsen)",
    url: "https://hoeringsportalen.dk/Syndication/HearingsByAuthorityFeed?authorityId=710",
    format: "atom",
    hvorfor: "Nye regler på vej fra Erhvervsstyrelsen (selskabsret, årsregnskab, bogføring, hvidvask) — ejeren kan nå at forberede sig og svare i høringen.",
    maalt: "WebFetch 30/9-2026: gyldigt Atom 1.0, «Høringsportalen - Høringer for Erhvervsstyrelsen», nyeste opdateret 24/9-2026.",
  },
  {
    noegle: "hoering_em",
    navn: "Høringsportalen (Erhvervsministeriet)",
    url: "https://hoeringsportalen.dk/Syndication/HearingsByAuthorityFeed?authorityId=619",
    format: "atom",
    hvorfor: "Lovforslag og bekendtgørelser fra Erhvervsministeriet — ordninger og regler, der rammer alle virksomheder.",
    maalt: "WebFetch 30/9-2026: gyldigt Atom 1.0, «Høringsportalen - Høringer for Erhvervsministeriet», nyeste 6/7-2026.",
  },
  {
    noegle: "hoering_ftst",
    navn: "Høringsportalen (Finanstilsynet)",
    url: "https://hoeringsportalen.dk/Syndication/HearingsByAuthorityFeed?authorityId=653",
    format: "atom",
    hvorfor: "Regler om finansiering, investering og årsrapporter — relevant for ejere, der låner, investerer eller rejser kapital.",
    maalt: "WebFetch 30/9-2026: gyldigt Atom, «Høringsportalen - Høringer for Finanstilsynet», nyeste 4/9-2026.",
  },
  {
    noegle: "nemhandel",
    navn: "Nemhandel (Erhvervsstyrelsen)",
    url: "https://nemhandel.dk/nyheder_releases.xml",
    format: "rss",
    hvorfor: "E-fakturering og digital bogføring — «E-fakturering bliver den nye fælles måde at fakturere» rammer hver SMV's bogholderi.",
    maalt: "WebFetch 30/9-2026: gyldigt RSS 2.0, «Nyheder og releases fra nemhandel.dk», nyeste 28/9-2026. URL'en står på nemhandel.dk/faa-nyheder-og-releases-som-rss.",
  },
  {
    noegle: "version2",
    navn: "Version2",
    url: "https://www.version2.dk/rss",
    format: "rss",
    hvorfor: "Dansk tech: AI, it-sikkerhed og digitalisering — hvad der ændrer sig i de værktøjer, ejerne bruger. Kun feedets egne felter læses; artiklen hentes aldrig (dele af Version2 er bag betaling).",
    maalt: "WebFetch 30/9-2026: gyldigt RSS 2.0, «Version2 articles», nyeste 29/9-2026. URL'en står på version2.dk/feeds.",
  },
];

// ── Lofter (omkostning og tid) ──────────────────────────────────────────────
// Omkostningsloftet pr. kørsel er i KALD og TEGN, ikke i kroner: Lovables
// gateway-pris pr. token er UMÅLT (arkitekturen §1.4: «Lovables pris»), og en
// pris, vi ikke har slået op, skrives ikke. Tokens fra svarets `usage` gemmes i
// sporet, så prisen kan regnes, når den er slået op.
//
// Regnestykket for det værste forløb pr. kørsel:
//   vurdering: ceil(MAKS_TIL_VURDERING / VURDERING_PR_KALD) = ceil(40 / 20) = 2 kald
//   udkast:    1 kald + 1 nyt forsøg ved et afvist svar           = 2 kald
//   i alt:     MAKS_LLM_KALD = 4 kald, hvert ≤ MAKS_TEGN_PR_KALD = 24 000 tegn ind
//              (≈ 6 000 tokens ved ~4 tegn/token) → ≤ ~24 000 tokens ind pr. kørsel.
export const MAKS_LLM_KALD = 4;
export const MAKS_TIL_VURDERING = 40;
export const VURDERING_PR_KALD = 20;
export const MAKS_TEGN_PR_KALD = 24_000;
export const MAKS_PR_KILDE = 15;
/** Kun nyheder fra de sidste 8 dage (ugentlig kørsel + én dags overlap). */
export const VINDUE_DAGE = 8;
/** Et emne skal have mindst denne score for at komme i udkastet. */
export const MIN_SCORE = 6;
export const MIN_PUNKTER = 3;
export const MAKS_PUNKTER = 5;
export const RESUME_MAKS = 600;

// Tidsbudgettet — samme form som webinarMailBudget.ts: et LLM-kald startes KUN,
// hvis dets VÆRSTE forløb når at slutte før jobbets timeout.
//   JOB_TIMEOUT_MS (cron-migrationens kald_edge-timeout)      = 140 000
//   − MARGIN_MS (opstart, sporskrivning, klokke, netværk)      =  15 000
//   − LLM_TIMEOUT_MS (ét kalds værste forløb)                  =  40 000
//   = seneste start for et LLM-kald                             =  85 000 ms
// Ændres jobbets timeout, ændres JOB_TIMEOUT_MS i samme PR.
export const JOB_TIMEOUT_MS = 140_000;
export const MARGIN_MS = 15_000;
export const LLM_TIMEOUT_MS = 40_000;
export const FEED_TIMEOUT_MS = 10_000;
export function maaStarteLlmKald(forloebetMs: number, kaldIAlt: number): boolean {
  return kaldIAlt < MAKS_LLM_KALD && forloebetMs + LLM_TIMEOUT_MS <= JOB_TIMEOUT_MS - MARGIN_MS;
}

// ── Uge-nøglen ──────────────────────────────────────────────────────────────

/** ISO-ugen for den DANSKE kalenderdag (isoUge.ts er den kanoniske aritmetik; middag som anker, så ingen tidszone flytter dagen). */
export function ugeNoegle(nu: Date): string {
  return getISOWeekKey(new Date(`${kbhDato(nu)}T12:00:00`));
}

// ── Feed-parseren ───────────────────────────────────────────────────────────

export interface FeedEmne {
  kilde: string;
  titel: string;
  url: string;
  resume: string;
  /** ISO eller null — et emne uden dato er en observation, ikke en nøgle. */
  udgivet: string | null;
}

const NAVNGIVNE: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aelig: "æ", AElig: "Æ", oslash: "ø", Oslash: "Ø", aring: "å", Aring: "Å",
  eacute: "é", Eacute: "É", uuml: "ü", ouml: "ö", auml: "ä", ndash: "–", mdash: "—",
  laquo: "«", raquo: "»", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "„", sect: "§",
};

export function afkodEntiteter(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (hel, navn: string) => {
    if (navn.startsWith("#x")) { const n = parseInt(navn.slice(2), 16); return Number.isFinite(n) ? String.fromCodePoint(n) : hel; }
    if (navn.startsWith("#")) { const n = parseInt(navn.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : hel; }
    return NAVNGIVNE[navn] ?? hel;
  });
}

/** Ren tekst af et XML/HTML-felt: CDATA ud, tags ud, entiteter afkodet (to gange — feeds dobbeltkoder HTML), mellemrum samlet. */
export function rensTekst(raa: string | null | undefined): string {
  if (!raa) return "";
  let s = raa.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = afkodEntiteter(s);
  s = s.replace(/<[^>]*>/g, " ");
  s = afkodEntiteter(s);
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

function felt(blok: string, tag: string): string | null {
  const m = blok.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : null;
}

function atomLink(blok: string): string | null {
  const links = [...blok.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const attr = (a: string, navn: string) => a.match(new RegExp(`\\b${navn}\\s*=\\s*"([^"]*)"`, "i"))?.[1] ?? a.match(new RegExp(`\\b${navn}\\s*=\\s*'([^']*)'`, "i"))?.[1] ?? null;
  const alternativ = links.find((a) => { const rel = attr(a, "rel"); return rel === null || rel === "alternate"; });
  return alternativ ? attr(alternativ, "href") : null;
}

function isoEllerNull(raa: string | null): string | null {
  const t = rensTekst(raa);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parser RSS 2.0 (<item>) og Atom (<entry>). Et emne uden titel eller uden https-link kasseres. */
export function parseFeed(xml: string, kilde: string): FeedEmne[] {
  const ud: FeedEmne[] = [];
  const erAtom = /<feed[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml);
  const blokke = erAtom
    ? [...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi)].map((m) => m[0])
    : [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)].map((m) => m[0]);
  for (const blok of blokke) {
    const titel = rensTekst(felt(blok, "title"));
    const link = erAtom ? atomLink(blok) : rensTekst(felt(blok, "link")) || rensTekst(felt(blok, "guid"));
    const url = link ? normaliserUrl(afkodEntiteter(link.trim())) : null;
    if (!titel || !url) continue;
    const resume = rensTekst(erAtom ? (felt(blok, "summary") ?? felt(blok, "content")) : (felt(blok, "description") ?? felt(blok, "content:encoded")));
    const udgivet = erAtom
      ? isoEllerNull(felt(blok, "published")) ?? isoEllerNull(felt(blok, "updated"))
      : isoEllerNull(felt(blok, "pubDate")) ?? isoEllerNull(felt(blok, "dc:date"));
    ud.push({ kilde, titel: titel.slice(0, 300), url, resume: resume.slice(0, RESUME_MAKS), udgivet });
  }
  return ud;
}

/** Dedup-nøglens grundlag: kun https, værtsnavn med små bogstaver, uden fragment og uden utm_*-parametre. null = ikke et link, vi vil vise. */
export function normaliserUrl(raa: string): string | null {
  let u: URL;
  try { u = new URL(raa.trim()); } catch { return null; }
  if (u.protocol === "http:") u.protocol = "https:";
  if (u.protocol !== "https:") return null;
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
  u.hostname = u.hostname.toLowerCase();
  return u.toString();
}

/** Emner inden for vinduet (nu − VINDUE_DAGE … nu + 1 dag), nyeste først, højst MAKS_PR_KILDE pr. kilde. Emner uden dato tælles, ikke tages. */
export function udvaelgIVindue(emner: readonly FeedEmne[], nu: Date): { valgt: FeedEmne[]; uden_dato: number; uden_for_vindue: number } {
  const fra = nu.getTime() - VINDUE_DAGE * 86_400_000;
  const til = nu.getTime() + 86_400_000;
  let udenDato = 0, udenFor = 0;
  const pr: Record<string, FeedEmne[]> = {};
  const set = new Set<string>();
  for (const e of emner) {
    if (!e.udgivet) { udenDato++; continue; }
    const t = new Date(e.udgivet).getTime();
    if (t < fra || t > til) { udenFor++; continue; }
    if (set.has(e.url)) continue;
    set.add(e.url);
    (pr[e.kilde] ??= []).push(e);
  }
  const valgt = Object.values(pr).flatMap((l) => l.sort((a, b) => (b.udgivet ?? "").localeCompare(a.udgivet ?? "")).slice(0, MAKS_PR_KILDE));
  valgt.sort((a, b) => (b.udgivet ?? "").localeCompare(a.udgivet ?? ""));
  return { valgt, uden_dato: udenDato, uden_for_vindue: udenFor };
}

// ── LLM: vurderingen ────────────────────────────────────────────────────────

/** Det, modellen får om ét emne — KUN offentlige feed-felter under et kort id. */
export interface LlmEmne { id: string; kilde: string; titel: string; resume: string; dato: string | null }

export interface Vurdering { id: string; score: number; relevant: boolean; hvem: string; handling: string; begrundelse: string }

export const SYSTEM_VURDERING = [
  "Du er redaktør for The Boardroom — et rådgivningsfællesskab for danske ejerledede små og mellemstore virksomheder (SMV'er).",
  "Du får en liste af nyheder fra offentlige danske kilder. Vurdér hver nyhed: hvor vigtig er den for en dansk SMV-ejer?",
  "Score 0–10: 0 = irrelevant for en SMV-ejer, 5 = nice to know, 8–10 = ejeren bør handle eller forberede sig.",
  "«hvem»: hvilke SMV-ejere rammes (branche, størrelse eller situation) — én kort sætning.",
  "«handling»: hvad skal de gøre eller være opmærksomme på — én kort sætning.",
  "«begrundelse»: hvorfor scoren — én kort sætning.",
  "Brug KUN det, der står i nyhedens titel og uddrag. Opfind aldrig tal, datoer, beløb eller frister. Står det ikke i kilden, så skriv det ikke.",
  "Svar ved at kalde værktøjet vurder_nyheder med præcis én vurdering pr. id.",
].join("\n");

export const VAERKTOEJ_VURDERING = {
  type: "function",
  function: {
    name: "vurder_nyheder",
    description: "Én vurdering pr. nyhed.",
    parameters: {
      type: "object",
      properties: {
        vurderinger: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              score: { type: "integer", minimum: 0, maximum: 10 },
              relevant: { type: "boolean" },
              hvem: { type: "string" },
              handling: { type: "string" },
              begrundelse: { type: "string" },
            },
            required: ["id", "score", "relevant", "hvem", "handling", "begrundelse"],
          },
        },
      },
      required: ["vurderinger"],
    },
  },
} as const;

export function vurderingsBesked(emner: readonly LlmEmne[]): string {
  return JSON.stringify({ nyheder: emner });
}

const erObjekt = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const tekstFelt = (x: unknown, maks: number): string | null => (typeof x === "string" && x.trim().length > 0 && x.trim().length <= maks ? x.trim() : null);

/** Skema-dommen over vurderingssvaret. Ukendte id'er, dubletter og felter uden for grænserne afvises pr. række; resten bruges. */
export function validerVurderinger(raa: unknown, ids: readonly string[]): { vurderinger: Vurdering[]; afvist: number } {
  const kendte = new Set(ids);
  const set = new Set<string>();
  const ud: Vurdering[] = [];
  let afvist = 0;
  const liste = erObjekt(raa) && Array.isArray(raa.vurderinger) ? raa.vurderinger : null;
  if (!liste) return { vurderinger: [], afvist: ids.length };
  for (const r of liste) {
    if (!erObjekt(r)) { afvist++; continue; }
    const id = typeof r.id === "string" ? r.id : null;
    const score = typeof r.score === "number" && Number.isInteger(r.score) && r.score >= 0 && r.score <= 10 ? r.score : null;
    const relevant = typeof r.relevant === "boolean" ? r.relevant : null;
    const hvem = tekstFelt(r.hvem, 300), handling = tekstFelt(r.handling, 300), begrundelse = tekstFelt(r.begrundelse, 300);
    if (!id || !kendte.has(id) || set.has(id) || score === null || relevant === null || !hvem || !handling || !begrundelse) { afvist++; continue; }
    set.add(id);
    ud.push({ id, score, relevant, hvem, handling, begrundelse });
  }
  return { vurderinger: ud, afvist };
}

// ── Udvælgelsen ─────────────────────────────────────────────────────────────

export interface Kandidat {
  emne_id: string;
  kilde: string;
  titel: string;
  url: string;
  resume: string;
  udgivet: string | null;
  score: number;
  relevant: boolean;
  hvem: string;
  handling: string;
  begrundelse: string;
}

/** De bedste MAKS_PUNKTER med relevant ∧ score ≥ MIN_SCORE, højeste score først, nyeste ved lighed. Færre end MIN_PUNKTER = intet udkast. */
export function vaelgTilUdkast(kandidater: readonly Kandidat[]): { valgt: Kandidat[]; nok: boolean } {
  const gode = kandidater.filter((k) => k.relevant && k.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || (b.udgivet ?? "").localeCompare(a.udgivet ?? "") || a.emne_id.localeCompare(b.emne_id))
    .slice(0, MAKS_PUNKTER);
  return { valgt: gode, nok: gode.length >= MIN_PUNKTER };
}

// ── LLM: udkastet ───────────────────────────────────────────────────────────

export const SYSTEM_UDKAST = [
  "Du skriver ugens nyhedsopslag til community i The Boardroom — et rådgivningsfællesskab for danske SMV-ejere. Opslaget udgives af en rådgiver under eget navn, efter at rådgiveren har læst og rettet det.",
  "Husets stemme: kort, konkret, rolig, du-form. Ingen buzzwords, ingen udråbstegn, ingen overdrivelser, intet salg.",
  "Hvert punkt: en overskrift (hvad er nyt), en tekst (hvad siger kilden, 1–3 sætninger) og «betydning» (hvad betyder det for dig som ejer — 1–2 sætninger, konkret handling eller hvad du skal holde øje med).",
  "Brug KUN det, der står i nyhedens titel og uddrag. Skriv aldrig et tal, en dato, et beløb, en procent eller en paragraf, som ikke står ordret i den nyheds eget uddrag eller titel.",
  "Titlen, indledningen og afslutningen må ikke indeholde tal. Skriv aldrig links eller webadresser — linket til kilden sætter vi selv på.",
  "Svar ved at kalde værktøjet skriv_udkast med ét punkt pr. udvalgt nyhed, i den rækkefølge du finder vigtigst.",
].join("\n");

export const VAERKTOEJ_UDKAST = {
  type: "function",
  function: {
    name: "skriv_udkast",
    description: "Ugens nyhedsopslag.",
    parameters: {
      type: "object",
      properties: {
        titel: { type: "string", description: "Opslagets titel, højst 90 tegn, uden tal." },
        indledning: { type: "string", description: "1–2 sætninger, uden tal." },
        punkter: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              overskrift: { type: "string" },
              tekst: { type: "string" },
              betydning: { type: "string" },
            },
            required: ["id", "overskrift", "tekst", "betydning"],
          },
        },
        afslutning: { type: "string", description: "Én sætning, uden tal — fx en opfordring til at skrive i tråden." },
      },
      required: ["titel", "indledning", "punkter", "afslutning"],
    },
  },
} as const;

export interface UdkastPunkt { id: string; overskrift: string; tekst: string; betydning: string }
export interface Udkast { titel: string; indledning: string; punkter: UdkastPunkt[]; afslutning: string }

export const GRAENSER = { titel: 90, indledning: 400, overskrift: 120, tekst: 600, betydning: 400, afslutning: 300 } as const;

/** Tal-tokens: en sammenhængende række af cifre med tegn imellem (13/10, 1.000, 2,5, § 3 → «3», 2026-09-30). */
export function talITekst(s: string): string[] {
  return [...s.matchAll(/\d(?:[\d.,:/-]*\d)?/g)].map((m) => m[0]);
}

const LINK_MOENSTER = /https?:|www\.|<|\]\(/i;

/**
 * Skema-, kilde- og tal-dommen over udkastssvaret. Ét brud = hele udkastet
 * afvist (fejl-listen siger hvilke). `valgte` er emnerne i den rækkefølge, de
 * blev givet modellen, under deres korte id'er.
 */
export function validerUdkast(raa: unknown, valgte: readonly { id: string; titel: string; resume: string }[]): { ok: true; udkast: Udkast } | { ok: false; fejl: string[] } {
  const fejl: string[] = [];
  if (!erObjekt(raa)) return { ok: false, fejl: ["svaret er ikke et objekt"] };
  const titel = tekstFelt(raa.titel, GRAENSER.titel);
  const indledning = tekstFelt(raa.indledning, GRAENSER.indledning);
  const afslutning = tekstFelt(raa.afslutning, GRAENSER.afslutning);
  if (!titel) fejl.push("titel mangler eller er for lang");
  if (!indledning) fejl.push("indledning mangler eller er for lang");
  if (!afslutning) fejl.push("afslutning mangler eller er for lang");
  for (const [navn, v] of [["titel", titel], ["indledning", indledning], ["afslutning", afslutning]] as const) {
    if (v && /\d/.test(v)) fejl.push(`${navn} indeholder tal`);
    if (v && LINK_MOENSTER.test(v)) fejl.push(`${navn} indeholder et link eller en tag`);
  }
  const kilde = new Map(valgte.map((v) => [v.id, `${v.titel} ${v.resume}`]));
  const punkter: UdkastPunkt[] = [];
  const set = new Set<string>();
  const raaPunkter = Array.isArray(raa.punkter) ? raa.punkter : null;
  if (!raaPunkter) fejl.push("punkter mangler");
  for (const [i, p] of (raaPunkter ?? []).entries()) {
    if (!erObjekt(p)) { fejl.push(`punkt ${i + 1} er ikke et objekt`); continue; }
    const id = typeof p.id === "string" ? p.id : "";
    const overskrift = tekstFelt(p.overskrift, GRAENSER.overskrift);
    const tekst = tekstFelt(p.tekst, GRAENSER.tekst);
    const betydning = tekstFelt(p.betydning, GRAENSER.betydning);
    if (!kilde.has(id)) { fejl.push(`punkt ${i + 1}: ukendt id «${id}»`); continue; }
    if (set.has(id)) { fejl.push(`punkt ${i + 1}: id «${id}» to gange`); continue; }
    set.add(id);
    if (!overskrift || !tekst || !betydning) { fejl.push(`punkt ${id}: et felt mangler eller er for langt`); continue; }
    const grundlag = kilde.get(id)!.replace(/\s+/g, "");
    for (const t of talITekst(`${overskrift} ${tekst} ${betydning}`)) {
      if (!grundlag.includes(t)) fejl.push(`punkt ${id}: tallet «${t}» står ikke i kilden`);
    }
    if (LINK_MOENSTER.test(`${overskrift} ${tekst} ${betydning}`)) fejl.push(`punkt ${id}: indeholder et link eller en tag`);
    punkter.push({ id, overskrift, tekst, betydning });
  }
  const maks = Math.min(MAKS_PUNKTER, valgte.length);
  if (raaPunkter && (punkter.length < Math.min(MIN_PUNKTER, valgte.length) || punkter.length > maks)) {
    fejl.push(`antal punkter ${punkter.length} — skal være ${Math.min(MIN_PUNKTER, valgte.length)}–${maks}`);
  }
  if (fejl.length > 0 || !titel || !indledning || !afslutning) return { ok: false, fejl };
  return { ok: true, udkast: { titel, indledning, punkter, afslutning } };
}

// ── Dokumentet (Tiptap, i community-motorens hvidliste) ─────────────────────

type Mark = { type: "bold" } | { type: "link"; attrs: { href: string } };
type TekstNode = { type: "text"; text: string; marks?: Mark[] };
type BlokNode = { type: "paragraph"; content: TekstNode[] } | { type: "heading"; attrs: { level: 2 }; content: TekstNode[] };
export interface TiptapDok { type: "doc"; content: BlokNode[] }

const afsnit = (...content: TekstNode[]): BlokNode => ({ type: "paragraph", content });
const tekst = (text: string, marks?: Mark[]): TekstNode => (marks ? { type: "text", text, marks } : { type: "text", text });

export const BETYDNING_LABEL = "Hvad betyder det for dig? ";
export const KILDE_LABEL = "Kilde: ";

/**
 * Opslaget som Tiptap-dokument — KUN noder og marks, community-motoren
 * (src/lib/hjemmebane/communityDokument.ts: parseCommunityDokument) viser:
 * paragraph, heading (level 2), text med bold og link. Linket er kildens egen
 * URL fra feedet, sat af os — aldrig af modellen.
 */
export function byggDokument(udkast: Udkast, kilder: ReadonlyMap<string, { navn: string; titel: string; url: string }>): TiptapDok {
  const content: BlokNode[] = [afsnit(tekst(udkast.indledning))];
  for (const p of udkast.punkter) {
    const k = kilder.get(p.id);
    if (!k) continue;
    content.push({ type: "heading", attrs: { level: 2 }, content: [tekst(p.overskrift)] });
    content.push(afsnit(tekst(p.tekst)));
    content.push(afsnit(tekst(BETYDNING_LABEL, [{ type: "bold" }]), tekst(p.betydning)));
    content.push(afsnit(tekst(KILDE_LABEL), tekst(`${k.navn}: ${k.titel}`, [{ type: "link", attrs: { href: k.url } }])));
  }
  content.push(afsnit(tekst(udkast.afslutning)));
  return { type: "doc", content };
}

/** Dokumentets tekst i dokumentorden (som community_json_til_tekst) — til «godkendt uændret»-målingen. */
export function dokumentTekst(doc: unknown): string {
  const ud: string[] = [];
  const gaa = (n: unknown) => {
    if (Array.isArray(n)) { n.forEach(gaa); return; }
    if (!erObjekt(n)) return;
    if (typeof n.text === "string") ud.push(n.text);
    if (n.content !== undefined) gaa(n.content);
  };
  gaa(doc);
  return ud.join(" ").replace(/\s+/g, " ").trim();
}

// ── Afgørelsen (rådgiverens klik) ───────────────────────────────────────────

export const STATUSSER = ["kladde", "publiceres", "godkendt", "afvist"] as const;
export type Status = (typeof STATUSSER)[number];
export const HANDLINGER = ["tag", "slip", "publiceret", "afvis"] as const;
export type Handling = (typeof HANDLINGER)[number];
/** En «publiceres», der er ældre end dette, kan frigives af en anden rådgiver (fanen blev lukket midt i publiceringen). */
export const FORAELDET_TAG_MS = 10 * 60_000;

export interface UdkastTilstand { status: Status; afgjort_af: string | null; afgjort_at: string | null }

/**
 * Tilstandsovergangene — ÉT sted, dømt server-side (nyhed-udkast-afgoer):
 *   tag         kladde → publiceres        (rådgiveren tager udkastet, før community-skrivevejen kaldes)
 *   publiceret  publiceres → godkendt      (kun den, der tog det; tråden er oprettet)
 *   slip        publiceres → kladde        (den, der tog det — eller enhver, når taget er forældet)
 *   afvis       kladde → afvist
 * Alt andet er 409. «tag» gør, at to rådgivere ikke kan publicere samme uge to gange.
 */
export function afgoerOvergang(u: UdkastTilstand, handling: Handling, kalder: string, nu: Date): { ok: true; til: Status } | { ok: false; http: 403 | 409; fejl: string } {
  const egen = u.afgjort_af === kalder;
  switch (handling) {
    case "tag":
      return u.status === "kladde" ? { ok: true, til: "publiceres" } : { ok: false, http: 409, fejl: `udkastet er «${u.status}», ikke «kladde»` };
    case "publiceret":
      if (u.status !== "publiceres") return { ok: false, http: 409, fejl: `udkastet er «${u.status}», ikke «publiceres»` };
      return egen ? { ok: true, til: "godkendt" } : { ok: false, http: 403, fejl: "en anden rådgiver er ved at publicere udkastet" };
    case "slip": {
      if (u.status !== "publiceres") return { ok: false, http: 409, fejl: `udkastet er «${u.status}», ikke «publiceres»` };
      const t = u.afgjort_at ? new Date(u.afgjort_at).getTime() : 0;
      return egen || nu.getTime() - t >= FORAELDET_TAG_MS ? { ok: true, til: "kladde" } : { ok: false, http: 403, fejl: "en anden rådgiver er ved at publicere udkastet" };
    }
    case "afvis":
      return u.status === "kladde" ? { ok: true, til: "afvist" } : { ok: false, http: 409, fejl: `udkastet er «${u.status}», ikke «kladde»` };
  }
}
