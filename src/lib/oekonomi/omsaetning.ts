/**
 * src/lib/oekonomi/omsaetning.ts — den periodiserede omsætningsdom
 * (økonomi-dashboardet PR Ø1, 18/9-2026 — recon-oekonomi-dashboard.md §10.1).
 *
 * JONAS 17/9 (ordret): «Bemærk, at alle medlemskaber, også dem der betaler
 * fuld pris med det samme, skal periodiseres over 12 mdr. så omsætningen er
 * retvisende.»
 *
 * REN motor: ingen imports, ingen React, ingen Supabase, ingen date-fns.
 * Kilden er KONTRAKTEN (public.kontrakter, migration 20260918100000 — én
 * række pr. kontraktår med prisen ekskl. moms), ikke betalingen. Betalingerne
 * (company_traek, ekskl. moms via moms_oere) bruges KUN til kontant-mod-
 * periodiseret og forudbetalt/udestående. Alt i øre, alt ekskl. moms.
 *
 * PERIODISERINGEN (kalendermåneder, dansk tid):
 *   Kontrakten [periode_start, periode_slut) — slutdatoen er EKSKLUSIV som
 *   overalt i huset (fornyelsesperiode.ts: «adgangen forsvinder kl. 00:00 på
 *   selve slutdagen»). Hver hel kalendermåned inde i perioden vejer 1;
 *   start- og slutmåneden vejer dage/dage-i-måneden. Prisen fordeles efter
 *   vægt, så summen af månederne ALTID er præcis prisen (rest i øre lægges
 *   på den sidste måned). For et kontraktår (12 måneder) er hver hel måned
 *   dermed pris/12 — også når kontrakten starter den 31. (31/1 → 31/1: 1 dag
 *   i januar, 30 dage i januar året efter, vægt 1/31 + 30/31 = 1). Et
 *   kontraktår hen over 29. februar (15/2-2027 → 15/2-2028) vejer 14/28 +
 *   14/29 = 0,983 i endemånederne, så de hele måneder får en anelse over
 *   pris/12 — summen er stadig prisen; det er testet, ikke rettet.
 *   En kontrakt på 2 år i én række eller på 1 måned (maanedlig) følger samme
 *   regel: prisen fordeles over dens egne måneder.
 *
 * TALLENE pr. måned (MaanedsTal):
 *   anerkendt_oere      — omsætning periodiseret ind i måneden.
 *   mrr_oere / arr_oere — månedlig løbende rate for kontrakter aktive den
 *                         SIDSTE dag i måneden (pris / kontraktens længde i
 *                         måneder; ARR = 12 × MRR). Gratis (pris 0) tælles i
 *                         gratis_aktive, ikke i aktive.
 *   kontraheret_frem    — det der er tilbage at anerkende EFTER måneden på
 *                         kendte kontrakter (kun kendte — en forventet
 *                         fornyelse findes ikke før den er skrevet).
 *   kontant_oere        — betalinger med betalt_at i måneden (dansk tid).
 *   forudbetalt_oere    — pr. virksomhed: betalt til dato − anerkendt til
 *                         dato, summeret hvor positivt (fuld pris forud,
 *                         2 rater); udestaaende_oere det samme hvor
 *                         negativt (rate 2 der ikke er faldet, tabte
 *                         månedstræk, Topix-rabat).
 *   bro                 — MRR-broen mod forrige måneds slutning, pr.
 *                         virksomhed: ny (0 → MRR uden kontrakt inden for
 *                         FORNYELSES_AFSTAND_DAGE før), fornyet_op /
 *                         fornyet_ned / fornyet_uaendret (en tidligere
 *                         kontrakt sluttede inden for afstanden, eller
 *                         MRR'en skiftede mens virksomheden var aktiv),
 *                         tabt (MRR → 0), gratis (en kontrakt med pris 0
 *                         startede). Summen af broens øre over alle måneder
 *                         fra første måned er præcis MRR ved slutningen —
 *                         broen forklarer altid hele bevægelsen.
 *
 * Testet i __tests__/omsaetning.test.ts. Intet spejl i _shared: Ø2's RPC
 * afleverer rækkerne (kontrakter + betalinger), og dommen regnes her i
 * browseren — én motor, ét sprog (README Ø1, valg 3).
 */

export type Betalingsmodel = "fuld" | "rate2" | "rate12" | "maanedlig" | "e-conomic" | "gratis";
export type KontraktKilde = "indgang" | "fornyelse" | "manuel" | "backfill";

/** Én række i public.kontrakter (det motoren læser). Datoer «YYYY-MM-DD»; slut eksklusiv. */
export interface Kontrakt {
  id: string;
  company_id: string;
  periode_start: string;
  periode_slut: string;
  /** Prisen for HELE perioden, ekskl. moms, i øre — inkl. ratetillæg (det der faktureres). */
  pris_eks_moms_oere: number;
  betalingsmodel?: Betalingsmodel | string | null;
  kilde?: KontraktKilde | string | null;
}

/** En betaling ekskl. moms (company_traek: beloeb_oere − moms_oere, status betalt). betalt_at er ISO 8601 med tidszone. */
export interface Betaling {
  company_id: string;
  betalt_at: string;
  beloeb_eks_moms_oere: number;
}

export interface BroPost {
  antal: number;
  oere: number;
}

export interface MrrBro {
  ny: BroPost;
  fornyet_op: BroPost;
  fornyet_ned: BroPost;
  fornyet_uaendret: BroPost;
  tabt: BroPost;
  gratis: BroPost;
}

export interface MaanedsTal {
  /** «YYYY-MM». */
  key: string;
  anerkendt_oere: number;
  mrr_oere: number;
  arr_oere: number;
  /** Betalende kontrakter aktive den sidste dag i måneden. */
  aktive: number;
  /** Gratis kontrakter (pris 0) aktive den sidste dag i måneden. */
  gratis_aktive: number;
  kontraheret_frem_oere: number;
  kontant_oere: number;
  forudbetalt_oere: number;
  udestaaende_oere: number;
  bro: MrrBro;
}

export interface PeriodiserInput {
  kontrakter: readonly Kontrakt[];
  /** Første måned «YYYY-MM» (inkl.). */
  fra: string;
  /** Sidste måned «YYYY-MM» (inkl.). */
  til: string;
  betalinger?: readonly Betaling[];
}

/** En tidligere kontrakt der sluttede inden for så mange dage før den nye start er en FORNYELSE, ikke en ny kunde. */
export const FORNYELSES_AFSTAND_DAGE = 92;

export const TIDSZONE = "Europe/Copenhagen";

// ── Kalenderen (UTC-regning på kalenderdatoer — datoerne er dansk kalender, ikke tidspunkter) ──

const MS_DOEGN = 86_400_000;

function utc(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

/** «YYYY-MM-DD» → [år, måned 1-12, dag]. Kaster på ulæselig dato — en kontrakt uden dato er en fejl, ikke et nul. */
export function laesDato(s: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  if (!m) throw new Error(`omsaetning: ulæselig dato «${s}»`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function dageIMaaned(y: number, m: number): number {
  return Math.round((utc(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1) - utc(y, m, 1)) / MS_DOEGN);
}

export function maanedsNoegle(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function laesMaaned(key: string): [number, number] {
  const m = /^(\d{4})-(\d{2})$/.exec(key ?? "");
  if (!m) throw new Error(`omsaetning: ulæselig måned «${key}»`);
  return [Number(m[1]), Number(m[2])];
}

function naesteMaaned(y: number, m: number): [number, number] {
  return m === 12 ? [y + 1, 1] : [y, m + 1];
}

/** Månederne fra «fra» til og med «til». */
export function maanederFraTil(fra: string, til: string): string[] {
  let [y, m] = laesMaaned(fra);
  const [ty, tm] = laesMaaned(til);
  const ud: string[] = [];
  while (y < ty || (y === ty && m <= tm)) {
    ud.push(maanedsNoegle(y, m));
    [y, m] = naesteMaaned(y, m);
  }
  return ud;
}

/** Måneden («YYYY-MM») et tidspunkt falder i, i dansk tid. */
export function danskMaaned(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`omsaetning: ulæseligt tidspunkt «${iso}»`);
  const dele = new Intl.DateTimeFormat("en-CA", { timeZone: TIDSZONE, year: "numeric", month: "2-digit" }).formatToParts(d);
  const y = dele.find((p) => p.type === "year")?.value ?? "";
  const m = dele.find((p) => p.type === "month")?.value ?? "";
  return `${y}-${m}`;
}

// ── Periodiseringen af én kontrakt ──

export interface KontraktMaaned {
  key: string;
  /** Vægt: 1 for en hel måned, dage/dage-i-måneden for start- og slutmåneden. */
  vaegt: number;
  anerkendt_oere: number;
}

/** Kontraktens måneder med vægt; summen af anerkendt_oere er præcis prisen. */
export function periodiserKontrakt(k: Kontrakt): KontraktMaaned[] {
  const [sy, sm, sd] = laesDato(k.periode_start);
  const [ey, em, ed] = laesDato(k.periode_slut);
  const startMs = utc(sy, sm, sd);
  const slutMs = utc(ey, em, ed);
  if (slutMs <= startMs) throw new Error(`omsaetning: kontrakt ${k.id} slutter ikke efter start`);
  const pris = Math.round(k.pris_eks_moms_oere);
  const ud: KontraktMaaned[] = [];
  let y = sy;
  let m = sm;
  let samletVaegt = 0;
  while (utc(y, m, 1) < slutMs) {
    const dim = dageIMaaned(y, m);
    const mStart = utc(y, m, 1);
    const mSlut = utc(...naesteMaaned(y, m), 1);
    const fra = Math.max(mStart, startMs);
    const til = Math.min(mSlut, slutMs);
    const dage = Math.round((til - fra) / MS_DOEGN);
    const vaegt = dage === dim ? 1 : dage / dim;
    samletVaegt += vaegt;
    ud.push({ key: maanedsNoegle(y, m), vaegt, anerkendt_oere: 0 });
    [y, m] = naesteMaaned(y, m);
  }
  let fordelt = 0;
  for (let i = 0; i < ud.length; i++) {
    if (i === ud.length - 1) {
      ud[i].anerkendt_oere = pris - fordelt; // resten — summen er præcis prisen
    } else {
      ud[i].anerkendt_oere = Math.round((pris * ud[i].vaegt) / samletVaegt);
      fordelt += ud[i].anerkendt_oere;
    }
  }
  return ud;
}

/** Kontraktens længde i måneder (vægtsummen) — 12 for et kontraktår, 1 for en måned. */
export function laengdeIMaaneder(k: Kontrakt): number {
  return periodiserKontrakt(k).reduce((s, x) => s + x.vaegt, 0);
}

/** Månedlig løbende rate: prisen delt med længden i måneder. */
export function mrrForKontrakt(k: Kontrakt): number {
  const l = laengdeIMaaneder(k);
  return l > 0 ? Math.round(Math.round(k.pris_eks_moms_oere) / l) : 0;
}

/** Er kontrakten aktiv på kalenderdagen «YYYY-MM-DD» (start ≤ dag < slut)? */
export function aktivPaaDag(k: Kontrakt, dag: string): boolean {
  const [y, m, d] = laesDato(dag);
  const t = utc(y, m, d);
  const [sy, sm, sd] = laesDato(k.periode_start);
  const [ey, em, ed] = laesDato(k.periode_slut);
  return utc(sy, sm, sd) <= t && t < utc(ey, em, ed);
}

function sidsteDag(key: string): string {
  const [y, m] = laesMaaned(key);
  return `${key}-${String(dageIMaaned(y, m)).padStart(2, "0")}`;
}

function tomBro(): MrrBro {
  const p = (): BroPost => ({ antal: 0, oere: 0 });
  return { ny: p(), fornyet_op: p(), fornyet_ned: p(), fornyet_uaendret: p(), tabt: p(), gratis: p() };
}

function dageMellem(a: string, b: string): number {
  const [ay, am, ad] = laesDato(a);
  const [by, bm, bd] = laesDato(b);
  return Math.round((utc(by, bm, bd) - utc(ay, am, ad)) / MS_DOEGN);
}

/**
 * MRR pr. virksomhed ved månedens slutning (kun betalende kontrakter), og om
 * en gratis kontrakt starter i måneden.
 */
function mrrPrVirksomhed(kontrakter: readonly Kontrakt[], key: string): Map<string, number> {
  const dag = sidsteDag(key);
  const ud = new Map<string, number>();
  for (const k of kontrakter) {
    if (k.pris_eks_moms_oere <= 0 || !aktivPaaDag(k, dag)) continue;
    ud.set(k.company_id, (ud.get(k.company_id) ?? 0) + mrrForKontrakt(k));
  }
  return ud;
}

/** Havde virksomheden en betalende kontrakt der sluttede inden for FORNYELSES_AFSTAND_DAGE før «start»? */
function harForgaenger(kontrakter: readonly Kontrakt[], companyId: string, start: string): boolean {
  return kontrakter.some((f) => {
    if (f.company_id !== companyId || f.pris_eks_moms_oere <= 0) return false;
    const afstand = dageMellem(f.periode_slut, start);
    return afstand >= 0 && afstand <= FORNYELSES_AFSTAND_DAGE;
  });
}

/** Broen for én måned: bevægelsen pr. virksomhed fra forrige måneds MRR til denne. */
export function mrrBro(kontrakter: readonly Kontrakt[], key: string, forrigeKey: string | null): MrrBro {
  const bro = tomBro();
  const nu = mrrPrVirksomhed(kontrakter, key);
  const foer = forrigeKey ? mrrPrVirksomhed(kontrakter, forrigeKey) : new Map<string, number>();
  const virksomheder = new Set<string>([...nu.keys(), ...foer.keys()]);
  for (const c of virksomheder) {
    const a = foer.get(c) ?? 0;
    const b = nu.get(c) ?? 0;
    if (a === b) continue;
    if (a === 0) {
      // 0 → b: ny, medmindre en betalende kontrakt sluttede lige før den nye start.
      const nyeste = kontrakter
        .filter((k) => k.company_id === c && k.pris_eks_moms_oere > 0 && aktivPaaDag(k, sidsteDag(key)))
        .sort((x, y) => (x.periode_start < y.periode_start ? 1 : -1))[0];
      const forgaenger = nyeste ? harForgaenger(kontrakter.filter((k) => k !== nyeste), c, nyeste.periode_start) : false;
      if (forgaenger) {
        const forrigeMrr = nyeste
          ? Math.max(0, ...kontrakter
              .filter((k) => k !== nyeste && k.company_id === c && k.pris_eks_moms_oere > 0 && dageMellem(k.periode_slut, nyeste.periode_start) >= 0 && dageMellem(k.periode_slut, nyeste.periode_start) <= FORNYELSES_AFSTAND_DAGE)
              .map(mrrForKontrakt))
          : 0;
        const post = b > forrigeMrr ? bro.fornyet_op : b < forrigeMrr ? bro.fornyet_ned : bro.fornyet_uaendret;
        post.antal += 1;
        post.oere += b;
      } else {
        bro.ny.antal += 1;
        bro.ny.oere += b;
      }
    } else if (b === 0) {
      bro.tabt.antal += 1;
      bro.tabt.oere += b - a;
    } else {
      const post = b > a ? bro.fornyet_op : bro.fornyet_ned;
      post.antal += 1;
      post.oere += b - a;
    }
  }
  // Gratis: en kontrakt med pris 0 der STARTER i måneden (ingen øre, kun antal).
  for (const k of kontrakter) {
    if (k.pris_eks_moms_oere === 0 && k.periode_start.slice(0, 7) === key) bro.gratis.antal += 1;
  }
  return bro;
}

// ── Hovedfunktionen ──

export function periodiser(input: PeriodiserInput): MaanedsTal[] {
  const { kontrakter, fra, til } = input;
  const betalinger = input.betalinger ?? [];
  const maaneder = maanederFraTil(fra, til);

  // Anerkendt pr. kontrakt pr. måned — hele kontrakten, også uden for vinduet (kontraheret frem, til-dato).
  const anerkendtPrMaaned = new Map<string, number>();
  const anerkendtPrVirksomhedPrMaaned = new Map<string, Map<string, number>>();
  for (const k of kontrakter) {
    for (const km of periodiserKontrakt(k)) {
      anerkendtPrMaaned.set(km.key, (anerkendtPrMaaned.get(km.key) ?? 0) + km.anerkendt_oere);
      let pr = anerkendtPrVirksomhedPrMaaned.get(k.company_id);
      if (!pr) {
        pr = new Map<string, number>();
        anerkendtPrVirksomhedPrMaaned.set(k.company_id, pr);
      }
      pr.set(km.key, (pr.get(km.key) ?? 0) + km.anerkendt_oere);
    }
  }
  const alleNoegler = [...anerkendtPrMaaned.keys()].sort();

  // Betalinger pr. måned (dansk tid) i alt og pr. virksomhed.
  const kontantPrMaaned = new Map<string, number>();
  const betaltPrVirksomhedPrMaaned = new Map<string, Map<string, number>>();
  for (const b of betalinger) {
    const key = danskMaaned(b.betalt_at);
    kontantPrMaaned.set(key, (kontantPrMaaned.get(key) ?? 0) + Math.round(b.beloeb_eks_moms_oere));
    let pr = betaltPrVirksomhedPrMaaned.get(b.company_id);
    if (!pr) {
      pr = new Map<string, number>();
      betaltPrVirksomhedPrMaaned.set(b.company_id, pr);
    }
    pr.set(key, (pr.get(key) ?? 0) + Math.round(b.beloeb_eks_moms_oere));
  }

  const virksomheder = new Set<string>([...anerkendtPrVirksomhedPrMaaned.keys(), ...betaltPrVirksomhedPrMaaned.keys()]);
  const sumTilOgMed = (pr: Map<string, number> | undefined, key: string): number => {
    if (!pr) return 0;
    let s = 0;
    for (const [k, v] of pr) if (k <= key) s += v;
    return s;
  };

  const ud: MaanedsTal[] = [];
  let forrige: string | null = null;
  for (const key of maaneder) {
    const dag = sidsteDag(key);
    let mrr = 0;
    let aktive = 0;
    let gratisAktive = 0;
    for (const k of kontrakter) {
      if (!aktivPaaDag(k, dag)) continue;
      if (k.pris_eks_moms_oere > 0) {
        aktive += 1;
        mrr += mrrForKontrakt(k);
      } else {
        gratisAktive += 1;
      }
    }
    let kontraheretFrem = 0;
    for (const n of alleNoegler) if (n > key) kontraheretFrem += anerkendtPrMaaned.get(n) ?? 0;
    let forudbetalt = 0;
    let udestaaende = 0;
    for (const c of virksomheder) {
      const diff = sumTilOgMed(betaltPrVirksomhedPrMaaned.get(c), key) - sumTilOgMed(anerkendtPrVirksomhedPrMaaned.get(c), key);
      if (diff > 0) forudbetalt += diff;
      else if (diff < 0) udestaaende += -diff;
    }
    ud.push({
      key,
      anerkendt_oere: anerkendtPrMaaned.get(key) ?? 0,
      mrr_oere: mrr,
      arr_oere: mrr * 12,
      aktive,
      gratis_aktive: gratisAktive,
      kontraheret_frem_oere: kontraheretFrem,
      kontant_oere: kontantPrMaaned.get(key) ?? 0,
      forudbetalt_oere: forudbetalt,
      udestaaende_oere: udestaaende,
      bro: mrrBro(kontrakter, key, forrige),
    });
    forrige = key;
  }
  return ud;
}

/** Summen af broens øre — til afstemning: Σ over alle måneder fra den første = MRR ved slutningen. */
export function broSum(b: MrrBro): number {
  return b.ny.oere + b.fornyet_op.oere + b.fornyet_ned.oere + b.fornyet_uaendret.oere + b.tabt.oere + b.gratis.oere;
}

/** Kroner med dansk tusindtal, uden ører («52.500»); negative med minus. */
export function kr(oere: number): string {
  const kroner = Math.round(oere / 100);
  const s = Math.abs(kroner).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return kroner < 0 ? `−${s}` : s;
}
