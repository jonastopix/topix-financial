/**
 * gaSendAfsendelse — det ENESTE sted, Measurement Protocol-nøglen læses og Google kaldes
 * (udkast 21/9-2026). Secret-navnet er GA4_SEND_SECRET (gaSend.ts) — bevidst IKKE
 * GA4_API_SECRET, som er navnet i SITETS eget repo (~/Projekter/theboardroom-topix,
 * ga4-track/index.ts:16, recon-ga4.md §2.4). To projekter, to secrets, to livscyklusser:
 * sitets funktion har ingen kalder, og vi vil kunne trække vores egen nøgle tilbage uden
 * at røre deres. Værnet gaSend.guard dom 1 låser, at navnet kun læses her.
 *
 * POST https://region1.google-analytics.com/mp/collect?measurement_id=…&api_secret=…
 * (EU-værten, Googles egen sætning — se gaSend.ts). Med debug: /debug/mp/collect, som
 * svarer med validationMessages og IKKE lander i rapporter. api_secret står i URL'ens
 * query, som Google foreskriver — derfor logges URL'en aldrig, kun stien.
 *
 * Timeout 8 s. KASTER ALDRIG — svaret er et udfald til sporet.
 */
import { doemGaSvar, GA_DEBUG_STI, GA_HOST, GA_MEASUREMENT_ID, GA_SEND_SECRET_NAVN, GA_STI, GA_TIMEOUT_MS, type GaPayload, type SporUdfald, type Valideringsbesked } from "./gaSend.ts";

export interface Afsendelse {
  udfald: SporUdfald;
  status: number | null;
  validering: Valideringsbesked[] | null;
  fejl: string | null;
  /** Svarets første 300 tegn — til sporet. Aldrig nøglen. */
  svar: string | null;
  varighed_ms: number;
}

export async function sendTilGa(payload: GaPayload, debug: boolean): Promise<Afsendelse> {
  const start = Date.now();
  const secret = (Deno.env.get(GA_SEND_SECRET_NAVN) ?? "").trim();
  if (!secret) return { udfald: "ingen_noegle", status: null, validering: null, fejl: `${GA_SEND_SECRET_NAVN} mangler`, svar: null, varighed_ms: 0 };
  const url = `https://${GA_HOST}${debug ? GA_DEBUG_STI : GA_STI}?measurement_id=${encodeURIComponent(GA_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(secret)}`;
  const styring = new AbortController();
  const vaekkeur = setTimeout(() => styring.abort(), GA_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "POST", signal: styring.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const tekst = await res.text();
    const dom = doemGaSvar(res.status, tekst, debug);
    return { udfald: dom.udfald, status: res.status, validering: dom.validering, fejl: dom.fejl, svar: tekst.slice(0, 300), varighed_ms: Date.now() - start };
  } catch (err) {
    const timeout = err instanceof DOMException && err.name === "AbortError";
    return { udfald: timeout ? "timeout" : "fejl", status: null, validering: null, fejl: timeout ? `intet svar inden ${GA_TIMEOUT_MS} ms` : (err instanceof Error ? err.message : String(err)), svar: null, varighed_ms: Date.now() - start };
  } finally {
    clearTimeout(vaekkeur);
  }
}
