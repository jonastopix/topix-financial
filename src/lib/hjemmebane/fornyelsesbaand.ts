/**
 * Fornyelsesbåndets tekster — ren funktion, så ordlyden og formateringen
 * er testet uden React. Båndet (FornyelsesBaand.tsx) tegner det der
 * kommer herfra.
 *
 * BESLUTTET 7/9 (Jonas): et medlem der har fået tilbudt fornyelse skal
 * kunne betale FØR slutdatoen (#684) — og skal kunne se det på sin
 * forside. Tonen er en invitation, ikke en advarsel: medlemmet har fuld
 * adgang og mister ingen dage ved at handle nu, for den nye periode
 * begynder hvor den nuværende slutter (beregnFornyelsesperiode).
 *
 * kr() er kopieret ordret fra MembershipExpiredGate.tsx (og Betal.tsx),
 * som begge holder en privat kopi — Betal.tsx's kommentar foreslår at
 * samle dem; det er ikke gjort her, og de to filer er urørte.
 */
import type { Betalingsmodel } from "@/lib/fornyelsespris";

export interface FornyelsesMulighed {
  betalingsmodel: Betalingsmodel;
  samlet_oere: number;
  rate_oere: number;
  antal_traek: number;
  lookup_key: string;
}

/** Svaret fra hent-fornyelsestilbud når der ER et tilbud. */
export interface Fornyelsestilbud {
  grundbeloeb_oere: number;
  muligheder: FornyelsesMulighed[];
}

// Øre → dansk kronestreng. Hele beløb uden decimaler ("2.000"), skæve med
// to ("2.187,50") — ører må ikke forsvinde i formateringen.
export function kr(oere: number): string {
  const kroner = oere / 100;
  return new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: Number.isInteger(kroner) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(kroner);
}

/** Samme ordlyd som MembershipExpiredGate.beskrivMulighed. */
export function beskrivMulighed(m: FornyelsesMulighed): string {
  switch (m.betalingsmodel) {
    case "fuld":
      return "Betal på én gang";
    case "rate2":
      return `2 rater à ${kr(m.rate_oere)} kr. — nu og om 6 måneder`;
    case "rate12":
      return `12 rater à ${kr(m.rate_oere)} kr. — i alt ${kr(m.samlet_oere)} kr.`;
  }
}

/** Slutdatoen som dansk dato med år («29. september 2026»); null når den
    ikke kan læses — så udelades datoen frem for at vise noget forkert. */
export function formatUdloebsdato(contractEndDate: string | null): string | null {
  if (!contractEndDate) return null;
  const d = new Date(contractEndDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
}

export interface Fornyelsesbaandtekst {
  /** «Dit medlemskab udløber 29. september 2026» — eller uden dato. */
  overskrift: string;
  /** «Forny nu til 20.000 kr. ekskl. moms — den nye periode begynder hvor den nuværende slutter.» */
  linje: string;
}

/**
 * Båndets to linjer. Datoen kommer fra companies.contract_end_date (læses
 * af båndet), beløbet fra hent-fornyelsestilbud. Ingen alarmtone.
 */
export function fornyelsesbaandTekst(input: {
  contract_end_date: string | null;
  grundbeloeb_oere: number;
}): Fornyelsesbaandtekst {
  const dato = formatUdloebsdato(input.contract_end_date);
  return {
    overskrift: dato ? `Dit medlemskab udløber ${dato}` : "Dit medlemskab kan fornys nu",
    linje: `Forny nu til ${kr(input.grundbeloeb_oere)} kr. ekskl. moms — den nye periode begynder hvor den nuværende slutter.`,
  };
}
