/**
 * _shared/mailForlob.ts   ·   SPEJL af src/lib/marketing/mailForlob.ts
 *
 * LAG 5, DOMMEN: hvilke mails havde en ansøger fået og åbnet, FØR ansøgningen?
 *
 * Det er den ene dom, lag 6 skal stå på. Klaviyo ser åbninger, Meta ser klik —
 * kun platformen ved, hvem der blev medlem og for hvor meget. Sammenføjningen
 * af de to er hele værdien, og den sker her.
 *
 * ── TRE TING, MÅLINGEN 19/9 TVANG IND I DESIGNET ────────────────────────────
 *
 * 1. EN ÅBNING ER IKKE ET MENNESKE. Klaviyos hændelser bærer `machine_open`
 *    (Apple/Outlook henter billedet for brugeren) og `Bot Click` (sikkerheds-
 *    scannere følger hvert link i mailen, før modtageren ser den). Målt på
 *    flow UiECQS i september: **1 menneskeklik mod 42 bot-klik**. Bygger man
 *    attribution på rå klik, måler man et antivirusprogram.
 *    Derfor: hændelser med `maskine` eller `bot` TÆLLES, men er aldrig bevis.
 *
 * 2. KLAVIYOS EGEN RAPPORT FILTRERER ALLEREDE. Reporting API'et sagde
 *    `clicks_unique: 2` for UiECQS over 30 dage, mens de rå hændelser gav 43.
 *    Vores tal skal derfor kunne stemme med Klaviyos UI — og det kan de kun,
 *    hvis vi filtrerer på samme måde. Gør vi det ikke, får vi en uenighed,
 *    ingen kan forklare, og så stoler ingen på nogen af tallene.
 *
 * 3. VOLUMEN ER FOR LILLE TIL ÉT WEBINAR. En tirsdag giver måske 12
 *    ansøgninger fordelt på fem mails — to-tre pr. mail. Derfor dømmer dette
 *    lag IKKE. Det leverer `MaalingsInput` til lag 6 (`maalingsdom.ts`), som
 *    ejer «for få til at sige noget», niveauerne og Wilson-intervallerne. Én
 *    dom, ét sted — se afsnittet «Til lag 6» nederst.
 */

// ── Hændelsen, som den ser ud efter hentningen ──────────────────────────────

export type Mailart = "modtaget" | "aabnet" | "klikket";

export interface Mailhaendelse {
  art: Mailart;
  /** ISO-8601 i UTC. */
  sket_ved: string;
  flow_id: string;
  besked_id: string;
  besked_navn: string;
  /** Klaviyos `machine_open`: postkassen hentede billedet, ikke mennesket. */
  maskine: boolean;
  /** Klaviyos `Bot Click`: en scanner fulgte linket. */
  bot: boolean;
  url: string | null;
}

/** Bevis kræver et menneske. En maskinåbning og et botklik er trafik, ikke interesse. */
export function erMenneskeligt(h: Mailhaendelse): boolean {
  return !h.maskine && !h.bot;
}

// ── Forløbet ────────────────────────────────────────────────────────────────

export interface BeskedIForloeb {
  flow_id: string;
  besked_id: string;
  besked_navn: string;
  modtaget_ved: string | null;
  /** Første MENNESKELIGE åbning før skæringen. */
  aabnet_ved: string | null;
  /** Første MENNESKELIGE klik før skæringen. */
  klikket_ved: string | null;
  /** Talt, ikke brugt som bevis. Står med, så en uenighed kan forklares. */
  maskinaabninger: number;
  botklik: number;
}

/**
 * Hvorfor en ansøgning ikke kunne kobles. ÆRLIG MARKERING, ikke en tom liste:
 * de tre grunde har vidt forskellige konsekvenser, og en dom, der blander dem,
 * lyver.
 */
export type Kobling =
  /** Personen fik mindst én mail, og åbnede mindst én som menneske. */
  | "fuld"
  /** Fik mail, men åbnede aldrig (som menneske). Mailen KAN have virket alligevel — den blev læst i preview, eller personen kom fra en annonce. */
  | "modtaget_uden_aabning"
  /** Findes i Klaviyo, men fik ingen af vores flowmails før ansøgningen. */
  | "ingen_mail_foer"
  /** Findes slet ikke i Klaviyo på den mailadresse. Ansøgte med en anden adresse, eller kom uden om flowet. */
  | "ikke_i_klaviyo";

export interface Forloeb {
  /** Kronologisk efter modtagelse. */
  beskeder: BeskedIForloeb[];
  antal_modtaget: number;
  antal_aabnet: number;
  antal_klikket: number;
  /** Den sidste mail personen MODTOG før ansøgningen. */
  sidste_mail_foer: BeskedIForloeb | null;
  timer_siden_sidste_mail: number | null;
  /** Den sidste mail personen ÅBNEDE før ansøgningen — tættere på en årsag. */
  sidste_aabnede_foer: BeskedIForloeb | null;
  timer_siden_sidste_aabning: number | null;
  kobling: Kobling;
}

const tid = (iso: string): number => Date.parse(iso);
const timer = (fra: number, til: number): number => Math.round(((til - fra) / 3_600_000) * 10) / 10;

/**
 * Bygger forløbet for ÉN person frem til `skaering` (ansøgningstidspunktet).
 *
 * `haendelser` må komme i vilkårlig rækkefølge og må gerne indeholde hændelser
 * EFTER skæringen — de sorteres fra her. At filtrere ved kilden ville betyde,
 * at den samme række ikke kan genbruges til en senere skæring, og så kan vi
 * ikke regne bagud. Historik, ikke øjebliksbillede.
 *
 * `findesIKlaviyo` skelner «ingen hændelser, fordi personen ikke findes» fra
 * «ingen hændelser, fordi personen ikke fik noget». Uden det flag ser de to ens
 * ud, og det er den forskel, hele ærligheden hænger på.
 */
export function byggForloeb(
  haendelser: readonly Mailhaendelse[],
  skaering: string,
  findesIKlaviyo = true,
): Forloeb {
  const t0 = tid(skaering);
  const foer = haendelser.filter((h) => Number.isFinite(tid(h.sket_ved)) && tid(h.sket_ved) < t0);

  const kort = new Map<string, BeskedIForloeb>();
  const hent = (h: Mailhaendelse): BeskedIForloeb => {
    const eksisterende = kort.get(h.besked_id);
    if (eksisterende) return eksisterende;
    const ny: BeskedIForloeb = {
      flow_id: h.flow_id, besked_id: h.besked_id, besked_navn: h.besked_navn,
      modtaget_ved: null, aabnet_ved: null, klikket_ved: null,
      maskinaabninger: 0, botklik: 0,
    };
    kort.set(h.besked_id, ny);
    return ny;
  };
  /** Tidligste vinder: den FØRSTE åbning er den, der ligger tættest på afsendelsen. */
  const tidligst = (a: string | null, b: string) => (a === null || tid(b) < tid(a) ? b : a);

  for (const h of foer) {
    const b = hent(h);
    if (h.art === "modtaget") { b.modtaget_ved = tidligst(b.modtaget_ved, h.sket_ved); continue; }
    if (h.art === "aabnet") {
      if (h.maskine) { b.maskinaabninger += 1; continue; }
      if (erMenneskeligt(h)) b.aabnet_ved = tidligst(b.aabnet_ved, h.sket_ved);
      continue;
    }
    if (h.bot) { b.botklik += 1; continue; }
    if (erMenneskeligt(h)) b.klikket_ved = tidligst(b.klikket_ved, h.sket_ved);
  }

  const beskeder = [...kort.values()].sort((a, b) => {
    if (a.modtaget_ved && b.modtaget_ved) return tid(a.modtaget_ved) - tid(b.modtaget_ved);
    if (a.modtaget_ved) return -1;
    if (b.modtaget_ved) return 1;
    return a.besked_id.localeCompare(b.besked_id);
  });

  const modtagne = beskeder.filter((b) => b.modtaget_ved !== null);
  const aabnede = beskeder.filter((b) => b.aabnet_ved !== null);
  const sidsteMail = modtagne.length ? modtagne[modtagne.length - 1] : null;
  const sidsteAabnet = aabnede.length
    ? aabnede.reduce((a, b) => (tid(b.aabnet_ved!) > tid(a.aabnet_ved!) ? b : a))
    : null;

  const kobling: Kobling = !findesIKlaviyo
    ? "ikke_i_klaviyo"
    : modtagne.length === 0
      ? "ingen_mail_foer"
      : aabnede.length === 0
        ? "modtaget_uden_aabning"
        : "fuld";

  return {
    beskeder,
    antal_modtaget: modtagne.length,
    antal_aabnet: aabnede.length,
    antal_klikket: beskeder.filter((b) => b.klikket_ved !== null).length,
    sidste_mail_foer: sidsteMail,
    timer_siden_sidste_mail: sidsteMail ? timer(tid(sidsteMail.modtaget_ved!), t0) : null,
    sidste_aabnede_foer: sidsteAabnet,
    timer_siden_sidste_aabning: sidsteAabnet ? timer(tid(sidsteAabnet.aabnet_ved!), t0) : null,
    kobling,
  };
}

// ── Til lag 6 ───────────────────────────────────────────────────────────────

/**
 * LAG 6 DØMMER. IKKE DETTE LAG. (Rettet 20/9.)
 *
 * Første udkast havde sin egen `maal()` med egne grænser. Imens blev lag 6
 * bygget (`maalingsdom.ts`, #1033) med Wilson-intervaller, tre niveauer og
 * `nokTilAtSigeNoget` på hvert forhold. To domme med to grænser ville svare
 * forskelligt på samme tal — og så stoler ingen på nogen af dem. `maal()` er
 * fjernet. Dette lag leverer `MaalingsInput` i præcis den form, lag 6 læser.
 *
 * Typerne herunder er lag 6's, gentaget strukturelt, så spejlet i `_shared`
 * kan bygges uden at importere fra `src/`. Prøven `tilMaalingsInput leverer
 * det, lag 6 faktisk læser` tildeler resultatet til lag 6's egen `MaalingsInput`
 * — driver de to fra hinanden, er det en rød prøve, ikke en tavs uenighed.
 */
export interface MailUdsendelse {
  mail_id: string;
  mail_navn: string;
  email: string;
  trin: number;
  modtaget_at: string | null;
  aabnet_at: string | null;
  klikket_at: string | null;
}
export interface Deltager { email: string; session_id: string; session_tid: string }
export interface Ansoegning { email: string; indsendt_at: string; blev_medlem: boolean }
export interface MaalingsInput {
  udsendelser: readonly MailUdsendelse[];
  deltagere: readonly Deltager[];
  ansoegninger: readonly Ansoegning[];
}

/** En hændelsesrække med den person, den hører til. Det er tabellens form. */
export interface RaekkeMedEmail extends Mailhaendelse { email: string }

/**
 * TRINNET UDLEDES, IKKE HUSKES. Lag 6 vil vide, hvilken mail der er nr. 1, 2, 3
 * i et flow. Ingen hændelse bærer det tal. Men rækkefølgen kan regnes: inden
 * for ét flow er den mail, der tidligst er sendt til nogen, nr. 1. Med fem
 * hundrede modtagere pr. mail er den tidligste modtagelse et stabilt mål —
 * og den følger med, når et flow bygges om, hvor en hardkodet liste ville lyve.
 */
export function udledTrin(raekker: readonly RaekkeMedEmail[]): Map<string, number> {
  const tidligst = new Map<string, { flow: string; t: number }>();
  for (const r of raekker) {
    if (r.art !== "modtaget") continue;
    const t = tid(r.sket_ved);
    if (!Number.isFinite(t)) continue;
    const h = tidligst.get(r.besked_id);
    if (!h || t < h.t) tidligst.set(r.besked_id, { flow: r.flow_id, t });
  }
  const prFlow = new Map<string, Array<{ besked: string; t: number }>>();
  for (const [besked, { flow, t }] of tidligst) {
    const l = prFlow.get(flow) ?? [];
    l.push({ besked, t });
    prFlow.set(flow, l);
  }
  const trin = new Map<string, number>();
  for (const l of prFlow.values()) {
    l.sort((a, b) => a.t - b.t || a.besked.localeCompare(b.besked));
    l.forEach((x, i) => trin.set(x.besked, i + 1));
  }
  return trin;
}

/**
 * Fra tabellens rækker til lag 6's `udsendelser`: én pr. (person, mail), med
 * FØRSTE menneskelige åbning og FØRSTE menneskelige klik. Maskiner og botter
 * tælles ikke med — lag 6 skal aldrig se dem som åbninger.
 */
export function tilUdsendelser(raekker: readonly RaekkeMedEmail[]): MailUdsendelse[] {
  const trin = udledTrin(raekker);
  const kort = new Map<string, MailUdsendelse>();
  const noegle = (r: RaekkeMedEmail) => `${r.email}\u0000${r.besked_id}`;
  const tidligstAf = (a: string | null, b: string) => (a === null || tid(b) < tid(a) ? b : a);
  for (const r of raekker) {
    if (!Number.isFinite(tid(r.sket_ved))) continue;
    let u = kort.get(noegle(r));
    if (!u) {
      u = { mail_id: r.besked_id, mail_navn: r.besked_navn, email: r.email.toLowerCase(), trin: trin.get(r.besked_id) ?? Number.MAX_SAFE_INTEGER, modtaget_at: null, aabnet_at: null, klikket_at: null };
      kort.set(noegle(r), u);
    }
    if (r.art === "modtaget") u.modtaget_at = tidligstAf(u.modtaget_at, r.sket_ved);
    else if (!erMenneskeligt(r)) continue;
    else if (r.art === "aabnet") u.aabnet_at = tidligstAf(u.aabnet_at, r.sket_ved);
    else u.klikket_at = tidligstAf(u.klikket_at, r.sket_ved);
  }
  return [...kort.values()];
}

export function tilMaalingsInput(
  raekker: readonly RaekkeMedEmail[],
  deltagere: readonly Deltager[],
  ansoegninger: readonly Ansoegning[],
): MaalingsInput {
  return { udsendelser: tilUdsendelser(raekker), deltagere, ansoegninger };
}

// ── Hvor stor er gruppen, der ikke kan kobles? ──────────────────────────────

export type KoblingsOversigt = Record<Kobling, number> & { i_alt: number };

/**
 * Tæller koblingen over alle ansøgninger. Det er DET tal, README'en lovede —
 * og spejlet af view'et `klaviyo_kobling_oversigt`, som regner det samme i SQL.
 * `iKlaviyo` er de adresser, der findes i tabellen overhovedet; uden det kan
 * «ikke i Klaviyo» ikke skelnes fra «fik ingen mail».
 */
export function koblingsOversigt(
  ansoegninger: readonly Ansoegning[],
  raekkerPrEmail: ReadonlyMap<string, readonly Mailhaendelse[]>,
  iKlaviyo: ReadonlySet<string>,
): KoblingsOversigt {
  const o: KoblingsOversigt = { fuld: 0, modtaget_uden_aabning: 0, ingen_mail_foer: 0, ikke_i_klaviyo: 0, i_alt: 0 };
  for (const a of ansoegninger) {
    const e = a.email.toLowerCase();
    const f = byggForloeb(raekkerPrEmail.get(e) ?? [], a.indsendt_at, iKlaviyo.has(e));
    o[f.kobling] += 1;
    o.i_alt += 1;
  }
  return o;
}
