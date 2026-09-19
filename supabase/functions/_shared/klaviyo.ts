/**
 * klaviyo — ÉN klient mod Klaviyos REST API (udkast 19/9-2026).
 *
 * DETTE ER LAG 2's FUNDAMENT, IKKE EN HÆNDELSESSENDER. Planen er fire lag:
 *   1. fakta agenten må stå på
 *   2. hændelser fra platformen til Klaviyo      ← denne fil + klaviyoHaendelser.ts
 *   3. en motor der kan LÆSE og SKRIVE i Klaviyo (flows, skabeloner, kampagner)
 *   4. agenten selv
 * Derfor er `kald` generisk over sti, metode og krop. Lag 3 skal kunne hente
 * `/api/flows/`, `/api/templates/` og `/api/campaigns/` uden at røre denne fil
 * — den eneste ændring bliver nye funktioner OVENPÅ, ikke inde i.
 *
 * MÅLT 19/9 i Klaviyos egen dokumentation (developers.klaviyo.com), ikke gættet:
 *
 *   Autentificering  `Authorization: Klaviyo-API-Key pk_…`   (privat nøgle, «pk_»-præfiks)
 *   Base             `https://a.klaviyo.com/api/{endpoint}/`
 *   Revision         headeren `revision`, formen «YYYY-MM-DD[.suffix]», aktuel 2026-07-15
 *   Hændelser        POST /api/events → **202 Accepted**, ikke 200: «validated and
 *                    submitted for processing, but does not guarantee that
 *                    processing is complete»
 *   Profil           findes på `profile.data.attributes.email`; findes den ikke,
 *                    OPRETTES den («create a new profile or update an existing
 *                    profile's properties») — vi skal altså ikke oprette selv
 *   Dubletter        `unique_id`: gentages den for samme profil og metric,
 *                    «only the first processed event will be recorded».
 *                    UDEN den falder Klaviyo tilbage på tid med sekundpræcision
 *                    — altså én hændelse pr. profil pr. sekund
 *   Loft             burst 350/s, vedvarende 3500/m
 *
 * REVISIONEN ER PINNET. Klaviyo versionerer på dato; en flydende revision ville
 * lade et API-skifte ændre vores adfærd uden en udrulning. Ændres tallet,
 * ændres det HER og ingen andre steder — samme regel som GRAPH_VERSION i
 * metaAnnoncer.ts.
 *
 * DENO-FRI MED VILJE: nøglen gives ind, ikke læst af `Deno.env` herinde. Så kan
 * hele filen prøves i vitest uden at trække Deno-globaler ind i tsc's graf —
 * den fælde kostede en halv time på cvrCache 19/9.
 *
 * KASTER ALDRIG. Hvert kald svarer et navngivet udfald. Et marketingværktøj må
 * aldrig kunne stoppe en ansøgning eller en betaling.
 */

/** Hele API'et hænger under denne. Lag 3 lægger nye stier til, ikke en ny base. */
export const KLAVIYO_BASE = "https://a.klaviyo.com/api";

/** Revisionen, pinnet. Målt aktuel 19/9-2026. */
export const KLAVIYO_REVISION = "2026-07-15";

/** Secret'en. Mangler den, sendes intet — og det er ikke en fejl (som Meta). */
export const KLAVIYO_SECRET = "KLAVIYO_API_KEY";

/** Privat nøgle starter med dette. Bruges til at fange en forbyttet offentlig nøgle. */
export const NOEGLE_PRAEFIKS = "pk_";

/**
 * Lofterne, målt. Vi er ikke i nærheden — tre hændelser pr. ansøgning er
 * ingenting mod 350/s. Tallene står her, fordi lag 3 kommer til at hente
 * lister, og dér begynder de at betyde noget.
 */
export const LOFT_BURST_PR_SEKUND = 350;
export const LOFT_VEDVARENDE_PR_MINUT = 3500;

/**
 * Hvor længe et kald må tage. KORT med vilje: kaldet sker synkront inde i en
 * ansøgning eller en betaling, og huset har ingen baggrundskø (`waitUntil`
 * bruges ingen steder, målt 19/9). Tre sekunder er loftet for, hvor meget
 * Klaviyo må forsinke en betaling i værste fald.
 */
export const TIMEOUT_MS = 3000;

export type KlaviyoUdfald =
  | "ok"
  | "ingen_noegle"
  /**
   * Der var ingen mailadresse at knytte profilen til, så kaldet blev aldrig
   * forsøgt. Tilføjet 19/9 kl. 22.30 efter at «Ansoegning paabegyndt» viste
   * sig at være strukturelt ustartbar UDEN at efterlade ét eneste spor:
   * `sendHvisMail` returnerede i tavshed, og nul rækker betød både «intet
   * skete» og «intet KUNNE ske». Diagnosen krævede en kodelæsning; med denne
   * række tager den ti sekunder.
   */
  | "ingen_mail"
  | "noegle_afvist"
  | "loft"
  | "ugyldig"
  | "fejl"
  | "timeout";

/**
 * Sporet efter ét kald — det der logges, og det lag 3's agent skal kunne læse
 * bagud. Bærer ALDRIG nøglen.
 */
export interface KlaviyoSpor {
  udfald: KlaviyoUdfald;
  metode: string;
  sti: string;
  status: number | null;
  /** Klaviyos svar, afkortet. Fejlbeskeder er korte; lister kan være enorme. */
  svar: string | null;
  /** Vores egen forklaring, når udfaldet ikke er «ok». */
  grund: string | null;
  varighed_ms: number;
}

export interface KlaviyoSvar<T = unknown> {
  ok: boolean;
  spor: KlaviyoSpor;
  /** Kroppen, læst som JSON når det kunne lade sig gøre. */
  krop: T | null;
}

const MAKS_SVAR_TEGN = 2000;

/** Læser et udfald af HTTP-statussen. 202 er hændelsernes «ok», ikke 200. */
export function udfaldAfStatus(status: number): KlaviyoUdfald {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "noegle_afvist";
  if (status === 429) return "loft";
  if (status === 400 || status === 422) return "ugyldig";
  return "fejl";
}

/** Er nøglen overhovedet brugbar? En offentlig nøgle her er en tavs fejl værd at fange. */
export function noeglenErBrugbar(noegle: string | null | undefined): boolean {
  return typeof noegle === "string" && noegle.trim().startsWith(NOEGLE_PRAEFIKS) && noegle.trim().length > NOEGLE_PRAEFIKS.length;
}

export interface KaldValg {
  metode?: "GET" | "POST" | "PATCH" | "DELETE";
  /** Kroppen som et objekt; serialiseres her, så alle kald ser ens ud. */
  krop?: unknown;
  /** Overstyr revisionen for ét kald — lag 3 kan have brug for en nyere. */
  revision?: string;
  timeoutMs?: number;
  /** Til prøver. Udelades i drift. */
  fetchImpl?: typeof fetch;
  nu?: () => number;
}

/**
 * Ét kald mod Klaviyo. KASTER ALDRIG.
 *
 * `sti` er alt efter basen, med skråstreg foran: «/events/», «/flows/».
 * Klaviyo bruger afsluttende skråstreg i dokumentationen, og vi gentager den,
 * så en 308-omdirigering aldrig bliver til en tavs fejl.
 */
export async function kald<T = unknown>(
  noegle: string | null | undefined,
  sti: string,
  valg: KaldValg = {},
): Promise<KlaviyoSvar<T>> {
  const metode = valg.metode ?? "GET";
  const ur = valg.nu ?? (() => Date.now());
  const start = ur();
  const spor = (udfald: KlaviyoUdfald, status: number | null, svar: string | null, grund: string | null): KlaviyoSvar<T> => ({
    ok: udfald === "ok",
    krop: null,
    spor: { udfald, metode, sti, status, svar, grund, varighed_ms: Math.max(0, ur() - start) },
  });

  if (!noeglenErBrugbar(noegle)) {
    return spor(
      "ingen_noegle",
      null,
      null,
      noegle ? `nøglen ser ikke ud som en privat nøgle (skal starte med ${NOEGLE_PRAEFIKS})` : `${KLAVIYO_SECRET} er ikke sat`,
    );
  }

  const f = valg.fetchImpl ?? fetch;
  const styring = new AbortController();
  const ur_id = setTimeout(() => styring.abort(), valg.timeoutMs ?? TIMEOUT_MS);
  try {
    const svar = await f(`${KLAVIYO_BASE}${sti}`, {
      method: metode,
      headers: {
        Authorization: `Klaviyo-API-Key ${(noegle as string).trim()}`,
        revision: valg.revision ?? KLAVIYO_REVISION,
        accept: "application/vnd.api+json",
        ...(valg.krop === undefined ? {} : { "content-type": "application/vnd.api+json" }),
      },
      body: valg.krop === undefined ? undefined : JSON.stringify(valg.krop),
      signal: styring.signal,
    });
    const tekst = await svar.text().catch(() => "");
    const udfald = udfaldAfStatus(svar.status);
    const resultat = spor(udfald, svar.status, tekst.slice(0, MAKS_SVAR_TEGN) || null, udfald === "ok" ? null : `HTTP ${svar.status}`);
    if (udfald === "ok" && tekst.trim() !== "") {
      try {
        resultat.krop = JSON.parse(tekst) as T;
      } catch {
        // 202 fra /events har tom krop. Det er ikke en fejl.
      }
    }
    return resultat;
  } catch (e) {
    const afbrudt = e instanceof Error && e.name === "AbortError";
    return spor(afbrudt ? "timeout" : "fejl", null, null, afbrudt ? `kaldet tog over ${valg.timeoutMs ?? TIMEOUT_MS} ms` : String(e).slice(0, 300));
  } finally {
    clearTimeout(ur_id);
  }
}
