/**
 * supabase/functions/_shared/metaAnnoncer.ts
 *
 * Spejlet ordret fra src/lib/metaAnnoncer.ts — enhver ændring her SKAL også
 * laves der. Pariteten håndhæves af
 * src/lib/__tests__/metaAnnoncerParitet.test.ts.
 *
 * Filen har nul imports og kan derfor loades af både Vite/Vitest (Node) og
 * Deno uden ændringer. Filhovedet er den ENESTE forskel mellem de to.
 *
 * HVORFOR (recon-meta-annoncer §7.1): 597 tilmeldinger bærer 11 distinkte
 * utm_content og 3 utm_campaign — måling 19/9. Der ER noget at sammenligne,
 * men der findes intet sted at gemme, hvad en annonce kostede. Historik kan
 * ikke hentes bagud: den dag, tabellen findes, begynder den.
 *
 * TRE TING, DER ER LETTE AT TAGE FEJL AF, OG SOM DERFOR BOR HER:
 *
 *   1. PENGE ER HELTAL. Meta sender `spend` som en DECIMALSTRENG i kontoens
 *      valuta («123.45»), ikke som øre og ikke som tal. Huset regner i øre som
 *      heltal overalt (prisniveau_oere, beloeb_oere). oereAf gør det ét sted,
 *      og den afviser alt, den ikke kan læse, frem for at gætte på 0.
 *   2. VALUTAEN FØLGER BELØBET. Et beløb uden valuta er ikke et beløb.
 *      Dagsrækken bærer den, også når den er den samme hver gang.
 *   3. NAVNE HØRER IKKE TIL I DAGSRÆKKEN. En annonce kan omdøbes; står navnet
 *      i hver dagsrække, skifter historikken navn med tilbagevirkende kraft.
 *      Derfor to tabeller: meta_annonce (aktuel beskrivelse) og
 *      meta_annonce_dag (kendsgerningen med en dato).
 *
 * VERSIONEN ER PINNET (CLAUDE.md: ingen `@2`, ingen flydende versioner).
 * v26.0 er nyeste pr. 19/9-2026 (udgivet 29/7-2026); hver version lever ca.
 * 2,3 år. Ændres tallet, ændres det HER og ingen andre steder.
 */

/** Graph API-versionen. Ét sted. */
export const GRAPH_VERSION = "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Hvor mange døgn bagud hver kørsel henter. Metas tal efterjusteres i op til
    28 dage; syv døgn fanger langt det meste, og upsert på (ad_id, dato) gør
    genhentningen gratis. Hæves tallet, hentes der bare mere — intet går i stykker. */
export const DAGE_BAGUD = 7;

/** Loft på sider i ét kald-sæt. 11 annoncer × 7 dage = 77 rækker, og Meta
    sender 25 pr. side som standard — fem sider er rigeligt. Loftet findes for
    at en uventet mængde ikke kan køre i ring. */
export const MAKS_SIDER = 20;

// ── Id'erne ────────────────────────────────────────────────────────────────

/**
 * Ligner strengen et Meta-objekt-id? Moderne id'er er lange cifferstrenge
 * (annoncen 120249061667400694 er 18 cifre). Dommen er BEVIDST løs: den siger
 * «det kan slås op», ikke «det findes». Kun et kald til Meta afgør det sidste,
 * og det er præcis, hvad meta-annonce-opslag gør.
 *
 * Grænsen 9 cifre: gamle Meta-id'er er kortere end nye, og et tilfældigt
 * utm_content som «sommer-kampagne» eller «3» skal falde udenfor.
 */
export function erMetaObjektId(v: string | null | undefined): boolean {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return /^[0-9]{9,25}$/.test(s);
}

/** De distinkte, opslagsbare id'er i en liste — i den rækkefølge de kom, uden dubletter. */
export function opslagbareIder(vaerdier: readonly (string | null | undefined)[]): string[] {
  const set = new Set<string>();
  const ud: string[] = [];
  for (const v of vaerdier) {
    if (!erMetaObjektId(v)) continue;
    const s = (v as string).trim();
    if (set.has(s)) continue;
    set.add(s);
    ud.push(s);
  }
  return ud;
}

// ── Datoerne ───────────────────────────────────────────────────────────────

/** «2026-10-24» af en Date, på UTC-komponenter — samme regning som resten af huset. */
export function isoDato(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dag = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${dag}`;
}

/**
 * Vinduet: DAGE_BAGUD hele døgn bagud, til og med i går. I DAG TAGES IKKE MED
 * — dagens tal er ufærdige, og en halv dag i historikken ser ud som et fald.
 * Kørslen kl. 07 dansk henter altså 12/10–18/10, når den kører den 19.
 */
export function vindue(nu: Date, dageBagud: number = DAGE_BAGUD): { since: string; until: string } {
  const til = new Date(nu.getTime() - 86_400_000);
  const fra = new Date(til.getTime() - (dageBagud - 1) * 86_400_000);
  return { since: isoDato(fra), until: isoDato(til) };
}

// ── Pengene ────────────────────────────────────────────────────────────────

/**
 * Metas beløbsstreng → øre som heltal. «123.45» → 12345. «0» → 0.
 * null når strengen ikke kan læses — ALDRIG 0 ved tvivl: et forbrug på nul og
 * et forbrug vi ikke kunne læse er to forskellige ting, og kun den ene må
 * regnes med.
 *
 * Runder til nærmeste øre (Meta sender højst to decimaler, men vi låser os
 * ikke til det).
 */
export function oereAf(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "" || !/^-?[0-9]+(\.[0-9]+)?$/.test(s)) return null;
  const tal = Number(s);
  return Number.isFinite(tal) ? Math.round(tal * 100) : null;
}

/** Heltal af Metas tælle-felter («1234» eller 1234). null ved tvivl, som oereAf. */
export function heltalAf(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "" || !/^-?[0-9]+(\.[0-9]+)?$/.test(s)) return null;
  const tal = Number(s);
  return Number.isFinite(tal) ? Math.round(tal) : null;
}

/** Decimaltal (frekvens, ctr). null ved tvivl. */
export function kommatalAf(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "" || !/^-?[0-9]+(\.[0-9]+)?$/.test(s)) return null;
  const tal = Number(s);
  return Number.isFinite(tal) ? tal : null;
}

// ── URL'erne ───────────────────────────────────────────────────────────────

function q(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/** Felterne vi læser på ét objekt (annonce ELLER kampagne — Graph svarer med det, der findes). */
export const OPSLAG_FELTER =
  "id,name,effective_status,status,objective,campaign{id,name},adset{id,name},creative{id,title,body,image_url,thumbnail_url,video_id,link_url}";

/** Trin 1: slå ét id op. Tokenet sendes som parameter — aldrig i en log. */
export function opslagUrl(id: string, token: string): string {
  return `${GRAPH}/${encodeURIComponent(id)}?${q({ fields: OPSLAG_FELTER, access_token: token })}`;
}

/** Annoncerne på kontoen, med annoncesæt, kampagne og kreativ. */
export const ANNONCE_FELTER =
  "id,name,status,effective_status,updated_time,adset{id,name},campaign{id,name},creative{id,title,body,image_url,thumbnail_url,video_id,link_url}";

export function annoncerUrl(kontoId: string, token: string, limit = 100): string {
  return `${GRAPH}/${encodeURIComponent(kontoId)}/ads?${q({ fields: ANNONCE_FELTER, limit: String(limit), access_token: token })}`;
}

/** Insights-felterne — tallene, der bliver til en dagsrække. */
export const INSIGHTS_FELTER =
  "ad_id,adset_id,campaign_id,spend,impressions,clicks,inline_link_clicks,reach,frequency,date_start,date_stop";

/**
 * Insights pr. annonce pr. DAG: `level=ad` + `time_increment=1`.
 *
 * UBEVIST (recon §5): at time_increment=1 giver præcis én række pr. dag pr.
 * annonce står ikke ordret i den side, der kunne hentes 19/9. Cronen
 * efterprøver det selv — se doemDagsraekker: to rækker for samme (annonce,
 * dato) er en advarsel, ikke en tavs overskrivning.
 */
export function insightsUrl(kontoId: string, token: string, v: { since: string; until: string }, limit = 500): string {
  return `${GRAPH}/${encodeURIComponent(kontoId)}/insights?${q({
    level: "ad",
    fields: INSIGHTS_FELTER,
    time_increment: "1",
    time_range: JSON.stringify({ since: v.since, until: v.until }),
    limit: String(limit),
    access_token: token,
  })}`;
}

/** Kontoen — valutaen og spærren (spend_cap). Læses hver kørsel, så valutaen aldrig gættes. */
export function kontoUrl(kontoId: string, token: string): string {
  return `${GRAPH}/${encodeURIComponent(kontoId)}?${q({
    fields: "id,account_id,name,currency,spend_cap,amount_spent,account_status",
    access_token: token,
  })}`;
}

/** Tokenet må ALDRIG stå i en log. Bruges på hver URL, der logges. */
export function udenToken(url: string): string {
  return url.replace(/access_token=[^&]*/g, "access_token=…");
}

// ── Oversættelsen ──────────────────────────────────────────────────────────

/** Rækken i meta_annonce_dag — kendsgerningen med en dato. */
export interface Dagsraekke {
  ad_id: string;
  adset_id: string | null;
  campaign_id: string | null;
  dato: string;
  valuta: string;
  forbrug_oere: number;
  visninger: number | null;
  klik: number | null;
  link_klik: number | null;
  raekkevidde: number | null;
  frekvens: number | null;
}

/** Rækken i meta_annonce — den aktuelle beskrivelse. */
export interface Annoncekort {
  ad_id: string;
  adset_id: string | null;
  campaign_id: string | null;
  navn: string | null;
  adsaet_navn: string | null;
  kampagne_navn: string | null;
  status: string | null;
  effective_status: string | null;
  overskrift: string | null;
  brodtekst: string | null;
  billede_url: string | null;
  video_id: string | null;
  link_url: string | null;
}

const tekst = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
};

/**
 * Metas insights-rækker → vores dagsrækker.
 *
 * EN RÆKKE UDEN LÆSBART FORBRUG SPRINGES OVER, ikke sættes til 0: en dagsrække
 * er et regnskabstal, og et gæt i den er værre end et hul. Grunden bæres med
 * ud, så kørslen kan sige det i sit svar.
 */
export function tilDagsraekker(
  raa: readonly Record<string, unknown>[],
  valuta: string,
): { raekker: Dagsraekke[]; sprunget: { ad_id: string | null; dato: string | null; grund: string }[] } {
  const raekker: Dagsraekke[] = [];
  const sprunget: { ad_id: string | null; dato: string | null; grund: string }[] = [];
  for (const r of raa) {
    const ad_id = tekst(r.ad_id);
    const dato = tekst(r.date_start);
    if (!ad_id) { sprunget.push({ ad_id: null, dato, grund: "ad_id mangler" }); continue; }
    if (!dato) { sprunget.push({ ad_id, dato: null, grund: "date_start mangler" }); continue; }
    const forbrug = oereAf(r.spend);
    if (forbrug === null) { sprunget.push({ ad_id, dato, grund: `spend kunne ikke læses (${JSON.stringify(r.spend)})` }); continue; }
    raekker.push({
      ad_id,
      adset_id: tekst(r.adset_id),
      campaign_id: tekst(r.campaign_id),
      dato,
      valuta,
      forbrug_oere: forbrug,
      visninger: heltalAf(r.impressions),
      klik: heltalAf(r.clicks),
      link_klik: heltalAf(r.inline_link_clicks),
      raekkevidde: heltalAf(r.reach),
      frekvens: kommatalAf(r.frequency),
    });
  }
  return { raekker, sprunget };
}

/**
 * To rækker for samme (annonce, dato) må ikke overskrive hinanden i tavshed —
 * det ville betyde, at time_increment=1 IKKE gav én række pr. dag, og at
 * halvdelen af forbruget forsvandt i en upsert. Dommen finder dubletterne, så
 * kørslen kan råbe op.
 */
export function dubletter(raekker: readonly Dagsraekke[]): string[] {
  const set = new Set<string>();
  const dub = new Set<string>();
  for (const r of raekker) {
    const n = `${r.ad_id}|${r.dato}`;
    if (set.has(n)) dub.add(n);
    set.add(n);
  }
  return [...dub];
}

/** Metas ad-objekter → annoncekort. En annonce uden id springes over. */
export function tilAnnoncekort(raa: readonly Record<string, unknown>[]): Annoncekort[] {
  const ud: Annoncekort[] = [];
  for (const a of raa) {
    const ad_id = tekst(a.id);
    if (!ad_id) continue;
    const adsaet = (a.adset ?? null) as Record<string, unknown> | null;
    const kampagne = (a.campaign ?? null) as Record<string, unknown> | null;
    const kreativ = (a.creative ?? null) as Record<string, unknown> | null;
    ud.push({
      ad_id,
      adset_id: tekst(adsaet?.id),
      campaign_id: tekst(kampagne?.id),
      navn: tekst(a.name),
      adsaet_navn: tekst(adsaet?.name),
      kampagne_navn: tekst(kampagne?.name),
      status: tekst(a.status),
      effective_status: tekst(a.effective_status),
      overskrift: tekst(kreativ?.title),
      brodtekst: tekst(kreativ?.body),
      billede_url: tekst(kreativ?.image_url) ?? tekst(kreativ?.thumbnail_url),
      video_id: tekst(kreativ?.video_id),
      link_url: tekst(kreativ?.link_url),
    });
  }
  return ud;
}

// ── Trin 1: koblingen ──────────────────────────────────────────────────────

export type Koblingsudfald = "fundet" | "ikke_fundet" | "ikke_et_id" | "fejl";

export interface Koblingslinje {
  vaerdi: string;
  felt: "utm_content" | "utm_campaign";
  udfald: Koblingsudfald;
  /** Metas navn, når den svarede. */
  navn: string | null;
  /** «ad» eller «campaign», udledt af hvad Graph svarede med. */
  slags: string | null;
  tilmeldinger: number;
  besked: string | null;
}

/**
 * Hvad Graph svarede med — er det en annonce eller en kampagne? Graph siger
 * det ikke direkte på et id-opslag, men objekterne røber sig: en annonce har
 * et `creative` eller et `adset`; en kampagne har et `objective`.
 */
export function slagsAf(svar: Record<string, unknown>): string | null {
  if (svar.creative || svar.adset) return "ad";
  if (svar.objective) return "campaign";
  return null;
}

/**
 * Dommen over hele koblingen: er vores utm_content Metas ad_id?
 *
 * BEVIST = mindst én utm_content blev fundet hos Meta OG svarede som en
 * annonce. Ét fund er nok til at vise, at feltet ER id'et; resten af
 * linjerne siger, hvor komplet dækningen er.
 */
export interface Koblingsdom {
  bevist: boolean;
  /** Hvor mange af de opslagbare utm_content der blev fundet som annoncer. */
  annoncer_fundet: number;
  annoncer_i_alt: number;
  kampagner_fundet: number;
  kampagner_i_alt: number;
  /** Tilmeldinger dækket af en utm_content, vi kunne slå op. */
  tilmeldinger_daekket: number;
  tilmeldinger_i_alt: number;
  konklusion: string;
}

export function doemKobling(linjer: readonly Koblingslinje[], tilmeldingerIAlt: number): Koblingsdom {
  const annoncer = linjer.filter((l) => l.felt === "utm_content");
  const kampagner = linjer.filter((l) => l.felt === "utm_campaign");
  const annoncerFundet = annoncer.filter((l) => l.udfald === "fundet" && l.slags === "ad");
  const kampagnerFundet = kampagner.filter((l) => l.udfald === "fundet" && l.slags === "campaign");
  const daekket = annoncerFundet.reduce((sum, l) => sum + l.tilmeldinger, 0);
  // Tre udfald, og de må ikke blandes sammen: at INGEN værdi ligner et id
  // (makroerne er ikke sat) er en helt anden sag end at id'erne findes, men
  // ikke kan slås op (forkert konto eller manglende adgang). Det første er
  // vores egen opsætning; det andet er tokenets.
  const annoncerSlaaetOp = annoncer.filter((l) => l.udfald !== "ikke_et_id");
  const bevist = annoncerFundet.length > 0;
  const konklusion = bevist
    ? `BEVIST: utm_content er Metas ad_id. ${annoncerFundet.length} af ${annoncerSlaaetOp.length} annonce-id'er svarede hos Meta og dækker ${daekket} af ${tilmeldingerIAlt} tilmeldinger.`
    : annoncerSlaaetOp.length === 0
      ? "IKKE AFGJORT: ingen af vores utm_content ligner et Meta-id — makroerne er formentlig ikke sat på annoncerne."
      : "IKKE BEVIST: ingen af vores utm_content kunne slås op hos Meta. Enten hører de til en anden annoncekonto, eller tokenet mangler adgang til denne.";
  return {
    bevist,
    annoncer_fundet: annoncerFundet.length,
    annoncer_i_alt: annoncer.length,
    kampagner_fundet: kampagnerFundet.length,
    kampagner_i_alt: kampagner.length,
    tilmeldinger_daekket: daekket,
    tilmeldinger_i_alt: tilmeldingerIAlt,
    konklusion,
  };
}
