/**
 * periodeSpaend — dækker en rapportfil én måned eller flere?
 *
 * HVORFOR (recon-to-maaneder §2b, 10/9-2026): perioderesolveren i
 * extract-financial-data reducerer «Saldobalance for perioden 01.05.26 -
 * 30.06.26» til SLUTMÅNEDEN. En fil der dækker maj+juni blev bogført som juni
 * med to måneders beløb — og det så rigtigt ud. En afvisning ser man; en
 * forkert bogføring gør man ikke. Motoren har ingen forestilling om «én måned
 * pr. upload» som regel; den har det som antagelse. Her bliver det en dom.
 *
 * Rene funktioner, ingen I/O — testet fra vitest (src/lib/__tests__/
 * periodeSpaend.test.ts) og importeret af Deno-funktionen.
 *
 * Datoformaterne er dem skabelonerne producerer: dd-mm-yyyy (pdfTextParser,
 * XLSX normalizeDateStr), dd.mm.yy / dd.mm.yyyy (rå e-conomic-header),
 * dd/mm-yyyy (semantisk PDF-metadata) og yyyy-mm-dd (ISO). Alt andet er
 * «ukendt» — og ukendt opfører sig som i dag (ingen dom).
 */

export interface PeriodeDato {
  aar: number;
  maaned: number; // 1-12
}

export type PeriodeSpaendDom =
  | { dom: "een_maaned"; maaneder: 1; fra: PeriodeDato; til: PeriodeDato }
  | { dom: "flere_maaneder"; maaneder: number; fra: PeriodeDato; til: PeriodeDato }
  | { dom: "ukendt"; maaneder: null };

const DK_MAANEDER = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

function toAar(yy: string): number {
  if (yy.length === 4) return parseInt(yy, 10);
  const n = parseInt(yy, 10);
  return (n >= 50 ? 1900 : 2000) + n;
}

/** Læser år og måned af en dato-streng i et af de fire kendte formater; ellers null. */
export function parsePeriodeDato(s: string | null | undefined): PeriodeDato | null {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  let m: RegExpMatchArray | null;
  // dd-mm-yyyy · dd.mm.yy · dd.mm.yyyy · dd/mm-yyyy · dd/mm/yyyy
  if ((m = t.match(/^(\d{2})[-./](\d{2})[-./](\d{2}|\d{4})$/))) {
    const maaned = parseInt(m[2], 10);
    if (maaned < 1 || maaned > 12) return null;
    return { aar: toAar(m[3]), maaned };
  }
  // yyyy-mm-dd
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    const maaned = parseInt(m[2], 10);
    if (maaned < 1 || maaned > 12) return null;
    return { aar: parseInt(m[1], 10), maaned };
  }
  return null;
}

/** Antal kalendermåneder fra og med `fra` til og med `til`; null hvis til ligger før fra. */
export function maanederImellem(fra: PeriodeDato, til: PeriodeDato): number | null {
  const n = (til.aar - fra.aar) * 12 + (til.maaned - fra.maaned) + 1;
  return n >= 1 ? n : null;
}

/**
 * Dommen. «ukendt» når en af datoerne mangler eller ikke kan læses, eller når
 * slutdatoen ligger før startdatoen — i alle de tilfælde sker der det samme
 * som i dag (ingen afvisning), for en dom på usikre datoer er værre end ingen.
 */
export function afgoerPeriodeSpaend(input: { period_start?: string | null; period_end?: string | null }): PeriodeSpaendDom {
  const fra = parsePeriodeDato(input.period_start);
  const til = parsePeriodeDato(input.period_end);
  if (!fra || !til) return { dom: "ukendt", maaneder: null };
  const n = maanederImellem(fra, til);
  if (n == null) return { dom: "ukendt", maaneder: null };
  if (n === 1) return { dom: "een_maaned", maaneder: 1, fra, til };
  return { dom: "flere_maaneder", maaneder: n, fra, til };
}

/**
 * Finder periodens fra/til i rå tekst FØR nogen skabelon har matchet — til
 * beskeden når en kendt kilde ikke matcher (no_match). Samme mønstre som
 * pdfTextParser.ts:174-206 (dot og slash) og XLSX-skabelonens header
 * («dd-mm-yyyy til dd-mm-yyyy»). Første fund vinder; intet fund → null.
 */
export function findPeriodeITekst(text: string | null | undefined): { period_start: string; period_end: string } | null {
  if (!text) return null;
  const moenstre = [
    /(\d{2}\.\d{2}\.\d{2,4})\s*[-–]\s*(\d{2}\.\d{2}\.\d{2,4})/,
    /(\d{2}\/\d{2}[-\s]*\d{4})\s*[-–]\s*(\d{2}\/\d{2}[-\s]*\d{4})/,
    /(\d{2}-\d{2}-\d{4})\s*(?:til|[-–])\s*(\d{2}-\d{2}-\d{4})/,
  ];
  for (const re of moenstre) {
    const m = text.match(re);
    if (m) {
      return { period_start: m[1].replace(/\s/g, ""), period_end: m[2].replace(/\s/g, "") };
    }
  }
  return null;
}

/** «maj–juni 2026» eller «december 2025–januar 2026». */
export function spaendLabel(fra: PeriodeDato, til: PeriodeDato): string {
  const f = DK_MAANEDER[fra.maaned - 1];
  const t = DK_MAANEDER[til.maaned - 1];
  return fra.aar === til.aar ? `${f}–${t} ${fra.aar}` : `${f} ${fra.aar}–${t} ${til.aar}`;
}

/** Afvisningens tekst — rolig, siger hvad filen dækker og hvad man gør. Ingen udråb, ingen teknik. */
export function spaendAfvisningTekst(dom: Extract<PeriodeSpaendDom, { dom: "flere_maaneder" }>): string {
  return `Filen dækker ${dom.maaneder} måneder (${spaendLabel(dom.fra, dom.til)}). Vi kan kun læse én måned ad gangen — eksportér én måned pr. fil og upload dem hver for sig.`;
}

/** Beskeden når en kendt kilde ikke matcher OG filen dækker flere måneder. */
export function spaendKendtKildeTekst(kildeNavn: string, dom: Extract<PeriodeSpaendDom, { dom: "flere_maaneder" }>): string {
  return `Filen er genkendt som en rapport fra ${kildeNavn}, men den dækker ${dom.maaneder} måneder (${spaendLabel(dom.fra, dom.til)}). Vi kan kun læse én måned ad gangen — eksportér én måned pr. fil og upload dem hver for sig.`;
}
