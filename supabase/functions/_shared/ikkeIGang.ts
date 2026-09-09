/**
 * supabase/functions/_shared/ikkeIGang.ts
 *
 * Spejlet fra src/lib/ikkeIGang.ts — enhver ændring her SKAL også laves
 * der. Pariteten håndhæves af testen i
 * src/lib/__tests__/ikkeIGangParitet.test.ts. Filen har ingen imports, så
 * de to kopier er ordret ens ud over filhovederne. Begrundelserne (21 dage,
 * to trin, ingen venten på månedsskifte) står i src-udgavens filhoved.
 */

/** Trin 1: rådgiveren spørger. */
export const TRIN_1_DAGE = 7;
/** Trin 2: gået i stå (målt 9/9: de der kom i gang, gjorde det inden for tre uger). */
export const NY_FRA_DAGE = 21;
export const NY_TIL_DAGE = 90;

export interface IkkeIGangInput {
  /** Første company_members.created_at (ISO); null = ingen medlemmer. */
  medlemSiden: string | Date | null | undefined;
  /** Findes mindst én facts-række med data_basis = 'measured'? */
  harMaaltRapport: boolean;
  /** Antal uploadede (ikke slettede) rapporter — ændrer ordene, ikke dommen. */
  antalUploads: number;
}

export type IkkeIGangTilstand =
  | "ingen_start"
  | "i_gang"
  | "for_tidligt"
  /** Trin 1 (dag 7–20): ikke kommet i gang endnu. */
  | "ikke_begyndt"
  /** Trin 2 (dag 21–90): gået i stå. */
  | "ikke_i_gang"
  | "faldet_ud";

export type IkkeIGangTrin = 1 | 2;

export interface IkkeIGangDom {
  tilstand: IkkeIGangTilstand;
  /** Hele kalenderdage siden medlemskabet begyndte; null uden start. */
  dage: number | null;
  /** Sandt for begge trin — det der giver en linje. */
  signal: boolean;
  /** 1 fra dag 7, 2 fra dag 21; null uden signal. */
  trin: IkkeIGangTrin | null;
  /** Uploadet men ikke godkendt — findes, men er ikke bevis. */
  harUploadetUdenGodkendelse: boolean;
}

const MS_PER_DOEGN = 86_400_000;

/** Hele kalenderdage siden — læserens dag, som husets øvrige domme. */
export function dageSidenStart(start: string | Date | null | undefined, nu: Date): number | null {
  if (start == null) return null;
  const d = start instanceof Date ? start : new Date(start);
  if (Number.isNaN(d.getTime())) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate()).getTime();
  return Math.round((b - a) / MS_PER_DOEGN);
}

export function afgoerIkkeIGang(input: IkkeIGangInput, nu: Date): IkkeIGangDom {
  const dage = dageSidenStart(input.medlemSiden, nu);
  const harUploadetUdenGodkendelse = !input.harMaaltRapport && input.antalUploads > 0;
  const bas = { dage, harUploadetUdenGodkendelse, trin: null as IkkeIGangTrin | null };
  if (dage == null) return { ...bas, tilstand: "ingen_start", signal: false };
  if (input.harMaaltRapport) return { ...bas, tilstand: "i_gang", signal: false };
  if (dage < TRIN_1_DAGE) return { ...bas, tilstand: "for_tidligt", signal: false };
  if (dage > NY_TIL_DAGE) return { ...bas, tilstand: "faldet_ud", signal: false };
  if (dage < NY_FRA_DAGE) return { ...bas, tilstand: "ikke_begyndt", signal: true, trin: 1 };
  return { ...bas, tilstand: "ikke_i_gang", signal: true, trin: 2 };
}

/** Linjens tekst, pr. trin:
      trin 1  «Medlem i 7 dage, ikke kommet i gang endnu — historik kan sendes fra dag ét»
              «Medlem i 9 dage, har uploadet — tallene venter på godkendelse»
      trin 2  «Medlem i 21 dage, gået i stå — har ikke uploadet, heller ikke historik»
              «Medlem i 30 dage, gået i stå — har uploadet, tallene er ikke godkendt»
    «Historik»/«heller ikke historik» siger rådgiveren at der ikke er noget
    at vente på: en ny kan sende tidligere måneder fra dag ét (Jonas 9/9). */
export function ikkeIGangTekst(dom: IkkeIGangDom): string {
  const dage = dom.dage ?? 0;
  const medlem = `Medlem i ${dage} ${dage === 1 ? "dag" : "dage"}`;
  if (dom.trin === 1) {
    return dom.harUploadetUdenGodkendelse
      ? `${medlem}, har uploadet — tallene venter på godkendelse`
      : `${medlem}, ikke kommet i gang endnu — historik kan sendes fra dag ét`;
  }
  return dom.harUploadetUdenGodkendelse
    ? `${medlem}, gået i stå — har uploadet, tallene er ikke godkendt`
    : `${medlem}, gået i stå — har ikke uploadet, heller ikke historik`;
}

/** Handlingen, pr. trin — husets verber (§1: vi ringer ikke). */
export function ikkeIGangHandling(dom: IkkeIGangDom, navn: string): string {
  return dom.trin === 1 ? `Spørg ${navn} hvilket system de bruger` : `Hjælp ${navn} i gang`;
}

/** Grundlaget for lukningen (lib/opgaveLukning): startdagen, antallet af
    uploads og TRINNET. En ny upload er noget nyt, og trin 2 er noget nyt
    (lukket på dag 7 → linjen kommer igen på dag 21, som varsel 2 efter
    varsel 1). Dagene selv tæller ikke: at tiden går inden for et trin er
    ikke nyt. */
export function ikkeIGangGrundlag(input: IkkeIGangInput, dom: IkkeIGangDom): string {
  const start = input.medlemSiden instanceof Date ? input.medlemSiden.toISOString() : (input.medlemSiden ?? "");
  return `${start.slice(0, 10)}|${input.antalUploads}|trin${dom.trin ?? 0}`;
}

/** Til rapportpåmindelsen (send-report-reminder): en ny uden nogen upload
    skal ikke rykkes for en måned — de skal bedes om historik af et
    menneske (rytmens dag 1 og 7). Har de uploadet uden at godkende, er de
    tæt på, og godkend-varianten er den rigtige rykker. Faldet ud (> 90
    dage) rykkes som alle andre. */
export function skalSpringesOverIPaamindelse(input: IkkeIGangInput, nu: Date): { spring: boolean; grund: string | null } {
  const dom = afgoerIkkeIGang(input, nu);
  const nyUdenUpload = (dom.tilstand === "for_tidligt" || dom.tilstand === "ikke_begyndt" || dom.tilstand === "ikke_i_gang") && input.antalUploads === 0;
  return nyUdenUpload ? { spring: true, grund: `ny_uden_upload (medlem i ${dom.dage} dage)` } : { spring: false, grund: null };
}
