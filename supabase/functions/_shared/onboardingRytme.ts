/**
 * supabase/functions/_shared/onboardingRytme.ts
 *
 * Spejlet fra src/lib/onboardingRytme.ts — enhver ændring her SKAL også
 * laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/onboardingRytmeParitet.test.ts. Filen har ingen
 * imports, så de to kopier er ordret ens ud over filhovederne.
 * Begrundelserne (dag 0–1-sikringen, dag 10 for intro-påmindelsen, dag
 * 14–20 for historikken, systemets stemme, instruks F 16/9) står i
 * src-udgavens filhoved. Eneste import er maanedsnoegle (spejlet);
 * importstien er den eneste tilladte forskel.
 */

import { afsluttedeMaanederTekst, erMaanedAfsluttet } from "./maanedsnoegle.ts";

/** A: sendes kun når medlemskabet er højst så mange hele dage gammelt. */
export const KOM_I_GANG_TIL_DAG = 1;
/** B: intro-påmindelsen (intro-reminder-cron) er moden fra denne dag. Var 2. */
export const INTRO_PAAMINDELSE_FRA_DAG = 10;
/** C: vinduet for historik-mailen — efter menneskets dag 7, før forsidens dag 21. */
export const HISTORIK_FRA_DAG = 14;
export const HISTORIK_TIL_DAG = 20;

export type RytmeMail = "kom_i_gang" | "historik";

/** template_name i email_send_log — stemplet. */
export const RYTME_LABEL: Readonly<Record<RytmeMail, string>> = {
  kom_i_gang: "onboarding-dag0",
  historik: "onboarding-dag14",
};

export interface RytmeInput {
  /** Første company_members.created_at (ISO); null = ingen medlemmer. */
  medlemSiden: string | Date | null | undefined;
  /** companies.is_legat — legat har egen velkomst. */
  erLegat: boolean;
  /**
   * Uploadenes effektive periode-nøgler («YYYY-MM»; null = perioden kunne
   * ikke læses), ikke-slettede financial_reports. INSTRUKS F (16/9): kun
   * uploads af AFSLUTTEDE måneder tæller som «begyndt» — en upload af
   * indeværende måned er limbo (kan ikke godkendes før den 1.) og må ikke
   * tie mailene. En upload uden læselig periode (null) tæller som begyndt,
   * som før (beslutning 5).
   */
  uploadPerioder: readonly (string | null)[];
  /** Findes mindst én facts-række med data_basis = 'measured'? */
  harMaaltRapport: boolean;
  /** Labels (template_name) med status 'sent' til modtageren i email_send_log. */
  alleredeSendt: readonly string[];
}

export type RytmeGrund =
  | "ingen_start"
  | "legat"
  | "allerede_sendt"
  | "har_uploadet"
  | "uden_for_vindue";

export interface RytmeDom {
  /** Hele kalenderdage siden medlemskabet begyndte; null uden start. */
  dage: number | null;
  /** Mailen der skal sendes i dag — højst én. */
  sendes: RytmeMail | null;
  /** Hvorfor ikke, når sendes er null. */
  grund: RytmeGrund | null;
}

const MS_PER_DOEGN = 86_400_000;

/** Hele kalenderdage siden — læserens dag, som husets øvrige domme (ikkeIGang). */
export function dageSidenStart(start: string | Date | null | undefined, nu: Date): number | null {
  if (start == null) return null;
  const d = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime();
  return Math.round((b - a) / MS_PER_DOEGN);
}

/**
 * Begyndt med tal (instruks F, 16/9): en upload af en AFSLUTTET måned (dansk
 * tid, maanedsnoegle), en upload uden læselig periode, eller en målt
 * facts-række. Samme regel for A og C — en upload af indeværende måned er
 * ikke «begyndt».
 */
export function harBegyndtMedTal(input: Pick<RytmeInput, "uploadPerioder" | "harMaaltRapport">, nu: Date): boolean {
  return input.harMaaltRapport || input.uploadPerioder.some((k) => k === null || erMaanedAfsluttet(k, nu));
}

export type HistorikSituation = "uden_upload" | "kun_for_tidlige";

/** C's første afsnit: har hun KUN uploads af måneder der ikke er omme, siges det — ellers «ikke lagt tal ind endnu». Meningsfuld når harBegyndtMedTal er falsk. */
export function historikSituation(input: Pick<RytmeInput, "uploadPerioder">): HistorikSituation {
  return input.uploadPerioder.length > 0 ? "kun_for_tidlige" : "uden_upload";
}

export function afgoerRytme(input: RytmeInput, nu: Date): RytmeDom {
  const dage = dageSidenStart(input.medlemSiden, nu);
  if (dage == null) return { dage, sendes: null, grund: "ingen_start" };
  if (input.erLegat) return { dage, sendes: null, grund: "legat" };
  const harBegyndt = harBegyndtMedTal(input, nu);
  const sendt = (m: RytmeMail) => input.alleredeSendt.includes(RYTME_LABEL[m]);

  // A — kun dag 0–1 (sikringen i filhovedet). Har de allerede uploadet en
  // afsluttet måned, har de gjort det mailen beder om.
  if (dage >= 0 && dage <= KOM_I_GANG_TIL_DAG) {
    if (sendt("kom_i_gang")) return { dage, sendes: null, grund: "allerede_sendt" };
    if (harBegyndt) return { dage, sendes: null, grund: "har_uploadet" };
    return { dage, sendes: "kom_i_gang", grund: null };
  }

  // C — dag 14–20, kun uden en upload af en afsluttet måned.
  if (dage >= HISTORIK_FRA_DAG && dage <= HISTORIK_TIL_DAG) {
    if (sendt("historik")) return { dage, sendes: null, grund: "allerede_sendt" };
    if (harBegyndt) return { dage, sendes: null, grund: "har_uploadet" };
    return { dage, sendes: "historik", grund: null };
  }

  return { dage, sendes: null, grund: "uden_for_vindue" };
}

/** B: er intro-påmindelsen moden? Dag 10, ikke dag 2 (Jonas 9/9). */
export function introPaamindelseModen(medlemSiden: string | Date | null | undefined, nu: Date): boolean {
  const dage = dageSidenStart(medlemSiden, nu);
  return dage != null && dage >= INTRO_PAAMINDELSE_FRA_DAG;
}

// ── Teksterne — systemets stemme ──────────────────────────────────────────

export interface RytmeTekst {
  emne: string;
  overskrift: string;
  /** Afsnit før punkterne/knappen. */
  afsnit: string[];
  /** Punktliste (tom når der ingen er). */
  punkter: string[];
  knap: { tekst: string; sti: string };
  /** Afsnit efter knappen. */
  efterKnap: string[];
}

/** Tiltalen: «Hej Mette,» eller «Hej,» — aldrig et gættet navn. */
export function tiltale(fornavn: string | null | undefined): string {
  const rent = (fornavn ?? "").trim();
  return rent ? `Hej ${rent},` : "Hej,";
}

/** Historikken — de tre seneste afsluttede måneder ved navn (instruks F, 16/9), regnet fra mailens `nu`. */
export function historikSaetning(nu: Date): string {
  return `Start med historikken: ${afsluttedeMaanederTekst(nu)} — én fil pr. måned, også fra før du blev medlem.`;
}

/**
 * Det vi lover om mennesket (Jonas 14/9): initiativet er medlemmets — som
 * tjeklistens punkt «Skriv til din rådgiver — Sig hej, så ved vi, hvor du
 * er» (onboardingTjekliste.ts) — og svaret er det vi lover. Ikke «Jonas
 * eller Morten skriver til dig»: det var ikke automatiseret, og ingen
 * påmindelse sikrede det. Testen låser at den sætning ikke kommer igen.
 */
export const LOEFTET = "Skriv til din rådgiver i chatten, når du vil — Jonas eller Morten svarer.";

/**
 * A — tjeklistens punkter i tjeklistens rækkefølge (onboardingTjekliste.ts:
 * velkomst, profil, praesentation, virksomhed, tal, handout, besked, deling).
 * Delingen (14/9 aften) står sidst som i tjeklisten og menuen; mail A går
 * kun til dag 0-1-medlemmer, som alle er efter DELING_PUNKT_FRA.
 * Velkomsten er kun med når der er en video (Jonas 2/9: «Vi viser ikke
 * tomt indhold»). Præsentationen (11/9, kort 60) følger med — mailen
 * følger tjeklisten (besluttet 11/9); onboardingRytme.test.ts låser
 * pariteten med startsWith på hvert punkts titel.
 */
export function komIGangTekst(fornavn: string | null | undefined, harVelkomstvideo: boolean, nu: Date): RytmeTekst {
  const punkter = [
    ...(harVelkomstvideo ? ["Se velkomsten — en kort video om hvordan du får mest ud af The Boardroom."] : []),
    "Din profil — hvad de andre i netværket kan spørge dig om.",
    "Præsentér dig i fællesskabet — et opslag om hvem du er, med et udkast ud fra din profil.",
    "Din virksomhed — website, branche og CVR, det platformen regner på.",
    `Dine tal — ${historikSaetning(nu)}`,
    "Dit første handout — start med Overordnet.",
    "Skriv til din rådgiver — sig hej, så ved vi hvor du er.",
    "Fortæl det videre — dit medlemskab som billede til LinkedIn, så dit netværk ved hvor du får sparring.",
  ];
  return {
    emne: "Sådan kommer du i gang i The Boardroom",
    overskrift: tiltale(fornavn),
    afsnit: [
      "Du har fået adgang til The Boardroom. Det her er det der giver mest, i den rækkefølge det giver mest:",
    ],
    punkter,
    knap: { tekst: "Åbn The Boardroom", sti: "/" },
    efterKnap: [LOEFTET],
  };
}

/** Eksportvejene — ordret som på /rapportering (rapporteringTekst.EKSPORT_VEJE; testen låser pariteten). */
export const EKSPORT_VEJE_TEKST: readonly string[] = [
  "e-conomic: Regnskab → Rapporter → Balance (eller Saldobalance) → Excel",
  "Dinero: Rapporter → Resultatopgørelse → CSV eller PDF",
  "Billy: Rapporter → Resultatopgørelse → Excel",
  "Andre: Resultatopgørelse eller saldobalance som PDF eller Excel — kan vi ikke læse den, indtaster du de vigtigste tal selv",
];

/**
 * C — historikken først, og hvordan. Månederne ved navn fra mailens `nu`;
 * første afsnit følger situationen (instruks F, 16/9): «kun_for_tidlige»
 * = hun har uploadet, men kun måneder der ikke er omme.
 */
export function historikTekst(fornavn: string | null | undefined, nu: Date, situation: HistorikSituation = "uden_upload"): RytmeTekst {
  const maaneder = afsluttedeMaanederTekst(nu);
  return {
    emne: "Historikken først — sådan henter du dine tal",
    overskrift: tiltale(fornavn),
    afsnit: [
      situation === "kun_for_tidlige"
        ? `Den måned du har uploadet, kan først godkendes når den er omme. Det der giver mest værdi nu, er ${maaneder} — også fra før du blev medlem.`
        : `Du har ikke lagt tal ind i The Boardroom endnu. Det der giver mest værdi først, er ${maaneder} — også fra før du blev medlem. Så har din rådgiver noget at se på.`,
      "Sådan henter du dem i dit regnskabsprogram:",
    ],
    punkter: [...EKSPORT_VEJE_TEKST],
    knap: { tekst: "Gå til rapporteringen", sti: "/rapportering" },
    efterKnap: ["Én fil er nok til at komme i gang. Resten kan komme senere."],
  };
}

/** Kortenes første sætning på /book-session, ordret (BookSessionView «Blikket udefra» / «Blikket indefra», 13/9). */
const BLIKKET_UDEFRA = "Blikket udefra — Morten er investor og ser din forretning udefra, med det blik en investor lægger på en virksomhed.";
const BLIKKET_INDEFRA = "Blikket indefra — Jonas er partner i The Boardroom og kender platformen og dine tal indefra.";

/**
 * B — intro-påmindelsen i systemets stemme (bruges af intro-reminder-cron).
 * Begge rådgivere i tredje person (14/9, fund G): siden 13/9 (#844) er der TO
 * inkluderede sessioner à 30 minutter, én med Morten og én med Jonas. Ordene
 * om de to er /book-session-kortenes, så mail og flade siger det samme.
 * Cronen gater kun på Mortens session (intro_session_used_at), så kun den
 * siges «ikke booket».
 *
 * jonasRetBrugt (14/9, review): companies.jonas_session_used_at var sat på
 * 23 af 38 i prod (sat i hånden 13/9), og 14 af cronens 25 kandidater havde
 * allerede brugt Jonas-retten. En statisk «to sessioner» ville love dem en
 * session de ikke har. Er retten brugt, udelades Jonas-afsnittet, og emne og
 * første afsnit siger ÉN inkluderet session. Ren funktion: kalderen læser
 * feltet og giver svaret ind. Alt står i afsnit: intro-reminder-crons ramme
 * gengiver hverken punkter eller efterKnap.
 */
export function introPaamindelseTekst(fornavn: string | null | undefined, jonasRetBrugt: boolean): RytmeTekst {
  return {
    emne: jonasRetBrugt ? "Din sparring med Morten er inkluderet" : "Din sparring med Morten og Jonas er inkluderet",
    overskrift: tiltale(fornavn),
    afsnit: jonasRetBrugt
      ? [
          "Dit medlemskab inkluderer en session på 30 minutter med Morten. Den har du ikke booket endnu.",
          BLIKKET_UDEFRA,
          "Du bestemmer selv hvad sessionen skal bruges til, og hvornår. Én session per virksomhed, ikke per bruger.",
        ]
      : [
          "Dit medlemskab inkluderer to sessioner på 30 minutter: én med Morten og én med Jonas. Sessionen med Morten har du ikke booket endnu.",
          BLIKKET_UDEFRA,
          BLIKKET_INDEFRA,
          "Du bestemmer selv hvad sessionerne skal bruges til, og hvornår. Én session per virksomhed, ikke per bruger.",
        ],
    punkter: [],
    knap: { tekst: "Book din session", sti: "/book-session" },
    efterKnap: [],
  };
}
