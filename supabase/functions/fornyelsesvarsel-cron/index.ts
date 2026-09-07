// Fornyelsens varsler — varsel 1 ved 30 dage før slutdato, varsel 2 ved 7.
//
// SAMME FORM SOM indgangs-paamindelser-cron: HTTP-indgang (IKKE Deno.cron —
// den eksekveres aldrig på Supabases edge-runtime, målt 13/8),
// authenticateServiceRole bag verify_jwt = true (Bucket B), og TØRKØRSEL
// SOM STANDARD: uden body findes kandidaterne og logges, men intet sendes
// og intet skrives. Kun et eksplicit { "dry_run": false } sender.
//
// I DENNE PR (7/9) ER FUNKTIONEN EN REN RAPPORT: den sender ingen mail,
// skriver ingen notifikation og STEMPLER IKKE — hverken tørt eller live.
// dry_run læses og bæres i svaret, så formen er den samme som den bliver,
// men de to tilstande gør endnu det samme. Afsendelsen (mail 1, mail 2,
// rådgiver-notifikationen) og stemplingen af varsel_1_sendt_at /
// varsel_2_sendt_at kommer i NÆSTE PR; indtil da er svaret det eneste
// output. Reglen der SKAL følges når den bygges: stempl KUN når
// afsendelsen lykkedes (samme regel som indgangs-paamindelser-cron:315).
//
// MOTOREN afgør: afgoerForfaldentVarsel (_shared/fornyelsesvarsel.ts,
// spejl af src/lib/fornyelsesvarsel.ts) siger hvilket varsel der er
// forfaldent NU — højst ét, det højeste forfaldne (den sene beslutning:
// 5 dage før slutdato giver varsel 2, og varsel 1 sendes aldrig bagefter).
// SQL filtrerer kun på det der er billigt og sikkert (beslutning =
// 'tilbyd', slutdato ikke null); dagene dømmes IKKE i SQL — den dom hører
// hjemme i motoren, som også bærer grunden i læsbar form.
//
// PLANLÆGNING — pg_cron, køres MANUELT i SQL editoren, ikke som migration,
// fordi vault-nøglen (email_queue_service_role_key) slås op live. Slottet
// 11:00 UTC er ledigt (målt 6/9: 04:00 opgave-udløb, 05:00 agent-runs,
// 06:00 weekly-focus, 07:00 event-reminders, 08:00 pulse/digest, 09:00
// report-reminder + intro-session, 10:00 indgangs-paamindelser) — det er
// 13:00 dansk sommertid, 12:00 om vinteren. Samme form som
// indgangs-paamindelser:
//
//   DO $$
//   BEGIN
//     IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fornyelsesvarsler') THEN
//       PERFORM cron.unschedule('fornyelsesvarsler');
//     END IF;
//   END $$;
//
//   SELECT cron.schedule(
//     'fornyelsesvarsler',
//     '0 11 * * *',
//     $job$
//     SELECT net.http_post(
//       url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/fornyelsesvarsel-cron',
//       headers := jsonb_build_object(
//         'Content-Type', 'application/json',
//         'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1)
//       ),
//       body := '{"dry_run": false}'::jsonb
//     ) AS request_id;
//     $job$
//   );
//
//   -- Efter-verifikation:
//   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'fornyelsesvarsler';
//
// Kør først funktionen i hånden UDEN body (tørkørsel) og læs svaret, før
// jobbet planlægges med dry_run: false. Jobbet planlægges IKKE i denne PR:
// der er intet at sende endnu, og en cron der kører en rapport ingen
// læser, er støj.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { afgoerForfaldentVarsel, type Varselsnummer } from "../_shared/fornyelsesvarsel.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface VarselsResultat {
  ok: boolean;
  dry_run: boolean;
  /** Undersøgte: fornyelsesrækker med beslutning 'tilbyd' og en virksomhed med slutdato. */
  fundet: number;
  /** Enqueuede mails — ALTID 0 i denne PR (ren rapport, se filhovedet). */
  sendt: number;
  /** Motoren siger varsel 1 er forfaldent nu. */
  varsel_1: number;
  /** Motoren siger varsel 2 er forfaldent nu. */
  varsel_2: number;
  sprunget_over: {
    /** Motoren siger intet varsel (for tidligt, allerede sendt, slutdato passeret). */
    ingen_forfalden: number;
    /** companies-rækken mangler, har ingen slutdato, eller kunne ikke læses. */
    ingen_virksomhed: number;
  };
  /** Uventet fejl for én række — resten kører videre. */
  fejlet: number;
  /** Én post pr. virksomhed med et forfaldent varsel — grunden er motorens, skrevet til at blive læst. */
  forfaldne: { company_id: string; virksomhed: string; dage_til_udloeb: number | null; varsel: Varselsnummer; grund: string }[];
  error?: string;
}

interface FornyelsesRaekke {
  company_id: string;
  beslutning: string;
  varsel_1_sendt_at: string | null;
  varsel_2_sendt_at: string | null;
}

interface VirksomhedsRaekke {
  id: string;
  name: string;
  contract_end_date: string | null;
}

async function koerVarsler(
  supabase: SupabaseClient,
  toerKoersel: boolean,
): Promise<VarselsResultat> {
  const resultat: VarselsResultat = {
    ok: true,
    dry_run: toerKoersel,
    fundet: 0,
    sendt: 0,
    varsel_1: 0,
    varsel_2: 0,
    sprunget_over: { ingen_forfalden: 0, ingen_virksomhed: 0 },
    fejlet: 0,
    forfaldne: [],
  };

  // 1. Målgruppe: fornyelsesrækker med beslutning 'tilbyd' — det eneste
  //    der udløser noget (ordningens §1). contract_end_date ligger på
  //    companies og filtreres i trin 2 — to enkle opslag frem for et
  //    embedded filter, som skabelonen; mængden er lille (fem
  //    beslutninger i prod 6/9).
  const { data: rows, error: rowErr } = await supabase
    .from("company_fornyelse")
    .select("company_id, beslutning, varsel_1_sendt_at, varsel_2_sendt_at")
    .eq("beslutning", "tilbyd");
  if (rowErr) {
    console.error("[fornyelsesvarsel-cron] company_fornyelse-opslag fejlede:", rowErr.message);
    return { ...resultat, ok: false, error: rowErr.message };
  }
  const fornyelser = (rows ?? []) as FornyelsesRaekke[];
  if (fornyelser.length === 0) {
    console.log("[fornyelsesvarsel-cron] Ingen fornyelsesrækker med beslutning tilbyd");
    return resultat;
  }

  // 2. Virksomhederne — kun dem MED slutdato kan have et varsel. Dagene
  //    dømmes ikke her; det gør motoren.
  const { data: companies, error: companyErr } = await supabase
    .from("companies")
    .select("id, name, contract_end_date")
    .in("id", fornyelser.map((f) => f.company_id))
    .not("contract_end_date", "is", null);
  if (companyErr) {
    console.error("[fornyelsesvarsel-cron] companies-opslag fejlede:", companyErr.message);
    return { ...resultat, ok: false, error: companyErr.message };
  }
  const virksomheder = new Map<string, VirksomhedsRaekke>();
  for (const c of (companies ?? []) as VirksomhedsRaekke[]) virksomheder.set(c.id, c);

  const kandidater = fornyelser.filter((f) => virksomheder.has(f.company_id));
  resultat.fundet = kandidater.length;
  resultat.sprunget_over.ingen_virksomhed = fornyelser.length - kandidater.length;
  const now = new Date();

  for (const fornyelse of kandidater) {
    // kandidater er filtreret paa virksomheder.has(), saa opslaget rammer
    // altid. ! frem for en uopnaaelig gren: en doed gren faar en laeser til
    // at tro at taelleren kan blive forkert.
    const company = virksomheder.get(fornyelse.company_id)!;

    try {
      // 3. Motoren afgør — også «tilbyd» dømmes igen her, selvom trin 1
      //    allerede har sorteret på det; motoren er sandheden, ikke SQL.
      const varsel = afgoerForfaldentVarsel(
        {
          contract_end_date: company.contract_end_date,
          // SQL har filtreret paa 'tilbyd' (trin 1), saa vaerdien er kendt.
          // Motoren doemmer den alligevel selv - den er sandheden, ikke SQL.
          beslutning: "tilbyd",
          varsel_1_sendt_at: fornyelse.varsel_1_sendt_at,
          varsel_2_sendt_at: fornyelse.varsel_2_sendt_at,
        },
        now,
      );

      // Én linje pr. virksomhed — grunden er motorens og skrevet til at
      // blive læst i loggen.
      console.log(
        `[fornyelsesvarsel-cron] ${company.name} (${fornyelse.company_id}): dage_til_udloeb=${varsel.dage_til_udloeb} varsel=${varsel.varsel ?? "intet"} — ${varsel.grund}`,
      );

      if (varsel.varsel === null) {
        resultat.sprunget_over.ingen_forfalden++;
        continue;
      }

      if (varsel.varsel === 1) resultat.varsel_1++;
      else resultat.varsel_2++;
      resultat.forfaldne.push({
        company_id: fornyelse.company_id,
        virksomhed: company.name,
        dage_til_udloeb: varsel.dage_til_udloeb,
        varsel: varsel.varsel,
        grund: varsel.grund,
      });

      // 4. Afsendelse og stempling: NÆSTE PR. Her sendes intet og
      //    stemples intet — hverken tørt eller live (se filhovedet).
    } catch (err) {
      console.error(`[fornyelsesvarsel-cron] Fejl for company ${fornyelse.company_id}:`, err);
      resultat.fejlet++;
    }
  }

  return resultat;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  // TØRKØRSEL default: uden body findes kandidaterne og logges, men intet
  // sendes og intet skrives. Kun et eksplicit { "dry_run": false } sender
  // — og i denne PR gør heller ikke den det (ren rapport).
  let toerKoersel = true;
  try {
    const body = await req.json();
    if (body?.dry_run === false) toerKoersel = false;
  } catch {
    /* ingen body, sikker tørkørsel */
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const resultat = await koerVarsler(supabase, toerKoersel);
  console.log("[fornyelsesvarsel-cron] Summary:", JSON.stringify(resultat));

  return new Response(JSON.stringify(resultat), {
    status: resultat.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
