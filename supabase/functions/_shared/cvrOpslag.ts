/**
 * supabase/functions/_shared/cvrOpslag.ts
 *
 * Den RENE tolkning af et svar fra CVR-kilden — ingen Deno, ingen fetch,
 * ingen URL-imports, så vitest kan importere filen direkte (som
 * berigelse.test.ts gør med _shared/berigelse.ts). Selve opslaget (nøgle,
 * fetch, timeout, log) bor i virksomhedsOprettelse.ts' slaaCvrOp.
 *
 * HVORFOR KILDEN SKIFTEDE (16/9-2026): cvrapi.dk begrænser pr. IP-interval,
 * og Supabases edge-runtime deler IP med fremmede — importen af Nordic By
 * Hand 14/9 fik QUOTA_EXCEEDED fra edge-runtimen, mens samme CVR svarede 200
 * fra Jonas' maskine tre minutter før (OVERLEVERING DEL 2 «14. september»
 * fund 6). Og «findes ikke» og «kvote brugt» blev til SAMME null i den gamle
 * hentCvrData, så hverken loggen, berigelsen eller rådgiverens kvittering
 * kunne skelne dem (fund 13 — YKRG's transponerede CVR blev talt som «uden
 * svar» hver kørsel). Kilden er nu DataCVR (datacvrapi.dk) med nøgle
 * (secret DATACVR_API_KEY), og svaret tolkes her til et navngivet udfald,
 * som kalderne kan handle på: fundet, findes_ikke, graense, fejl,
 * noegle_mangler.
 *
 * MÅLT 16/9 i DataCVR's dashboard (ikke i vores kode): GET
 * /api/v2/dk/company/{cvr} med «Authorization: Bearer <nøgle>». 200 med
 * flade felter med SAMME navne som cvrapi — name, address, zipcode, city,
 * industrycode (tal), industrydesc, startdate («2026-04-17») — plus mange
 * ekstra felter, bl.a. owners[] med personnavne, som ALDRIG må komme med
 * her. 404 med body {"error": "NOT_FOUND", "message": "Virksomhed med CVR
 * … blev ikke fundet"}. 429 ved grænse ifølge dokumentationen (ikke målt).
 * Gratis plan: 25 opslag pr. dag pr. nøgle.
 *
 * MAPPINGEN er præcis den det gamle hentCvrData havde (før 16/9): kun CvrSvar's syv felter
 * (virksomhedsraekke.ts, uændret), samme «|| undefined»- og String()-regler.
 * Intet andet felt fra svaret kommer med — raw_cvr_data i
 * application_context bærer derfor stadig kun de syv.
 */
import type { CvrSvar } from "./virksomhedsraekke.ts";

export type CvrOpslag =
  | { udfald: "fundet"; svar: CvrSvar }
  | { udfald: "findes_ikke" }
  | { udfald: "graense" }
  | { udfald: "fejl"; grund: string }
  | { udfald: "noegle_mangler" };

export type CvrUdfald = CvrOpslag["udfald"];

/** DataCVR's endpoint for ét CVR-nummer (dansk register, v2). */
export const DATACVR_BASE_URL = "https://datacvrapi.dk/api/v2/dk/company";

/** URL'en til opslaget: basen + CVR-nummeret, trimmet og URL-kodet. */
export function dataCvrUrl(cvr: string): string {
  return `${DATACVR_BASE_URL}/${encodeURIComponent(cvr.trim())}`;
}

function erObjekt(body: unknown): body is Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

/** body.error som tekst — null når body ikke er et objekt med et sat error-felt. */
function fejlfelt(body: unknown): string | null {
  if (!erObjekt(body)) return null;
  const e = body.error;
  return e === undefined || e === null || e === "" ? null : String(e);
}

/**
 * HTTP-status + parset body → udfald. Ren funktion; ingen af grundene
 * bærer noget fra request-headerne.
 */
export function tolkDataCvrSvar(status: number, body: unknown): CvrOpslag {
  if (status === 200) {
    if (!erObjekt(body)) return { udfald: "fejl", grund: "HTTP 200 uden et objekt som svar" };
    const e = fejlfelt(body);
    if (e !== null) return { udfald: "fejl", grund: `HTTP 200 med error=${e}` };
    const d = body;
    return {
      udfald: "fundet",
      svar: {
        name: (d.name || undefined) as string | undefined,
        founded: (d.startdate || undefined) as string | undefined,
        industry_code: d.industrycode ? String(d.industrycode) : undefined,
        industry_label: (d.industrydesc || undefined) as string | undefined,
        address: d.address ? String(d.address) : undefined,
        zipcode: d.zipcode ? String(d.zipcode) : undefined,
        city: d.city ? String(d.city) : undefined,
      },
    };
  }
  if (status === 404) {
    const e = fejlfelt(body);
    if (e === "NOT_FOUND") return { udfald: "findes_ikke" };
    return { udfald: "fejl", grund: e ? `HTTP 404: ${e}` : "HTTP 404" };
  }
  if (status === 429) return { udfald: "graense" };
  if (status === 401 || status === 403) return { udfald: "fejl", grund: `nøglen blev afvist (HTTP ${status})` };
  const e = fejlfelt(body);
  return { udfald: "fejl", grund: e ? `HTTP ${status}: ${e}` : `HTTP ${status}` };
}
