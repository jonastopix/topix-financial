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
import { erForslagGyldigt } from "./forslagUdloeb";

/** Spejl af UNDERSTOETTEDE_SKRIVEVEJE: kun disse tools kan godkendes
    (de idempotente skriveveje i agentSkriveveje.ts). Øvrige tools får
    ingen godkend-knap — de kan kun forkastes. write_session_prep udgik
    med C3 (docs/chat-design.md, 31/8). */
export const UNDERSTOETTEDE_SKRIVEVEJE_FLADE: ReadonlySet<string> = new Set([
  "update_weekly_focus",
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

/**
 * KRÆVER FORSLAGET RÅDGIVEREN? (besluttet 30/9-2026, design §9) — den ENE
 * dom for, om et agentforslag må skabe en «kræver dig»-linje på forsiden,
 * et signal på virksomhedssiden eller «Derfor er du her: Afgør
 * agentforslagene». Ja ⇔ status 'proposed' (kalderens hentning), stadig
 * gyldigt (udløbsdommen: indeværende ISO-uge) OG tool'et har en godkend-vej.
 * Et forslag, der kun kan forkastes, er til orientering i Agent-loggen —
 * det venter ikke på nogen. Målt 30/9: 6 af 6 opgaveforslag fra
 * tør-kørsler kunne aldrig godkendes, men gav alligevel en pukkellinje.
 */
export function kraeverAfgoerelse(p: { proposed_at: string; tool: string | null }, nu: Date): boolean {
  return !!p.tool && UNDERSTOETTEDE_SKRIVEVEJE_FLADE.has(p.tool) && erForslagGyldigt(p.proposed_at, nu);
}

/** Dansk ejefald: «Carma» → «Carmas», «Topix» → «Topix'». Navne på s, x
    og z får apostrof (Retskrivningsordbogen §8). */
export function ejefald(navn: string): string {
  const n = navn.trim();
  return /[sxz]$/i.test(n) ? `${n}'` : `${n}s`;
}

/** Linjen over et godkendbart ugefokus-forslag (30/9, design §9): hvad
    godkendelse GØR, og hvornår forslaget udløber (udløbsdommen: forslagets
    ISO-uge — søndag er sidste dag). Uden navn: «medlemmets forside». */
export function ugefokusForklaring(virksomhedsnavn: string | null | undefined): string {
  const hvor = virksomhedsnavn && virksomhedsnavn.trim() ? `${ejefald(virksomhedsnavn)} forside` : "medlemmets forside";
  return `Godkend, så erstatter det ugens fokus på ${hvor}. Forslaget udløber søndag.`;
}

/** Linjen ved et forslag, der kun kan forkastes (ikke et udløbet — det har
    udløbsdommens egen grund). Det kræver ingen afgørelse; det står i loggen
    til orientering. */
export const TIL_ORIENTERING_TEKST = "Til orientering — denne slags forslag kan ikke godkendes, kun forkastes.";
