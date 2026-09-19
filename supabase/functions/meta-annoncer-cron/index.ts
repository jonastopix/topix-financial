// TRIN 2 — HENTNINGEN: én gang i døgnet, sidste syv dage, gemt som historik.
//
// Henter fra Meta Marketing API og skriver to tabeller (migration
// 20260919170000_meta_annoncer.sql):
//   meta_annonce      den AKTUELLE beskrivelse — navn, tekst, billede, status
//   meta_annonce_dag  KENDSGERNINGEN med en dato — forbrug, visninger, klik
//
// HVORFOR TO TABELLER (recon-meta-annoncer §7.1): en annonce kan omdøbes. Står
// navnet i hver dagsrække, skifter historikken navn med tilbagevirkende kraft.
// Dagsrækken bærer tal og dato; beskrivelsen bor for sig.
//
// HVORFOR HISTORIK FRA DAG ÉT: Metas insights kan hentes bagud, men KUN så
// længe annoncen findes hos Meta, og kun så langt tilbage Meta gemmer. Vores
// egen sammenstilling — forbrug mod tilmeldinger mod ansøgninger mod medlemmer
// — kan ikke rekonstrueres. Den dag, tabellen findes, begynder den.
//
// BUCKET B (CLAUDE.md): authenticateServiceRole FØRST, bag verify_jwt = true.
// TØRKØRSEL SOM STANDARD: uden body hentes og dømmes der, men INTET skrives.
// Kun et eksplicit { "dry_run": false } skriver. Samme regel som
// indgangs-paamindelser-cron og ansoegning-rykker-cron.
//
// SIDSTE SYV DAGE, IKKE KUN I GÅR. Metas tal efterjusteres i op til 28 dage
// (klik og konverteringer tilskrives bagud). Upsert på (ad_id, dato) gør
// genhentningen gratis, og rettelserne lander af sig selv. I DAG hentes ikke:
// dagens tal er ufærdige, og en halv dag i historikken ser ud som et fald.
//
// LÆSER ALDRIG, SKRIVER ALDRIG HOS META. Denne function bruger ads_read og
// intet andet. Der findes ingen kodesti her, der ændrer et budget, en status
// eller et bud — den dag det skal kunne ske, kommer det i en egen function bag
// rammen (recon §7.3), aldrig her.
//
// SIGER PÆNT FRA UDEN SECRETS: 200 med { ok: true, koerte: false,
// grund: "secret_mangler" } og hvad der mangler. Ikke en 500.
//
// PLANLÆGNING (kør MANUELT i SQL editoren, ikke som migration — vault-nøglen
// slås op live). Slottet 05:00 UTC = 07:00 dansk er ledigt og ligger efter
// Metas døgnskifte:
//
//   SELECT cron.schedule(
//     'meta-annoncer',
//     '0 5 * * *',
//     $job$ SELECT public.kald_edge('meta-annoncer-cron', '{"dry_run": false}'::jsonb, 60000, 86400000); $job$
//   );
//   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'meta-annoncer';
//
// Kør den FØRST i hånden uden body (tørkørsel) og læs svaret.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import {
  annoncerUrl,
  DAGE_BAGUD,
  dubletter,
  kontoUrl,
  insightsUrl,
  MAKS_SIDER,
  tilAnnoncekort,
  tilDagsraekker,
  udenToken,
  vindue,
  type Annoncekort,
  type Dagsraekke,
} from "../_shared/metaAnnoncer.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOG = "[meta-annoncer-cron]";

interface Resultat {
  ok: boolean;
  dry_run: boolean;
  /** Falsk når secrets mangler — intet forsøgt, intet galt. */
  koerte: boolean;
  grund?: string;
  mangler?: string[];
  vindue?: { since: string; until: string };
  konto?: { id: string; valuta: string; spend_cap_oere: number | null; forbrugt_oere: number | null; status: number | null };
  annoncer: { hentet: number; skrevet: number };
  dage: { hentet: number; skrevet: number; sprunget: { ad_id: string | null; dato: string | null; grund: string }[] };
  /** To rækker for samme (annonce, dato) — så gav time_increment=1 ikke én række pr. dag. Skal ses. */
  dubletter: string[];
  /** Sider hentet; rammer den MAKS_SIDER, er der mere, vi ikke fik. */
  sider: { annoncer: number; insights: number };
  error?: string;
}

function json(r: Resultat, status = 200): Response {
  return new Response(JSON.stringify(r), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** GET med JSON-svar. Kaster med en besked UDEN tokenet i. */
async function hent(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  const tekst = await res.text();
  if (!res.ok) {
    throw new Error(`Meta svarede ${res.status} på ${udenToken(url)}: ${tekst.slice(0, 300)}`);
  }
  try {
    return JSON.parse(tekst) as Record<string, unknown>;
  } catch {
    throw new Error(`Meta svarede ulæseligt på ${udenToken(url)}`);
  }
}

/**
 * Henter alle sider af en Graph-liste. Metas paging-link bærer selv tokenet,
 * så det må aldrig logges råt. Loftet MAKS_SIDER er et værn mod at køre i ring.
 */
async function hentAlle(url: string): Promise<{ data: Record<string, unknown>[]; sider: number }> {
  const ud: Record<string, unknown>[] = [];
  let naeste: string | null = url;
  let sider = 0;
  while (naeste && sider < MAKS_SIDER) {
    const svar: Record<string, unknown> = await hent(naeste);
    sider++;
    const data = Array.isArray(svar.data) ? (svar.data as Record<string, unknown>[]) : [];
    ud.push(...data);
    const paging = (svar.paging ?? null) as { next?: string } | null;
    naeste = typeof paging?.next === "string" ? paging.next : null;
  }
  if (naeste) console.warn(`${LOG} loftet på ${MAKS_SIDER} sider blev ramt — der er flere rækker, vi ikke hentede.`);
  return { data: ud, sider };
}

/** Beskrivelserne: upsert på ad_id. Navne og tekster må gerne overskrives — de ER «nu». */
async function skrivAnnoncer(supabase: SupabaseClient, kort: readonly Annoncekort[], nu: Date): Promise<number> {
  if (kort.length === 0) return 0;
  const raekker = kort.map((k) => ({ ...k, opdateret_at: nu.toISOString() }));
  const { error } = await supabase.from("meta_annonce").upsert(raekker, { onConflict: "ad_id" });
  if (error) throw new Error(`meta_annonce-skrivning fejlede: ${error.message}`);
  return raekker.length;
}

/**
 * Dagsrækkerne: upsert på (ad_id, dato). Det er DEN regel, der gør det gratis
 * at hente de samme syv dage hver nat — Metas efterjusteringer retter sig selv,
 * og der kan aldrig opstå to rækker for samme annonce samme dag.
 */
async function skrivDage(supabase: SupabaseClient, raekker: readonly Dagsraekke[], nu: Date): Promise<number> {
  if (raekker.length === 0) return 0;
  const med = raekker.map((r) => ({ ...r, hentet_at: nu.toISOString() }));
  const { error } = await supabase.from("meta_annonce_dag").upsert(med, { onConflict: "ad_id,dato" });
  if (error) throw new Error(`meta_annonce_dag-skrivning fejlede: ${error.message}`);
  return med.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  let toerKoersel = true;
  try {
    const body = await req.json();
    if (body?.dry_run === false) toerKoersel = false;
  } catch {
    /* ingen body, sikker tørkørsel */
  }

  const tom: Resultat = {
    ok: true,
    dry_run: toerKoersel,
    koerte: false,
    annoncer: { hentet: 0, skrevet: 0 },
    dage: { hentet: 0, skrevet: 0, sprunget: [] },
    dubletter: [],
    sider: { annoncer: 0, insights: 0 },
  };

  // Secrets FØRST. Mangler de, er det en tilstand — ikke en fejl.
  const token = Deno.env.get("META_ADS_TOKEN")?.trim() || null;
  const konto = Deno.env.get("META_AD_ACCOUNT_ID")?.trim() || null;
  const mangler = [!token && "META_ADS_TOKEN", !konto && "META_AD_ACCOUNT_ID"].filter(Boolean) as string[];
  if (mangler.length > 0) {
    console.log(`${LOG} ${mangler.join(" og ")} mangler — intet hentet.`);
    return json({
      ...tom,
      grund: "secret_mangler",
      mangler,
      error: "Sæt secrets i Lovable → Cloud → Secrets. README §1 siger, hvor de hentes i Meta Business.",
    });
  }

  const nu = new Date();
  const v = vindue(nu, DAGE_BAGUD);
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Kontoen — VALUTAEN GÆTTES ALDRIG. Den læses hver kørsel og følger
    //    hver dagsrække. spend_cap og amount_spent læses med, så spærren kan
    //    ses i svaret allerede nu (den sættes i hånden, recon §6.4).
    const k = await hent(kontoUrl(konto!, token!));
    const valuta = typeof k.currency === "string" ? k.currency : null;
    if (!valuta) throw new Error("kontoen svarede uden currency — dagsrækker uden valuta skrives ikke");
    const kontoLinje = {
      id: String(k.id ?? konto),
      valuta,
      spend_cap_oere: typeof k.spend_cap === "string" || typeof k.spend_cap === "number" ? Number(k.spend_cap) : null,
      forbrugt_oere: typeof k.amount_spent === "string" || typeof k.amount_spent === "number" ? Number(k.amount_spent) : null,
      status: typeof k.account_status === "number" ? k.account_status : null,
    };

    // 2. Beskrivelserne.
    const a = await hentAlle(annoncerUrl(konto!, token!));
    const kort = tilAnnoncekort(a.data);

    // 3. Tallene, pr. annonce pr. dag.
    const i = await hentAlle(insightsUrl(konto!, token!, v));
    const { raekker, sprunget } = tilDagsraekker(i.data, valuta);
    const dub = dubletter(raekker);
    if (dub.length > 0) {
      console.error(
        `${LOG} DUBLETTER: ${dub.length} (annonce, dato)-par kom to gange — så gav time_increment=1 IKKE én række pr. dag. Upsert ville skjule halvdelen af forbruget. Se svarets dubletter[] og efterprøv kaldet, FØR tallene bruges til noget.`,
      );
    }

    const resultat: Resultat = {
      ...tom,
      koerte: true,
      vindue: v,
      konto: kontoLinje,
      annoncer: { hentet: kort.length, skrevet: 0 },
      dage: { hentet: raekker.length, skrevet: 0, sprunget },
      dubletter: dub,
      sider: { annoncer: a.sider, insights: i.sider },
    };

    if (toerKoersel) {
      console.log(`${LOG} TØRKØRSEL: ${kort.length} annoncer og ${raekker.length} dagsrækker ville blive skrevet (${v.since} → ${v.until}, ${valuta}).`);
      return json(resultat);
    }

    resultat.annoncer.skrevet = await skrivAnnoncer(supabase, kort, nu);
    resultat.dage.skrevet = await skrivDage(supabase, raekker, nu);
    console.log(`${LOG} skrev ${resultat.annoncer.skrevet} annoncer og ${resultat.dage.skrevet} dagsrækker (${v.since} → ${v.until}, ${valuta}).`);
    return json(resultat);
  } catch (err) {
    const aarsag = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen fejlede:`, aarsag);
    return json({ ...tom, ok: false, koerte: true, vindue: v, error: aarsag }, 500);
  }
});
