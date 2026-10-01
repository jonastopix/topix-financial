/**
 * src/lib/hjemmebane/skridtForslag.ts — «Én plan pr. virksomhed», fase 0a
 * (plan-en-plan.md §2a, §4 FASE 0). SPEJL af
 * supabase/functions/_shared/skridtForslag.ts — samme krop efter filhovedet,
 * låst af src/lib/__tests__/skridtForslagParitet.test.ts (maanedsnoegle-
 * mønstret: funktionerne OG kildeteksten).
 *
 * JONAS 16/9 (ordret): «1. Ja 2. Enig med dig 3. Enig med dig» — (3) AI'en
 * foreslår højst ét skridt ad gangen. Og: «Vi lukker opgaverne helt. Vi
 * starter også op på opgaveplanen. Kom så.»
 *
 * Målt i prod 16/9 19:03 (recon-opgaver-og-milestones.md §5 sektion 1d):
 * 3 virksomheder / 14 rækker med gentaget titel inden for 30 dage; 43
 * proposed, 122 expired. Tre af fire skrivere læste aldrig eksisterende
 * rækker før insert (recon §6.1). Denne motor er dommen de tre nu deler:
 * generate-weekly-focus, run-company-agent (write_company_action) og
 * foreslaa-opgave. Kildeværn: src/lib/__tests__/skridtForslag.guard.test.ts.
 *
 * REN: ingen imports, ingen supabase — kalderen henter rækkerne
 * (SKRIVE_SELECT_KOLONNER + skriveFilter) og giver dem ind.
 */
/** Vinduet for «samme forslag igen» — kortets regel (mangellisten, EPIC 4/9):
    «samme normaliserede titel inden for 30 dage = samme forslag». Gælder
    ALLE statusser — også dismissed og expired (Jonas 16/9: et afvist forslag
    kommer ikke igen). FASE 5 skærper det: et AFVIST forslag (dismissed) med
    samme titel INDEN FOR SAMME MÅL (maal_id) er en gentagelse UANSET alder —
    «et afvist forslag inden for samme mål kommer aldrig igen» (plan §2a
    punkt 3). Gælder alle skrivere (dubletkontrollen — også rådgiveren, valg A). */
export const GENTAGELSES_VINDUE_DAGE = 30;

/** Et forslag der venter på medlemmets svar — uanset expires_at. Et forslag
    der er udløbet men endnu ikke lukket af cronen kl. 04 (opgave-udloeb)
    står stadig som 'proposed' og tæller: «højst ét åbent forslag pr.
    virksomhed» (plan-en-plan §2a punkt 1). */
export const AABNE_STATUSSER: readonly string[] = ["proposed"];

/** Kolonnerne skriveren skal hente fra company_actions for virksomheden —
    ét sted, så de tre skrivere henter det samme. */
export const SKRIVE_SELECT_KOLONNER = "id, title, status, created_at, maal_id";

export interface ForslagsRaekke {
  title: string;
  status: string;
  /** ISO-tidsstempel (company_actions.created_at). */
  created_at: string;
  /** company_actions.maal_id (fase 1) — det mål skridtet hører til; null/udeladt = intet mål. */
  maal_id?: string | null;
}

/** Titlens nøgle: små bogstaver, ét mellemrum mellem ord, ingen kanter,
    ingen afsluttende tegnsætning. Unicode-normaliseret (NFC), så «é» skrevet
    på to måder er den samme titel. */
export function normaliserTitel(titel: string): string {
  return titel
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.!?…:;,]+$/u, "")
    .trim();
}

/** Grænsen for gentagelsesvinduet — det created_at en række mindst skal have
    for at tælle. Skriveren bruger den i sin SELECT. */
export function gentagelsesGraense(nu: Date): Date {
  return new Date(nu.getTime() - GENTAGELSES_VINDUE_DAGE * 24 * 60 * 60 * 1000);
}

export type GentagelsesDom =
  | { gentagelse: false }
  | { gentagelse: true; status: string; created_at: string; grund: "vindue" | "afvist_i_maalet" };

/** Findes der en række med samme normaliserede titel oprettet inden for de
    seneste 30 døgn (uanset status)? Fail-closed: et ulæseligt eller
    fremtidigt created_at tæller som «inden for vinduet» — hellere ét forslag
    for lidt end en dublet. Den nyeste ramte række returneres.
    FASE 5: gives `maalId`, er en AFVIST (dismissed) række med samme titel og
    samme maal_id en gentagelse UANSET alder («kommer aldrig igen»). Uden
    maalId (forslag uden mål) gælder kun vinduet. */
export function erGentagelse(nyTitel: string, eksisterende: readonly ForslagsRaekke[], nu: Date, maalId?: string | null): GentagelsesDom {
  const noegle = normaliserTitel(nyTitel);
  if (noegle === "") return { gentagelse: false };
  const graense = gentagelsesGraense(nu).getTime();
  const maal = (maalId ?? "").trim();
  let ramt: ForslagsRaekke | null = null;
  let ramtTid = -Infinity;
  let ramtGrund: "vindue" | "afvist_i_maalet" = "vindue";
  for (const r of eksisterende) {
    if (normaliserTitel(r.title) !== noegle) continue;
    const t = Date.parse(r.created_at);
    const afvistIMaalet = maal !== "" && r.status === "dismissed" && (r.maal_id ?? "") === maal;
    const iVinduet = Number.isNaN(t) || t >= graense;
    if (!iVinduet && !afvistIMaalet) continue;
    const tid = Number.isNaN(t) ? Infinity : t;
    if (tid >= ramtTid) { ramt = r; ramtTid = tid; ramtGrund = afvistIMaalet && !iVinduet ? "afvist_i_maalet" : afvistIMaalet ? "afvist_i_maalet" : "vindue"; }
  }
  return ramt ? { gentagelse: true, status: ramt.status, created_at: ramt.created_at, grund: ramtGrund } : { gentagelse: false };
}

/** Antal åbne forslag (proposed) i rækkerne — uanset expires_at. */
export function taelAabne(eksisterende: readonly ForslagsRaekke[]): number {
  return eksisterende.filter((r) => AABNE_STATUSSER.includes(r.status)).length;
}

/** Må der skrives et NYT forslag når `antalAabne` allerede venter? Kun ved
    nul — «seks ubesvarede plus seks nye er ikke et nudge» (Jonas 8/9), og
    fra 16/9: højst ét skridt ad gangen (Jonas' beslutning 3). Flyttet hertil
    fra ugensFokusGate.ts (fase 0a), så alle tre skrivere deler den. */
export function maaSkriveForslag(antalAabne: number): boolean {
  return antalAabne <= 0;
}

export type SkriveDom =
  | { ok: true }
  | { ok: false; grund: "forslag_venter"; antal: number }
  | { ok: false; grund: "gentagelse"; status: string; created_at: string; aarsag: "vindue" | "afvist_i_maalet" };

/** Hvem skriver? JONAS 16/9, VALG A: rådgiverens egne forslag (foreslaa-
    opgave) spærres ALDRIG af et ventende forslag — kun af dubletkontrollen.
    AI'en (generate-weekly-focus, run-company-agent) stopper når der venter
    noget (Jonas' beslutning 3: højst ét skridt ad gangen).
    «medlem» (skridt-tilfoej, 17/9 — Jonas «ja»): medlemmets EGET skridt under
    sit aktive mål — samme adfærd som rådgiveren: kun dubletkontrollen spærrer
    (samme titel under samme mål inden for 30 døgn, eller afvist under målet).
    Skridtet er aktivt fra start — der er intet forslag at acceptere, og et
    ventende forslag hos AI'en spærrer ikke medlemmet i sin egen plan. */
export type Skriver = "raadgiver" | "ai" | "medlem";

/** ÉN dom for alle fire skrivere, i denne rækkefølge: (1) for AI'en: venter
    der allerede et forslag hos virksomheden → skriv ikke (rådgiveren og
    medlemmet springer dette led over — valg A); (2) er titlen en gentagelse inden for
    30 døgn — eller afvist inden for samme mål (fase 5, `valg.maalId`) —
    → skriv ikke, uanset skriver; ellers ok. `eksisterende` er virksomhedens
    company_actions hentet med SKRIVE_SELECT_KOLONNER og skriveFilter(nu, maalId). */
export function doemSkrivning(nyTitel: string, eksisterende: readonly ForslagsRaekke[], nu: Date, valg: { skriver: Skriver; maalId?: string | null }): SkriveDom {
  if (valg.skriver === "ai") {
    const aabne = taelAabne(eksisterende);
    if (!maaSkriveForslag(aabne)) return { ok: false, grund: "forslag_venter", antal: aabne };
  }
  const g = erGentagelse(nyTitel, eksisterende, nu, valg.maalId);
  if (g.gentagelse) return { ok: false, grund: "gentagelse", status: g.status, created_at: g.created_at, aarsag: g.grund };
  return { ok: true };
}

/** Filteret til skriverens SELECT (PostgREST .or-syntaks): åbne forslag
    uanset alder + alt oprettet inden for vinduet — og (fase 5) ALLE afviste
    forslag under målet, uanset alder, når skridtet har et mål. */
export function skriveFilter(nu: Date, maalId?: string | null): string {
  const basis = `status.eq.proposed,created_at.gte.${gentagelsesGraense(nu).toISOString()}`;
  const maal = (maalId ?? "").trim();
  return maal ? `${basis},and(status.eq.dismissed,maal_id.eq.${maal})` : basis;
}

/** MEDLEMMETS EGET SKRIDT (skridt-tilfoej, 17/9) — FRISTEN. JONAS 17/9
    (ordret: «1»): fristen er OBLIGATORISK (B3 står — CHECK'en
    company_actions_active_requires_due_date og docs/opgave-model-design.md
    §B3 er urørte); formularen foreslår i dag + 14 dage i dansk tid, datoen
    kan ændres men ikke tømmes, og ingen dato før i dag. Kalenderdagen regnes
    i Europe/Copenhagen — ikke UTC, ikke browserens zone (OVERLEVERING DEL 4:
    dansk tid mod UTC ved datogrænser). Ren: samme kode i begge kopier. */
export const FORESLAAET_FRIST_DAGE = 14;
export const FRIST_TIDSZONE = "Europe/Copenhagen";

/** Kalenderdagen i dansk tid som «YYYY-MM-DD» (en-CA giver netop den form). */
export function dagsdatoDansk(nu: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FRIST_TIDSZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(nu);
}

/** «YYYY-MM-DD» + n kalenderdage — UTC-aritmetik på en ren dato, så ingen zone skrider. */
export function laegDageTilDato(dato: string, dage: number): string {
  const [y, m, d] = dato.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dage)).toISOString().slice(0, 10);
}

/** Den foreslåede frist: i dag (dansk tid) + FORESLAAET_FRIST_DAGE. */
export function foreslaaetFrist(nu: Date): string {
  return laegDageTilDato(dagsdatoDansk(nu), FORESLAAET_FRIST_DAGE);
}

export type FristDom = { ok: true; dato: string } | { ok: false; grund: string };

/** Dommen over klientens frist: «YYYY-MM-DD», en rigtig kalenderdato, ikke
    før i dag i dansk tid. Grunden er dansk og vises ordret (400-svaret og
    formularens fejl). Fail-closed: alt andet end en gyldig dato afvises. */
export function doemFrist(input: unknown, nu: Date): FristDom {
  if (typeof input !== "string" || input.trim() === "") return { ok: false, grund: "Fristen mangler — vælg en dato" };
  const dato = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dato)) return { ok: false, grund: "Fristen skal være en dato på formen ÅÅÅÅ-MM-DD" };
  const [y, m, d] = dato.split("-").map(Number);
  const kontrol = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(kontrol.getTime()) || kontrol.toISOString().slice(0, 10) !== dato) return { ok: false, grund: "Fristen er ikke en rigtig dato" };
  if (dato < dagsdatoDansk(nu)) return { ok: false, grund: "Fristen kan ikke ligge før i dag" };
  return { ok: true, dato };
}

/** SKRIDTETS FRIST MOD MÅLETS (Jonas 1/10-2026, ordret: «Det er heller ikke
    smart, at et skridt kan have en deadline længere ude i fremtiden end
    selve målet.»). Datoerne er «YYYY-MM-DD», så strengsammenligning er
    kalendersammenligning; ingen Intl i datoteksten, så ingen zone skrider. */
const MAANEDER_KORT = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."];

/** «2026-11-20» → «20. nov. 2026». */
export function danskDato(dato: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dato);
  if (!m) return dato;
  return `${Number(m[3])}. ${MAANEDER_KORT[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** Målets frist (milestones.deadline, en date-kolonne) som «YYYY-MM-DD»; null uden frist; "ulaeselig" ellers. */
export function maalFristDato(maalFrist: string | null | undefined): string | null | "ulaeselig" {
  if (maalFrist == null || maalFrist.trim() === "") return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(maalFrist.trim());
  return m ? m[1] : "ulaeselig";
}

/** Den seneste frist et skridt under målet må have — datovælgerens max. null = ingen grænse. */
export function senesteSkridtFrist(maalFrist: string | null | undefined): string | null {
  const d = maalFristDato(maalFrist);
  return d === "ulaeselig" ? null : d;
}

/** Den foreslåede frist under et mål: i dag + 14 dage (foreslaaetFrist), men
    aldrig efter målets frist — ligger målets frist inden for de 14 dage,
    foreslås målets frist. Er målets frist passeret, foreslås det
    almindelige (formularen afviser det med doemFristModMaal's grund). */
export function foreslaaetFristModMaal(nu: Date, maalFrist: string | null | undefined): string {
  const forslag = foreslaaetFrist(nu);
  const graense = senesteSkridtFrist(maalFrist);
  if (graense == null || graense < dagsdatoDansk(nu)) return forslag;
  return forslag > graense ? graense : forslag;
}

/** Dommen: et skridt under et mål MED frist må højst have målets frist —
    samme dag er tilladt (fristdagen er med, som milepaelDom: «fristdagen
    selv er IKKE forfalden»). Uden målfrist: ok. Er målets frist passeret
    (før i dag, dansk tid), kan intet skridt overholde både denne regel og
    doemFrist («ikke før i dag») — grunden siger, at målets frist skal
    rykkes først. Fail-closed: en ulæselig målfrist afvises. Kalderen dømmer
    doemFrist FØRST og giver dens dato ind. Grunden er dansk og vises ordret
    (skridt-tilfoej's svar og formularens fejl). `kode` skiller de tre
    afvisninger ad, så skridt-tilfoej kan svare dem hver for sig (rådets
    fund L1, 1/10): ulæselig målfrist er VORES fejl (500), en passeret
    målfrist og en skridtfrist efter målets er medlemmets valg (400). */
export type FristModMaalKode = "maalets_frist_ulaeselig" | "maalets_frist_passeret" | "efter_maalets_frist";
export type FristModMaalDom = { ok: true; dato: string } | { ok: false; grund: string; kode: FristModMaalKode };
export function doemFristModMaal(skridtFrist: string, maalFrist: string | null | undefined, nu: Date): FristModMaalDom {
  const graense = maalFristDato(maalFrist);
  if (graense == null) return { ok: true, dato: skridtFrist };
  if (graense === "ulaeselig") return { ok: false, grund: "Målets frist kan ikke læses — skridtet blev ikke tilføjet", kode: "maalets_frist_ulaeselig" };
  if (graense < dagsdatoDansk(nu)) return { ok: false, grund: `Målets frist (${danskDato(graense)}) er passeret — ryk målets frist, før du tilføjer et skridt`, kode: "maalets_frist_passeret" };
  if (skridtFrist > graense) return { ok: false, grund: `Skridtets frist kan ikke ligge efter målets frist (${danskDato(graense)}) — vælg den dag eller tidligere`, kode: "efter_maalets_frist" };
  return { ok: true, dato: skridtFrist };
}

/** MÅLETS NYE FRIST MOD SKRIDTENES (Jonas 1/10-2026: et skridt må ikke have
    en frist længere ude end målet). Rykkes målets frist til FØR et åbent
    skridts frist, NÆGTES ændringen med en tydelig besked — VALGET (det
    roligste): ingen skridt rykkes stille. Medlemmet/rådgiveren kan vælge en
    senere målfrist, eller lukke/droppe skridtet først. Flyttet hertil fra
    dineMaal.ts 1/10 eftermiddag, så maal-skriv «rediger» (rådgiverens vej)
    dømmer med SAMME dom som medlemmets flade (dineMaal re-eksporterer den).
    ÅBNE skridt tæller (status active eller proposed) MED en frist —
    gjorte/droppede er historik, og et forslag har normalt ingen frist før
    accept (B6). Ingen ny frist (null = fristen fjernes) → ok. Samme dag er
    tilladt. Datoerne er «YYYY-MM-DD» (de første ti tegn), så
    strengsammenligning er kalendersammenligning. */
export type MaalFristDom = { ok: true } | { ok: false; grund: string; senesteSkridtFrist: string; antal: number };
export function doemMaalFristModSkridt(
  nyFrist: string | null,
  skridt: readonly { status: string; due_date: string | null; title: string }[],
): MaalFristDom {
  if (nyFrist == null || nyFrist === "") return { ok: true };
  const ny = nyFrist.slice(0, 10);
  const efter = skridt.filter((s) => (s.status === "active" || s.status === "proposed") && s.due_date && s.due_date.slice(0, 10) > ny);
  if (efter.length === 0) return { ok: true };
  const frister = efter.map((s) => (s.due_date as string).slice(0, 10)).sort();
  const seneste = frister[frister.length - 1];
  const hvem = efter.length === 1 ? `Skridtet «${efter[0].title}» har frist ${danskDato(seneste)}` : `${efter.length} skridt har en senere frist — det seneste ${danskDato(seneste)}`;
  return {
    ok: false,
    grund: `Målets frist kan ikke ligge før skridtenes. ${hvem}. Vælg ${danskDato(seneste)} eller senere — eller luk skridtet først.`,
    senesteSkridtFrist: seneste,
    antal: efter.length,
  };
}

/** UDSKYDELSEN MOD MÅLETS FRIST (Jonas 1/10-2026, ordret: «Det er heller ikke
    smart, at et skridt kan have en deadline længere ude i fremtiden end
    selve målet.»). opgave-udskyd: motoren (opgaveEngine.udskyd) dømmer
    overgangen og giver den nye frist; DENNE dom lægger målets frist ovenpå.

    REGNESTYKKET (alle datoer «YYYY-MM-DD», strengsammenligning =
    kalendersammenligning; «i dag» er den DANSKE kalenderdag, dagsdatoDansk):
      - Første udskydelse (valgt = false): motoren giver ny = nu + 14 dage
        (regnet fra «nu», ikke fra den gamle frist — B11, ellers kunne den
        nye frist lande i fortiden).
        ny frist = min(ny, målets frist).
        Eks.: nu 2026-10-01, målets frist 2026-10-10 → nu + 14 = 2026-10-15
        > 2026-10-10 → ny frist 2026-10-10 (begraenset = true).
        Eks.: målets frist 2026-12-01 → 2026-10-15 ≤ 2026-12-01 → 2026-10-15.
      - Anden udskydelse (valgt = true): medlemmet VALGTE datoen. En valgt
        dato efter målets frist rykkes ikke stille — den afvises med grunden
        (samme kode som doemFristModMaal, «efter_maalets_frist»).
      - Er målets frist passeret (målets frist < i dag), kan intet skridt
        udskydes uden at bryde reglen → afvist («maalets_frist_passeret»).
        Målets frist I DAG er tilladt: ny frist = i dag.
      - Står den gamle frist allerede på (eller efter) målets frist, kan
        udskydelsen ikke flytte noget frem → afvist («ved_maalets_frist»).
        (En udskydelse kræver forfald — gammel < i dag — så med målets frist
        ≥ i dag fanges dette normalt af «passeret»; grenen står for et skridt,
        hvis frist lå efter målets fra før reglen.)
    Uden målfrist: ok, motorens dato uændret. Fail-closed: en ulæselig
    målfrist afvises («maalets_frist_ulaeselig» — vores data, 500). */
export type UdskydModMaalKode = FristModMaalKode | "ved_maalets_frist";
export type UdskydModMaalDom =
  | { ok: true; dato: string; begraenset: boolean }
  | { ok: false; grund: string; kode: UdskydModMaalKode };
export function doemUdskydModMaal(
  nyFrist: string,
  gammelFrist: string | null,
  maalFrist: string | null | undefined,
  nu: Date,
  valgt: boolean,
): UdskydModMaalDom {
  const graense = maalFristDato(maalFrist);
  if (graense == null) return { ok: true, dato: nyFrist, begraenset: false };
  if (graense === "ulaeselig") return { ok: false, grund: "Målets frist kan ikke læses — skridtet blev ikke udskudt", kode: "maalets_frist_ulaeselig" };
  const ryk = `Skridtet kan ikke udskydes forbi målets frist (${danskDato(graense)})`;
  if (graense < dagsdatoDansk(nu)) return { ok: false, grund: `${ryk}, som er passeret — ryk målets frist først`, kode: "maalets_frist_passeret" };
  if (gammelFrist != null && gammelFrist.slice(0, 10) >= graense) return { ok: false, grund: `${ryk} — ryk målets frist først`, kode: "ved_maalets_frist" };
  if (nyFrist > graense) {
    if (valgt) return { ok: false, grund: `${ryk} — vælg den dag eller tidligere, eller ryk målets frist først`, kode: "efter_maalets_frist" };
    return { ok: true, dato: graense, begraenset: true };
  }
  return { ok: true, dato: nyFrist, begraenset: false };
}
