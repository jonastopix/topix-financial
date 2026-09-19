/**
 * maalingsdom — lag 6: hvad tallene betyder, og hvornår de ikke betyder noget.
 *
 * DET ER HER, MASKINEN KAN GÅ GALT. Lag 5 giver tal. En agent, der konkluderer
 * «mail 3 virker bedst» på tre ansøgninger, tager fejl omtrent halvdelen af
 * gangene — og ændrer noget, der virkede. Derfor er lagets vigtigste opgave
 * ikke at finde mønstre, men at vide, hvornår der ikke er nogen.
 *
 * DERFOR ER «FOR FÅ» EN VÆRDI, IKKE EN FODNOTE. Hvert forhold i dette lag
 * bærer `nokTilAtSigeNoget` og en `saetning`. Når svaret er nej, er sætningen
 * dét, der skal vises — ikke procenten med en stjerne ved siden af. Et tal,
 * der ikke bærer, må ikke stå, hvor et tal der bærer ville stå.
 *
 * TRE NIVEAUER, DØMT — IKKE HUSKET:
 *   observation    Ét webinar. Kun «hvad skete der». Aldrig en anbefaling.
 *   moenster       Tre–fire. Mønstre med forbehold.
 *   sammenligning  Mange. Sammenligning og anbefalinger.
 * Niveauet regnes af `doemNiveau` ud fra BÅDE antal sessioner og den mindste
 * gruppe, der indgår — en konklusion er kun så stærk som sin svageste nævner.
 * Fire sessioner med fem mennesker hver er ikke fire sessioners viden.
 *
 * SIDST ÅBNET ER IKKE ÅRSAG. Feltet hedder `sidstAabnetFoer`, og typen bærer
 * forbeholdet med sig, så det ikke kan tabes på vejen til en flade eller en
 * agent. Den, der åbnede mail 3 og ansøgte, havde måske besluttet sig inden.
 *
 * REN DOM. Ingen IO, ingen Supabase, ingen Deno — alt gives ind. Lag 5 leverer
 * `MaalingsInput`; formen står i README'en, og den findes ikke endnu.
 */
import {
  intervalOrd,
  kvartiler,
  median,
  pct,
  sammenlign,
  wilson,
  type Interval,
  type Sammenligning,
} from "./statistik";

// ── Det lag 5 skal levere ──────────────────────────────────────────────────

/** Én mail sendt til ét menneske. Klaviyos flow-mails, ikke vores hændelser. */
export interface MailUdsendelse {
  mail_id: string;
  mail_navn: string;
  /** Altid små bogstaver — koblingen til alt andet er mailen. */
  email: string;
  /** Rækkefølgen i flowet: 1 er den første. Bruges til at læse trappen. */
  trin: number;
  modtaget_at: string | null;
  /** FØRSTE åbning. Senere åbninger er ikke interessante her. */
  aabnet_at: string | null;
  klikket_at: string | null;
}

/** En person, der var til et webinar. Fra webinar_tilmeldinger. */
export interface Deltager {
  email: string;
  /** Sessionens id — webinar_id + starttid. Én session er én «runde». */
  session_id: string;
  session_tid: string;
}

/** En indsendt ansøgning. Fra ansoegninger + companies. */
export interface Ansoegning {
  email: string;
  indsendt_at: string;
  blev_medlem: boolean;
}

export interface MaalingsInput {
  udsendelser: readonly MailUdsendelse[];
  deltagere: readonly Deltager[];
  ansoegninger: readonly Ansoegning[];
}

// ── Tærsklerne ─────────────────────────────────────────────────────────────

/**
 * Antal sessioner, før mønstre må nævnes. Tre er ikke et statistisk tal — det
 * er det mindste, hvor «det skete igen» kan adskilles fra «det skete».
 */
export const SESSIONER_FOR_MOENSTER = 3;

/**
 * Antal sessioner, før mails må sammenlignes og noget anbefales. Otte, fordi
 * ét webinar giver ~13 ansøgninger ved husets egne erfaringstal (345 tilmeldte
 * → 37 % fremmøde → 10 % ansøger); otte sessioner er ~100 ansøgninger, og
 * først dér begynder to mails' andele at kunne skelnes.
 */
export const SESSIONER_FOR_SAMMENLIGNING = 8;

/**
 * Mindste gruppe, før en ANDEL overhovedet skrives. Under fem er den relative
 * usikkerhed ~1/√n ≈ 45 % eller mere — tallet er én hændelse, ikke et mønster.
 * Samme grænse som annoncepriserne bruger, og af samme grund.
 */
export const PERSONER_FOR_ET_FORHOLD = 5;

/**
 * Mindste antal HÆNDELSER (ikke personer) i hver gruppe, før to andele må
 * sammenlignes. Fem er den klassiske grænse for, at en andel overhovedet er
 * stabil; under den er intervallet bredere end forskellen, vi leder efter.
 */
export const HAENDELSER_FOR_SAMMENLIGNING = 5;

/**
 * HVOR MEGET MÅ ÆNDRES AD GANGEN: ÉN ting pr. flow pr. runde.
 *
 * Begrundelsen er ikke forsigtighed, det er aritmetik. Ændres to ting
 * samtidig, og tallet flytter sig, kan bidraget kun skilles ad med et
 * faktorielt forsøg — og det kræver flere gange den datamængde, vi
 * nogensinde får. Ved ~13 ansøgninger pr. webinar og otte sessioner til én
 * sammenligning ville to samtidige ændringer kræve fire gange så lang tid at
 * afgøre som to ændringer efter hinanden. Én ad gangen er altså ikke bare
 * mere sikkert — det er HURTIGERE.
 *
 * En «runde» slutter, når der er kommet SESSIONER_FOR_MOENSTER nye sessioner
 * siden ændringen. Før det er der intet at læse.
 */
export const MAKS_AENDRINGER_PR_RUNDE = 1;

/** Vinduerne, vi måler ansøgninger i. Timer efter mailen blev modtaget. */
export const VINDUER_TIMER = [24, 48, 168] as const;
export type VindueTimer = (typeof VINDUER_TIMER)[number];

export type Niveau = "observation" | "moenster" | "sammenligning";

export interface Niveaudom {
  niveau: Niveau;
  sessioner: number;
  /** Den mindste gruppe, nogen konklusion ville hvile på. */
  mindsteGruppe: number;
  /** Sætningen, der skal stå — ikke gemmes. */
  saetning: string;
  /** Hvad der mangler, før næste niveau nås. Tomt på højeste niveau. */
  mangler: string | null;
}

/**
 * Niveauet. BEGGE betingelser skal være opfyldt — sessioner OG den mindste
 * gruppe. Fire sessioner med fem mennesker hver bærer ikke en sammenligning,
 * uanset hvor mange sessioner der er.
 */
export function doemNiveau(sessioner: number, mindsteGruppe: number): Niveaudom {
  const s = Math.max(0, Math.floor(sessioner));
  const g = Math.max(0, Math.floor(mindsteGruppe));
  if (s >= SESSIONER_FOR_SAMMENLIGNING && g >= HAENDELSER_FOR_SAMMENLIGNING) {
    return {
      niveau: "sammenligning",
      sessioner: s,
      mindsteGruppe: g,
      saetning: `${s} webinarer og mindst ${g} i hver gruppe — mails kan sammenlignes, og en anbefaling kan bæres.`,
      mangler: null,
    };
  }
  if (s >= SESSIONER_FOR_MOENSTER && g >= PERSONER_FOR_ET_FORHOLD) {
    const mangler = s < SESSIONER_FOR_SAMMENLIGNING
      ? `${SESSIONER_FOR_SAMMENLIGNING - s} webinarer mere`
      : `mindst ${HAENDELSER_FOR_SAMMENLIGNING} hændelser i hver gruppe (mindste er ${g})`;
    return {
      niveau: "moenster",
      sessioner: s,
      mindsteGruppe: g,
      saetning: `${s} webinarer — mønstre kan nævnes med forbehold, men intet kan anbefales endnu.`,
      mangler: `${mangler}, før mails kan sammenlignes.`,
    };
  }
  const hvorfor = s < SESSIONER_FOR_MOENSTER
    ? `kun ${s} ${s === 1 ? "webinar" : "webinarer"}`
    : `mindste gruppe er ${g}`;
  return {
    niveau: "observation",
    sessioner: s,
    mindsteGruppe: g,
    saetning: `FOR FÅ TIL AT SIGE NOGET: ${hvorfor}. Tallene nedenfor er observationer, ikke mønstre — de siger hvad der skete, ikke hvad der virker.`,
    mangler: `${Math.max(0, SESSIONER_FOR_MOENSTER - s)} webinarer mere, før mønstre kan nævnes.`,
  };
}

// ── Et forhold, der ved hvor lidt det ved ──────────────────────────────────

export interface Forhold {
  succes: number;
  n: number;
  interval: Interval | null;
  /** Falsk under PERSONER_FOR_ET_FORHOLD. Så skal `saetning` vises i stedet. */
  nokTilAtSigeNoget: boolean;
  /**
   * Det, der skal STÅ. Ved for få: «2 af 3 — for få til at sige noget».
   * Ved nok: «14 % (4–38 %) af 42». Aldrig et tal uden sin nævner.
   */
  saetning: string;
}

export function forhold(succes: number, n: number, hvad: string): Forhold {
  const i = wilson(succes, n);
  const nok = n >= PERSONER_FOR_ET_FORHOLD;
  const s = Math.max(0, Math.floor(succes));
  const antal = Math.max(0, Math.floor(n));
  if (antal === 0) {
    return { succes: 0, n: 0, interval: null, nokTilAtSigeNoget: false, saetning: `ingen ${hvad} endnu` };
  }
  return {
    succes: s,
    n: antal,
    interval: i,
    nokTilAtSigeNoget: nok,
    saetning: nok
      ? `${intervalOrd(i)} — ${s} af ${antal} ${hvad}`
      : `${s} af ${antal} ${hvad} — FOR FÅ TIL AT SIGE NOGET`,
  };
}

// ── 1. Hvad skete der, pr. mail ────────────────────────────────────────────

export interface MailMaaling {
  mail_id: string;
  mail_navn: string;
  trin: number;
  modtaget: number;
  aabnet: Forhold;
  klikket: Forhold;
  /**
   * Ansøgte inden for N timer efter at have MODTAGET mailen. NÆVNEREN er kun
   * dem, hvis vindue FAKTISK er gået — se `modneInden`.
   */
  ansoegteInden: Record<VindueTimer, Forhold>;
  /**
   * Hvor mange af modtagerne, hvis N timer er gået, da målingen blev lavet.
   * Er den mindre end `modtaget`, er tallet ovenfor ikke færdigt endnu.
   */
  modneInden: Record<VindueTimer, number>;
  blevMedlem: Forhold;
}

const tid = (iso: string | null | undefined): number | null => {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

const mail = (v: string | null | undefined): string => (typeof v === "string" ? v.trim().toLowerCase() : "");

/**
 * VINDUET SKAL VÆRE GÅET, FØR DET TÆLLES MED (fundet i onsdagsprøven, 19/9).
 * Den første udgave delte «ansøgte inden 168 t» med ALLE modtagere — også dem,
 * der fik mailen for tolv timer siden. Onsdag morgen efter det første webinar
 * ville hver eneste rate stå som «0 % (0–2 %)» og se ud som en dom over
 * flowet, selv om de 168 timer slet ikke var gået for nogen. Nævneren er derfor
 * kun de modtagere, hvis vindue er udløbet ved `nu`. Er der ingen, står der
 * «ingen … endnu» — ikke et nul, der ligner et svar.
 *
 * DET ER ÉT MØNSTER, IKKE TO FEJL. Annoncepriserne (`webinar/annoncepriser.ts`,
 * `afkort`) fandt samme sag fra den anden side: dér dækkede FORBRUGET en anden
 * periode end tilmeldingerne, og prisen blev fem gange for lav. Her dækker
 * NÆVNEREN en periode, der ikke er gået endnu, og raten bliver nul. Reglen er
 * den samme begge steder, og den er værd at kunne udenad:
 *
 *   TÆLLER OG NÆVNER SKAL DÆKKE SAMME PERIODE — OG EN PERIODE, DER IKKE ER
 *   GÅET, ER IKKE EN PERIODE.
 *
 * De to steder løser den forskelligt, fordi de mangler hver sin ende: dér
 * skæres vinduet ned til det, data dækker (`afkort`); her skæres RÆKKERNE fra,
 * hvis vindue ikke er lukket. Fælles er, at ingen af dem svarer med et tal, de
 * ikke har dækning for.
 */
export function maalMails(ind: MaalingsInput, nu: Date = new Date()): MailMaaling[] {
  const nuMs = nu.getTime();
  const ansoegtePrMail = new Map<string, Ansoegning>();
  for (const a of ind.ansoegninger) {
    const m = mail(a.email);
    const t = tid(a.indsendt_at);
    if (m === "" || t === null) continue;
    const haves = ansoegtePrMail.get(m);
    // FØRSTE ansøgning tæller. En person, der ansøger to gange, er én person.
    if (!haves || (tid(haves.indsendt_at) ?? Infinity) > t) ansoegtePrMail.set(m, a);
  }

  const perMail = new Map<string, MailUdsendelse[]>();
  for (const u of ind.udsendelser) {
    const liste = perMail.get(u.mail_id);
    if (liste) liste.push(u); else perMail.set(u.mail_id, [u]);
  }

  return [...perMail.entries()]
    .map(([id, liste]) => {
      const modtagne = liste.filter((u) => tid(u.modtaget_at) !== null);
      const n = modtagne.length;
      const aabnet = modtagne.filter((u) => tid(u.aabnet_at) !== null).length;
      const klikket = modtagne.filter((u) => tid(u.klikket_at) !== null).length;

      const inden = {} as Record<VindueTimer, Forhold>;
      const modne = {} as Record<VindueTimer, number>;
      for (const timer of VINDUER_TIMER) {
        const vindue = timer * 3_600_000;
        // Kun dem, hvis vindue er GÅET. Resten har stadig tid tilbage.
        const udloebne = modtagne.filter((u) => (tid(u.modtaget_at) as number) + vindue <= nuMs);
        const antal = udloebne.filter((u) => {
          const a = ansoegtePrMail.get(mail(u.email));
          const m = tid(u.modtaget_at) as number;
          const s = a ? tid(a.indsendt_at) : null;
          return s !== null && s >= m && s - m <= vindue;
        }).length;
        modne[timer] = udloebne.length;
        inden[timer] = forhold(antal, udloebne.length, `ansøgte inden ${timer} t`);
      }

      const medlemmer = modtagne.filter((u) => ansoegtePrMail.get(mail(u.email))?.blev_medlem === true).length;
      return {
        mail_id: id,
        mail_navn: liste.find((u) => u.mail_navn)?.mail_navn ?? id,
        trin: Math.min(...liste.map((u) => (Number.isFinite(u.trin) ? u.trin : Number.MAX_SAFE_INTEGER))),
        modtaget: n,
        aabnet: forhold(aabnet, n, "modtagere åbnede"),
        klikket: forhold(klikket, n, "modtagere klikkede"),
        ansoegteInden: inden,
        modneInden: modne,
        blevMedlem: forhold(medlemmer, n, "modtagere blev medlem"),
      };
    })
    .sort((a, b) => a.trin - b.trin || a.mail_navn.localeCompare(b.mail_navn, "da"));
}

// ── 2. Hvornår ansøger folk ────────────────────────────────────────────────

export interface Tidsfordeling {
  /** Personer der BÅDE var til et webinar og ansøgte bagefter. */
  antal: number;
  medianTimer: number | null;
  p25Timer: number | null;
  p75Timer: number | null;
  hurtigsteTimer: number | null;
  langsomsteTimer: number | null;
  /** Hvor mange der faldt i hvert vindue. Kumulativt, som vinduerne læses. */
  indenfor: Record<VindueTimer, number>;
  /** Ansøgte efter det sidste vindue. Det tal afgør, om flowet er for kort. */
  efterSidsteVindue: number;
  /** Ansøgte FØR webinaret — ikke en ventetid, og ikke flowets fortjeneste. */
  foerWebinaret: number;
  saetning: string;
}

export function maalTid(ind: MaalingsInput): Tidsfordeling {
  const foersteSession = new Map<string, number>();
  for (const d of ind.deltagere) {
    const m = mail(d.email);
    const t = tid(d.session_tid);
    if (m === "" || t === null) continue;
    const haves = foersteSession.get(m);
    if (haves === undefined || t < haves) foersteSession.set(m, t);
  }

  const timer: number[] = [];
  let foer = 0;
  const set = new Set<string>();
  for (const a of ind.ansoegninger) {
    const m = mail(a.email);
    const s = tid(a.indsendt_at);
    if (m === "" || s === null || set.has(m)) continue;
    const w = foersteSession.get(m);
    if (w === undefined) continue;
    set.add(m);
    if (s < w) { foer++; continue; }
    timer.push((s - w) / 3_600_000);
  }

  const k = kvartiler(timer);
  const indenfor = {} as Record<VindueTimer, number>;
  for (const v of VINDUER_TIMER) indenfor[v] = timer.filter((t) => t <= v).length;
  const sidste = VINDUER_TIMER[VINDUER_TIMER.length - 1];
  const efter = timer.filter((t) => t > sidste).length;
  const med = median(timer);

  const saetning = timer.length === 0
    ? "Ingen har endnu både været til et webinar og ansøgt bagefter — der er ingen ventetid at måle."
    : timer.length < PERSONER_FOR_ET_FORHOLD
      ? `${timer.length} ${timer.length === 1 ? "person" : "personer"} — FOR FÅ TIL AT SIGE NOGET om hvornår folk ansøger. Tallene er enkelttilfælde.`
      : `Halvdelen ansøgte inden for ${Math.round(med ?? 0)} timer. ${indenfor[sidste]} af ${timer.length} inden for ${sidste} timer; ${efter} ventede længere.`;

  return {
    antal: timer.length,
    medianTimer: med,
    p25Timer: k?.p25 ?? null,
    p75Timer: k?.p75 ?? null,
    hurtigsteTimer: timer.length === 0 ? null : Math.min(...timer),
    langsomsteTimer: timer.length === 0 ? null : Math.max(...timer),
    indenfor,
    efterSidsteVindue: efter,
    foerWebinaret: foer,
    saetning,
  };
}

// ── 3. Hvilken mail gik forud ──────────────────────────────────────────────

/**
 * Forbeholdet bæres af TYPEN, ikke af en kommentar: den, der læser feltet,
 * læser også hvorfor det ikke er en årsag.
 */
export const SIDST_AABNET_FORBEHOLD =
  "«Sidst åbnet før» er ikke «årsag til». Den, der åbnede mail 3 og ansøgte, kan have besluttet sig inden mailen kom — og den, der ansøgte uden at åbne noget, blev også påvirket af flowet. Tallet siger hvilken mail der stod nærmest i tid, ikke hvilken der virkede.";

export interface ForudMaaling {
  mail_id: string | null;
  mail_navn: string;
  antal: number;
  forbehold: string;
}

export function maalForud(ind: MaalingsInput): ForudMaaling[] {
  const aabningerPrPerson = new Map<string, MailUdsendelse[]>();
  for (const u of ind.udsendelser) {
    if (tid(u.aabnet_at) === null) continue;
    const m = mail(u.email);
    const liste = aabningerPrPerson.get(m);
    if (liste) liste.push(u); else aabningerPrPerson.set(m, [u]);
  }

  const taeller = new Map<string, { navn: string; antal: number }>();
  const set = new Set<string>();
  for (const a of ind.ansoegninger) {
    const m = mail(a.email);
    const s = tid(a.indsendt_at);
    if (m === "" || s === null || set.has(m)) continue;
    set.add(m);
    const foer = (aabningerPrPerson.get(m) ?? [])
      .filter((u) => (tid(u.aabnet_at) as number) <= s)
      .sort((x, y) => (tid(y.aabnet_at) as number) - (tid(x.aabnet_at) as number));
    const valgt = foer[0];
    const noegle = valgt?.mail_id ?? "";
    const post = taeller.get(noegle) ?? { navn: valgt?.mail_navn ?? "åbnede ingen mail før", antal: 0 };
    post.antal++;
    taeller.set(noegle, post);
  }

  return [...taeller.entries()]
    .map(([id, p]) => ({ mail_id: id === "" ? null : id, mail_navn: p.navn, antal: p.antal, forbehold: SIDST_AABNET_FORBEHOLD }))
    .sort((a, b) => b.antal - a.antal);
}

// ── 4. Er det nok til at sige noget ────────────────────────────────────────

export interface Maalingsdom {
  niveau: Niveaudom;
  mails: MailMaaling[];
  tid: Tidsfordeling;
  forud: ForudMaaling[];
  /** Sessioner målingen bygger på. */
  sessioner: number;
  /** De sætninger, der skal stå ØVERST — ikke i en fodnote. */
  advarsler: string[];
}

/** Må de to mails' åbningsrater sammenlignes? Kun på højeste niveau, og kun med nok hændelser. */
export function maaSammenlignes(a: MailMaaling, b: MailMaaling, niveau: Niveau): boolean {
  if (niveau !== "sammenligning") return false;
  return a.aabnet.succes >= HAENDELSER_FOR_SAMMENLIGNING && b.aabnet.succes >= HAENDELSER_FOR_SAMMENLIGNING;
}

/** Sammenligningen selv — med «kan_ikke» som et lige så gyldigt svar. */
export function sammenlignMails(a: MailMaaling, b: MailMaaling, niveau: Niveau): { udfald: Sammenligning; saetning: string } {
  if (!maaSammenlignes(a, b, niveau)) {
    return {
      udfald: "kan_ikke",
      saetning: `${a.mail_navn} og ${b.mail_navn} kan ikke sammenlignes endnu — ${niveau === "sammenligning" ? `der skal være mindst ${HAENDELSER_FOR_SAMMENLIGNING} åbninger i hver` : "der er ikke webinarer nok"}.`,
    };
  }
  const u = sammenlign(a.aabnet.interval, b.aabnet.interval);
  return {
    udfald: u,
    saetning: u === "adskilte"
      ? `${a.mail_navn} ${intervalOrd(a.aabnet.interval)} mod ${b.mail_navn} ${intervalOrd(b.aabnet.interval)} — forskellen er reel.`
      : `${a.mail_navn} ${intervalOrd(a.aabnet.interval)} mod ${b.mail_navn} ${intervalOrd(b.aabnet.interval)} — intervallerne overlapper. Det betyder IKKE at de er ens; det betyder at vi ikke kan afgøre det.`,
  };
}

export function doemMaaling(ind: MaalingsInput, nu: Date = new Date()): Maalingsdom {
  const sessioner = new Set(ind.deltagere.map((d) => d.session_id).filter((s) => typeof s === "string" && s !== "")).size;
  const mails = maalMails(ind, nu);
  const tidsfordeling = maalTid(ind);
  const mindste = mails.length === 0 ? 0 : Math.min(...mails.map((m) => m.modtaget));
  const niveau = doemNiveau(sessioner, Math.min(mindste, tidsfordeling.antal));

  const advarsler: string[] = [niveau.saetning];
  if (niveau.mangler) advarsler.push(niveau.mangler);
  if (niveau.niveau === "observation") {
    advarsler.push("Der må IKKE anbefales ændringer på dette niveau. En ændring truffet på ét webinar rammer lige så ofte det, der virkede.");
  }
  if (tidsfordeling.foerWebinaret > 0) {
    advarsler.push(`${tidsfordeling.foerWebinaret} ansøgte FØR webinaret — de er ikke flowets fortjeneste og er holdt ude af ventetiden.`);
  }
  const sidsteVindue = VINDUER_TIMER[VINDUER_TIMER.length - 1];
  const umodne = mails.filter((m) => m.modneInden[sidsteVindue] < m.modtaget);
  if (umodne.length > 0) {
    advarsler.push(
      `Vinduet på ${sidsteVindue} timer er endnu ikke gået for alle modtagere af ${umodne.length === mails.length ? "nogen af mailene" : umodne.map((m) => m.mail_navn).join(", ")}. De tal er ikke færdige — de kan kun gå op.`,
    );
  }
  if (mails.length > 0 && tidsfordeling.antal > 0 && tidsfordeling.efterSidsteVindue > tidsfordeling.antal / 2) {
    advarsler.push(`Over halvdelen ansøgte senere end ${VINDUER_TIMER[VINDUER_TIMER.length - 1]} timer efter webinaret. Flowet kan være for kort.`);
  }
  return { niveau, mails, tid: tidsfordeling, forud: maalForud(ind), sessioner, advarsler };
}
