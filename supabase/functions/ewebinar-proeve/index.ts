/**
 * ewebinar-proeve — udløs en RIGTIG fremmøde-overgang gennem den rigtige webhook.
 *
 * BUCKET B. `authenticateServiceRole(req)` FØRST. Kaldes fra SQL-editoren:
 *
 *   SELECT public.kald_edge('ewebinar-proeve',
 *     '{"trin":"tilmeldt","email":"jonas+proeve1@topix.dk"}'::jsonb, 60000, NULL);
 *   -- og derefter, med SAMME registrant_id (standard: PROEVE-fremmoede-01):
 *   SELECT public.kald_edge('ewebinar-proeve',
 *     '{"trin":"deltog","email":"jonas+proeve1@topix.dk"}'::jsonb, 60000, NULL);
 *   -- trigger-filteret (C's §0.5): flowet i manual, NYT id, session en time tilbage:
 *   SELECT public.kald_edge('ewebinar-proeve',
 *     jsonb_build_object('trin','deltog','email','jonas+proeve3@topix.dk',
 *       'registrant_id','PROEVE-fremmoede-03',
 *       'session_tid', to_char(now() at time zone 'UTC' - interval '1 hour','YYYY-MM-DD"T"HH24:MI:SS"Z"')), 60000, NULL);
 *   -- svaret: SELECT status_code, content FROM net._http_response WHERE id = <id>;
 *
 * HVAD DEN GØR: bygger prøve-registranten (ewebinarProeve.ts), signerer den med
 * EWEBINAR_WEBHOOK_SIGNING_SECRET — med SAMME kode som webhooken verificerer med
 * (ewebinarSignatur.ts) — og POSTer til den rigtige webhook. Webhookens svar
 * sendes tilbage sammen med, hvad der blev forventet. Nøglen forlader aldrig
 * processen.
 *
 * HVAD DEN IKKE GØR: signerer aldrig en krop, kalderen har skrevet. Se
 * _shared/ewebinarProeve.ts for hvorfor det er hele forskellen.
 */

import { authenticateServiceRole } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { hmacSha256Hex, noegleformer } from "../_shared/ewebinarSignatur.ts";
import {
  byggRegistrant, byggSignaturHeadere, erProeveId, erTrin,
  FORVENTET, KENDTE_FELTER, PROEVE_PRAEFIKS, TRIN,
} from "../_shared/ewebinarProeve.ts";

const LOG = "[ewebinar-proeve]";
const WEBHOOK_URL = "https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/ewebinar-webhook";
const STANDARD_REGISTRANT = `${PROEVE_PRAEFIKS}fremmoede-01`;
const TIMEOUT_MS = 20_000;

const json = (krop: unknown, status = 200) =>
  new Response(JSON.stringify(krop), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  let body: Record<string, unknown> | null = null;
  try { body = (await req.json()) as Record<string, unknown>; } catch { body = null; }

  const ukendte = ukendteFelter(body, KENDTE_FELTER);
  if (ukendte.length > 0) {
    const besked = ukendteFelterBesked(ukendte, KENDTE_FELTER);
    console.error(`${LOG} ${besked}`);
    return json({ ok: false, grund: "ukendt_felt", error: besked }, 400);
  }

  const trin = body?.trin;
  if (!erTrin(trin)) return json({ ok: false, grund: "ugyldigt_trin", error: `«trin» skal være et af ${TRIN.join(", ")}` }, 400);

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, grund: "ugyldig_mail", error: "«email» skal være en adresse, du selv ejer — der sendes en rigtig hændelse til Klaviyo" }, 400);

  const registrantId = body?.registrant_id === undefined ? STANDARD_REGISTRANT : body.registrant_id;
  if (!erProeveId(registrantId)) {
    return json({ ok: false, grund: "ikke_et_proeve_id", error: `«registrant_id» skal starte med ${PROEVE_PRAEFIKS} — et rigtigt registrant-id kan aldrig passere her` }, 400);
  }

  // SESSIONSTIDEN (20/9): valgfri, ISO. Standard: nu. «nu minus en time»
  // beviser trigger-filteret; en fremtidig tid giver graden «tilmeldt».
  let sessionTid: string | undefined;
  if (body?.session_tid !== undefined) {
    const t = typeof body.session_tid === "string" ? Date.parse(body.session_tid) : NaN;
    if (!Number.isFinite(t)) return json({ ok: false, grund: "ugyldig_session_tid", error: "«session_tid» skal være ISO-8601, fx 2026-09-20T09:00:00Z" }, 400);
    sessionTid = new Date(t).toISOString();
  }

  const secret = Deno.env.get("EWEBINAR_WEBHOOK_SIGNING_SECRET");
  if (!secret) return json({ ok: false, grund: "ingen_noegle", error: "EWEBINAR_WEBHOOK_SIGNING_SECRET er ikke sat i denne function" }, 503);

  const nu = new Date();
  const registrant = byggRegistrant(trin, registrantId, email, nu, sessionTid);
  // RÅ streng ÉN gang — den signeres og den sendes. Genserialisering brækker signaturen.
  const raa = JSON.stringify(registrant);
  const tidsstempel = Math.floor(nu.getTime() / 1000).toString();
  // Første nøgleform (utf8) — det er også den, verifikationen prøver først.
  const hex = await hmacSha256Hex(noegleformer(secret)[0].bytes, `${tidsstempel}.${raa}`);

  const styring = new AbortController();
  const ur = setTimeout(() => styring.abort(), TIMEOUT_MS);
  let status = 0;
  let svarTekst = "";
  try {
    const svar = await fetch(WEBHOOK_URL, { method: "POST", headers: byggSignaturHeadere(tidsstempel, hex), body: raa, signal: styring.signal });
    status = svar.status;
    svarTekst = await svar.text();
  } catch (e) {
    clearTimeout(ur);
    console.error(`${LOG} kaldet til webhooken fejlede:`, e);
    return json({ ok: false, grund: "webhook_utilgaengelig", error: String(e) }, 502);
  }
  clearTimeout(ur);

  let svar: Record<string, unknown> | null = null;
  try { svar = JSON.parse(svarTekst) as Record<string, unknown>; } catch { svar = null; }

  const forventet = FORVENTET[trin];
  const fik = svar && typeof svar.fremmoede === "string" ? svar.fremmoede : null;
  const enig = fik === forventet;

  console.log(`${LOG} ${trin} registrant=${registrantId} → webhook ${status}, fremmoede=${fik ?? "?"} (forventet ${forventet}) ${enig ? "ENIG" : "UENIG"}`);
  return json({
    ok: status === 200,
    trin,
    registrant_id: registrantId,
    email,
    session_tid: registrant.sessionTime,
    sendt: registrant,
    webhook_status: status,
    webhook_svar: svar ?? svarTekst.slice(0, 500),
    forventet,
    fik,
    enig,
    laes: enig
      ? "Webhooken dømte som forventet."
      : fik === null
        ? "Svaret bærer intet «fremmoede»-felt — er fremmøde-koden (PR med webinarHaendelser.ts) udrullet?"
        : "UENIG — overgangsdommen svarer ikke det forventede. Skriv det til Claude før tirsdag.",
  });
});
