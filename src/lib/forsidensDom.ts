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
 *     truffet, eller der er ingen at træffe. Ingen grund. Det samme gælder
 *     udloebet_vindue_lukket (7/9): tilbudsvinduet er lukket, der er ingen
 *     handling tilbage, og forsiden er handlinger, ikke status.
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
import { afgoerVarselTrin } from "@/lib/varselTrin";
import type { Fornyelsestilstand } from "./fornyelse";
import { BETALINGSFRIST_DAGE, type Betalingsfristtilstand } from "./betalingsfrist";
import { erLukket, type Kvittering } from "./opgaveLukning";
import { afgoerIkkeIGang, ikkeIGangGrundlag, ikkeIGangHandling, ikkeIGangTekst } from "./ikkeIGang";
import { ALVOR_VENTER_PAA_VELKOMST, afgoerVenterPaaVelkomst, venterPaaVelkomstGrundlag, venterPaaVelkomstTekst } from "./venterPaaVelkomst";
import { planenDom, UDEN_BEVAEGELSE_DAGE, type MaalRaekke } from "@/lib/hjemmebane/planen";
import { MAX_AKTIVE_MAAL } from "@/lib/hjemmebane/maal";
import { maanedsnavn } from "@/lib/maanedsnoegle";
import { dagsNoegleKbh } from "@/lib/hjemmebane/kohorte";

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
 *   klar_til_tilbud_varslet 65  (7/9) beslutningen er truffet OG systemet
 *                          har sendt varsel 1 (company_fornyelse.
 *                          varsel_1_sendt_at). Systemet har gjort sit; det
 *                          der står tilbage er rådgiverens PERSONLIGE besked
 *                          — vigtig, men ikke presserende (Jonas 7/9). Under
 *                          tærsklen (70), så den står blandt «det mindre
 *                          presserende» frem for på linjen, og over indgangens
 *                          afventer_betaling (60), hvor rådgiveren intet skal.
 *                          Vinduesporten løfter den alligevel de sidste
 *                          VINDUE_DAGE før slutdato — dér går varsel 2, og
 *                          dér hører den personlige besked hjemme.
 *   klar_til_tilbud_paamindet 65  (7/9 aften) varsel 2 — påmindelsen — er
 *                          sendt, med eller uden varsel 1 (CARMA: den sene
 *                          beslutning sprang varsel 1 over). SAMME alvor som
 *                          varslet, af samme grund: systemet har gjort sit,
 *                          det der står tilbage er rådgiverens personlige
 *                          besked. Hasten bæres ikke af alvoren men af
 *                          vinduesporten: varsel 2 går ved ≤ 7 dage, og dér
 *                          løfter porten linjen uanset alvor. En højere
 *                          alvor ville sige «det haster mere at skrive» —
 *                          det gør det ikke; det haster at vinduet lukker,
 *                          og det siger dagene allerede.
 */
export const ALVOR_FORNYELSE = {
  udloebet_tilbyd: 90,
  klar_til_tilbud: 75,
  klar_til_tilbud_varslet: 65,
  klar_til_tilbud_paamindet: 65,
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
/**
 * Ny og ikke kommet i gang (lib/ikkeIGang, 9/9): et nyt medlem uden målt
 * rapport efter NY_FRA_DAGE. Ikke en krise som en forfalden fornyelse
 * (90), men tidskritisk — vinduet lukker. 75: over ulæst besked (70) og
 * beslutning_mangler (70), på linje med klar_til_tilbud (75) og en
 * forfalden opgave (75), under omsætningsfald (80). Den går gennem
 * alvorsporten (TAERSKEL 70) alene, så linjen står fra dag 21.
 */
export const ALVOR_IKKE_I_GANG = 75;
/**
 * Trin 1 (dag 7–20, lib/ikkeIGang): «ikke kommet i gang endnu» — en
 * påmindelse til rådgiveren om at spørge, ikke en alarm. 70: præcis på
 * tærsklen, så linjen står ved navn, på linje med en ulæst besked (70) og
 * beslutning_mangler (70), under trin 2 (75) og langt under en forfalden
 * fornyelse (udloebet_tilbyd 90).
 */
export const ALVOR_IKKE_BEGYNDT = 70;
/**
 * Venter på velkomst (lib/venterPaaVelkomst, ALVOR_VENTER_PAA_VELKOMST = 80,
 * besluttet 9/9, koblet 10/9): et menneske er lige kommet ind og har ikke
 * hørt fra os. Højt: på linje med omsætningsfald (80), over ikke_i_gang
 * (75) og ulæst besked (70), under en forfalden fornyelse (udloebet_tilbyd
 * 90) og en ubetalt indgang der er forfalden. Den går gennem alvorsporten
 * alene og står ved navn fra dag 1 — før ikke_i_gang overhovedet begynder
 * (dag 7), så rækkefølgen på en ny er: velkomst, så tallene.
 */

export const ALVOR_OPGAVE = {
  forfalden: 75,
  inden_for_3_dage: 70,
  inden_for_14_dage: 55,
} as const;

/**
 * Mål uden bevægelse (TOLVTE slags, «Én plan» fase 4, Jonas 16/9: «rådgiverens
 * forside viser mål uden bevægelse i 30 dage»). Kilden er milestones.status =
 * 'active' med progress_updated_at ældre end UDEN_BEVAEGELSE_DAGE (30) —
 * dommen er planen.ts' dageUdenBevaegelse, ikke en egen regning. ÉN grund
 * pr. virksomhed med antallet, aldrig én pr. mål (prod 16/9: 87 aktive mål
 * med seneste fremdrift 30/6 — det ville være 87 linjer).
 *   stilstand          55  under tærsklen alene: en tilstand der er sand
 *                          igen i morgen, samles med de andre og står under
 *                          stregen — som agentforslag (55). Ikke en krise.
 *   stilstand_laenge   70  60 dage: på tærsklen, som ulæst besked og
 *                          beslutning_mangler — så den samlede linje går
 *                          gennem alvorsporten og står på forsiden.
 *   gennemgang         70  virksomheden har FLERE END TRE aktive mål (prod
 *                          16/9: 8 virksomheder, 5–17 mål) — det er ikke
 *                          stilstand, det er en gennemgang der venter
 *                          (planen.ts: behold højst tre, parkér eller markér
 *                          nået). Vises som gennemgang, aldrig som stilstand.
 */
export const ALVOR_MAAL = {
  stilstand: 55,
  stilstand_laenge: 70,
  gennemgang: 70,
} as const;
/** Fra så mange dage uden bevægelse er alvoren stilstand_laenge. */
export const STILSTAND_LAENGE_DAGE = 60;

/**
 * Refleksion med «hjælp ønskes» (TRETTENDE slags, fase 4; kortet
 * «Refleksionens udgang», forslag 21): medlemmet har i sin månedlige
 * refleksion (pulse_checkins.help_needed) skrevet hvad de søger hjælp til
 * — det er §2 slags 8 «medlemmet har skrevet noget vi bør reagere på»,
 * bygget uden AI: teksten ER udsagnet. 80: på linje med omsætningsfald og
 * «venter på velkomst» — et menneske har bedt om hjælp, og ingen har svaret.
 * Går gennem alvorsporten alene og står ved navn indtil en rådgiver lukker
 * linjen (kvitteringen, grundlag = refleksionens id) eller en nyere
 * refleksion afløser den.
 */
export const ALVOR_REFLEKSION_HJAELP = 80;

/**
 * Ingen mål (FJORTENDE slags, fase 5; Jonas 16/9 «Ja det er i orden»): en
 * aktiv kunde (uden legat) med NUL aktive mål. Prod 16/9: 15 af 29. Fra
 * fase 5 får de ingen AI-forslag (beslutning 3: kun mod et aktivt mål) — så
 * rådgiveren skal vide hvem der mangler mål. 70: på tærsklen, så den samlede
 * linje «N kunder har ingen mål — sæt dem sammen med medlemmet» står på
 * forsiden som ÉN linje; en tilstand (sand igen i morgen), aldrig én linje
 * pr. kunde. Lukning: grundlag = antallet af ALLE virksomhedens mål (også
 * parkerede og nåede) — sættes et mål, er grunden væk; lukkes linjen uden
 * at der sættes mål, holder den til noget ændrer sig i målene.
 */
export const ALVOR_INGEN_MAAL = 70;

/**
 * BØLGEN (Jonas 17/9 «AA», valg 2; analyse-raadgivernes-forside.md §2c og §6
 * forslag 4; forsiden-design §3 «Bølgen»): når mindst BOELGE_FRA
 * virksomheder venter på velkomst med SAMME startdag (dansk dato), er det
 * ikke tre hændelser men ÉN — «sig hej til dem fra webinaret». De samles
 * til én linje med alle navnene (foldet i fladen, ét link pr. navn), og
 * «Færdiggjort»/«Ikke relevant» på den samlede linje kvitterer dem alle
 * (grundlaget er de enkelte velkomster; se Boelgelinje.virksomheder).
 * Under BOELGE_FRA på samme dag: én linje pr. navn, som i dag.
 *
 * MED I BØLGEN er en virksomhed kun når den venter på velkomst og INTET
 * andet kræver sit eget svar: ved siden af må kun stå BOELGENS_LEDSAGERE —
 * tavshed («aldrig skrevet» er tautologisk på dag 1), ikke i gang, ingen
 * mål, mål uden bevægelse. En ny der har SKREVET (venter_i_samtalen),
 * stikker ud, har en frist, en fornyelse, en indgang eller en refleksion
 * med hjælp, får sin egen linje som i dag — den er mere end «ny».
 *
 * FORM: venter_paa_velkomst er stadig en HÆNDELSE (FORM) — bølgen er ikke
 * en tilstand (den lukker når alle har fået en besked) og ikke en pukkel
 * (den er ny). Den er §3's tredje form anvendt på én slags, når hændelsen
 * sker for mange på én gang. Falder antallet under BOELGE_FRA (nogle har
 * fået en besked, nogle er lukket), står resten igen som egne linjer.
 */
export const BOELGE_FRA = 3;
/** Navne i selve linjeteksten; resten «…» — alle står i folden. */
export const BOELGE_NAVNE_I_TEKST = 3;
export const BOELGENS_LEDSAGERE: ReadonlySet<OpgaveSlags> = new Set<OpgaveSlags>([
  "tavshed",
  "ikke_i_gang",
  "ingen_maal",
  "maal_uden_bevaegelse",
]);

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
  | "agentforslag" // §3's pukkel — ikke en af de otte, men besluttet vist som én linje
  | "ikke_i_gang" // TIENDE slags (Jonas 9/9, en designændring som §2 varsler): ny uden målt rapport — lib/ikkeIGang
  | "venter_paa_velkomst" // ELLEVTE slags (bygget 9/9, koblet 10/9): et medlem kom ind, ingen rådgiver har skrevet — lib/venterPaaVelkomst
  | "maal_uden_bevaegelse" // TOLVTE slags («Én plan» fase 4, 16/9): aktive mål uden bevægelse i 30 dage — eller flere end tre aktive (gennemgang). lib/hjemmebane/planen
  | "refleksion_hjaelp" // TRETTENDE slags (fase 4, 16/9): refleksionen bærer «søger hjælp til» — pulse_checkins.help_needed. §2 slags 8 uden AI.
  | "ingen_maal"; // FJORTENDE slags (fase 5, 16/9): en aktiv kunde uden aktive mål — sæt dem sammen med medlemmet.

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
  ikke_i_gang: "haendelse", // dag 21 uden tal er noget der SKER én gang — og linjen skal stå ved navn, ikke samles
  venter_paa_velkomst: "haendelse", // et menneske kom ind én gang — linjen står ved navn, og forsvinder når nogen skriver
  maal_uden_bevaegelse: "tilstand", // sand igen i morgen: samles til «N virksomheder har mål der ikke rykker sig», hægtes på en linje der findes alligevel
  refleksion_hjaelp: "haendelse", // én refleksion, én gang — linjen står ved navn til den er lukket eller afløst
  ingen_maal: "tilstand", // sand igen i morgen: samles til «N kunder har ingen mål — sæt dem sammen med medlemmet»
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
  ikke_i_gang: 2, // én besked: hjælp dem i gang
  venter_paa_velkomst: 2, // én besked: sig hej
  maal_uden_bevaegelse: 2, // én besked: spørg hvad der står i vejen (gennemgangen er et klik pr. mål i Planen, men samtalen først)
  refleksion_hjaelp: 2, // én besked: svar på det de bad om hjælp til
  ingen_maal: 2, // en samtale om mål — sæt dem sammen
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
  /** Fase 0b («Én plan», plan §4 0b): hvor mange af de ventende forslag der
      HAR en godkend-vej (tool i UNDERSTOETTEDE_SKRIVEVEJE — i dag kun
      update_weekly_focus). Resten kan kun forkastes, og puklens tekst må
      ikke love «din afgørelse» om dem (recon §6.4). Valgfri: en kalder uden
      tallet (VirksomhedView «derfor er du her», ældre tests) får den gamle
      tekst. */
  agentforslagMedGodkendVej?: number;
  /** afgoerFornyelsestilstand(…, nu); null når kalderen ikke har regnet den
      (fx legat — samme udsnit som FornyelsesSektion). */
  fornyelse: Fornyelsestilstand | null;
  /** company_fornyelse.varsel_1_sendt_at — null = varsel 1 er ikke sendt (eller
      ingen række). Ved SIDEN AF motoren, ikke inde i Fornyelsestilstand:
      stemplet er ikke en del af tilstandsdommen (motoren er spejlet i _shared
      og paritetstestet; den kender ikke stemplerne). Kun forsidens dom læser
      det, og kun for klar_til_tilbud. Begge hentninger (AdvisorDashboard og
      useVirksomhed) SKAL bære det — #682/#689-lærdommen: to hentninger, ét tal. */
  varsel1SendtAt: string | null;
  /** company_fornyelse.varsel_2_sendt_at — påmindelsen (7/9 aften). Vinder
      over varsel 1 (lib/varselTrin, ÉN regel for badge og dom). Begge
      hentninger bærer den (AdvisorDashboard og useVirksomhed — låst af
      varselStempel.guard.test.ts). Stadig valgfri i typen for ældre kaldere
      og tests; udeladt = ingen påmindelse. */
  varsel2SendtAt?: string | null;
  /** afgoerBetalingsfrist(…, nu); null når virksomheden ikke er i indgangen
      (ingen række i company_betalingslink — kalderen afgør det, som
      betalingsfrist.ts siger). */
  indgang: Betalingsfristtilstand | null;
  /** company_actions for virksomheden; dommen filtrerer selv. */
  opgaver: readonly OpgaveTilDom[];
  /** §8 — ignoreres i dag, se AiUdsagn. */
  aiUdsagn?: readonly AiUdsagn[];

  // ── Lukningen (Jonas 8/9, lib/opgaveLukning) ──────────────────────────
  // Grundlaget pr. slags — det dommen byggede på — så en lukket opgave
  // kan skelnes fra en ny. Alle valgfrie: en kalder uden dem (VirksomhedView
  // «derfor er du her») får tomme grundlag og ingen kvittering, og dommen
  // lukker så intet.
  /** period_key for den seneste committede periode talsignalerne er regnet af. */
  senestePeriode?: string | null;
  /** conversations.last_message_at — tavshedens grundlag; null = aldrig. */
  senesteBeskedAt?: string | null;
  /** Seneste conversations.last_member_message_at — den ulæstes grundlag. */
  senesteMedlemsbeskedAt?: string | null;
  /** company_fornyelse.beslutning — en del af fornyelsens grundlag. */
  fornyelseBeslutning?: string | null;
  /** Den nyeste kvittering med grundlag for virksomheden; null = ingen. */
  kvittering?: Kvittering | null;

  // ── Ny og ikke i gang (lib/ikkeIGang, 9/9) ─────────────────────────────
  /** Første company_members.created_at — medlemskabets begyndelse («de fik
      adgang»). null/udeladt = ingen medlemmer, intet signal. */
  medlemSiden?: string | null;
  /** conversations.last_advisor_reply_at — seneste MENNESKEBESKED fra en
      rådgiver (trigger'en sætter den kun for message_type 'user'); null =
      ingen rådgiver har skrevet. Til «venter på velkomst» (10/9). */
  sidsteRaadgiverBeskedAt?: string | null;
  /** Findes mindst én facts-række med data_basis = 'measured'? */
  harMaaltRapport?: boolean;
  /** Uploadede (ikke slettede) rapporter — ændrer ordene, ikke dommen. */
  antalUploads?: number;

  // ── «Én plan» fase 4 (16/9) ────────────────────────────────────────────
  /** Virksomhedens AKTIVE mål (milestones, status active) som planen.ts læser
      dem. Udeladt/tom = ingen mål, intet signal. Kalderen (AdvisorDashboard)
      henter dem; VirksomhedView bærer dem ikke (og får så ingen grund). */
  maal?: readonly MaalRaekke[];
  /** Den NYESTE refleksion (pulse_checkins) med help_needed udfyldt — id,
      teksten og hvornår. null/udeladt = ingen. Én pr. virksomhed: en nyere
      refleksion med hjælp afløser den forrige (nyt grundlag). */
  refleksionHjaelp?: { id: string; helpNeeded: string; createdAt: string; periodKey?: string | null } | null;
}

/** Én grund: hvorfor virksomheden står der, og hvad man gør (§1). */
export interface Grund {
  slags: OpgaveSlags;
  /** Stabil nøgle for §9's tildeling og §7's fravalg: virksomhed +
      signaltype. Signaltypen er den fine nøgle — motorens noegle,
      fornyelsens status, indgangens status, opgavens trin. */
  signaltype: string;
  /** Lukningens identitet (lib/opgaveLukning): slags, evt. med signaltype
      eller opgave-id — stabil på tværs af trin, så en fornyelse der går
      fra varslet til påmindet er SAMME grund med NYT grundlag. */
  noegle: string;
  /** Det dommen byggede på — én tekst; ændrer den sig, er grunden levende
      igen selvom den var lukket. */
  grundlag: string;
  /** Kort dansk tekst — hvad der er set. */
  tekst: string;
  /** Handlingen (§1): «skriv til», «tag fat i», aldrig «ring». */
  handling: string;
  alvor: number;
  /** Hele dage til vinduet lukker; null = intet vindue, eller lukket. */
  lukkerOmDage: number | null;
  indsats: Indsats;
  detalje?: string;
  /** Startdagen som DANSK dato («YYYY-MM-DD») — kun venter_paa_velkomst;
      bølgen grupperer på den (17/9). Grundlaget (lukningen) er uændret UTC. */
  dag?: string;
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
  /** Det fladen gemmer når linjen lukkes: nøgle → grundlag for alle
      linjens grunde (lib/opgaveLukning.grundlagForLinje). */
  grundlag: Record<string, string>;
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
  /** Hvem puklen ligger hos (6/9): dommen kender virksomhederne der hvor
      den tæller, og fladen skal kunne pege på dem — agentforslag afgøres
      kun på /virksomhed/:companyId. Flest forslag først, så navn. Er der
      præcis én, nævner `tekst` den ved navn. */
  virksomheder: { companyId: string; navn: string; antal: number }[];
  alvor: number;
  lukkerOmDage: null;
  loeftet: false;
  indsats: Indsats;
}

/** Bølgen (17/9): ≥ BOELGE_FRA velkomster med samme startdag som ÉN linje. */
export interface Boelgelinje {
  linje: "boelge";
  slags: "venter_paa_velkomst";
  /** Startdagen (dansk «YYYY-MM-DD») — nøglen linjen er samlet på. */
  dag: string;
  antal: number;
  /** «12 nye fra i går: A, B, C … — sig hej» */
  tekst: string;
  /** Alle i bølgen, alfabetisk; grundlag = hver virksomheds linjegrundlag,
      så «Færdiggjort» på bølgen kan kvittere hver enkelt (én kvittering pr.
      virksomhed, som ved en egen linje). */
  virksomheder: { companyId: string; navn: string; grund: Grund; grundlag: Record<string, string> }[];
  alvor: number;
  lukkerOmDage: null;
  loeftet: false;
  indsats: Indsats;
}

export type Linje = Virksomhedslinje | Tilstandslinje | Pukkellinje | Boelgelinje;

export interface Forsidensdom {
  /** Det der står på forsiden, sorteret (§4). */
  linjer: Linje[];
  /** §10: antallet af linjer efter gruppering — «Syv ting kræver dig i dag». */
  antalOpgaver: number;
  /** §5: antalOpgaver >= USAEDVANLIGT_MANGE — fladen skal sige det. */
  usaedvanligtMange: boolean;
  /** Virksomheder der venter på velkomst med startdag i dag eller i går
      (dansk dato) — bølgens mål, og flagets forklaring (usaedvanligtMangeTekst). */
  nyeSidenIGaar: number;
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
      continue; // friske_tal (§11), agentforslag_venter (puklen), stamdata_mangler (kun virksomhedssiden, 14/9)
    }
    // Grundlaget (lukningen): tavshed = sidste besked («aldrig» uden),
    // ulæst = sidste medlemsbesked, talsignal = perioden det er regnet af.
    const grundlag =
      slags === "tavshed"
        ? (v.senesteBeskedAt ?? "aldrig")
        : slags === "venter_i_samtalen"
          ? (v.senesteMedlemsbeskedAt ?? "")
          : (v.senestePeriode ?? "");
    grunde.push({
      slags,
      signaltype: s.noegle,
      noegle: slags === "stikker_ud" ? `stikker_ud:${s.noegle}` : slags,
      grundlag,
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
    dage til kontraktens slutdato (dage_til_udloeb); lukket efter udløb.

    VARSLET (7/9): klar_til_tilbud betød «send tilbuddet» — sandt så længe
    ingen sendte noget. Fra fornyelsesvarsel-cron stempler varsel_1_sendt_at,
    har SYSTEMET sendt tilbuddet, og forsiden må ikke bede rådgiveren sende
    det igen. Så siger den «skriv til dem» i stedet (ordningens §7: den
    personlige besked kommer EFTER systemets mail, ikke i stedet for), med
    egen signaltype og lavere alvor. Stemplet læses fra VirksomhedTilDom,
    ikke fra motoren — det er ikke en tilstand, det er et faktum om post. */
/** De fornyelsestilstande hvor der er noget at gøre — «N fornyelser venter
    på dig». ÉT sted: dommen (grundFraFornyelse) og pulsen (lib/pulsen)
    læser samme liste, så forsidens linje og højre spaltes tal aldrig
    kan sige to forskellige mængder. */
export const FORNYELSE_VENTER_STATUSSER = ["udloebet_tilbyd", "klar_til_tilbud", "beslutning_mangler"] as const;
export type FornyelseVenterStatus = (typeof FORNYELSE_VENTER_STATUSSER)[number];
export function venterPaaFornyelse(status: string | null | undefined): status is FornyelseVenterStatus {
  return typeof status === "string" && (FORNYELSE_VENTER_STATUSSER as readonly string[]).includes(status);
}

function grundFraFornyelse(v: VirksomhedTilDom): Grund | null {
  const f = v.fornyelse;
  if (!f) return null;
  const status = f.status;
  if (!venterPaaFornyelse(status)) return null;
  const dage = f.dage_til_udloeb;
  // Begge stempler, ÉN regel (lib/varselTrin): varsel 2 vinder over varsel 1.
  const trin = status === "klar_til_tilbud" ? afgoerVarselTrin(v.varsel1SendtAt, v.varsel2SendtAt ?? null) : "ingen";
  const varslet = trin !== "ingen";
  const dageTekst = dage != null ? ` — ${flertal(dage, "dag", "dage")} til udløb` : "";
  const tekst =
    status === "udloebet_tilbyd"
      ? `Kontrakten udløb${dage != null ? ` for ${flertal(-dage, "dag", "dage")} siden` : ""} — tilbud givet, intet svar`
      : status === "klar_til_tilbud"
        ? trin === "varsel_2"
          ? `Påmindelsen er sendt${dageTekst}`
          : trin === "varsel_1"
            ? `Varslet er sendt${dageTekst}`
            : `Fornyelse besluttet: vi tilbyder${dageTekst}` // ordet er dansk, ikke databasens (Jonas 7/9; lib/fornyelsesOrd)
        : `Fornyelse: beslutning mangler${dageTekst}`;
  const handling =
    status === "udloebet_tilbyd"
      ? `Følg op på tilbuddet til ${v.navn}`
      : status === "klar_til_tilbud"
        ? varslet
          ? `Skriv til ${v.navn}`
          : `Send tilbuddet til ${v.navn}`
        : `Beslut fornyelsen for ${v.navn}`;
  // Egen signaltype pr. trin, så §7's fravalg og §9's tildeling kan skelne
  // «send» fra «skriv» — og så alvoren slås op på det rigtige trin.
  const signaltype: keyof typeof ALVOR_FORNYELSE =
    trin === "varsel_2" ? "klar_til_tilbud_paamindet" : trin === "varsel_1" ? "klar_til_tilbud_varslet" : status;
  return {
    slags: "fornyelse",
    signaltype,
    noegle: "fornyelse",
    // Enhver ændring i status, beslutning eller stempel er noget nyt (8/9).
    grundlag: [status, v.fornyelseBeslutning ?? "", v.varsel1SendtAt ?? "", v.varsel2SendtAt ?? ""].join("|"),
    tekst,
    handling,
    alvor: ALVOR_FORNYELSE[signaltype],
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
    noegle: "indgang",
    grundlag: status,
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
      noegle: `opgave:${o.id}`,
      // Fristen som kalenderdag: flyttes den, er det noget nyt; at den
      // passerer er det ikke (lukket er lukket, Jonas 8/9).
      grundlag: `${o.due_date.getFullYear()}-${String(o.due_date.getMonth() + 1).padStart(2, "0")}-${String(o.due_date.getDate()).padStart(2, "0")}`,
      tekst,
      handling: `Skriv til ${v.navn} om «${o.title}»`,
      alvor: ALVOR_OPGAVE[trin],
      lukkerOmDage: aabentVindue(dage),
      indsats: INDSATS.opgave_naer_deadline,
    });
  }
  return grunde;
}

/** Ny og ikke kommet i gang (lib/ikkeIGang): egen slags, egen handling —
    «Hjælp X i gang» er hverken «skriv til» (tavshed) eller «tag det op»
    (tal); det er onboarding. Uden medlemSiden (kalderen bærer den ikke,
    fx VirksomhedView) giver dommen ingen_start og ingen grund. */
function grundFraIkkeIGang(v: VirksomhedTilDom, nu: Date): Grund | null {
  const input = { medlemSiden: v.medlemSiden ?? null, harMaaltRapport: v.harMaaltRapport ?? false, antalUploads: v.antalUploads ?? 0 };
  const dom = afgoerIkkeIGang(input, nu);
  if (!dom.signal) return null;
  // To trin, én dom (som fornyelsens varsel 1/2): signaltypen bærer trinnet
  // og upload-varianten; nøglen er den samme, grundlaget skifter med trinnet.
  const trin = dom.trin === 1 ? "ikke_begyndt" : "ikke_i_gang";
  return {
    slags: "ikke_i_gang",
    signaltype: dom.harUploadetUdenGodkendelse ? `${trin}_uploadet` : trin,
    noegle: "ikke_i_gang",
    grundlag: ikkeIGangGrundlag(input, dom),
    tekst: ikkeIGangTekst(dom),
    handling: ikkeIGangHandling(dom, v.navn),
    alvor: dom.trin === 1 ? ALVOR_IKKE_BEGYNDT : ALVOR_IKKE_I_GANG,
    lukkerOmDage: null,
    indsats: INDSATS.ikke_i_gang,
  };
}

/** Venter på velkomst (lib/venterPaaVelkomst): et medlem kom ind, og ingen
    rådgiver har skrevet en menneskebesked — fra dag 1. Bygget 9/9, koblet
    HER 10/9 (den lå uden læser, som send-welcome-message gjorde). Uden
    medlemSiden (kalderen bærer den ikke) er der intet signal. Handlingen
    er rytmens dag 1: et menneske siger hej og beder om historikken. */
function grundFraVenterPaaVelkomst(v: VirksomhedTilDom, nu: Date): Grund | null {
  const input = { medlemSiden: v.medlemSiden ?? null, sidsteRaadgiverBeskedAt: v.sidsteRaadgiverBeskedAt ?? null };
  const dom = afgoerVenterPaaVelkomst(input, nu);
  if (!dom.signal) return null;
  // Startdagen som dansk dato (bølgens nøgle, 17/9) — grundlaget nedenfor
  // er uændret (venterPaaVelkomstGrundlag, UTC-dag), så kvitteringer fra før
  // holder.
  const start = v.medlemSiden ? new Date(v.medlemSiden) : null;
  const dag = start && !Number.isNaN(start.getTime()) ? dagsNoegleKbh(start) : undefined;
  return {
    slags: "venter_paa_velkomst",
    signaltype: "venter_paa_velkomst",
    noegle: "venter_paa_velkomst",
    grundlag: venterPaaVelkomstGrundlag(input),
    tekst: venterPaaVelkomstTekst(dom),
    handling: `Skriv til ${v.navn}`,
    alvor: ALVOR_VENTER_PAA_VELKOMST,
    lukkerOmDage: null,
    indsats: INDSATS.venter_paa_velkomst,
    ...(dag ? { dag } : {}),
  };
}

/** Mål uden bevægelse ELLER gennemgang («Én plan» fase 4). Dommen er
    planen.ts' (planenDom): gennemgang = flere end tre aktive; ellers de
    aktive mål med dageUdenBevaegelse >= UDEN_BEVAEGELSE_DAGE. ÉN grund pr.
    virksomhed. Uden mål (kalderen bærer dem ikke): ingen grund.
    GRUNDLAGET (lukningen): gennemgang → antallet aktive (falder det, er
    det noget nyt — også når det stadig er over tre); stilstand → hvert
    stillestående måls id med stemplet (en bevægelse på ét af dem, eller
    et nyt stillestående mål, er noget nyt; at dagene vokser er det ikke —
    lukket er lukket, Jonas 8/9). */
/** Ingen mål (fase 5): kalderen bærer `maal` (AdvisorDashboard: kun aktive
    kunder uden legat) og listen er tom for AKTIVE mål → én grund. Uden
    feltet (VirksomhedView) ingen grund. */
function grundFraIngenMaal(v: VirksomhedTilDom): Grund | null {
  if (!v.maal) return null;
  if (v.maal.some((m) => m.status === "active")) return null;
  return {
    slags: "ingen_maal",
    signaltype: "ingen_maal",
    noegle: "ingen_maal",
    grundlag: `ingen:${v.maal.length}`,
    tekst: v.maal.length === 0 ? "Ingen mål endnu" : `Ingen aktive mål (${flertal(v.maal.length, "parkeret eller nået", "parkerede eller nåede")})`,
    handling: `Sæt mål sammen med ${v.navn}`,
    alvor: ALVOR_INGEN_MAAL,
    lukkerOmDage: null,
    indsats: INDSATS.ingen_maal,
  };
}

function grundFraMaal(v: VirksomhedTilDom, nu: Date): Grund | null {
  if (!v.maal || v.maal.length === 0) return null;
  const plan = planenDom(v.maal, [], nu);
  if (plan.gennemgang) {
    const antal = plan.aktive.length;
    return {
      slags: "maal_uden_bevaegelse",
      signaltype: "maal_gennemgang",
      noegle: "maal_uden_bevaegelse",
      grundlag: `gennemgang:${antal}`,
      tekst: `${antal} aktive mål — gennemgå planen: behold højst ${MAX_AKTIVE_MAAL}`,
      handling: `Gennemgå målene med ${v.navn}`,
      alvor: ALVOR_MAAL.gennemgang,
      lukkerOmDage: null,
      indsats: INDSATS.maal_uden_bevaegelse,
    };
  }
  const stille = plan.aktive.filter((x) => x.dageUdenBevaegelse != null && x.dageUdenBevaegelse >= UDEN_BEVAEGELSE_DAGE);
  if (stille.length === 0) return null;
  const laengst = Math.max(...stille.map((x) => x.dageUdenBevaegelse ?? 0));
  const trin: keyof typeof ALVOR_MAAL = laengst >= STILSTAND_LAENGE_DAGE ? "stilstand_laenge" : "stilstand";
  const tekst =
    stille.length === 1
      ? `Målet «${stille[0].maal.title}» har ikke rykket sig i ${laengst} dage`
      : `${stille.length} mål har ikke rykket sig i ${laengst} dage`;
  return {
    slags: "maal_uden_bevaegelse",
    signaltype: `maal_${trin}`,
    noegle: "maal_uden_bevaegelse",
    grundlag: stille.map((x) => `${x.maal.id}=${x.maal.progress_updated_at ?? "aldrig"}`).sort().join(","),
    tekst,
    handling: `Spørg ${v.navn} hvad der står i vejen`,
    alvor: ALVOR_MAAL[trin],
    lukkerOmDage: null,
    indsats: INDSATS.maal_uden_bevaegelse,
  };
}

/** Refleksion med «hjælp ønskes» (fase 4): den nyeste refleksion hvor
    medlemmet skrev hvad de søger hjælp til. Teksten citeres kort (uden
    linjeskift, højst REFLEKSION_UDDRAG tegn), så rådgiveren ser HVAD før
    hun klikker. Grundlag = refleksionens id: lukket holder til en nyere
    refleksion med hjælp kommer.

    STRAMMET 17/9 (skærmbevis 00:06: 9 af 12 linjer var refleksioner, heraf
    to der ikke var spørgsmål — «x», «Jeg vender tilbage …» — og linjerne
    lukkede kun ved kvittering, også når rådgiveren allerede havde svaret i
    chatten; Jonas: «ja»):
      1. Linjen LUKKER AF SIG SELV når en rådgiver har skrevet i virksomhedens
         samtale EFTER refleksionen blev sendt — sidsteRaadgiverBeskedAt
         (conversations.last_advisor_reply_at, kun menneskebeskeder) nyere end
         refleksionens createdAt (pulse_checkins.created_at — upsert på
         company_id, period_key bumper den ikke, så «sendt» = første gang).
         Præcis samme tidspunkt er IKKE nyere. Ulæselige stempler: linjen
         står (fail-open — hellere én linje for meget end en glemt bøn om hjælp).
         «Færdiggjort» er til det der er klaret på anden måde.
      2. Under REFLEKSION_MIN_TEGN tegn efter trim tæller ikke («x»).
      3. Teksten bærer perioden: «Refleksion september 2026: Søger hjælp til «…»». */
export const REFLEKSION_UDDRAG = 90;
/** Færre tegn end dette (efter trim) er ikke en bøn om hjælp — «x» er et klik, ikke et spørgsmål. */
export const REFLEKSION_MIN_TEGN = 3;
export function refleksionUddrag(tekst: string): string {
  const t = tekst.replace(/\s+/g, " ").trim();
  return t.length <= REFLEKSION_UDDRAG ? t : `${t.slice(0, REFLEKSION_UDDRAG - 1).trimEnd()}…`;
}
/** «september 2026» fra period_key «2026-09»; null når nøglen er ulæselig. */
export function refleksionsPeriode(periodKey: string | null | undefined): string | null {
  if (!periodKey) return null;
  const navn = maanedsnavn(periodKey);
  return navn ? `${navn} ${periodKey.slice(0, 4)}` : null;
}
/** Er refleksionen BESVARET — har en rådgiver skrevet i samtalen efter den blev sendt? */
export function refleksionBesvaret(refleksionSendtAt: string, sidsteRaadgiverBeskedAt: string | null | undefined): boolean {
  if (!sidsteRaadgiverBeskedAt) return false;
  const sendt = Date.parse(refleksionSendtAt);
  const svar = Date.parse(sidsteRaadgiverBeskedAt);
  if (Number.isNaN(sendt) || Number.isNaN(svar)) return false;
  return svar > sendt;
}
function grundFraRefleksion(v: VirksomhedTilDom): Grund | null {
  const r = v.refleksionHjaelp;
  if (!r || !r.id || !r.helpNeeded || r.helpNeeded.trim().length < REFLEKSION_MIN_TEGN) return null;
  if (refleksionBesvaret(r.createdAt, v.sidsteRaadgiverBeskedAt)) return null;
  const periode = refleksionsPeriode(r.periodKey);
  return {
    slags: "refleksion_hjaelp",
    signaltype: "refleksion_hjaelp",
    noegle: "refleksion_hjaelp",
    grundlag: r.id,
    tekst: `${periode ? `Refleksion ${periode}: ` : ""}Søger hjælp til «${refleksionUddrag(r.helpNeeded)}»`,
    handling: `Svar ${v.navn} på refleksionen`,
    alvor: ALVOR_REFLEKSION_HJAELP,
    lukkerOmDage: null,
    indsats: INDSATS.refleksion_hjaelp,
  };
}

/** Alle grunde for én virksomhed. aiUdsagn ignoreres bevidst (§8 mangler).
    LUKKEDE grunde (lib/opgaveLukning: kvitteringen gemte præcis dette
    grundlag) tages ud HER, før porterne — så en lukket grund hverken giver
    egen linje, en plads i en tilstandstælling eller tæller «under
    tærsklen» (Jonas 8/9). */
function grundeFor(v: VirksomhedTilDom, nu: Date): Grund[] {
  const grunde = grundeFraMotoren(v);
  const f = grundFraFornyelse(v);
  if (f) grunde.push(f);
  const i = grundFraIndgang(v);
  if (i) grunde.push(i);
  grunde.push(...grundeFraOpgaver(v, nu));
  const n = grundFraIkkeIGang(v, nu);
  if (n) grunde.push(n);
  const w = grundFraVenterPaaVelkomst(v, nu);
  if (w) grunde.push(w);
  const m = grundFraMaal(v, nu);
  if (m) grunde.push(m);
  const im = grundFraIngenMaal(v);
  if (im) grunde.push(im);
  const r = grundFraRefleksion(v);
  if (r) grunde.push(r);
  return grunde.filter((g) => !erLukket(g, v.kvittering));
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
  // To bølger (samme alvor og indsats): nyeste dag først — «i går» over «1. september».
  if (a.linje === "boelge" && b.linje === "boelge" && a.dag !== b.dag) return b.dag.localeCompare(a.dag);
  return b.alvor - a.alvor || a.indsats - b.indsats || navnAf(a).localeCompare(navnAf(b), "da");
}

function navnAf(l: Linje): string {
  return l.linje === "virksomhed" ? l.navn : l.tekst;
}

/** «i dag» / «i går» / «22. september» for en dansk dagsnøgle. */
export function boelgeDagTekst(dag: string, nu: Date): string {
  if (dag === dagsNoegleKbh(nu)) return "i dag";
  if (dag === dagsNoegleKbh(new Date(nu.getTime() - MS_PER_DOEGN))) return "i går";
  const navn = maanedsnavn(dag.slice(0, 7));
  return navn ? `${Number(dag.slice(8, 10))}. ${navn}` : dag;
}

/** «12 nye fra i går: A, B, C … — sig hej» — højst BOELGE_NAVNE_I_TEKST navne
    i teksten; alle står i folden. */
export function boelgeTekst(antal: number, dagTekst: string, navne: readonly string[]): string {
  const viste = navne.slice(0, BOELGE_NAVNE_I_TEKST).join(", ");
  return `${antal} nye fra ${dagTekst}: ${viste}${navne.length > BOELGE_NAVNE_I_TEKST ? " …" : ""} — sig hej`;
}

/** Flagets tekst (§5, rettet 17/9 så den er sand begge dage): når mindst
    BOELGE_FRA er nye siden i går, er DAGEN usædvanlig — ikke tærsklen. */
export const USAEDVANLIGT_MANGE_TEKST =
  "Usædvanligt mange kræver noget i dag — så mange linjer betyder at tærsklen er forkert, ikke at dagen er.";
export function usaedvanligtMangeTekst(d: Pick<Forsidensdom, "nyeSidenIGaar">): string {
  return d.nyeSidenIGaar >= BOELGE_FRA
    ? `Usædvanligt mange i dag — ${d.nyeSidenIGaar} af dem er nye siden i går.`
    : USAEDVANLIGT_MANGE_TEKST;
}

/** Puklens tekst (0b): «din afgørelse» loves kun for forslag der kan
    godkendes. Uden tallet (null): den gamle tekst. Alle med godkend-vej:
    den gamle tekst. Ingen: «til orientering — de kan kun forkastes».
    Blandet: begge tal. Kortets egen tekstrettelse (EPIC 4/9, recon §8c). */
export function pukkeltekst(antal: number, medGodkendVej: number | null, hos: string): string {
  if (medGodkendVej == null || medGodkendVej >= antal) return `${antal} agentforslag${hos} venter på din afgørelse`;
  if (medGodkendVej <= 0) return `${antal} agentforslag${hos} til orientering — de kan kun forkastes`;
  return `${antal} agentforslag${hos}: ${medGodkendVej} venter på din afgørelse, ${antal - medGodkendVej} til orientering`;
}

/** Den samlede måls-linje (fase 4): gennemgang og stilstand er to ting og
    nævnes hver for sig — «3 virksomheder har mål til gennemgang, 5 har mål
    der ikke rykker sig». Eksporteret til tests og forsideLinks. */
export function maalTilstandstekst(antalGennemgang: number, antalStilstand: number): string {
  const dele: string[] = [];
  if (antalGennemgang > 0) dele.push(`${flertal(antalGennemgang, "virksomhed har", "virksomheder har")} mål til gennemgang`);
  if (antalStilstand > 0) dele.push(`${antalGennemgang > 0 ? antalStilstand : flertal(antalStilstand, "virksomhed", "virksomheder")} ${antalGennemgang > 0 ? "har" : "har"} mål der ikke rykker sig`);
  return dele.join(", ");
}

function tilstandstekst(slags: OpgaveSlags, antal: number, liste?: readonly { grund: Grund }[]): string {
  const v = flertal(antal, "virksomhed", "virksomheder");
  switch (slags) {
    case "tavshed":
      return `${v} har du ikke hørt fra længe`;
    case "fornyelse":
      return `${flertal(antal, "fornyelse", "fornyelser")} venter på dig`;
    case "indgang":
      return `${flertal(antal, "indgang", "indgange")} er ikke betalt`;
    case "maal_uden_bevaegelse": {
      const gennemgang = (liste ?? []).filter((x) => x.grund.signaltype === "maal_gennemgang").length;
      return maalTilstandstekst(gennemgang, antal - gennemgang);
    }
    case "ingen_maal":
      return `${flertal(antal, "kunde", "kunder")} har ingen mål — sæt dem sammen med medlemmet`;
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
  const agentforslagHos: Pukkellinje["virksomheder"] = [];
  // Godkend-vej (0b): summen kendes kun når ALLE bidragende virksomheder
  // bærer tallet — ellers null, og teksten er den gamle.
  let agentforslagMedGodkendVej: number | null = 0;

  for (const v of virksomheder) {
    // Puklen tælles på tværs af alle — også dem der får en linje. Virksomheden
    // bæres med, så fladen kan pege på den (6/9).
    const pukkelSignal = v.signaler.find((s) => s.koe === "agentforslag_venter");
    if (pukkelSignal && v.agentforslagVenter > 0) {
      agentforslagAntal += v.agentforslagVenter;
      agentforslagAlvor = Math.max(agentforslagAlvor ?? 0, pukkelSignal.alvor);
      agentforslagHos.push({ companyId: v.companyId, navn: v.navn, antal: v.agentforslagVenter });
      if (agentforslagMedGodkendVej != null) {
        agentforslagMedGodkendVej = v.agentforslagMedGodkendVej == null
          ? null
          : agentforslagMedGodkendVej + Math.min(v.agentforslagMedGodkendVej, v.agentforslagVenter);
      }
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
        grundlag: Object.fromEntries(sorteret.map((g) => [g.noegle, g.grundlag])),
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
      tekst: tilstandstekst(slags, liste.length, liste),
      virksomheder: liste,
      alvor: liste[0].grund.alvor,
      lukkerOmDage: null,
      loeftet: false,
      indsats: INDSATS[slags],
    });
  }

  const pukler: Pukkellinje[] = [];
  if (agentforslagAntal > 0 && agentforslagAlvor != null) {
    agentforslagHos.sort((a, b) => b.antal - a.antal || a.navn.localeCompare(b.navn, "da"));
    // Ligger hele puklen hos ÉN virksomhed, nævnes den ved navn — linjen på
    // forsiden peger så direkte på den (6/9).
    const hos = agentforslagHos.length === 1 ? ` hos ${agentforslagHos[0].navn}` : "";
    pukler.push({
      linje: "pukkel",
      slags: "agentforslag",
      antal: agentforslagAntal,
      tekst: pukkeltekst(agentforslagAntal, agentforslagMedGodkendVej, hos),
      virksomheder: agentforslagHos,
      alvor: agentforslagAlvor,
      lukkerOmDage: null,
      loeftet: false,
      indsats: INDSATS.agentforslag,
    });
  }

  // Bølgen (17/9): velkomster med samme startdag samles når de er mindst
  // BOELGE_FRA — og kun for virksomheder der ikke har andet på linjen end
  // ledsagerne. Tallet «nye siden i går» tælles FØR samlingen, over alle
  // velkomstlinjer, så flaget kan forklare sig.
  const idag = dagsNoegleKbh(nu);
  const igaar = dagsNoegleKbh(new Date(nu.getTime() - MS_PER_DOEGN));
  let nyeSidenIGaar = 0;
  const prDag = new Map<string, Virksomhedslinje[]>();
  for (const l of virksomhedslinjer) {
    const velkomst = l.grunde.find((g) => g.slags === "venter_paa_velkomst");
    if (!velkomst || !velkomst.dag) continue;
    if (velkomst.dag === idag || velkomst.dag === igaar) nyeSidenIGaar += 1;
    if (!l.grunde.every((g) => g.slags === "venter_paa_velkomst" || BOELGENS_LEDSAGERE.has(g.slags))) continue;
    const liste = prDag.get(velkomst.dag) ?? [];
    liste.push(l);
    prDag.set(velkomst.dag, liste);
  }
  const boelger: Boelgelinje[] = [];
  const iBoelge = new Set<string>();
  for (const [dag, liste] of prDag) {
    if (liste.length < BOELGE_FRA) continue;
    liste.sort((a, b) => a.navn.localeCompare(b.navn, "da"));
    for (const l of liste) iBoelge.add(l.companyId);
    boelger.push({
      linje: "boelge",
      slags: "venter_paa_velkomst",
      dag,
      antal: liste.length,
      tekst: boelgeTekst(liste.length, boelgeDagTekst(dag, nu), liste.map((l) => l.navn)),
      virksomheder: liste.map((l) => ({
        companyId: l.companyId,
        navn: l.navn,
        grund: l.grunde.find((g) => g.slags === "venter_paa_velkomst")!,
        grundlag: l.grundlag,
      })),
      alvor: ALVOR_VENTER_PAA_VELKOMST,
      lukkerOmDage: null,
      loeftet: false,
      indsats: INDSATS.venter_paa_velkomst,
    });
  }

  // Samlede linjer går gennem alvorsporten som ÉN linje hver.
  const linjer: Linje[] = [
    ...virksomhedslinjer.filter((l) => !iBoelge.has(l.companyId)),
    ...boelger,
    ...tilstandslinjer.filter(gaarGennemPorten),
    ...pukler.filter(gaarGennemPorten),
  ].sort(sammenlignLinjer);

  return {
    linjer,
    antalOpgaver: linjer.length,
    usaedvanligtMange: linjer.length >= USAEDVANLIGT_MANGE,
    nyeSidenIGaar,
    underStregen: {
      antalVirksomhederUnderTaersklen,
      antalTilstandeSamlet,
      tilstande: tilstandslinjer.filter((t) => !gaarGennemPorten(t)).sort(sammenlignLinjer) as Tilstandslinje[],
      pukler: pukler.filter((p) => !gaarGennemPorten(p)),
    },
  };
}
