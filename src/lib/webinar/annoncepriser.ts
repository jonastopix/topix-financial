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
 * Kan vinduet regnes? KUN hvis forbruget dækker det helt.
 *
 * BRUGES STADIG til at sige, om et ØNSKET vindue er dækket fuldt ud — men det
 * er ikke længere svaret på, om man må vælge det. Se `afkort`.
 */
export function erDaekket(v: Vindue, daekning: Vindue | null): boolean {
  return daekning !== null && v.fra >= daekning.fra && v.til <= daekning.til;
}

/**
 * Skær vinduet ned til det, forbruget faktisk dækker. null når de to ikke
 * overlapper overhovedet.
 *
 * HVORFOR AFKORTE OG IKKE AFVISE (Jonas 19/9): den første udgave krævede, at
 * hele det ønskede vindue lå inden for dækningen — og så kunne «sidste 7 dage»
 * ALDRIG vælges. Metas tal halter en dag: dækningen sluttede 18/9, vinduet
 * ville slutte i dag den 19/9, og kravet faldt på den ene dag, der endnu ikke
 * var hentet. Det samme gjaldt «sidste 30 dage».
 *
 * Afkortningen bevarer det, værnet faktisk skulle beskytte: at TÆLLER og
 * NÆVNER dækker samme periode. Begge ender filtreres på det AFKORTEDE vindue,
 * så en dag uden forbrug heller ikke bidrager med tilmeldinger. Det eneste,
 * der ændrer sig, er at vi siger «13.–18. september» i stedet for at nægte at
 * svare — og at det står på skærmen, at der blev skåret.
 */
export function afkort(oensket: Vindue, daekning: Vindue | null): Vindue | null {
  if (daekning === null) return null;
  const fra = oensket.fra > daekning.fra ? oensket.fra : daekning.fra;
  const til = oensket.til < daekning.til ? oensket.til : daekning.til;
  return fra > til ? null : { fra, til };
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
  /** Det vindue der FAKTISK regnes over — afkortet til forbrugets dækning. */
  vindue: Vindue | null;
  /** Det brugeren bad om, før afkortningen. Til at forklare forskellen. */
  oensket: Vindue | null;
  /** Kan der regnes? Sandt så snart der er ét døgns overlap. */
  daekket: boolean;
  /** Blev der skåret? Så står den rigtige periode på skærmen. */
  afkortet: boolean;
}

/**
 * De vinduer, man kan vælge — og for hvert, om forbruget rækker.
 * «Dækningen» er altid dækket pr. definition; de to andre kun, hvis vi har
 * hentet så langt tilbage. Fladen viser de udækkede som slukkede med grunden,
 * frem for at lade dem give et forkert tal.
 */
export function vinduesmuligheder(dage: readonly Forbrugsdag[], nu: Date): VindueMulighed[] {
  const d = forbrugsdaekning(dage);
  const byg = (valg: VindueValg, navn: string, oensket: Vindue | null): VindueMulighed => {
    const vindue = oensket === null ? d : afkort(oensket, d);
    return {
      valg,
      navn,
      vindue,
      oensket,
      daekket: vindue !== null,
      afkortet: oensket !== null && vindue !== null && (vindue.fra !== oensket.fra || vindue.til !== oensket.til),
    };
  };
  return [
    byg("daekning", "Hele perioden", null),
    byg("7dage", "Sidste 7 dage", sidsteDage(7, nu)),
    byg("30dage", "Sidste 30 dage", sidsteDage(30, nu)),
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

/**
 * Hvordan linjen blev koblet til tilmeldingerne.
 *   id     — utm_content var annoncens ad_id. Entydigt.
 *   navn   — utm_content var annoncens NAVN. Flere annoncer kan bære det
 *            samme navn; deres forbrug er lagt sammen i denne ene linje.
 *   intet  — annoncen har forbrug, men ingen tilmelding peger på den.
 */
export type Koblingsform = "id" | "navn" | "intet";

export interface Prislinje {
  /** ad_id, campaign_id eller «i alt». */
  noegle: string;
  koblingsform: Koblingsform;
  /** Antal annoncer linjen dækker. Over 1 betyder, at de deler navn. */
  annoncer: number;
  navn: string;
  /** Kampagnens navn, når linjen er en annonce. */
  underNavn: string | null;
  forbrugOere: number;
  /** Valutaer set i forbruget. Mere end én betyder, at beløbene ikke må lægges sammen. */
  valutaer: string[];
  tilmeldte: number;
  deltagere: number;
  /**
   * Personer hvis session ligger i FREMTIDEN. Uden dette tal ser «0 mødte op
   * (0 %)» ud som et frafald, når sandheden er, at webinaret først er tirsdag.
   */
  kommende: number;
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
  /**
   * utm_content der hverken er et Meta-id ELLER matcher en annonces navn.
   * Det er den ægte blindgyde: mærket peger på noget, vi ikke har.
   */
  maerkeErIkkeId: number;
  /** utm_content der kobler, men som vi ikke har forbrug på. */
  udenForbrug: number;
  /** Annoncer med forbrug, som ingen tilmelding peger på. */
  forbrugUdenTilmeldinger: number;
  /** Personer i alt — nævneren for de tre første. */
  personer: number;
  /**
   * Tilmeldinger koblet på ANNONCENS NAVN i stedet for dens id (19/9).
   * Navnet er ikke entydigt: flere annoncer kan bære det samme. De slås
   * sammen til ÉN linje med forbruget lagt sammen — se `delteNavne`.
   */
  kobletPaaNavn: number;
  /** Hvor mange linjer der dækker flere annoncer, fordi de deler navn. */
  delteNavne: number;
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
  /** Blev det ønskede vindue skåret ned til forbrugets periode? Står på skærmen. */
  afkortet: boolean;
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
  koblingsform: Koblingsform,
  antalAnnoncer: number,
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
    koblingsform,
    annoncer: antalAnnoncer,
    navn,
    underNavn,
    forbrugOere,
    valutaer,
    tilmeldte: d.tilmeldte,
    deltagere: d.moedteOp,
    kommende: d.kommende,
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

  // ── KOBLINGEN (rettet 19/9 efter Jonas' måling) ─────────────────────────
  //
  // FEJLEN DER VAR — to af dem, og de er hinandens spejlbillede:
  //
  //   1. MIN: kun utm_content der LIGNER et Meta-id blev koblet. Målt i prod
  //      er 9 af 11 værdier annoncens NAVN, ikke dens id — så koden kasserede
  //      dem i `maerkeErIkkeId`, og med dem størstedelen af tilmeldingerne.
  //      «4 - Gammel video-ad – Copy» med 382 tilmeldinger forsvandt helt.
  //
  //   2. DEN NÆRLIGGENDE: at join'e på navn uden videre. Navnet er IKKE
  //      entydigt — «IMG | 11-maaneskin | 2026-08-17» bæres af FIRE annoncer,
  //      og en naiv join giver fire linjer med ALLE 53 tilmeldinger i hver.
  //      Prisen bliver 2, 24, 27 og 37 kr. for den samme annonce.
  //
  // RETTELSEN: ÉN NØGLE PR. TILMELDING, ÉN GRUPPE PR. ANNONCE.
  //   · Er utm_content et Meta-id → nøglen er `id:<id>`.
  //   · Er den et navn, mindst én annonce bærer → nøglen er `navn:<navn>`,
  //     og ALLE de annoncers forbrug lægges sammen i den ene linje.
  //   · Ellers er mærket en blindgyde og tælles som brud.
  // Annoncerne partitioneres med samme regel, så hver annonces forbrug havner
  // i præcis én gruppe: id vinder over navn, når begge peger på den.
  //
  // Konsekvensen, som er hele pointen: en tilmelding kan ikke ligge i to
  // linjer, og et forbrug kan ikke tælles to gange. Værnet i
  // annoncepriser.guard + dom-prøven håndhæver det.
  const brud: Kaedebrud = {
    udenAnnoncemaerke: 0, maerkeErIkkeId: 0, udenForbrug: 0,
    forbrugUdenTilmeldinger: 0, personer: personer.length,
    kobletPaaNavn: 0, delteNavne: 0,
  };

  const forbrugPrAd = new Map<string, Forbrugsdag[]>();
  for (const x of dage) {
    const liste = forbrugPrAd.get(x.ad_id);
    if (liste) liste.push(x); else forbrugPrAd.set(x.ad_id, [x]);
  }

  // Navn → de annoncer der bærer det. Flere kan dele ét navn; det er fejlen.
  const adPrNavn = new Map<string, string[]>();
  for (const a of annoncer) {
    const n = tekst(a.navn);
    if (n === null) continue;
    const liste = adPrNavn.get(n);
    if (liste) liste.push(a.ad_id); else adPrNavn.set(n, [a.ad_id]);
  }

  const idNoegle = (v: string) => `id:${v}`;
  const navnNoegle = (v: string) => `navn:${v}`;

  // 1. Tilmeldingerne: ÉN nøgle hver, eller et brud.
  const perNoegle = new Map<string, Tilmelding[]>();
  const brugteIdNoegler = new Set<string>();
  const brugteNavne = new Set<string>();
  for (const r of personer) {
    const maerke = tekst(r.utm_content);
    if (maerke === null) { brud.udenAnnoncemaerke++; continue; }
    let noegle: string | null = null;
    if (erMetaObjektId(maerke)) {
      noegle = idNoegle(maerke);
      brugteIdNoegler.add(maerke);
    } else if (adPrNavn.has(maerke)) {
      noegle = navnNoegle(maerke);
      brugteNavne.add(maerke);
      brud.kobletPaaNavn++;
    } else {
      brud.maerkeErIkkeId++;
      continue;
    }
    const liste = perNoegle.get(noegle);
    if (liste) liste.push(r); else perNoegle.set(noegle, [r]);
  }

  // 2. Annoncerne: hver i PRÆCIS én gruppe. Id vinder over navn.
  const forbrugPrNoegle = new Map<string, Forbrugsdag[]>();
  const antalAnnoncerPrNoegle = new Map<string, number>();
  const laegTil = (noegle: string, d: readonly Forbrugsdag[]) => {
    const liste = forbrugPrNoegle.get(noegle);
    if (liste) liste.push(...d); else forbrugPrNoegle.set(noegle, [...d]);
    antalAnnoncerPrNoegle.set(noegle, (antalAnnoncerPrNoegle.get(noegle) ?? 0) + 1);
  };
  for (const [ad, d] of forbrugPrAd) {
    if (brugteIdNoegler.has(ad)) { laegTil(idNoegle(ad), d); continue; }
    const n = tekst(navnKort.get(ad)?.navn ?? null);
    if (n !== null && brugteNavne.has(n)) { laegTil(navnNoegle(n), d); continue; }
    laegTil(idNoegle(ad), d);
  }

  // 3. Bruddene, målt på grupperne.
  for (const noegle of perNoegle.keys()) if (!forbrugPrNoegle.has(noegle)) brud.udenForbrug += perNoegle.get(noegle)!.length;
  for (const noegle of forbrugPrNoegle.keys()) if (!perNoegle.has(noegle)) brud.forbrugUdenTilmeldinger++;
  for (const [noegle, antal] of antalAnnoncerPrNoegle) if (antal > 1 && noegle.startsWith("navn:")) brud.delteNavne++;

  // ── Pr. annonce ─────────────────────────────────────────────────────────
  const alleNoegler = new Set([...perNoegle.keys(), ...forbrugPrNoegle.keys()]);
  const perAnnonce = [...alleNoegler]
    .map((noegle) => {
      const erNavn = noegle.startsWith("navn:");
      const vaerdi = noegle.slice(erNavn ? 5 : 3);
      const kort = erNavn ? null : navnKort.get(vaerdi) ?? null;
      const harTilmeldinger = perNoegle.has(noegle);
      return byggLinje(
        noegle,
        erNavn ? vaerdi : tekst(kort?.navn) ?? vaerdi,
        erNavn ? null : tekst(kort?.kampagne_navn),
        perNoegle.get(noegle) ?? [],
        forbrugPrNoegle.get(noegle) ?? [],
        ansoegte, medlemmer, nu, daekket,
        harTilmeldinger ? (erNavn ? "navn" : "id") : "intet",
        antalAnnoncerPrNoegle.get(noegle) ?? 0,
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
  // Kampagnen udledes af GRUPPEN, ikke af den enkelte annonce: en navnegruppe
  // kan dække annoncer i flere kampagner, og så er der ikke ét rigtigt svar.
  // Den siger det i stedet for at vælge den første — «flere kampagner» er en
  // ærligere etiket end en tilfældig.
  const FLERE = FLERE_KAMPAGNER;
  const kampagneForNoegle = (noegle: string): { id: string; navn: string } => {
    const erNavn = noegle.startsWith("navn:");
    const vaerdi = noegle.slice(erNavn ? 5 : 3);
    const ads = erNavn ? (adPrNavn.get(vaerdi) ?? []) : [vaerdi];
    const ids = new Set<string>();
    let navn: string | null = null;
    for (const ad of ads) {
      const kort = navnKort.get(ad);
      const fraDage = forbrugPrAd.get(ad)?.find((x) => tekst(x.campaign_id));
      const id = tekst(kort?.campaign_id) ?? tekst(fraDage?.campaign_id ?? null);
      if (id !== null) { ids.add(id); navn = navn ?? tekst(kort?.kampagne_navn); }
    }
    if (ids.size === 0) return { id: "uden kampagne", navn: "uden kampagne" };
    if (ids.size > 1) return { id: FLERE, navn: FLERE };
    const id = [...ids][0];
    return { id, navn: navn ?? id };
  };

  const perKampagneRaekker = new Map<string, { navn: string; raekker: Tilmelding[]; dage: Forbrugsdag[]; annoncer: number }>();
  for (const noegle of alleNoegler) {
    const k = kampagneForNoegle(noegle);
    const post = perKampagneRaekker.get(k.id) ?? { navn: k.navn, raekker: [], dage: [], annoncer: 0 };
    post.raekker.push(...(perNoegle.get(noegle) ?? []));
    post.dage.push(...(forbrugPrNoegle.get(noegle) ?? []));
    post.annoncer += antalAnnoncerPrNoegle.get(noegle) ?? 0;
    perKampagneRaekker.set(k.id, post);
  }
  const perKampagne = [...perKampagneRaekker.entries()]
    .map(([id, p]) => byggLinje(id, p.navn, null, p.raekker, p.dage, ansoegte, medlemmer, nu, daekket, "id", p.annoncer))
    .sort(stoerstForbrugFoerst);

  // ── I alt ───────────────────────────────────────────────────────────────
  // Nævneren er ALLE personer, ikke kun de annonce-mærkede: spørgsmålet «hvad
  // kostede en tilmelding» handler om det, pengene gav — og de tilmeldinger,
  // der kom ind uden mærke, er også kommet et sted fra. Fladen viser bruddene
  // ved siden af, så det kan ses, hvor stor den ukendte del er.
  const samlet = byggLinje("i alt", "I alt", null, personer, dage, ansoegte, medlemmer, nu, daekket, "id", forbrugPrAd.size);

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
    afkortet: valgt.afkortet,
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

/** Forklaringen på en linje koblet via navnet — den skal stå ved tallet, ikke i en note. */
export function navnekoblingTekst(l: Prislinje): string | null {
  if (l.koblingsform !== "navn") return null;
  return l.annoncer > 1
    ? `Koblet på annoncens NAVN, som ${l.annoncer} annoncer deler — deres forbrug er lagt sammen her. Havde de stået hver for sig, ville de samme ${l.tilmeldte} tilmeldinger være talt ${l.annoncer} gange.`
    : "Koblet på annoncens navn i stedet for dens id. Entydigt her, men kun fordi netop dette navn bæres af én annonce.";
}

/**
 * Hvad fremmødet betyder — i ord, ikke som «0 %».
 *
 * JONAS 19/9: «Webinar | Adv+ | OM: 374 tilmeldte, 0 mødte op (0 %)» er
 * RIGTIGT — deres session er tirsdag 22/9 — «men det ligner en fejl».
 * Et nul, der i virkeligheden betyder «endnu ikke», skal sige det.
 */
export function fremmoedeTekst(l: Prislinje): string {
  if (l.tilmeldte === 0) return "ingen tilmeldte";
  if (l.deltagere === 0 && l.kommende > 0) {
    return l.kommende === l.tilmeldte
      ? "sessionen er ikke afholdt endnu"
      : `${l.kommende} af ${l.tilmeldte} venter på en session, der ikke er afholdt endnu`;
  }
  const andelTekst = l.fremmoedeAndel === null ? "" : ` (${Math.round(l.fremmoedeAndel * 100)} %)`;
  const venter = l.kommende > 0 ? ` · ${l.kommende} venter på et kommende webinar` : "";
  return `${l.deltagere} mødte op${andelTekst}${venter}`;
}

/**
 * «Flere kampagner»-rækken har brug for en sætning, ikke en stjerne
 * (Jonas 19/9). Den opstår, når en linje er koblet på et ANNONCENAVN, som
 * bæres af annoncer i forskellige kampagner — så findes der ikke ét rigtigt
 * kampagnenavn, og at vælge det første ville være en gætning.
 */
export const FLERE_KAMPAGNER = "flere kampagner";
export const FLERE_KAMPAGNER_FORKLARING =
  "Denne række er annoncer, der er koblet på deres NAVN, og hvis navn bæres af annoncer i forskellige kampagner. Der findes derfor ikke ét rigtigt kampagnenavn for rækken — forbruget og tilmeldingerne er rigtige, men de fordeler sig på flere kampagner. Sæt {{campaign.id}} og {{ad.id}} i url_tags, så forsvinder rækken af sig selv.";

/** Valutaen skrives KUN, når den ikke er kroner — «26.108 kr. DKK» er dobbelt. */
export function valutaTekst(valutaer: readonly string[]): string {
  const andre = valutaer.filter((v) => v.toUpperCase() !== "DKK");
  if (valutaer.length > 1) return ` · beløb i ${valutaer.join(" + ")} — læg dem ikke sammen`;
  return andre.length === 1 ? ` ${andre[0]}` : "";
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
