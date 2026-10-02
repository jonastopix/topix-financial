/**
 * supabase/functions/_shared/venterPaaVelkomst.ts
 *
 * Spejlet fra src/lib/venterPaaVelkomst.ts (2/10-2026, dag-1-klokken) —
 * enhver ændring her SKAL også laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/venterPaaVelkomstParitet.test.ts. Filen har ingen
 * imports, så de to kopier er ordret ens ud over filhovederne.
 * Begrundelserne (én kalenderdag, ingen øvre grænse, forsvinder kun når en
 * rådgiver har skrevet) står i src-udgavens filhoved. Læseren her er
 * _shared/dag1Klokke.ts (stille-klokker-cron), som tæller dagene i den
 * danske kalender og kalder doemVenterPaaVelkomst.
 */

export const VELKOMST_FRA_DAGE = 1;
export const ALVOR_VENTER_PAA_VELKOMST = 80;

export interface VenterPaaVelkomstInput {
  /** Første company_members.created_at (ISO); null = ingen medlemmer. */
  medlemSiden: string | Date | null | undefined;
  /** conversations.last_advisor_reply_at — seneste MENNESKEBESKED fra en
      rådgiver (trigger'en sætter den kun for message_type 'user'); null =
      ingen rådgiver har skrevet. Flere samtaler: den seneste. */
  sidsteRaadgiverBeskedAt: string | Date | null | undefined;
}

export type VenterPaaVelkomstTilstand = "ingen_medlem" | "hilst_paa" | "for_tidligt" | "venter";

export interface VenterPaaVelkomstDom {
  tilstand: VenterPaaVelkomstTilstand;
  /** Hele kalenderdage siden medlemskabet begyndte; null uden medlem. */
  dage: number | null;
  /** Sandt kun for «venter» — det der giver en linje. */
  signal: boolean;
}

const MS_PER_DOEGN = 86_400_000;

function tilDato(v: string | Date | null | undefined): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Hele kalenderdage siden — læserens dag, som husets øvrige domme
    (ikkeIGang.dageSidenStart har samme regnestykke). */
export function kalenderdageSiden(start: string | Date | null | undefined, nu: Date): number | null {
  const d = tilDato(start);
  if (!d) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime();
  return Math.round((b - a) / MS_PER_DOEGN);
}

export function afgoerVenterPaaVelkomst(input: VenterPaaVelkomstInput, nu: Date): VenterPaaVelkomstDom {
  return doemVenterPaaVelkomst(input, kalenderdageSiden(input.medlemSiden, nu));
}

/**
 * Selve reglen, med dagene givet ind (2/10-2026, dag-1-klokken). Forsiden
 * tæller dagene i læserens kalender (kalenderdageSiden — browseren står i
 * Danmark); stille-klokker-cron kører på en maskine i UTC og tæller dem i
 * den DANSKE kalender (_shared/dag1Klokke.ts) — ellers ville et medlem, der
 * kom ind kl. 00:30 dansk, stå som «kom ind i går» samme morgen. Reglen er
 * den samme, kun kalenderen er kalderens. dage = null: ingen medlem.
 */
export function doemVenterPaaVelkomst(input: Pick<VenterPaaVelkomstInput, "sidsteRaadgiverBeskedAt">, dage: number | null): VenterPaaVelkomstDom {
  if (dage == null) return { tilstand: "ingen_medlem", dage, signal: false };
  if (tilDato(input.sidsteRaadgiverBeskedAt)) return { tilstand: "hilst_paa", dage, signal: false };
  if (dage < VELKOMST_FRA_DAGE) return { tilstand: "for_tidligt", dage, signal: false };
  return { tilstand: "venter", dage, signal: true };
}

/** Linjens tekst: «Kom ind i går, har ikke hørt fra os» /
    «Kom ind for 3 dage siden, har ikke hørt fra os». */
export function venterPaaVelkomstTekst(dom: VenterPaaVelkomstDom): string {
  const dage = dom.dage ?? 0;
  const komInd = dage === 1 ? "Kom ind i går" : `Kom ind for ${dage} dage siden`;
  return `${komInd}, har ikke hørt fra os`;
}

/** Grundlaget for lukningen (lib/opgaveLukning): startdagen. Der SKER
    intet nyt mens de venter — dagene tæller ikke; en lukket linje bliver
    lukket, indtil et nyt medlemskab begynder (ny startdag). */
export function venterPaaVelkomstGrundlag(input: VenterPaaVelkomstInput): string {
  const d = tilDato(input.medlemSiden);
  return d ? d.toISOString().slice(0, 10) : "";
}
