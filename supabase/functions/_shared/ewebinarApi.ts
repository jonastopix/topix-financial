/**
 * ewebinarApi — platformens ene eWebinar-REST-klient (udkast 19/9-2026,
 * ~/Downloads/udkast-ewebinar-import/README.md). Bruges af engangsimporten
 * `ewebinar-import`; webhooken (`ewebinar-webhook`) rører den ikke.
 *
 * NØGLEN er `EWEBINAR_API_KEY` — Profil → Integrations → REST API i eWebinar.
 * Den er TEAM-SCOPED og «equivalent to a user login for your team» (deres
 * egne ord i help/rest-api-v2): den må kun stå i Lovable-secrets, aldrig i
 * repoet, aldrig i frontend. Mangler den, kastes `EwebinarFejl(503)` med en
 * læselig besked — funktionen siger pænt fra i stedet for at kaste 500.
 *
 * BASEN ER MÅLT (19/9, uautentificerede kald):
 *   https://api.ewebinar.com/v2/registrants      → 403 «Unauthorized»  ← API'ets EGET svar
 *   https://api.ewebinar.com/api/v2/registrants  → 403 nginx-HTML      ← rammer ikke API'et
 * OpenAPI-spec'en (api.ewebinar.com/docs/openapi.json, «eWebinar API 2.0.0»)
 * har server `https://api.ewebinar.com` og paths `/v2/...`, hvilket stemmer.
 * Hjælpeartiklen help/rest-api-v2 viser derimod `/api/v2/webinars` i sit
 * curl-eksempel. Derfor: `/v2` er standard, og `EWEBINAR_API_BASE` kan
 * overstyre uden en ny udrulning, hvis målingen mod den rigtige nøgle viser
 * noget andet.
 *
 * PAGINERINGEN er `nextCursor` ind og ud (spec'en: «Cursor for the next
 * page. `null` when there are no more results.»). Der er INGEN dokumenteret
 * rate limit — derfor en pause mellem sider og et loft på antal sider, som
 * berig-virksomheder gør mod DataCVR.
 *
 * INGEN Deno- eller Supabase-afhængighed: `fetchFn` og env-opslaget gives
 * ind, så hele klienten kan køres i vitest uden netværk og uden Deno-globals
 * (src/lib/__tests__/ewebinarApi.test.ts). `Deno.env.get` står ét sted — i
 * ewebinar-import/index.ts, som er den eneste kalder.
 */

export const EWEBINAR_BASE_STANDARD = "https://api.ewebinar.com/v2";
/** Ét hængende kald må ikke låse importen (samme form som calendlyApi/DataCVR). */
export const EWEBINAR_TIMEOUT_MS = 20000;
/** Ingen dokumenteret grænse pr. sekund — vi er varsomme mellem sider. */
export const PAUSE_MS = 400;
/** Loft pr. kørsel. 330 tilmeldte er få sider; 200 sider er rigeligt og stopper en løbsk markør. */
export const MAKS_SIDER = 200;

export class EwebinarFejl extends Error {
  readonly status: number;
  constructor(status: number, besked: string) {
    super(besked);
    this.name = "EwebinarFejl";
    this.status = status;
  }
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface ApiOpsaetning {
  noegle: string;
  base?: string;
  fetchFn?: FetchFn;
  pauseMs?: number;
  maksSider?: number;
}

/** Opslag i miljøet. Kalderen giver `(n) => Deno.env.get(n)` ind. */
export type EnvOpslag = (navn: string) => string | undefined;

export const NOEGLE_MANGLER_BESKED =
  "EWEBINAR_API_KEY mangler. Sæt den i Lovable → Edge functions → Secrets; nøglen hentes i eWebinar under Profil → Integrations → REST API (klik kopi-ikonet).";

/** Nøglen fra miljøet. Kaster EwebinarFejl(503) med en besked der siger hvor den findes. */
export function hentNoegle(env: EnvOpslag): string {
  const k = env("EWEBINAR_API_KEY")?.trim();
  if (!k) throw new EwebinarFejl(503, NOEGLE_MANGLER_BESKED);
  return k;
}

/** Basen — den målte `/v2`, med mulighed for at overstyre uden ny udrulning. */
export function hentBase(env: EnvOpslag): string {
  return env("EWEBINAR_API_BASE")?.trim().replace(/\/+$/, "") || EWEBINAR_BASE_STANDARD;
}

const sov = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function kald<T>(sti: string, o: ApiOpsaetning): Promise<T> {
  const base = (o.base ?? EWEBINAR_BASE_STANDARD).replace(/\/+$/, "");
  const url = `${base}${sti}`;
  const doFetch = o.fetchFn ?? fetch;
  const styring = new AbortController();
  const vaekkeur = setTimeout(() => styring.abort(), EWEBINAR_TIMEOUT_MS);
  let res: Response;
  try {
    res = await doFetch(url, {
      signal: styring.signal,
      headers: { Authorization: `Bearer ${o.noegle}`, accept: "application/json" },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new EwebinarFejl(504, `eWebinar svarede ikke inden ${EWEBINAR_TIMEOUT_MS / 1000} s på ${sti}`);
    }
    throw new EwebinarFejl(502, `eWebinar kunne ikke nås på ${sti}: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(vaekkeur);
  }

  if (!res.ok) {
    const krop = (await res.text().catch(() => "")).slice(0, 400);
    if (res.status === 401 || res.status === 403) {
      throw new EwebinarFejl(res.status, `eWebinar afviste nøglen (${res.status}) på ${sti}. Er EWEBINAR_API_KEY den rigtige, og er den rotéret siden? Svar: ${krop}`);
    }
    if (res.status === 404) {
      throw new EwebinarFejl(404, `eWebinar kender ikke ${url} (404). Prøv EWEBINAR_API_BASE = https://api.ewebinar.com/api/v2 (hjælpeartiklens form). Svar: ${krop}`);
    }
    if (res.status === 429) {
      throw new EwebinarFejl(429, `eWebinar satte grænsen (429) på ${sti}. Vent og kør igen — importen er idempotent. Svar: ${krop}`);
    }
    throw new EwebinarFejl(res.status, `eWebinar svarede ${res.status} på ${sti}: ${krop}`);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new EwebinarFejl(502, `eWebinars svar på ${sti} var ikke JSON.`);
  }
}

export interface SideSvar<T> {
  raekker: T[];
  nextCursor: string | null;
}

/** Ét kald til en liste-endpoint (sti INKL. query); feltnavnet er forskelligt pr. ressource. */
async function hentSide(stiMedQuery: string, felt: string, o: ApiOpsaetning): Promise<SideSvar<Record<string, unknown>>> {
  const svar = await kald<Record<string, unknown>>(stiMedQuery, o);
  const raa = svar[felt];
  const raekker = Array.isArray(raa) ? (raa as Record<string, unknown>[]) : [];
  const naeste = svar.nextCursor;
  return { raekker, nextCursor: typeof naeste === "string" && naeste !== "" ? naeste : null };
}

export interface HentAlleUdfald {
  raekker: Record<string, unknown>[];
  sider: number;
  /** true når loftet stoppede os før markøren var tom — så mangler der data. */
  afkortet: boolean;
}

/**
 * Alle sider af en liste-endpoint. `updatedSince` gives kun med på første
 * kald (markøren bærer filteret videre). Uden `updatedSince` hentes ALT —
 * det er engangsimportens tilstand: også tidligere webinarer, så historikken
 * kommer med.
 */
export async function hentAlleSider(sti: string, felt: string, o: ApiOpsaetning, updatedSince?: string | null): Promise<HentAlleUdfald> {
  const maks = o.maksSider ?? MAKS_SIDER;
  const pause = o.pauseMs ?? PAUSE_MS;
  const alle: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  let sider = 0;
  const sete = new Set<string>();
  for (;;) {
    const foerste = sider === 0;
    const q = new URLSearchParams();
    if (cursor) q.set("nextCursor", cursor);
    if (foerste && updatedSince) q.set("updatedSince", updatedSince);
    const side: SideSvar<Record<string, unknown>> = await hentSide(`${sti}${q.toString() ? `?${q}` : ""}`, felt, o);
    alle.push(...side.raekker);
    sider++;
    if (!side.nextCursor) return { raekker: alle, sider, afkortet: false };
    // Et API der giver samme markør igen ville løbe i ring — stop hellere.
    if (sete.has(side.nextCursor)) return { raekker: alle, sider, afkortet: true };
    sete.add(side.nextCursor);
    if (sider >= maks) return { raekker: alle, sider, afkortet: true };
    cursor = side.nextCursor;
    if (pause > 0) await sov(pause);
  }
}

/** Alle registranter (alle webinarer, alle sessioner). `updatedSince` er valgfri. */
export function hentAlleRegistranter(o: ApiOpsaetning, updatedSince?: string | null): Promise<HentAlleUdfald> {
  return hentAlleSider("/registrants", "registrants", o, updatedSince);
}

/** Alle webinarer inkl. kladder (spec: «Use this to discover draft-only webinars»). Fail-soft hos kalderen. */
export function hentAlleWebinarer(o: ApiOpsaetning): Promise<HentAlleUdfald> {
  return hentAlleSider("/all-webinars", "webinars", o);
}

/** Én registrant — MÅLINGEN (§2 i README): hele objektet, som API'et sender det. */
export function hentRegistrant(id: string, o: ApiOpsaetning): Promise<Record<string, unknown>> {
  return kald<Record<string, unknown>>(`/registrants/${encodeURIComponent(id)}`, o);
}
