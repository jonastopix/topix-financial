/**
 * Opret eller genbrug en virksomhed — den ENE vej ind i `companies`.
 *
 * HVORFOR DEN FINDES: to veje opretter virksomheder — rådgiverens import
 * fra /members (import-application) og Monday-godkendelsen
 * (monday-webhook) — og de må ikke drive fra hinanden. Målt 2/9
 * (recon-delt-oprettelse.md): nul tests på begge funktioner, intet
 * CI-værn der fanger en regression, og import-application har præcis én
 * kalder (Members.tsx:583). Så længe hver funktion bar sin egen kopi af
 * CVR-opslag, genbrugsregel og insert, var eneste bevis for at de gjorde
 * det samme en manuel import. Nu ligger IO'en her, rækken bygges af
 * motoren i ./virksomhedsraekke.ts (låst feltliste, paritetstestet mod
 * src/lib), og kalderne får tilbage hvad de skal svare med.
 *
 * Adfærden er ordret import-application trin 2-3 som den så ud 2/9:
 *   - CVR-opslag mod cvrapi.dk med husets User-Agent; svar der ikke er ok,
 *     svar med data.error og exceptions giver alle null — et manglende
 *     CVR-svar er aldrig en fejl, virksomheden oprettes så på det ansøgeren
 *     skrev.
 *   - Genbrug KUN når cvr_number er præcis otte cifre og der allerede
 *     findes en virksomhed på det CVR. Genbrugt navn er den eksisterende
 *     rækkes navn. Der slås ikke op i CVR ved genbrug.
 *   - Ellers: CVR-opslag → byggVirksomhedsRaekke → insert → id.
 *   - Fejler insert'en, KASTES der med en dansk fejltekst der bærer navn
 *     og CVR (samme mønster som companyHardDelete og agentSkriveveje).
 *     Kalderen oversætter til sit eget svar — import-application til 500,
 *     monday-webhook til sit.
 *
 * HJÆLPEREN SÆTTER ALDRIG KONTRAKTDATOER. contract_start_date og
 * contract_end_date findes hverken i VirksomhedsInput eller i rækken,
 * fordi tre uafhængige steder læser contract_end_date som «har betalt»:
 * hent_betalingstilbud (status 'betalt'), afgoerBetalingsfrist og useAuth
 * via computeMembershipTier (no_date → full). Monday-vejen MÅ ikke sætte
 * dem — kontrakten løber fra betalingsdagen og skrives af stripe-webhook.
 * import-application, som stadig tager datoer fra rådgiverens regneark,
 * sætter dem selv i en separat opdatering EFTER kaldet hertil. Var
 * datoerne en parameter her, ville den ene vej før eller siden sende dem
 * med, og betalingssiden ville sige «Tak — du er inde» før nogen betalte.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import {
  byggVirksomhedsRaekke,
  type CvrSvar,
  type VirksomhedsInput,
} from "./virksomhedsraekke.ts";

export type { CvrSvar, VirksomhedsInput };

export interface OpretResultat {
  company_id: string;
  company_name: string;
  genbrugt: boolean; // fandtes i forvejen på CVR
  cvr_svar: CvrSvar | null; // til kalderens svar/logning
}

/** Otte cifre, intet andet — det eneste CVR-format der slås op og genbruges på. */
const CVR_FORMAT = /^\d{8}$/;

/**
 * Slår et CVR-nummer op hos cvrapi.dk. Null ved alt der ikke er et gyldigt
 * svar — netværksfejl, ikke-ok status, ukendt CVR (data.error). Kalderen
 * skal kunne fortsætte uden svar.
 */
export async function hentCvrData(cvr: string): Promise<CvrSvar | null> {
  try {
    const resp = await fetch(
      `https://cvrapi.dk/api?country=dk&search=${cvr}`,
      {
        headers: {
          "User-Agent": "TheboardroomDK/1.0 (kontakt@theboardroom.dk)",
        },
      },
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.error) return null;
    return {
      name: data.name || undefined,
      founded: data.startdate || undefined,
      industry_code: data.industrycode ? String(data.industrycode) : undefined,
      industry_label: data.industrydesc || undefined,
    };
  } catch (err) {
    console.warn("[virksomhedsOprettelse] CVR lookup failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function opretEllerGenbrugVirksomhed(
  input: VirksomhedsInput,
  adminClient: SupabaseClient,
): Promise<OpretResultat> {
  const cvr = input.cvr_number && CVR_FORMAT.test(input.cvr_number) ? input.cvr_number : null;

  // Genbrug: findes der allerede en virksomhed på CVR'et, er det den —
  // uanset hvad ansøgningen ellers bærer. Navnet er rækkens, og der slås
  // ikke op i CVR igen.
  if (cvr) {
    const { data: eksisterende } = await adminClient
      .from("companies")
      .select("id, name")
      .eq("cvr_number", cvr)
      .maybeSingle();
    if (eksisterende) {
      return {
        company_id: eksisterende.id,
        company_name: eksisterende.name || input.company_name,
        genbrugt: true,
        cvr_svar: null,
      };
    }
  }

  // Oprettelse: CVR-opslag når formatet er gyldigt, ellers uden.
  let cvrSvar: CvrSvar | null = null;
  if (cvr) {
    cvrSvar = await hentCvrData(cvr);
    if (cvrSvar) {
      console.log(`[virksomhedsOprettelse] CVR ${cvr} → ${cvrSvar.name}, founded: ${cvrSvar.founded}`);
    } else {
      console.warn(`[virksomhedsOprettelse] CVR ${cvr} lookup returned no data`);
    }
  }

  const raekke = byggVirksomhedsRaekke(input, cvrSvar);
  const navn = raekke.name as string;

  const { data: company, error: companyErr } = await adminClient
    .from("companies")
    .insert(raekke)
    .select("id")
    .single();

  if (companyErr || !company) {
    console.error("[virksomhedsOprettelse] Failed to create company:", companyErr, "payload:", {
      name: navn, cvr: input.cvr_number ?? null, start_date: raekke.start_date,
    });
    throw new Error(
      `Kunne ikke oprette virksomheden «${navn}» (CVR ${input.cvr_number || "ukendt"}): ${companyErr?.message || "Ukendt fejl"}`,
    );
  }

  return {
    company_id: company.id,
    company_name: navn,
    genbrugt: false,
    cvr_svar: cvrSvar,
  };
}
