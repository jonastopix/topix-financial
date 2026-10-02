/**
 * src/lib/hjemmebane/dineMaal.ts — «Én plan pr. virksomhed», fase 3 (16/9-2026).
 *
 * REN dom for MEDLEMMETS mål: siden «Dine mål» (/milestones, DineMaalView)
 * og forsidens «Dine mål»-sektion (BoardroomView). Ingen React, ingen
 * Supabase. Testet i __tests__/dineMaal.test.ts.
 *
 * Grupperne, skridtene under hvert mål, fremdriften («2 af 3 skridt gjort ·
 * 67 %») og «beregnet» kommer fra planen.ts (fase 2) — SAMME dom som
 * rådgiverens «Planen», så de to flader aldrig siger noget forskelligt om det
 * samme mål. Tilstanden pr. mål er milepaelDom (afgoerMilepael) gennem planen.
 * Denne fil lægger det til, der er medlemmets: HANDLINGERNE (Jonas 16/9,
 * ordret: «Nej. Vi er rådgivere, men det er medlemmernes virksomheder.» —
 * medlemmet ejer sine mål: opretter, omdøber, parkerer, sletter og markerer
 * som nået selv; højst tre aktive for alle; ingen RLS-ændring), SKYDEREN
 * (fremdriften kan kun sættes med hånden på et mål UDEN tællende skridt — har
 * målet skridt, regnes fremdriften af dem, og opgave-luk skriver den),
 * SKRIDT-LINJERNE (◻ aktive med frist, ? venter på svar, ✓ gjorte som
 * historik, – ikke gjort/droppet) og GRÆNSEN PÅ TRE i klart sprog.
 *
 * «Marker som nået» sætter status = 'completed' (completed_at sættes af
 * triggeren milestone_completed_at, fase 1) — fremdriften røres ikke. Jonas
 * 16/9 («A»): 100 % betyder at alle skridt er gjort. RETTET 1/10-2026 (Jonas
 * 11:37, målt: «klikker gjort på et skridt, så lukker målet»): et mål bliver
 * ALDRIG nået af sig selv, fordi alle skridt er gjort — «nået» er KUN
 * medlemmets/rådgiverens klik (milepaelDom.erMarkeretNaaet). Et aktivt mål
 * på 100 % står under de aktive med baren fuld og ALLE_SKRIDT_GJORT_TEKST.
 */
import { fremdriftTekst, planenDom, type MaalIPlanen, type MaalRaekke, type SkridtRaekke } from "./planen";
import { kanOpretteMaal, MAX_AKTIVE_MAAL } from "./maal";
import { danskDato } from "./skridtForslag";
import { erBekraeftet } from "./maalBekraeft";

/** Det af company_actions-rækken medlemmets flader læser: planens skridt +
    closed_at (historik: «gjort 12. sep.»). */
export interface SkridtTilDineMaal extends SkridtRaekke {
  closed_at?: string | null;
}

export type SkridtTegn = "◻" | "?" | "✓" | "–";

export interface SkridtLinje {
  id: string;
  tegn: SkridtTegn;
  titel: string;
  status: string;
  /** Aktivt skridt: fristen («YYYY-MM-DD»); ellers null. */
  frist: string | null;
  /** Gjort/ikke gjort/droppet: hvornår (ISO); ellers null. */
  lukket: string | null;
  /** Ordet efter titlen: «venter på dit svar», «ikke gjort», «droppet»; null for aktive og gjorte. */
  ord: string | null;
  /** Kun aktive skridt kan markeres gjort herfra (opgave-luk, udfald done). */
  kanMarkeresGjort: boolean;
}

export interface MedlemsHandlinger {
  /** Aktivt mål → completed. */
  kanMarkereNaaet: boolean;
  /** Nået mål → active igen. Nej når der ikke er plads. (Før 1/10 også nej når alle skridt var gjort — 100 % dømtes som nået; det gør det ikke længere.) */
  kanGenaabne: boolean;
  /** Aktivt mål → parked. */
  kanParkere: boolean;
  /** Parkeret mål → active (kræver plads — databasen afviser ellers). */
  kanAktivere: boolean;
  /** Medlemmet ejer målet — altid. */
  kanSlette: boolean;
  /** Skyderen/«nuværende værdi»: kun aktive mål UDEN tællende skridt. */
  kanSaetteFremdrift: boolean;
  /** «Tilføj skridt» (skridt-tilfoej, 17/9 — Jonas «ja»): KUN under aktive mål — ikke parkerede, ikke nåede. */
  kanTilfoejeSkridt: boolean;
}

export interface MaalForMedlem {
  plan: MaalIPlanen;
  handlinger: MedlemsHandlinger;
  /** Aktive først (nærmeste frist), så ventende, så gjorte (nyeste først), så ikke gjorte. */
  skridtLinjer: SkridtLinje[];
  /** «2 af 3 skridt gjort · 67 %» eller «40 %». */
  fremdriftTekst: string;
  /** Antal gjorte skridt — historikkens fold-overskrift. */
  gjorte: number;
  /** Aktivt mål med tællende skridt, hvor alle er gjort (100 %) — men IKKE nået:
      fladen siger ALLE_SKRIDT_GJORT_TEKST ved «Marker som nået» (Jonas 1/10). */
  alleSkridtGjort: boolean;
}

export interface DineMaalDom {
  /** De BEKRÆFTEDE aktive mål (skive 3) — dem, der tæller i pladserne og vises som kort. */
  aktive: MaalForMedlem[];
  /** Aktive mål uden bekræftelse (skive 3, Jonas 1/10: «Ja, ét klik»): forslag/gamle mål, der venter
      på «Det er vores mål» / «Behold». Tæller ikke i pladserne. Tom, når kolonnen ikke er læst. */
  ubekraeftede: MaalForMedlem[];
  parkerede: MaalForMedlem[];
  naaede: MaalForMedlem[];
  /** Ingen mål overhovedet. */
  tom: boolean;
  /** Under tre aktive — DATABASENS tælling (triggeren milestones_hoejst_tre_aktive tæller ALLE status =
      'active', også ubekræftede; migration 20261002100000 rører den ikke). Fladen lover aldrig en plads,
      databasen afviser. */
  kanOprette: boolean;
  /** Pladserne er ledige blandt de bekræftede, men de ubekræftede fylder databasens tre: fladen siger
      «Plads, når I har taget stilling» (BEKRAEFT_ORD.pladsOptaget) i stedet for «Sæt et mål». */
  pladsOptagetAfUbekraeftede: boolean;
  /** Grænsen på tre i klart sprog — altid én sætning. Tæller databasens aktive: bekræftede + «N venter på jeres ja» (fund 3). */
  graenseTekst: string;
  /** Flere end tre aktive (mål fra før grænsen) — databasens tælling (planen.gennemgang). */
  overGraensen: boolean;
}

/** Sortering af skridt-linjer: aktive (frist stigende, uden frist sidst), ventende, gjorte (nyeste lukning først), resten. */
const TEGN_ORDEN: Record<SkridtTegn, number> = { "◻": 0, "?": 1, "✓": 2, "–": 3 };

export function skridtLinjer(skridt: readonly SkridtTilDineMaal[]): SkridtLinje[] {
  const linjer: SkridtLinje[] = [];
  for (const s of skridt) {
    if (s.status === "active") {
      linjer.push({ id: s.id, tegn: "◻", titel: s.title, status: s.status, frist: s.due_date ?? null, lukket: null, ord: null, kanMarkeresGjort: true });
    } else if (s.status === "proposed") {
      linjer.push({ id: s.id, tegn: "?", titel: s.title, status: s.status, frist: null, lukket: null, ord: "venter på dit svar", kanMarkeresGjort: false });
    } else if (s.status === "done") {
      linjer.push({ id: s.id, tegn: "✓", titel: s.title, status: s.status, frist: null, lukket: s.closed_at ?? null, ord: null, kanMarkeresGjort: false });
    } else if (s.status === "not_done" || s.status === "dropped") {
      linjer.push({ id: s.id, tegn: "–", titel: s.title, status: s.status, frist: null, lukket: s.closed_at ?? null, ord: s.status === "not_done" ? "ikke gjort" : "droppet", kanMarkeresGjort: false });
    }
    // dismissed/expired: forslag der aldrig blev skridt — ingen linje (de tæller heller ikke i fremdriften).
  }
  return linjer.sort((a, b) => {
    const t = TEGN_ORDEN[a.tegn] - TEGN_ORDEN[b.tegn];
    if (t !== 0) return t;
    if (a.tegn === "◻") {
      if (a.frist !== b.frist) {
        if (a.frist == null) return 1;
        if (b.frist == null) return -1;
        return a.frist < b.frist ? -1 : 1;
      }
      return 0;
    }
    if (a.tegn === "✓" || a.tegn === "–") return (b.lukket ?? "") < (a.lukket ?? "") ? -1 : (b.lukket ?? "") > (a.lukket ?? "") ? 1 : 0;
    return 0;
  });
}

/** Skive 3, rådets fund 3: pladserne er fyldt af ubekræftede mål — lov ingen plads. Samme ord som
    dineMaalFlade.TAG_STILLING_TEKST («venter på jeres ja», runde 2 fund 4). */
export const GRAENSE_TAG_STILLING_TEKST = "Svar på de mål, der venter på jeres ja, for at få plads til jeres eget.";

/**
 * Grænsen på tre i klart sprog. Tæller DATABASENS aktive — bekræftede +
 * ubekræftede (triggeren tæller begge, rådets fund 3); de ubekræftede nævnes
 * som «N venter på jeres ja», og fylder de pladserne, siger teksten «Tag
 * stilling …» i stedet for «plads til N mere». Flere BEKRÆFTEDE end tre (mål
 * fra før grænsen) siger det FØRST — aldrig «5 af 3 aktive mål» (målt i drift
 * 2/10, Rallysupport). /milestones tegner den ikke længere (ÉN hovedlinje,
 * dineMaalFlade.hovedLinje); forsidens «Din plan» gør.
 */
export function graenseTekst(antalBekraeftede: number, antalUbekraeftede = 0): string {
  const antalAktive = antalBekraeftede + antalUbekraeftede;
  const venter = antalUbekraeftede > 0 ? ` · ${antalUbekraeftede === 1 ? "1 venter på jeres ja" : `${antalUbekraeftede} venter på jeres ja`}` : "";
  if (antalBekraeftede > MAX_AKTIVE_MAAL) return `Du har ${antalBekraeftede} aktive mål${venter} — flere end de ${MAX_AKTIVE_MAAL} der er plads til. Parkér eller markér nogle som nået, så I står med højst ${MAX_AKTIVE_MAAL}.`;
  if (antalAktive <= 0) return `Du kan have op til ${MAX_AKTIVE_MAAL} aktive mål ad gangen.`;
  if (antalAktive < MAX_AKTIVE_MAAL) {
    const plads = MAX_AKTIVE_MAAL - antalAktive;
    return `${antalBekraeftede} af ${MAX_AKTIVE_MAAL} aktive mål${venter} — plads til ${plads} mere.`;
  }
  if (antalUbekraeftede > 0 && antalBekraeftede < MAX_AKTIVE_MAAL) return `${antalBekraeftede} af ${MAX_AKTIVE_MAAL} aktive mål${venter} — ${GRAENSE_TAG_STILLING_TEKST}`;
  // Tre bekræftede: det højeste — også når flere venter (et ja ville afvises af databasen).
  return `Du har ${MAX_AKTIVE_MAAL} aktive mål${venter} — det er det højeste. Parkér eller markér et som nået for at få plads til et nyt.`;
}

function medHandlinger(x: MaalIPlanen, skridtAf: Map<string, SkridtTilDineMaal[]>, plads: boolean): MaalForMedlem {
  const handlinger: MedlemsHandlinger = x.dom.aktiv
    ? { kanMarkereNaaet: true, kanGenaabne: false, kanParkere: true, kanAktivere: false, kanSlette: true, kanSaetteFremdrift: !x.beregnet, kanTilfoejeSkridt: true }
    : x.dom.parkeret
      ? { kanMarkereNaaet: false, kanGenaabne: false, kanParkere: false, kanAktivere: plads, kanSlette: true, kanSaetteFremdrift: false, kanTilfoejeSkridt: false }
      : { kanMarkereNaaet: false, kanGenaabne: plads, kanParkere: false, kanAktivere: false, kanSlette: true, kanSaetteFremdrift: false, kanTilfoejeSkridt: false };
  const linjer = skridtLinjer(skridtAf.get(x.maal.id) ?? []);
  const alleSkridtGjort = x.dom.aktiv && x.beregnet && x.fremdrift >= 100;
  return { plan: x, handlinger, skridtLinjer: linjer, fremdriftTekst: fremdriftTekst(x), gjorte: x.skridt.gjorte.length, alleSkridtGjort };
}

export function dineMaalDom(maal: readonly MaalRaekke[], skridt: readonly SkridtTilDineMaal[], nu: Date): DineMaalDom {
  const plan = planenDom(maal, skridt, nu);
  const skridtAf = new Map<string, SkridtTilDineMaal[]>();
  for (const s of skridt) {
    if (!s.maal_id) continue;
    const liste = skridtAf.get(s.maal_id) ?? [];
    liste.push(s);
    skridtAf.set(s.maal_id, liste);
  }
  // Skive 3: pladsen dømmes som databasen (alle aktive) — se DineMaalDom.kanOprette.
  const plads = kanOpretteMaal(plan.aktive.length);
  const til = (x: MaalIPlanen) => medHandlinger(x, skridtAf, plads);
  const bekraeftede = plan.aktive.filter((x) => erBekraeftet(x.maal));
  const ubekraeftede = plan.aktive.filter((x) => !erBekraeftet(x.maal));
  return {
    aktive: bekraeftede.map(til),
    ubekraeftede: ubekraeftede.map(til),
    parkerede: plan.parkerede.map(til),
    naaede: plan.naaede.map(til),
    tom: maal.length === 0,
    kanOprette: plads,
    pladsOptagetAfUbekraeftede: !plads && kanOpretteMaal(bekraeftede.length),
    graenseTekst: graenseTekst(bekraeftede.length, ubekraeftede.length),
    overGraensen: plan.gennemgang,
  };
}

/** Forsidens «Dine mål»: de aktive mål (højst tre vist), og hvor mange flere der står på siden. */
export function forsideMaal(dom: DineMaalDom): { viste: MaalForMedlem[]; flere: number } {
  return { viste: dom.aktive.slice(0, MAX_AKTIVE_MAAL), flere: Math.max(0, dom.aktive.length - MAX_AKTIVE_MAAL) };
}

/** «Mod målet: {titel}» for et skridt med maal_id — null uden mål eller når målet ikke findes i listen. */
export function modMaaletTekst(maal: readonly Pick<MaalRaekke, "id" | "title">[], maalId: string | null | undefined): string | null {
  if (!maalId) return null;
  const m = maal.find((x) => x.id === maalId);
  return m ? `Mod målet: ${m.title}` : null;
}

/** Forsidens tomme tilstand og fejl — ordene ét sted. */
export const DINE_MAAL_TOM_TEKST = "I har ikke sat mål endnu. Sæt det første — det er din virksomheds plan.";
export const DINE_MAAL_FEJL_TEKST = "Dine mål kunne ikke hentes. Prøv igen.";
export const DINE_SKRIDT_FEJL_TEKST = "Dine skridt kunne ikke hentes. Prøv igen.";
/** «Tilføj skridt» (skridt-tilfoej, 17/9): ordene ét sted — knappen, formularen og fejlen. */
export const TILFOEJ_SKRIDT_KNAP_TEKST = "Tilføj skridt";
export const TILFOEJ_SKRIDT_FEJL_TEKST = "Skridtet blev ikke tilføjet";
export const TILFOEJ_SKRIDT_OK_TEKST = "Skridtet er tilføjet — det tæller med i målets fremdrift";
/** Aktivt mål, alle skridt gjort (1/10-2026): målet lukker ikke af sig selv — medlemmet afgør. */
export const ALLE_SKRIDT_GJORT_TEKST = "Alle skridt er gjort — marker målet som nået, når I er i mål.";

/** Datovælgerens Date (lokal midnat, react-day-picker) → «YYYY-MM-DD» på den
    dag medlemmet KLIKKEDE. toISOString() gav dagen før i dansk tid (lokal
    midnat = 22:00/23:00 UTC dagen før) — rettet 1/10-2026 sammen med
    fristreglen, fordi sammenligningen med skridtenes frister ellers ramte
    én dag forkert. */
export function lokalDatoStreng(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Det seneste ÅBNE skridts frist under et mål (status active ELLER
    proposed, med frist — SAMME filter som doemMaalFristModSkridt, rådets
    fund K3 1/10 eftermiddag; før kun active, så datovælgerens grå dage og
    dommen kunne være uenige om et forslag med frist) — den tidligste dag,
    målets frist må have. Ved flere skridt på samme dag: det første i
    listen. null uden sådanne skridt. */
export function senesteAabneSkridt(
  skridt: readonly Pick<SkridtTilDineMaal, "status" | "due_date" | "title">[],
): { dato: string; titel: string } | null {
  let bedst: { dato: string; titel: string } | null = null;
  for (const s of skridt) {
    if ((s.status !== "active" && s.status !== "proposed") || !s.due_date) continue;
    const dato = s.due_date.slice(0, 10);
    if (bedst == null || dato > bedst.dato) bedst = { dato, titel: s.title };
  }
  return bedst;
}

/** Toasten efter «Udskyd» (rådets fund R1, 1/10 eftermiddag): begrænsede
    opgave-udskyd fristen til målets (svarfeltet begraenset_til_maalets_frist),
    siger toasten den FAKTISKE nye dato — ellers ville medlemmet tro, at
    skridtet fik de sædvanlige 14 dage. Uden feltet (gammel kode i drift) eller
    uden en læselig dato: den normale tekst. */
export const UDSKUDT_TEKST = "Opgaven er udskudt";
export function udskudtToastTekst(svar: unknown): string {
  const s = (svar ?? null) as { begraenset_til_maalets_frist?: unknown; opgave?: { due_date?: unknown } | null } | null;
  const dato = typeof s?.opgave?.due_date === "string" ? s.opgave.due_date : null;
  if (s?.begraenset_til_maalets_frist === true && dato && /^\d{4}-\d{2}-\d{2}/.test(dato)) {
    return `Udskudt til ${danskDato(dato.slice(0, 10)).replace(/ \d{4}$/, "")} — målets frist`;
  }
  return UDSKUDT_TEKST;
}

/** Hjælpeteksten ved detaljens datovælger, når dagene før det seneste åbne
    skridts frist er slået fra (rådets fund M2, 1/10) — så de grå dage har en
    forklaring, før medlemmet klikker. */
export function tidligsteMaalFristTekst(dato: string, titel: string): string {
  return `Tidligst ${danskDato(dato)} — skridtet «${titel}» har frist den dag. Ryk eller luk skridtet først, hvis målet skal slutte før.`;
}

/**
 * MÅLETS NYE FRIST MOD SKRIDTENES (Jonas 1/10-2026: et skridt må ikke have en
 * frist længere ude end målet). Rykkes målets frist til FØR et åbent skridts
 * frist, NÆGTES ændringen med en tydelig besked — VALGET (det roligste):
 * ingen skridt rykkes stille. Dommen bor siden 1/10 eftermiddag i
 * skridtForslag.ts (spejlet i _shared), fordi maal-skriv «rediger» —
 * rådgiverens vej — dømmer med den SAMME dom som medlemmets flade; den
 * gentages her som re-eksport, så fladerne importerer som før.
 */
export { doemMaalFristModSkridt, type MaalFristDom } from "./skridtForslag";
