/**
 * Webinarfladens I/O (udkast 19/9-2026). Hook = I/O, lib = dom: alle tal og
 * ord er src/lib/webinar/dashboard.ts's — her hentes kun.
 *
 * TO OPSLAG, ét svar:
 *   webinar_tilmeldinger  — alle rækker (rådgivere har SELECT; migration
 *                           20260919130000 + 20260919150000).
 *   ansoegninger          — mailen, indsendt_at, trin og company_id, og kun
 *                           de indsendte. Koblingen er mailen (begge lower),
 *                           som hooks/webinar.ts's opslag pr. mail.
 *   companies             — ét opslag på contract_end_date for de virksomheder,
 *                           ansøgningerne blev til. Det er dér «blev medlem»
 *                           afgøres (husets blevMedlem: underskrevet OG
 *                           slutdato, altså betalt) — nøjagtig som
 *                           hooks/ansoegninger.ts gør det. Fail-soft: fejler
 *                           opslaget, er tallene stadig hele, og de
 *                           underskrevne står bare som ikke-medlemmer endnu.
 *
 * ANNONCESPORET KAN MANGLE, OG DET MÅ IKKE VÆLTE SIDEN. Kolonnerne
 * (utm_*, fbclid, referrer, …) kommer med migration 20260919150000. Er den
 * ikke kørt i Lovable endnu, svarer PostgREST 42703 «column … does not
 * exist» på HELE select'en — også på de kolonner der findes. Derfor prøver
 * hentningen den fulde liste FØRST og falder tilbage til grundkolonnerne,
 * når og kun når fejlen er netop den. `sporKolonnerFindes` bærer svaret
 * videre til dommen, som siger det i klartekst på fladen.
 *
 * Det er bevidst en PRØVE og ikke en konfiguration: siden skal blive rigtig
 * af sig selv i samme sekund migrationen er kørt, uden en ny udrulning.
 *
 * kraevRaekker-mønstret (recon-tavse-fejl.md): begge opslag kaster med
 * kildens navn, så en fejl bliver isError og ikke «der er ingen tilmeldte».
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { HentningsFejl, kraevRaekker } from "@/lib/kraevRaekker";
import { TILMELDING_KOLONNER } from "@/hooks/webinar";
import { erUkendtKolonne, medAnnoncespor, udenAnnoncespor } from "@/lib/webinar/kolonner";
import type { AnsoegerMail, Tilmelding } from "@/lib/webinar/dashboard";

/* eslint-disable @typescript-eslint/no-explicit-any */
const tabel = (navn: string) => supabase.from(navn as any) as any;

export const WEBINAR_DASHBOARD_KEY = ["webinar", "dashboard"] as const;

/** numeric kommer som streng fra PostgREST — tallet skal være et tal for dommen. */
function somRaekke(r: Record<string, unknown>): Tilmelding {
  const p = r.set_procent;
  return { ...(r as unknown as Tilmelding), set_procent: p === null || p === undefined ? null : Number(p) };
}

export interface WebinarDashboardData {
  tilmeldinger: Tilmelding[];
  ansoegninger: AnsoegerMail[];
  sporKolonnerFindes: boolean;
}

const GRAENSE = 5000;

/** Tilmeldingerne + svaret på om annoncespor-kolonnerne findes. Kaster ved enhver anden fejl. */
export async function hentTilmeldingerMedSpor(): Promise<{ raekker: Tilmelding[]; sporKolonnerFindes: boolean }> {
  const q = (kolonner: string) =>
    tabel("webinar_tilmeldinger").select(kolonner).order("session_tid", { ascending: false, nullsFirst: false }).limit(GRAENSE);

  const fuld = await q(medAnnoncespor(TILMELDING_KOLONNER));
  if (!fuld.error) {
    return { raekker: (kraevRaekker(fuld, "webinar_tilmeldinger") as Record<string, unknown>[]).map(somRaekke), sporKolonnerFindes: true };
  }
  // Enhver ANDEN fejl er en rigtig fejl — kast med kildens navn frem for at
  // hente igen uden sporet og aflevere et halvt svar der ligner et helt.
  if (!erUkendtKolonne(fuld.error)) throw new HentningsFejl("webinar_tilmeldinger", fuld.error.message || "ukendt fejl");
  const grund = await q(udenAnnoncespor(TILMELDING_KOLONNER));
  return { raekker: (kraevRaekker(grund, "webinar_tilmeldinger") as Record<string, unknown>[]).map(somRaekke), sporKolonnerFindes: false };
}

/**
 * De INDSENDTE ansøgninger — koblingen, tiden og «blev medlem». Kladder
 * hentes aldrig. Virksomhedernes slutdato hentes i ET opslag bagefter
 * (samme form som hooks/ansoegninger.ts), og fejler DET opslag, kastes der
 * ikke: tallene er stadig hele, «blev medlem» er bare 0 indtil videre.
 */
export async function hentAnsoegerMails(): Promise<AnsoegerMail[]> {
  const res = await tabel("ansoegninger")
    .select("email, indsendt_at, trin, company_id")
    .not("indsendt_at", "is", null)
    .limit(GRAENSE);
  const raekker = (kraevRaekker(res, "ansoegninger") as Record<string, unknown>[])
    .map((r) => ({
      email: String(r.email ?? "").trim().toLowerCase(),
      indsendt_at: (r.indsendt_at as string | null) ?? null,
      trin: (r.trin as AnsoegerMail["trin"]) ?? "ny",
      company_id: (r.company_id as string | null) ?? null,
    }))
    .filter((a) => a.email !== "");

  const ids = [...new Set(raekker.map((r) => r.company_id).filter((id): id is string => !!id))];
  const slutdatoer = new Map<string, string | null>();
  if (ids.length > 0) {
    const vRes = await tabel("companies").select("id, contract_end_date").in("id", ids);
    if (vRes.error) console.error("[webinar] companies-opslag til «blev medlem» fejlede:", vRes.error.message);
    for (const v of (vRes.data ?? []) as { id: string; contract_end_date: string | null }[]) slutdatoer.set(v.id, v.contract_end_date);
  }
  return raekker.map(({ company_id, ...r }) => ({
    ...r,
    virksomhed_slutdato: company_id ? (slutdatoer.get(company_id) ?? null) : null,
  }));
}

/** Begge opslag parallelt. Rådgivere alene — RLS ville ellers give tomme lister. */
export function useWebinarDashboard() {
  const { user, isAdvisor } = useAuth();
  return useQuery({
    queryKey: WEBINAR_DASHBOARD_KEY,
    enabled: !!user && isAdvisor === true,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<WebinarDashboardData> => {
      const [tilmeldinger, ansoegninger] = await Promise.all([hentTilmeldingerMedSpor(), hentAnsoegerMails()]);
      return { tilmeldinger: tilmeldinger.raekker, sporKolonnerFindes: tilmeldinger.sporKolonnerFindes, ansoegninger };
    },
  });
}
