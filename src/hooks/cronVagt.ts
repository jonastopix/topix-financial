/**
 * src/hooks/cronVagt.ts
 *
 * Hentningen bag forsidens «Driften»-linje: RPC'en get_cron_vagt (migration
 * 20260909234500) — de sidste 24 timers rækker fra cron_vagt_log, advisor-
 * only i SQL (has_role i WHERE). Formuleringen bor i src/lib/cronVagt.ts.
 * RPC'en står ikke i de genererede typer endnu — derfor `as any`
 * (sidenSidst-mønstret).
 */

import { supabase } from "@/integrations/supabase/client";
import type { VagtRaekke } from "@/lib/cronVagt";

export const CRON_VAGT_KEY = ["cron-vagt"] as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function hentCronVagt(): Promise<VagtRaekke[]> {
  const { data, error } = await (supabase.rpc("get_cron_vagt" as any) as any);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: number | string; tid: string; dom: VagtRaekke["dom"]; grunde: string[] | null; tal: VagtRaekke["tal"] | null }[]).map((r) => ({
    id: Number(r.id),
    tid: r.tid,
    dom: r.dom,
    grunde: r.grunde ?? [],
    tal: r.tal ?? {},
  }));
}
/* eslint-enable @typescript-eslint/no-explicit-any */
