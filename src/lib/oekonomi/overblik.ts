/**
 * src/lib/oekonomi/overblik.ts — læsningen af hent_oekonomi_overblik()'s
 * svar (Ø2, 18/9-2026). REN: ingen React, ingen Supabase — testet i
 * __tests__/overblik.test.ts. Hooket (hooks/oekonomiOverblik.ts) kalder
 * RPC'en og giver svaret hertil; motoren (omsaetning.ts) regner.
 *
 * Formen holdes, ellers kastes HentningsFejl med kildens navn — en fejl
 * bliver aldrig til «0 kr.» (recon-tavse-fejl.md).
 */
import { HentningsFejl } from "@/lib/kraevRaekker";
import { periodiser, type Betaling, type Kontrakt, type MaanedsTal } from "@/lib/oekonomi/omsaetning";

export const OEKONOMI_RPC = "hent_oekonomi_overblik" as const;

export interface OverblikBetaling extends Betaling {
  id: string;
  status: string;
  kilde: string | null;
  art: string | null;
  faktura_nummer: string | null;
  beloeb_oere: number;
  moms_oere: number | null;
}

export interface OverblikVirksomhed {
  id: string;
  name: string;
  status: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  er_kunde: boolean;
  is_legat: boolean;
}

export interface Overblik {
  kontrakter: Kontrakt[];
  /** Alle rækker fra company_traek — også fejlede (status 'fejlet'); motoren får kun de betalte (betalingerTilMotor). */
  betalinger: OverblikBetaling[];
  virksomheder: OverblikVirksomhed[];
  hentet_at: string;
}

const KILDE = "hent_oekonomi_overblik";

function tal(v: unknown, felt: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new HentningsFejl(KILDE, `feltet ${felt} er ikke et tal`);
  return v;
}
function tekst(v: unknown, felt: string): string {
  if (typeof v !== "string" || v === "") throw new HentningsFejl(KILDE, `feltet ${felt} mangler`);
  return v;
}
function tekstEllerNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function liste(v: unknown, felt: string): Record<string, unknown>[] {
  if (!Array.isArray(v)) throw new HentningsFejl(KILDE, `feltet ${felt} er ikke en liste`);
  return v as Record<string, unknown>[];
}

/** Læser RPC'ens jsonb til motorens typer. Kaster HentningsFejl når formen ikke holder. */
export function laesOverblik(json: unknown): Overblik {
  if (json === null || typeof json !== "object") throw new HentningsFejl(KILDE, "svaret er ikke et objekt");
  const o = json as Record<string, unknown>;
  const kontrakter: Kontrakt[] = liste(o.kontrakter, "kontrakter").map((k) => ({
    id: tekst(k.id, "kontrakter.id"),
    company_id: tekst(k.company_id, "kontrakter.company_id"),
    periode_start: tekst(k.periode_start, "kontrakter.periode_start"),
    periode_slut: tekst(k.periode_slut, "kontrakter.periode_slut"),
    pris_eks_moms_oere: tal(k.pris_eks_moms_oere, "kontrakter.pris_eks_moms_oere"),
    betalingsmodel: tekstEllerNull(k.betalingsmodel),
    kilde: tekstEllerNull(k.kilde),
  }));
  const betalinger: OverblikBetaling[] = liste(o.betalinger, "betalinger").map((b) => ({
    id: tekst(b.id, "betalinger.id"),
    company_id: tekst(b.company_id, "betalinger.company_id"),
    betalt_at: tekstEllerNull(b.betalt_at) ?? "",
    beloeb_eks_moms_oere: tal(b.beloeb_eks_moms_oere, "betalinger.beloeb_eks_moms_oere"),
    status: tekst(b.status, "betalinger.status"),
    kilde: tekstEllerNull(b.kilde),
    art: tekstEllerNull(b.art),
    faktura_nummer: tekstEllerNull(b.faktura_nummer),
    beloeb_oere: tal(b.beloeb_oere, "betalinger.beloeb_oere"),
    moms_oere: typeof b.moms_oere === "number" ? b.moms_oere : null,
  }));
  const virksomheder: OverblikVirksomhed[] = liste(o.virksomheder, "virksomheder").map((c) => ({
    id: tekst(c.id, "virksomheder.id"),
    name: tekstEllerNull(c.name) ?? "",
    status: tekstEllerNull(c.status),
    contract_start_date: tekstEllerNull(c.contract_start_date),
    contract_end_date: tekstEllerNull(c.contract_end_date),
    er_kunde: c.er_kunde === true,
    is_legat: c.is_legat === true,
  }));
  return { kontrakter, betalinger, virksomheder, hentet_at: tekstEllerNull(o.hentet_at) ?? "" };
}

/** Motoren får kun BETALTE rækker med et tidspunkt — fejlede træk er ikke kontant. */
export function betalingerTilMotor(betalinger: readonly OverblikBetaling[]): Betaling[] {
  return betalinger
    .filter((b) => b.status === "betalt" && b.betalt_at !== "")
    .map((b) => ({ company_id: b.company_id, betalt_at: b.betalt_at, beloeb_eks_moms_oere: b.beloeb_eks_moms_oere }));
}

/** Periodiseringen for et vindue («YYYY-MM» → «YYYY-MM») af det hentede overblik. */
export function regnOverblik(overblik: Overblik, fra: string, til: string): MaanedsTal[] {
  return periodiser({ kontrakter: overblik.kontrakter, betalinger: betalingerTilMotor(overblik.betalinger), fra, til });
}
