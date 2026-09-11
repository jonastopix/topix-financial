/**
 * supabase/functions/_shared/onboardingRytme.ts
 *
 * Spejlet fra src/lib/onboardingRytme.ts — enhver ændring her SKAL også
 * laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/onboardingRytmeParitet.test.ts. Filen har ingen
 * imports, så de to kopier er ordret ens ud over filhovederne.
 * Begrundelserne (dag 0–1-sikringen, dag 10 for intro-påmindelsen, dag
 * 14–20 for historikken, systemets stemme) står i src-udgavens filhoved.
 */

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
  /** Antal uploadede (ikke slettede) financial_reports. */
  antalUploads: number;
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

export function afgoerRytme(input: RytmeInput, nu: Date): RytmeDom {
  const dage = dageSidenStart(input.medlemSiden, nu);
  if (dage == null) return { dage, sendes: null, grund: "ingen_start" };
  if (input.erLegat) return { dage, sendes: null, grund: "legat" };
  const harBegyndt = input.antalUploads > 0 || input.harMaaltRapport;
  const sendt = (m: RytmeMail) => input.alleredeSendt.includes(RYTME_LABEL[m]);

  // A — kun dag 0–1 (sikringen i filhovedet). Har de allerede uploadet,
  // har de gjort det mailen beder om.
  if (dage >= 0 && dage <= KOM_I_GANG_TIL_DAG) {
    if (sendt("kom_i_gang")) return { dage, sendes: null, grund: "allerede_sendt" };
    if (harBegyndt) return { dage, sendes: null, grund: "har_uploadet" };
    return { dage, sendes: "kom_i_gang", grund: null };
  }

  // C — dag 14–20, kun uden nogen upload.
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

/** Historikken — samme tal som rapporteringens tekst (HISTORIK_MAANEDER = 3). */
export const HISTORIK_SAETNING =
  "Start med historikken: de seneste 3 måneder, gerne mere — også fra før du blev medlem.";

/** Løftet om mennesket. Et løfte, ikke en efterligning. */
export const LOEFTET = "Jonas eller Morten skriver til dig i chatten i løbet af de første dage.";

/**
 * A — tjeklistens punkter i tjeklistens rækkefølge (onboardingTjekliste.ts:
 * velkomst, profil, praesentation, virksomhed, tal, handout, besked).
 * Velkomsten er kun med når der er en video (Jonas 2/9: «Vi viser ikke
 * tomt indhold»). Præsentationen (11/9, kort 60) følger med — mailen
 * følger tjeklisten (besluttet 11/9); onboardingRytme.test.ts låser
 * pariteten med startsWith på hvert punkts titel.
 */
export function komIGangTekst(fornavn: string | null | undefined, harVelkomstvideo: boolean): RytmeTekst {
  const punkter = [
    ...(harVelkomstvideo ? ["Se velkomsten — en kort video om hvordan du får mest ud af The Boardroom."] : []),
    "Din profil — hvad de andre i netværket kan spørge dig om.",
    "Præsentér dig i fællesskabet — et opslag om hvem du er, med et udkast ud fra din profil.",
    "Din virksomhed — website, branche og CVR, det platformen regner på.",
    `Dine tal — ${HISTORIK_SAETNING}`,
    "Dit første handout — start med Overordnet.",
    "Skriv til din rådgiver — sig hej, så ved vi hvor du er.",
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

/** C — historikken først, og hvordan. */
export function historikTekst(fornavn: string | null | undefined): RytmeTekst {
  return {
    emne: "Historikken først — sådan henter du dine tal",
    overskrift: tiltale(fornavn),
    afsnit: [
      "Du har ikke lagt tal ind i The Boardroom endnu. Det der giver mest værdi først, er de seneste 3 måneder — også fra før du blev medlem. Så har din rådgiver noget at se på.",
      "Sådan henter du dem i dit regnskabsprogram:",
    ],
    punkter: [...EKSPORT_VEJE_TEKST],
    knap: { tekst: "Gå til rapporteringen", sti: "/rapportering" },
    efterKnap: ["Én fil er nok til at komme i gang. Resten kan komme senere."],
  };
}

/** B — intro-påmindelsen i systemets stemme (bruges af intro-reminder-cron). Morten i tredje person. */
export function introPaamindelseTekst(fornavn: string | null | undefined): RytmeTekst {
  return {
    emne: "Din sparring med Morten er inkluderet",
    overskrift: tiltale(fornavn),
    afsnit: [
      "Dit medlemskab inkluderer 30 minutters sparring med Morten. Den har du ikke booket endnu.",
      "Den er der når du har brug for den — du vælger selv tidspunktet.",
    ],
    punkter: [],
    knap: { tekst: "Book din session", sti: "/book-session" },
    efterKnap: [],
  };
}
