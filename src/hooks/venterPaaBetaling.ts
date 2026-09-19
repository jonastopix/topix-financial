/**
 * src/hooks/venterPaaBetaling.ts
 *
 * Hentningen bag forsidekortet «Venter på betaling» (19/9-2026,
 * recon-indgangspaamindelser §5). Den rene dom bor i
 * src/lib/hjemmebane/venterPaaBetaling.ts. Mønstret er hooks/ubesvaredeOpslag:
 * én react-query-nøgle, egen hentning adskilt fra forsidens datalag, så en
 * fejl her ikke vælter dommen — og gennem kraevRaekker, så en fejl bliver en
 * HentningsFejl med kildens navn frem for en tom liste, der ligner «alle har
 * betalt».
 *
 * TO OPSLAG, ÉN NØGLE: linkrækkerne (alle — også dem uden betalingsmail, for
 * «prisen er ikke sat» er netop en af tilstandene kortet skal vise) og de
 * virksomheder, de peger på. Samme to-trins-form som cronen selv
 * (indgangs-paamindelser-cron:203-231): to enkle opslag frem for et embedded
 * filter; mængden er lille (nye medlemmer i deres første måned).
 *
 * INGEN SQL-ÆNDRING: rådgivere må læse company_betalingslink og companies
 * med deres egen RLS — samme læsning som AdvisorDashboard allerede laver
 * (AdvisorDashboard.tsx:337) og som VirksomhedView bruger pr. virksomhed.
 */
import { supabase } from "@/integrations/supabase/client";
import { kraevRaekker } from "@/lib/kraevRaekker";
import type { VenterRaekke } from "@/lib/hjemmebane/venterPaaBetaling";

export const VENTER_PAA_BETALING_KEY = ["forside", "venter-paa-betaling"] as const;

type LinkRaekke = Omit<VenterRaekke, "navn" | "contract_end_date">;
type CompanyRaekke = { id: string; name: string; contract_end_date: string | null };

export async function hentVenterPaaBetaling(): Promise<VenterRaekke[]> {
  const linkRes = await supabase
    .from("company_betalingslink")
    .select("company_id, prisniveau_oere, underskrevet_at, betalingsmail_sendt_at, sidste_paamindelse_dag, faktura_sendt_at");
  const links = kraevRaekker(linkRes, "company_betalingslink") as LinkRaekke[];
  if (links.length === 0) return [];

  const companyRes = await supabase
    .from("companies")
    .select("id, name, contract_end_date")
    .in("id", links.map((l) => l.company_id));
  const companies = kraevRaekker(companyRes, "companies") as CompanyRaekke[];
  const virksomhed = new Map(companies.map((c) => [c.id, c]));

  // En linkrække uden companies-række kan ikke dømmes (slutdatoen er selve
  // «betalt»-dommen) — den springes over frem for at blive vist som ubetalt.
  return links.flatMap((l) => {
    const c = virksomhed.get(l.company_id);
    return c ? [{ ...l, navn: c.name, contract_end_date: c.contract_end_date }] : [];
  });
}
