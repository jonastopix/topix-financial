/**
 * src/hooks/sidenSidst.ts
 *
 * Hentningen bag «siden sidst» (forsidens højre spalte): stemplet i
 * forside_sidst_set og RPC'en get_siden_sidst (migration 20260909100000).
 * De rene dele — loftet, sproget, navnene — bor i src/lib/sidenSidst.ts.
 *
 * HVORNÅR STEMPLET SÆTTES (besluttet 9/9): ved ÅBNING af forsiden — men det
 * `siden` listen er regnet af holdes i SESSIONEN (sessionStorage pr.
 * bruger), så listen ikke forsvinder anden gang man kigger samme dag.
 * Første åbning i en browsersession: læs stemplet, regn `siden` (højst syv
 * dage tilbage), skriv stemplet = nu, gem `siden` i sessionen. Næste
 * åbninger i samme session: samme `siden`, ingen skrivning. Ny session (ny
 * fane, næste morgen): stemplet fra sidst er «sidst set». Mønstret er
 * conversation_last_seen (upsert på konflikt, self-only RLS) med brugeren
 * som eneste nøgle. Tabellen og RPC'en står ikke i de genererede typer
 * endnu — derfor `as any`.
 */

import { supabase } from "@/integrations/supabase/client";
import { sidenAf, type SidenSidstRaekke } from "@/lib/sidenSidst";

export const SIDEN_SIDST_KEY = (userId: string | undefined) => ["siden-sidst", userId] as const;

const sessionNoegle = (userId: string) => `tbr.siden_sidst.${userId}`;

function laesSessionSiden(userId: string): Date | null {
  try {
    const raa = sessionStorage.getItem(sessionNoegle(userId));
    if (!raa) return null;
    const d = new Date(raa);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function skrivSessionSiden(userId: string, siden: Date): void {
  try {
    sessionStorage.setItem(sessionNoegle(userId), siden.toISOString());
  } catch {
    // privat tilstand o.l. — så regnes `siden` igen ved næste åbning
  }
}

export interface SidenSidst {
  /** Det tidspunkt listen er regnet fra (efter loftet). */
  siden: Date;
  raekker: SidenSidstRaekke[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function hentSidenSidst(userId: string, nu: Date = new Date()): Promise<SidenSidst> {
  let siden = laesSessionSiden(userId);
  if (!siden) {
    const { data: stempel, error: laeseFejl } = await (supabase
      .from("forside_sidst_set" as any)
      .select("set_at")
      .eq("user_id", userId)
      .maybeSingle() as any);
    if (laeseFejl) throw new Error(laeseFejl.message);
    siden = sidenAf((stempel as { set_at: string } | null)?.set_at ?? null, nu);
    // Stemplet sættes NU — den næste session ser herfra. Fejler skrivningen,
    // vises listen alligevel (læsning er vigtigere end bogføring).
    const { error: skriveFejl } = await (supabase
      .from("forside_sidst_set" as any)
      .upsert({ user_id: userId, set_at: nu.toISOString() } as any, { onConflict: "user_id" }) as any);
    if (skriveFejl) console.warn("[siden-sidst] stemplet blev ikke sat:", skriveFejl.message);
    skrivSessionSiden(userId, siden);
  }
  const { data, error } = await (supabase.rpc("get_siden_sidst" as any, { siden: siden.toISOString() }) as any);
  if (error) throw new Error(error.message);
  const raekker = ((data ?? []) as { slags: string; antal: number; navne: string[] | null }[]).map((r) => ({
    slags: r.slags,
    antal: Number(r.antal) || 0,
    navne: r.navne ?? [],
  }));
  return { siden, raekker };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
