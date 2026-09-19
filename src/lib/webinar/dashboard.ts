/**
 * Webinarfladens dom (udkast 19/9-2026) — de fire spørgsmål Jonas stillede,
 * regnet ÉT sted, så fladen kun tegner:
 *
 *   1. Hvor mange er tilmeldt det næste webinar, og hvornår er det?
 *   2. For hvert AFHOLDT webinar: tilmeldte · mødte op · så det færdigt ·
 *      mødte ikke op.
 *   3. HVOR KOM DE FRA: pr. annonce (utm_campaign/utm_content) og pr. kilde
 *      (Facebook, direkte, andet) — hele vejen fra annoncen til deltagelsen.
 *   4. Hvor mange af de tilmeldte der ANSØGTE. Koblingen er mailen.
 *
 * ARBEJDSDELINGEN. Graden af deltagelse («set» ≥ 75 % · «delvist» ·
 * «mødte ikke op» · «tilmeldt» · «ukendt») er IKKE regnet her — den er
 * webinarDom.doemSetGrad, spejlet i supabase/functions/_shared/webinarDom.ts
 * med paritetstest. Denne fil grupperer og tæller dommen; den fælder den
 * aldrig selv. Ét sted, én grænse.
 *
 * TÆLLEENHEDEN ER PERSONER, ikke rækker — som webinarDom.webinarTal. Én mail
 * tæller én gang pr. session, og bedste grad vinder (en «Left» efter en
 * «Watched» må ikke gøre en seer til en der faldt fra).
 *
 * ANNONCESPORET TILSKRIVES PERSONENS FØRSTE TILMELDING (tidligste
 * registreret_at). En person der meldte sig til to gange fra to annoncer kan
 * ikke tælles to steder uden at 330 bliver til 340; annoncen der hentede
 * hende ind, er den første. De personer hvis tilmeldinger bærer FORSKELLIGE
 * kilder, tælles i `flereKilder` — tvetydigheden vises, den skjules ikke.
 *
 * ANNONCESPORET KAN MANGLE. Kolonnerne kommer med migration
 * 20260919150000_webinar_annoncespor.sql, og plukket med
 * webinarDom.plukAnnoncespor. Indtil begge er kørt, er felterne `undefined`,
 * og dommen svarer `sporFindes: false` i stedet for at vise nuller som var
 * de målte. Fladen siger det rent ud. Ingen af de øvrige tre spørgsmål
 * afhænger af sporet.
 *
 * NUL DATA ER ET GYLDIGT SVAR. Hver dom har en tom form (`null`, tom liste,
 * nul), og fladen har en sætning til hver. Siden er rigtig i dag med nul
 * rækker og rigtig tirsdag med 330.
 */
import { blevMedlem } from "@/lib/ansoegninger/ansoegningVisning";
import type { Trin } from "@/lib/ansoegningTrin";
import {
  datoKort,
  doemSetGrad,
  SET_GRAENSE_PROCENT,
  type SetGrad,
  type WebinarTilmelding,
} from "@/lib/webinarDom";

export { SET_GRAENSE_PROCENT };

// ── Rækken fladen læser ────────────────────────────────────────────────────

/**
 * Annoncesporets kolonner (migration 20260919150000). VALGFRIE med vilje:
 * typen skal kunne læses både før og efter migrationen og plukket er kørt,
 * så fladen ikke er bundet til rækkefølgen af to udrulninger.
 */
export interface AnnoncesporFelter {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  fbclid?: string | null;
  origin?: string | null;
  first_origin?: string | null;
  referrer?: string | null;
  first_referrer?: string | null;
  widget_source?: string | null;
  by?: string | null;
  land?: string | null;
  enhed?: string | null;
  tidszone?: string | null;
}

/** Tilmeldingen som fladen læser den: webinarDom's række + annoncesporet. */
export type Tilmelding = WebinarTilmelding & AnnoncesporFelter;

/**
 * Den indsendte ansøgning, reduceret til det fladen bruger: mailen (koblingen),
 * hvornår den kom (tiden), og de to felter «blev medlem» dømmes af.
 *
 * ÉN DEFINITION AF «BLEV MEDLEM». Vi opfinder ikke en her: dommen er husets
 * egen `blevMedlem` i lib/ansoegninger/ansoegningVisning.ts — underskrevet OG
 * virksomheden har en slutdato (sat af stripe-webhook ved BETALING). Samme
 * sandhed som adgangen, og samme tal som ansøgningslisten viser. En anden
 * definition her ville betyde to tal for det samme ord i samme hus.
 */
export interface AnsoegerMail {
  /** Små bogstaver, som webinar_tilmeldinger.email og ansoegninger.email (begge CHECK lower). */
  email: string;
  indsendt_at: string | null;
  trin: Trin;
  /** companies.contract_end_date gennem company_id — null når ansøgningen ikke blev en betalt virksomhed. */
  virksomhed_slutdato: string | null;
}

// ── Små hjælpere ───────────────────────────────────────────────────────────

const tekst = (v: string | null | undefined): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" ? null : s;
};

const tid = (iso: string | null | undefined): number | null => {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/** «7 %» — heltal. Nævneren 0 giver null, aldrig NaN og aldrig «0 %». */
export function andel(taeller: number, naevner: number): number | null {
  return naevner <= 0 ? null : taeller / naevner;
}

/**
 * «62 %» af en ANDEL (0–1). null → «–».
 *
 * SMÅ TAL MÅ IKKE BLIVE TIL NUL (Jonas 19/9): 1 ansøgning ud af 594 er
 * 0,168 % — afrundet til heltal bliver det «0 %», som læses som «ingen» og
 * ligner en fejl. Derfor: en andel der ER nul, skriver «0 %»; en andel der
 * er større end nul, men under 1 %, skriver én decimal med dansk komma
 * («0,2 %»); og er den mindre end det en decimal kan vise, skriver den
 * «<0,1 %». Ingen ægte forekomst kan forsvinde i en afrunding.
 */
export function pct(a: number | null): string {
  if (a === null) return "–";
  if (a === 0) return "0 %";
  const p = a * 100;
  if (p >= 1) return `${Math.round(p)} %`;
  if (p >= 0.05) return `${p.toFixed(1).replace(".", ",")} %`;
  return "<0,1 %";
}

/**
 * «29 af 91 · 32 %» (Jonas 19/9): brøken OG procenten sammen, så tallet kan
 * læses uden at regne. Uden nævner: bare tallet.
 */
export function brokOgPct(taeller: number, naevner: number): string {
  const a = andel(taeller, naevner);
  return a === null ? String(taeller) : `${taeller} af ${naevner} · ${pct(a)}`;
}

/** «62 %» af et TAL der allerede er en procent (0–100). null → «–». */
export function procentTal(p: number | null): string {
  return p === null ? "–" : `${Math.round(p)} %`;
}

/** «tirsdag den 22. september kl. 10.00» i dansk tid. null ved manglende tid. */
export function datoLang(iso: string | null): string | null {
  const t = tid(iso);
  if (t === null) return null;
  return new Intl.DateTimeFormat("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  }).format(new Date(t));
}

/** «2026-09-22» i dansk tid — dagen en tilmelding faldt på. */
export function dagKey(iso: string | null): string | null {
  const t = tid(iso);
  if (t === null) return null;
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Copenhagen" }).format(new Date(t));
}

/** Læg rækken i sin spand — én linje, så grupperingerne nedenfor kan læses. */
function laegI<T>(kort: Map<string, T[]>, noegle: string, vaerdi: T): void {
  const liste = kort.get(noegle);
  if (liste) liste.push(vaerdi); else kort.set(noegle, [vaerdi]);
}

/**
 * «om 3 dage» · «i dag» · «i morgen». Tælles i danske KALENDERDAGE, ikke i
 * timer: et webinar samme aften er «i dag», ikke «i morgen», og et webinar
 * tirsdag morgen set fra lørdag morgen er «om 3 dage». Timeafstanden ville
 * afrunde begge forkert. null når tiden mangler.
 */
export function omHvorLaenge(iso: string | null, nu: Date): string | null {
  const maal = dagKey(iso);
  const idag = dagKey(nu.toISOString());
  if (maal === null || idag === null) return null;
  const dage = Math.round((Date.parse(`${maal}T12:00:00Z`) - Date.parse(`${idag}T12:00:00Z`)) / 86_400_000);
  if (dage <= 0) return "i dag";
  if (dage === 1) return "i morgen";
  return `om ${dage} dage`;
}

export { datoKort };

// ── Personer og grader ─────────────────────────────────────────────────────

/** Rangen webinarDom bruger: bedste grad vinder, når en mail har flere rækker. */
const GRAD_RANG: Record<SetGrad, number> = { set: 4, delvist: 3, moedte_ikke: 2, ukendt: 1, tilmeldt: 0 };

/** De fire tal Jonas bad om, plus de to der ellers ville forsvinde i dem. */
export interface Deltagelse {
  /** Personer (unikke mails). */
  tilmeldte: number;
  /** Var der: «set» + «delvist». */
  moedteOp: number;
  /** Så det færdigt: «set» (≥ 75 %). */
  saaFaerdigt: number;
  /** Var der, men ikke helt: «delvist». */
  delvist: number;
  /** Faldt fra: mødte ikke op («moedte_ikke»). */
  moedteIkke: number;
  /** Sessionen er forbi, og ingen hændelse har sagt noget — hverken op eller fra. */
  ukendt: number;
  /** Sessionen ligger i fremtiden. */
  kommende: number;
  /** moedteOp / tilmeldte. null når der ingen tilmeldte er. */
  fremmoedeAndel: number | null;
  /** saaFaerdigt / moedteOp. null når ingen mødte op. */
  gennemfoerselAndel: number | null;
  /** Gennemsnitlig set-procent blandt dem der HAR et tal. null når ingen har. */
  gennemsnitProcent: number | null;
  /** Hvor mange personer der har en målt procent — så et gennemsnit kan vejes. */
  medProcent: number;
}

const TOM_DELTAGELSE: Deltagelse = {
  tilmeldte: 0, moedteOp: 0, saaFaerdigt: 0, delvist: 0, moedteIkke: 0, ukendt: 0,
  kommende: 0, fremmoedeAndel: null, gennemfoerselAndel: null, gennemsnitProcent: null, medProcent: 0,
};

/**
 * Tæl deltagelsen pr. PERSON over en liste tilmeldinger. Bedste grad vinder
 * pr. mail (webinarTal-mønstret), og procenten er personens højeste.
 */
export function taelDeltagelse(raekker: readonly Tilmelding[], nu: Date): Deltagelse {
  const perPerson = new Map<string, { grad: SetGrad; procent: number | null }>();
  for (const r of raekker) {
    const g = doemSetGrad(r, nu);
    const p = r.set_procent !== null && r.set_procent > 0 ? r.set_procent : null;
    const haves = perPerson.get(r.email);
    if (!haves) {
      perPerson.set(r.email, { grad: g, procent: p });
      continue;
    }
    if (GRAD_RANG[g] > GRAD_RANG[haves.grad]) haves.grad = g;
    if (p !== null && (haves.procent === null || p > haves.procent)) haves.procent = p;
  }
  const d: Deltagelse = { ...TOM_DELTAGELSE, tilmeldte: perPerson.size };
  let procentSum = 0;
  for (const p of perPerson.values()) {
    if (p.grad === "set") { d.saaFaerdigt++; d.moedteOp++; }
    else if (p.grad === "delvist") { d.delvist++; d.moedteOp++; }
    else if (p.grad === "moedte_ikke") d.moedteIkke++;
    else if (p.grad === "ukendt") d.ukendt++;
    else if (p.grad === "tilmeldt") d.kommende++;
    if (p.procent !== null) { d.medProcent++; procentSum += p.procent; }
  }
  d.fremmoedeAndel = andel(d.moedteOp, d.tilmeldte);
  d.gennemfoerselAndel = andel(d.saaFaerdigt, d.moedteOp);
  d.gennemsnitProcent = d.medProcent === 0 ? null : procentSum / d.medProcent;
  return d;
}

// ── 1. Det næste webinar ───────────────────────────────────────────────────

export interface TilmeldtPrDag {
  /** «2026-09-18», dansk tid. */
  dag: string;
  antal: number;
}

export interface NaesteWebinar {
  sessionTid: string;
  webinarId: string;
  titel: string | null;
  /** Personer tilmeldt PRÆCIS denne session. */
  personer: number;
  /**
   * Personer tilmeldt en hvilken som helst FREMTIDIG session, og hvor mange
   * sådanne sessioner der er. Med ét webinar og én session er de to tal
   * `personer` og 1; med flere kommende sessioner ville `personer` alene
   * kunne læses som «vi mangler tilmeldte», selv når alle 594 står i kø.
   */
  kommendeIAlt: number;
  kommendeSessioner: number;
  /** «om 3 dage». */
  omHvorLaenge: string | null;
  /**
   * Tilmeldinger pr. dag frem mod sessionen, ældste først — fra
   * registreret_at. Tom liste når ingen tilmelding har et tidspunkt.
   */
  prDag: TilmeldtPrDag[];
  /** De rækker sessionen består af — annoncesporet regnes på dem. */
  raekker: Tilmelding[];
}

/**
 * Den NÆRMESTE session efter `nu`, og hvor mange der er tilmeldt netop den.
 * Webinarer uden sessionstid (Replay/OnDemand) kan pr. definition ikke være
 * «det næste» og indgår ikke. null når ingen session ligger i fremtiden.
 */
export function naesteWebinar(raekker: readonly Tilmelding[], nu: Date): NaesteWebinar | null {
  const fremtid = raekker.filter((r) => { const t = tid(r.session_tid); return t !== null && t > nu.getTime(); });
  if (fremtid.length === 0) return null;
  const naermeste = Math.min(...fremtid.map((r) => tid(r.session_tid) as number));
  const mine = fremtid.filter((r) => tid(r.session_tid) === naermeste);
  const sessionTid = new Date(naermeste).toISOString();
  const kommendeSessioner = new Set(fremtid.map((r) => new Date(tid(r.session_tid) as number).toISOString())).size;
  const kommendeIAlt = new Set(fremtid.map((r) => r.email)).size;
  const prDagKort = new Map<string, number>();
  const settMails = new Set<string>();
  for (const r of mine) {
    if (settMails.has(r.email)) continue;
    settMails.add(r.email);
    const dag = dagKey(r.registreret_at);
    if (dag !== null) prDagKort.set(dag, (prDagKort.get(dag) ?? 0) + 1);
  }
  return {
    sessionTid,
    webinarId: mine[0].webinar_id,
    titel: mine.find((r) => tekst(r.webinar_titel))?.webinar_titel ?? null,
    personer: settMails.size,
    kommendeIAlt,
    kommendeSessioner,
    omHvorLaenge: omHvorLaenge(sessionTid, nu),
    prDag: [...prDagKort.entries()].map(([dag, antal]) => ({ dag, antal })).sort((a, b) => a.dag.localeCompare(b.dag)),
    raekker: mine,
  };
}

// ── 2. De afholdte webinarer ───────────────────────────────────────────────

export interface AfholdtSession extends Deltagelse {
  /** null for Replay/OnDemand — ingen sessionstid, men stadig deltagelse. */
  sessionTid: string | null;
  webinarId: string;
  titel: string | null;
  sessionType: string | null;
  /** «22/9» · null uden tid. */
  dato: string | null;
  /** Af sessionens tilmeldte: hvor mange der har indsendt en ansøgning (Jonas 19/9, punkt 3). */
  ansoegte: number;
  /** ansoegte / tilmeldte. null uden tilmeldte. */
  ansoegerAndel: number | null;
  /** Af sessionens ANSØGERE: hvor mange der blev medlem (Jonas 19/9, punkt 4). */
  blevMedlem: number;
  /** blevMedlem / ansoegte — andelen af de ANSØGTE, ikke af de tilmeldte. null uden ansøgere. */
  medlemAfAnsoegteAndel: number | null;
}

/**
 * Én linje pr. AFHOLDT session (webinar_id + session_tid), nyeste først.
 * Sessionen er enheden, ikke webinaret: eWebinar kører det samme webinar
 * mange gange, og et fremmøde på tværs af tre måneder er ikke ét tal.
 * Rækker uden sessionstid samles i én linje pr. webinar (optagelsen).
 * Fremtidige sessioner hører til §1 og er ikke med.
 */
export function afholdteSessioner(
  raekker: readonly Tilmelding[],
  nu: Date,
  ansoegte: ReadonlySet<string> = new Set(),
  medlemmer: ReadonlySet<string> = new Set(),
): AfholdtSession[] {
  const afholdt = raekker.filter((r) => { const t = tid(r.session_tid); return t === null || t <= nu.getTime(); });
  const grupper = new Map<string, Tilmelding[]>();
  for (const r of afholdt) {
    const t = tid(r.session_tid);
    laegI(grupper, `${r.webinar_id}|${t === null ? "" : new Date(t).toISOString()}`, r);
  }
  return [...grupper.values()]
    .map((liste) => {
      const t = tid(liste[0].session_tid);
      const sessionTid = t === null ? null : new Date(t).toISOString();
      const mails = new Set(liste.map((r) => r.email));
      const a = faellesAntal(mails, ansoegte);
      const m = faellesAntal(mails, medlemmer);
      return {
        sessionTid,
        webinarId: liste[0].webinar_id,
        titel: liste.find((r) => tekst(r.webinar_titel))?.webinar_titel ?? null,
        sessionType: liste.find((r) => tekst(r.session_type))?.session_type ?? null,
        dato: datoKort(sessionTid),
        ...taelDeltagelse(liste, nu),
        ansoegte: a,
        ansoegerAndel: andel(a, mails.size),
        blevMedlem: m,
        // Af de ANSØGTE, ikke af de tilmeldte: spørgsmålet er hvor god en
        // ansøgning fra denne session er, ikke hvor mange der ansøgte.
        medlemAfAnsoegteAndel: andel(m, a),
      };
    })
    .sort((a, b) => (tid(b.sessionTid) ?? -1) - (tid(a.sessionTid) ?? -1));
}

// ── 3. Annoncesporet ───────────────────────────────────────────────────────

/**
 * Kildens navn ud fra utm_source. Små, EKSPLICITTE oversættelser — alt
 * andet står som annoncøren skrev det, så en ny kilde aldrig forsvinder i
 * en «andet»-spand vi selv har fundet på.
 */
const KILDE_NAVNE: Record<string, string> = {
  fb: "Facebook", facebook: "Facebook", meta: "Facebook",
  ig: "Instagram", instagram: "Instagram",
  li: "LinkedIn", linkedin: "LinkedIn",
  google: "Google", adwords: "Google", youtube: "YouTube",
  email: "E-mail", mail: "E-mail", newsletter: "E-mail", klaviyo: "E-mail",
};

/** Værtsnavnet uden «www.» — «https://www.facebook.com/x» → «facebook.com». */
export function vaertsnavn(url: string | null | undefined): string | null {
  const s = tekst(url);
  if (s === null) return null;
  try {
    return new URL(s).hostname.replace(/^www\./i, "") || null;
  } catch {
    return null;
  }
}

/**
 * Kilden i ord: «Facebook» · «facebook.com» · «direkte». Aldrig tom.
 *
 * FBCLID SLÅR REFERRER (fund i prod-tallene 19/9): 578 tilmeldinger bærer et
 * fbclid, men kun 566 er utm-mærket fb/facebook/ig. Mindst 12 rækker har
 * altså Metas klik-id UDEN utm_source — annoncen blev klikket, men mærkerne
 * faldt af undervejs. Uden denne linje ville de blive talt som «direkte», og
 * Facebook ville se ringere ud end den er. utm_source vinder stadig, så en
 * Instagram-annonce (der også sætter fbclid) bliver ved med at hedde
 * Instagram. Hvor mange der er tilskrevet på fbclid alene, står i
 * Annoncespor.kunFbclid — tallet skal kunne efterprøves, ikke bare virke.
 */
export function kildeAf(r: Tilmelding): string {
  const kilde = tekst(r.utm_source);
  if (kilde !== null) return KILDE_NAVNE[kilde.toLowerCase()] ?? kilde;
  if (tekst(r.fbclid) !== null) return "Facebook";
  const henvisning = vaertsnavn(r.referrer) ?? vaertsnavn(r.first_referrer);
  if (henvisning !== null) return henvisning;
  return "direkte";
}

/** Bar rækken et fbclid, men ingen utm_source? Så er den tilskrevet på klik-id'et alene. */
export function kunPaaFbclid(r: Tilmelding): boolean {
  return tekst(r.utm_source) === null && tekst(r.fbclid) !== null;
}

/** Kampagnen i ord — «uden kampagne» når utm_campaign mangler. */
export const UDEN_KAMPAGNE = "uden kampagne";
export function kampagneAf(r: Tilmelding): string {
  return tekst(r.utm_campaign) ?? UDEN_KAMPAGNE;
}

/** Annoncen i kampagnen — utm_content, ellers utm_term, ellers «uden annonce». */
export const UDEN_ANNONCE = "uden annonce";
export function annonceAf(r: Tilmelding): string {
  return tekst(r.utm_content) ?? tekst(r.utm_term) ?? UDEN_ANNONCE;
}

/** Rækkens plads i sporet — de tre ord der grupperes på. */
export interface SporNoegle { kilde: string; kampagne: string; annonce: string }

export function sporNoegleAf(r: Tilmelding): SporNoegle {
  return { kilde: kildeAf(r), kampagne: kampagneAf(r), annonce: annonceAf(r) };
}

/** Tallene for en gruppe i sporet: fra annonce til deltagelse til ansøgning. */
export interface Sporlinje extends Deltagelse {
  navn: string;
  /** Rå utm-værdier bag navnet, til folden: «fb · paid». Tom når der ingen er. */
  raa: string[];
  /** Personer i gruppen der har indsendt en ansøgning (koblet på mailen). */
  ansoegte: number;
  /** ansoegte / tilmeldte. null uden tilmeldte. */
  ansoegerAndel: number | null;
  /**
   * Linjens andel af den helhed den hører til — kilden og kampagnen af ALLE
   * personer i sporet, annoncen af sin egen kampagne. Fladen tegner den som
   * en søjle: med syv rækker kan en fordeling ikke læses af syv tal alene,
   * og et øje der skal regne 336 mod 594 i hovedet, læser den ikke.
   */
  andelAfHelhed: number | null;
}

export interface Kampagnelinje extends Sporlinje {
  annoncer: Sporlinje[];
}

export interface Annoncespor {
  /**
   * Falsk når annoncespor-kolonnerne ikke findes eller ingen række bærer
   * spor endnu. Fladen skriver det i klartekst frem for at vise nuller.
   */
  sporFindes: boolean;
  /** Pr. kilde: Facebook · direkte · … Største først. */
  kilder: Sporlinje[];
  /** Pr. kampagne, med annoncerne foldet ind under. Største først. */
  kampagner: Kampagnelinje[];
  /** Personer hvis tilmeldinger bærer FORSKELLIGE kilder — tvetydigheden vist. */
  flereKilder: number;
  /**
   * Personer tilskrevet Facebook på fbclid ALENE (ingen utm_source). De ville
   * ellers stå som «direkte». Tallet står på fladen, så tilskrivningen kan
   * efterprøves og ikke bare tros.
   */
  kunFbclid: number;
  /** Personer i alt i sporet (= unikke mails i listen). */
  personer: number;
}

/**
 * Personens FØRSTE tilmelding (tidligste registreret_at; uden tid taber den
 * mod en med tid, og ellers vinder den først sete). Det er den række hele
 * personens annoncespor tilskrives.
 */
function foersteTilmeldingPrPerson(raekker: readonly Tilmelding[]): Map<string, Tilmelding> {
  const kort = new Map<string, Tilmelding>();
  for (const r of raekker) {
    const haves = kort.get(r.email);
    if (!haves) { kort.set(r.email, r); continue; }
    const ny = tid(r.registreret_at);
    const gl = tid(haves.registreret_at);
    if (gl === null && ny !== null) kort.set(r.email, r);
    else if (gl !== null && ny !== null && ny < gl) kort.set(r.email, r);
  }
  return kort;
}

function byg(navn: string, raekker: Tilmelding[], ansoegte: ReadonlySet<string>, nu: Date, raa: string[], helhed: number): Sporlinje {
  const d = taelDeltagelse(raekker, nu);
  const mails = new Set(raekker.map((r) => r.email));
  let a = 0;
  for (const m of mails) if (ansoegte.has(m)) a++;
  return { navn, raa, ...d, ansoegte: a, ansoegerAndel: andel(a, d.tilmeldte), andelAfHelhed: andel(d.tilmeldte, helhed) };
}

const stoerstFoerst = (a: Sporlinje, b: Sporlinje) => b.tilmeldte - a.tilmeldte || a.navn.localeCompare(b.navn, "da");

/**
 * Hele vejen fra annoncen til ansøgningen. `sporKolonnerFindes` er basens
 * svar (findes kolonnerne overhovedet); selv når de findes, kan ingen række
 * bære spor endnu, og så er `sporFindes` også falsk.
 */
export function annoncespor(
  raekker: readonly Tilmelding[],
  ansoegerMails: ReadonlySet<string>,
  nu: Date,
  sporKolonnerFindes: boolean,
): Annoncespor {
  const foerste = foersteTilmeldingPrPerson(raekker);
  const personRaekker = [...foerste.values()];

  const harSpor = personRaekker.some(
    (r) => tekst(r.utm_source) !== null || tekst(r.utm_campaign) !== null || tekst(r.utm_content) !== null ||
           tekst(r.referrer) !== null || tekst(r.first_referrer) !== null || tekst(r.fbclid) !== null,
  );

  const flereKilderMails = new Set<string>();
  const perMail = new Map<string, Set<string>>();
  for (const r of raekker) {
    const s = perMail.get(r.email) ?? new Set<string>();
    s.add(kildeAf(r));
    perMail.set(r.email, s);
  }
  for (const [mail, s] of perMail) if (s.size > 1) flereKilderMails.add(mail);

  const perKilde = new Map<string, Tilmelding[]>();
  const perKampagne = new Map<string, Tilmelding[]>();
  const perAnnonce = new Map<string, Tilmelding[]>();
  for (const r of personRaekker) {
    const n = sporNoegleAf(r);
    laegI(perKilde, n.kilde, r);
    laegI(perKampagne, n.kampagne, r);
    laegI(perAnnonce, `${n.kampagne}\u0000${n.annonce}`, r);
  }

  const raaAf = (liste: Tilmelding[], felter: Array<keyof AnnoncesporFelter>): string[] => {
    const set = new Set<string>();
    for (const r of liste) for (const f of felter) { const v = tekst(r[f] as string | null | undefined); if (v !== null) set.add(v); }
    return [...set].sort((a, b) => a.localeCompare(b, "da")).slice(0, 4);
  };

  const helhed = foerste.size;
  const kilder = [...perKilde.entries()]
    .map(([navn, liste]) => byg(navn, liste, ansoegerMails, nu, raaAf(liste, ["utm_source", "utm_medium"]), helhed))
    .sort(stoerstFoerst);

  const kampagner: Kampagnelinje[] = [...perKampagne.entries()]
    .map(([navn, liste]) => {
      // Annoncens andel måles mod SIN EGEN kampagne, ikke mod alle: den
      // fortæller hvilken annonce der bar kampagnen, ikke hvor stor
      // kampagnen var — det siger kampagnelinjen selv.
      const iKampagnen = new Set(liste.map((r) => r.email)).size;
      return {
        ...byg(navn, liste, ansoegerMails, nu, raaAf(liste, ["utm_medium"]), helhed),
        annoncer: [...perAnnonce.entries()]
          .filter(([k]) => k.split("\u0000")[0] === navn)
          .map(([k, l]) => byg(k.split("\u0000")[1], l, ansoegerMails, nu, raaAf(l, ["utm_source", "utm_medium"]), iKampagnen))
          .sort(stoerstFoerst),
      };
    })
    .sort(stoerstFoerst);

  return {
    sporFindes: sporKolonnerFindes && harSpor,
    kilder,
    kampagner,
    flereKilder: flereKilderMails.size,
    kunFbclid: personRaekker.filter(kunPaaFbclid).length,
    personer: foerste.size,
  };
}

// ── 4. Ansøgningerne ───────────────────────────────────────────────────────

export interface Ansoegningskobling {
  /** Personer i webinar_tilmeldinger. */
  tilmeldte: number;
  /** Af dem: hvor mange der har en INDSENDT ansøgning på samme mail. */
  ansoegte: number;
  /** ansoegte / tilmeldte. null uden tilmeldte. */
  andelAfTilmeldte: number | null;
  /** Ansøgere i alt (indsendte) — nævneren for den anden vej. */
  ansoegereIAlt: number;
  /** Af ansøgerne: hvor mange der var tilmeldt et webinar. */
  ansoegereDerVarTilmeldt: number;
  /** ansoegereDerVarTilmeldt / ansoegereIAlt. null uden ansøgere. */
  andelAfAnsoegere: number | null;
}

/** Mailene på de INDSENDTE ansøgninger (kladder tæller ikke), normaliseret. */
export function ansoegerMails(ansoegninger: readonly AnsoegerMail[]): Set<string> {
  const s = new Set<string>();
  for (const a of ansoegninger) {
    if (a.indsendt_at === null) continue;
    const m = tekst(a.email)?.toLowerCase();
    if (m !== null && m !== undefined) s.add(m);
  }
  return s;
}

/**
 * Mailene på dem der BLEV MEDLEM. Dommen er husets egen (blevMedlem):
 * underskrevet OG virksomheden har en slutdato — altså betalt. Vi gentager
 * ikke betingelsen her; ændrer den sig ét sted, ændrer den sig begge.
 */
export function medlemsMails(ansoegninger: readonly AnsoegerMail[]): Set<string> {
  const s = new Set<string>();
  for (const a of ansoegninger) {
    if (a.indsendt_at === null || !blevMedlem(a)) continue;
    const m = tekst(a.email)?.toLowerCase();
    if (m !== null && m !== undefined) s.add(m);
  }
  return s;
}

/** Hvor mange af mailene i `mails` der står i `mod`. */
function faellesAntal(mails: Iterable<string>, mod: ReadonlySet<string>): number {
  let n = 0;
  for (const m of mails) if (mod.has(m)) n++;
  return n;
}

/** Begge veje af koblingen — «af de tilmeldte ansøgte X» og «af ansøgerne var Y tilmeldt». */
export function ansoegningskobling(raekker: readonly Tilmelding[], ansoegninger: readonly AnsoegerMail[]): Ansoegningskobling {
  const mails = ansoegerMails(ansoegninger);
  const tilmeldteMails = new Set(raekker.map((r) => r.email));
  let ansoegte = 0;
  for (const m of tilmeldteMails) if (mails.has(m)) ansoegte++;
  return {
    tilmeldte: tilmeldteMails.size,
    ansoegte,
    andelAfTilmeldte: andel(ansoegte, tilmeldteMails.size),
    ansoegereIAlt: mails.size,
    ansoegereDerVarTilmeldt: ansoegte,
    andelAfAnsoegere: andel(ansoegte, mails.size),
  };
}

// ── Tragten: hele historien på én linje ────────────────────────────────────

export interface TragtTrin {
  navn: string;
  /** Hvad tallet betyder — står under navnet, så ingen skal gætte. */
  forklaring: string;
  antal: number;
  /** Andel af LEDDET FØR. null på første trin og når leddet før er nul. */
  andelAfFoer: number | null;
  /** Andel af FØRSTE led — så det sidste tal kan læses mod udgangspunktet. */
  andelAfStart: number | null;
}

export interface Tragt {
  trin: TragtTrin[];
  /** Personer tragten er regnet på (= første trins antal). */
  grundlag: number;
  /**
   * Personer der er tilmeldt en session som IKKE er afholdt endnu, og derfor
   * med vilje står UDEN FOR tragten. Uden dette tal ville de 534 der venter
   * på tirsdag, enten forsvinde eller — værre — tælle som frafald.
   */
  kommendeUdenfor: number;
}

/**
 * Tilmeldte → mødte op → så det færdigt → ansøgte → blev medlem.
 *
 * REGNET PÅ DE AFHOLDTE ALENE (Jonas 19/9, punkt 5). Man kan ikke møde op
 * til et webinar der ikke har været holdt: tog vi alle tilmeldte med, ville
 * de 534 der venter på tirsdag, stå som 534 der ikke mødte op, og tragten
 * ville sige noget usandt om markedsføringen. De står i stedet for sig selv
 * i `kommendeUdenfor` og i afsnittet om det næste webinar.
 *
 * Hvert led er personer (unikke mails), og hvert led er en delmængde af det
 * før — derfor kan andelen af leddet før aldrig overstige 1.
 */
export function tragt(
  raekker: readonly Tilmelding[],
  ansoegte: ReadonlySet<string>,
  medlemmer: ReadonlySet<string>,
  nu: Date,
): Tragt {
  const afholdt = raekker.filter((r) => { const t = tid(r.session_tid); return t === null || t <= nu.getTime(); });
  const d = taelDeltagelse(afholdt, nu);
  const mails = new Set(afholdt.map((r) => r.email));
  const a = faellesAntal(mails, ansoegte);
  const m = faellesAntal(mails, medlemmer);
  const kommende = new Set(
    raekker.filter((r) => { const t = tid(r.session_tid); return t !== null && t > nu.getTime(); }).map((r) => r.email),
  );
  const raa: Array<{ navn: string; forklaring: string; antal: number }> = [
    { navn: "Tilmeldte", forklaring: "til et webinar der er afholdt", antal: d.tilmeldte },
    { navn: "Mødte op", forklaring: "eWebinar så dem deltage", antal: d.moedteOp },
    { navn: "Så det færdigt", forklaring: `${SET_GRAENSE_PROCENT} % eller mere`, antal: d.saaFaerdigt },
    { navn: "Ansøgte", forklaring: "indsendt ansøgning, koblet på mailen", antal: a },
    { navn: "Blev medlem", forklaring: "underskrevet og betalt", antal: m },
  ];
  const start = raa[0].antal;
  return {
    trin: raa.map((t, i) => ({
      ...t,
      andelAfFoer: i === 0 ? null : andel(t.antal, raa[i - 1].antal),
      andelAfStart: andel(t.antal, start),
    })),
    grundlag: start,
    kommendeUdenfor: kommende.size,
  };
}

// ── Tiden fra tilmelding til ansøgning ─────────────────────────────────────

export interface TidTilAnsoegning {
  /** Personer der BÅDE har en tilmelding med tidspunkt og en indsendt ansøgning efter den. */
  antal: number;
  /** Gennemsnit i dage, én decimal. null når antal er 0. */
  gennemsnitDage: number | null;
  /** Median i dage — mere ærlig end gennemsnittet, når få sene trækker. null når antal er 0. */
  medianDage: number | null;
  hurtigsteDage: number | null;
  langsomsteDage: number | null;
  /**
   * Personer der ansøgte FØR de meldte sig til webinaret. De er ikke en
   * ventetid og indgår ikke i gennemsnittet — men de er ikke nul værd:
   * de kom ind ad en anden dør, og webinaret var ikke det der hentede dem.
   */
  ansoegteFoerTilmelding: number;
  /** Personer der ansøgte, men hvis tilmelding mangler et tidspunkt — kan ikke måles. */
  udenTidspunkt: number;
}

const TOM_TID: TidTilAnsoegning = {
  antal: 0, gennemsnitDage: null, medianDage: null, hurtigsteDage: null,
  langsomsteDage: null, ansoegteFoerTilmelding: 0, udenTidspunkt: 0,
};

/**
 * Hvor lang tid går der fra en person melder sig til, til hun ansøger?
 * (Jonas 19/9, punkt 7 — det afgør hvornår I skal skrive til folk.)
 *
 * MÅLT PÅ DET DER FINDES: `webinar_tilmeldinger.registreret_at` og
 * `ansoegninger.indsendt_at`. Begge er rigtige tidsstempler, så spørgsmålet
 * kan besvares — men kun for dem der har BEGGE. Personens tid regnes fra
 * hendes FØRSTE tilmelding (samme tilskrivning som annoncesporet) til
 * ansøgningens indsendelse.
 *
 * BÅDE GENNEMSNIT OG MEDIAN. Gennemsnittet er det Jonas bad om; medianen
 * står ved siden af, fordi én der ansøger efter 90 dage kan flytte et
 * gennemsnit på tyve personer mere end den fortjener. Er de to langt fra
 * hinanden, er det selv en oplysning.
 */
export function tidTilAnsoegning(
  raekker: readonly Tilmelding[],
  ansoegninger: readonly AnsoegerMail[],
): TidTilAnsoegning {
  const foerst = new Map<string, number>();
  const udenTid = new Set<string>();
  for (const r of raekker) {
    const t = tid(r.registreret_at);
    if (t === null) { if (!foerst.has(r.email)) udenTid.add(r.email); continue; }
    udenTid.delete(r.email);
    const haves = foerst.get(r.email);
    if (haves === undefined || t < haves) foerst.set(r.email, t);
  }
  const dage: number[] = [];
  let foer = 0;
  let mangler = 0;
  const set = new Set<string>();
  for (const a of ansoegninger) {
    const mail = tekst(a.email)?.toLowerCase();
    const ind = tid(a.indsendt_at);
    if (mail === null || mail === undefined || ind === null || set.has(mail)) continue;
    set.add(mail);
    const reg = foerst.get(mail);
    if (reg === undefined) { if (udenTid.has(mail)) mangler++; continue; }
    if (ind < reg) { foer++; continue; }
    dage.push((ind - reg) / 86_400_000);
  }
  if (dage.length === 0) return { ...TOM_TID, ansoegteFoerTilmelding: foer, udenTidspunkt: mangler };
  const sorteret = [...dage].sort((x, y) => x - y);
  const midt = Math.floor(sorteret.length / 2);
  const median = sorteret.length % 2 === 1 ? sorteret[midt] : (sorteret[midt - 1] + sorteret[midt]) / 2;
  const en = (n: number) => Math.round(n * 10) / 10;
  return {
    antal: dage.length,
    gennemsnitDage: en(dage.reduce((x, y) => x + y, 0) / dage.length),
    medianDage: en(median),
    hurtigsteDage: en(sorteret[0]),
    langsomsteDage: en(sorteret[sorteret.length - 1]),
    ansoegteFoerTilmelding: foer,
    udenTidspunkt: mangler,
  };
}

/** «3,5 dage» · «1 dag» · «under en dag». null → «–». */
export function dageOrd(d: number | null): string {
  if (d === null) return "–";
  if (d < 1) return "under en dag";
  const n = Math.round(d * 10) / 10;
  const tekstTal = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  return `${tekstTal} ${n === 1 ? "dag" : "dage"}`;
}

// ── Hele dommen ────────────────────────────────────────────────────────────

export interface WebinarDashboard {
  /** Nul tilmeldinger — siden er rigtig, tallene findes bare ikke endnu. */
  tom: boolean;
  /** Personer i alt på tværs af alle webinarer. */
  personer: number;
  /** Deltagelsen på tværs af ALT afholdt (ikke de kommende). */
  samlet: Deltagelse;
  /** Tilmeldte → mødte op → så færdigt → ansøgte → blev medlem, øverst på fladen. */
  tragt: Tragt;
  /** Fra tilmelding til ansøgning — hvornår I skal skrive til folk. */
  tid: TidTilAnsoegning;
  naeste: NaesteWebinar | null;
  afholdte: AfholdtSession[];
  /** Sporet over alle tilmeldinger. */
  spor: Annoncespor;
  /** Sporet for det NÆSTE webinar alene — null uden et næste. */
  sporNaeste: Annoncespor | null;
  kobling: Ansoegningskobling;
}

export interface DashboardInput {
  tilmeldinger: readonly Tilmelding[];
  ansoegninger: readonly AnsoegerMail[];
  /** Svarede basen på annoncespor-kolonnerne? Falsk før migration 150000. */
  sporKolonnerFindes: boolean;
}

/** Ét kald, ét svar. Fladen regner intet selv. */
export function webinarDashboard(ind: DashboardInput, nu: Date): WebinarDashboard {
  const { tilmeldinger, ansoegninger, sporKolonnerFindes } = ind;
  const mails = ansoegerMails(ansoegninger);
  const medlemmer = medlemsMails(ansoegninger);
  const naeste = naesteWebinar(tilmeldinger, nu);
  const afholdte = afholdteSessioner(tilmeldinger, nu, mails, medlemmer);
  const afholdtRaekker = tilmeldinger.filter((r) => { const t = tid(r.session_tid); return t === null || t <= nu.getTime(); });
  return {
    tom: tilmeldinger.length === 0,
    personer: new Set(tilmeldinger.map((r) => r.email)).size,
    samlet: taelDeltagelse(afholdtRaekker, nu),
    tragt: tragt(tilmeldinger, mails, medlemmer, nu),
    tid: tidTilAnsoegning(tilmeldinger, ansoegninger),
    naeste,
    afholdte,
    spor: annoncespor(tilmeldinger, mails, nu, sporKolonnerFindes),
    sporNaeste: naeste === null ? null : annoncespor(naeste.raekker, mails, nu, sporKolonnerFindes),
    kobling: ansoegningskobling(tilmeldinger, ansoegninger),
  };
}

// ── Ordene fladen bruger ───────────────────────────────────────────────────

export const WEBINAR_EYEBROW = "Webinaret";
export const WEBINAR_TITEL = "Tilmeldte, deltagelse og hvor de kom fra";
export const WEBINAR_UNDERLINJE = `Tallene er PERSONER, ikke tilmeldinger — én mail tæller én gang. «Så det færdigt» er ${SET_GRAENSE_PROCENT} % eller mere af webinaret.`;
export const WEBINAR_FEJL_TEKST = "Tallene kunne ikke hentes. Prøv igen om lidt — de står i webinar_tilmeldinger, og fejlen er logget.";
export const WEBINAR_TOM_TEKST = "Ingen tilmeldinger endnu. Siden fylder sig selv, så snart eWebinar-webhooken eller importen har kørt.";
export const SPOR_MANGLER_TEKST =
  "Annoncesporet er der ikke endnu. Kolonnerne kommer med migrationen 20260919150000_webinar_annoncespor.sql, og værdierne plukkes af webinarDom.plukAnnoncespor. Indtil begge har kørt, viser vi ingenting frem for nuller der ligner en måling.";
export const SPOR_TOMT_TEKST =
  "Kolonnerne findes, men ingen tilmelding bærer et spor endnu. De næste tilmeldinger tager det med.";
export const KOBLING_TOM_TEKST = "Ingen ansøgninger er indsendt endnu. Tallet står klar, så snart den første kommer.";
export const TRAGT_EYEBROW = "Hele vejen";
export const TRAGT_TITEL = "Fra tilmeldt til medlem";
export const TRAGT_TOM_TEKST = "Ingen webinarer er afholdt endnu, så der er ingen vej at følge. Tragten fylder sig selv efter det første webinar.";
export const TID_EYEBROW = "Tiden";
export const TID_TITEL = "Fra tilmelding til ansøgning";
export const TID_TOM_TEKST = "Ingen har både meldt sig til og ansøgt endnu. Tallet kan først regnes, når den første ansøgning kommer fra en mail, der også står i eWebinar.";
export const AFHOLDTE_TOM_TEKST = "Ingen webinarer er afholdt endnu — eller ingen tilmelding bærer en session der er forbi.";
export const NAESTE_TOM_TEKST = "Ingen kommende session. Ingen tilmelding peger på et tidspunkt efter nu.";
