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
 * 16/9 («A»): 100 % betyder at alle skridt er gjort, og målet vises som
 * færdigt; «nået» er derudover medlemmets eksplicitte valg, også under 100 %.
 */
import { fremdriftTekst, planenDom, type MaalIPlanen, type MaalRaekke, type SkridtRaekke } from "./planen";
import { kanOpretteMaal, MAX_AKTIVE_MAAL } from "./maal";

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
  /** Nået mål → active igen. Nej når der ikke er plads, og nej når alle skridt er gjort (fremdriften ville stadig være 100). */
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
}

export interface DineMaalDom {
  aktive: MaalForMedlem[];
  parkerede: MaalForMedlem[];
  naaede: MaalForMedlem[];
  /** Ingen mål overhovedet. */
  tom: boolean;
  /** Under tre aktive. */
  kanOprette: boolean;
  /** Grænsen på tre i klart sprog — altid én sætning. */
  graenseTekst: string;
  /** Flere end tre aktive (mål fra før grænsen). */
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

/** Grænsen på tre i klart sprog. */
export function graenseTekst(antalAktive: number): string {
  if (antalAktive <= 0) return `Du kan have op til ${MAX_AKTIVE_MAAL} aktive mål ad gangen.`;
  if (antalAktive < MAX_AKTIVE_MAAL) {
    const plads = MAX_AKTIVE_MAAL - antalAktive;
    return `${antalAktive} af ${MAX_AKTIVE_MAAL} aktive mål — plads til ${plads} mere.`;
  }
  if (antalAktive === MAX_AKTIVE_MAAL) return `Du har ${MAX_AKTIVE_MAAL} aktive mål — det er det højeste. Parkér eller markér et som nået for at få plads til et nyt.`;
  return `Du har ${antalAktive} aktive mål — flere end de ${MAX_AKTIVE_MAAL} der er plads til. Parkér eller markér nogle som nået, så I står med højst ${MAX_AKTIVE_MAAL}.`;
}

function medHandlinger(x: MaalIPlanen, skridtAf: Map<string, SkridtTilDineMaal[]>, plads: boolean): MaalForMedlem {
  const alleGjort = x.beregnet && x.fremdrift >= 100;
  const handlinger: MedlemsHandlinger = x.dom.aktiv
    ? { kanMarkereNaaet: true, kanGenaabne: false, kanParkere: true, kanAktivere: false, kanSlette: true, kanSaetteFremdrift: !x.beregnet, kanTilfoejeSkridt: true }
    : x.dom.parkeret
      ? { kanMarkereNaaet: false, kanGenaabne: false, kanParkere: false, kanAktivere: plads, kanSlette: true, kanSaetteFremdrift: false, kanTilfoejeSkridt: false }
      : { kanMarkereNaaet: false, kanGenaabne: plads && !alleGjort, kanParkere: false, kanAktivere: false, kanSlette: true, kanSaetteFremdrift: false, kanTilfoejeSkridt: false };
  const linjer = skridtLinjer(skridtAf.get(x.maal.id) ?? []);
  return { plan: x, handlinger, skridtLinjer: linjer, fremdriftTekst: fremdriftTekst(x), gjorte: x.skridt.gjorte.length };
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
  const plads = kanOpretteMaal(plan.aktive.length);
  const til = (x: MaalIPlanen) => medHandlinger(x, skridtAf, plads);
  return {
    aktive: plan.aktive.map(til),
    parkerede: plan.parkerede.map(til),
    naaede: plan.naaede.map(til),
    tom: maal.length === 0,
    kanOprette: plads,
    graenseTekst: graenseTekst(plan.aktive.length),
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
