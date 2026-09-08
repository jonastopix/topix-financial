/**
 * src/hooks/opgaveLukning.ts
 *
 * DEN ENE skrivevej til advisor_company_acknowledgments (som fornyelsens
 * skrivFornyelsesbeslutning, #709): én funktion, husets to tjek — error OG
 * antal berørte rækker (en advisor-write der rammer nul rækker tavst er
 * den kendte RLS-fælde) — og ingen optimistisk patch: sandheden hentes
 * igen af invaliderForsiden, som kalderen awaiter.
 *
 * Dommen (lukket/levende) bor i src/lib/opgaveLukning.ts; grundlaget der
 * gemmes kommer fra dommen selv (Virksomhedslinje.grundlag), så fladen
 * regner ikke noget.
 */

import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LukningsUdfald } from "@/lib/opgaveLukning";

/** Luk en linje: én ny række i loggen. Kolonnerne udfald/grundlag er fra
    migration 20260908150000 og står ikke i de genererede typer endnu
    (Lovable regenererer) — derfor `as any`, som andre nye kolonner. */
export async function lukOpgave(input: {
  companyId: string;
  advisorId: string;
  udfald: LukningsUdfald;
  grundlag: Record<string, string>;
}): Promise<void> {
  const nu = new Date().toISOString();
  const { data, error } = await (supabase
    .from("advisor_company_acknowledgments" as any)
    .insert({
      advisor_id: input.advisorId,
      company_id: input.companyId,
      udfald: input.udfald,
      grundlag: input.grundlag,
      acknowledged_at: nu,
      // basis_at er NOT NULL fra den gamle model; den bærer ingen betydning
      // for dommen længere, men kolonnen står. Sættes til «nu».
      basis_at: nu,
      snoozed_until: null,
    } as any)
    .select("id") as any);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Skrivningen ramte nul rækker — lukningen er IKKE gemt (RLS).");
  }
}

/** Forsidens cache — alle rådgiveres nøgler (præfikset), da lukningen
    gælder virksomheden, ikke kun den der lukkede. */
export async function invaliderForsiden(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["advisor-dashboard"] });
}
