/**
 * src/lib/forslagFlade.ts
 *
 * Fladens spejl af forslagsmotorens værdisæt. Motoren
 * (supabase/functions/_shared/forslagEngine.ts) er den ene sandhed;
 * spejlet findes fordi frontend-bundtet ikke importerer Deno-moduler.
 * Paritetsværn: src/lib/__tests__/forslagFlade.paritet.test.ts — fejler
 * det, er spejlet drevet fra motoren og skal re-synkroniseres. Samme
 * mønster som opgaveEngineSpejl.paritet.test.ts.
 */

/** Spejl af UNDERSTOETTEDE_SKRIVEVEJE: kun disse tools kan godkendes
    (de idempotente skriveveje i agentSkriveveje.ts). Øvrige tools får
    ingen godkend-knap — de kan kun forkastes. */
export const UNDERSTOETTEDE_SKRIVEVEJE_FLADE: ReadonlySet<string> = new Set([
  "update_weekly_focus",
  "write_session_prep",
]);

/** Spejl af FORKAST_KATEGORIER + fladens danske labels (design §4.4).
    Fladen sender ALTID slug'en som decision_category — labels er kun
    visning, og fallback-reason når rådgiveren ikke skriver fritekst. */
export const FORKAST_KATEGORI_LABELS: Readonly<Record<string, string>> = {
  ikke_relevant: "Ikke relevant",
  forkert_tolkning: "Forkert tolkning",
  allerede_talt_om: "Allerede talt om",
  forkert_timing: "Forkert timing",
  andet: "Andet",
};

export const FORKAST_KATEGORIER_FLADE: readonly string[] =
  Object.keys(FORKAST_KATEGORI_LABELS);
