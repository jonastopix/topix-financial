/**
 * supabase/functions/_shared/milepaelDom.ts
 *
 * Spejlet fra src/lib/milepaelDom.ts — enhver ændring her SKAL også
 * laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/milepaelDomParitet.test.ts. Filen har ingen imports,
 * så de to kopier er ordret ens ud over filhovederne.
 *
 * ÉN SANDHED om en milepæls tilstand. Før 8/9-2026 dømte seks læsere
 * «færdig» på tre måder (progress >= 100, status = completed, status ≠
 * completed) og «forfalden» på nul måder på de flader medlemmet ser —
 * ordet fandtes kun i et panel der aldrig renderes (recon-opgaver-og-
 * milepaele.md §1, §4). Denne fil er dommen; fladerne kalder den.
 *
 * INPUT er rækkens rå felter (milestones.status, .progress, .deadline)
 * og «nu». OUTPUT er én overskrifts-tilstand plus de sandheder fladerne
 * bruger hver for sig (faerdig, parkeret, aktiv, forfalden, paabegyndt,
 * dage_til_frist).
 *
 * RANGFØLGE (den første der gælder, vinder):
 *   parkeret     status = 'parked'. Et menneske har lagt den i køleskabet;
 *                det vinder over alt andet, også over 100 % (som
 *                deriveStatus altid har gjort). En parkeret milepæl er
 *                aldrig forfalden — man kan ikke være for sent på noget
 *                man har lagt fra sig.
 *   faerdig      status = 'completed' ELLER progress >= 100. To felter,
 *                én ting; er ét af dem sat, er den færdig. Færdig er
 *                aldrig forfalden.
 *   forfalden    fristens kalenderdag er PASSERET — dagen efter fristen
 *                er første forfaldne dag. Fristdagen selv er IKKE
 *                forfalden (besluttet 7/9 for slutdatoen: sidste dag MED;
 *                opgaveEngine.erForfalden: «frist i dag = ikke forfalden»).
 *   i_gang       progress > 0.
 *   ikke_startet resten.
 *
 * DAGE: deadline er en date-kolonne (ingen klokke). Fristen læses som
 * kalenderdag — «YYYY-MM-DD» direkte, eller en Date's UTC-dato (det er
 * hvad new Date("YYYY-MM-DD") giver). «Nu» læses som LÆSERENS
 * kalenderdag (lokale komponenter) — i browseren medlemmets dag, i en
 * edge function UTC. Sammenligningen er hele dage: dage_til_frist 0 =
 * fristen er i dag, −1 = i går (forfalden), 1 = i morgen.
 */

export type MilepaelTilstand = "parkeret" | "faerdig" | "forfalden" | "i_gang" | "ikke_startet";

export interface MilepaelInput {
  /** milestones.status: 'active' | 'completed' | 'parked'. */
  status: string | null | undefined;
  /** milestones.progress (0–100); null læses som 0. */
  progress: number | null | undefined;
  /** milestones.deadline: «YYYY-MM-DD», en Date, eller ingen frist. */
  deadline: string | Date | null | undefined;
}

export interface MilepaelDom {
  tilstand: MilepaelTilstand;
  /** status = 'parked'. */
  parkeret: boolean;
  /** Ikke parkeret, og status = 'completed' eller progress >= 100. */
  faerdig: boolean;
  /** Hverken parkeret eller færdig — en forfalden milepæl ER aktiv. */
  aktiv: boolean;
  /** Aktiv med frist hvis kalenderdag er passeret. */
  forfalden: boolean;
  /** progress > 0 (uafhængigt af tilstand — til fremdriftens ord). */
  paabegyndt: boolean;
  /** Hele kalenderdage fra nu til fristen; 0 = i dag, negativ = passeret; null uden frist. */
  dage_til_frist: number | null;
}

const MS_PER_DOEGN = 86_400_000;

/** Fristens kalenderdag som UTC-midnat-ms; null uden (læselig) frist. */
function fristDag(deadline: string | Date | null | undefined): number | null {
  if (deadline == null || deadline === "") return null;
  if (deadline instanceof Date) {
    if (Number.isNaN(deadline.getTime())) return null;
    return Date.UTC(deadline.getUTCFullYear(), deadline.getUTCMonth(), deadline.getUTCDate());
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline);
  if (!m) {
    const d = new Date(deadline);
    return Number.isNaN(d.getTime()) ? null : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Læserens kalenderdag (lokale komponenter) som UTC-midnat-ms. */
function nuDag(nu: Date): number {
  return Date.UTC(nu.getFullYear(), nu.getMonth(), nu.getDate());
}

/** Hele kalenderdage fra nu til fristen — 0 i dag, negativ passeret, null uden frist. */
export function dageTilFrist(deadline: string | Date | null | undefined, nu: Date): number | null {
  const frist = fristDag(deadline);
  if (frist == null) return null;
  return Math.round((frist - nuDag(nu)) / MS_PER_DOEGN);
}

export function afgoerMilepael(input: MilepaelInput, nu: Date): MilepaelDom {
  const progress = input.progress ?? 0;
  const parkeret = input.status === "parked";
  const faerdig = !parkeret && (input.status === "completed" || progress >= 100);
  const aktiv = !parkeret && !faerdig;
  const dage = dageTilFrist(input.deadline, nu);
  const forfalden = aktiv && dage != null && dage < 0;
  const paabegyndt = progress > 0;
  const tilstand: MilepaelTilstand = parkeret
    ? "parkeret"
    : faerdig
      ? "faerdig"
      : forfalden
        ? "forfalden"
        : paabegyndt
          ? "i_gang"
          : "ikke_startet";
  return { tilstand, parkeret, faerdig, aktiv, forfalden, paabegyndt, dage_til_frist: dage };
}

/** Skrivereglen når fremgangen sættes: 100 % er færdig, ellers aktiv.
    Samme dom som ovenfor set fra skrivesiden, så ingen flade selv regner
    «progress >= 100» ved skrivning. Parkerede skrives ikke (fladen
    afviser før den kalder). */
export function statusEfterFremgang(progress: number): "completed" | "active" {
  return afgoerMilepael({ status: "active", progress, deadline: null }, new Date(0)).faerdig ? "completed" : "active";
}

/** Sorteringsnøgle for aktive milepæle: forfaldne først (ældst først),
    så hastende (frist inden for HASTENDE_DAGE, i dag medregnet), så
    påbegyndte, så efter frist, så dem uden frist. Brugt af /milestones. */
export const HASTENDE_DAGE = 7;

export function sammenlignAktive(a: MilepaelInput, b: MilepaelInput, nu: Date): number {
  const da = afgoerMilepael(a, nu);
  const db = afgoerMilepael(b, nu);
  if (da.forfalden !== db.forfalden) return da.forfalden ? -1 : 1;
  const aHast = da.dage_til_frist != null && da.dage_til_frist >= 0 && da.dage_til_frist <= HASTENDE_DAGE;
  const bHast = db.dage_til_frist != null && db.dage_til_frist >= 0 && db.dage_til_frist <= HASTENDE_DAGE;
  if (aHast !== bHast) return aHast ? -1 : 1;
  if (!(da.forfalden || aHast) && da.paabegyndt !== db.paabegyndt) return da.paabegyndt ? -1 : 1;
  if (da.dage_til_frist == null && db.dage_til_frist == null) return 0;
  if (da.dage_til_frist == null) return 1;
  if (db.dage_til_frist == null) return -1;
  return da.dage_til_frist - db.dage_til_frist;
}
