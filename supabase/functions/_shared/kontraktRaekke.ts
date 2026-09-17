/**
 * supabase/functions/_shared/kontraktRaekke.ts — kontraktåret webhooken skriver
 * (økonomi, kontrakter fra webhooken, 18/9-2026 — i drift før webinaret 22/9).
 *
 * JONAS 17/9 (ordret): «Prisen er det, der faktisk er faktureret. Grundprisen
 * er det, fornyelsen regner fra.»
 *
 * REN funktion, nul imports — testet i src/lib/__tests__/kontraktRaekke.test.ts
 * (vitest læser filen direkte, som paritetstestene). Bygger rækken til
 * public.kontrakter (migration 20260918100000) af det stripe-webhook
 * allerede har når den skriver company_perioder:
 *
 *   periode_start/slut   = periodens (indgang: beregnIndgangsPeriode —
 *                          betalingsdagen + 12 mdr.; fornyelse:
 *                          beregnFornyelsesperiode). Slut er EKSKLUSIV.
 *   beloeb_oere          = company_perioder.beloeb_oere: hele kontraktårets
 *                          fakturerede pris ekskl. moms INKL. 5 % ratetillæg
 *                          (checkout: session.metadata.samlet_oere; faktura:
 *                          total_excluding_tax) → pris_eks_moms_oere.
 *   grundbeloeb_oere     = listeprisen (checkout: metadata.grundbeloeb_oere;
 *                          faktura: linjebeløbet, intet tillæg) → grundpris_oere.
 *                          Det er tallet companies.indgangspris_oere får, og det
 *                          fornyelsen regner 50 % af.
 *   betalingsmodel       = company_perioder.betalingsmodel ('fuld' | 'rate2' |
 *                          'rate12' | 'faktura'); kontrakter kender ikke
 *                          'faktura' (CHECK) — en faktura er én fuld betaling
 *                          uden tillæg og skrives som 'fuld'.
 *   art                  = 'indgang' | 'fornyelse' → kilde.
 *   periode_id           = company_perioder.id (bilaget) — null hvis
 *                          indsættelsen ikke gav et id tilbage.
 *
 * Rækken er idempotent på UNIQUE (company_id, periode_start): skriveren i
 * webhooken bruger upsert med ignoreDuplicates, så en gensendelse — eller et
 * kontraktår backfillen (Ø1) allerede har skrevet for samme start — aldrig
 * giver to rækker. Fejl i bygningen (ulæselig dato, negativt beløb, ukendt
 * model) returneres som {ok:false, grund} — webhooken logger og skriver
 * ikke; betalingen væltes aldrig (README: valget).
 */

export type KontraktArt = "indgang" | "fornyelse";

export interface KontraktInput {
  company_id: string;
  periode_id: string | null;
  periode_start: string;
  periode_slut: string;
  /** company_perioder.beloeb_oere — det fakturerede for perioden, ekskl. moms, inkl. ratetillæg. */
  beloeb_oere: number;
  /** Listeprisen (grundbeloeb_oere) — det fornyelsen regner fra. */
  grundbeloeb_oere: number;
  betalingsmodel: string;
  art: KontraktArt;
  /** Stripe-referencen (session/faktura) — kun til noten. */
  stripe_reference: string;
}

export interface KontraktRaekke {
  company_id: string;
  periode_start: string;
  periode_slut: string;
  grundpris_oere: number;
  pris_eks_moms_oere: number;
  betalingsmodel: "fuld" | "rate2" | "rate12";
  kilde: KontraktArt;
  periode_id: string | null;
  note: string;
}

export type KontraktResultat = { ok: true; raekke: KontraktRaekke } | { ok: false; grund: string };

const DATO = /^\d{4}-\d{2}-\d{2}$/;

/** company_perioder.betalingsmodel → kontrakter.betalingsmodel. 'faktura' er én fuld betaling. */
export function kontraktBetalingsmodel(model: string): "fuld" | "rate2" | "rate12" | null {
  if (model === "fuld" || model === "faktura") return "fuld";
  if (model === "rate2" || model === "rate12") return model;
  return null;
}

export function bygKontraktRaekke(input: KontraktInput): KontraktResultat {
  if (!input.company_id) return { ok: false, grund: "company_id mangler" };
  if (!DATO.test(input.periode_start) || !DATO.test(input.periode_slut)) {
    return { ok: false, grund: `perioden er ulæselig (${input.periode_start} → ${input.periode_slut})` };
  }
  if (!(input.periode_slut > input.periode_start)) {
    return { ok: false, grund: `perioden slutter ikke efter start (${input.periode_start} → ${input.periode_slut})` };
  }
  if (!Number.isFinite(input.beloeb_oere) || input.beloeb_oere < 0) return { ok: false, grund: `beloeb_oere er ikke et beløb (${input.beloeb_oere})` };
  if (!Number.isFinite(input.grundbeloeb_oere) || input.grundbeloeb_oere < 0) return { ok: false, grund: `grundbeloeb_oere er ikke et beløb (${input.grundbeloeb_oere})` };
  const model = kontraktBetalingsmodel(input.betalingsmodel);
  if (model === null) return { ok: false, grund: `ukendt betalingsmodel «${input.betalingsmodel}»` };
  if (input.art !== "indgang" && input.art !== "fornyelse") return { ok: false, grund: `ukendt art «${String(input.art)}»` };
  return {
    ok: true,
    raekke: {
      company_id: input.company_id,
      periode_start: input.periode_start,
      periode_slut: input.periode_slut,
      grundpris_oere: Math.round(input.grundbeloeb_oere),
      pris_eks_moms_oere: Math.round(input.beloeb_oere),
      betalingsmodel: model,
      kilde: input.art,
      periode_id: input.periode_id,
      note: `Skrevet af stripe-webhook ved ${input.art} (${input.betalingsmodel}, ${input.stripe_reference}). Prisen er det fakturerede ekskl. moms; grundprisen er listeprisen.`,
    },
  };
}
