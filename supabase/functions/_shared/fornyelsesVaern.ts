/**
 * fornyelsesVaern — værnet mod dobbeltbetaling af en fornyelse (10/9,
 * recon-penge-og-roller.md §2).
 *
 * FØR var dobbeltbetaling lukket ved en regel der ikke handlede om det:
 * efter en fornyelse ligger contract_end_date tolv måneder ude, så
 * afgoerFornyelsestilstand siger i_god_tid og checkout svarer 403. Det
 * holder KUN når webhooken har skrevet. Fejler webhooken (Stripe gensender i
 * op til tre døgn), eller betales to sessioner inden for sessionsværnets 30
 * minutter, findes intet der siger «denne periode er allerede betalt»:
 * company_perioder har ingen UNIQUE/EXCLUDE, og webhookens idempotens er pr.
 * session-id, ikke pr. virksomhed.
 *
 * DOMMEN — ren, testet i src/lib/__tests__/fornyelsesVaern.test.ts — ser på
 * to ting, fra den nye periodes START (beregnFornyelsesperiode):
 *
 *   a) PERIODEN: findes der allerede en periode for virksomheden hvis
 *      periode_slut ligger EFTER den nye start (halvåbent: slut = ny start
 *      er IKKE overlap — en fornyelse betalt tidligt starter præcis hvor
 *      den gamle slutter, fornyelsesperiode.ts:43-50)? Så er den kommende
 *      periode betalt. Egen session (stripe_reference) tæller ikke — den er
 *      gensendelsens sag.
 *
 *   b) KONTRAKTEN: ligger contract_end_date mere end FORNYELSES_VINDUE_DAGE
 *      ude, er der ingen fornyelse at betale — dét er tilstandsdommens egen
 *      grænse (fornyelse.ts:203), brugt her i webhooken hvor tilstanden
 *      ellers ikke dømmes igen. Samme regnestykke (UTC-kalenderdage,
 *      Math.round) som beregnDageTilUdloeb i fornyelse.ts, som ikke er
 *      eksporteret.
 *
 * LOVLIGE betalinger holder: en der fortryder og betaler en ANDEN model
 * (første session aldrig betalt → ingen periode, dato uændret); en
 * fornyelse ÅRET EFTER (alle perioders slut ≤ ny start, kontrakten inden for
 * vinduet); en fornyelse betalt EFTER udløb (ny start = betalingsdagen >
 * alle slut). Dommen spærrer kun når der allerede ligger en betalt periode
 * hen over den nye start, eller når kontrakten allerede er forlænget.
 *
 * Bruges TO steder: opret-fornyelse-checkout FØR sessionen oprettes (403,
 * samme neutrale besked som de øvrige afvisninger) og stripe-webhook FØR
 * perioden indsættes (log KRITISK + rådgiverbesked; pengene er taget og
 * skal refunderes i hånden — men der skrives hverken periode eller dato).
 */
import { FORNYELSES_VINDUE_DAGE } from "./fornyelse.ts";

export interface PeriodeRaekke {
  periode_start: string;
  periode_slut: string;
  stripe_reference?: string | null;
  art?: string | null;
}

export type FornyelsesDubletGrund = "periode_daekker_start" | "kontrakt_uden_for_vinduet";

export type FornyelsesDublet =
  | { dublet: false }
  | { dublet: true; grund: FornyelsesDubletGrund; detalje: string };

export interface FornyelsesVaernInput {
  /** Virksomhedens perioder (company_perioder) — alle arter. */
  perioder: readonly PeriodeRaekke[];
  /** Den nye periodes start, "YYYY-MM-DD" (beregnFornyelsesperiode). */
  nyPeriodeStart: string;
  /** companies.contract_end_date som den står NU. */
  contractEndDate: string | null | undefined;
  now: Date;
  /** Egen checkout-session — perioder med denne stripe_reference ignoreres. */
  egenReference?: string | null;
}

const MS_PER_DOEGN = 86_400_000;

/** "YYYY-MM-DD" (UTC-kalenderdag) af en dato-streng; null når den ikke kan læses. */
export function kalenderdag(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function utcMidnat(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Spejl af fornyelse.ts beregnDageTilUdloeb (ikke eksporteret dér). */
export function dageTilUdloeb(contractEndDate: string, now: Date): number | null {
  const slut = new Date(contractEndDate);
  if (Number.isNaN(slut.getTime())) return null;
  return Math.round((utcMidnat(slut) - utcMidnat(now)) / MS_PER_DOEGN);
}

export function doemFornyelsesdublet(input: FornyelsesVaernInput): FornyelsesDublet {
  const nyStart = kalenderdag(input.nyPeriodeStart);
  if (nyStart) {
    for (const p of input.perioder) {
      if (input.egenReference && p.stripe_reference && p.stripe_reference === input.egenReference) continue;
      const slut = kalenderdag(p.periode_slut);
      if (slut && slut > nyStart) {
        return {
          dublet: true,
          grund: "periode_daekker_start",
          detalje: `perioden ${kalenderdag(p.periode_start) ?? "?"} → ${slut} (${p.art ?? "ukendt art"}${p.stripe_reference ? `, ${p.stripe_reference}` : ""}) slutter efter den nye start ${nyStart}`,
        };
      }
    }
  }

  if (input.contractEndDate) {
    const dage = dageTilUdloeb(input.contractEndDate, input.now);
    if (dage !== null && dage > FORNYELSES_VINDUE_DAGE) {
      return {
        dublet: true,
        grund: "kontrakt_uden_for_vinduet",
        detalje: `contract_end_date ${kalenderdag(input.contractEndDate)} er ${dage} dage ude — mere end vinduet på ${FORNYELSES_VINDUE_DAGE}; den kommende periode er allerede betalt`,
      };
    }
  }

  return { dublet: false };
}
