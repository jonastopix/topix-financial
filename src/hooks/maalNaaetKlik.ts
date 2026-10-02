/**
 * src/hooks/maalNaaetKlik.ts — «Nået» som et MENNESKES klik, uden useMilestones.
 *
 * «Nået» er KUN status = 'completed' sat af et klik (Jonas 1/10-2026;
 * milepaelDom.erMarkeretNaaet) — aldrig en beregning. useMilestones.markerNaaet
 * er den vej, /milestones bruger (med fejringen). Forsidens kvartalstjek
 * (skive 3, 2/10) har ingen useMilestones og klikker gennem denne: SAMME
 * skrivning, guardet på status 'active', nul rækker er en fejl.
 *
 * Bor i sin egen fil, fordi hooks/dineMaalGrundlag — motoren bag Dine mål —
 * aldrig må skrive 'completed' (kildeværnet maalTal.guard dom 7); et klik er
 * ikke motorens.
 */
import { supabase } from "@/integrations/supabase/client";
import { maalFejlTekst } from "@/lib/hjemmebane/maalFejl";

export const NAAET_NUL_RAEKKER_TEKST = "Målet blev ikke markeret som nået — det er ikke længere aktivt, eller du har ikke adgang til det.";

export type NaaetSvar = { ok: true; id: string } | { ok: false; grund: string; afventerMigration: false };

export async function markerMaalNaaetKlik(args: { maalId: string }): Promise<NaaetSvar> {
  const { data, error } = await supabase.from("milestones").update({ status: "completed" }).eq("id", args.maalId).eq("status", "active").select("id");
  if (error) return { ok: false, grund: maalFejlTekst(error, "Kunne ikke markere målet som nået"), afventerMigration: false };
  if (!data || (data as unknown[]).length === 0) return { ok: false, grund: NAAET_NUL_RAEKKER_TEKST, afventerMigration: false };
  return { ok: true, id: args.maalId };
}
