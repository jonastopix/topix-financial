/**
 * MÅLSTREGERNE (udkast 1/10-2026) — VORES fire mål (Jonas 1/10 kl. 20:13:
 * «Hvis vi har nogen mål, så er det VORES mål»):
 *
 *   Fremmøde på webinaret                       over 55 %
 *   Ansøgere blandt dem, der ser det færdigt    over 10 %
 *   Pris pr. ansøgning                          under 2.500 kr.
 *   Pris pr. nyt medlem                         under 7.500 kr. (= 3 × 2.500)
 *
 * Tallene ved start (25/8 + 22/9): 469 tilmeldt · 189 mødte · 132 så færdigt
 * (≥ 75 %) · 6 ansøgte · 0 medlemmer. Tragten knækker EFTER webinaret.
 *
 * ÉN DOM, TO FLADER. Rådgiverens /webinar og den delte /delt/webinar tegner
 * det SAMME færdige svar: tal, ord og bar-positioner — aldrig en række, aldrig
 * en mail. Serveren (webinar-delt → bygDeltSvar) regner den med spejlet
 * supabase/functions/_shared/webinarMaalstreger.ts; kroppen efter filhovedet
 * er ordret ens på nær import-stierne, låst af
 * src/lib/__tests__/webinarDashboard.paritet.test.ts.
 *
 * DEFINITIONERNE — genbrugt, ikke opfundet (dashboard.ts og annoncepriser.ts,
 * som de stod 1/10; rettet efter det tekniske råds fund samme dag):
 *
 *   1. FREMMØDE = mødte op / tilmeldte over ALLE AFHOLDTE sessioner.
 *      Samme tal som tragtens to første led og «I alt» under «Afholdt»:
 *      `taelDeltagelse` på de afholdte rækker (dashboard.ts `tragt`).
 *      Personer, bedste grad pr. mail. NÆVNEREN er `tilmeldte` på de afholdte
 *      rækker (K13): rækkerne er filtreret til afholdte FØR tællingen, så
 *      `kommende` er altid 0 her, og «tilmeldte − kommende» er blot
 *      `tilmeldte`. En Replay-række uden `state` og uden procent dømmes
 *      «ukendt» af webinarDom og tæller derfor i nævneren, men ikke i
 *      tælleren — som en udebleven, PRÆCIS som tragten tæller den.
 *   2. ANSØGERE BLANDT SÅ-FÆRDIGT = personer, der har «set» (webinarDom ≥ 75 %)
 *      på en afholdt session OG har en indsendt ansøgning EFTER deres FØRSTE
 *      «SET»-SESSION (K8 — ikke deres første afholdte: en, der udeblev 25/8,
 *      så det 22/9 og ansøgte 23/9, tæller; ansøgte hun 1/9, tæller hun ikke)
 *      / personer, der har «set». Grænsen er tragtens FORM (`faellesEfter`:
 *      skarpt `>`; har ingen af personens «set»-rækker et tidspunkt — Replay —
 *      tælles enhver indsendelse). Koblingen er mailen ELLER den
 *      rådgiverbekræftede webinarkobling (`medWebinarKobling`).
 *   3. PRIS PR. ANSØGNING = forbruget i vinduet / ansøgere blandt personer,
 *      hvis FØRSTE tilmelding faldt i vinduet. FORBRUGET er annonceprisernes
 *      «I alt» (`samlet.forbrugOere`, vinduet `valg: "daekning"`). TÆLLEREN
 *      er målstregernes EGEN (R1, `prisTaelling`): annonceprisernes
 *      `samlet.ansoegte` har ingen grænse i tid, så en gammel ansøger eller et
 *      eksisterende medlem, der meldte sig til et webinar i vinduet, gjorde
 *      prisen for lav. Her tæller en ansøgning KUN, når den er indsendt
 *      SKARPT EFTER personens første tilmelding (`registreret_at`):
 *        Anna: første tilmelding 10/9 09:00 (i vinduet), indsendt 23/9 → tæller.
 *        Bo:   første tilmelding 12/9, seneste indsendelse 1/9 (en gammel
 *              ansøger / et eksisterende medlem)                → tæller ikke.
 *        Cia:  første tilmelding og indsendelse i samme sekund  → tæller ikke.
 *      Indsendelsen er `ansoegerTider` (den SENESTE pr. mail). Annonceprisernes
 *      egen definition er urørt — prisafsnittet viser stadig sin.
 *   4. PRIS PR. NYT MEDLEM = samme forbrug / personer i vinduet, der BLEV
 *      MEDLEM (husets `blevMedlem`: underskrevet OG betalt) med samme grænse.
 *      Tidspunktet er `medlemsTider`: ANSØGNINGENS indsendelse, ikke
 *      underskriftens — underskriften har intet tidspunkt i det, fladen henter,
 *      og den ligger altid efter indsendelsen. Spørgsmålet er det samme: kom
 *      medlemskabet af en ansøgning, hun sendte EFTER sin første tilmelding?
 *
 * VINDUET STÅR FAST PÅ «HELE PERIODEN». Prisafsnittets periodevælger flytter
 * IKKE målstregerne: målene er vores styretal for hele forløbet, og en
 * målstreg, der skifter med en knap længere nede, er to tal for ét mål. Den
 * delte side regner samme vindue, uanset hvilket `valg` den eksterne har.
 *
 * DOMMEN (R2): ét ord pr. linje, `naaet` → «nået» · «ikke nået» · «kan ikke
 * afgøres» — for alle fire, procent og kroner.
 *   · Procentmål: Wilson 95 % (lag 6's `wilson`/`intervalOrd`). «Nået» KUN
 *     når hele intervallet ligger over (nedre > mål); «ikke nået» KUN når hele
 *     ligger under (øvre < mål); ellers «kan ikke afgøres». Under
 *     SPOR_FORHOLD_FRA (5) ERSTATTER «for få» procenten.
 *   · Kronemål: et tal, intet interval. Under TROVAERDIG_FRA (5) personer
 *     sættes INGEN pris — «for få» i stedet; med NUL og et forbrug står
 *     «0 medlemmer for N kr.» (B6) — begge «kan ikke afgøres». Dommen falder
 *     på det VISTE heltal i kroner (K9): målet er «UNDER x kr.», så viste kr.
 *     < mål = nået, og viste kr. = mål (også 2.499,60 kr., som står som
 *     «2.500 kr.») = ikke nået.
 *   · «Ingen data»: ingen afholdt session, intet forbrug hentet, et vindue uden
 *     dækning, eller forbrug i en anden valuta end DKK (et kronemål kan ikke
 *     holdes op mod euro).
 *
 * GRUNDLAGET (B7): hver linje bærer `grundlagOrd` — hvad tallet er regnet på,
 * i ord («alle afholdte webinarer 25/8–30/9» · «annoncevinduet 12.–30.
 * september»). Dommen skriver det; fladen (også den delte) skriver det af.
 *
 * MODNING (skrevet ved tallet, ikke kun her): et medlem tager uger gennem
 * samtale, aftale og betaling, og en ansøgning kommer dage efter webinaret.
 * Led 2 og 4 er derfor for lave lige efter en session — ikke fordi den var
 * dårlig, men fordi udfaldet ikke er nået frem endnu.
 */
import { SPOR_FORHOLD_FRA, ansoegerTider, dagKey, datoKort, erInternTilmelding, medlemsTider, medWebinarKobling, taelDeltagelse, type AnsoegerMail, type Tilmelding } from "@/lib/webinar/dashboard";
import { annoncepriser, iVindue, periodeOrd, TROVAERDIG_FRA, type Annoncenavn, type Annoncepriser, type Forbrugsdag, type Forbrugstilstand, type Vindue } from "@/lib/webinar/annoncepriser";
import { doemSetGrad } from "@/lib/webinarDom";
import { intervalOrd, wilson } from "@/lib/marketing/statistik";

// ── Målene — ÉT sted ───────────────────────────────────────────────────────

/**
 * VORES fire mål (1/10-2026; rettet af Jonas 1/10 kl. 20:13: «Hvis vi har nogen
 * mål, så er det VORES mål» — ingen persons navn på målene). Andele som 0–1,
 * beløb i ØRE (som forbruget). Ændres et mål, ændres det HER og intet andet sted.
 */
export const MAAL_FREMMOEDE = 0.55;
export const MAAL_ANSOEGERE_BLANDT_SET = 0.1;
/** 2.500 kr. = 250.000 øre. */
export const MAAL_PRIS_PR_ANSOEGNING_OERE = 250_000;
/**
 * 7.500 kr. = 750.000 øre (Jonas 1/10 kl. 20:13; var 15.000 kr.).
 * Regnestykket: 7.500 kr. = 3 × 2.500 kr. — vi lukker ca. hver tredje ansøger,
 * og målet pr. ansøgning er 2.500 kr. (MAAL_PRIS_PR_ANSOEGNING_OERE):
 * 3 × 250.000 øre = 750.000 øre.
 * Målet gælder ANNONCEKRONERNE alene. Bureauets faste fee (4.000 kr./md.) og
 * 8 % pr. medlem kommer OVENI og er IKKE regnet med i tallet.
 */
export const MAAL_PRIS_PR_MEDLEM_OERE = 750_000;

/** Den eneste valuta, et kronemål kan holdes op mod. */
export const MAAL_VALUTA = "DKK";

// ── Formen ─────────────────────────────────────────────────────────────────

export type MaalNoegle = "fremmoede" | "ansoegere_blandt_set" | "pris_pr_ansoegning" | "pris_pr_medlem";

/**
 * Er der et tal? «for få» og «ingen data» ERSTATTER tallet — de er ikke et tal.
 * «nul» (kun kronemål): nul tilfælde OG et forbrug — «0 medlemmer for N kr.»;
 * der er intet at dele med, så der står ingen pris, men forbruget står.
 */
export type MaalVaerdi = "maalt" | "nul" | "for_faa" | "ingen_data";

export type MaalUdfald = "naaet" | "ikke_naaet" | "kan_ikke_afgoeres";

/**
 * Barens positioner, 0–1 af barens bredde — regnet HER, så fladen kun tegner.
 * `vaerdi` null = intet tal at tegne (nul / for få / ingen data); `fra`/`til`
 * er Wilson-intervallets ender (null for kronemål og under grænsen); `maal` er
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
  /** Det, der skal STÅ: «40 % (36–45 %) af 469» · «3.120 kr. af 7 ansøgninger» · «0 medlemmer for 34.905 kr.» · «for få» · «ingen data». */
  vaerdiOrd: string;
  udfald: MaalUdfald;
  /** «nået» · «ikke nået» · «kan ikke afgøres». */
  udfaldOrd: string;
  /** Er målet NÅET? Procentmål: hele intervallet over; kronemål: viste kr. under. null = kan ikke afgøres. */
  naaet: boolean | null;
  /** Tælleren: personer (procent) eller øre (kroner). */
  taeller: number;
  /** Nævneren: personer — i begge slags mål. */
  naevner: number;
  /** Hvad tallet er regnet på, kort: «alle afholdte webinarer 25/8–30/9» · «annoncevinduet 12.–30. september». */
  grundlagOrd: string;
  /** Hvad tallet er regnet på — til title og skærmlæser. */
  forklaring: string;
  bar: MaalBar;
}

export interface Maalstreger {
  /** Altid fire, i samme rækkefølge: fremmøde · ansøgere · pris pr. ansøgning · pris pr. medlem. */
  linjer: Maallinje[];
  /** Prisernes vindue i ord — «12.–30. september» — eller null uden forbrug. */
  prisvindueOrd: string | null;
}

// ── Ordene ─────────────────────────────────────────────────────────────────

export const MAAL_EYEBROW = "Målene";
export const MAAL_TITEL = "Vores mål";
export const MAAL_FOR_FAA_ORD = "for få";
export const MAAL_INGEN_DATA_ORD = "ingen data";
/** R2: ét ord for alle fire mål — om målet er NÅET, ikke hvilken side af stregen tallet står. */
export const MAAL_UDFALD_ORD: Record<MaalUdfald, string> = {
  naaet: "nået",
  ikke_naaet: "ikke nået",
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

/** Udfaldet af `naaet` — ét sted, så ordet aldrig kan skilles fra dommen. */
const udfaldAf = (naaet: boolean | null): MaalUdfald => (naaet === null ? "kan_ikke_afgoeres" : naaet ? "naaet" : "ikke_naaet");

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
 *   n = 0                            → ingen data, kan ikke afgøres
 *   n < SPOR_FORHOLD_FRA             → for få, kan ikke afgøres
 *   i = wilson(succes, n)
 *   i.nedre > mål                    → nået
 *   i.oevre < mål                    → ikke nået
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
  grundlagOrd: string,
  forklaring: string,
): Maallinje {
  const s = Math.max(0, Math.floor(succes));
  const antal = Math.max(0, Math.floor(n));
  const maalOrd = `over ${maalPct(maal)}`;
  const faelles = { noegle, navn, maalOrd, taeller: s, naevner: antal, grundlagOrd, forklaring };
  const tomBar: MaalBar = { vaerdi: null, fra: null, til: null, maal: position(maal, Math.min(1, 2 * maal)) };
  const uden = (vaerdi: MaalVaerdi, vaerdiOrd: string): Maallinje =>
    ({ ...faelles, vaerdi, vaerdiOrd, udfald: "kan_ikke_afgoeres", udfaldOrd: MAAL_UDFALD_ORD.kan_ikke_afgoeres, naaet: null, bar: tomBar });
  if (antal === 0) return uden("ingen_data", MAAL_INGEN_DATA_ORD);
  if (antal < SPOR_FORHOLD_FRA) return uden("for_faa", MAAL_FOR_FAA_ORD);
  const i = wilson(s, antal);
  if (i === null) return uden("ingen_data", MAAL_INGEN_DATA_ORD);
  const naaet = i.nedre > maal ? true : i.oevre < maal ? false : null;
  const udfald = udfaldAf(naaet);
  const skala = Math.min(1, Math.max(2 * maal, i.oevre));
  return {
    ...faelles,
    vaerdi: "maalt",
    vaerdiOrd: `${intervalOrd(i)} af ${antal}`,
    udfald,
    udfaldOrd: MAAL_UDFALD_ORD[udfald],
    naaet,
    bar: { vaerdi: position(i.andel, skala), fra: position(i.nedre, skala), til: position(i.oevre, skala), maal: position(maal, skala) },
  };
}

// ── Kronemålet ─────────────────────────────────────────────────────────────

/**
 * Dommen over en pris mod et «under x kr.»-mål. Regnestykket:
 *   intet forbrug / udækket / anden valuta  → ingen data
 *   antal = 0 (og et forbrug)               → «0 medlemmer for N kr.», kan ikke afgøres (B6)
 *   antal < TROVAERDIG_FRA                  → for få (INGEN pris), kan ikke afgøres
 *   prisOere = round(forbrug / antal)       (annoncepriser.ts `pris`)
 *   visteKr  = round(prisOere / 100)        (det tal, `kroner` skriver)
 *   visteKr < mål/100                       → nået
 *   visteKr ≥ mål/100                       → ikke nået (K9: dommen falder på det
 *                                             VISTE tal — 249.960 øre står som
 *                                             «2.500 kr.» og er IKKE under 2.500)
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
  grundlagOrd: string,
  forklaring: string,
): Maallinje {
  const f = Number.isFinite(forbrugOere) && forbrugOere > 0 ? Math.round(forbrugOere) : 0;
  const n = Number.isFinite(antal) && antal > 0 ? Math.floor(antal) : 0;
  const maalOrd = `under ${kroner(maalOere)} kr.`;
  const faelles = { noegle, navn, maalOrd, taeller: f, naevner: n, grundlagOrd, forklaring };
  const tomBar: MaalBar = { vaerdi: null, fra: null, til: null, maal: position(maalOere, 2 * maalOere) };
  const uden = (vaerdi: MaalVaerdi, vaerdiOrd: string): Maallinje =>
    ({ ...faelles, vaerdi, vaerdiOrd, udfald: "kan_ikke_afgoeres", udfaldOrd: MAAL_UDFALD_ORD.kan_ikke_afgoeres, naaet: null, bar: tomBar });
  if (!harData) return uden("ingen_data", MAAL_INGEN_DATA_ORD);
  if (n === 0) return uden("nul", `0 ${enhedFlertal} for ${kroner(f)} kr.`);
  if (n < TROVAERDIG_FRA) return uden("for_faa", MAAL_FOR_FAA_ORD);
  const prisOere = Math.round(f / n);
  const visteKr = Math.round(prisOere / 100);
  const naaet = visteKr < maalOere / 100;
  const udfald = udfaldAf(naaet);
  const skala = Math.max(2 * maalOere, prisOere);
  return {
    ...faelles,
    vaerdi: "maalt",
    vaerdiOrd: `${kroner(prisOere)} kr. af ${flertal(n, enhedEntal, enhedFlertal)}`,
    udfald,
    udfaldOrd: MAAL_UDFALD_ORD[udfald],
    naaet,
    bar: { vaerdi: position(prisOere, skala), fra: null, til: null, maal: position(maalOere, skala) },
  };
}

// ── Tællingerne ────────────────────────────────────────────────────────────

/**
 * Led 1 og 2 af de AFHOLDTE rækker. Personer (unikke mails), som tragten.
 *   fremmoede: moedteOp / tilmeldte                       — taelDeltagelse på de
 *              afholdte (kommende er 0 her; Replay uden state/tid = «ukendt» =
 *              i nævneren, ikke i tælleren — som tragten).
 *   set:       personer med mindst én afholdt række dømt «set» (doemSetGrad);
 *              «set» er den højeste grad, så det er samme person som
 *              taelDeltagelse's saaFaerdigt.
 *   ansoegte:  af dem: indsendt > personens FØRSTE «SET»-SESSION (K8; tragtens
 *              form, skarpt), eller enhver indsendelse, når ingen af hendes
 *              «set»-rækker har et tidspunkt.
 *   sessioner: første og sidste afholdte sessionstid (til grundlaget) og om
 *              der er afholdte rækker uden tidspunkt (Replay).
 */
export function maalTaelling(
  tilmeldinger: readonly Tilmelding[],
  ansoegninger: readonly AnsoegerMail[],
  nu: Date,
): { moedteOp: number; grundlag: number; set: number; setDerAnsoegte: number; foersteSession: number | null; sidsteSession: number | null; udenTid: boolean } {
  const afholdt = tilmeldinger.filter((r) => erAfholdt(r, nu));
  const d = taelDeltagelse(afholdt, nu);
  const sete = new Set<string>();
  const foersteSet = new Map<string, number>();
  let foersteSession: number | null = null;
  let sidsteSession: number | null = null;
  let udenTid = false;
  for (const r of afholdt) {
    const t = tid(r.session_tid);
    if (t === null) udenTid = true;
    else {
      if (foersteSession === null || t < foersteSession) foersteSession = t;
      if (sidsteSession === null || t > sidsteSession) sidsteSession = t;
    }
    if (doemSetGrad(r, nu) !== "set") continue;
    sete.add(r.email);
    if (t === null) continue;
    const haves = foersteSet.get(r.email);
    if (haves === undefined || t < haves) foersteSet.set(r.email, t);
  }
  const tider = ansoegerTider(medWebinarKobling(ansoegninger));
  let setDerAnsoegte = 0;
  for (const mail of sete) {
    const t = tider.get(mail);
    if (t === undefined) continue;
    const g = foersteSet.get(mail);
    if (g === undefined || t > g) setDerAnsoegte++;
  }
  // Nævneren er `tilmeldte`: `kommende` er 0, fordi rækkerne allerede er de afholdte (K13).
  return { moedteOp: d.moedteOp, grundlag: d.tilmeldte, set: d.saaFaerdigt, setDerAnsoegte, foersteSession, sidsteSession, udenTid };
}

/**
 * Led 3 og 4's TÆLLERE (R1) — ansøgere og nye medlemmer blandt personer, hvis
 * FØRSTE tilmelding faldt i prisvinduet, og KUN når indsendelsen ligger SKARPT
 * efter den første tilmelding (eksemplerne i filhovedet, definition 3).
 *   personer:  første parsebare `registreret_at` pr. mail, dagen (dansk) i vinduet
 *              — samme tilskrivning som annoncepriser (`foersteTilmeldingPrPerson`).
 *   ansoegte:  ansoegerTider(mail) > første tilmelding
 *   medlemmer: medlemsTider(mail)  > første tilmelding
 * Uden et vindue tælles ingen.
 */
export function prisTaelling(
  tilmeldinger: readonly Tilmelding[],
  ansoegninger: readonly AnsoegerMail[],
  vindue: Vindue | null,
): { personer: number; ansoegte: number; medlemmer: number } {
  if (vindue === null) return { personer: 0, ansoegte: 0, medlemmer: 0 };
  const foerste = new Map<string, { t: number; iso: string }>();
  for (const r of tilmeldinger) {
    const t = tid(r.registreret_at);
    if (t === null) continue;
    const haves = foerste.get(r.email);
    if (haves === undefined || t < haves.t) foerste.set(r.email, { t, iso: r.registreret_at as string });
  }
  const koblet = medWebinarKobling(ansoegninger);
  const ansoegt = ansoegerTider(koblet);
  const medlem = medlemsTider(koblet);
  let personer = 0;
  let ansoegte = 0;
  let medlemmer = 0;
  for (const [mail, f] of foerste) {
    if (!iVindue(dagKey(f.iso), vindue)) continue;
    personer++;
    const a = ansoegt.get(mail);
    if (a !== undefined && a > f.t) ansoegte++;
    const m = medlem.get(mail);
    if (m !== undefined && m > f.t) medlemmer++;
  }
  return { personer, ansoegte, medlemmer };
}

/** «alle afholdte webinarer 25/8–30/9» — grundlaget for led 1 og 2 i ord. */
function sessionGrundlag(t: { foersteSession: number | null; sidsteSession: number | null; udenTid: boolean }): string {
  if (t.foersteSession === null || t.sidsteSession === null) {
    return t.udenTid ? "alle afholdte webinarer (kun Replay uden tidspunkt)" : "ingen afholdte webinarer endnu";
  }
  const fra = datoKort(new Date(t.foersteSession).toISOString());
  const til = datoKort(new Date(t.sidsteSession).toISOString());
  const spaend = fra === til ? `${fra}` : `${fra}–${til}`;
  return `alle afholdte webinarer ${spaend}${t.udenTid ? " + Replay uden tidspunkt" : ""}`;
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

/** Ét kald, ét svar — fire linjer i fast rækkefølge. Fladen regner intet. */
export function maalstreger(ind: MaalstregerInput, nu: Date): Maalstreger {
  // Den interne prøvesession tæller aldrig — filtreret FØR hver del af dommen
  // (samme filter som webinarDashboard; docs/webinarmotor.md §7.6 fund 5).
  const tilmeldinger = ind.tilmeldinger.filter((r) => !erInternTilmelding(r));
  const t = maalTaelling(tilmeldinger, ind.ansoegninger, nu);
  // VINDUET STÅR FAST: «Hele perioden» — se filhovedet. Annoncepriserne giver
  // vinduet, forbruget og valutaen; tællerne er målstregernes egne (R1).
  const priser = ind.forbrug === null
    ? null
    : annoncepriser({ tilmeldinger, ansoegninger: ind.ansoegninger, dage: ind.forbrug.dage, annoncer: ind.forbrug.annoncer, tilstand: ind.forbrug.tilstand, valg: "daekning", hentetTil: ind.forbrug.hentetTil }, nu);
  const harData = prisHarData(priser);
  const vindue = priser === null ? null : priser.vindue;
  const vindueOrd = periodeOrd(vindue);
  const p = prisTaelling(tilmeldinger, ind.ansoegninger, vindue);
  const forbrug = priser?.samlet.forbrugOere ?? 0;
  const iVinduet = vindueOrd === null ? "uden et vindue med forbrug" : `over ${vindueOrd}`;
  const sessioner = sessionGrundlag(t);
  const prisGrundlag = vindueOrd === null ? "intet annoncevindue med forbrug" : `annoncevinduet ${vindueOrd}`;
  return {
    prisvindueOrd: vindueOrd,
    linjer: [
      procentmaal(
        "fremmoede", "Fremmøde på webinaret", t.moedteOp, t.grundlag, MAAL_FREMMOEDE, sessioner,
        `${t.moedteOp} af ${t.grundlag} tilmeldte til et AFHOLDT webinar mødte op (personer, ikke tilmeldinger; en Replay uden tilstand tæller som udebleven). Wilson 95 %; under ${SPOR_FORHOLD_FRA} står «for få».`,
      ),
      procentmaal(
        "ansoegere_blandt_set", "Ansøgere blandt dem, der så det færdigt", t.setDerAnsoegte, t.set, MAAL_ANSOEGERE_BLANDT_SET, sessioner,
        `${t.setDerAnsoegte} af ${t.set}, der så det færdigt, har indsendt en ansøgning EFTER det første webinar, de så færdigt (mailen eller en bekræftet kobling). Ansøgninger kommer dage efter — tallet er lavt lige efter en session.`,
      ),
      kronemaal(
        "pris_pr_ansoegning", "Pris pr. ansøgning", forbrug, p.ansoegte, MAAL_PRIS_PR_ANSOEGNING_OERE,
        "ansøgning", "ansøgninger", harData, prisGrundlag,
        `${kroner(forbrug)} kr. brugt ${iVinduet} / ${p.ansoegte} ansøgere blandt de ${p.personer}, hvis første tilmelding faldt i samme vindue — kun ansøgninger indsendt EFTER den første tilmelding. Under ${TROVAERDIG_FRA} sættes ingen pris.`,
      ),
      kronemaal(
        "pris_pr_medlem", "Pris pr. nyt medlem", forbrug, p.medlemmer, MAAL_PRIS_PR_MEDLEM_OERE,
        "medlem", "medlemmer", harData, prisGrundlag,
        `${kroner(forbrug)} kr. brugt ${iVinduet} / ${p.medlemmer} nye medlemmer (underskrevet OG betalt) blandt de ${p.personer}, hvis første tilmelding faldt i samme vindue — kun af en ansøgning indsendt EFTER den første tilmelding. Et medlem tager uger — tallet modnes sidst. Under ${TROVAERDIG_FRA} sættes ingen pris.`,
      ),
    ],
  };
}
