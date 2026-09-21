/**
 * metaSendAfsendelse — det ENESTE sted, Conversions API-tokenet læses og Meta kaldes
 * (udkast 21/9-2026). Secret-navnet er META_SEND_TOKEN (metaSend.ts) — et NYT navn, der
 * ikke kolliderer: META_CAPI_TOKEN bærer i dag annoncehentningens ads_read-token som
 * nødnavn (metaAdsToken.ts), og META_ADS_TOKEN er Marketing API'ets rigtige navn. Værnet
 * metaTokenAdskillelse.guard dom 6 låser, at disse filer aldrig nævner de to, og at
 * metaAdsToken.ts aldrig nævner META_SEND_TOKEN.
 *
 * POST https://graph.facebook.com/{version}/{dataset}/events med { data: [payload],
 * access_token, test_event_code? } — tokenet i kroppen, aldrig i URL'en (logs). Én
 * hændelse pr. kald («If any event you send in a batch is invalid, we reject the entire
 * batch»). Timeout 8 s. KASTER ALDRIG — svaret er et udfald til sporet.
 */
import { doemMetaSvar, META_API_VERSION, META_DATASET_ID, META_SEND_TOKEN_NAVN, META_TIMEOUT_MS, type MetaPayload, type SporUdfald } from "./metaSend.ts";

export interface Afsendelse {
  udfald: SporUdfald;
  status: number | null;
  events_received: number | null;
  fejl: string | null;
  /** Svarets første 300 tegn — til sporet. Aldrig tokenet. */
  svar: string | null;
  varighed_ms: number;
}

export async function sendTilMeta(payload: MetaPayload, testEventCode: string | null): Promise<Afsendelse> {
  const start = Date.now();
  const token = (Deno.env.get(META_SEND_TOKEN_NAVN) ?? "").trim();
  if (!token) return { udfald: "ingen_noegle", status: null, events_received: null, fejl: `${META_SEND_TOKEN_NAVN} mangler`, svar: null, varighed_ms: 0 };
  const krop: Record<string, unknown> = { data: [payload], access_token: token };
  if (testEventCode) krop.test_event_code = testEventCode;
  const url = `https://graph.facebook.com/${META_API_VERSION}/${META_DATASET_ID}/events`;
  const styring = new AbortController();
  const vaekkeur = setTimeout(() => styring.abort(), META_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "POST", signal: styring.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(krop) });
    const tekst = await res.text();
    const dom = doemMetaSvar(res.status, tekst);
    return { udfald: dom.udfald, status: res.status, events_received: dom.events_received, fejl: dom.fejl, svar: tekst.slice(0, 300), varighed_ms: Date.now() - start };
  } catch (err) {
    const timeout = err instanceof DOMException && err.name === "AbortError";
    return { udfald: timeout ? "timeout" : "fejl", status: null, events_received: null, fejl: timeout ? `ingen svar inden ${META_TIMEOUT_MS} ms` : (err instanceof Error ? err.message : String(err)), svar: null, varighed_ms: Date.now() - start };
  } finally {
    clearTimeout(vaekkeur);
  }
}
