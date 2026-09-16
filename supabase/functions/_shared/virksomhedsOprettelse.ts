/**
 * Opret eller genbrug en virksomhed — den ENE vej ind i `companies`.
 *
 * HVORFOR DEN FINDES: to veje opretter virksomheder — rådgiverens import
 * fra /virksomheder (import-application) og Monday-godkendelsen
 * (monday-webhook) — og de må ikke drive fra hinanden. Målt 2/9
 * (recon-delt-oprettelse.md): nul tests på begge funktioner, intet
 * CI-værn der fanger en regression, og import-application har præcis én
 * kalder. Så længe hver funktion bar sin egen kopi af CVR-opslag,
 * genbrugsregel og insert, var eneste bevis for at de gjorde det samme en
 * manuel import. Nu ligger IO'en her, rækken bygges af motoren i
 * ./virksomhedsraekke.ts (låst feltliste, paritetstestet mod src/lib), og
 * kalderne får tilbage hvad de skal svare med.
 *
 * Adfærden (trin 2-3 fra 2/9; CVR-kilden skiftet 16/9):
 *   - CVR-opslag mod DataCVR (datacvrapi.dk) med nøgle — slaaCvrOp
 *     nedenfor; tolkningen er ren i ./cvrOpslag.ts. Opslaget svarer et
 *     UDFALD (fundet, findes_ikke, graense, fejl, noegle_mangler), som
 *     kalderen får med i OpretResultat.cvr_udfald. Kun «fundet» bærer et
 *     svar; alle andre udfald giver en virksomhed oprettet på det
 *     ansøgeren skrev — et manglende CVR-svar er aldrig en fejl for
 *     oprettelsen, men det er ikke længere tavst (fund 6 og 13, 14/9:
 *     cvrapi.dk gav QUOTA_EXCEEDED fra edge-runtimen, og «findes ikke» og
 *     «kvote brugt» var samme null).
 *   - Genbrug KUN når cvr_number er præcis otte cifre og der allerede
 *     findes en virksomhed på det CVR. Genbrugt navn er den eksisterende
 *     rækkes navn. Der slås ikke op i CVR ved genbrug (cvr_udfald null).
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
import { dataCvrUrl, tolkDataCvrSvar, type CvrOpslag } from "./cvrOpslag.ts";

export type { CvrSvar, VirksomhedsInput };
export type { CvrOpslag };

export interface OpretResultat {
  company_id: string;
  company_name: string;
  genbrugt: boolean; // fandtes i forvejen på CVR
  cvr_svar: CvrSvar | null; // til kalderens svar/logning
  /** Opslagets udfald — null når der intet gyldigt CVR er, og ved genbrug (intet opslag). */
  cvr_udfald: CvrOpslag["udfald"] | null;
}

/** Otte cifre, intet andet — det eneste CVR-format der slås op og genbruges på. */
const CVR_FORMAT = /^\d{8}$/;

/** Timeout på opslaget (aiGatewayFetch-mønstret: AbortController + setTimeout). DataCVR svarede på ~900 ms målt 16/9. */
const OPSLAG_TIMEOUT_MS = 8000;

/** Husets User-Agent mod DataCVR — hvem vi er, og hvor man skriver. */
const CVR_USER_AGENT = "The Boardroom - medlemsplatform - kontakt@theboardroom.dk";

/**
 * Slår et CVR-nummer op hos DataCVR og svarer et udfald — kaster aldrig.
 * Nøglen læses INDE i funktionen (secret DATACVR_API_KEY), og mangler den,
 * logges det og udfaldet er noegle_mangler — som husets
 * INVITATION_AFSENDER_USER_ID-mønster (sikrIndgangsInvitation.ts).
 * Nøglen, headerne og Authorization står ALDRIG i en log.
 */
export async function slaaCvrOp(cvr: string): Promise<CvrOpslag> {
  const noegle = Deno.env.get("DATACVR_API_KEY")?.trim();
  if (!noegle) {
    console.error("[virksomhedsOprettelse] DATACVR_API_KEY mangler — CVR-opslag springes over");
    return { udfald: "noegle_mangler" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPSLAG_TIMEOUT_MS);
  let opslag: CvrOpslag;
  try {
    const resp = await fetch(dataCvrUrl(cvr), {
      headers: {
        Authorization: `Bearer ${noegle}`,
        Accept: "application/json",
        "User-Agent": CVR_USER_AGENT,
      },
      signal: controller.signal,
    });
    let body: unknown = null;
    try {
      body = await resp.json();
    } catch {
      body = null; // ugyldig eller tom JSON — tolkningen dømmer på status alene
    }
    opslag = tolkDataCvrSvar(resp.status, body);
  } catch (err) {
    const afbrudt = err instanceof DOMException && err.name === "AbortError";
    opslag = {
      udfald: "fejl",
      grund: afbrudt ? `timeout efter ${OPSLAG_TIMEOUT_MS / 1000} s` : err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }

  if (opslag.udfald !== "fundet") {
    const grund = opslag.udfald === "fejl" ? ` — ${opslag.grund}` : "";
    console.warn(`[virksomhedsOprettelse] CVR ${cvr}: opslag ${opslag.udfald}${grund}`);
  }
  return opslag;
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
        cvr_udfald: null,
      };
    }
  }

  // Oprettelse: CVR-opslag når formatet er gyldigt, ellers uden.
  let cvrSvar: CvrSvar | null = null;
  let cvrUdfald: CvrOpslag["udfald"] | null = null;
  if (cvr) {
    const opslag = await slaaCvrOp(cvr);
    cvrUdfald = opslag.udfald;
    cvrSvar = opslag.udfald === "fundet" ? opslag.svar : null;
    if (cvrSvar) {
      console.log(`[virksomhedsOprettelse] CVR ${cvr} → ${cvrSvar.name}, founded: ${cvrSvar.founded}`);
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
    cvr_udfald: cvrUdfald,
  };
}
