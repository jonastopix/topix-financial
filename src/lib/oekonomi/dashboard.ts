/**
 * src/lib/oekonomi/dashboard.ts — dommen bag /oekonomi (Ø3, 18/9-2026).
 *
 * JONAS 17/9 (ordret): «Jeg vil gerne vi får et super fedt dashboard direkte
 * på platformen, så vi har det fulde overblik over vores forretning. … Vi
 * elsker tal og data. Så tænk ud af boksen.» og «Prisen er det, der faktisk
 * er faktureret. Grundprisen er det, fornyelsen regner fra.»
 *
 * REN dom oven på omsaetning.ts (periodiseringen, MRR, broen) og
 * overblik.ts (RPC-svaret). Ingen React, ingen Supabase. Alt i øre ekskl.
 * moms. Fladen (OekonomiView) viser; intet regnes dér. Testet i
 * __tests__/dashboard.test.ts — også mod Ø1's facit og betalinger
 * (fixtures/), hvor september 2026 giver 85.283 anerkendt og MRR 83.882.
 *
 * DE SYV DELE:
 *   1. NØGLETAL (indeværende måned, dansk tid): MRR og ARR den sidste dag i
 *      måneden, anerkendt omsætning, kontant indgået, kontraheret de NÆSTE
 *      12 måneder (måned +1 … +12 — kun det der er kontrakt på; forventet
 *      fornyelse kommer senere), forudbetalt ikke tjent, udestående.
 *   2. KURVEN: fra maj 2025 (KURVE_FRA) til 12 måneder frem. HOVEDLINJEN er
 *      MRR ULTIMO — FUNDET i Ø1b-beviset (17/9): Mondays «Periodiseret
 *      omsætning» ER MRR ved månedens udgang (maj 2025 41.674 mod 41,7 t;
 *      aug. 2025 58.841 mod 58,9 t; sep. 2026 87.216 mod 87,8 t — og
 *      medlemstallene identiske). Det er tallet Jonas kender fra Monday, så
 *      det bærer kurven; anerkendt (dagsproportionalt) tegnes som anden,
 *      tyndere linje; efter i dag er begge kontraheret og stiples; kontant
 *      pr. måned som søjler bag; antal betalende ultimo under aksen.
 *      Koordinaterne regnes her (kurveKoordinater), så SVG'en er ren afbildning.
 *   3. BROEN de seneste 12 måneder: start → + ny → + fornyet op → − fornyet
 *      ned → − tabt → slut, med virksomhedernes navne bag hvert tal
 *      (omsaetning.mrrBroPoster + navneopslag).
 *   4. RADAREN: kontraktår der slutter inden for 90 dage — navn, slutdato,
 *      dage, pris, grundpris, beslutning fra company_fornyelse (RPC-nøglen
 *      'fornyelser'; mangler den, er beslutningen «ukendt»), og om et nyt
 *      kontraktår allerede er skrevet («fornyet»). «Omsætning i spil» = Σ
 *      pris på de kontraktår der udløber uden et nyt. KUN AKTIVE KUNDER
 *      (Ø3b, 17/9 17:27 — Jonas' skærmbillede): Pro-Vision ApS (21/9,
 *      42.000) og E-skilte ApS (29/10, 40.000) stod i radaren og i «i spil»
 *      (208.000 i stedet for 126.000), men er companies.status «tidligere»
 *      (Ø1b, historik 2025) — de skal ikke fornyes. Radaren læser derfor
 *      kun kontraktår for virksomheder med status 'active' OG er_kunde
 *      (erAktivKunde). MRR, broen og kurven rører det IKKE: de betalte til
 *      deres slutdato og tæller som i Monday.
 *   5. PRISUDVIKLING: virksomheder med to kontraktår — år 1 → år 2 for
 *      grundpris og pris, og samlet.
 *   6. KUNDEVÆRDI (Ø3b — Jonas 17/9 ordret: «De fem største er ikke
 *      relevante som de står nu»; fem kunder på 4.375 · 5 %, fordi alle med
 *      52.500 i rater har samme MRR): de KUNDEVAERDI_ANTAL (10) største
 *      kunder efter SAMLET betalt ekskl. moms siden første betaling
 *      (company_traek status betalt, beloeb − moms), med andel af den
 *      samlede betalte omsætning, antal kontraktår og status
 *      (aktiv/tidligere). Under: «De 10 største har betalt N % af alt siden
 *      {første betalingsmåned}». Koncentrationen efter MRR er fjernet.
 *   7. UDESTÅENDE (Ø3b — Jonas 17/9 ordret: «Jeg forstår ikke udestående.
 *      Det burde vi ikke have udover YKRG.»): FORFALDNE betalinger der ikke
 *      er betalt i dag (dansk tid) — forfaldentFor. Før (17:27: «Udestående
 *      −9.200» med YKRG −4.667 · Homie −1.694 · Fjeldgaardshop −1.581 · KJ
 *      AUTO −508 · Two Socks −375 · WESDEX −339 · Livja −38) var det
 *      «betalt til dato − anerkendt til MÅNEDENS UDGANG» (udestaaendeFor,
 *      og MaanedsTal.udestaaende_oere i omsaetning.ts:411-416): for
 *      månedlige rater med fast trækdato (Fjeldgaardshop den 18.) er det
 *      TIMING, ikke gæld — hele september var anerkendt den 17., raten
 *      trækkes den 18. Forfald pr. betalingsmodel: rate12/maanedlig hver
 *      rate på kontraktårets trækdato (periode_start + N måneder, dagen
 *      klippes til månedens længde); fuld/e-conomic/gratis hele prisen ved
 *      periode_start (fakturaens dato er ikke i data — company_traek bærer
 *      kun betalte/fejlede træk); rate2 halvdelen ved start, halvdelen
 *      RATE2_ANDEN_RATE_MAANEDER (6) måneder senere (Nordic By Hand: rate 2
 *      forfalder 1/11 — datoen findes ikke i data; 6 måneder er valget, og
 *      raten står først som forfalden når den er passeret). PAUSER: et
 *      rate12-kontraktår der spænder over MERE end 12 måneder (Livja:
 *      16/9-2025 → 16/12-2026, «0005–0007 jan–mar 2026 mangler i Stripe»)
 *      bærer sine tolv rater over kontraktens måneder — de ekstra måneder er
 *      pauser, ikke gæld (kontrakten blev forlænget i stedet). Udestående
 *      pr. virksomhed = Σ forfaldent − Σ betalt (status betalt, betalt_at ≤
 *      i dag), kun hvor positivt. Målt mod kopien 16/9 pr. 17/9: KUN YKRG
 *      (5 rater forfaldne à 4.375, 4 betalt → 4.375 — juni-raten); alle
 *      andre 0,00 på kronen. Fejlede træk står i egen kolonne som før.
 *      MaanedsTal.forudbetalt_oere har IKKE samme fejl spejlvendt:
 *      anerkendt regnes til månedens UDGANG, så en rate betalt den 1. for
 *      måneden ligger hele måneden med diff 0 (ikke forudbetalt), og en fuld
 *      pris forud er forudbetalt præcis som før. Forudbetalt er uændret.
 *      Nøgletallet «Udestående» (Noegletal.udestaaende_oere) sættes af
 *      dashboardDom til den nye sum, så kortet og sektionen siger det samme;
 *      motoren (omsaetning.ts) er urørt.
 *   AKSEN (Ø3b — «augsep» yderst til højre): etiketterne står hver 3. måned
 *      + den sidste (akseIndeks). Er den sidste mindre end AKSE_MIN_AFSTAND
 *      (6 % af bredden ≈ 1,7 måned ved 29 punkter) fra den forrige, udelades
 *      den forrige — den sidste vinder, for den siger hvor kurven ender.
 */
import {
  danskMaaned,
  kr,
  laengdeIMaaneder,
  laesDato,
  mrrBroPoster,
  periodiser,
  type BroSlags,
  type Kontrakt,
  type MaanedsTal,
} from "@/lib/oekonomi/omsaetning";
import { betalingerTilMotor, type Overblik, type OverblikBetaling, type OverblikVirksomhed } from "@/lib/oekonomi/overblik";

export const RADAR_DAGE = 90;
/** Ø3b: kundeværdien — de N største efter samlet betalt. */
export const KUNDEVAERDI_ANTAL = 10;
/** Ø3b: aksens mindste afstand mellem to etiketter, i andel af bredden. */
export const AKSE_MIN_AFSTAND = 0.06;
/** Ø3b: rate 2 forfalder så mange måneder efter kontraktstart (fakturadatoen er ikke i data). */
export const RATE2_ANDEN_RATE_MAANEDER = 6;
export const UDESTAAENDE_LINJE = "forfaldne betalinger der ikke er kommet";
export const KURVE_MAANEDER_FREM = 12;
/** Kurven begynder her — Ø1b (kørt 17/9) lagde historikken fra maj 2025 ind (Monday starter maj 2025; KJ AUTOs marts–april 2025 tæller i tallene, men tegnes ikke). */
export const KURVE_FRA = "2025-05";
export const BRO_MAANEDER = 12;

/** Teksterne fladen viser (låst her, så ordene er dommens). */
export const OEKONOMI_EYEBROW = "Partnere";
export const OEKONOMI_TITEL = "Økonomi";
export const OEKONOMI_MOMS_LINJE = "Alle beløb i kr. ekskl. moms.";
export const OEKONOMI_TOM_TEKST = "Ingen kontrakter endnu — når backfillen er kørt, står tallene her.";
export const OEKONOMI_FEJL_TEKST = "Økonomioverblikket kunne ikke hentes. Prøv igen.";
export const FORVENTET_FORNYELSE_KOMMER = "Forventet fornyelse (kommer): kun det der er kontrakt på, tæller her.";
export const RADAR_UKENDT_TEKST = "beslutning ukendt — RPC-udvidelsen (20260918150000) er ikke kørt";

export interface Noegletal {
  key: string;
  mrr_oere: number;
  arr_oere: number;
  anerkendt_oere: number;
  kontant_oere: number;
  kontraheret_12_oere: number;
  forudbetalt_oere: number;
  udestaaende_oere: number;
  aktive: number;
  gratis_aktive: number;
}

export interface KurvePunkt {
  key: string;
  anerkendt_oere: number;
  /** MRR ved månedens udgang — Mondays «periodiseret omsætning». */
  mrr_oere: number;
  /** Betalende kontrakter aktive ved månedens udgang. */
  betalende: number;
  kontant_oere: number;
  /** Efter indeværende måned: kontraheret, tegnes stiplet. */
  frem: boolean;
}

export interface BroPostMedNavn {
  slags: BroSlags;
  company_id: string;
  navn: string;
  oere: number;
}

export interface BroMaaned {
  key: string;
  start_oere: number;
  slut_oere: number;
  ny_oere: number;
  fornyet_op_oere: number;
  fornyet_ned_oere: number;
  tabt_oere: number;
  poster: BroPostMedNavn[];
}

export type RadarBeslutning = "tilbyd" | "tilbyd_ikke" | "fornyet" | "ingen" | "ukendt";

export interface RadarRaekke {
  kontrakt_id: string;
  company_id: string;
  navn: string;
  periode_slut: string;
  dage: number;
  pris_oere: number;
  grundpris_oere: number | null;
  beslutning: RadarBeslutning;
  note: string | null;
}

export interface Radar {
  raekker: RadarRaekke[];
  /** Σ pris på kontraktår der udløber inden for vinduet UDEN et nyt kontraktår. */
  i_spil_oere: number;
  ukendt: boolean;
}

export interface PrisRaekke {
  company_id: string;
  navn: string;
  aar1: { periode_start: string; periode_slut: string; grundpris_oere: number | null; pris_oere: number };
  aar2: { periode_start: string; periode_slut: string; grundpris_oere: number | null; pris_oere: number };
  delta_pris_oere: number;
  delta_grundpris_oere: number | null;
}

export interface Prisudvikling {
  raekker: PrisRaekke[];
  samlet: { grundpris_aar1: number; grundpris_aar2: number; pris_aar1: number; pris_aar2: number };
}

/** Ø3b: én kunde i kundeværdien — samlet betalt ekskl. moms siden første betaling. */
export interface KundevaerdiRaekke {
  company_id: string;
  navn: string;
  betalt_oere: number;
  /** Andel af den samlede betalte omsætning (alle kunder). */
  andel: number;
  /** Antal kontraktår i public.kontrakter. */
  kontraktaar: number;
  status: "aktiv" | "tidligere";
}

export interface Kundevaerdi {
  top: KundevaerdiRaekke[];
  top_andel: number;
  betalt_i_alt_oere: number;
  /** Antal kunder med mindst én betaling. */
  kunder: number;
  /** Første betalingsmåned «YYYY-MM»; null uden betalinger. */
  siden: string | null;
}

/** Ø3b: én virksomhed med forfaldne betalinger der ikke er kommet. */
export interface UdestaaendeRaekke {
  company_id: string;
  navn: string;
  /** Σ forfaldent til og med i dag (forfaldentFor). */
  forfaldent_oere: number;
  /** Σ betalt (status betalt, betalt_at ≤ i dag). */
  betalt_oere: number;
  /** forfaldent − betalt, altid > 0 her. */
  udestaaende_oere: number;
}

export interface FejletTraek {
  company_id: string;
  navn: string;
  faktura_nummer: string | null;
  kilde: string | null;
  beloeb_eks_moms_oere: number;
}

export interface Udestaaende {
  raekker: UdestaaendeRaekke[];
  /** Σ udestaaende_oere — positivt. */
  i_alt_oere: number;
  fejlede: FejletTraek[];
  fejlede_i_alt_oere: number;
}

export type DashboardDom =
  | { tom: true; tekst: string }
  | {
      tom: false;
      nuKey: string;
      noegletal: Noegletal;
      kurve: KurvePunkt[];
      bro: BroMaaned[];
      radar: Radar;
      prisudvikling: Prisudvikling;
      kundevaerdi: Kundevaerdi;
      udestaaende: Udestaaende;
      maaneder: MaanedsTal[];
    };

// ── Kalenderhjælpere ──

export function laegMaanederTil(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  const ny = Math.floor(i / 12);
  const nm = (i % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function dagTilMs(dag: string): number {
  const [y, m, d] = laesDato(dag);
  return Date.UTC(y, m - 1, d);
}

/** Dansk kalenderdag for et tidspunkt: «YYYY-MM-DD». */
export function danskDag(nu: Date): string {
  const dele = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(nu);
  const f = (t: string) => dele.find((p) => p.type === t)?.value ?? "";
  return `${f("year")}-${f("month")}-${f("day")}`;
}

function navneOpslag(overblik: Overblik): (companyId: string) => string {
  const m = new Map(overblik.virksomheder.map((v) => [v.id, v.name]));
  return (id) => m.get(id) || `virksomhed ${id.slice(0, 8)}`;
}

// ── Delene ──

export function noegletalFor(maaneder: readonly MaanedsTal[], nuKey: string): Noegletal {
  const m = maaneder.find((x) => x.key === nuKey);
  const frem = new Set(Array.from({ length: KURVE_MAANEDER_FREM }, (_, i) => laegMaanederTil(nuKey, i + 1)));
  const kontraheret12 = maaneder.filter((x) => frem.has(x.key)).reduce((s, x) => s + x.anerkendt_oere, 0);
  return {
    key: nuKey,
    mrr_oere: m?.mrr_oere ?? 0,
    arr_oere: m?.arr_oere ?? 0,
    anerkendt_oere: m?.anerkendt_oere ?? 0,
    kontant_oere: m?.kontant_oere ?? 0,
    kontraheret_12_oere: kontraheret12,
    forudbetalt_oere: m?.forudbetalt_oere ?? 0,
    udestaaende_oere: m?.udestaaende_oere ?? 0,
    aktive: m?.aktive ?? 0,
    gratis_aktive: m?.gratis_aktive ?? 0,
  };
}

export function kurveFor(maaneder: readonly MaanedsTal[], nuKey: string): KurvePunkt[] {
  return maaneder
    .filter((m) => m.key >= KURVE_FRA)
    .map((m) => ({ key: m.key, anerkendt_oere: m.anerkendt_oere, mrr_oere: m.mrr_oere, betalende: m.aktive, kontant_oere: m.kontant_oere, frem: m.key > nuKey }));
}

export interface KurveKoordinater {
  /** MRR ultimo (hovedlinjen): til og med i dag, og kontraheret fra i dag og frem (deler dagens punkt). y: 0 øverst. */
  mrr: { x: number; y: number }[];
  mrr_kontraheret: { x: number; y: number }[];
  /** Anerkendt pr. måned (anden linje): tjent til og med i dag, kontraheret derefter. */
  tjent: { x: number; y: number }[];
  kontraheret: { x: number; y: number }[];
  soejler: { x: number; bredde: number; hoejde: number }[];
  max_oere: number;
  /** Hver 3. måned + den sidste — til aksen, med antal betalende ultimo. */
  akse: { x: number; label: string; betalende: number }[];
}

/** Koordinater i [0,1]² for kurven — tegningen (SVG) er ren afbildning af dem. */
export function kurveKoordinater(kurve: readonly KurvePunkt[]): KurveKoordinater {
  const n = kurve.length;
  if (n === 0) return { mrr: [], mrr_kontraheret: [], tjent: [], kontraheret: [], soejler: [], max_oere: 0, akse: [] };
  const max = Math.max(1, ...kurve.map((p) => Math.max(p.anerkendt_oere, p.mrr_oere, p.kontant_oere)));
  const x = (i: number) => (n === 1 ? 0.5 : i / (n - 1));
  const y = (v: number) => 1 - v / max;
  const mrr: { x: number; y: number }[] = [];
  const mrrKontraheret: { x: number; y: number }[] = [];
  const tjent: { x: number; y: number }[] = [];
  const kontraheret: { x: number; y: number }[] = [];
  kurve.forEach((p, i) => {
    const deler = p.frem || (i + 1 < n && kurve[i + 1].frem);
    const pt = { x: x(i), y: y(p.anerkendt_oere) };
    const pm = { x: x(i), y: y(p.mrr_oere) };
    if (!p.frem) { tjent.push(pt); mrr.push(pm); }
    if (deler) { kontraheret.push(pt); mrrKontraheret.push(pm); }
  });
  const bredde = n === 1 ? 0.5 : (1 / (n - 1)) * 0.6;
  const soejler = kurve.map((p, i) => ({ x: x(i) - bredde / 2, bredde, hoejde: p.kontant_oere / max }));
  const akse = akseIndeks(n).map((i) => ({ x: x(i), label: maanedsLabel(kurve[i].key), betalende: kurve[i].betalende }));
  return { mrr, mrr_kontraheret: mrrKontraheret, tjent, kontraheret, soejler, max_oere: max, akse };
}

/** Ø3b: indeks for aksens etiketter — hver 3. måned + den sidste; en etiket
    der ligger under minAfstand (andel af bredden) fra den SIDSTE udelades,
    så «aug»/«sep» aldrig kolliderer yderst til højre. Ren, testet. */
export function akseIndeks(n: number, minAfstand: number = AKSE_MIN_AFSTAND): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  const x = (i: number) => i / (n - 1);
  const sidste = n - 1;
  const ud: number[] = [];
  for (let i = 0; i < n; i += 3) {
    if (i === sidste) continue;
    if (x(sidste) - x(i) < minAfstand) continue;
    ud.push(i);
  }
  ud.push(sidste);
  return ud;
}

const MAANEDER_KORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** «sep 26» for «2026-09». */
export function maanedsLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MAANEDER_KORT[m - 1]} ${String(y).slice(2)}`;
}

export function broFor(overblik: Overblik, maaneder: readonly MaanedsTal[], nuKey: string): BroMaaned[] {
  const navn = navneOpslag(overblik);
  const mrrAf = (key: string) => maaneder.find((m) => m.key === key)?.mrr_oere ?? 0;
  const keys = Array.from({ length: BRO_MAANEDER }, (_, i) => laegMaanederTil(nuKey, i - (BRO_MAANEDER - 1)));
  return keys.map((key) => {
    const forrige = laegMaanederTil(key, -1);
    const poster = mrrBroPoster(overblik.kontrakter, key, forrige)
      .map((p) => ({ ...p, navn: navn(p.company_id) }))
      .sort((a, b) => Math.abs(b.oere) - Math.abs(a.oere));
    const sum = (slags: BroSlags) => poster.filter((p) => p.slags === slags).reduce((s, p) => s + p.oere, 0);
    return {
      key,
      start_oere: mrrAf(forrige),
      slut_oere: mrrAf(key),
      ny_oere: sum("ny"),
      fornyet_op_oere: sum("fornyet_op") + sum("fornyet_uaendret"),
      fornyet_ned_oere: sum("fornyet_ned"),
      tabt_oere: sum("tabt"),
      poster,
    };
  });
}

/** Ø3b: en aktiv kunde — status 'active' OG er_kunde. Tidligere kunder (Ø1b-historik) skal ikke fornyes. */
export function erAktivKunde(v: Pick<OverblikVirksomhed, "status" | "er_kunde">): boolean {
  return v.status === "active" && v.er_kunde === true;
}

export function radarFor(overblik: Overblik, nuDag: string): Radar {
  const navn = navneOpslag(overblik);
  const nuMs = dagTilMs(nuDag);
  const graenseMs = nuMs + RADAR_DAGE * 86_400_000;
  const ukendt = overblik.fornyelser === undefined;
  // Ø3b: kun kontraktår for aktive kunder (Pro-Vision, E-skilte er «tidligere» — ude af radaren og af «i spil»).
  const aktive = new Set(overblik.virksomheder.filter(erAktivKunde).map((v) => v.id));
  const beslutningAf = (companyId: string): { beslutning: RadarBeslutning; note: string | null } => {
    if (ukendt) return { beslutning: "ukendt", note: null };
    const f = (overblik.fornyelser ?? [])
      .filter((x) => x.company_id === companyId)
      .sort((a, b) => ((a.besluttet_at ?? "") < (b.besluttet_at ?? "") ? 1 : -1))[0];
    if (!f) return { beslutning: "ingen", note: null };
    return { beslutning: f.beslutning === "tilbyd_ikke" ? "tilbyd_ikke" : "tilbyd", note: f.note };
  };
  const raekker: RadarRaekke[] = overblik.kontrakter
    .filter((k) => {
      if (!aktive.has(k.company_id)) return false;
      const slut = dagTilMs(k.periode_slut);
      return slut > nuMs && slut <= graenseMs;
    })
    .map((k) => {
      const harNyt = overblik.kontrakter.some((o) => o !== k && o.company_id === k.company_id && dagTilMs(o.periode_start) >= dagTilMs(k.periode_slut) - 30 * 86_400_000 && dagTilMs(o.periode_slut) > dagTilMs(k.periode_slut));
      const b = harNyt ? { beslutning: "fornyet" as RadarBeslutning, note: null } : beslutningAf(k.company_id);
      return {
        kontrakt_id: k.id,
        company_id: k.company_id,
        navn: navn(k.company_id),
        periode_slut: k.periode_slut,
        dage: Math.round((dagTilMs(k.periode_slut) - nuMs) / 86_400_000),
        pris_oere: k.pris_eks_moms_oere,
        grundpris_oere: k.grundpris_oere ?? null,
        beslutning: b.beslutning,
        note: b.note,
      };
    })
    .sort((a, b) => a.dage - b.dage || a.navn.localeCompare(b.navn, "da"));
  const iSpil = raekker.filter((r) => r.beslutning !== "fornyet").reduce((s, r) => s + r.pris_oere, 0);
  return { raekker, i_spil_oere: iSpil, ukendt };
}

export function prisudviklingFor(overblik: Overblik): Prisudvikling {
  const navn = navneOpslag(overblik);
  const prVirksomhed = new Map<string, Kontrakt[]>();
  for (const k of overblik.kontrakter) {
    const l = prVirksomhed.get(k.company_id) ?? [];
    l.push(k);
    prVirksomhed.set(k.company_id, l);
  }
  const raekker: PrisRaekke[] = [];
  for (const [companyId, ks] of prVirksomhed) {
    if (ks.length < 2) continue;
    const s = [...ks].sort((a, b) => (a.periode_start < b.periode_start ? -1 : 1));
    const a1 = s[0];
    const a2 = s[1];
    const g1 = a1.grundpris_oere ?? null;
    const g2 = a2.grundpris_oere ?? null;
    raekker.push({
      company_id: companyId,
      navn: navn(companyId),
      aar1: { periode_start: a1.periode_start, periode_slut: a1.periode_slut, grundpris_oere: g1, pris_oere: a1.pris_eks_moms_oere },
      aar2: { periode_start: a2.periode_start, periode_slut: a2.periode_slut, grundpris_oere: g2, pris_oere: a2.pris_eks_moms_oere },
      delta_pris_oere: a2.pris_eks_moms_oere - a1.pris_eks_moms_oere,
      delta_grundpris_oere: g1 != null && g2 != null ? g2 - g1 : null,
    });
  }
  raekker.sort((a, b) => a.navn.localeCompare(b.navn, "da"));
  const samlet = raekker.reduce(
    (s, r) => ({
      grundpris_aar1: s.grundpris_aar1 + (r.aar1.grundpris_oere ?? 0),
      grundpris_aar2: s.grundpris_aar2 + (r.aar2.grundpris_oere ?? 0),
      pris_aar1: s.pris_aar1 + r.aar1.pris_oere,
      pris_aar2: s.pris_aar2 + r.aar2.pris_oere,
    }),
    { grundpris_aar1: 0, grundpris_aar2: 0, pris_aar1: 0, pris_aar2: 0 },
  );
  return { raekker, samlet };
}

/** Ø3b: kundeværdien — de KUNDEVAERDI_ANTAL største efter samlet betalt ekskl. moms (status betalt). */
export function kundevaerdiFor(overblik: Overblik): Kundevaerdi {
  const navn = navneOpslag(overblik);
  const status = new Map(overblik.virksomheder.map((v) => [v.id, erAktivKunde(v) ? ("aktiv" as const) : ("tidligere" as const)]));
  const kontraktaar = new Map<string, number>();
  for (const k of overblik.kontrakter) kontraktaar.set(k.company_id, (kontraktaar.get(k.company_id) ?? 0) + 1);
  const pr = new Map<string, number>();
  let siden: string | null = null;
  for (const b of betalingerTilMotor(overblik.betalinger)) {
    pr.set(b.company_id, (pr.get(b.company_id) ?? 0) + Math.round(b.beloeb_eks_moms_oere));
    const key = danskMaaned(b.betalt_at);
    if (siden === null || key < siden) siden = key;
  }
  const iAlt = [...pr.values()].reduce((s, v) => s + v, 0);
  const alle = [...pr.entries()]
    .map(([company_id, betalt]) => ({
      company_id,
      navn: navn(company_id),
      betalt_oere: betalt,
      andel: iAlt > 0 ? betalt / iAlt : 0,
      kontraktaar: kontraktaar.get(company_id) ?? 0,
      status: status.get(company_id) ?? ("tidligere" as const),
    }))
    .sort((a, b) => b.betalt_oere - a.betalt_oere || a.navn.localeCompare(b.navn, "da"));
  const top = alle.slice(0, KUNDEVAERDI_ANTAL);
  return { top, top_andel: top.reduce((s, r) => s + r.andel, 0), betalt_i_alt_oere: iAlt, kunder: alle.length, siden };
}

/** «De 10 største har betalt 52 % af alt siden marts 2025». */
export function kundevaerdiTekst(k: Kundevaerdi): string {
  const siden = k.siden ? ` siden ${maanedsNavn(k.siden)}` : "";
  return `De ${k.top.length} største har betalt ${pct(k.top_andel)} af alt${siden}`;
}

/** Kalenderdag + n måneder, dagen klippet til månedens længde («2026-01-31» + 1 → «2026-02-28»). */
export function laegMaanederTilDag(dag: string, n: number): string {
  const [y, m, d] = laesDato(dag);
  const key = laegMaanederTil(`${y}-${String(m).padStart(2, "0")}`, n);
  const [ny, nm] = key.split("-").map(Number);
  const dage = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${key}-${String(Math.min(d, dage)).padStart(2, "0")}`;
}

/** Ø3b: det der er FORFALDENT på en kontrakt til og med dagen «YYYY-MM-DD» (se filhovedet, del 7). */
export function forfaldentFor(k: Kontrakt, nuDag: string): number {
  const pris = Math.round(k.pris_eks_moms_oere);
  if (pris <= 0) return 0;
  const model = k.betalingsmodel ?? null;
  if (model === "rate12" || model === "maanedlig") {
    const laengde = Math.max(1, Math.round(laengdeIMaaneder(k)));
    const rater = model === "rate12" ? 12 : laengde;
    const pauser = Math.max(0, laengde - rater);
    let passeret = 0;
    for (let n = 0; n < rater + pauser; n += 1) if (laegMaanederTilDag(k.periode_start, n) <= nuDag) passeret += 1;
    const forfaldne = Math.max(0, Math.min(rater, passeret - pauser));
    return Math.round((pris * forfaldne) / rater);
  }
  if (model === "rate2") {
    const rate1 = Math.floor(pris / 2);
    return (k.periode_start <= nuDag ? rate1 : 0) + (laegMaanederTilDag(k.periode_start, RATE2_ANDEN_RATE_MAANEDER) <= nuDag ? pris - rate1 : 0);
  }
  return k.periode_start <= nuDag ? pris : 0;
}

/** Ø3b: forfaldne betalinger der ikke er kommet — pr. virksomhed, kun hvor positivt; fejlede træk som før. */
export function udestaaendeFor(overblik: Overblik, nuDag: string): Udestaaende {
  const navn = navneOpslag(overblik);
  const forfaldentPr = new Map<string, number>();
  for (const k of overblik.kontrakter) forfaldentPr.set(k.company_id, (forfaldentPr.get(k.company_id) ?? 0) + forfaldentFor(k, nuDag));
  const betaltPr = new Map<string, number>();
  for (const b of betalingerTilMotor(overblik.betalinger)) {
    if (danskDagAf(b.betalt_at) > nuDag) continue;
    betaltPr.set(b.company_id, (betaltPr.get(b.company_id) ?? 0) + Math.round(b.beloeb_eks_moms_oere));
  }
  const raekker: UdestaaendeRaekke[] = [];
  for (const [id, forfaldent] of forfaldentPr) {
    const betalt = betaltPr.get(id) ?? 0;
    const udestaaende = forfaldent - betalt;
    if (udestaaende > 0) raekker.push({ company_id: id, navn: navn(id), forfaldent_oere: forfaldent, betalt_oere: betalt, udestaaende_oere: udestaaende });
  }
  raekker.sort((a, b) => b.udestaaende_oere - a.udestaaende_oere || a.navn.localeCompare(b.navn, "da"));
  const fejlede: FejletTraek[] = overblik.betalinger
    .filter((b: OverblikBetaling) => b.status === "fejlet")
    .map((b) => ({ company_id: b.company_id, navn: navn(b.company_id), faktura_nummer: b.faktura_nummer, kilde: b.kilde, beloeb_eks_moms_oere: b.beloeb_eks_moms_oere }));
  return {
    raekker,
    i_alt_oere: raekker.reduce((s, r) => s + r.udestaaende_oere, 0),
    fejlede,
    fejlede_i_alt_oere: fejlede.reduce((s, f) => s + f.beloeb_eks_moms_oere, 0),
  };
}

/** Dansk kalenderdag for et ISO-tidspunkt («YYYY-MM-DD»). */
function danskDagAf(iso: string): string {
  return danskDag(new Date(iso));
}

// ── Hele dommen ──

export function dashboardDom(overblik: Overblik, nu: Date): DashboardDom {
  if (overblik.kontrakter.length === 0) return { tom: true, tekst: OEKONOMI_TOM_TEKST };
  const nuKey = danskMaaned(nu.toISOString());
  const nuDag = danskDag(nu);
  const foerste = overblik.kontrakter.map((k) => k.periode_start.slice(0, 7)).sort()[0];
  const fra = foerste < nuKey ? foerste : nuKey; // periodiseringen regner fra første kontrakt; kurven klipper til KURVE_FRA
  const til = laegMaanederTil(nuKey, KURVE_MAANEDER_FREM);
  const maaneder = periodiser({ kontrakter: overblik.kontrakter, betalinger: betalingerTilMotor(overblik.betalinger), fra, til });
  const udestaaende = udestaaendeFor(overblik, nuDag);
  return {
    tom: false,
    nuKey,
    // Ø3b: nøgletallet «Udestående» er den nye dom (forfaldne, ikke betalte) — ikke motorens timing-tal.
    noegletal: { ...noegletalFor(maaneder, nuKey), udestaaende_oere: udestaaende.i_alt_oere },
    kurve: kurveFor(maaneder, nuKey),
    bro: broFor(overblik, maaneder, nuKey),
    radar: radarFor(overblik, nuDag),
    prisudvikling: prisudviklingFor(overblik),
    kundevaerdi: kundevaerdiFor(overblik),
    udestaaende,
    maaneder,
  };
}

/** Procent uden decimaler («38 %»). */
export function pct(andel: number): string {
  return `${Math.round(andel * 100)} %`;
}

/** Fortegn foran kr: «+4.167» / «−3.500» / «0». */
export function krMedFortegn(oere: number): string {
  if (oere > 0) return `+${kr(oere)}`;
  return kr(oere);
}

/** Dansk dato «14/3-2027» af «2027-03-14». */
export function datoKort(dag: string): string {
  const [y, m, d] = laesDato(dag);
  return `${d}/${m}-${y}`;
}

/** Måneden i ord («september 2026»). */
export function maanedsNavn(key: string): string {
  const navne = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
  const [y, m] = key.split("-").map(Number);
  return `${navne[m - 1]} ${y}`;
}
