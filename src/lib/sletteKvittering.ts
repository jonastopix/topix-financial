/**
 * Kvitteringen for «slet min data» — ren, testbar (ingen React, ingen IO).
 *
 * BAGGRUND (Alina-sagen, 8/9-2026): kvitteringen sagde «Jonas kontakter dig
 * inden for 2 hverdage». Ingen gjorde. Siden 8/9 kl. 12:01 sletter
 * slet-medlemsdata-cron automatisk, syv dage efter
 * companies.offboarding_requested_at (motoren i src/lib/sletning.ts,
 * vej «anmodning»). Kvitteringen skal derfor sige DATOEN — «din data
 * slettes den 15. september» — og fortrydelsesretten frem til den.
 *
 * ÉN KILDE TIL FRISTEN: SLETTEFRIST_ANMODNING_DAGE læses fra motoren, og
 * datoen regnes som motoren gør det — hele UTC-kalenderdage fra
 * anmodningens dag — så kvitteringens dato er præcis den dag motoren
 * dømmer skal_slettes (låst af testen mod afgoerSletning).
 *
 * Dagen er en KALENDERDAG; cronen kører kl. 12:00 UTC (14:00 dansk) den
 * dag. Kvitteringen siger derfor «den 15. september», ikke et klokkeslæt.
 */
import { afgoerSletning, SLETTEFRIST_ANMODNING_DAGE } from "./sletning";
import { DANISH_MONTHS } from "./financialUtils";

const MS_PER_DOEGN = 86_400_000;

function utcMidnat(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Slettedagen som «YYYY-MM-DD» (UTC-kalenderdag): anmodningens dag + fristen. null når datoen ikke kan læses. */
export function sletteDato(anmodetAt: string | Date | null | undefined): string | null {
  if (!anmodetAt) return null;
  const d = new Date(anmodetAt);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(utcMidnat(d) + SLETTEFRIST_ANMODNING_DAGE * MS_PER_DOEGN).toISOString().slice(0, 10);
}

/** «15. september 2026» — på UTC-komponenter, som _shared/indgangsMailAfsendelse.formatDanskDato. */
export function formatDanskDato(dato: string | Date): string {
  const d = new Date(dato);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCDate()}. ${DANISH_MONTHS[d.getUTCMonth()].toLowerCase()} ${d.getUTCFullYear()}`;
}

/**
 * Kan medlemmet stadig fortryde? Sandt så længe motoren IKKE dømmer
 * skal_slettes — dvs. til og med dagen før slettedagen. På selve
 * slettedagen kører cronen kl. 12:00 UTC; fortrydelsesretten er udløbet.
 */
export function kanFortryde(anmodetAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!anmodetAt) return false;
  const iso = anmodetAt instanceof Date ? anmodetAt.toISOString() : anmodetAt;
  const dom = afgoerSletning(
    {
      contract_end_date: null,
      offboarding_requested_at: iso,
      beslutning: null,
      status: null,
      data_slettet_at: null,
      subscription_status: null,
      subscription_current_period_end: null,
    },
    now,
  );
  return dom.vej === "anmodning" && !dom.skal_slettes;
}

export interface Kvittering {
  /** «15. september 2026» */
  slettesDen: string;
  /** Slettedagen som YYYY-MM-DD, til fx en title-attribut. */
  slettesDenIso: string;
  /** Sandt til og med dagen før slettedagen. */
  kanFortryde: boolean;
  /** Hovedsætningen — den eneste tekst der lover noget. */
  tekst: string;
  /** Anden sætning: fortrydelsesretten, eller at den er udløbet. */
  fortrydelse: string;
}

/** Kvitteringens tekster. null når anmodningens dato ikke kan læses. */
export function kvittering(anmodetAt: string | Date | null | undefined, now: Date = new Date()): Kvittering | null {
  const iso = sletteDato(anmodetAt);
  if (!iso) return null;
  const slettesDen = formatDanskDato(iso);
  const fortryd = kanFortryde(anmodetAt, now);
  return {
    slettesDen,
    slettesDenIso: iso,
    kanFortryde: fortryd,
    tekst: `Din data slettes den ${slettesDen}. Det sker automatisk — ingen kontakter dig først.`,
    fortrydelse: fortryd
      ? `Indtil da kan du fortryde her på siden. Efter den ${slettesDen} kan intet gendannes.`
      : `Fortrydelsesfristen er udløbet; sletningen sker i dag.`,
  };
}

/** Teksten på selve knappen, før nogen har trykket. */
export function sletteknapTekst(): string {
  return `Slet din data og luk din konto. Du har ${SLETTEFRIST_ANMODNING_DAGE} dage til at fortryde — derefter slettes alt automatisk.`;
}
