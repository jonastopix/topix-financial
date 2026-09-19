// klaviyo-motor — lag 3's HTTP-indgang (udkast 19/9-2026,
// ~/Downloads/udkast-klaviyo-motor/README.md).
//
// Bucket A-form (agent-forslag-afgoer-forbilledet, PR #267-porten):
//   1. authenticateUser FØRST — verify_jwt = true i config.toml.
//   2. Advisor-gate via callerClient.rpc("has_role") — et medlem afvises med
//      403 FØR nogen service-role-klient konstrueres.
//   3. Først derefter adminClient, som kun bruges til sporet.
//
// HVORFOR BUCKET A OG IKKE B: det her ændrer 345 menneskers post. Selv når
// lag 4 er en agent, skal der stå et menneske bag — kalderens auth.uid()
// skrives i sporets udfoert_af, og den kolonne er NOT NULL. En cron uden
// bruger kan ikke bruge denne function, og det er med vilje.
//
// TØRKØRSEL ER STANDARD. Body'ens `skriv: true` er det eneste, der sender
// noget til Klaviyo. Alt andet — også en tom body — regner kun ud.
//
// KOMMANDOER (body.handling):
//   laes_flow        { flow_id }
//   laes_skabelon    { skabelon_id }
//   laes_kampagne    { kampagne_id }
//   opret_skabelon   { navn, redigeringstype, html? | definition?, tekst? }
//   ret_skabelon     { skabelon_id, navn?, html?, definition?, tekst? }
//   ret_flowmail     { handling_id, skabelon_id?, emne?, forhaandstekst?,
//                      afsender_mail?, afsender_navn?, svaradresse? }
//   opret_flow       { navn, definition }
//
// LAG 4 ER IKKE BYGGET HER. Denne function er det, agenten får lov at kalde —
// ikke agenten selv.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateUser, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
// A's klient (lag 1). URØRT — vi importerer `kald` og binder nøglen til den.
// Målt 19/9 i _shared/klaviyo.ts: kald(noegle, sti, valg) KASTER ALDRIG.
import { kald as klaviyoKald, KLAVIYO_SECRET, noeglenErBrugbar } from "../_shared/klaviyo.ts";
import {
  bindKlient,
  laesFlow,
  laesKampagne,
  laesSkabelon,
  opretFlow,
  opretSkabelon,
  retFlowmail,
  retSkabelon,
  skrivSpor,
  type Udfald,
} from "../_shared/klaviyoMotor.ts";
import type { Redigeringstype } from "../_shared/klaviyoMotorDom.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const tekst = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
/** null skal kunne sendes med vilje (ryd feltet); undefined betyder «rør ikke». */
const tekstEllerNull = (v: unknown): string | null | undefined =>
  v === null ? null : typeof v === "string" ? v.trim() : undefined;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  // 1. Bucket A: brugeren FØRST.
  const auth = await authenticateUser(req);
  if (auth instanceof Response) return auth;
  // Feltet hedder callerId i AuthenticatedUser — målt i _shared/edgeFunctionAuth.ts.
  const { callerId, callerClient } = auth;

  // 2. Advisor-gaten med KALDERENS klient, før service role findes.
  const { data: erRaadgiver, error: rolleFejl } = await callerClient.rpc("has_role", { _user_id: callerId, _role: "advisor" });
  if (rolleFejl) {
    console.error("[klaviyo-motor] rolleopslag fejlede:", rolleFejl.message);
    return json(500, { error: "kunne ikke slå rollen op" });
  }
  if (erRaadgiver !== true) return json(403, { error: "kun rådgivere" });

  let body: Record<string, unknown>;
  try {
    const raa = await req.text();
    body = raa.trim() === "" ? {} : (JSON.parse(raa) as Record<string, unknown>);
  } catch {
    return json(400, { error: "body er ikke JSON" });
  }

  const handling = tekst(body.handling);
  if (!handling) return json(400, { error: "handling mangler" });
  // DET ENESTE, DER SKRIVER. Alt andet — også en manglende nøgle — er tørkørsel.
  const skriv = body.skriv === true;
  const valg = { skriv, udfoertAf: callerId };

  const admin = createClient(supabaseUrl, serviceKey);

  // Nøglen hentes HER og gives til A's kald gennem bindKlient — motoren selv
  // rører den aldrig. A's `noeglenErBrugbar` fanger også en offentlig nøgle
  // sat ved en fejl, hvilket ellers ville blive en tavs 401 ved første kald.
  const noegle = Deno.env.get(KLAVIYO_SECRET);
  if (!noeglenErBrugbar(noegle)) {
    console.error(`[klaviyo-motor] ${KLAVIYO_SECRET} mangler eller er ikke en privat nøgle.`);
    return json(503, { error: `Klaviyo er ikke sat op endnu (${KLAVIYO_SECRET}).` });
  }
  const k = bindKlient(klaviyoKald, noegle);

  try {
    switch (handling) {
      // ── LÆS ──────────────────────────────────────────────────────────────
      case "laes_flow": {
        const id = tekst(body.flow_id);
        if (!id) return json(400, { error: "flow_id mangler" });
        const ud = await laesFlow(k, id);
        await skrivSpor(admin, {
          handling: "laes_flow", klaviyo_id: id, klaviyo_type: "flow", toerkoersel: true,
          foer: ud.flow, sendt: null, efter: null, aendringer: [], kladde_rettelser: [],
          udfald: "toerkoersel", grund: null, udfoert_af: callerId,
        });
        return json(200, {
          flow: ud.flow,
          handlinger: ud.handlinger,
          genindtraedelse: ud.genindtraedelse,
          // Siges hver gang, så lag 4 ikke prøver: den kan læses, ikke skrives.
          genindtraedelse_kan_ikke_aendres: true,
        });
      }
      case "laes_skabelon": {
        const id = tekst(body.skabelon_id);
        if (!id) return json(400, { error: "skabelon_id mangler" });
        const s = await laesSkabelon(k, id);
        await skrivSpor(admin, {
          handling: "laes_skabelon", klaviyo_id: id, klaviyo_type: "template", toerkoersel: true,
          foer: s, sendt: null, efter: null, aendringer: [], kladde_rettelser: [],
          udfald: "toerkoersel", grund: null, udfoert_af: callerId,
        });
        return json(200, { skabelon: s });
      }
      case "laes_kampagne": {
        const id = tekst(body.kampagne_id);
        if (!id) return json(400, { error: "kampagne_id mangler" });
        const ud = await laesKampagne(k, id);
        await skrivSpor(admin, {
          handling: "laes_kampagne", klaviyo_id: id, klaviyo_type: "campaign", toerkoersel: true,
          foer: ud.kampagne, sendt: null, efter: null, aendringer: [], kladde_rettelser: [],
          udfald: "toerkoersel", grund: null, udfoert_af: callerId,
        });
        return json(200, ud);
      }

      // ── SKRIV ────────────────────────────────────────────────────────────
      case "opret_skabelon": {
        const navn = tekst(body.navn);
        const type = tekst(body.redigeringstype) as Redigeringstype | undefined;
        if (!navn || !type) return json(400, { error: "navn og redigeringstype mangler" });
        const ud = await opretSkabelon(k, admin, {
          navn, redigeringstype: type,
          html: tekst(body.html) ?? null,
          definition: (body.definition as Record<string, unknown> | undefined) ?? null,
          tekst: tekst(body.tekst) ?? null,
        }, valg);
        return svar(ud);
      }
      case "ret_skabelon": {
        const id = tekst(body.skabelon_id);
        if (!id) return json(400, { error: "skabelon_id mangler" });
        const ud = await retSkabelon(k, admin, id, {
          navn: tekst(body.navn),
          html: tekst(body.html),
          definition: body.definition as Record<string, unknown> | undefined,
          tekst: tekst(body.tekst),
        }, valg);
        return svar(ud);
      }
      case "ret_flowmail": {
        const id = tekst(body.handling_id);
        if (!id) return json(400, { error: "handling_id mangler" });
        const ud = await retFlowmail(k, admin, id, {
          skabelonId: tekstEllerNull(body.skabelon_id),
          emne: tekstEllerNull(body.emne),
          forhaandstekst: tekstEllerNull(body.forhaandstekst),
          afsenderMail: tekstEllerNull(body.afsender_mail),
          afsenderNavn: tekstEllerNull(body.afsender_navn),
          svaradresse: tekstEllerNull(body.svaradresse),
        }, valg);
        return svar(ud);
      }
      case "opret_flow": {
        const navn = tekst(body.navn);
        const def = body.definition as Record<string, unknown> | undefined;
        if (!navn || !def) return json(400, { error: "navn og definition mangler" });
        const ud = await opretFlow(k, admin, { navn, definition: def }, valg);
        return svar(ud);
      }
      default:
        return json(400, { error: `ukendt handling «${handling}»` });
    }
  } catch (err) {
    // Klaviyo-fejl fanges i motoren og svares som udfald; når vi alligevel
    // havner her, er det vores egen kode eller basen. Aldrig et halvt svar.
    console.error(`[klaviyo-motor] ${handling} kastede:`, err);
    return json(500, { error: err instanceof Error ? err.message : String(err) });
  }
});

/** Ét svar-format for alle skrivninger, så fladen og lag 4 kan læse dem ens. */
function svar(ud: Udfald): Response {
  const status = ud.udfald === "afvist" ? 400 : ud.udfald === "fejl" ? 502 : 200;
  return json(status, {
    udfald: ud.udfald,
    grund: ud.grund,
    // Hele body'en, så en tørkørsel kan læses og godkendes af et menneske.
    ville_sende: ud.sendt,
    aendringer: ud.aendringer,
    kladde_rettelser: ud.kladdeRettelser,
    efter: ud.efter,
    spor_id: ud.sporId,
  });
}
