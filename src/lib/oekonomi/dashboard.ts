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
 *      pris på de kontraktår der udløber uden et nyt.
 *   5. PRISUDVIKLING: virksomheder med to kontraktår — år 1 → år 2 for
 *      grundpris og pris, og samlet.
 *   6. KONCENTRATION: de fem største kunders andel af MRR ved månedens slutning.
 *   7. UDESTÅENDE: pr. virksomhed hvor betalt til dato − anerkendt til dato
 *      er negativ, og fejlede træk (company_traek.status = 'fejlet').
 */
import {
  aktivPaaDag,
  danskMaaned,
  kr,
  laesDato,
  mrrBroPoster,
  mrrForKontrakt,
  periodiser,
  periodiserKontrakt,
  sidsteDag,
  type BroSlags,
  type Kontrakt,
  type MaanedsTal,
} from "@/lib/oekonomi/omsaetning";
import { betalingerTilMotor, type Overblik, type OverblikBetaling } from "@/lib/oekonomi/overblik";

export const RADAR_DAGE = 90;
export const KURVE_MAANEDER_FREM = 12;
/** Kurven begynder her — Ø1b (kørt 17/9) lagde historikken fra maj 2025 ind (Monday starter maj 2025; KJ AUTOs marts–april 2025 tæller i tallene, men tegnes ikke). */
export const KURVE_FRA = "2025-05";
export const BRO_MAANEDER = 12;
export const KONCENTRATION_ANTAL = 5;

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

export interface KoncentrationRaekke {
  company_id: string;
  navn: string;
  mrr_oere: number;
  andel: number;
}

export interface Koncentration {
  top: KoncentrationRaekke[];
  top_andel: number;
  mrr_i_alt_oere: number;
  betalende: number;
}

export interface UdestaaendeRaekke {
  company_id: string;
  navn: string;
  betalt_oere: number;
  anerkendt_oere: number;
  /** Negativ: udestående. */
  forskel_oere: number;
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
      koncentration: Koncentration;
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
  const akse = kurve
    .map((p, i) => ({ i, p }))
    .filter(({ i }) => i % 3 === 0 || i === n - 1)
    .map(({ i, p }) => ({ x: x(i), label: maanedsLabel(p.key), betalende: p.betalende }));
  return { mrr, mrr_kontraheret: mrrKontraheret, tjent, kontraheret, soejler, max_oere: max, akse };
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

export function radarFor(overblik: Overblik, nuDag: string): Radar {
  const navn = navneOpslag(overblik);
  const nuMs = dagTilMs(nuDag);
  const graenseMs = nuMs + RADAR_DAGE * 86_400_000;
  const ukendt = overblik.fornyelser === undefined;
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

export function koncentrationFor(overblik: Overblik, nuKey: string): Koncentration {
  const navn = navneOpslag(overblik);
  const dag = sidsteDag(nuKey);
  const pr = new Map<string, number>();
  for (const k of overblik.kontrakter) {
    if (k.pris_eks_moms_oere <= 0 || !aktivPaaDag(k, dag)) continue;
    pr.set(k.company_id, (pr.get(k.company_id) ?? 0) + mrrForKontrakt(k));
  }
  const iAlt = [...pr.values()].reduce((s, v) => s + v, 0);
  const alle = [...pr.entries()]
    .map(([company_id, mrr]) => ({ company_id, navn: navn(company_id), mrr_oere: mrr, andel: iAlt > 0 ? mrr / iAlt : 0 }))
    .sort((a, b) => b.mrr_oere - a.mrr_oere || a.navn.localeCompare(b.navn, "da"));
  const top = alle.slice(0, KONCENTRATION_ANTAL);
  return { top, top_andel: top.reduce((s, r) => s + r.andel, 0), mrr_i_alt_oere: iAlt, betalende: alle.length };
}

export function udestaaendeFor(overblik: Overblik, nuKey: string): Udestaaende {
  const navn = navneOpslag(overblik);
  const betaltPr = new Map<string, number>();
  for (const b of betalingerTilMotor(overblik.betalinger)) {
    if (danskMaaned(b.betalt_at) > nuKey) continue;
    betaltPr.set(b.company_id, (betaltPr.get(b.company_id) ?? 0) + b.beloeb_eks_moms_oere);
  }
  const anerkendtPr = new Map<string, number>();
  for (const k of overblik.kontrakter) {
    const sum = periodiserKontrakt(k).filter((m) => m.key <= nuKey).reduce((s, m) => s + m.anerkendt_oere, 0);
    anerkendtPr.set(k.company_id, (anerkendtPr.get(k.company_id) ?? 0) + sum);
  }
  const ids = new Set<string>([...betaltPr.keys(), ...anerkendtPr.keys()]);
  const raekker: UdestaaendeRaekke[] = [];
  for (const id of ids) {
    const betalt = betaltPr.get(id) ?? 0;
    const anerkendt = anerkendtPr.get(id) ?? 0;
    const forskel = betalt - anerkendt;
    if (forskel < 0) raekker.push({ company_id: id, navn: navn(id), betalt_oere: betalt, anerkendt_oere: anerkendt, forskel_oere: forskel });
  }
  raekker.sort((a, b) => a.forskel_oere - b.forskel_oere);
  const fejlede: FejletTraek[] = overblik.betalinger
    .filter((b: OverblikBetaling) => b.status === "fejlet")
    .map((b) => ({ company_id: b.company_id, navn: navn(b.company_id), faktura_nummer: b.faktura_nummer, kilde: b.kilde, beloeb_eks_moms_oere: b.beloeb_eks_moms_oere }));
  return {
    raekker,
    i_alt_oere: raekker.reduce((s, r) => s + r.forskel_oere, 0),
    fejlede,
    fejlede_i_alt_oere: fejlede.reduce((s, f) => s + f.beloeb_eks_moms_oere, 0),
  };
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
  return {
    tom: false,
    nuKey,
    noegletal: noegletalFor(maaneder, nuKey),
    kurve: kurveFor(maaneder, nuKey),
    bro: broFor(overblik, maaneder, nuKey),
    radar: radarFor(overblik, nuDag),
    prisudvikling: prisudviklingFor(overblik),
    koncentration: koncentrationFor(overblik, nuKey),
    udestaaende: udestaaendeFor(overblik, nuKey),
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
