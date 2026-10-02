/**
 * src/lib/hjemmebane/communityMestLaest.ts
 *
 * Mærket «Mest læst denne uge» på HØJST ÉN tråd i Community-feedet (den
 * godkendte mockup, 2/10-2026). Ren dom, ingen React, ingen Supabase. Testet
 * i __tests__/communityMestLaest.test.ts; kildeværnet
 * communityMestLaest.guard.test.ts låser, at fladen dømmer HER.
 *
 * DATA: RPC'en public.community_mest_laest_uge() (migration
 * 20261002275000, SECURITY DEFINER — medlemmer kan kun læse EGNE rækker i
 * community_visninger) svarer (traad_id, laesere) for AKTIVE tråde: antal
 * FORSKELLIGE læsere i den aktuelle ISO-uge (mandag 00:00 Europe/Copenhagen),
 * trådens forfatter og tjenestekonti fraregnet. NB: community_visninger har
 * ÉN række pr. (tråd, bruger) med set_at = FØRSTE visning (INSERT … ON
 * CONFLICT DO NOTHING, 20260811180000) — så «læsere i ugen» er personer, der
 * læste tråden FØRSTE gang i ugen; en genlæsning tæller ikke. Ugen er
 * databasens (serverens ur), ikke klientens.
 *
 * DOMMEN:
 *   1. Vinderen er tråden med flest læsere.
 *   2. TÆRSKEL: under MEST_LAEST_MINDST (3) læsere → intet mærke. To læsere
 *      er ikke «mest læst», det er tilfældighed.
 *   3. UAFGJORT → INTET mærke. Mærket påstår «mest»; ved lighed er det ikke
 *      sandt for nogen af dem, og at vælge den ældste (eller den med laveste
 *      id) ville være en vilkårlig regel, medlemmet ikke kan se — og et mærke,
 *      der hopper mellem to lige tråde ved hver hentning, er værre end intet.
 *   4. Ugyldige rækker (laesere ikke et endeligt tal, tomt id) ignoreres.
 *      PostgREST leverer bigint som STRENG — derfor Number() her.
 *   5. Fail-soft: et tomt svar (funktionen findes ikke endnu, ingen adgang,
 *      ingen læsere) → null. Fladen viser mærket KUN på en tråd, den har i
 *      feedet (id-match) — står vinderen ikke i feedet, vises intet.
 */

export const MEST_LAEST_MINDST = 3;
export const MEST_LAEST_MAERKE = "Mest læst denne uge";

export interface MestLaestRaekke {
  traad_id: string;
  laesere: number | string;
}

export function vaelgMestLaest(raekker: readonly MestLaestRaekke[] | null | undefined): string | null {
  let bedste: { id: string; n: number } | null = null;
  let uafgjort = false;
  for (const r of raekker ?? []) {
    const n = Number(r?.laesere);
    if (!r?.traad_id || !Number.isFinite(n)) continue;
    if (bedste === null || n > bedste.n) {
      bedste = { id: r.traad_id, n };
      uafgjort = false;
    } else if (n === bedste.n && r.traad_id !== bedste.id) {
      uafgjort = true;
    }
  }
  if (bedste === null || uafgjort || bedste.n < MEST_LAEST_MINDST) return null;
  return bedste.id;
}
