/**
 * Ventelisten under Ansøgninger — DATAEN (udkast 22/9-2026).
 *
 * Samler præcis det, dommen `bygVentelisteOverblik` behøver, og regner INTET selv.
 * Den ene undtagelse er `afgoerFornyelsestilstand`, som er husets egen dom og
 * kaldes her af samme grund som i `AdvisorDashboard.tsx:1026-1033`: statussen er
 * en egenskab ved VIRKSOMHEDEN, ikke ved ventepladsen, så den skal slås op én
 * gang pr. virksomhed og gives ind.
 *
 * TRE LÆSNINGER, ikke én pr. venteplads. `hentVentepladserForAnsoegning`
 * (hooks/ansoegninger.ts:324) læser køen forfra for HVER plads — det er rigtigt
 * dér, hvor der er én ansøgning. Her ville det blive N+1 over hele ventelisten.
 * Derfor: alle levende ventepladser i ét kald, virksomhederne i ét, beslutningerne
 * i ét — og køen pr. virksomhed samles i kode.
 *
 * KUN LEVENDE PLADSER (`venter`, `tilbudt`), som resten af huset læser dem
 * (ventelisteApi.hentVenteliste:31, ansoegninger.ts:327). En accepteret eller
 * udløbet plads er historik og hører på ansøgningen, ikke i overblikket.
 */
import { supabase } from "@/integrations/supabase/client";
import { afgoerFornyelsestilstand, type Fornyelsesbeslutning } from "@/lib/fornyelse";
import { bygVentelisteOverblik, type OverblikInput, type OverblikRaekke } from "@/lib/ansoegninger/ventelisteOverblik";
import { ansoegerNavn } from "@/lib/hjemmebane/ventelisteApi";
import type { VentepladsRaekke, VentepladsStatus } from "@/lib/ventelisteDom";

export const VENTELISTE_OVERBLIK_KEY = ["ansoegning-venteliste-overblik"] as const;

interface PladsRad {
  id: string;
  ansoegning_id: string;
  company_id: string;
  status: string;
  sat_at: string;
  tilbud_udloeber_at: string | null;
  tidligst_tilbud_at: string | null;
  ansoegninger: { lukket_at: string | null; navn: string | null; email: string | null; cvr_opslag: { navn?: string | null } | null } | null;
}
interface FirmaRad {
  id: string;
  name: string;
  contract_end_date: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
}

/** Hele ventelisten på tværs af virksomheder, dømt af husets egne domme. */
export async function hentVentelisteOverblik(nu: Date = new Date()): Promise<OverblikRaekke[]> {
  const pladserRes = await supabase
    .from("ventepladser" as never)
    .select("id, ansoegning_id, company_id, status, sat_at, tilbud_udloeber_at, tidligst_tilbud_at, ansoegninger(lukket_at, navn, email, cvr_opslag)" as never)
    .in("status" as never, ["venter", "tilbudt"] as never)
    .limit(2000);
  if (pladserRes.error) throw new Error(pladserRes.error.message);
  const pladser = ((pladserRes.data ?? []) as unknown as PladsRad[]).filter((p) => !!p.company_id);
  if (pladser.length === 0) return [];

  const companyIds = [...new Set(pladser.map((p) => p.company_id))];
  const [firmaRes, fornyelseRes] = await Promise.all([
    supabase.from("companies").select("id, name, contract_end_date, subscription_status, subscription_current_period_end").in("id", companyIds),
    supabase.from("company_fornyelse" as never).select("company_id, beslutning" as never).in("company_id" as never, companyIds as never),
  ]);
  if (firmaRes.error) throw new Error(firmaRes.error.message);
  if (fornyelseRes.error) throw new Error(fornyelseRes.error.message);

  const firmaer = new Map<string, FirmaRad>(((firmaRes.data ?? []) as unknown as FirmaRad[]).map((r) => [r.id, r]));
  const beslutninger = new Map<string, Fornyelsesbeslutning | null>(
    ((fornyelseRes.data ?? []) as unknown as Array<{ company_id: string; beslutning: string | null }>)
      .map((r) => [r.company_id, (r.beslutning as Fornyelsesbeslutning | null) ?? null]),
  );

  // Køen pr. virksomhed — samlet i kode, så der er ét kald og ikke ét pr. plads.
  const koeFor = new Map<string, VentepladsRaekke[]>();
  const somRaekke = (p: PladsRad): VentepladsRaekke => ({
    id: p.id,
    ansoegning_id: p.ansoegning_id,
    company_id: p.company_id,
    status: p.status as VentepladsStatus,
    sat_at: p.sat_at,
    afvist_at: p.ansoegninger?.lukket_at ?? null,
    tidligst_tilbud_at: p.tidligst_tilbud_at ?? null,
  });
  for (const p of pladser) {
    const liste = koeFor.get(p.company_id) ?? [];
    liste.push(somRaekke(p));
    koeFor.set(p.company_id, liste);
  }

  const input: OverblikInput[] = [];
  for (const p of pladser) {
    const firma = firmaer.get(p.company_id);
    // Uden virksomheden kan fornyelsesdommen ikke stilles — rækken udelades
    // hellere end at blive vist med en gættet status.
    if (!firma) continue;
    const tilstand = afgoerFornyelsestilstand({
      contract_end_date: firma.contract_end_date ?? null,
      subscription_status: firma.subscription_status ?? null,
      subscription_current_period_end: firma.subscription_current_period_end ?? null,
      beslutning: beslutninger.get(p.company_id) ?? null,
    }, nu);
    input.push({
      venteplads: somRaekke(p),
      ansoegerNavn: ansoegerNavn(p.ansoegninger),
      virksomhed: firma.name,
      fornyelseStatus: tilstand.status,
      koe: koeFor.get(p.company_id) ?? [],
      tilbudUdloeberAt: p.tilbud_udloeber_at ?? null,
    });
  }
  return bygVentelisteOverblik(input, nu);
}
