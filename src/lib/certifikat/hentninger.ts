/**
 * Sporet over hentninger — certificate_downloads (migration 20260929190000).
 * Én række pr. vellykket download (design + pdf/png), skrevet EFTER filen er
 * hentet; tællingen afgør «Ny»-mærket (dom.ts certifikatMenu). Klienten gives
 * ind, så prøverne kan give en falsk — og fordi kolonnerne ikke er i de
 * genererede typer, før Lovable har kørt migrationen (samme `as any`-mønster
 * som useDelingHentet.ts).
 *
 * Fejl KASTER i begge: en fejlet tælling må ikke ligne «ingen hentninger»
 * (så ville «Ny» stå på en, der har hentet ti gange), og en fejlet skrivning
 * skal kalderen selv beslutte om (fladen logger og går videre — filen ER hentet).
 */
import type { DesignId } from "@/components/hjemmebane/certifikat/types";

export const HENTNINGER_TABEL = "certificate_downloads";
export type HentningsFormat = "pdf" | "png";

/** Det, vi bruger af Supabase-klienten — nok til en falsk i prøverne. */
export interface HentningsKlient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (tabel: string) => any;
}

export async function taelHentninger(klient: HentningsKlient, userId: string): Promise<number> {
  const { count, error } = await klient.from(HENTNINGER_TABEL).select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) throw new Error(`certificate_downloads kunne ikke tælles: ${error.message ?? String(error)}`);
  return typeof count === "number" ? count : 0;
}

export interface Hentning {
  userId: string;
  design: DesignId;
  format: HentningsFormat;
}

export async function skrivHentning(klient: HentningsKlient, h: Hentning): Promise<void> {
  const { error } = await klient.from(HENTNINGER_TABEL).insert({ user_id: h.userId, design: h.design, format: h.format });
  if (error) throw new Error(`certificate_downloads kunne ikke skrives: ${error.message ?? String(error)}`);
}
