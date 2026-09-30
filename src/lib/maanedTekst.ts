/**
 * src/lib/maanedTekst.ts
 *
 * «2026-07» → «juli 2026»: en periodenøgle, som et medlem læser den.
 * Ren funktion, testet i __tests__/maanedTekst.test.ts.
 *
 * FEJLEN (analyse-medlemsrejse 30/9 §2.5, målt i koden 30/9):
 * NoegletalView sendte `period_label: commentPopover.periodKey` til
 * notify-kpi-comment, og functionen skriver `body: "Se kommentaren direkte
 * på grafen for ${period_label}"`. Medlemmet fik «…for 2026-07».
 *
 * Månedsnavnene kommer fra maanedsnoegle.ts (MAANEDSNAVNE via maanedsnavn,
 * ét sted). Filen ligger ved siden af, ikke i den, fordi maanedsnoegle.ts
 * er spejlet ordret i _shared og låst af en paritetstest.
 *
 * En ugyldig nøgle gives uændret tilbage: hellere den rå nøgle end en tom
 * sætning («…på grafen for »).
 */
import { maanedsnavn } from "./maanedsnoegle";

export function maanedOgAar(noegle: string): string {
  const navn = maanedsnavn(noegle);
  return navn ? `${navn} ${noegle.slice(0, 4)}` : noegle;
}
