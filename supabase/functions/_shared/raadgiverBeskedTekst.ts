/**
 * raadgiverBeskedTekst — de RENE dele af rådgiverbeskeden (10/9): dedup-dommen
 * og teksterne. Uden Supabase-import, så vitest kan dække dem
 * (src/lib/__tests__/raadgiverBesked.test.ts). Writeren bor i raadgiverBesked.ts.
 */
import { formatKrOere } from "./fornyelsesMail.ts";
import type { Betalingsmodel } from "./fornyelsespris.ts";

export interface EksisterendeRaekke {
  advisor_id: string | null;
  reference_id: string | null;
  title: string;
}

/** Ren: hvilke rådgivere mangler rækken? Dedup på reference_id, ellers på titlen. Fælles rækker (advisor_id null) tæller ikke. */
export function raadgivereUdenRaekke(
  raadgivere: readonly string[],
  eksisterende: readonly EksisterendeRaekke[],
  besked: { title: string; reference_id?: string | null },
): string[] {
  const har = new Set<string>();
  for (const r of eksisterende) {
    if (!r.advisor_id) continue;
    const match = besked.reference_id ? r.reference_id === besked.reference_id : r.title === besked.title;
    if (match) har.add(r.advisor_id);
  }
  return raadgivere.filter((id) => !har.has(id));
}

// ── Teksterne (rene) ─────────────────────────────────────────────────

export const TYPE_FORNYELSE_BETALT = "fornyelse_betalt";
export const TYPE_FORNYELSE_DUBLET = "fornyelse_dublet";

const MODEL_TEKST: Record<Betalingsmodel, string> = {
  fuld: "på én gang",
  rate2: "i to rater",
  rate12: "i tolv rater",
};

/** «CARMA STUDIO har fornyet medlemskabet» · «20.000 kr. ekskl. moms i to rater · til 3. oktober 2027». */
export function fornyelsesBeskedTekst(a: {
  virksomhed: string;
  samletOere: number;
  betalingsmodel: string;
  nySlutDatoTekst: string;
}): { title: string; body: string } {
  const model = MODEL_TEKST[a.betalingsmodel as Betalingsmodel] ?? a.betalingsmodel;
  return {
    title: `${a.virksomhed} har fornyet medlemskabet`,
    body: `${formatKrOere(a.samletOere)} kr. ekskl. moms ${model} · til ${a.nySlutDatoTekst}`,
  };
}

/** Dubletten: titlen er stabil pr. virksomhed (dedup uden reference_id), sessionen står i teksten. */
export function dubletBeskedTekst(a: {
  virksomhed: string;
  samletOere: number;
  sessionId: string;
  detalje: string;
}): { title: string; body: string } {
  return {
    title: `Mulig dobbeltbetaling: ${a.virksomhed}`,
    body: `Stripe-session ${a.sessionId} på ${formatKrOere(a.samletOere)} kr. ekskl. moms er betalt, men perioden var allerede betalt — ${a.detalje}. Der er IKKE skrevet en periode eller forlænget kontrakt. Refundér i Stripe, eller skriv perioden i hånden hvis det er meningen.`,
  };
}
