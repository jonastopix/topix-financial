/**
 * src/lib/svartid.ts
 *
 * «Svartids-uret» — rådgivernes første gamification-skive (30/9-2026; Jonas:
 * «Gns. svartid og andet der kan presse os til at levere bedre»). Ren dom,
 * ingen React, ingen Supabase — testet i src/lib/__tests__/svartid.test.ts;
 * hentningen bor i src/hooks/svartid.ts og fladen i
 * src/components/hjemmebane/forside/SvartidsUret.tsx (kun rådgiverens forside).
 * Grundlaget: gamification-analysen 30/9 §1.3 (beregningen) og R1 (teammål).
 *
 * HVORFOR FRA `messages` OG IKKE FRA `conversations`: triggeren
 * update_conversation_reply_state (20260311050600) OVERSKRIVER
 * last_advisor_reply_at og last_member_message_at ved hver besked — de
 * rummer kun det seneste tidspunkt, aldrig det første ubesvarede. Svartiden
 * regnes derfor fra beskederne, med triggerens egen dom om hvem der er hvem.
 *
 * REGLERNE (samme som triggeren og analysens SQL, så en SELECT i prod kan
 * give de samme rå tal):
 *   BESKED     = messages med message_type = 'user'. Alt andet (system, ai,
 *                welcome, reflection-nudge, legat-momentum-reminder …) tæller
 *                ikke — heller ikke når det bærer en rådgivers sender_id, som
 *                velkomst og nudge gør. Det er triggerens linje 1.
 *   RÅDGIVER   = sender_id i rådgiverlisten (user_roles.role IN
 *                ('advisor','admin') — hentet gennem get_all_advisor_profiles,
 *                fordi en rådgiver ikke må læse andres user_roles).
 *   VENTETID   = fra den FØRSTE medlemsbesked efter sidste rådgiversvar i
 *                samtalen (eller den første i samtalen) til NÆSTE
 *                rådgiverbesked i samme samtale — uanset hvem af rådgiverne.
 *                Tre medlemsbeskeder i træk er ÉN ventetid, og uret går fra
 *                den første.
 *   UBESVARET  = en ventetid uden svar. Kun den sidste i en samtale kan være
 *                ubesvaret. Står samtalen med awaiting_reply_from = 'advisor',
 *                VENTER den; ellers er den AFGJORT UDEN SVAR («Kræver ikke
 *                svar» sætter feltet til null uden at gemme hvem eller hvornår,
 *                analysen §1.4 pkt. 2) og tæller hverken som svar, som
 *                ventende eller i streaken.
 *   DEMO       = samtaler hos virksomheder med is_demo = true tælles ikke.
 *
 * TO URE — hovedtallet og det rå ved siden af:
 *   HVERDAGSTIMER (hovedtallet): hverdage efter hverdage.ts (mandag–fredag
 *     minus danske helligdage og husets tre lukkedage) kl. 07:00–17:00 dansk
 *     tid. Et husur, ikke en persons (analysen §1.4 pkt. 4: ingen
 *     fraværskalender findes). 07 er hverdage.ts' SENDEVINDUE_FRA_TIME; 17 er
 *     Jonas' bestilling 30/9 — IKKE sendevinduets 16, som er rykkernes ur.
 *     Regnestykke: spørgsmål fredag 16:00, svar mandag 08:30 = (17 − 16) +
 *     (08:30 − 07:00) = 1 + 1,5 = 2,5 hverdagstimer (65,5 rå timer).
 *   RÅ TIMER (ved siden af): kalendertimer, stillet → svar.
 *   ALLE grænser (4 t, 24 t, farven, streaken) dømmes i HVERDAGSTIMER, så
 *   tallet og farven aldrig taler to ure. 24 hverdagstimer = 2,4 hverdage.
 *
 * TALLENE pr. vindue (spørgsmål STILLET i (slut − dage, slut]):
 *   median og gennemsnit — i begge ure, over BESVAREDE ventetider.
 *     Medianen er Postgres' percentile_cont(0.5) (lineær interpolation).
 *   FOR FÅ: under MIN_N besvarede erstatter «for få» tallet (husets regel fra
 *     marketingdommen: et tal på for få er ikke et tal).
 *   ANDEL INDEN FOR 4 t / 24 t: tæller = besvarede inden for grænsen;
 *     nævner = besvarede + VENTENDE, der allerede er over grænsen (de har
 *     tabt, uanset hvornår de besvares). Ventende under grænsen er endnu ikke
 *     afgjort og tæller ikke.
 *   TREND: median 7 dage mod de 7 dage før (dag 8–14). Kun når begge har
 *     mindst MIN_N besvarede; ellers ingen trend.
 *   FARVEN: median 7 dage i hverdagstimer — ≤ 4 t grøn, ≤ 24 t gul, > 24 t
 *     rød; «for få» er neutral.
 *
 * ÆLDSTE UBESVAREDE nu = den ventende med tidligste tidspunkt, med
 * virksomheden.
 *
 * STREAK «INTET VENTER» = danske kalenderdage i træk (i dag medregnet, hvis
 * den er ren indtil nu), hvor ingen ubesvaret besked på noget tidspunkt havde
 * ventet over STREAK_GRAENSE_TIMER (24) hverdagstimer. En ventetid bryder de
 * dage, dens «over 24 t»-interval [tidspunktet hvor 24 hverdagstimer er gået,
 * svaret ?? nu) rører. Streaken tælles højst MAANED_DAGE tilbage; når den når
 * dertil, er den «mindst» så lang.
 *
 * FORLØB: hentningen går FORLOEB_DAGE længere tilbage end de 30 dage, så en
 * ventetid tidligt i vinduet kender beskeden før sig (ellers kunne en
 * medlemsbesked, hvis forgænger ligger før hentningen, fejlagtigt starte en
 * ny ventetid), og så streakens ældste dag kender de spørgsmål, der kan have
 * ventet ind over den. Kun spørgsmål stillet INDEN FOR et vindue tælles i
 * dets tal; ventende tælles fra hele hentningen.
 */
import { erHverdagDato, kbhDato, kbhTilUtc, laegDageTilDato, SENDEVINDUE_FRA_TIME } from "@/lib/hverdage";

/** Hverdagens ur (se filhovedet). TIL er eksklusiv. */
export const HVERDAG_FRA_TIME = SENDEVINDUE_FRA_TIME;
export const HVERDAG_TIL_TIME = 17;
/** Farvegrænserne og andelene, i hverdagstimer. */
export const GROEN_TIMER = 4;
export const GUL_TIMER = 24;
/** Streakens grænse i hverdagstimer. */
export const STREAK_GRAENSE_TIMER = 24;
/** Under dette antal besvarede er et tal «for få». */
export const MIN_N = 5;
/** Vinduerne i døgn. */
export const UGE_DAGE = 7;
export const MAANED_DAGE = 30;
/** Ekstra døgn der hentes før de 30, så det første spørgsmål kender sin forgænger. */
export const FORLOEB_DAGE = 7;
export const HENT_DAGE = MAANED_DAGE + FORLOEB_DAGE;

const TIME_MS = 3_600_000;
const DOEGN_MS = 24 * TIME_MS;
/** Værn mod en uendelig løkke i dags-gangene (≈ 5 år). */
const MAKS_DAGE_I_GANG = 2000;

export interface SvartidBesked {
  id: string;
  conversation_id: string;
  sender_id: string;
  created_at: string;
  message_type: string;
}

export interface SvartidSamtale {
  id: string;
  company_id: string | null;
  awaiting_reply_from: string | null;
}

export interface SvartidVirksomhed {
  id: string;
  name: string;
  is_demo: boolean | null;
}

export interface SvartidInput {
  beskeder: readonly SvartidBesked[];
  samtaler: readonly SvartidSamtale[];
  virksomheder: readonly SvartidVirksomhed[];
  raadgiverIds: readonly string[];
  nu: Date;
}

export type VentetidStatus = "besvaret" | "venter" | "afgjort_uden_svar";

export interface Ventetid {
  /** Id på medlemsbeskeden, der startede uret. */
  id: string;
  samtaleId: string;
  companyId: string | null;
  stillet: Date;
  svaretAt: Date | null;
  status: VentetidStatus;
  /** Besvaret: stillet → svar. Venter: stillet → nu. Afgjort uden svar: null. */
  raaTimer: number | null;
  hverdagstimer: number | null;
}

/** Hverdagstimer mellem to tidspunkter: hverdage kl. 07–17 dansk tid (husets ur). */
export function hverdagstimerMellem(fra: Date, til: Date): number {
  if (til.getTime() <= fra.getTime()) return 0;
  let ms = 0;
  let dato = kbhDato(fra);
  const slutDato = kbhDato(til);
  // Datoer som «YYYY-MM-DD» sammenlignes korrekt som strenge.
  for (let i = 0; i < MAKS_DAGE_I_GANG && dato <= slutDato; i++) {
    if (erHverdagDato(dato)) {
      const a = Math.max(fra.getTime(), kbhTilUtc(dato, HVERDAG_FRA_TIME).getTime());
      const b = Math.min(til.getTime(), kbhTilUtc(dato, HVERDAG_TIL_TIME).getTime());
      if (b > a) ms += b - a;
    }
    dato = laegDageTilDato(dato, 1);
  }
  return ms / TIME_MS;
}

/** Det tidspunkt, hvor `timer` hverdagstimer er gået efter `fra` (omvendt af hverdagstimerMellem). */
export function efterHverdagstimer(fra: Date, timer: number): Date {
  let rest = timer * TIME_MS;
  let dato = kbhDato(fra);
  for (let i = 0; i < MAKS_DAGE_I_GANG; i++) {
    if (erHverdagDato(dato)) {
      const a = Math.max(fra.getTime(), kbhTilUtc(dato, HVERDAG_FRA_TIME).getTime());
      const b = kbhTilUtc(dato, HVERDAG_TIL_TIME).getTime();
      if (b > a) {
        if (b - a >= rest) return new Date(a + rest);
        rest -= b - a;
      }
    }
    dato = laegDageTilDato(dato, 1);
  }
  return new Date(8.64e15); // uden for enhver tidslinje — nås ikke i praksis
}

/** Median som Postgres' percentile_cont(0.5): lineær interpolation over de sorterede værdier. */
export function median(vaerdier: readonly number[]): number | null {
  if (vaerdier.length === 0) return null;
  const s = [...vaerdier].sort((a, b) => a - b);
  const pos = 0.5 * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const gennemsnit = (v: readonly number[]): number | null => (v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length);

const tidOgId = (a: SvartidBesked, b: SvartidBesked): number => {
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (ta !== tb) return ta - tb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/** Alle ventetider i beskederne efter reglerne i filhovedet, ældste først. */
export function findVentetider(input: SvartidInput): Ventetid[] {
  const raadgivere = new Set(input.raadgiverIds);
  const demo = new Set(input.virksomheder.filter((v) => v.is_demo === true).map((v) => v.id));
  const samtaleAf = new Map(input.samtaler.map((s) => [s.id, s]));

  const prSamtale = new Map<string, SvartidBesked[]>();
  for (const b of input.beskeder) {
    if (b.message_type !== "user") continue;
    const samtale = samtaleAf.get(b.conversation_id);
    if (!samtale) continue; // ukendt samtale: kan ikke dømmes (demo eller ej)
    if (samtale.company_id && demo.has(samtale.company_id)) continue;
    const liste = prSamtale.get(b.conversation_id) ?? [];
    liste.push(b);
    prSamtale.set(b.conversation_id, liste);
  }

  const ud: Ventetid[] = [];
  for (const [samtaleId, liste] of prSamtale) {
    liste.sort(tidOgId);
    const samtale = samtaleAf.get(samtaleId)!;
    let aaben: SvartidBesked | null = null;
    for (const b of liste) {
      if (!raadgivere.has(b.sender_id)) {
        if (!aaben) aaben = b; // første medlemsbesked efter sidste svar
        continue;
      }
      if (aaben) {
        const stillet = new Date(aaben.created_at);
        const svaretAt = new Date(b.created_at);
        ud.push({
          id: aaben.id,
          samtaleId,
          companyId: samtale.company_id,
          stillet,
          svaretAt,
          status: "besvaret",
          raaTimer: (svaretAt.getTime() - stillet.getTime()) / TIME_MS,
          hverdagstimer: hverdagstimerMellem(stillet, svaretAt),
        });
        aaben = null;
      }
    }
    if (aaben) {
      const stillet = new Date(aaben.created_at);
      const venter = samtale.awaiting_reply_from === "advisor";
      ud.push({
        id: aaben.id,
        samtaleId,
        companyId: samtale.company_id,
        stillet,
        svaretAt: null,
        status: venter ? "venter" : "afgjort_uden_svar",
        raaTimer: venter ? Math.max(0, (input.nu.getTime() - stillet.getTime()) / TIME_MS) : null,
        hverdagstimer: venter ? hverdagstimerMellem(stillet, input.nu) : null,
      });
    }
  }
  return ud.sort((a, b) => a.stillet.getTime() - b.stillet.getTime() || (a.id < b.id ? -1 : 1));
}

export type Tone = "groen" | "gul" | "roed" | "neutral";

export interface SvartidTal {
  /** Besvarede ventetider i vinduet. */
  n: number;
  /** n < MIN_N: tallene er ikke tal. */
  forFaa: boolean;
  medianHverdagstimer: number | null;
  gennemsnitHverdagstimer: number | null;
  medianRaaTimer: number | null;
  gennemsnitRaaTimer: number | null;
  /** Andel (0–1) inden for 4 / 24 hverdagstimer; null uden afgjorte. */
  andelInden4t: number | null;
  andelInden24t: number | null;
  /** Nævnerne bag de to andele. */
  afgjorte4t: number;
  afgjorte24t: number;
}

/**
 * Tallene for ventetider stillet i (slut − dage, slut], hvor slut = nu −
 * forskydDage. forskydDage = 7 giver «de 7 dage før de seneste 7».
 */
export function svartidTal(alle: readonly Ventetid[], nu: Date, dage: number, forskydDage = 0): SvartidTal {
  const slut = nu.getTime() - forskydDage * DOEGN_MS;
  const fra = slut - dage * DOEGN_MS;
  const iVindue = alle.filter((v) => v.stillet.getTime() > fra && v.stillet.getTime() <= slut);
  const besvarede = iVindue.filter((v) => v.status === "besvaret");
  const ventende = iVindue.filter((v) => v.status === "venter");

  const hv = besvarede.map((v) => v.hverdagstimer as number);
  const raa = besvarede.map((v) => v.raaTimer as number);
  const andel = (graense: number) => {
    const inden = hv.filter((t) => t <= graense).length;
    const tabt = ventende.filter((v) => (v.hverdagstimer as number) > graense).length;
    const afgjorte = hv.length + tabt;
    return { andel: afgjorte === 0 ? null : inden / afgjorte, afgjorte };
  };
  const a4 = andel(GROEN_TIMER);
  const a24 = andel(GUL_TIMER);
  const n = besvarede.length;
  return {
    n,
    forFaa: n < MIN_N,
    medianHverdagstimer: median(hv),
    gennemsnitHverdagstimer: gennemsnit(hv),
    medianRaaTimer: median(raa),
    gennemsnitRaaTimer: gennemsnit(raa),
    andelInden4t: a4.andel,
    andelInden24t: a24.andel,
    afgjorte4t: a4.afgjorte,
    afgjorte24t: a24.afgjorte,
  };
}

/** Farven på medianen: ≤ 4 t grøn, ≤ 24 t gul, > 24 t rød (hverdagstimer); for få = neutral. */
export function toneAf(tal: Pick<SvartidTal, "medianHverdagstimer" | "forFaa">): Tone {
  if (tal.forFaa || tal.medianHverdagstimer === null) return "neutral";
  if (tal.medianHverdagstimer <= GROEN_TIMER) return "groen";
  if (tal.medianHverdagstimer <= GUL_TIMER) return "gul";
  return "roed";
}

export interface Trend {
  /** Median 7 dage − median de 7 dage før, i hverdagstimer. Negativ = hurtigere. */
  forskel: number;
  retning: "hurtigere" | "langsommere" | "uaendret";
}

/** Trenden mod forrige 7 dage; null når en af ugerne har for få svar. */
export function trendAf(uge: SvartidTal, ugenFoer: SvartidTal): Trend | null {
  if (uge.forFaa || ugenFoer.forFaa || uge.medianHverdagstimer === null || ugenFoer.medianHverdagstimer === null) return null;
  const forskel = uge.medianHverdagstimer - ugenFoer.medianHverdagstimer;
  // «Uændret» = de to medianer VISES ens (timerTekst runder: minutter under 1 t, 0,1 t under 10 t).
  const ens = timerTekst(uge.medianHverdagstimer) === timerTekst(ugenFoer.medianHverdagstimer);
  const retning = ens ? "uaendret" : forskel < 0 ? "hurtigere" : "langsommere";
  return { forskel, retning };
}

export interface Streak {
  /** Dage i træk uden en ubesvaret besked over 24 hverdagstimer. */
  dage: number;
  /** Streaken nåede vinduets start: den er MINDST så lang. */
  mindst: boolean;
  /** Noget venter over 24 hverdagstimer lige nu. */
  brudtNu: boolean;
}

/** Streaken «Intet venter» (se filhovedet). */
export function intetVenterStreak(alle: readonly Ventetid[], nu: Date, maksDage = MAANED_DAGE): Streak {
  const brud = alle
    .filter((v) => v.status !== "afgjort_uden_svar")
    .map((v) => ({ fra: efterHverdagstimer(v.stillet, STREAK_GRAENSE_TIMER).getTime(), til: (v.svaretAt ?? nu).getTime() }))
    .filter((i) => i.til > i.fra);
  const brudtNu = alle.some((v) => v.status === "venter" && (v.hverdagstimer as number) > STREAK_GRAENSE_TIMER);

  const idag = kbhDato(nu);
  let dage = 0;
  for (let i = 0; i < maksDage; i++) {
    const dato = laegDageTilDato(idag, -i);
    const start = kbhTilUtc(dato).getTime();
    const slut = Math.min(kbhTilUtc(laegDageTilDato(dato, 1)).getTime(), nu.getTime());
    if (brud.some((b) => b.fra < slut && b.til > start)) return { dage, mindst: false, brudtNu };
    dage++;
  }
  return { dage, mindst: true, brudtNu };
}

export interface AeldsteUbesvarede {
  ventetidId: string;
  samtaleId: string;
  companyId: string | null;
  navn: string | null;
  stillet: Date;
  hverdagstimer: number;
  raaTimer: number;
}

export interface SvartidsUretDom {
  uge: SvartidTal;
  ugenFoer: SvartidTal;
  maaned: SvartidTal;
  tone: Tone;
  trend: Trend | null;
  antalVenter: number;
  aeldsteUbesvarede: AeldsteUbesvarede | null;
  streak: Streak;
}

/** Hele dommen for kortet — fælles teamtal, intet pr. rådgiver. */
export function svartidsUret(input: SvartidInput): SvartidsUretDom {
  const alle = findVentetider(input);
  const nu = input.nu;
  const navnAf = new Map(input.virksomheder.map((v) => [v.id, v.name]));
  const uge = svartidTal(alle, nu, UGE_DAGE);
  const ugenFoer = svartidTal(alle, nu, UGE_DAGE, UGE_DAGE);
  const ventende = alle.filter((v) => v.status === "venter");
  const aeldste = ventende[0] ?? null; // alle er sorteret efter stillet
  return {
    uge,
    ugenFoer,
    maaned: svartidTal(alle, nu, MAANED_DAGE),
    tone: toneAf(uge),
    trend: trendAf(uge, ugenFoer),
    antalVenter: ventende.length,
    aeldsteUbesvarede: aeldste
      ? {
          ventetidId: aeldste.id,
          samtaleId: aeldste.samtaleId,
          companyId: aeldste.companyId,
          navn: aeldste.companyId ? navnAf.get(aeldste.companyId) ?? null : null,
          stillet: aeldste.stillet,
          hverdagstimer: aeldste.hverdagstimer as number,
          raaTimer: aeldste.raaTimer as number,
        }
      : null,
    streak: intetVenterStreak(alle, nu),
  };
}

// ── Tekster ──────────────────────────────────────────────────────────────

export const URET_OVERSKRIFT = "Svartids-uret";

/** «45 min», «3,5 t», «12 t». */
export function timerTekst(t: number): string {
  if (t < 1) return `${Math.max(0, Math.round(t * 60))} min`;
  if (t < 10) return `${(Math.round(t * 10) / 10).toLocaleString("da-DK")} t`;
  return `${Math.round(t)} t`;
}

/** «78 %». */
export const procentTekst = (andel: number): string => `${Math.round(andel * 100)} %`;

export function trendTekst(t: Trend | null): string | null {
  if (!t) return null;
  if (t.retning === "uaendret") return "Uændret fra de 7 dage før";
  return `${timerTekst(Math.abs(t.forskel))} ${t.retning} end de 7 dage før`;
}

/** «7 dage: gns. 3,1 t · 80 % inden for 4 t · 95 % inden for 24 t» — eller «for få svar». */
export function vindueTekst(etiket: string, t: SvartidTal, medMedian: boolean): string {
  if (t.forFaa) return `${etiket}: for få svar (${t.n} af mindst ${MIN_N})`;
  const dele = [
    medMedian && t.medianHverdagstimer !== null ? `median ${timerTekst(t.medianHverdagstimer)}` : null,
    t.gennemsnitHverdagstimer !== null ? `gns. ${timerTekst(t.gennemsnitHverdagstimer)}` : null,
    t.andelInden4t !== null ? `${procentTekst(t.andelInden4t)} inden for ${GROEN_TIMER} t` : null,
    t.andelInden24t !== null ? `${procentTekst(t.andelInden24t)} inden for ${GUL_TIMER} t` : null,
    `${t.n} svar`,
  ].filter((d): d is string => d !== null);
  return `${etiket}: ${dele.join(" · ")}`;
}

/** «Floren Engros · 5 t». */
export const aeldsteTekst = (a: AeldsteUbesvarede): string => `${a.navn ?? "En samtale"} · ${timerTekst(a.hverdagstimer)}`;

export function streakTekst(s: Streak): string {
  if (s.brudtNu) return "Noget har ventet over 24 t — streaken starter igen, når det er besvaret.";
  if (s.dage === 0) return "Intet venter over 24 t lige nu — streaken begynder i morgen.";
  const dage = s.dage === 1 ? "1 dag" : `${s.dage} dage`;
  return `${s.mindst ? "Mindst " : ""}${dage} i træk uden noget, der har ventet over 24 t.`;
}

/** Link til chatten på virksomhedssiden (samme anker som forsidens «Svar …»-linjer). */
export const samtaleSti = (companyId: string): string => `/virksomhed/${companyId}?grund=venter_i_samtalen`;
