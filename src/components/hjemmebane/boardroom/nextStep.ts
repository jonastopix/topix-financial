import { DANISH_MONTHS } from "@/lib/financialUtils";
import type { Tjekliste } from "@/lib/onboardingTjekliste";

/** FOKUS-MOTOREN (forside PR 1, hb-forside-recon §D/§G): ÉN samlet,
    testbar prioriteringsdom for forsidens lag 1 — nu som PRIORITERET
    LISTE (deriveFocus), hvor forsiden senere viser #1 stort og #2-4 som
    stille linjer. deriveNextStep består som TYND WRAPPER (= liste[0]
    over de fire oprindelige kilder), så BoardroomView og dens tests er
    uændrede i denne PR.

    Kilderne og deres domme er ARVET ORDRET fra DashboardActionCenter/
    den oprindelige port: rapport-signalet (ActionCenter:110-139),
    ulæste rådgiver-/agent-beskeder (:150-163), milestone-deadline
    ≤14 dage (:141-148), pulse-nudgen GATED bag committed rapport
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

    PRIORITERINGSRÆKKEFØLGEN (arkitekt-beslutning, fast — aldrig
    tilfældig tie-break):
      (0) tjeklistepunkt (kun mens tjeklisten er uafsluttet — se ovenfor)
      (a) manglende rapport            (b) rapport afventer godkendelse
      (c) ubesvaret besked (rådgiver før agent — ActionCenter-ordenen)
      (d) weekly_focus (denne uge, ikke set)
      (e) milestone-deadline ≤14 dage (nærmeste først, dernæst titel)
      (f) åbne company_actions (kalderens prioritetsorden)
      (g) pulse-nudge                  (h) løftestang uden milestone
      (i) tom netværksprofil (ask_me_about mangler) — LAVEST: en tom
          profil er aldrig vigtigere end tal, beskeder eller milepæle;
          den skal kun dukke op i en rolig uge
    Tom liste = alt er ajour (kortet bærer forløbs-linket). */

export interface NextStepMilestone {
  title: string;
  deadline: string | null;
  progress: number;
  status: string;
}

export interface NextStepInputs {
  now: Date;
  /** Perioder m. processed rapport (effektive period-keys, "YYYY-MM"). */
  processedPeriodKeys: ReadonlySet<string>;
  /** Perioder m. godkendte (committed) tal i facts-laget. */
  committedPeriodKeys: ReadonlySet<string>;
  milestones: NextStepMilestone[];
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
}

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
}

export type FocusKind =
  | "tjekliste"
  | "missing-report"
  | "pending-approval"
  | "unread-messages"
  | "unread-agent"
  | "weekly-focus"
  | "milestone-deadline"
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
  id: "missing-report" | "pending-approval" | "milestone-deadline" | "pulse";
  title: string;
  description: string;
  cta: string;
  link: string;
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

export function deriveFocus(inputs: FocusInputs): FocusItem[] {
  const { now } = inputs;
  const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const prevKey = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
  const monthName = DANISH_MONTHS[prevMonth].toLowerCase();

  const items: FocusItem[] = [];

  // (0) ANKOMSTEN — tjeklisten er kilden så længe den ikke er færdig.
  // Punkternes rækkefølge er tjeklistens egen; kun ikke-gjorte punkter
  // kommer med (første = #1). Titel/beskrivelse/sti genbruges som
  // title/description/ctaHref. Listen returneres HER: mens man er ved at
  // komme ind, konkurrerer intet andet om kortet (§5). Færdig tjekliste
  // (eller ingen) → falder igennem til (a)-(i).
  if (inputs.tjekliste && !inputs.tjekliste.faerdig) {
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
  const foerKontraktstart = foersteKey !== null && prevKey < foersteKey;

  // (a) Manglende rapport — udelukker (b) pr. datalogik (tekster ordret
  // fra den oprindelige port). Tier når perioden ligger før kontrakten.
  if (!hasProcessed && !foerKontraktstart) {
    items.push({
      key: "missing-report",
      kind: "missing-report",
      priority: 1,
      title: `Upload dine ${monthName}-tal`,
      description: `Så er ${monthName} ${prevYear} med, og din rådgiver kan se fremad med dig.`,
      ctaLabel: "Upload tallene",
      ctaHref: "/reports",
    });
  } else if (hasProcessed && !hasCommitted) {
    // (b) Uploadet men ikke godkendt.
    items.push({
      key: "pending-approval",
      kind: "pending-approval",
      priority: 2,
      title: `Godkend dine ${monthName}-tal`,
      description: `Tallene for ${monthName} ${prevYear} er uploadet, men ikke godkendt endnu — godkend dem, så de kommer i drift.`,
      ctaLabel: "Godkend tallene",
      ctaHref: "/reports",
    });
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

  // (d) Ugens fokus — indeværende uge, ikke set. Titlen matcher
  // notifikations-kontrakten ("Ugens fokus er klar"). Href er forsiden
  // selv — visningen afgør formen (indlejret/scroll), motoren er UI-agnostisk.
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

  // (e) Milestone-deadlines ≤14 dage — ALLE kandidater (nærmeste først,
  // dernæst titel som fast tie-break); tærskel ordret fra
  // ActionCenter:145 / portens :62-69.
  const candidates = inputs.milestones
    .filter((m) => m.deadline && m.progress < 100 && m.status !== "parked")
    .map((m) => ({
      milestone: m,
      daysLeft: Math.ceil((new Date(m.deadline as string).getTime() - now.getTime()) / 86400000),
    }))
    .filter(({ daysLeft }) => daysLeft > 0 && daysLeft <= 14)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.milestone.title.localeCompare(b.milestone.title, "da"));

  for (const { milestone, daysLeft } of candidates) {
    items.push({
      key: `milestone:${milestone.title}`,
      kind: "milestone-deadline",
      priority: 5,
      title: `"${milestone.title}" nærmer sig deadline`,
      description: `${daysLeft} dag${daysLeft === 1 ? "" : "e"} tilbage — opdatér fremdriften eller justér målet.`,
      ctaLabel: "Åbn milestones",
      ctaHref: "/milestones",
    });
  }

  // (f) Åbne handlinger — kalderens orden bevares (ActionCenter:205-208:
  // high → medium → low, dernæst ældste først). 'proposed' udelades
  // HELT: et forslag har fået sit eget hjem i "Dine aftaler" og står
  // dér med knapper. Nævnes det også i fokus-kortet som et link, lover
  // linket noget sektionen ikke viser (den viser kun ÉT forslag) — og
  // fire forslag i fokus genindfører netop den liste man scroller
  // forbi, som ét-ad-gangen-reglen findes for at undgå. En AKTIV opgave
  // nævnes derimod fortsat: det er en aftale medlemmet har forpligtet
  // sig til, og den skal huskes i rolige uger — punktet siger hvornår
  // og peger på #dine-aftaler, som ejer knapperne (samme præcedens som
  // slot (e), hvor milestone-deadlines nævnes og /milestones ejer
  // handlingen). Arve-'open' er uændret: href er forsiden selv
  // (fold-ud), for arven vises ikke i sektionen.
  for (const action of inputs.openActions) {
    if (action.status === "proposed") continue;
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
      ctaLabel: erAktivOpgave ? "Se dine aftaler" : "Se handlinger",
      ctaHref: erAktivOpgave ? "#dine-aftaler" : "/",
      sourceId: action.id,
    });
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
  // bevidst — handout-fladen ejer detaljen).
  if (inputs.unlinkedLevers.length > 0) {
    const first = inputs.unlinkedLevers[0];
    items.push({
      key: "unlinked-lever",
      kind: "unlinked-lever",
      priority: 8,
      title: "Gør en løftestang til en milestone",
      description: `"${first.lever}" (${first.moduleTitle}) venter på at blive en aktiv milestone, du kan tracke.`,
      ctaLabel: "Åbn handouts",
      ctaHref: "/handouts",
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
      ctaHref: "/settings",
    });
  }

  // Byggerækkefølgen ER prioritetsordenen — ingen efter-sortering
  // nødvendig, og indsættelsesordenen er deterministisk.
  return items;
}

/** Tynd wrapper (uændret kontrakt for BoardroomView + eksisterende
    tests): de fire oprindelige kilder gennem deriveFocus, første punkt
    mappet til den gamle NextStep-form. */
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
