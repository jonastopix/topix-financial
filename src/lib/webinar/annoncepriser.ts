/**
 * Hvad annoncerne koster PR. LED (udkast 19/9-2026).
 *
 * Meta kan fortælle, hvad en annonce kostede, og hvor mange der klikkede.
 * Den kan ikke fortælle, hvor mange af dem der meldte sig til webinaret, mødte
 * op, ansøgte og blev medlem. Det er den eneste del, der er vores — og det er
 * derfor, denne fil findes.
 *
 * KÆDEN, MÅLT (recon-meta-annoncer §3 + §7.1, og målingerne i prod 19/9):
 *
 *   meta_annonce_dag.forbrug_oere
 *        │  ad_id
 *   meta_annonce.ad_id  ──?──  webinar_tilmeldinger.utm_content   ← LED 1, UBEVIST
 *        │                            │ email (begge CHECK lower)
 *        │                     ansoegninger.email                 ← LED 2, bevist
 *        │                            │ company_id + contract_end_date
 *        │                     companies                          ← LED 3, bevist
 *
 * LED 1 ER IKKE BEVIST, og det siger fladen. Recon'en viser, at Metas
 * `url_tags`-makroer (`{{ad.id}}`) ER mekanismen, og at vores utm_content-
 * værdier LIGNER Meta-id'er (18 cifre, «1202…»). Men ét Graph-kald afgør det,
 * og tokenet er ikke godkendt endnu. Indtil da bruger vi `erMetaObjektId` som
 * dom om, hvorvidt en værdi overhovedet KAN være et ad_id — og vi tæller
 * eksplicit dem, der ikke kan (§ brud). Vi lader aldrig som om, kæden er hel.
 *
 * ET TAL ER EN KENDSGERNING, ET FORHOLD ER EN VURDERING. Forbruget og
 * antallet er målt; prisen pr. led er en division, og en division med et lille
 * tal er støj. «50.000 kr. pr. medlem» af ét medlem ud af 597 tilmeldte siger
 * intet om det næste medlem. Derfor bærer hver pris sit `antal` og sin
 * `tillid`, og fladen viser ALTID antallet ved siden af prisen.
 *
 * LEDDENE MODNES IKKE LIGE HURTIGT. Pris pr. tilmelding kan aflæses dagen
 * efter; pris pr. medlem tager uger, fordi en ansøgning skal gennem samtale,
 * aftale og betaling. En annonce fra i går har derfor FOR HØJ pris pr. medlem,
 * ikke fordi den er dårlig, men fordi medlemmerne ikke er nået frem endnu.
 * Det står på fladen ved siden af tallet, ikke kun her.
 */
import { erMetaObjektId } from "@/lib/metaAnnoncer";
import {
  andel,
  dagKey,
  taelDeltagelse,
  type AnsoegerMail,
  type Tilmelding,
} from "@/lib/webinar/dashboard";
import { ansoegerMails, medlemsMails } from "@/lib/webinar/dashboard";

// ── Det vi læser ───────────────────────────────────────────────────────────

/** Én dag for én annonce (meta_annonce_dag) — kun det prisen bruger. */
export interface Forbrugsdag {
  ad_id: string;
  campaign_id: string | null;
  dato: string;
  valuta: string;
  forbrug_oere: number;
}

/** Annoncens aktuelle beskrivelse (meta_annonce) — kun navnene. */
export interface Annoncenavn {
  ad_id: string;
  campaign_id: string | null;
  navn: string | null;
  kampagne_navn: string | null;
}

/**
 * Hvor forbruget står henne. TRE tilstande, ikke to — forskellen mellem
 * «tabellen findes ikke» og «tabellen er tom» er forskellen mellem en
 * migration der mangler og et token der ikke er godkendt, og de to har hver
 * sin sætning på fladen. Ingen af dem er «0 kr.».
 */
export type Forbrugstilstand = "mangler" | "tom" | "har";

// ── Vinduet ────────────────────────────────────────────────────────────────

/**
 * ET VINDUE, IKKE TO (fejl fundet af Jonas 19/9-2026).
 *
 * Den første udgave delte ALT forbrug med ALLE tilmeldinger. Målt i prod:
 * Metas forbrug var hentet for 12.–18. september (87 dagsrækker, 5.464 kr.),
 * mens tilmeldingerne var talt siden 17. august (608 stk.). Resultatet var en
 * pris pr. tilmelding omkring FEM GANGE for lav — et tal man kan træffe
 * forkerte beslutninger på, og som ikke kunne holdes op mod Metas egne
 * (Webinar-kampagnen 150,74 kr./lead, VSL 58,19 kr./lead over 30 dage).
 *
 * Derfor: enhver pris regnes over ét vindue, og BEGGE ender filtreres ens.
 * Datoerne er danske kalenderdage «YYYY-MM-DD», og de er INKLUSIVE i begge
 * ender — «12.–18. september» betyder syv dage, ikke seks.
 */
export interface Vindue {
  fra: string;
  til: string;
}

/** Ligger dagen i vinduet? Streng-sammenligning er nok: «YYYY-MM-DD» sorterer som datoer. */
export function iVindue(dag: string | null, v: Vindue): boolean {
  return dag !== null && dag >= v.fra && dag <= v.til;
}

/**
 * Hvilket vindue HAR vi forbrug for? Min og maks dato i dagsrækkerne.
 * null når der ingen dage er — og så kan ingen pris regnes.
 *
 * Bemærk hvad dette IKKE er: et løfte om, at hver eneste dag i spændet har en
 * række. En dag uden forbrug har ingen række, og det er rigtigt. Spændet siger
 * kun, hvor langt vores viden rækker — uden for det ved vi ingenting, og dét
 * er forskellen på «nul kroner» og «vi har ikke hentet det».
 */
export function forbrugsdaekning(dage: readonly Forbrugsdag[]): Vindue | null {
  const datoer = dage.map((x) => tekst(x.dato)).filter((d): d is string => d !== null).sort();
  return datoer.length === 0 ? null : { fra: datoer[0], til: datoer[datoer.length - 1] };
}

/**
 * Kan vinduet regnes? KUN hvis forbruget dækker det helt. Rækker vinduet ud
 * over dækningen — bagud eller fremad — mangler der forbrug for en del af det,
 * og prisen ville blive for lav. Så vises den ikke.
 */
export function erDaekket(v: Vindue, daekning: Vindue | null): boolean {
  return daekning !== null && v.fra >= daekning.fra && v.til <= daekning.til;
}

/** «i dag» som dansk kalenderdag. */
export function idag(nu: Date): string {
  return dagKey(nu.toISOString()) ?? nu.toISOString().slice(0, 10);
}

/** Vinduet «de sidste N dage til og med i dag», inklusive begge ender. */
export function sidsteDage(antal: number, nu: Date): Vindue {
  const til = idag(nu);
  const fra = dagKey(new Date(Date.parse(`${til}T12:00:00Z`) - (antal - 1) * 86_400_000).toISOString()) ?? til;
  return { fra, til };
}

export type VindueValg = "daekning" | "7dage" | "30dage";

export interface VindueMulighed {
  valg: VindueValg;
  navn: string;
  vindue: Vindue | null;
  /** Falsk når forbruget ikke dækker hele vinduet — så kan prisen ikke regnes. */
  daekket: boolean;
}

/**
 * De vinduer, man kan vælge — og for hvert, om forbruget rækker.
 * «Dækningen» er altid dækket pr. definition; de to andre kun, hvis vi har
 * hentet så langt tilbage. Fladen viser de udækkede som slukkede med grunden,
 * frem for at lade dem give et forkert tal.
 */
export function vinduesmuligheder(dage: readonly Forbrugsdag[], nu: Date): VindueMulighed[] {
  const d = forbrugsdaekning(dage);
  const syv = sidsteDage(7, nu);
  const tredive = sidsteDage(30, nu);
  return [
    { valg: "daekning", navn: "Perioden vi har forbrug for", vindue: d, daekket: d !== null },
    { valg: "7dage", navn: "Sidste 7 dage", vindue: syv, daekket: erDaekket(syv, d) },
    { valg: "30dage", navn: "Sidste 30 dage", vindue: tredive, daekket: erDaekket(tredive, d) },
  ];
}

// ── Prisen ─────────────────────────────────────────────────────────────────

/**
 * Hvor mange af et led der skal til, før forholdet er værd at læse.
 *
 * Fem. Begrundelsen er ikke smag: den relative usikkerhed på et forhold med
 * n hændelser er groft 1/√n — ved n = 1 er tallet ±100 %, ved n = 5 er det
 * ±45 %, ved n = 25 er det ±20 %. Fem er dér, hvor tallet holder op med at
 * være en enkelt anekdote og begynder at pege i en retning. Under fem VISER
 * vi stadig prisen (pengene ER brugt), men markeret som tynd — at skjule den
 * ville også være en løgn.
 */
export const TROVAERDIG_FRA = 5;

/** Og her holder det op med at være indikativt og bliver til et tal, man kan styre efter. */
export const STABIL_FRA = 25;

export type Tillid = "udaekket" | "ingen" | "tynd" | "indikativ" | "stabil";

/**
 * Prisen kan IKKE regnes, fordi forbruget ikke dækker vinduet. Ikke «0», ikke
 * «–» af mangel på tæller: et navngivet afslag, så fladen kan sige hvorfor.
 * Jonas 19/9: «Hellere *forbruget dækker kun 12.–18. september* end et tal,
 * der er fem gange forkert.»
 */
export const UDAEKKET: Pris = { forbrugOere: 0, antal: 0, oerePrStk: null, tillid: "udaekket" };

export interface Pris {
  /** Kendsgerning: hvad der er brugt. */
  forbrugOere: number;
  /** Kendsgerning: hvor mange der kom ud af det. */
  antal: number;
  /** Vurdering: forbrug / antal. null når antal er 0 — ikke 0, og ikke uendelig. */
  oerePrStk: number | null;
  tillid: Tillid;
}

/**
 * Byg prisen. Antal 0 giver ALDRIG et tal: en division med nul er ikke
 * «gratis» og ikke «uendelig dyr», den er «vi ved det ikke endnu».
 */
export function pris(forbrugOere: number, antal: number): Pris {
  const f = Number.isFinite(forbrugOere) && forbrugOere > 0 ? Math.round(forbrugOere) : 0;
  const n = Number.isFinite(antal) && antal > 0 ? Math.floor(antal) : 0;
  if (n === 0) return { forbrugOere: f, antal: 0, oerePrStk: null, tillid: "ingen" };
  return {
    forbrugOere: f,
    antal: n,
    oerePrStk: Math.round(f / n),
    tillid: n >= STABIL_FRA ? "stabil" : n >= TROVAERDIG_FRA ? "indikativ" : "tynd",
  };
}

/** Må forholdet læses som et tal, man kan regne videre på? */
export function kanStolesPaa(p: Pris): boolean {
  return p.tillid === "indikativ" || p.tillid === "stabil";
}

// ── Linjen ─────────────────────────────────────────────────────────────────

export interface Prislinje {
  /** ad_id, campaign_id eller «i alt». */
  noegle: string;
  navn: string;
  /** Kampagnens navn, når linjen er en annonce. */
  underNavn: string | null;
  forbrugOere: number;
  /** Valutaer set i forbruget. Mere end én betyder, at beløbene ikke må lægges sammen. */
  valutaer: string[];
  tilmeldte: number;
  deltagere: number;
  ansoegte: number;
  medlemmer: number;
  prPrTilmelding: Pris;
  prPrDeltager: Pris;
  prPrAnsoegning: Pris;
  prPrMedlem: Pris;
  /** Andel af tilmeldte der mødte op — til at læse prisen i sammenhæng. */
  fremmoedeAndel: number | null;
}

/** Hvor kæden brister — målt, ikke antaget. */
export interface Kaedebrud {
  /** Tilmeldinger uden utm_content overhovedet: kan aldrig knyttes til en annonce. */
  udenAnnoncemaerke: number;
  /** utm_content der findes, men ikke ligner et Meta-id (makroen er ikke sat). */
  maerkeErIkkeId: number;
  /** utm_content der ligner et id, men som vi ikke har forbrug på. */
  udenForbrug: number;
  /** Annoncer med forbrug, som ingen tilmelding peger på. */
  forbrugUdenTilmeldinger: number;
  /** Personer i alt — nævneren for de tre første. */
  personer: number;
}

export interface Annoncepriser {
  tilstand: Forbrugstilstand;
  /** Sandt når mindst én dagsrække har et forbrug over nul. */
  harForbrug: boolean;
  samlet: Prislinje;
  perAnnonce: Prislinje[];
  perKampagne: Prislinje[];
  brud: Kaedebrud;
  /** Vinduet tallene ER regnet over. Står på skærmen — et beløb uden periode er ikke et tal. */
  vindue: Vindue | null;
  /** Hvad vi HAR forbrug for. Er vindue bredere end denne, kan prisen ikke regnes. */
  daekning: Vindue | null;
  /** Falsk når forbruget ikke dækker vinduet — alle priser er da UDAEKKET. */
  daekket: boolean;
  /** Valgene og deres tilgængelighed, så fladen kan slukke dem uden at regne selv. */
  muligheder: VindueMulighed[];
  /** Tilmeldingernes eget spænd — så forskellen til dækningen kan ses, ikke gættes. */
  tilmeldingsspan: Vindue | null;
}

// ── Regnestykket ───────────────────────────────────────────────────────────

const tekst = (v: string | null | undefined): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
};

/**
 * Personens FØRSTE tilmelding afgør, hvilken annonce hun hører til — samme
 * tilskrivning som annoncesporet på webinarfladen. En person der meldte sig
 * to gange fra to annoncer kan ikke tælles begge steder, uden at 597 bliver
 * til 600 og hver pris bliver for lav.
 */
function foersteTilmeldingPrPerson(raekker: readonly Tilmelding[]): Tilmelding[] {
  const kort = new Map<string, Tilmelding>();
  for (const r of raekker) {
    const haves = kort.get(r.email);
    if (!haves) { kort.set(r.email, r); continue; }
    const ny = Date.parse(r.registreret_at ?? "");
    const gl = Date.parse(haves.registreret_at ?? "");
    if (Number.isNaN(gl) && !Number.isNaN(ny)) kort.set(r.email, r);
    else if (!Number.isNaN(gl) && !Number.isNaN(ny) && ny < gl) kort.set(r.email, r);
  }
  return [...kort.values()];
}

/**
 * Én linje, regnet over ÉT vindue. `raekker` og `dage` er allerede filtreret
 * af kalderen med samme vindue — det er hele rettelsen: tæller og nævner må
 * aldrig dække hver sin periode. `daekket` er falsk, når forbruget ikke
 * rækker over vinduet; så får hver pris `UDAEKKET`, og tallene står alene.
 */
function byggLinje(
  noegle: string,
  navn: string,
  underNavn: string | null,
  raekker: readonly Tilmelding[],
  dage: readonly Forbrugsdag[],
  ansoegte: ReadonlySet<string>,
  medlemmer: ReadonlySet<string>,
  nu: Date,
  daekket: boolean,
): Prislinje {
  const d = taelDeltagelse(raekker, nu);
  const mails = new Set(raekker.map((r) => r.email));
  let a = 0;
  let m = 0;
  for (const mail of mails) {
    if (ansoegte.has(mail)) a++;
    if (medlemmer.has(mail)) m++;
  }
  const forbrugOere = dage.reduce((sum, x) => sum + (Number.isFinite(x.forbrug_oere) ? x.forbrug_oere : 0), 0);
  const valutaer = [...new Set(dage.map((x) => tekst(x.valuta)).filter((v): v is string => v !== null))].sort();
  return {
    noegle,
    navn,
    underNavn,
    forbrugOere,
    valutaer,
    tilmeldte: d.tilmeldte,
    deltagere: d.moedteOp,
    ansoegte: a,
    medlemmer: m,
    prPrTilmelding: daekket ? pris(forbrugOere, d.tilmeldte) : UDAEKKET,
    prPrDeltager: daekket ? pris(forbrugOere, d.moedteOp) : UDAEKKET,
    prPrAnsoegning: daekket ? pris(forbrugOere, a) : UDAEKKET,
    prPrMedlem: daekket ? pris(forbrugOere, m) : UDAEKKET,
    fremmoedeAndel: andel(d.moedteOp, d.tilmeldte),
  };
}

const stoerstForbrugFoerst = (a: Prislinje, b: Prislinje) =>
  b.forbrugOere - a.forbrugOere || b.tilmeldte - a.tilmeldte || a.navn.localeCompare(b.navn, "da");

export interface AnnoncepriserInput {
  tilmeldinger: readonly Tilmelding[];
  ansoegninger: readonly AnsoegerMail[];
  dage: readonly Forbrugsdag[];
  annoncer: readonly Annoncenavn[];
  tilstand: Forbrugstilstand;
  /** Hvilket vindue der regnes over. Standard: præcis det, vi har forbrug for. */
  valg?: VindueValg;
}

/** Ét kald, ét svar. Fladen regner intet. */
export function annoncepriser(ind: AnnoncepriserInput, nu: Date): Annoncepriser {
  const { tilmeldinger, ansoegninger, dage: alleDage, annoncer, tilstand, valg = "daekning" } = ind;
  const ansoegte = ansoegerMails(ansoegninger);
  const medlemmer = medlemsMails(ansoegninger);

  // ── VINDUET FØRST (rettelse 19/9) ───────────────────────────────────────
  // Tæller og nævner skal dække SAMME periode. Derfor vælges vinduet her, og
  // BEGGE ender filtreres med det, før noget tælles. Standard er præcis den
  // periode, vi har forbrug for — den er altid dækket, og det er det vindue,
  // der giver et tal, man kan holde op mod Metas egne.
  const muligheder = vinduesmuligheder(alleDage, nu);
  const valgt = muligheder.find((m) => m.valg === valg) ?? muligheder[0];
  const daekning = forbrugsdaekning(alleDage);
  const vindue = valgt.vindue;
  const daekket = valgt.daekket && vindue !== null;

  const dage = vindue === null ? [] : alleDage.filter((x) => iVindue(tekst(x.dato), vindue));
  const alleFoerste = foersteTilmeldingPrPerson(tilmeldinger);
  // Personen hører til vinduet, hvis hendes FØRSTE tilmelding faldt i det —
  // samme tilskrivning som annoncen selv. Uden et vindue tælles ingen.
  const personer = vindue === null ? [] : alleFoerste.filter((r) => iVindue(dagKey(r.registreret_at), vindue));

  const tilmeldingsdage = alleFoerste.map((r) => dagKey(r.registreret_at)).filter((d): d is string => d !== null).sort();
  const tilmeldingsspan = tilmeldingsdage.length === 0
    ? null
    : { fra: tilmeldingsdage[0], til: tilmeldingsdage[tilmeldingsdage.length - 1] };

  const navnKort = new Map(annoncer.map((a) => [a.ad_id, a]));

  // ── Kædebruddene, talt før noget grupperes ──────────────────────────────
  const brud: Kaedebrud = {
    udenAnnoncemaerke: 0, maerkeErIkkeId: 0, udenForbrug: 0,
    forbrugUdenTilmeldinger: 0, personer: personer.length,
  };
  const forbrugPrAd = new Map<string, Forbrugsdag[]>();
  for (const x of dage) {
    const liste = forbrugPrAd.get(x.ad_id);
    if (liste) liste.push(x); else forbrugPrAd.set(x.ad_id, [x]);
  }

  const perAd = new Map<string, Tilmelding[]>();
  for (const r of personer) {
    const maerke = tekst(r.utm_content);
    if (maerke === null) { brud.udenAnnoncemaerke++; continue; }
    if (!erMetaObjektId(maerke)) { brud.maerkeErIkkeId++; continue; }
    if (!forbrugPrAd.has(maerke)) brud.udenForbrug++;
    const liste = perAd.get(maerke);
    if (liste) liste.push(r); else perAd.set(maerke, [r]);
  }
  for (const ad of forbrugPrAd.keys()) if (!perAd.has(ad)) brud.forbrugUdenTilmeldinger++;

  // ── Pr. annonce ─────────────────────────────────────────────────────────
  const alleAd = new Set([...perAd.keys(), ...forbrugPrAd.keys()]);
  const perAnnonce = [...alleAd]
    .map((ad) => {
      const kort = navnKort.get(ad) ?? null;
      return byggLinje(
        ad,
        tekst(kort?.navn) ?? ad,
        tekst(kort?.kampagne_navn),
        perAd.get(ad) ?? [],
        forbrugPrAd.get(ad) ?? [],
        ansoegte, medlemmer, nu, daekket,
      );
    })
    .sort(stoerstForbrugFoerst);

  // ── Pr. kampagne ────────────────────────────────────────────────────────
  // Kampagnen tages fra FORBRUGET (meta_annonce/meta_annonce_dag), ikke fra
  // utm_campaign: annoncens egen kampagne er Metas sandhed, og utm_campaign
  // kan være sat forkert i et enkelt link uden at Meta ved det.
  const kampagneAf = (ad: string): { id: string; navn: string } => {
    const kort = navnKort.get(ad);
    const fraDage = forbrugPrAd.get(ad)?.find((x) => tekst(x.campaign_id));
    const id = tekst(kort?.campaign_id) ?? tekst(fraDage?.campaign_id ?? null) ?? "uden kampagne";
    return { id, navn: tekst(kort?.kampagne_navn) ?? id };
  };
  const perKampagneRaekker = new Map<string, { navn: string; raekker: Tilmelding[]; dage: Forbrugsdag[] }>();
  for (const ad of alleAd) {
    const k = kampagneAf(ad);
    const post = perKampagneRaekker.get(k.id) ?? { navn: k.navn, raekker: [], dage: [] };
    post.raekker.push(...(perAd.get(ad) ?? []));
    post.dage.push(...(forbrugPrAd.get(ad) ?? []));
    perKampagneRaekker.set(k.id, post);
  }
  const perKampagne = [...perKampagneRaekker.entries()]
    .map(([id, p]) => byggLinje(id, p.navn, null, p.raekker, p.dage, ansoegte, medlemmer, nu, daekket))
    .sort(stoerstForbrugFoerst);

  // ── I alt ───────────────────────────────────────────────────────────────
  // Nævneren er ALLE personer, ikke kun de annonce-mærkede: spørgsmålet «hvad
  // kostede en tilmelding» handler om det, pengene gav — og de tilmeldinger,
  // der kom ind uden mærke, er også kommet et sted fra. Fladen viser bruddene
  // ved siden af, så det kan ses, hvor stor den ukendte del er.
  const samlet = byggLinje("i alt", "I alt", null, personer, dage, ansoegte, medlemmer, nu, daekket);

  return {
    tilstand,
    harForbrug: dage.some((x) => Number.isFinite(x.forbrug_oere) && x.forbrug_oere > 0),
    samlet,
    perAnnonce,
    perKampagne,
    brud,
    vindue,
    daekning,
    daekket,
    muligheder,
    tilmeldingsspan,
  };
}

// ── Ordene ─────────────────────────────────────────────────────────────────

/** «12.–18. september» — ét spænd, ét månedsnavn når begge ender er samme måned. */
export function periodeOrd(v: Vindue | null): string | null {
  if (v === null) return null;
  const d = (s: string) => new Date(`${s}T12:00:00Z`);
  const dag = (s: string) => String(d(s).getUTCDate());
  const maaned = (s: string) =>
    new Intl.DateTimeFormat("da-DK", { month: "long", timeZone: "UTC" }).format(d(s));
  if (v.fra === v.til) return `${dag(v.fra)}. ${maaned(v.fra)}`;
  return maaned(v.fra) === maaned(v.til)
    ? `${dag(v.fra)}.–${dag(v.til)}. ${maaned(v.til)}`
    : `${dag(v.fra)}. ${maaned(v.fra)} – ${dag(v.til)}. ${maaned(v.til)}`;
}

/** Sætningen når vinduet ikke er dækket — den skal nævne, hvad vi FAKTISK har. */
export function udaekketTekst(vindue: Vindue | null, daekning: Vindue | null): string {
  const d = periodeOrd(daekning);
  if (d === null) return "Der er intet forbrug hentet endnu, så ingen pris kan regnes.";
  const v = periodeOrd(vindue);
  return `Prisen kan ikke regnes for ${v ?? "det valgte vindue"}: forbruget dækker kun ${d}. Et tal regnet på tværs af to perioder ville være for lavt — derfor står der ingenting.`;
}

export const PRIS_EYEBROW = "Hvad det koster";
export const PRIS_TITEL = "Pris pr. tilmelding, deltager, ansøgning og medlem";
export const PRIS_MANGLER_TEKST =
  "Annonceforbruget er der ikke endnu. Tabellerne meta_annonce og meta_annonce_dag kommer med migrationen 20260919170000 — indtil den er kørt, har vi tallene fra vores egen side af kæden, men ingen pris at sætte på dem.";
export const PRIS_TOM_TEKST =
  "Forbruget hentes, når Meta-adgangen er godkendt. Tabellerne er der, men der er ingen dage endnu — tokenet mangler stadig godkendelse. Vi viser hellere dette end nuller, der ligner en måling.";
export const PRIS_UDEN_FORBRUG_TEKST =
  "Der er hentet dage fra Meta, men forbruget er nul i hele perioden. Det er et rigtigt tal, ikke en manglende hentning.";
export const TYND_FORKLARING =
  `Et forhold på under ${TROVAERDIG_FRA} er en enkelt hændelse, ikke et mønster — prisen står, fordi pengene er brugt, men den siger intet om den næste.`;
export const MODNING_FORKLARING =
  "Leddene modnes ikke lige hurtigt: en tilmelding kommer samme dag, et medlem tager uger gennem samtale, aftale og betaling. En ny annonce har derfor for høj pris pr. medlem, indtil dens ansøgere er nået igennem.";
