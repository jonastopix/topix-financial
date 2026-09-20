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
// PLANLÆGNING (21/9): migration 20260921090000_meta_annoncer_cron.sql —
// 'meta-annoncer' kl. 03:33 UTC (05:33 dansk sommertid), efter Metas
// døgnskifte og før nogen rådgiver er oppe. Minuttet :33 deler slot med
// ingen (målt mod alle cron.schedule i migrationerne 21/9). Den gamle
// kommentar her sagde 05:00 UTC — det slot har agent-runs-opbevaring.
//
// EN CRON, INGEN SER FEJLE, ER VÆRRE END INGEN CRON (21/9). Derfor to ting:
//   1. Hver RIGTIG kørsel (dry_run=false) skriver én statusrække i
//      meta_hentning (art 'annoncer'): udfald, fejl, vindue, hentet_til, tal.
//      Tørkørsler skriver den ikke — de skriver ingenting, det er reglen.
//   2. Fejler en rigtig kørsel, får rådgiverne en klokke (type 'drift',
//      skrivRaadgiverBesked — samme klokke som vagten). Titlen bærer datoen,
//      så det er én klokke pr. fejldag, ikke én pr. forsøg.
//   Udebliver kørslen HELT (cron væk, vault-nøgle væk, timeout før catch),
//   kan functionen ikke sige det selv — det gør meta_hentning_vagt() i SQL
//   (samme migration), som dømmer på statusrækkens alder kl. 04:33 UTC:
//   ældre end 2 timer = ikke kørt i nat = rød (Jonas 21/9).
//
// TIDSZONEN MÅLES, IKKE ANTAGES: konto.tidszone i svaret (Metas timezone_name).
// Slottet 03:33 UTC forudsætter Europe/Copenhagen (Metas døgn lukker 22:00
// UTC om sommeren). Er svaret en anden zone, gælder migrationens filhoved
// (20260921090000): slottet flyttes til ≥ 3 timer efter DEN zones midnat, og
// vindue()/isoDato i _shared/metaAnnoncer.ts skal regne «i går» i kontoens
// zone i stedet for UTC — en kodeændring, ikke en SQL-rettelse.
//
// GENUDRULNING 21/9 (#1045 → skub): efter merget viste «View code» den nye
// kilde (markøren ovenfor), men den KØRENDE bundle var den gamle — den rigtige
// kørsel skrev 371 annoncer og 93 dagsrækker, men ingen meta_hentning-række,
// og konto.tidszone var null. «View code» beviste altså kilden, ikke driften.
// Beviset for driften er svaret selv: konto.tidszone udfyldt og én række i
// meta_hentning. Denne linje findes kun for at tvinge en ny build.
//
// Kør den FØRST i hånden uden body (tørkørsel) og læs svaret.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { ukendteFelter, ukendteFelterBesked } from "../_shared/kendteFelter.ts";
import { ADS_TOKEN_MANGLER, ADS_TOKEN_NAVN, metaAdsToken } from "../_shared/metaAdsToken.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import {
  annoncerUrl,
  DAGE_BAGUD,
  dubletter,
  kontoUrl,
  insightsUrl,
  MAKS_SIDER,
  delVindue,
  laesVindue,
  tilAnnoncekort,
  tilDagsraekker,
  udenToken,
  type Annoncekort,
  type Dagsraekke,
} from "../_shared/metaAnnoncer.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOG = "[meta-annoncer-cron]";

/**
 * De ENESTE felter, body'en må bære. Alt andet afvises med 400 — se
 * _shared/kendteFelter.ts for hvorfor. Står der et nyt felt i koden, skal det
 * også stå her, ellers afviser functionen sit eget kald.
 */
const KENDTE_FELTER = ["dry_run", "since", "until"] as const;

interface Resultat {
  ok: boolean;
  dry_run: boolean;
  /** Falsk når secrets mangler — intet forsøgt, intet galt. */
  koerte: boolean;
  grund?: string;
  mangler?: string[];
  vindue?: { since: string; until: string };
  konto?: { id: string; valuta: string; spend_cap_oere: number | null; forbrugt_oere: number | null; status: number | null; tidszone: string | null };
  annoncer: { hentet: number; skrevet: number };
  dage: { hentet: number; skrevet: number; sprunget: { ad_id: string | null; dato: string | null; grund: string }[] };
  /** To rækker for samme (annonce, dato) — så gav time_increment=1 ikke én række pr. dag. Skal ses. */
  dubletter: string[];
  /** Sider hentet; rammer den MAKS_SIDER, er der mere, vi ikke fik. */
  sider: { annoncer: number; insights: number };
  /**
   * Vinduet delt i kald (19/9). Et langt vindue bliver til flere insights-kald
   * à højst CHUNK_DAGE dage — Metas eget råd. Listen siger hvilke der blev hentet,
   * så en afbrudt kørsel kan ses og gentages for resten.
   */
  stykker: { since: string; until: string; raekker: number }[];
  error?: string;
}

function tomtResultat(toerKoersel: boolean): Resultat {
  return {
    ok: true,
    dry_run: toerKoersel,
    koerte: false,
    annoncer: { hentet: 0, skrevet: 0 },
    dage: { hentet: 0, skrevet: 0, sprunget: [] },
    dubletter: [],
    sider: { annoncer: 0, insights: 0 },
    stykker: [],
  };
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

/**
 * Statusrækken i meta_hentning — én pr. art, overskrives hver rigtige kørsel.
 * KASTER ALDRIG: en status, der ikke kunne skrives, må ikke koste kørslen (og
 * den dukker op som «ikke kørt siden …» hos meta_hentning_vagt alligevel).
 */
async function skrivStatus(
  supabase: SupabaseClient,
  nu: Date,
  s: { udfald: "ok" | "fejl" | "secret_mangler"; fejl: string | null; vindue: { since: string; until: string } | null; hentetTil: string | null; tal: Record<string, unknown> },
): Promise<void> {
  const { error } = await supabase.from("meta_hentning").upsert(
    {
      art: "annoncer",
      sidste_koersel: nu.toISOString(),
      sidste_udfald: s.udfald,
      sidste_fejl: s.fejl,
      vindue_fra: s.vindue?.since ?? null,
      vindue_til: s.vindue?.until ?? null,
      hentet_til: s.hentetTil,
      tal: s.tal,
    },
    { onConflict: "art" },
  );
  if (error) console.error(`${LOG} statusrækken kunne ikke skrives (${s.udfald}): ${error.message}`);
}

/** Klokken ved en fejlet RIGTIG kørsel — én pr. dag (titlen bærer datoen; skrivRaadgiverBesked dedup'er på titel). */
async function klokkeVedFejl(supabase: SupabaseClient, nu: Date, aarsag: string): Promise<void> {
  const dag = nu.toISOString().slice(0, 10);
  const r = await skrivRaadgiverBesked(supabase, {
    type: "drift",
    title: `Meta-hentningen fejlede ${dag} — forbruget pr. annonce står stille`,
    body: `meta-annoncer-cron: ${aarsag.slice(0, 400)}. Kør den i hånden (tørkørsel først), eller læs meta_hentning.`,
    reference_type: "meta_hentning",
  });
  if (r.fejl.length) console.error(`${LOG} klokken kunne ikke skrives: ${r.fejl.join("; ")}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  let toerKoersel = true;
  let raaBody: Record<string, unknown> | null = null;
  try {
    raaBody = (await req.json()) as Record<string, unknown>;
    if (raaBody?.dry_run === false) toerKoersel = false;
  } catch {
    /* ingen body, sikker tørkørsel */
  }

  // UKENDTE FELTER AFVISES (19/9, anden måling): et kald med
  // {"vindue": {"since": …}} — datoerne pakket ind — havde begge felter
  // `undefined` og faldt i grenen «ingen datoer givet». Syv dage, svar 200,
  // ingen indvending. En body, man ikke forstår, må aldrig blive til en
  // standardkørsel. Se _shared/kendteFelter.ts.
  const ukendte = ukendteFelter(raaBody, KENDTE_FELTER);
  if (ukendte.length > 0) {
    const besked = ukendteFelterBesked(ukendte, KENDTE_FELTER);
    console.error(`${LOG} ${besked}`);
    return json({ ...tomtResultat(toerKoersel), ok: false, koerte: true, grund: "ukendt_felt", error: besked }, 400);
  }

  // VINDUET (19/9): «since»/«until» er valgfrie; uden dem de syv dage som før.
  // FØR denne ændring læste cronen KUN «dry_run» — et kald med datoer hentede de
  // sidste syv dage og sagde ingenting. Nu afvises alt, der ikke kan forstås.
  const nu = new Date();
  const vindueSvar = laesVindue(raaBody, nu);
  if (!vindueSvar.ok) {
    console.error(`${LOG} vinduet blev afvist: ${vindueSvar.fejl}`);
    return json({ ...tomtResultat(toerKoersel), ok: false, koerte: true, grund: "ugyldigt_vindue", error: vindueSvar.fejl }, 400);
  }
  const v = vindueSvar.vindue;
  const stykker = delVindue(v);

  const tom = tomtResultat(toerKoersel);

  // Secrets FØRST. Mangler de, er det en tilstand — ikke en fejl.
  // To mulige navne på tokenet (19/9-2026, midlertidigt) — _shared/metaAdsToken.ts.
  const { token, navn } = metaAdsToken();
  const konto = Deno.env.get("META_AD_ACCOUNT_ID")?.trim() || null;
  const mangler = [!token && ADS_TOKEN_NAVN, !konto && "META_AD_ACCOUNT_ID"].filter(Boolean) as string[];
  if (token && navn !== ADS_TOKEN_NAVN) {
    console.warn(`${LOG} bruger ${navn} som Marketing API-token — midlertidigt, se _shared/metaAdsToken.ts.`);
  }
  if (mangler.length > 0) {
    console.log(`${LOG} ${mangler.join(" og ")} mangler — intet hentet.`);
    if (!toerKoersel) {
      // En PLANLAGT kørsel uden secrets er en fejl, der skal ses — ikke en tilstand.
      const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      await skrivStatus(sb, nu, { udfald: "secret_mangler", fejl: `${mangler.join(" og ")} mangler`, vindue: v, hentetTil: null, tal: {} });
      await klokkeVedFejl(sb, nu, `${mangler.join(" og ")} mangler i Lovable → Secrets`);
    }
    return json({
      ...tom,
      grund: "secret_mangler",
      mangler,
      error: ADS_TOKEN_MANGLER,
    });
  }

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
      // Metas døgn slutter i KONTOENS tidszone — det er den, cron-slottet skal dømmes mod.
      tidszone: typeof k.timezone_name === "string" ? k.timezone_name : null,
    };

    // 2. Beskrivelserne.
    const a = await hentAlle(annoncerUrl(konto!, token!));
    const kort = tilAnnoncekort(a.data);

    // 3. Tallene, pr. annonce pr. dag — ÉT KALD PR. STYKKE.
    //    Et langt vindue deles (delVindue), fordi Metas egen vejledning siger
    //    «limit your query by limiting the date range», og fordi fejl 1487534
    //    rammer kald, der henter mere end systemet kan klare. Ældste stykke
    //    først, så en afbrudt kørsel efterlader en sammenhængende historik.
    const raaInsights: Record<string, unknown>[] = [];
    let siderInsights = 0;
    const stykkeRapport: { since: string; until: string; raekker: number }[] = [];
    for (const stykke of stykker) {
      const del = await hentAlle(insightsUrl(konto!, token!, stykke));
      raaInsights.push(...del.data);
      siderInsights += del.sider;
      stykkeRapport.push({ since: stykke.since, until: stykke.until, raekker: del.data.length });
    }
    const i = { data: raaInsights, sider: siderInsights };
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
      stykker: stykkeRapport,
    };

    if (toerKoersel) {
      console.log(`${LOG} TØRKØRSEL: ${kort.length} annoncer og ${raekker.length} dagsrækker ville blive skrevet (${v.since} → ${v.until} i ${stykker.length} kald, ${valuta}).`);
      return json(resultat);
    }

    resultat.annoncer.skrevet = await skrivAnnoncer(supabase, kort, nu);
    resultat.dage.skrevet = await skrivDage(supabase, raekker, nu);
    console.log(`${LOG} skrev ${resultat.annoncer.skrevet} annoncer og ${resultat.dage.skrevet} dagsrækker (${v.since} → ${v.until} i ${stykker.length} kald, ${valuta}).`);
    // hentet_til = den nyeste dato, der FAKTISK fik en række — ikke vinduets kant.
    const hentetTil = raekker.reduce<string | null>((m, r) => (m === null || r.dato > m ? r.dato : m), null);
    await skrivStatus(supabase, nu, {
      udfald: "ok",
      fejl: null,
      vindue: v,
      hentetTil,
      tal: { annoncer: resultat.annoncer, dage: { hentet: raekker.length, skrevet: resultat.dage.skrevet, sprunget: sprunget.length }, dubletter: dub.length, sider: resultat.sider, stykker: stykker.length, tidszone: kontoLinje.tidszone },
    });
    return json(resultat);
  } catch (err) {
    const aarsag = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} kørslen fejlede:`, aarsag);
    if (!toerKoersel) {
      await skrivStatus(supabase, nu, { udfald: "fejl", fejl: aarsag.slice(0, 1000), vindue: v, hentetTil: null, tal: {} });
      await klokkeVedFejl(supabase, nu, aarsag);
    }
    return json({ ...tom, ok: false, koerte: true, vindue: v, error: aarsag }, 500);
  }
});
