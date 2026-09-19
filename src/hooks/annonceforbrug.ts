/**
 * Annonceforbruget — I/O (udkast 19/9-2026). Hook = I/O, lib = dom: alle tal
 * og ord er src/lib/webinar/annoncepriser.ts's.
 *
 * TRE TILSTANDE, IKKE TO. Fladen skal kunne sige forskel på:
 *   mangler — tabellerne findes ikke (migration 20260919170000 ikke kørt)
 *   tom     — tabellerne findes, men ingen dage (tokenet ikke godkendt endnu)
 *   har     — der er dage
 * De to første er ikke «0 kr.», og de har hver sin sætning. Et nul, der i
 * virkeligheden er «vi har ikke spurgt endnu», er den slags tal, man tager
 * beslutninger på ved en fejl.
 *
 * `mangler` måles på PostgREST's 42P01 («relation does not exist») — samme
 * mønster som annoncespor-kolonnerne på webinarfladen, og af samme grund:
 * siden skal blive rigtig af sig selv i samme sekund migrationen er kørt,
 * uden en ny udrulning. Enhver ANDEN fejl kaster gennem kraevRaekker; et
 * halvt svar der ligner et helt, er den værste fejl på en talflade.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { HentningsFejl, kraevRaekker } from "@/lib/kraevRaekker";
import type { Annoncenavn, Forbrugsdag, Forbrugstilstand } from "@/lib/webinar/annoncepriser";

/* eslint-disable @typescript-eslint/no-explicit-any */
const tabel = (navn: string) => supabase.from(navn as any) as any;

export const ANNONCEFORBRUG_KEY = ["annonceforbrug"] as const;

export const DAG_KOLONNER = "ad_id, campaign_id, dato, valuta, forbrug_oere";
export const ANNONCE_KOLONNER = "ad_id, campaign_id, navn, kampagne_navn";

const GRAENSE = 5000;

/**
 * PostgREST's svar når tabellen ikke findes. 42P01 er Postgres-koden;
 * beskeden nævner relationen. Koden tjekkes FØRST — en netværksfejl må
 * aldrig læses som «tabellen mangler», for så ville fladen sige «kør
 * migrationen» om et problem, der går over af sig selv.
 */
export function erUkendtTabel(fejl: { code?: string; message?: string } | null | undefined): boolean {
  if (!fejl) return false;
  if (typeof fejl.code === "string" && fejl.code !== "") return fejl.code === "42P01";
  const besked = fejl.message ?? "";
  return /does not exist/i.test(besked) && /relation/i.test(besked);
}

export interface Annonceforbrug {
  dage: Forbrugsdag[];
  annoncer: Annoncenavn[];
  tilstand: Forbrugstilstand;
}

const TOMT: Annonceforbrug = { dage: [], annoncer: [], tilstand: "mangler" };

/** bigint kommer som streng fra PostgREST — beløbet skal være et tal for dommen. */
function somDag(r: Record<string, unknown>): Forbrugsdag {
  return {
    ad_id: String(r.ad_id ?? ""),
    campaign_id: (r.campaign_id as string | null) ?? null,
    dato: String(r.dato ?? ""),
    valuta: String(r.valuta ?? ""),
    forbrug_oere: r.forbrug_oere === null || r.forbrug_oere === undefined ? 0 : Number(r.forbrug_oere),
  };
}

export async function hentAnnonceforbrug(): Promise<Annonceforbrug> {
  const dagSvar = await tabel("meta_annonce_dag").select(DAG_KOLONNER).order("dato", { ascending: false }).limit(GRAENSE);
  if (dagSvar.error) {
    if (erUkendtTabel(dagSvar.error)) return TOMT;
    throw new HentningsFejl("meta_annonce_dag", dagSvar.error.message || "ukendt fejl");
  }
  const dage = (kraevRaekker(dagSvar, "meta_annonce_dag") as Record<string, unknown>[]).map(somDag);

  // Navnene må gerne mangle: en annonce uden en beskrivelsesrække vises med
  // sit ad_id. Derfor fail-soft her, og ikke et kast — prisen er stadig sand.
  let annoncer: Annoncenavn[] = [];
  const navnSvar = await tabel("meta_annonce").select(ANNONCE_KOLONNER).limit(GRAENSE);
  if (navnSvar.error) {
    if (!erUkendtTabel(navnSvar.error)) console.error("[annonceforbrug] meta_annonce-opslag fejlede:", navnSvar.error.message);
  } else {
    annoncer = ((navnSvar.data ?? []) as Record<string, unknown>[]).map((r) => ({
      ad_id: String(r.ad_id ?? ""),
      campaign_id: (r.campaign_id as string | null) ?? null,
      navn: (r.navn as string | null) ?? null,
      kampagne_navn: (r.kampagne_navn as string | null) ?? null,
    }));
  }

  return { dage, annoncer, tilstand: dage.length === 0 ? "tom" : "har" };
}

/** Rådgivere alene — RLS ville ellers give tomme lister, der lignede «ingen annoncer». */
export function useAnnonceforbrug() {
  const { user, isAdvisor } = useAuth();
  return useQuery({
    queryKey: ANNONCEFORBRUG_KEY,
    enabled: !!user && isAdvisor === true,
    staleTime: 5 * 60 * 1000,
    queryFn: hentAnnonceforbrug,
  });
}
