/**
 * src/lib/forsidensDom.ts
 *
 * Forsidens dom — docs/forsiden-design.md §13 pkt. 2: «dommen som ren
 * funktion med tests, motor før flade». Én funktion, afgoerForsidensDom,
 * der tager det huset allerede dømmer pr. virksomhed og giver de OPGAVER
 * der skal stå på rådgiverens forside — gennem porterne (§4), grupperet
 * på virksomhed, sorteret, med tilstandene samlet (§3) og tallene under
 * stregen (§5).
 *
 * Ren TypeScript: ingen I/O, ingen Supabase, ingen React, ingen
 * new Date() — «nu» er altid en eksplicit parameter, som i opgaveEngine.
 * Rører INGEN af de eksisterende motorer; den importerer kun deres typer.
 *
 * INPUT er motorernes UDFALD, ikke deres råstof (4/9):
 *   - afgoerVirksomhedsSignaler → Signal[]         (tavshed, stikker ud, ulæst)
 *   - afgoerFornyelsestilstand  → Fornyelsestilstand
 *   - afgoerBetalingsfrist      → Betalingsfristtilstand
 *   - company_actions med due_date (aktive opgaver)
 * Kalderen (i dag hentAdvisorDashboard) kører motorerne og samler; dommen
 * dømmer. Det holder de fire domme ét sted hver og gør denne testbar uden
 * facts, kontrakter og betalingslinks.
 *
 * AFGRÆNSNING (Jonas, 4/9): SEKS af §2's otte slags er implementeret —
 * tavshed, stikker ud, ulæst besked, fornyelse, indgang, opgave nær
 * deadline. De to AI-baserede — rapporteringsfejl (§2 slags 6) og
 * «medlemmet har skrevet noget vi bør reagere på» (§2 slags 8: handout og
 * refleksion) — har PLADS I TYPEN (OpgaveSlags, AiUdsagn) men INGEN
 * implementering. De hægtes på når §8's AI-læsning findes; indtil da
 * ignoreres feltet aiUdsagn bevidst, og der findes en test der låser det.
 *
 * MÅLT 4/9 (recon-forsidens-dom.md): motoren har alvor for kun to og en
 * halv af de otte slags — tavshed og «stikker ud» fuldt, ulæste beskeder
 * som antal. Fornyelse og indgang har egne motorer der giver TILSTAND og
 * DAGTAL, men ingen alvor. Opgave nær deadline har ingenting. Derfor
 * sætter denne fil alvor for de tre (konstanterne nedenfor), i motorens
 * skala: aldrig skrevet 95, bankovertræk 90, omsætningsfald 80,
 * resultatfald og ulæst 70, agentforslag 55, budget 50/40, friske tal 30.
 *
 * HVAD DER IKKE BLIVER TIL OPGAVER:
 *   - Motorens friske_tal (30): godt nyt, ikke en opgave (§11). Ignoreres.
 *   - Fornyelse klar_til_afsked, udloebet_tilbyd_ikke, uden_for_ordningen,
 *     selvbetjener, i_god_tid, ingen_slutdato, ophoert: beslutningen er
 *     truffet, eller der er ingen at træffe. Ingen grund.
 *   - Indgang betalt: ingen grund.
 *   - Opgaver der ikke er aktive, uden due_date, eller med frist mere end
 *     NAER_DEADLINE_DAGE ude: ikke «nær deadline».
 *
 * PUKLEN (§3): agentforslag uden afgørelse er ikke en af §2's otte slags,
 * men §3 beslutter at den vises — som ÉN pukkel, ikke otte opgaver. Den
 * står derfor i OpgaveSlags som "agentforslag" med form pukkel, og bygges
 * af motorens agentforslag_venter-signal (alvor) og feltet
 * agentforslagVenter (antal, som motoren ikke bærer i signalet). §3 siger
 * også at ét forslag fra i morges er en hændelse, ikke en pukkel — det
 * kræver et tidspunkt inputtet ikke har i dag; puklen er derfor altid
 * pukkel her. Noteret som valg, ikke som afgjort.
 *
 * DE TRE FORMER (§3) og hvordan dommen behandler dem:
 *   hændelse  — står hver for sig. Går gennem porterne én ad gangen; en
 *               der passerer giver virksomheden en linje.
 *   tilstand  — samles til ÉN linje pr. slags PÅ TVÆRS af virksomheder
 *               («tre du ikke har skrevet med i over to måneder»). Det er
 *               rettelsen af 4/9's fejl: 16 tavse blev vist som 16 linjer.
 *               En tilstand får KUN sin egen virksomhedslinje i to tilfælde:
 *               (a) dens vindue lukker inden for VINDUE_DAGE (vinduesporten,
 *               §4 nævner netop fornyelsen og betalingsfristen), eller
 *               (b) virksomheden HAR allerede en linje af anden grund — så
 *               hægtes tilstanden på som ekstra grund (§1's CARMA: «I har
 *               ikke talt sammen siden juni, OG …»; §4 undtagelse 2).
 *               Den samlede linje går gennem alvorsporten som ÉN linje med
 *               den højeste alvor: «3 har aldrig skrevet» (95) står øverst
 *               som én linje — ingen glemmes, og ingen fylder 16 rækker.
 *               Passerer den ikke, står den under stregen (§5's andet tal).
 *   pukkel    — samles til ÉN linje pr. slags, altid. Går gennem
 *               alvorsporten som én linje; ellers under stregen.
 *
 * ALVOR, VINDUE, INDSATS — tre spørgsmål, tre felter (§4): hvor slemt
 * (alvor 0–100), hvor snart (lukkerOmDage: hele dage til vinduet lukker,
 * null når der intet vindue er ELLER det allerede er lukket — et lukket
 * vindue er ikke længere hast, det er alvor, og alvoren er sat derefter:
 * frist_overskredet 90, forfalden 75, udloebet_tilbyd 90), hvor stort
 * (indsats 1–3, se INDSATS).
 */
import type { Signal } from "./virksomhedsSignaler";
import type { Fornyelsestilstand } from "./fornyelse";
import { BETALINGSFRIST_DAGE, type Betalingsfristtilstand } from "./betalingsfrist";

// ─── Konstanter — alle tal dommen bruger, ét sted ────────────────────────

/** Alvorsporten (§4): en grund kommer med når alvor >= TAERSKEL. 70 er det
    tal huset allerede bruger — `alvor >= 70` farves rust i både
    VirksomhedView (:176) og RaadgiverForsideView (:70). Det der er rødt på
    virksomhedssiden er det der står på forsiden. FØRSTE bud; justeres når
    fladen er set og målt mod 4/9's 38 rækker (§12). */
export const TAERSKEL = 70;

/** Vinduesporten (§4): en grund kommer med når dens vindue lukker inden for
    så mange dage — uanset alvor. */
export const VINDUE_DAGE = 7;

/** Sorteringsundtagelse 1 (§4): lukker vinduet inden for så mange dage,
    løftes linjen øverst uanset alvor. */
export const LOEFT_DAGE = 3;

/** Opgave nær deadline (§2 slags 7): en aktiv opgave er «nær» når fristen
    er inden for så mange dage. 14 er opgave-modellens egen rytme (første
    udskydelse og ugefokus, opgaveEngine B10/B11). Længere ude er den ikke
    forsidens sag endnu. */
export const NAER_DEADLINE_DAGE = 14;

/** §5: «Rammer det tyve, er tærsklen forkert — og fladen SIGER det.»
    Grænsen er §5's eget tal. Flaget sættes når antallet af linjer (efter
    gruppering, §10) når det. */
export const USAEDVANLIGT_MANGE = 20;

/**
 * ALVOR for de tre slags motoren ikke dømmer. FØRSTE bud (Jonas, 4/9),
 * sat mod den eksisterende skala — ikke ved siden af den. Justeres her,
 * ét sted, når fladen er set.
 *
 * Fornyelse (afgoerFornyelsestilstand):
 *   udloebet_tilbyd    90  kontrakten ER udløbet og medlemmet har fået
 *                          tilbud — kunden er væk hvis ingen gør noget.
 *                          Samme alvor som bankovertræk.
 *   klar_til_tilbud    75  beslutningen er truffet (tilbyd), tilbuddet
 *                          mangler at blive sendt. Over resultatfald (70),
 *                          under omsætningsfald (80).
 *   beslutning_mangler 70  i vinduet uden beslutning. Lige på tærsklen,
 *                          som ulæst besked og resultatfald: det skal ses,
 *                          men vinduet er 60 dage.
 */
export const ALVOR_FORNYELSE = {
  udloebet_tilbyd: 90,
  klar_til_tilbud: 75,
  beslutning_mangler: 70,
} as const;

/**
 * Indgang (afgoerBetalingsfrist):
 *   frist_overskredet 90  mere end 30 dage siden underskriften, ubetalt.
 *                         Samme alvor som bankovertræk.
 *   afventer_pris     85  det er OS der blokerer: uden pris sendes ingen
 *                         mail, og fristen løber imens. Næsthøjest.
 *   klar_til_mail     65  prisen er sat, dag 0-mailen er ikke sendt.
 *                         Under tærsklen alene; vinduet bærer den op når
 *                         fristen nærmer sig.
 *   afventer_betaling 60  mailen er sendt, medlemmet har bolden. Lavest
 *                         af de fire; vinduet afgør hvornår den kommer op.
 */
export const ALVOR_INDGANG = {
  frist_overskredet: 90,
  afventer_pris: 85,
  klar_til_mail: 65,
  afventer_betaling: 60,
} as const;

/**
 * Opgave nær deadline (company_actions, status active, due_date):
 *   forfalden          75  fristen er passeret (opgaveEngine B2: dagen
 *                          EFTER due_date). Målt 4/9: 63 udløbne mod 10
 *                          gjorte — ingen ser dem før de er udløbet. Over
 *                          resultatfald, under omsætningsfald.
 *   inden_for_3_dage   70  fristen er i dag, i morgen eller i overmorgen.
 *                          På tærsklen; løftes desuden øverst af LOEFT_DAGE.
 *   inden_for_14_dage  55  fristen er inden for to uger. Under tærsklen
 *                          alene — vinduesporten tager den ved 7 dage.
 */
export const ALVOR_OPGAVE = {
  forfalden: 75,
  inden_for_3_dage: 70,
  inden_for_14_dage: 55,
} as const;

// ─── Typer ────────────────────────────────────────────────────────────────

/** §2's otte slags, plus §3's pukkel (se filhovedet). De to AI-baserede
    (rapporteringsfejl, medlem_har_skrevet) har plads, ingen implementering. */
export type OpgaveSlags =
  | "fornyelse" // §2 slags 1 — fra afgoerFornyelsestilstand
  | "indgang" // §2 slags 2 — fra afgoerBetalingsfrist
  | "venter_i_samtalen" // §2 slags 3 — ulæste beskeder (antal); AI-læsningen af HVAD der venter (§8) mangler
  | "tavshed" // §2 slags 4 — motorens aldrig_skrevet / ingen_dialog
  | "stikker_ud" // §2 slags 5 — motorens bankovertræk, fald MoM, budget
  | "rapporteringsfejl" // §2 slags 6 — AI (§8). IKKE IMPLEMENTERET.
  | "opgave_naer_deadline" // §2 slags 7 — company_actions.due_date
  | "medlem_har_skrevet" // §2 slags 8 — handout/refleksion, AI (§8). IKKE IMPLEMENTERET.
  | "agentforslag"; // §3's pukkel — ikke en af de otte, men besluttet vist som én linje

/** §3's tre former. */
export type Form = "haendelse" | "tilstand" | "pukkel";

/** Hver slags har sin form (§3). Hændelse = sker én gang, du reagerer og den
    er væk. Tilstand = sand igen i morgen. Pukkel = ophobning der vokser. */
export const FORM: Record<OpgaveSlags, Form> = {
  fornyelse: "tilstand", // en manglende beslutning er sand igen i morgen
  indgang: "tilstand", // en ubetalt indgang ligeså
  venter_i_samtalen: "haendelse", // en ny besked
  tavshed: "tilstand", // §3's eget eksempel
  stikker_ud: "haendelse", // udløst af en rapport committet (§3 nævner den som hændelse)
  rapporteringsfejl: "haendelse", // udløst af en rapport committet
  opgave_naer_deadline: "haendelse", // en frist passerer én gang
  medlem_har_skrevet: "haendelse", // en ny refleksion, et gemt handout
  agentforslag: "pukkel", // §3: «otte agentforslag venter» er én linje
};

/** Indsats — «hvor stort» (§4). Bryder KUN uafgjort på alvor; bærer aldrig
    rækkefølgen alene. «Kort» er defineret som hvad handlingen kræver af
    rådgiveren, i tre trin:
      1  én afgørelse i systemet — et klik: beslut fornyelsen, sæt prisen,
         send mailen, afgør forslaget.
      2  én besked: skriv til, svar, læs og svar.
      3  en samtale om tal: læs rapporten, forbered, skriv — stikker ud og
         rapporteringsfejl kræver at man har set tallene først.
    Valget: ved lige alvor skal rådgiveren tage det der er gjort på ét
    minut før det der kræver en halv time — så bliver det gjort, og det
    andet står stadig der. FØRSTE bud; justeres ét sted. */
export type Indsats = 1 | 2 | 3;
export const INDSATS: Record<OpgaveSlags, Indsats> = {
  fornyelse: 1,
  indgang: 1,
  agentforslag: 1,
  tavshed: 2,
  venter_i_samtalen: 2,
  opgave_naer_deadline: 2,
  medlem_har_skrevet: 2,
  stikker_ud: 3,
  rapporteringsfejl: 3,
};

/** company_actions-rækken som dommen ser den: kun det den læser. Kun
    status "active" med due_date dømmes (B3: aktive har altid frist). */
export interface OpgaveTilDom {
  id: string;
  title: string;
  status: string;
  /** date-kolonne; hele kalenderdage i lokal tid, som opgaveEngine. */
  due_date: Date | null;
}

/** §8: et AI-læst udsagn om hvad der står i en tekst. PLADS I TYPEN —
    ingen implementering endnu (4/9). Når §8's læsning findes, bliver
    udsagnene til grunde af slags rapporteringsfejl / medlem_har_skrevet
    (og vægter venter_i_samtalen). Reglen der skal stå: AI TILFØJER en
    opgave, den FJERNER aldrig en. */
export interface AiUdsagn {
  slags: "rapporteringsfejl" | "medlem_har_skrevet";
  /** Hvad der står — «medlemmet skriver at de ikke kan betale løn næste måned». */
  udsagn: string;
  /** Kilde-rækkens id (handout, pulse_checkin, financial_report). */
  kildeId: string;
}

/** Alt dommen har brug for om én virksomhed. Kalderen samler; dommen dømmer. */
export interface VirksomhedTilDom {
  companyId: string;
  navn: string;
  /** afgoerVirksomhedsSignaler(input, nu) — kalderen kører motoren. */
  signaler: readonly Signal[];
  /** Motorens agentforslag_venter-signal bærer ikke antallet; det gør dette
      felt (samme tal som VirksomhedsInput.agentforslagVenter). */
  agentforslagVenter: number;
  /** afgoerFornyelsestilstand(…, nu); null når kalderen ikke har regnet den
      (fx legat — samme udsnit som FornyelsesSektion). */
  fornyelse: Fornyelsestilstand | null;
  /** afgoerBetalingsfrist(…, nu); null når virksomheden ikke er i indgangen
      (ingen række i company_betalingslink — kalderen afgør det, som
      betalingsfrist.ts siger). */
  indgang: Betalingsfristtilstand | null;
  /** company_actions for virksomheden; dommen filtrerer selv. */
  opgaver: readonly OpgaveTilDom[];
  /** §8 — ignoreres i dag, se AiUdsagn. */
  aiUdsagn?: readonly AiUdsagn[];
}

/** Én grund: hvorfor virksomheden står der, og hvad man gør (§1). */
export interface Grund {
  slags: OpgaveSlags;
  /** Stabil nøgle for §9's tildeling og §7's fravalg: virksomhed +
      signaltype. Signaltypen er den fine nøgle — motorens noegle,
      fornyelsens status, indgangens status, opgavens trin. */
  signaltype: string;
  /** Kort dansk tekst — hvad der er set. */
  tekst: string;
  /** Handlingen (§1): «skriv til», «tag fat i», aldrig «ring». */
  handling: string;
  alvor: number;
  /** Hele dage til vinduet lukker; null = intet vindue, eller lukket. */
  lukkerOmDage: number | null;
  indsats: Indsats;
  detalje?: string;
}

/** En virksomhed med én eller flere grunde, den vigtigste først (§4
    undtagelse 2: CARMA står én gang med to grunde). */
export interface Virksomhedslinje {
  linje: "virksomhed";
  companyId: string;
  navn: string;
  grunde: Grund[];
  /** Højeste alvor blandt grundene. */
  alvor: number;
  /** Korteste vindue blandt grundene; null uden vindue. */
  lukkerOmDage: number | null;
  /** Sorteringsundtagelse 1: lukker inden for LOEFT_DAGE. */
  loeftet: boolean;
  /** Indsatsen for den vigtigste grund — det er den man tager først. */
  indsats: Indsats;
}

/** Én tilstand samlet på tværs af virksomheder (§3). */
export interface Tilstandslinje {
  linje: "tilstand";
  slags: OpgaveSlags;
  antal: number;
  tekst: string;
  virksomheder: { companyId: string; navn: string; grund: Grund }[];
  /** Højeste alvor blandt de samlede. */
  alvor: number;
  lukkerOmDage: null;
  loeftet: false;
  indsats: Indsats;
}

/** Én pukkel pr. slags (§3). */
export interface Pukkellinje {
  linje: "pukkel";
  slags: OpgaveSlags;
  antal: number;
  tekst: string;
  alvor: number;
  lukkerOmDage: null;
  loeftet: false;
  indsats: Indsats;
}

export type Linje = Virksomhedslinje | Tilstandslinje | Pukkellinje;

export interface Forsidensdom {
  /** Det der står på forsiden, sorteret (§4). */
  linjer: Linje[];
  /** §10: antallet af linjer efter gruppering — «Syv ting kræver dig i dag». */
  antalOpgaver: number;
  /** §5: antalOpgaver >= USAEDVANLIGT_MANGE — fladen skal sige det. */
  usaedvanligtMange: boolean;
  /** §5's to tal, plus det der ligger bag dem. Intet loft, intet skjult. */
  underStregen: {
    /** «ni andre virksomheder har noget mindre presserende»: virksomheder
        uden linje, ikke i en samlet tilstand, med mindst én hændelse
        under tærsklen. */
    antalVirksomhederUnderTaersklen: number;
    /** «tre du ikke har skrevet med i over to måneder»: virksomheder foldet
        ind i en samlet tilstandslinje — over eller under stregen. */
    antalTilstandeSamlet: number;
    /** De samlede tilstande der IKKE gik gennem alvorsporten. */
    tilstande: Tilstandslinje[];
    /** Pukler der IKKE gik gennem alvorsporten. */
    pukler: Pukkellinje[];
  };
}

// ─── Hjælpere ─────────────────────────────────────────────────────────────

const MS_PER_DOEGN = 86_400_000;

/** Hele kalenderdage fra nu til d, i lokal tid — samme regning som
    opgaveEngine.dagVaerdi: frist i dag = 0 (ikke forfalden), i går = −1. */
function kalenderdageTil(d: Date, nu: Date): number {
  const a = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime();
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((b - a) / MS_PER_DOEGN);
}

/** Vinduesporten læser kun åbne vinduer: 0..n dage. Negativt = lukket = null. */
function aabentVindue(dage: number | null): number | null {
  return dage != null && dage >= 0 ? dage : null;
}

function flertal(n: number, ental: string, flertal: string): string {
  return `${n} ${n === 1 ? ental : flertal}`;
}

// ─── Grunde pr. slags ─────────────────────────────────────────────────────

/** Motorens signaler → grunde. friske_tal og agentforslag_venter bliver ikke
    grunde her (§11 hhv. puklen). */
function grundeFraMotoren(v: VirksomhedTilDom): Grund[] {
  const grunde: Grund[] = [];
  for (const s of v.signaler) {
    let slags: OpgaveSlags;
    let handling: string;
    if (s.koe === "ikke_hoert_fra_laenge") {
      slags = "tavshed";
      handling = `Skriv til ${v.navn}`;
    } else if (s.koe === "venter_paa_svar") {
      slags = "venter_i_samtalen";
      handling = `Svar ${v.navn}`;
    } else if (s.koe === "stikker_ud") {
      slags = "stikker_ud";
      handling = `Tag det op med ${v.navn}`;
    } else {
      continue; // friske_tal (§11), agentforslag_venter (puklen)
    }
    grunde.push({
      slags,
      signaltype: s.noegle,
      tekst: s.tekst,
      handling,
      alvor: s.alvor,
      lukkerOmDage: null,
      indsats: INDSATS[slags],
      ...(s.detalje ? { detalje: s.detalje } : {}),
    });
  }
  return grunde;
}

/** Fornyelse: kun de tre statusser hvor der er noget at gøre. Vinduet er
    dage til kontraktens slutdato (dage_til_udloeb); lukket efter udløb. */
function grundFraFornyelse(v: VirksomhedTilDom): Grund | null {
  const f = v.fornyelse;
  if (!f) return null;
  const status = f.status;
  if (status !== "udloebet_tilbyd" && status !== "klar_til_tilbud" && status !== "beslutning_mangler") return null;
  const dage = f.dage_til_udloeb;
  const tekst =
    status === "udloebet_tilbyd"
      ? `Kontrakten udløb${dage != null ? ` for ${flertal(-dage, "dag", "dage")} siden` : ""} — tilbud givet, intet svar`
      : status === "klar_til_tilbud"
        ? `Fornyelse besluttet: tilbyd${dage != null ? ` — ${flertal(dage, "dag", "dage")} til udløb` : ""}`
        : `Fornyelse: beslutning mangler${dage != null ? ` — ${flertal(dage, "dag", "dage")} til udløb` : ""}`;
  const handling =
    status === "udloebet_tilbyd"
      ? `Følg op på tilbuddet til ${v.navn}`
      : status === "klar_til_tilbud"
        ? `Send tilbuddet til ${v.navn}`
        : `Beslut fornyelsen for ${v.navn}`;
  return {
    slags: "fornyelse",
    signaltype: status,
    tekst,
    handling,
    alvor: ALVOR_FORNYELSE[status],
    lukkerOmDage: aabentVindue(dage),
    indsats: INDSATS.fornyelse,
  };
}

/** Indgang: alt undtagen betalt. Vinduet er betalingsfristen —
    BETALINGSFRIST_DAGE fra underskriften (samme regning som IndgangsSektion);
    lukket efter dag 30. Fristen løber også for afventer_pris og
    klar_til_mail (betalingsfrist.ts). */
function grundFraIndgang(v: VirksomhedTilDom): Grund | null {
  const i = v.indgang;
  if (!i || i.status === "betalt") return null;
  const status = i.status;
  const tilbage = i.dage_siden_underskrift != null ? BETALINGSFRIST_DAGE - i.dage_siden_underskrift : null;
  const frist = tilbage != null && tilbage >= 0 ? ` — ${flertal(tilbage, "dag", "dage")} til fristen` : "";
  const tekst =
    status === "frist_overskredet"
      ? `Indgang: betalingsfristen er passeret${i.dage_siden_underskrift != null ? ` (${flertal(i.dage_siden_underskrift, "dag", "dage")} siden underskrift)` : ""}`
      : status === "afventer_pris"
        ? `Indgang: prisen er ikke sat${frist}`
        : status === "klar_til_mail"
          ? `Indgang: betalingsmailen er ikke sendt${frist}`
          : `Indgang: afventer betaling${frist}`;
  const handling =
    status === "frist_overskredet"
      ? `Tag fat i ${v.navn} om betalingen`
      : status === "afventer_pris"
        ? `Sæt prisen for ${v.navn}`
        : status === "klar_til_mail"
          ? `Send betalingsmailen til ${v.navn}`
          : `Følg op på betalingen fra ${v.navn}`;
  return {
    slags: "indgang",
    signaltype: status,
    tekst,
    handling,
    alvor: ALVOR_INDGANG[status],
    lukkerOmDage: aabentVindue(tilbage),
    indsats: INDSATS.indgang,
  };
}

/** Opgave nær deadline: aktive opgaver med frist inden for
    NAER_DEADLINE_DAGE, eller forfaldne. Trinnet er signaltypen. */
function grundeFraOpgaver(v: VirksomhedTilDom, nu: Date): Grund[] {
  const grunde: Grund[] = [];
  for (const o of v.opgaver) {
    if (o.status !== "active" || o.due_date == null) continue;
    const dage = kalenderdageTil(o.due_date, nu);
    if (dage > NAER_DEADLINE_DAGE) continue;
    const trin: keyof typeof ALVOR_OPGAVE =
      dage < 0 ? "forfalden" : dage <= LOEFT_DAGE ? "inden_for_3_dage" : "inden_for_14_dage";
    const tekst =
      trin === "forfalden"
        ? `Opgaven «${o.title}» forfaldt for ${flertal(-dage, "dag", "dage")} siden`
        : dage === 0
          ? `Opgaven «${o.title}» har frist i dag`
          : `Opgaven «${o.title}» har frist om ${flertal(dage, "dag", "dage")}`;
    grunde.push({
      slags: "opgave_naer_deadline",
      signaltype: `opgave_${trin}`,
      tekst,
      handling: `Skriv til ${v.navn} om «${o.title}»`,
      alvor: ALVOR_OPGAVE[trin],
      lukkerOmDage: aabentVindue(dage),
      indsats: INDSATS.opgave_naer_deadline,
    });
  }
  return grunde;
}

/** Alle grunde for én virksomhed. aiUdsagn ignoreres bevidst (§8 mangler). */
function grundeFor(v: VirksomhedTilDom, nu: Date): Grund[] {
  const grunde = grundeFraMotoren(v);
  const f = grundFraFornyelse(v);
  if (f) grunde.push(f);
  const i = grundFraIndgang(v);
  if (i) grunde.push(i);
  grunde.push(...grundeFraOpgaver(v, nu));
  return grunde;
}

// ─── Portene og sorteringen ───────────────────────────────────────────────

/** §4: alvorsporten ELLER vinduesporten. */
export function gaarGennemPorten(g: { alvor: number; lukkerOmDage: number | null }): boolean {
  return g.alvor >= TAERSKEL || (g.lukkerOmDage != null && g.lukkerOmDage <= VINDUE_DAGE);
}

/** Grunde inden for en linje: vigtigste først. Samme nøgle som linjerne. */
function sammenlignGrunde(a: Grund, b: Grund): number {
  return b.alvor - a.alvor || a.indsats - b.indsats || a.signaltype.localeCompare(b.signaltype, "da");
}

/** §4: alvor faldende; undtagelse 1 — løftede (lukker inden for LOEFT_DAGE)
    øverst uanset alvor, indbyrdes den der lukker først; uafgjort brydes af
    indsats (korteste vinder), til sidst navn for et deterministisk resultat. */
function sammenlignLinjer(a: Linje, b: Linje): number {
  if (a.loeftet !== b.loeftet) return a.loeftet ? -1 : 1;
  if (a.loeftet && b.loeftet && a.lukkerOmDage !== b.lukkerOmDage) {
    return (a.lukkerOmDage ?? Infinity) - (b.lukkerOmDage ?? Infinity);
  }
  return b.alvor - a.alvor || a.indsats - b.indsats || navnAf(a).localeCompare(navnAf(b), "da");
}

function navnAf(l: Linje): string {
  return l.linje === "virksomhed" ? l.navn : l.tekst;
}

function tilstandstekst(slags: OpgaveSlags, antal: number): string {
  const v = flertal(antal, "virksomhed", "virksomheder");
  switch (slags) {
    case "tavshed":
      return `${v} har du ikke hørt fra længe`;
    case "fornyelse":
      return `${flertal(antal, "fornyelse", "fornyelser")} venter på dig`;
    case "indgang":
      return `${flertal(antal, "indgang", "indgange")} er ikke betalt`;
    default:
      return `${v} med ${slags}`;
  }
}

// ─── Dommen ───────────────────────────────────────────────────────────────

/**
 * Forsidens dom over alle virksomheder. «nu» er eksplicit; samme input
 * giver altid samme output.
 */
export function afgoerForsidensDom(virksomheder: readonly VirksomhedTilDom[], nu: Date): Forsidensdom {
  const virksomhedslinjer: Virksomhedslinje[] = [];
  const samlede = new Map<OpgaveSlags, Tilstandslinje["virksomheder"]>();
  let antalVirksomhederUnderTaersklen = 0;
  let agentforslagAntal = 0;
  let agentforslagAlvor: number | null = null;

  for (const v of virksomheder) {
    // Puklen tælles på tværs af alle — også dem der får en linje.
    const pukkelSignal = v.signaler.find((s) => s.koe === "agentforslag_venter");
    if (pukkelSignal && v.agentforslagVenter > 0) {
      agentforslagAntal += v.agentforslagVenter;
      agentforslagAlvor = Math.max(agentforslagAlvor ?? 0, pukkelSignal.alvor);
    }

    const grunde = grundeFor(v, nu);
    if (grunde.length === 0) continue;

    // En virksomhed får sin egen linje når en HÆNDELSE går gennem en af
    // porterne, eller en TILSTAND går gennem vinduesporten. En tilstand der
    // kun har alvor giver ikke en linje alene — den samles (§3).
    const faarLinje = grunde.some((g) =>
      FORM[g.slags] === "haendelse"
        ? gaarGennemPorten(g)
        : FORM[g.slags] === "tilstand" && g.lukkerOmDage != null && g.lukkerOmDage <= VINDUE_DAGE,
    );

    if (faarLinje) {
      // Alle virksomhedens grunde hægtes på — «CARMA står én gang med to
      // grunde» — også dem der ikke selv gik gennem porten; de er «derfor
      // er du her» (§6), og linjen findes alligevel.
      const sorteret = [...grunde].sort(sammenlignGrunde);
      const aabne = sorteret.map((g) => g.lukkerOmDage).filter((d): d is number => d != null);
      const lukkerOmDage = aabne.length ? Math.min(...aabne) : null;
      virksomhedslinjer.push({
        linje: "virksomhed",
        companyId: v.companyId,
        navn: v.navn,
        grunde: sorteret,
        alvor: sorteret[0].alvor,
        lukkerOmDage,
        loeftet: lukkerOmDage != null && lukkerOmDage <= LOEFT_DAGE,
        indsats: sorteret[0].indsats,
      });
      continue;
    }

    // Ingen linje: tilstande samles pr. slags; hændelser under tærsklen
    // tælles som «andre virksomheder» — kun hvis virksomheden ikke også
    // står i en samlet tilstand (så er den ikke «anden», den er dér).
    let iTilstand = false;
    for (const g of grunde) {
      if (FORM[g.slags] !== "tilstand") continue;
      const liste = samlede.get(g.slags) ?? [];
      liste.push({ companyId: v.companyId, navn: v.navn, grund: g });
      samlede.set(g.slags, liste);
      iTilstand = true;
    }
    if (!iTilstand && grunde.some((g) => FORM[g.slags] === "haendelse")) {
      antalVirksomhederUnderTaersklen += 1;
    }
  }

  // Samlede tilstande: én linje pr. slags, alvor = den højeste blandt dem.
  const tilstandslinjer: Tilstandslinje[] = [];
  let antalTilstandeSamlet = 0;
  for (const [slags, liste] of samlede) {
    liste.sort((a, b) => sammenlignGrunde(a.grund, b.grund) || a.navn.localeCompare(b.navn, "da"));
    antalTilstandeSamlet += liste.length;
    tilstandslinjer.push({
      linje: "tilstand",
      slags,
      antal: liste.length,
      tekst: tilstandstekst(slags, liste.length),
      virksomheder: liste,
      alvor: liste[0].grund.alvor,
      lukkerOmDage: null,
      loeftet: false,
      indsats: INDSATS[slags],
    });
  }

  const pukler: Pukkellinje[] = [];
  if (agentforslagAntal > 0 && agentforslagAlvor != null) {
    pukler.push({
      linje: "pukkel",
      slags: "agentforslag",
      antal: agentforslagAntal,
      tekst: `${agentforslagAntal} agentforslag venter på din afgørelse`,
      alvor: agentforslagAlvor,
      lukkerOmDage: null,
      loeftet: false,
      indsats: INDSATS.agentforslag,
    });
  }

  // Samlede linjer går gennem alvorsporten som ÉN linje hver.
  const linjer: Linje[] = [
    ...virksomhedslinjer,
    ...tilstandslinjer.filter(gaarGennemPorten),
    ...pukler.filter(gaarGennemPorten),
  ].sort(sammenlignLinjer);

  return {
    linjer,
    antalOpgaver: linjer.length,
    usaedvanligtMange: linjer.length >= USAEDVANLIGT_MANGE,
    underStregen: {
      antalVirksomhederUnderTaersklen,
      antalTilstandeSamlet,
      tilstande: tilstandslinjer.filter((t) => !gaarGennemPorten(t)).sort(sammenlignLinjer) as Tilstandslinje[],
      pukler: pukler.filter((p) => !gaarGennemPorten(p)),
    },
  };
}
