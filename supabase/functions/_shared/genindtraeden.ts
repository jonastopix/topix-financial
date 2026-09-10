/**
 * supabase/functions/_shared/genindtraeden.ts
 *
 * Genindtræden (11/9, recon-doeren.md §5): en tidligere kunde der betaler
 * sig ind igen gennem indgangen. Den rene del — dommen «er det en
 * genindtræden» og arkivnoten — testet fra src/lib/__tests__/genindtraeden.test.ts.
 * stripe-webhook gør I/O'et.
 *
 * HVAD DER SKER MED DEN GAMLE PERIODE (afgjort 11/9): den nye periode
 * OVERSKRIVER companies.contract_start_date/contract_end_date — det er
 * rigtigt, kontrakten er den der gælder nu, og dagene mellem gammel slutdato
 * og ny betaling gives ikke tilbage (samme regel som fornyelsens
 * efter_udloeb-gren, fornyelsesperiode.ts). Arkivet er company_perioder:
 * der står nu TO rækker for virksomheden, og det er tabellens mening
 * (historik pr. periode). Men kunder fra før 1/9 har INGEN række for deres
 * gamle kontrakt — tabellen er yngre end kontrakten — og så ville den gamle
 * slutdato forsvinde med overskrivningen. Derfor bærer den NYE periodes
 * `note` den gamle kontrakt ordret, når ingen periode dækker den. Ingen
 * fabrikerede rækker (beløb og betalingsmodel kendes ikke), ingen ny
 * kolonne: et arkivspor skader aldrig, en opdigtet række gør.
 *
 * Og companies.status sættes 'active' af webhooken sammen med datoen —
 * en betaling er den ene hændelse der gør en tidligere kunde aktiv igen.
 */
import { erGaeldendeSlutdato } from "./betalingsfrist.ts";

export interface ForrigeKontrakt {
  contract_start_date: string | null;
  contract_end_date: string | null;
  /** companies.status — 'active' | 'tidligere' (CHECK, 20260911040000). */
  status: string | null;
}

/**
 * Genindtræden: virksomheden HAR haft en kontrakt (slutdato findes), og
 * den gælder ikke længere. En gældende slutdato er ikke en genindtræden —
 * det er en anden fejl (dobbelt indgang), og den håndteres ikke her.
 */
export function erGenindtraeden(forrige: ForrigeKontrakt | null, now: Date): boolean {
  if (!forrige || !forrige.contract_end_date) return false;
  return !erGaeldendeSlutdato(forrige.contract_end_date, now);
}

/** Findes den gamle kontrakt som periode? Sandt når en periode slutter på den gamle slutdato. */
export function forrigeKontraktErArkiveret(forrige: ForrigeKontrakt, periodeSlutdatoer: readonly string[]): boolean {
  return forrige.contract_end_date != null && periodeSlutdatoer.includes(forrige.contract_end_date);
}

/** Arkivnoten på den nye periode — kun når den gamle kontrakt ellers ville forsvinde. */
export function genindtraedelsesNote(forrige: ForrigeKontrakt): string {
  const start = forrige.contract_start_date ?? "ukendt start";
  return `Genindtræden: forrige kontrakt ${start} → ${forrige.contract_end_date} (status ${forrige.status ?? "ukendt"}) stod ikke i company_perioder og er bevaret her.`;
}

/** Rådgiverbeskedens ord — Jonas og Morten skal vide at nogen kom tilbage. */
export function genindtraedelsesBesked(navn: string, forrige: ForrigeKontrakt, nyPeriodeStart: string, nyPeriodeSlut: string): { title: string; body: string } {
  return {
    // Datoen i titlen: rådgiverbeskedens dedup uden reference_id er på
    // titlen, og en virksomhed kan komme tilbage mere end én gang.
    title: `${navn} er tilbage (${nyPeriodeStart})`,
    body: `Betalte sig ind igen ${nyPeriodeStart}. Forrige kontrakt sluttede ${forrige.contract_end_date}; den nye løber til ${nyPeriodeSlut}. Status er sat til active.`,
  };
}
