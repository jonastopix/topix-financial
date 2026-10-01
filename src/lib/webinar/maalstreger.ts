/**
 * MÅLSTREGERNE (udkast 1/10-2026) — de fire tal, marketingkonsulenten Nicklas
 * skrev, at «det styrer vi efter» (hans dokument 1/10, «mål ved start»):
 *
 *   Fremmøde på webinaret                       over 55 %
 *   Ansøgere blandt dem, der ser det færdigt    over 10 %
 *   Pris pr. ansøgning                          under 2.500 kr.
 *   Pris pr. nyt medlem                         under 15.000 kr.
 *
 * Hans egne tal (25/8 + 22/9): 469 tilmeldt · 189 mødte · 132 så færdigt
 * (≥ 75 %) · 6 ansøgte · 0 medlemmer. Tragten knækker EFTER webinaret.
 *
 * ÉN DOM, TO FLADER. Rådgiverens /webinar og den delte /delt/webinar tegner
 * det SAMME færdige svar: tal, ord og bar-positioner — aldrig en række, aldrig
 * en mail. Serveren (webinar-delt → bygDeltSvar) regner den med spejlet
 * supabase/functions/_shared/webinarMaalstreger.ts; kroppen efter filhovedet
 * er ordret ens på nær import-stierne, låst af
 * src/lib/__tests__/webinarDashboard.paritet.test.ts.
 *
 * DEFINITIONERNE — genbrugt, ikke opfundet (fil:linje er dashboard.ts og
 * annoncepriser.ts, som de stod 1/10):
 *
 *   1. FREMMØDE = mødte op / tilmeldte over ALLE AFHOLDTE sessioner.
 *      Samme tal som tragtens to første led og «I alt» under «Afholdt»:
 *      `taelDeltagelse` på de afholdte rækker (dashboard.ts `tragt` og
 *      `webinarDashboard` → `samlet`). Personer, bedste grad pr. mail.
 *      Nævneren er tilmeldte − kommende (som `afholdtGrundlag` i sporet).
 *   2. ANSØGERE BLANDT SÅ-FÆRDIGT = personer, der har «set» (webinarDom ≥ 75 %)
 *      på en afholdt session OG har en indsendt ansøgning EFTER deres første
 *      afholdte session / personer, der har «set». Grænsen i tid er TRAGTENS
 *      (dashboard.ts `tragt`: `foersteSession` + `faellesEfter`, skarpt `>`;
 *      uden sessionstid — Replay — tælles enhver indsendelse). Koblingen er
 *      mailen ELLER den rådgiverbekræftede webinarkobling (`medWebinarKobling`).
 *   3. PRIS PR. ANSØGNING = annonceprisernes «I alt»-linje,
 *      `samlet.prPrAnsoegning` (annoncepriser.ts `byggLinje` + `samlet`):
 *      forbruget i vinduet / personer, hvis FØRSTE tilmelding faldt i vinduet,
 *      og som har en indsendt ansøgning (mail eller kobling). Vinduet er
 *      «Hele perioden» (`valg: "daekning"`) — præcis den periode, forbruget
 *      dækker, så tæller og nævner dækker samme dage (`afkort`, §5).
 *   4. PRIS PR. NYT MEDLEM = samme linje, `samlet.prPrMedlem`: samme forbrug /
 *      personer i vinduet, der BLEV MEDLEM (husets `blevMedlem`: underskrevet
 *      OG betalt — ikke «underskrevet» alene).
 *
 * VINDUET STÅR FAST PÅ «HELE PERIODEN». Prisafsnittets periodevælger flytter
 * IKKE målstregerne: målene er Nicklas' styretal for hele forløbet, og en
 * målstreg, der skifter med en knap længere nede, er to tal for ét mål. Den
 * delte side regner samme vindue, uanset hvilket `valg` den eksterne har.
 *
 * DOMMEN.
 *   · Procentmål: Wilson 95 % (lag 6's `wilson`/`intervalOrd`). «Over målet»
 *     KUN når hele intervallet ligger over (nedre > mål); «under målet» KUN når
 *     hele ligger under (øvre < mål); ellers «kan ikke afgøres». Under
 *     SPOR_FORHOLD_FRA (5) ERSTATTER «for få» procenten — intervallet regnes
 *     ikke, og dommen er «kan ikke afgøres».
 *   · Kronemål: et tal, intet interval. Under TROVAERDIG_FRA (5) personer
 *     sættes INGEN pris — «for få» i stedet (husets regel, skærpet her: prisens
 *     egen «tynd» viser stadig tallet). Mål er «UNDER x kr.», så pris < mål =
 *     «under målet» (nået), pris ≥ mål = «over målet» (ikke nået).
 *   · «Ingen data»: ingen afholdt session, intet forbrug hentet, et vindue uden
 *     dækning, eller forbrug i en anden valuta end DKK (et kronemål kan ikke
 *     holdes op mod euro).
 *
 * MODNING (skrevet ved tallet, ikke kun her): et medlem tager uger gennem
 * samtale, aftale og betaling, og en ansøgning kommer dage efter webinaret.
 * Led 2 og 4 er derfor for lave lige efter en session — ikke fordi den var
 * dårlig, men fordi udfaldet ikke er nået frem endnu.
 */
import { SPOR_FORHOLD_FRA, ansoegerTider, medWebinarKobling, taelDeltagelse, type AnsoegerMail, type Tilmelding } from "@/lib/webinar/dashboard";
import { annoncepriser, periodeOrd, TROVAERDIG_FRA, type Annoncenavn, type Annoncepriser, type Forbrugsdag, type Forbrugstilstand } from "@/lib/webinar/annoncepriser";
import { doemSetGrad } from "@/lib/webinarDom";
import { intervalOrd, wilson } from "@/lib/marketing/statistik";

// ── Målene — ÉT sted ───────────────────────────────────────────────────────

/** Hvem der satte målene, og hvornår. Står på fladen ved overskriften. */
export const MAAL_KILDE = "Nicklas, 1/10";

/**
 * Nicklas' fire mål (marketingkonsulenten, dokumentet «Det styrer vi efter —
 * mål ved start», 1/10-2026). Andele som 0–1, beløb i ØRE (som forbruget).
 * Ændres et mål, ændres det HER og intet andet sted.
 */
export const MAAL_FREMMOEDE = 0.55;
export const MAAL_ANSOEGERE_BLANDT_SET = 0.1;
/** 2.500 kr. = 250.000 øre. */
export const MAAL_PRIS_PR_ANSOEGNING_OERE = 250_000;
/** 15.000 kr. = 1.500.000 øre. */
export const MAAL_PRIS_PR_MEDLEM_OERE = 1_500_000;

/** Den eneste valuta, et kronemål kan holdes op mod. */
export const MAAL_VALUTA = "DKK";

// ── Formen ─────────────────────────────────────────────────────────────────

export type MaalNoegle = "fremmoede" | "ansoegere_blandt_set" | "pris_pr_ansoegning" | "pris_pr_medlem";

/** Er der et tal? «for få» og «ingen data» ERSTATTER tallet — de er ikke et tal. */
export type MaalVaerdi = "maalt" | "for_faa" | "ingen_data";

export type MaalUdfald = "over_maalet" | "under_maalet" | "kan_ikke_afgoeres";

/**
 * Barens positioner, 0–1 af barens bredde — regnet HER, så fladen kun tegner.
 * `vaerdi` null = intet tal at tegne (for få / ingen data); `fra`/`til` er
 * Wilson-intervallets ender (null for kronemål og under grænsen); `maal` er
 * målstregen og står altid.
 */
export interface MaalBar {
  vaerdi: number | null;
  fra: number | null;
  til: number | null;
  maal: number;
}

export interface Maallinje {
  noegle: MaalNoegle;
  /** «Fremmøde på webinaret». */
  navn: string;
  /** «over 55 %» · «under 2.500 kr.». */
  maalOrd: string;
  vaerdi: MaalVaerdi;
  /** Det, der skal STÅ: «40 % (36–45 %) af 469» · «3.120 kr. af 7 ansøgninger» · «for få» · «ingen data». */
  vaerdiOrd: string;
  udfald: MaalUdfald;
  /** «over målet» · «under målet» · «kan ikke afgøres». */
  udfaldOrd: string;
  /** Er målet NÅET? Procentmål: over; kronemål: under. null = kan ikke afgøres. */
  naaet: boolean | null;
  /** Tælleren: personer (procent) eller øre (kroner). */
  taeller: number;
  /** Nævneren: personer — i begge slags mål. */
  naevner: number;
  /** Hvad tallet er regnet på — til title og skærmlæser. */
  forklaring: string;
  bar: MaalBar;
}

export interface Maalstreger {
  /** «Nicklas, 1/10». */
  kilde: string;
  /** Altid fire, i Nicklas' rækkefølge. */
  linjer: Maallinje[];
  /** Prisernes vindue i ord — «12.–30. september» — eller null uden forbrug. */
  prisvindueOrd: string | null;
}

// ── Ordene ─────────────────────────────────────────────────────────────────

export const MAAL_EYEBROW = "Målene";
export const MAAL_TITEL = `Det styrer vi efter (${MAAL_KILDE})`;
export const MAAL_FOR_FAA_ORD = "for få";
export const MAAL_INGEN_DATA_ORD = "ingen data";
export const MAAL_UDFALD_ORD: Record<MaalUdfald, string> = {
  over_maalet: "over målet",
  under_maalet: "under målet",
  kan_ikke_afgoeres: "kan ikke afgøres",
};

/** «2.500» — tusindtalspunktum, hele kroner. Skrevet her, så spejlet er uden fladens formattering. */
export function kroner(oere: number): string {
  const k = Math.round(oere / 100);
  return String(k).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** «55 %» af et mål (0–1). Målene er hele procenter. */
const maalPct = (a: number): string => `${Math.round(a * 100)} %`;

/** Ental og flertal: «1 ansøgning» · «7 ansøgninger». */
const flertal = (n: number, ental: string, flere: string): string => `${n} ${n === 1 ? ental : flere}`;

// ── Hjælpere ───────────────────────────────────────────────────────────────

const tid = (iso: string | null | undefined): number | null => {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** En session er AFHOLDT, når den er begyndt — eller ikke har noget tidspunkt (Replay). Samme regel som tragten. */
const erAfholdt = (r: Tilmelding, nu: Date): boolean => {
  const t = tid(r.session_tid);
  return t === null || t <= nu.getTime();
};

/** Position 0–1 på en skala; aldrig uden for baren. */
const position = (v: number, skala: number): number => (skala <= 0 ? 0 : Math.max(0, Math.min(1, v / skala)));

// ── Procentmålet ───────────────────────────────────────────────────────────

/**
 * Dommen over en andel mod et «over x %»-mål. Regnestykket:
 *   n < SPOR_FORHOLD_FRA             → for få, kan ikke afgøres
 *   i = wilson(succes, n)
 *   i.nedre > mål                    → over målet (nået)
 *   i.oevre < mål                    → under målet (ikke nået)
 *   ellers                           → kan ikke afgøres (intervallet rummer målet)
 * Skalaen: mindst det dobbelte af målet (så målstregen står midt på baren),
 * højst 100 %, og altid stor nok til intervallets øvre ende.
 */
export function procentmaal(
  noegle: MaalNoegle,
  navn: string,
  succes: number,
  n: number,
  maal: number,
  forklaring: string,
): Maallinje {
  const s = Math.max(0, Math.floor(succes));
  const antal = Math.max(0, Math.floor(n));
  const maalOrd = `over ${maalPct(maal)}`;
  const faelles = { noegle, navn, maalOrd, taeller: s, naevner: antal, forklaring };
  if (antal === 0) {
    return { ...faelles, vaerdi: "ingen_data", vaerdiOrd: MAAL_INGEN_DATA_ORD, udfald: "kan_ikke_afgoeres", udfaldOrd: MAAL_UDFALD_ORD.kan_ikke_afgoeres, naaet: null, bar: { vaerdi: null, fra: null, til: null, maal: position(maal, Math.min(1, 2 * maal)) } };
  }
  if (antal < SPOR_FORHOLD_FRA) {
    return { ...faelles, vaerdi: "for_faa", vaerdiOrd: MAAL_FOR_FAA_ORD, udfald: "kan_ikke_afgoeres", udfaldOrd: MAAL_UDFALD_ORD.kan_ikke_afgoeres, naaet: null, bar: { vaerdi: null, fra: null, til: null, maal: position(maal, Math.min(1, 2 * maal)) } };
  }
  const i = wilson(s, antal);
  if (i === null) {
    return { ...faelles, vaerdi: "ingen_data", vaerdiOrd: MAAL_INGEN_DATA_ORD, udfald: "kan_ikke_afgoeres", udfaldOrd: MAAL_UDFALD_ORD.kan_ikke_afgoeres, naaet: null, bar: { vaerdi: null, fra: null, til: null, maal: position(maal, Math.min(1, 2 * maal)) } };
  }
  const udfald: MaalUdfald = i.nedre > maal ? "over_maalet" : i.oevre < maal ? "under_maalet" : "kan_ikke_afgoeres";
  const skala = Math.min(1, Math.max(2 * maal, i.oevre));
  return {
    ...faelles,
    vaerdi: "maalt",
    vaerdiOrd: `${intervalOrd(i)} af ${antal}`,
    udfald,
    udfaldOrd: MAAL_UDFALD_ORD[udfald],
    naaet: udfald === "kan_ikke_afgoeres" ? null : udfald === "over_maalet",
    bar: { vaerdi: position(i.andel, skala), fra: position(i.nedre, skala), til: position(i.oevre, skala), maal: position(maal, skala) },
  };
}

// ── Kronemålet ─────────────────────────────────────────────────────────────

/**
 * Dommen over en pris mod et «under x kr.»-mål. Regnestykket:
 *   intet forbrug / udækket / anden valuta  → ingen data
 *   antal < TROVAERDIG_FRA                  → for få (INGEN pris), kan ikke afgøres
 *   pris = round(forbrug / antal)           (annoncepriser.ts `pris`)
 *   pris < mål                              → under målet (nået)
 *   pris ≥ mål                              → over målet (ikke nået)
 * Skalaen: mindst det dobbelte af målet, ellers prisen selv.
 */
export function kronemaal(
  noegle: MaalNoegle,
  navn: string,
  forbrugOere: number,
  antal: number,
  maalOere: number,
  enhedEntal: string,
  enhedFlertal: string,
  harData: boolean,
  forklaring: string,
): Maallinje {
  const f = Number.isFinite(forbrugOere) && forbrugOere > 0 ? Math.round(forbrugOere) : 0;
  const n = Number.isFinite(antal) && antal > 0 ? Math.floor(antal) : 0;
  const maalOrd = `under ${kroner(maalOere)} kr.`;
  const faelles = { noegle, navn, maalOrd, taeller: f, naevner: n, forklaring };
  const tomBar: MaalBar = { vaerdi: null, fra: null, til: null, maal: position(maalOere, 2 * maalOere) };
  if (!harData) {
    return { ...faelles, vaerdi: "ingen_data", vaerdiOrd: MAAL_INGEN_DATA_ORD, udfald: "kan_ikke_afgoeres", udfaldOrd: MAAL_UDFALD_ORD.kan_ikke_afgoeres, naaet: null, bar: tomBar };
  }
  if (n < TROVAERDIG_FRA) {
    return { ...faelles, vaerdi: "for_faa", vaerdiOrd: MAAL_FOR_FAA_ORD, udfald: "kan_ikke_afgoeres", udfaldOrd: MAAL_UDFALD_ORD.kan_ikke_afgoeres, naaet: null, bar: tomBar };
  }
  const prisOere = Math.round(f / n);
  const udfald: MaalUdfald = prisOere < maalOere ? "under_maalet" : "over_maalet";
  const skala = Math.max(2 * maalOere, prisOere);
  return {
    ...faelles,
    vaerdi: "maalt",
    vaerdiOrd: `${kroner(prisOere)} kr. af ${flertal(n, enhedEntal, enhedFlertal)}`,
    udfald,
    udfaldOrd: MAAL_UDFALD_ORD[udfald],
    naaet: udfald === "under_maalet",
    bar: { vaerdi: position(prisOere, skala), fra: null, til: null, maal: position(maalOere, skala) },
  };
}

// ── Tællingerne ────────────────────────────────────────────────────────────

/**
 * Led 1 og 2 af de AFHOLDTE rækker. Personer (unikke mails), som tragten.
 *   fremmoede: moedteOp / (tilmeldte − kommende)        — taelDeltagelse
 *   set:       personer med mindst én afholdt række dømt «set» (doemSetGrad);
 *              «set» er den højeste grad, så det er samme person som
 *              taelDeltagelse's saaFaerdigt.
 *   ansoegte:  af dem: indsendt > personens FØRSTE afholdte session (tragtens
 *              grænse, skarpt), eller enhver indsendelse uden sessionstid.
 */
export function maalTaelling(
  tilmeldinger: readonly Tilmelding[],
  ansoegninger: readonly AnsoegerMail[],
  nu: Date,
): { moedteOp: number; grundlag: number; set: number; setDerAnsoegte: number } {
  const afholdt = tilmeldinger.filter((r) => erAfholdt(r, nu));
  const d = taelDeltagelse(afholdt, nu);
  const sete = new Set<string>();
  const foersteSession = new Map<string, number>();
  for (const r of afholdt) {
    if (doemSetGrad(r, nu) === "set") sete.add(r.email);
    const t = tid(r.session_tid);
    if (t === null) continue;
    const haves = foersteSession.get(r.email);
    if (haves === undefined || t < haves) foersteSession.set(r.email, t);
  }
  const tider = ansoegerTider(medWebinarKobling(ansoegninger));
  let setDerAnsoegte = 0;
  for (const mail of sete) {
    const t = tider.get(mail);
    if (t === undefined) continue;
    const g = foersteSession.get(mail);
    if (g === undefined || t > g) setDerAnsoegte++;
  }
  return { moedteOp: d.moedteOp, grundlag: Math.max(0, d.tilmeldte - d.kommende), set: d.saaFaerdigt, setDerAnsoegte };
}

// ── Hele dommen ────────────────────────────────────────────────────────────

/** Forbruget, som målstregerne læser det — samme felter som annoncepriser tager. null = ikke hentet. */
export interface MaalForbrug {
  dage: readonly Forbrugsdag[];
  annoncer: readonly Annoncenavn[];
  tilstand: Forbrugstilstand;
  hentetTil: string | null;
}

export interface MaalstregerInput {
  tilmeldinger: readonly Tilmelding[];
  ansoegninger: readonly AnsoegerMail[];
  forbrug: MaalForbrug | null;
}

/** Kan prisernes «I alt» holdes op mod et kronemål? Forbrug, dækket vindue og kun kroner. */
function prisHarData(p: Annoncepriser | null): boolean {
  if (p === null || p.tilstand !== "har" || !p.daekket || !p.harForbrug) return false;
  const v = p.samlet.valutaer;
  return v.length === 1 && v[0].toUpperCase() === MAAL_VALUTA;
}

/** Ét kald, ét svar — fire linjer i Nicklas' rækkefølge. Fladen regner intet. */
export function maalstreger(ind: MaalstregerInput, nu: Date): Maalstreger {
  const t = maalTaelling(ind.tilmeldinger, ind.ansoegninger, nu);
  // VINDUET STÅR FAST: «Hele perioden» — se filhovedet.
  const priser = ind.forbrug === null
    ? null
    : annoncepriser({ tilmeldinger: ind.tilmeldinger, ansoegninger: ind.ansoegninger, dage: ind.forbrug.dage, annoncer: ind.forbrug.annoncer, tilstand: ind.forbrug.tilstand, valg: "daekning", hentetTil: ind.forbrug.hentetTil }, nu);
  const harData = prisHarData(priser);
  const vindueOrd = priser === null ? null : periodeOrd(priser.vindue);
  const forbrug = priser?.samlet.forbrugOere ?? 0;
  const iVinduet = vindueOrd === null ? "uden et vindue med forbrug" : `over ${vindueOrd}`;
  return {
    kilde: MAAL_KILDE,
    prisvindueOrd: vindueOrd,
    linjer: [
      procentmaal(
        "fremmoede", "Fremmøde på webinaret", t.moedteOp, t.grundlag, MAAL_FREMMOEDE,
        `${t.moedteOp} af ${t.grundlag} tilmeldte til et AFHOLDT webinar mødte op (personer, ikke tilmeldinger). Wilson 95 %; under ${SPOR_FORHOLD_FRA} står «for få».`,
      ),
      procentmaal(
        "ansoegere_blandt_set", "Ansøgere blandt dem, der så det færdigt", t.setDerAnsoegte, t.set, MAAL_ANSOEGERE_BLANDT_SET,
        `${t.setDerAnsoegte} af ${t.set}, der så det færdigt, har indsendt en ansøgning EFTER deres første afholdte webinar (mailen eller en bekræftet kobling). Ansøgninger kommer dage efter — tallet er lavt lige efter en session.`,
      ),
      kronemaal(
        "pris_pr_ansoegning", "Pris pr. ansøgning", forbrug, priser?.samlet.ansoegte ?? 0, MAAL_PRIS_PR_ANSOEGNING_OERE,
        "ansøgning", "ansøgninger", harData,
        `${kroner(forbrug)} kr. brugt ${iVinduet} / ${priser?.samlet.ansoegte ?? 0} ansøgere blandt dem, hvis første tilmelding faldt i samme vindue. Under ${TROVAERDIG_FRA} sættes ingen pris.`,
      ),
      kronemaal(
        "pris_pr_medlem", "Pris pr. nyt medlem", forbrug, priser?.samlet.medlemmer ?? 0, MAAL_PRIS_PR_MEDLEM_OERE,
        "medlem", "medlemmer", harData,
        `${kroner(forbrug)} kr. brugt ${iVinduet} / ${priser?.samlet.medlemmer ?? 0} nye medlemmer (underskrevet OG betalt) blandt dem, hvis første tilmelding faldt i samme vindue. Et medlem tager uger — tallet modnes sidst. Under ${TROVAERDIG_FRA} sættes ingen pris.`,
      ),
    ],
  };
}
