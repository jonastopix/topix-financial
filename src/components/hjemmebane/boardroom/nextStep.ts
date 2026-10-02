import { DANISH_MONTHS } from "@/lib/financialUtils";
import { PROFIL_STI } from "@/lib/hjemmebane/profilUdfyldt";
import type { Tjekliste } from "@/lib/onboardingTjekliste";
import { tjeklistenStyrerForsiden } from "@/lib/hjemmebane/ankomst";
import {
  dageTilDanskDato, foersteSkridtTitel, fristTitel, maalFokus, modMaaletLinje,
  MAAL_FOKUS_MAAL_CTA, MAAL_FOKUS_SKRIDT_CTA, MAAL_FOKUS_STI, MAAL_FOKUS_TILFOEJ_CTA,
  type MaalFokusMaal, type MaalFokusSkridt,
} from "@/lib/hjemmebane/maalFokus";

/** FOKUS-MOTOREN (forside PR 1, hb-forside-recon §D/§G): ÉN samlet,
    testbar prioriteringsdom for forsidens lag 1 — nu som PRIORITERET
    LISTE (deriveFocus), hvor forsiden senere viser #1 stort og #2-4 som
    stille linjer. deriveNextStep består som TYND WRAPPER (= liste[0]
    over de fire oprindelige kilder), så BoardroomView og dens tests er
    uændrede i denne PR.

    Kilderne og deres domme er ARVET ORDRET fra DashboardActionCenter/
    den oprindelige port: rapport-signalet (ActionCenter:110-139),
    ulæste rådgiver-/agent-beskeder (:150-163), pulse-nudgen GATED bag committed rapport
    (:166-176 "rapport først, så pulse som stillingtagen"),
    company_actions prioritetssorteret (:200-208 — kalderen leverer
    sorteringen, motoren bevarer ordenen), weekly_focus (indeværende
    uge, ikke set — edge-notifikationen "Ugens fokus er klar" lover den
    på "/", generate-weekly-focus:602-611). Nyt: løftestang uden
    milestone (handout-lærdommen) som ét samlet, stille punkt.

    ANKOMSTEN (trin 8, docs/indgangen-overhaling.md §5, Jonas 2/9):
    tjeklisten er forfremmet fra pille til fokuskort. Så længe tjeklisten
    IKKE er færdig, er dens ikke-gjorte punkter listens ENESTE kilde —
    første ikke-gjorte som #1, resten som linjer, i tjeklistens egen
    rækkefølge (TJEKLISTE_RAEKKEFOELGE). Når alle punkter er gjort,
    gælder prioriteringen (a)-(i) nedenfor som hidtil. Uden tjekliste
    (kalderen sender ingen — rådgivere, legacy) gælder (a)-(i) direkte.
    ERFARNE MEDLEMMER (30/9): er medlemmet kommet ind for mere end 30
    døgn siden (medlemSiden), slipper tjeklisten kortet, og (a)-(i)
    gælder — dommen og begrundelsen er tjeklistenStyrerForsiden i
    src/lib/hjemmebane/ankomst.ts, den samme som overskrift og pille.

    PRIORITERINGSRÆKKEFØLGEN (arkitekt-beslutning, fast — aldrig
    tilfældig tie-break):
      (0) tjeklistepunkt (kun mens tjeklisten er uafsluttet — se ovenfor)
      (a) manglende rapport            (b) rapport afventer godkendelse
          — over de to seneste afsluttede måneder, ældste først (30/9)
      (c) ubesvaret besked (rådgiver før agent — ActionCenter-ordenen)
      (d) weekly_focus (denne uge, ikke set)
      (e) MÅLET — ÉT punkt (genindført 1/10-2026, maal-produkt.md §4;
          dommen er maalFokus i src/lib/hjemmebane/maalFokus.ts): (1)
          nærmeste aktive skridt under et aktivt mål «mod målet: X», (2)
          aktivt mål uden noget i gang → «Tilføj det første skridt mod
          X», (3) målfrist ≤ 30 dage → «X: N dage tilbage». Under rapport
          og beskeder, over løse skridt — MEN kun (1) står ubetinget over
          (f): (2) og (3) lægges under et HASTENDE aktivt (f)-skridt
          (forfaldent eller frist inden for 7 danske dage; rådets fund 6,
          1/10). (Fra 16/9 til 1/10 var slottet UDGÅET — målet stod kun i
          «Din plan» længere nede.)
      (f) åbne company_actions (kalderens prioritetsorden)
      (g) pulse-nudge                  (h) løftestang uden milestone
      (i) tom netværksprofil (ask_me_about mangler) — LAVEST: en tom
          profil er aldrig vigtigere end tal, beskeder eller skridt;
          den skal kun dukke op i en rolig uge
    Tom liste = alt er ajour (kortet bærer forløbs-linket). */

export interface NextStepInputs {
  now: Date;
  /** Perioder m. processed rapport (effektive period-keys, "YYYY-MM"). */
  processedPeriodKeys: ReadonlySet<string>;
  /** Perioder m. godkendte (committed) tal i facts-laget. */
  committedPeriodKeys: ReadonlySet<string>;
  hasPulseThisMonth: boolean;
}

export interface FocusOpenAction {
  id: string;
  title: string;
  priority: string; // "high" | "medium" | "low" — kalderen har allerede sorteret (ActionCenter:205-208)
  /** company_actions.context — handlingens egen begrundelse fra
      AI-analysen. Nullable i databasen, derfor valgfri her. */
  context?: string | null;
  /** company_actions.status — 'proposed' (forslag, B1) | 'active'
      (accepteret, B6) | 'open' (arv). Valgfri: udeladt behandles som
      arve-'open'. */
  status?: string;
  /** "YYYY-MM-DD" for aktive opgaver (B3) — bærer beskrivelsens frist
      og fladens forfaldsdom. */
  due_date?: string | null;
  /** B7/B11-tælleren — afgør om "Ikke endnu" kan sendes uden dato. */
  deferral_count?: number;
  /** company_actions.expires_at (timestamptz, ISO-streng) — kun sat på
      forslag. Bruges af filtrerUdloebneForslag (B8), ikke af deriveFocus. */
  expires_at?: string | null;
}

/** B8 implementeret på læsesiden: et forslag forsvinder fra medlemmets
    liste når expires_at passerer. Kendsgerningen bliver i data — rækken
    står stadig som 'proposed', så tilstandslaget i fase 2 kan tælle den;
    asymmetrien (rådgiveren ved noget medlemmet ikke ser) er bevidst,
    design B8. Udløbs-cron'en der flytter status til 'expired' mangler
    stadig — denne filtrering er uafhængig af den og gør ingen skade den
    dag cron'en findes. Kun 'proposed' dømmes: en accepteret opgave har
    ingen udløbsdato at forholde sig til, og arve-'open' har ingen
    expires_at. expires_at er timestamptz, så der sammenlignes på
    tidsstempel, ikke kalenderdag (samme dom som opgaveEngine.erUdloebet:
    udløbet først når nu er EFTER tidspunktet). */
export function filtrerUdloebneForslag<T extends { status?: string; expires_at?: string | null }>(
  actions: T[],
  nu: Date,
): T[] {
  return actions.filter(
    (a) => !(a.status === "proposed" && a.expires_at != null && nu.getTime() > new Date(a.expires_at).getTime()),
  );
}

export interface FocusWeeklyFocus {
  /** KUN indeværende uges række — kalderen resolver uge-nøglen (ActionCenter:71-85). */
  headline: string | null;
  seen: boolean;
}

export interface FocusUnlinkedLever {
  lever: string;
  moduleTitle: string;
  /** Handouts i Akademiet (1/10-2026 nat): stien til den lektion, der bærer
      modulet — øvelsen (kalderen slår den op i kataloget, oevelseTilbage).
      Udeladt → Akademiets forside. Aldrig /handouts: medlemmet har ingen
      handout-liste længere. */
  sti?: string;
}

/** Hvor løftestangs-punktet (h) fører hen: lektionen, der bærer øvelsen, ellers Akademiet. */
export const OEVELSE_FALDBACK_STI = "/akademiet";

/** Udvidelsen af NextStepInputs (recon §D): de fire bogførte udeladelser
    + løftestængerne. En senere opgave-model adapters ind HER — dommen
    forbliver samlet i deriveFocus. */
export interface FocusInputs extends NextStepInputs {
  unreadUserMessages: number;
  unreadAgentMessages: number;
  weeklyFocus: FocusWeeklyFocus | null;
  openActions: FocusOpenAction[];
  unlinkedLevers: FocusUnlinkedLever[];
  /** Egen member_profiles.ask_me_about er null/tom. Kalderen gater
      rådgivere til false — de har ikke samme profilrolle. */
  askMeAboutMissing: boolean;
  /** companies.contract_start_date ("YYYY-MM-DD") — skrives af
      stripe-webhook på betalingsdagen. Slot (a) beder aldrig om en
      periode fra før kontrakten (regnestykket står ved slottet).
      Valgfri: udeladt/null = ukendt start = som hidtil (legacy og
      virksomheder uden dato). Kobles på i BoardroomView i trin 9. */
  contractStartDate?: string | null;
  /** Onboarding-tjeklisten (byggTjekliste) for det indloggede medlem.
      Uafsluttet tjekliste = listens eneste kilde (slot 0). Valgfri:
      udeladt/null = ingen tjekliste = (a)-(i) direkte. Trin 9 kobler
      useOnboardingTjekliste på. */
  tjekliste?: Tjekliste | null;
  /** profiles.created_at (TjeklisteInput.medlem_siden) — personens dag 0.
      Mere end 30 døgn før `now` = erfarent medlem = tjeklisten slipper
      kortet (tjeklistenStyrerForsiden). Valgfri: udeladt/null = ny = som
      før 30/9. */
  medlemSiden?: string | null;
  /** Slot (e), målet (1/10-2026): de mål og skridt med maal_id, forsiden
      ALLEREDE henter (milestonesQuery + skridtQuery). Dommen er maalFokus
      (ren, tiden = `now`). Valgfri: udeladt/null = intet målpunkt (fx når
      en af de to hentninger fejlede — et halvt billede må ikke give et
      forkert «tilføj det første skridt»). */
  maalPlan?: { maal: readonly MaalFokusMaal[]; skridt: readonly MaalFokusSkridt[] } | null;
}

export type FocusKind =
  | "tjekliste"
  | "missing-report"
  | "pending-approval"
  | "unread-messages"
  | "unread-agent"
  | "weekly-focus"
  | "maal"
  | "company-action"
  | "pulse"
  | "unlinked-lever"
  | "empty-profile";

export interface FocusItem {
  /** Stabil, unik nøgle (list-keys/dedup): kind + evt. kilde-id. */
  key: string;
  kind: FocusKind;
  /** Slot-nummer: tjekliste=0, (a)=1 … (i)=9 — listen ER sorteret efter den. */
  priority: number;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  sourceId?: string;
}

export interface NextStep {
  id: "missing-report" | "pending-approval" | "pulse";
  title: string;
  description: string;
  cta: string;
  link: string;
}

/** Et aktivt (f)-skridt med frist inden for så mange DANSKE dage (forfaldne
    medregnet) er «hastende» — målpunktets kilde (2) og (3) lægges under det
    (rådets fund 6, 1/10). Samme danske dag som maalFokus (dageTilDanskDato). */
export const HASTENDE_SKRIDT_DAGE = 7;

/** Er (f)-handlingen et hastende aktivt skridt? Kun status 'active' (ikke
    forslag, ikke arve-'open') med en læselig frist, hvis danske dag er
    passeret eller ligger højst HASTENDE_SKRIDT_DAGE dage fremme.
    Regnestykket: dage = dageTilDanskDato(due_date, now) ≤ 7 (negativ =
    forfalden). Eksempel: now = 10/8-2026 kl. 12 dansk; due «2026-08-17» →
    7 → hastende; «2026-08-18» → 8 → ikke. */
export function erHastendeSkridt(action: Pick<FocusOpenAction, "status" | "due_date">, now: Date): boolean {
  if (action.status !== "active" || !action.due_date) return false;
  const dage = dageTilDanskDato(action.due_date, now);
  return dage != null && dage <= HASTENDE_SKRIDT_DAGE;
}

/** Tillægget om målets frist i kilde (1) — rådets fund 12 (1/10): en
    passeret frist og en frist i dag siges som en sætning, ikke som
    «Målets frist: fristen er passeret». */
export function maalFristTillaeg(dage: number | null): string {
  if (dage == null) return "";
  if (dage < 0) return " Fristen for målet er passeret.";
  if (dage === 0) return " Fristen for målet er i dag.";
  return ` Målets frist: ${dage === 1 ? "1 dag" : `${dage} dage`} tilbage.`;
}

/** "YYYY-MM-DD" → "4. september" — splitter selv frem for new Date():
    Date-parsning af en ren dato er UTC og kan skride en kalenderdag i
    lokal tid. */
const formatDanskDato = (dato: string): string => {
  const [, m, d] = dato.split("-").map(Number);
  return `${d}. ${DANISH_MONTHS[m - 1].toLowerCase()}`;
};

/** Ankomstens ctaLabel — ét ord for alle punkter; fladen (trin 9) må
    vise punktets titel stort og denne som knap. velkomst har sti "" (åbnes
    i boksen, ikke på en side) — den bæres uændret i ctaHref, så fladen
    kan skelne. */
const TJEKLISTE_CTA = "Gør det nu";

/** Første periodenøgle ("YYYY-MM") slot (a) må bede om, givet
    kontraktstarten "YYYY-MM-DD". REGNESTYKKET: periodenøgler er HELE
    kalendermåneder (prevKey = måneden før `now`), og en rapport dækker
    hele måneden. Den første måned kontrakten dækker HELT er derfor
      - startmåneden selv, hvis kontrakten starter den 1. (2026-09-01 →
        "2026-09"),
      - ellers måneden efter (2026-09-15 → "2026-10"; 2026-12-15 →
        "2027-01" — årsskiftet bæres af Date.UTC-normaliseringen).
    En virksomhed der betalte 15/9 bliver altså først bedt om tal i
    november (om oktober); i oktober er prevKey "2026-09" < "2026-10", og
    slottet tier. Ugyldig dato → null = ukendt = som hidtil. Splitter selv
    frem for new Date(): en ren dato parses som UTC og kan skride en dag. */
export function foersteRapportPeriode(contractStartDate: string | null | undefined): string | null {
  if (!contractStartDate) return null;
  const [y, m, d] = contractStartDate.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return null;
  const foerste = d === 1 ? new Date(Date.UTC(y, m - 1, 1)) : new Date(Date.UTC(y, m, 1));
  return `${foerste.getUTCFullYear()}-${String(foerste.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** En afsluttet kalendermåned set fra `now`: n = 1 er forrige måned,
    n = 2 forrige-forrige. Lokal tid som prevKey altid har været; Date
    normaliserer månedsunderløb over årsskiftet (januar − 2 = november
    året før). */
interface AfsluttetMaaned {
  key: string; // "YYYY-MM"
  aar: number;
  navn: string; // dansk, små bogstaver
}
function maanedFoer(now: Date, n: number): AfsluttetMaaned {
  const d = new Date(now.getFullYear(), now.getMonth() - n, 1);
  const m = d.getMonth();
  const aar = d.getFullYear();
  return { key: `${aar}-${String(m + 1).padStart(2, "0")}`, aar, navn: DANISH_MONTHS[m].toLowerCase() };
}

/** Rapport-dommen for ÉN måned: (a) mangler, (b) afventer godkendelse,
    eller null (i orden / før kontraktstart). Værnet mod kontraktstarten
    gælder KUN (a) — se deriveFocus. */
function rapportPunkt(
  m: AfsluttetMaaned,
  processed: ReadonlySet<string>,
  committed: ReadonlySet<string>,
  foersteKey: string | null,
): FocusItem | null {
  const hasProcessed = processed.has(m.key);
  const hasCommitted = committed.has(m.key);
  const foerKontraktstart = foersteKey !== null && m.key < foersteKey;
  if (!hasProcessed && !foerKontraktstart) {
    return {
      key: "missing-report",
      kind: "missing-report",
      priority: 1,
      title: `Upload dine ${m.navn}-tal`,
      description: `Så er ${m.navn} ${m.aar} med, og din rådgiver kan se fremad med dig.`,
      ctaLabel: "Upload tallene",
      ctaHref: "/reports",
    };
  }
  if (hasProcessed && !hasCommitted) {
    return {
      key: "pending-approval",
      kind: "pending-approval",
      priority: 2,
      title: `Godkend dine ${m.navn}-tal`,
      description: `Tallene for ${m.navn} ${m.aar} er uploadet, men ikke godkendt endnu — godkend dem, så de kommer i drift.`,
      ctaLabel: "Godkend tallene",
      ctaHref: "/reports",
    };
  }
  return null;
}

export function deriveFocus(inputs: FocusInputs): FocusItem[] {
  const { now } = inputs;
  const forrige = maanedFoer(now, 1);
  const prevKey = forrige.key;
  const monthName = forrige.navn;

  const items: FocusItem[] = [];

  // (0) ANKOMSTEN — tjeklisten er kilden så længe den ikke er færdig.
  // Punkternes rækkefølge er tjeklistens egen; kun ikke-gjorte punkter
  // kommer med (første = #1). Titel/beskrivelse/sti genbruges som
  // title/description/ctaHref. Listen returneres HER: mens man er ved at
  // komme ind, konkurrerer intet andet om kortet (§5). Færdig tjekliste
  // (eller ingen) → falder igennem til (a)-(i). Et ERFARENT medlem (30/9,
  // mere end 30 døgn siden medlemSiden) falder også igennem — samme dom som
  // overskriften og pillen (tjeklistenStyrerForsiden, ankomst.ts).
  if (inputs.tjekliste && tjeklistenStyrerForsiden(inputs.tjekliste, inputs.medlemSiden, now)) {
    for (const punkt of inputs.tjekliste.punkter) {
      if (punkt.gjort) continue;
      items.push({
        key: `tjekliste:${punkt.id}`,
        kind: "tjekliste",
        priority: 0,
        title: punkt.titel,
        description: punkt.beskrivelse,
        ctaLabel: TJEKLISTE_CTA,
        ctaHref: punkt.sti,
        sourceId: punkt.id,
      });
    }
    return items;
  }

  // Pulse-gaten (g) læser stadig KUN forrige måned.
  const hasProcessed = inputs.processedPeriodKeys.has(prevKey);
  const hasCommitted = inputs.committedPeriodKeys.has(prevKey);

  // Kontraktstart-værnet for (a): perioden må ikke ligge FØR den første
  // hele måned kontrakten dækker (foersteRapportPeriode — regnestykket
  // står dér). Nøglerne er "YYYY-MM" med nulfyld, så strengsammenligning
  // er kronologisk. Ukendt start (null) → intet værn = som hidtil.
  // Værnet gælder KUN (a): findes der uploadede tal for perioden ((b)/
  // (g)), findes tallene, og så er der noget at godkende og tage
  // stilling til uanset kontraktstart.
  const foersteKey = foersteRapportPeriode(inputs.contractStartDate);

  // (a)/(b) DE TO SENESTE AFSLUTTEDE MÅNEDER, ÆLDSTE FØRST (30/9, rådets
  // gennemsyn af PR #1192). Før så slottet KUN på forrige måned. Fristen er
  // den 20. i måneden efter (påmindelser dag 7/15/20), så den 1. i en måned
  // er den forrige-forrige måneds frist allerede passeret, mens den
  // forrige måned lige er begyndt at løbe — og så forsvandt den forrige-
  // forrige måned fra kortet, netop mens den var mest forsinket.
  //   REGNESTYKKET: kandidaterne er maanedFoer(now, 2) og maanedFoer(now, 1)
  //   — i den rækkefølge. EKSEMPEL: now = 1/10-2026 →
  //     forrige-forrige = maanedFoer(now, 2) = "2026-08" (august),
  //     forrige         = maanedFoer(now, 1) = "2026-09" (september).
  //   August uploadet, ikke godkendt; september mangler
  //     → «Godkend dine august-tal» (august dømmes først og vinder).
  //   August godkendt; september mangler → august giver null
  //     → «Upload dine september-tal».
  //   now = 15/9 → juli og august; juli i orden → august dømmes som før.
  // Den FØRSTE måned med et punkt vælges, og kun ét rapportpunkt vises
  // (samme som før: (a) og (b) udelukker hinanden, og byggerækkefølgen
  // forbliver prioritetsordenen). KUN de to seneste — ikke længere
  // tilbage: ellers dukker gammel historik op (et hul fra i foråret) og
  // overdøver den måned, der faktisk er aktuel. Kontraktværnet gælder hver
  // måned for sig: en måned før den første hele kontraktmåned beder (a)
  // aldrig om.
  for (const m of [maanedFoer(now, 2), forrige]) {
    const punkt = rapportPunkt(m, inputs.processedPeriodKeys, inputs.committedPeriodKeys, foersteKey);
    if (punkt) {
      items.push(punkt);
      break;
    }
  }

  // (c) Ubesvarede beskeder — rådgiver før agent (ActionCenter:150-163,
  // tekster ordret; tælle-bøjningen fra :155).
  if (inputs.unreadUserMessages > 0) {
    const count = inputs.unreadUserMessages;
    items.push({
      key: "unread-messages",
      kind: "unread-messages",
      priority: 3,
      title: `${count} ulæst${count > 1 ? "e" : ""} besked${count > 1 ? "er" : ""}`,
      description: "Du har ubesvaret kommunikation fra dine rådgivere",
      ctaLabel: "Åbn chatten",
      ctaHref: "/chat",
    });
  }
  if (inputs.unreadAgentMessages > 0) {
    items.push({
      key: "unread-agent",
      kind: "unread-agent",
      priority: 3,
      title: "Din AI-chef har en ny indsigt",
      description: "Der er en ny analyse af dine tal klar i chatten",
      ctaLabel: "Åbn chatten",
      ctaHref: "/chat",
    });
  }

  // (d) Ugens fokus — indeværende uge, IKKE set. Titlen matcher
  // notifikations-kontrakten ("Ugens fokus er klar"). Href er forsiden
  // selv — visningen afgør formen (indlejret/scroll), motoren er UI-agnostisk.
  // SET (afgjort 11/9): punktet rykker BAGERST (prioritet 10, efter alt
  // andet) i stedet for at forsvinde. Kortet er resuméets ENESTE hjem på
  // forsiden (FocusCard læser summary INLINE i dette punkt; der er intet
  // resumé nedenunder), og markSeen stempler ved første RENDER — også som
  // stille linje nr. 4 — så «forsvinder efter første visning» ville gøre
  // ugens fokus ulæseligt resten af ugen efter ét blik. Bagerst: aldrig
  // forrest igen, men stadig at finde, til ugen er omme. Se (j) nederst.
  if (inputs.weeklyFocus && !inputs.weeklyFocus.seen) {
    items.push({
      key: "weekly-focus",
      kind: "weekly-focus",
      priority: 4,
      title: "Ugens fokus er klar",
      description: inputs.weeklyFocus.headline ?? "Din AI-chef har lagt ugens fokus klar til dig.",
      ctaLabel: "Se ugens fokus",
      ctaHref: "/",
    });
  }

  // (e) MÅLET — ét punkt, aldrig flere (1/10-2026). Fra 16/9 var slottet
  // UDGÅET («et fokuspunkt oveni sagde det samme to steder»); målt 1/10:
  // 6 af 36 aktive mål havde et skridt — kortet øverst skal pege på målet.
  // Dommen og kildernes rækkefølge står i maalFokus.ts. Er punktet et
  // skridt, springer (f) netop det skridt over (samme ting to gange).
  // PLADSEN (rådets fund 6, 1/10): kun (1) — et konkret skridt under et mål
  // — står ubetinget over (f). (2) «Tilføj skridt» og (3) «N dage tilbage»
  // er invitationer, ikke aftaler: de må ikke skubbe et aktivt skridt, der
  // er forfaldent eller har frist inden for HASTENDE_SKRIDT_DAGE, ned. Er
  // der et sådant (erHastendeSkridt), lægges målpunktet lige UNDER det
  // sidste hastende (f)-punkt (kalderens orden bevares) og får (f)'s
  // prioritet 6, så listen stadig er sorteret; ellers står det som før.
  const maalPunkt = inputs.maalPlan ? maalFokus(inputs.maalPlan.maal, inputs.maalPlan.skridt, now) : null;
  let ventendeMaalItem: FocusItem | null = null;
  if (maalPunkt?.art === "skridt") {
    items.push({
      key: `maal:skridt:${maalPunkt.skridtId}`,
      kind: "maal",
      priority: 5,
      title: maalPunkt.skridtTitel,
      description: `Skal være gjort senest ${formatDanskDato(maalPunkt.frist)} — ${modMaaletLinje(maalPunkt.maalTitel)}.${maalFristTillaeg(maalPunkt.maalDageTilbage)}`,
      ctaLabel: MAAL_FOKUS_SKRIDT_CTA,
      ctaHref: "#dine-skridt",
      sourceId: maalPunkt.skridtId,
    });
  } else if (maalPunkt?.art === "foerste_skridt") {
    ventendeMaalItem = {
      key: `maal:foerste:${maalPunkt.maalId}`,
      kind: "maal",
      priority: 5,
      title: foersteSkridtTitel(maalPunkt.maalTitel, maalPunkt.foerste),
      description: maalPunkt.foerste
        ? "Et mål uden skridt flytter sig ikke. Hvad er det første, I gør?"
        : "Intet er i gang under målet lige nu. Hvad er det næste, I gør?",
      ctaLabel: MAAL_FOKUS_TILFOEJ_CTA,
      ctaHref: MAAL_FOKUS_STI,
      sourceId: maalPunkt.maalId,
    };
  } else if (maalPunkt?.art === "frist") {
    ventendeMaalItem = {
      key: `maal:frist:${maalPunkt.maalId}`,
      kind: "maal",
      priority: 5,
      title: fristTitel(maalPunkt.maalTitel, maalPunkt.dageTilbage),
      description: "Hvad skal der til for at nå målet? Se skridtene og fristen.",
      ctaLabel: MAAL_FOKUS_MAAL_CTA,
      ctaHref: MAAL_FOKUS_STI,
      sourceId: maalPunkt.maalId,
    };
  }
  const maalSkridtId = maalPunkt?.art === "skridt" ? maalPunkt.skridtId : null;
  const fStart = items.length;
  let sidsteHastende = -1;

  // (f) Åbne handlinger — kalderens orden bevares (ActionCenter:205-208:
  // high → medium → low, dernæst ældste først). 'proposed' udelades
  // HELT: et forslag har fået sit eget hjem i "Dine skridt" (før «Dine
  // aftaler») og står dér med knapper. Nævnes det også i fokus-kortet som
  // et link, lover linket noget sektionen ikke viser (den viser kun ÉT
  // forslag) — og fire forslag i fokus genindfører netop den liste man
  // scroller forbi, som ét-ad-gangen-reglen findes for at undgå. Et
  // AKTIVT skridt nævnes derimod fortsat: det er en aftale medlemmet har
  // forpligtet sig til, og den skal huskes i rolige uger — punktet siger
  // hvornår og peger på #dine-skridt, som ejer knapperne. Arve-'open' er
  // uændret: href er forsiden selv (fold-ud), for arven vises ikke i
  // sektionen.
  for (const action of inputs.openActions) {
    if (action.status === "proposed") continue;
    if (action.id === maalSkridtId) continue; // står allerede som målets punkt (e)
    /* context er handlingens egen begrundelse fra AI-analysen og siger
       HVORFOR — fallbacken bevares, fordi kolonnen er nullable, men
       den er sidste udvej, ikke normen. */
    const grund = action.context?.trim();
    let description: string;
    let erAktivOpgave = false;
    if (action.status === "active" && action.due_date) {
      description = grund
        ? `Skal være gjort senest ${formatDanskDato(action.due_date)}. ${grund}`
        : `Skal være gjort senest ${formatDanskDato(action.due_date)}.`;
      erAktivOpgave = true;
    } else {
      description = grund || "Åben handling fra din handlingsplan.";
    }
    items.push({
      key: `action:${action.id}`,
      kind: "company-action",
      priority: 6,
      title: action.title,
      description,
      ctaLabel: erAktivOpgave ? "Se dine skridt" : "Se handlinger",
      ctaHref: erAktivOpgave ? "#dine-skridt" : "/",
      sourceId: action.id,
    });
    if (erHastendeSkridt(action, now)) sidsteHastende = items.length - 1;
  }
  // Målpunktets (2)/(3) plads (se (e)): under det sidste hastende (f)-punkt,
  // ellers før (f) som hidtil. Stadig ét målpunkt i alt.
  if (ventendeMaalItem) {
    if (sidsteHastende >= 0) items.splice(sidsteHastende + 1, 0, { ...ventendeMaalItem, priority: 6 });
    else items.splice(fStart, 0, ventendeMaalItem);
  }

  // (g) Pulse-nudgen — GATED bag committed rapport (ActionCenter:166-176:
  // "rapport først, så pulse som stillingtagen"); tekster fra porten.
  if (hasProcessed && hasCommitted && !inputs.hasPulseThisMonth) {
    items.push({
      key: "pulse",
      kind: "pulse",
      priority: 7,
      title: "Tag stilling til dine tal",
      description: `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}-rapporten er afleveret. Har du taget stilling til tallene?`,
      ctaLabel: "Send din refleksion",
      ctaHref: "/pulse",
    });
  }

  // (h) Løftestang uden milestone — ÉT samlet, stille punkt (første
  // løftestang i kalderens orden citeres; pr.-løftestang-spam undgås
  // bevidst — øvelsen (handoutet i Akademiet, 1/10) ejer detaljen).
  // Knappen fører til den lektion, der bærer øvelsen (sti fra kalderen),
  // ellers Akademiet — aldrig /handouts (medlemmet har ingen liste).
  if (inputs.unlinkedLevers.length > 0) {
    const first = inputs.unlinkedLevers[0];
    items.push({
      key: "unlinked-lever",
      kind: "unlinked-lever",
      priority: 8,
      title: "Gør en løftestang til en milestone",
      description: `"${first.lever}" (${first.moduleTitle}) venter på at blive en aktiv milestone, du kan tracke.`,
      ctaLabel: "Åbn øvelsen",
      ctaHref: first.sti ?? OEVELSE_FALDBACK_STI,
    });
  }

  // (i) Tom netværksprofil — LAVEST prioritet: kun i en rolig uge.
  // Kalderen gater rådgivere (askMeAboutMissing er false for dem).
  if (inputs.askMeAboutMissing) {
    items.push({
      key: "empty-profile",
      kind: "empty-profile",
      priority: 9,
      title: "Fortæl de andre hvad du er god til",
      description: "Netværket kan kun bruge dig, hvis de ved hvad du har prøvet.",
      ctaLabel: "Udfyld din profil",
      // Fanen, ikke siden (9/9): /settings forvalgte «Virksomhed», og
      // medlemmet skulle selv finde kortet. Dommen: profilUdfyldt.ts.
      ctaHref: PROFIL_STI,
    });
  }

  // (j) Ugens fokus, SET — bagerst (se (d)): samme punkt, roligere ord,
  // aldrig forrest igen. Falder ud af de fire viste når andet kalder.
  if (inputs.weeklyFocus && inputs.weeklyFocus.seen) {
    items.push({
      key: "weekly-focus",
      kind: "weekly-focus",
      priority: 10,
      title: "Ugens fokus",
      description: inputs.weeklyFocus.headline ?? "Din AI-chef har lagt ugens fokus klar til dig.",
      ctaLabel: "Læs igen",
      ctaHref: "/",
    });
  }

  // Byggerækkefølgen ER prioritetsordenen — ingen efter-sortering
  // nødvendig, og indsættelsesordenen er deterministisk.
  return items;
}

/** Tynd wrapper (uændret kontrakt for eksisterende tests): de oprindelige
    kilder gennem deriveFocus, første punkt mappet til den gamle NextStep-
    form. Milepæls-kilden er ude (fase 3) — tre kilder tilbage. */
export function deriveNextStep(inputs: NextStepInputs): NextStep | null {
  const focus = deriveFocus({
    ...inputs,
    unreadUserMessages: 0,
    unreadAgentMessages: 0,
    weeklyFocus: null,
    openActions: [],
    unlinkedLevers: [],
    askMeAboutMissing: false,
  });
  const first = focus[0];
  if (!first) return null;
  return {
    id: first.kind as NextStep["id"],
    title: first.title,
    description: first.description,
    cta: first.ctaLabel,
    link: first.ctaHref,
  };
}
