// TRIN 1 — BEVISET: er vores utm_content Metas ad_id?
//
// Denne function SKRIVER INTET. Den læser de distinkte utm_content og
// utm_campaign, vi allerede har på webinar_tilmeldinger, slår hvert id op hos
// Meta, og svarer med en dom: blev de fundet, og svarede de som annoncer?
// Det er hele trin 1 fra recon-meta-annoncer §9 — og det er forudsætningen
// for, at trin 2 overhovedet giver mening.
//
// Målt 19/9 (Jonas, SQL i prod): 597 tilmeldinger, 586 personer,
// 11 distinkte utm_content, 3 utm_campaign, 581 med fbclid.
//
// BUCKET B (CLAUDE.md): authenticateServiceRole FØRST, bag verify_jwt = true.
// Der er ingen bruger her — det er et opslag, en rådgiver beder om gennem
// SQL-editoren eller kald_edge, præcis som husets øvrige crons kaldes.
//
// SIGER PÆNT FRA UDEN TOKEN. Mangler tokenet, svarer den 200 med
// { ok: true, koerte: false, grund: "secret_mangler" } og en linje om, hvad
// der skal sættes — ikke en 500 og ikke en stacktrace. En manglende secret er
// en tilstand, ikke en fejl; det er samme regel som _shared/indgangsFaktura.ts
// («sprunget_over», grund «secret_mangler»).
//
// TOKENET STÅR ALDRIG I EN LOG. Hver URL, der logges, går gennem udenToken().
//
// KØR DEN SÅDAN (SQL editor, samme vej som cron-jobbene):
//   SELECT public.kald_edge('meta-annonce-opslag');
//   -- og få svaret:
//   SELECT id, status_code, timed_out, left(content, 2000)
//     FROM net._http_response ORDER BY id DESC LIMIT 1;
//
// Vil man kun prøve ét bestemt id:
//   SELECT public.kald_edge('meta-annonce-opslag', '{"ids": ["120249061667400694"]}'::jsonb);

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ADS_TOKEN_MANGLER, ADS_TOKEN_NAVN, metaAdsToken } from "../_shared/metaAdsToken.ts";
import {
  doemKobling,
  erUkendtFelt,
  FELTER_MINIMALT,
  FELTER_PR_TYPE,
  opslagbareIder,
  opslagUrl,
  typeRaekkefoelge,
  udenToken,
  type Koblingsdom,
  type Koblingslinje,
} from "../_shared/metaAnnoncer.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOG = "[meta-annonce-opslag]";

/** Hvor mange id'er der højst slås op i én kørsel. 11 annoncer + 3 kampagner
    er dagens tal; loftet findes for at et uventet datasæt ikke kan køre løbsk. */
const MAKS_OPSLAG = 50;

interface Svar {
  ok: boolean;
  /** Falsk når secret'en mangler — så er intet forsøgt, og intet er galt. */
  koerte: boolean;
  grund?: string;
  mangler?: string[];
  dom?: Koblingsdom;
  linjer?: Koblingslinje[];
  error?: string;
}

function json(body: Svar, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** De distinkte værdier og hvor mange tilmeldinger hver dækker. */
async function hentVaerdier(
  supabase: SupabaseClient,
): Promise<{ content: Map<string, number>; campaign: Map<string, number>; iAlt: number }> {
  const { data, error } = await supabase
    .from("webinar_tilmeldinger")
    .select("utm_content, utm_campaign");
  if (error) throw new Error(`webinar_tilmeldinger-opslag fejlede: ${error.message}`);
  const raekker = (data ?? []) as { utm_content: string | null; utm_campaign: string | null }[];
  const content = new Map<string, number>();
  const campaign = new Map<string, number>();
  for (const r of raekker) {
    if (r.utm_content) content.set(r.utm_content, (content.get(r.utm_content) ?? 0) + 1);
    if (r.utm_campaign) campaign.set(r.utm_campaign, (campaign.get(r.utm_campaign) ?? 0) + 1);
  }
  return { content, campaign, iAlt: raekker.length };
}

/** Ét Graph-kald. Svaret og evt. fejl ud — kaster aldrig. */
async function graf(url: string): Promise<{ ok: boolean; status: number; svar: Record<string, unknown>; fejl: { message?: string; code?: number } | null }> {
  const res = await fetch(url);
  const tekst = await res.text();
  let svar: Record<string, unknown>;
  try {
    svar = JSON.parse(tekst) as Record<string, unknown>;
  } catch {
    return { ok: false, status: res.status, svar: {}, fejl: { message: `ulæseligt svar: ${tekst.slice(0, 200)}` } };
  }
  return { ok: res.ok, status: res.status, svar, fejl: res.ok ? null : ((svar.error ?? {}) as { message?: string; code?: number }) };
}

/**
 * Ét opslag hos Meta. Kaster aldrig — udfaldet bæres i linjen.
 *
 * TO TRIN (rettet 19/9 efter en rigtig kørsel):
 *   1. MINIMALT felt (id, name) — findes objektet, og hvad hedder det? Det
 *      felt har alle tre typer, så kaldet kan ikke fejle på en feltliste.
 *   2. TYPENS EGNE felter, i den rækkefølge vi forventer (utm_content er en
 *      annonce, utm_campaign en kampagne). Det første, der lykkes, ER typen.
 *      Svarer Graph «nonexisting field», var det den forkerte type — så prøver
 *      vi den næste i stedet for at give op.
 *
 * FØR: én fælles feltliste med alle tre typers felter. Den gav 400 på begge
 * rigtige id'er — «(#100) Tried accessing nonexisting field (objective)» på
 * annoncen og «(campaign)» på kampagnen. Vi bad hvert objekt om det andets felter.
 */
async function slaaOp(
  vaerdi: string,
  felt: "utm_content" | "utm_campaign",
  tilmeldinger: number,
  token: string,
): Promise<Koblingslinje> {
  const linje = (o: Partial<Koblingslinje>): Koblingslinje =>
    ({ vaerdi, felt, udfald: "fejl", navn: null, slags: null, tilmeldinger, besked: null, ...o });
  try {
    // 1. Findes objektet overhovedet?
    const minimal = await graf(opslagUrl(vaerdi, token, FELTER_MINIMALT));
    if (!minimal.ok) {
      // 803 = objektet findes ikke, eller tokenet har ikke adgang til det.
      const ikkeFundet = minimal.fejl?.code === 803 || /does not exist|cannot be loaded/i.test(minimal.fejl?.message ?? "");
      return linje({
        udfald: ikkeFundet ? "ikke_fundet" : "fejl",
        besked: `${minimal.status}: ${minimal.fejl?.message ?? "ukendt fejl"}`,
      });
    }
    const navn = typeof minimal.svar.name === "string" ? minimal.svar.name : null;

    // 2. Typens egne felter — den forventede først.
    let sidsteBesked: string | null = null;
    for (const type of typeRaekkefoelge(felt)) {
      const svar = await graf(opslagUrl(vaerdi, token, FELTER_PR_TYPE[type]));
      if (svar.ok) {
        return linje({ udfald: "fundet", navn: (typeof svar.svar.name === "string" ? svar.svar.name : navn), slags: type });
      }
      if (!erUkendtFelt(svar.fejl)) {
        // Ikke en type-uenighed — en rigtig fejl. Stop og sig hvad der skete.
        return linje({ navn, besked: `${svar.status}: ${svar.fejl?.message ?? "ukendt fejl"}` });
      }
      sidsteBesked = svar.fejl?.message ?? null;
    }
    // Objektet findes, men er ingen af de tre typer, vi kender.
    return linje({
      udfald: "fundet",
      navn,
      slags: null,
      besked: `objektet findes, men er hverken annonce, annoncesæt eller kampagne (sidste svar: ${sidsteBesked ?? "?"})`,
    });
  } catch (err) {
    console.error(`${LOG} opslag fejlede for ${vaerdi} (${udenToken(opslagUrl(vaerdi, token))}):`, err instanceof Error ? err.message : err);
    return linje({ besked: err instanceof Error ? err.message : String(err) });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  // Secret'en FØRST — så en manglende nøgle svarer pænt frem for at ligne en fejl.
  // To mulige navne (19/9-2026, midlertidigt) — grunden står i _shared/metaAdsToken.ts.
  const { token, navn } = metaAdsToken();
  if (!token) {
    console.log(`${LOG} ${ADS_TOKEN_NAVN} mangler — intet slået op.`);
    return json({
      ok: true,
      koerte: false,
      grund: "secret_mangler",
      mangler: [ADS_TOKEN_NAVN],
      error: ADS_TOKEN_MANGLER,
    });
  }
  if (navn !== ADS_TOKEN_NAVN) {
    console.warn(`${LOG} bruger ${navn} som Marketing API-token — midlertidigt, se _shared/metaAdsToken.ts.`);
  }

  let valgteIder: string[] | null = null;
  try {
    const body = await req.json();
    if (Array.isArray(body?.ids)) valgteIder = body.ids.filter((v: unknown) => typeof v === "string");
  } catch {
    /* ingen body — så tages alle distinkte værdier fra basen */
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { content, campaign, iAlt } = await hentVaerdier(supabase);

    // Valgte id'er slås op som utm_content (det er dem, beviset handler om),
    // med antallet fra basen hvis vi kender værdien.
    const opgaver: { vaerdi: string; felt: "utm_content" | "utm_campaign"; antal: number }[] = valgteIder
      ? opslagbareIder(valgteIder).map((v) => ({ vaerdi: v, felt: "utm_content" as const, antal: content.get(v) ?? 0 }))
      : [
          ...opslagbareIder([...content.keys()]).map((v) => ({ vaerdi: v, felt: "utm_content" as const, antal: content.get(v) ?? 0 })),
          ...opslagbareIder([...campaign.keys()]).map((v) => ({ vaerdi: v, felt: "utm_campaign" as const, antal: campaign.get(v) ?? 0 })),
        ];

    const linjer: Koblingslinje[] = [];

    // Værdier der IKKE ligner et id, tælles med i dommen — de er selve svaret
    // på «er makroerne sat?», og de må ikke forsvinde i tavshed.
    if (!valgteIder) {
      for (const [v, antal] of content) {
        if (!opslagbareIder([v]).length) {
          // Et NAVN, vi selv har skrevet (august-kampagnen: «IMG | 08-kontoret-skaerm | 2026-08-17»).
          // Det er ikke en fejl — mærkaten ER svaret, og der er intet at slå op.
          linjer.push({ vaerdi: v, felt: "utm_content", udfald: "navn", navn: v, slags: null, tilmeldinger: antal, besked: "navn, ikke id — bruges som det er" });
        }
      }
    }

    for (const o of opgaver.slice(0, MAKS_OPSLAG)) {
      linjer.push(await slaaOp(o.vaerdi, o.felt, o.antal, token));
    }
    if (opgaver.length > MAKS_OPSLAG) {
      console.warn(`${LOG} ${opgaver.length} id'er, loftet er ${MAKS_OPSLAG} — resten blev ikke slået op.`);
    }

    const dom = doemKobling(linjer, iAlt);
    console.log(`${LOG} ${dom.konklusion}`);
    return json({ ok: true, koerte: true, dom, linjer });
  } catch (err) {
    const aarsag = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen fejlede:`, aarsag);
    return json({ ok: false, koerte: true, error: aarsag }, 500);
  }
});
