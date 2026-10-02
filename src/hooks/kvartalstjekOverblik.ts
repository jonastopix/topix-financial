/**
 * src/hooks/kvartalstjekOverblik.ts — datalaget til rådgiverforsidens linje
 * «N kvartalstjek venter hos medlemmerne» (skive 3, 2/10-2026; Jonas 1/10:
 * «rådgiverne skal have som en linje på forsiden, så vi kan følge op, hvis vi
 * har brug for det»). Dommen er motorens (lib/hjemmebane/maalBekraeft:
 * ventendeKvartalstjekAlle, kvartalstjekPrVirksomhed) — her hentes der kun.
 *
 * Tre kilder, rådgiverbredt (RLS: «Advisors can view all milestones»,
 * «Advisors can view all kvartalstjek», companies' rådgiveradgang):
 *   - milestones: de AKTIVE, BEKRÆFTEDE mål (id, title, company_id, status,
 *     bekraeftet_at) — side for side (hentAlleSider), aldrig et tavst loft.
 *   - maal_kvartalstjek: milestone_id + kvartal — side for side.
 *   - companies: id + name + universets kolonner KUN for de virksomheder, der
 *     har et ventende tjek — og linjen tæller KUN virksomheder i husets
 *     univers (medlemsOverblik.iUniverset: kunde, ikke demo, ikke legat,
 *     aktiv/status-løs) og ikke slettede (data_slettet_at IS NULL) — som
 *     «Mangler at booke» (rådets fund 5). Et tjek i en demo-, legat- eller
 *     slettet virksomhed tælles ikke med.
 *
 * FAIL-SOFT på migrationen (20261002100000 ikke kørt): mangler kolonnen
 * bekraeftet_at (42703/PGRST204) eller tabellen (PGRST205/42P01), svarer
 * hentningen `{ tilstand: "afventer_migration" }` — linjen står roligt «på
 * vej». Enhver ANDEN fejl kaster med kildens navn (raadgiverHentefejlTekst),
 * så rådgiveren ved, at linjen kan mangle noget — aldrig en tavs «0».
 *
 * Egen nøgle, så en fejl her lader resten af forsiden stå.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { hentAlleSider } from "@/lib/budgetEngine";
import { erManglendeKolonne, erManglendeTabel } from "@/lib/manglendeTabel";
import { kvartalstjekPrVirksomhed, ventendeKvartalstjekAlle, type KvartalstjekPrVirksomhed, type KvartalstjekRaekke, type MaalTilKvartalstjek } from "@/lib/hjemmebane/maalBekraeft";
import { iUniverset } from "@/lib/medlemsOverblik";

/** Det af companies-rækken linjen læser: navnet + universets dom + sletning. */
export interface VirksomhedTilKvartalstjek {
  id: string;
  name: string | null;
  status: string | null;
  is_legat: boolean | null;
  er_kunde: boolean | null;
  is_demo: boolean | null;
  data_slettet_at: string | null;
}
export const KVARTALSTJEK_VIRKSOMHED_KOLONNER = "id, name, status, is_legat, er_kunde, is_demo, data_slettet_at";

/** Ren (fund 5): kun virksomheder i universet og ikke slettede tæller; en ukendt virksomhed (ikke i svaret) tæller ikke. */
export function filtrerTilUniverset(pr: readonly KvartalstjekPrVirksomhed[], virksomheder: readonly VirksomhedTilKvartalstjek[]): (KvartalstjekPrVirksomhed & { navn: string })[] {
  const af = new Map(virksomheder.map((c) => [c.id, c]));
  const ud: (KvartalstjekPrVirksomhed & { navn: string })[] = [];
  for (const p of pr) {
    const c = af.get(p.companyId);
    if (!c || c.data_slettet_at !== null || !iUniverset(c)) continue;
    ud.push({ ...p, navn: c.name ?? "Uden navn" });
  }
  return ud;
}

export const KVARTALSTJEK_OVERBLIK_QUERY_KEY = ["kvartalstjek-overblik"] as const;

export type KvartalstjekOverblik =
  | { tilstand: "afventer_migration" }
  | { tilstand: "klar"; antal: number; virksomheder: (KvartalstjekPrVirksomhed & { navn: string })[] };

type Svar<T> = { data: T[] | null; error: { code?: string; message: string } | null };
const side = <T,>(kilde: string) => (res: Svar<T>) => ({ data: kraevRaekker(res, kilde), error: null });

/** Første side afgør, om migrationen er kørt — derefter side for side som de andre kilder. */
export async function hentKvartalstjekOverblik(nu: Date = new Date()): Promise<KvartalstjekOverblik> {
  const proeve = (await supabase.from("milestones").select("id, bekraeftet_at").eq("status", "active").limit(1)) as unknown as Svar<unknown>;
  if (proeve.error && erManglendeKolonne(proeve.error)) return { tilstand: "afventer_migration" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tabelProeve = (await (supabase.from("maal_kvartalstjek" as any).select("milestone_id").limit(1) as any)) as Svar<unknown>;
  if (tabelProeve.error && erManglendeTabel(tabelProeve.error)) return { tilstand: "afventer_migration" };

  const [maal, tjek] = await Promise.all([
    hentAlleSider<MaalTilKvartalstjek>((fra, til) =>
      (supabase.from("milestones").select("id, title, company_id, status, bekraeftet_at").eq("status", "active").not("bekraeftet_at" as never, "is", null).order("id").range(fra, til) as unknown as Promise<Svar<MaalTilKvartalstjek>>).then(side("milestones"))),
    hentAlleSider<KvartalstjekRaekke>((fra, til) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((supabase.from("maal_kvartalstjek" as any).select("milestone_id, kvartal").order("id").range(fra, til)) as unknown as Promise<Svar<KvartalstjekRaekke>>).then(side("maal_kvartalstjek"))),
  ]);

  const ventende = ventendeKvartalstjekAlle(maal, tjek, nu);
  const pr = kvartalstjekPrVirksomhed(ventende);
  if (pr.length === 0) return { tilstand: "klar", antal: 0, virksomheder: [] };
  const raekker = kraevRaekker(
    (await supabase.from("companies").select(KVARTALSTJEK_VIRKSOMHED_KOLONNER).in("id", pr.map((p) => p.companyId))) as unknown as Svar<VirksomhedTilKvartalstjek>,
    "companies",
  );
  // Fund 5: universet (kunde, ikke demo, ikke legat) og ikke slettet — tallet er summen over de virksomheder, der tæller.
  const virksomheder = filtrerTilUniverset(pr, raekker);
  return {
    tilstand: "klar",
    antal: virksomheder.reduce((n, v) => n + v.antal, 0),
    virksomheder,
  };
}

export function useKvartalstjekOverblik(enabled: boolean) {
  return useQuery({
    queryKey: KVARTALSTJEK_OVERBLIK_QUERY_KEY,
    queryFn: () => hentKvartalstjekOverblik(new Date()),
    enabled,
    staleTime: 2 * 60_000,
  });
}
