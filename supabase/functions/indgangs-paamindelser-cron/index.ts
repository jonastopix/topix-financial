// Indgangens påmindelser — dag 14, 25 og 31 efter betalingsmailen.
//
// SAMME FORM SOM intro-reminder-cron: HTTP-indgang (IKKE Deno.cron — den
// eksekveres aldrig på Supabases edge-runtime, målt 13/8),
// authenticateServiceRole bag verify_jwt = true (Bucket B), og TØRKØRSEL
// SOM STANDARD: uden body findes kandidaterne og logges, men intet sendes
// og intet skrives. Kun et eksplicit { "dry_run": false } sender.
//
// MOTOREN afgør: afgoerBetalingsfrist (_shared/betalingsfrist.ts, spejl
// af src/lib/betalingsfrist.ts) siger hvilken påmindelse der er forfalden
// NU — højst én, den seneste forfaldne (springet: 26 dage uden påmindelse
// giver 25, ikke 14). Cronen sender den og stempler
// sidste_paamindelse_dag med det trin der faktisk gik. Fejler sendingen,
// stemples der IKKE, så mailen prøves igen næste dag (samme regel som
// intro-reminder-cron:220).
//
// DAG 31: mailen siger «vi har sendt dig en faktura … i en separat mail
// fra Stripe». Fakturaen via Stripe Invoicing er IKKE bygget (leddet
// mangler — docs/indgangen-design.md §4 og §26). Cronen sender mailen og
// logger TYDELIGT at fakturaen skal sendes i hånden; svaret bærer listen
// faktura_i_haanden, så den kan ses i cron-loggen. Når Stripe Invoicing-
// leddet bygges, hører det hjemme lige før dag 31-sendingen herunder.
//
// PLANLÆGNING — pg_cron, køres MANUELT i SQL editoren, ikke som migration,
// fordi vault-nøglen (email_queue_service_role_key) slås op live. Slottet
// 10:00 er ledigt (målt 2/9: 04:00 opgave-udløb, 05:00 agent-runs, 06:00
// weekly-focus, 07:00 event-reminders, 08:00 pulse/digest, 09:00
// report-reminder + intro-session). Samme form som intro-session-reminder
// i migration 20260901112000:
//
//   DO $$
//   BEGIN
//     IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'indgangs-paamindelser') THEN
//       PERFORM cron.unschedule('indgangs-paamindelser');
//     END IF;
//   END $$;
//
//   SELECT cron.schedule(
//     'indgangs-paamindelser',
//     '0 10 * * *',
//     $job$
//     SELECT net.http_post(
//       url := 'https://loiavmastgeieqyiwyyr.supabase.co/functions/v1/indgangs-paamindelser-cron',
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
//   SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'indgangs-paamindelser';
//
// Kør først funktionen i hånden UDEN body (tørkørsel) og læs svaret, før
// jobbet planlægges med dry_run: false.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { afgoerBetalingsfrist, type Paamindelsesdag } from "../_shared/betalingsfrist.ts";
import { dag14Mail, dag25Mail, dag31Mail, type IndgangsMail } from "../_shared/indgangsMail.ts";
import {
  betalingsfristDato,
  formatDanskDato,
  fornavnAf,
  sendIndgangsMail,
} from "../_shared/indgangsMailAfsendelse.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = "https://app.theboardroom.dk";

interface PaamindelsesResultat {
  ok: boolean;
  dry_run: boolean;
  /** Linkrækker med betalingsmail_sendt_at sat og virksomhed uden contract_end_date. */
  fundet: number;
  /** Enqueuede mails (altid 0 i tørkørsel). */
  sendt: number;
  /** Kun tørkørsel: ville have fået en mail. */
  ville_sende: number;
  sprunget_over: {
    /** Motoren siger ingen påmindelse forfalden nu (eller allerede sendt). */
    ingen_forfalden: number;
    /** Betalt mellem opslag og afgørelse — motoren siger betalt. */
    betalt: number;
    /** companies-rækken mangler eller kunne ikke læses. */
    ingen_virksomhed: number;
    /** contact_email er tom — kan ikke sendes, stemples ikke. */
    ingen_email: number;
  };
  /** Sendingen fejlede (enqueue eller uventet) — stemples ikke, prøves igen i morgen. */
  fejlet: number;
  /** Fordeling af det der blev sendt / ville sendes, pr. trin. */
  pr_trin: Record<"14" | "25" | "31", number>;
  /** Dag 31 gik — fakturaen via Stripe Invoicing er IKKE bygget og skal sendes i hånden. */
  faktura_i_haanden: { company_id: string; virksomhed: string; beloeb_kr: number }[];
  error?: string;
}

interface LinkRaekke {
  company_id: string;
  prisniveau_oere: number | null;
  underskrevet_at: string;
  token: string;
  betalingsmail_sendt_at: string | null;
  sidste_paamindelse_dag: number | null;
}

interface VirksomhedsRaekke {
  id: string;
  name: string;
  contact_person: string | null;
  contact_email: string | null;
  contract_end_date: string | null;
}

function bygPaamindelse(
  trin: Paamindelsesdag,
  a: { fornavn: string | null; betalingsUrl: string; fristDato: string; beloebKr: number },
): IndgangsMail {
  switch (trin) {
    case 14:
      return dag14Mail({ fornavn: a.fornavn, betalingsUrl: a.betalingsUrl });
    case 25:
      return dag25Mail({ fornavn: a.fornavn, betalingsUrl: a.betalingsUrl, fristDato: a.fristDato, beloebKr: a.beloebKr });
    case 31:
      return dag31Mail({ fornavn: a.fornavn, beloebKr: a.beloebKr });
  }
}

async function koerPaamindelser(
  supabase: SupabaseClient,
  toerKoersel: boolean,
): Promise<PaamindelsesResultat> {
  const resultat: PaamindelsesResultat = {
    ok: true,
    dry_run: toerKoersel,
    fundet: 0,
    sendt: 0,
    ville_sende: 0,
    sprunget_over: { ingen_forfalden: 0, betalt: 0, ingen_virksomhed: 0, ingen_email: 0 },
    fejlet: 0,
    pr_trin: { "14": 0, "25": 0, "31": 0 },
    faktura_i_haanden: [],
  };

  // 1. Målgruppe: linkrækker hvor dag 0 ER sendt. contract_end_date
  //    ligger på companies og filtreres i trin 2 — to enkle opslag frem
  //    for et embedded filter; mængden er lille (nye medlemmer i deres
  //    første måned).
  const { data: links, error: linkErr } = await supabase
    .from("company_betalingslink")
    .select("company_id, prisniveau_oere, underskrevet_at, token, betalingsmail_sendt_at, sidste_paamindelse_dag")
    .not("betalingsmail_sendt_at", "is", null);
  if (linkErr) {
    console.error("[indgangs-paamindelser-cron] company_betalingslink-opslag fejlede:", linkErr.message);
    return { ...resultat, ok: false, error: linkErr.message };
  }
  const linkRaekker = (links ?? []) as LinkRaekke[];
  if (linkRaekker.length === 0) {
    console.log("[indgangs-paamindelser-cron] Ingen linkrækker med betalingsmail sendt");
    return resultat;
  }

  // 2. Virksomhederne — kun dem uden contract_end_date er i indgangen.
  const { data: companies, error: companyErr } = await supabase
    .from("companies")
    .select("id, name, contact_person, contact_email, contract_end_date")
    .in("id", linkRaekker.map((l) => l.company_id))
    .is("contract_end_date", null);
  if (companyErr) {
    console.error("[indgangs-paamindelser-cron] companies-opslag fejlede:", companyErr.message);
    return { ...resultat, ok: false, error: companyErr.message };
  }
  const virksomheder = new Map<string, VirksomhedsRaekke>();
  for (const c of (companies ?? []) as VirksomhedsRaekke[]) virksomheder.set(c.id, c);

  const kandidater = linkRaekker.filter((l) => virksomheder.has(l.company_id));
  resultat.fundet = kandidater.length;
  const now = new Date();

  for (const link of kandidater) {
    const company = virksomheder.get(link.company_id);
    if (!company) {
      resultat.sprunget_over.ingen_virksomhed++;
      continue;
    }

    try {
      // 3. Motoren afgør — betalt vinder altid, også her, selvom filtret
      //    i trin 2 allerede har sorteret betalte fra.
      const tilstand = afgoerBetalingsfrist(
        {
          prisniveau_oere: link.prisniveau_oere,
          underskrevet_at: link.underskrevet_at,
          betalingsmail_sendt_at: link.betalingsmail_sendt_at,
          sidste_paamindelse_dag: link.sidste_paamindelse_dag,
          contract_end_date: company.contract_end_date,
        },
        now,
      );
      if (tilstand.status === "betalt") {
        resultat.sprunget_over.betalt++;
        continue;
      }
      const trin = tilstand.paamindelse_forfalden;
      if (trin === null) {
        resultat.sprunget_over.ingen_forfalden++;
        continue;
      }

      const til = (company.contact_email ?? "").trim();
      if (!til) {
        console.error(
          `[indgangs-paamindelser-cron] ${company.name} (${link.company_id}) har ingen contact_email — dag ${trin} ikke sendt`,
        );
        resultat.sprunget_over.ingen_email++;
        continue;
      }

      // prisniveau_oere er ikke null når dag 0 er sendt (motoren ville
      // ellers have sagt afventer_pris). Defensivt 0 frem for NaN i mailen.
      const beloebKr = (link.prisniveau_oere ?? 0) / 100;
      const trinNoegle = String(trin) as "14" | "25" | "31";

      if (toerKoersel) {
        console.log(
          `[indgangs-paamindelser-cron] TØRKØRSEL ville sende dag ${trin} til ${til} (${company.name}, ${tilstand.dage_siden_mail} dage siden mail)`,
        );
        resultat.ville_sende++;
        resultat.pr_trin[trinNoegle]++;
        if (trin === 31) {
          resultat.faktura_i_haanden.push({ company_id: link.company_id, virksomhed: company.name, beloeb_kr: beloebKr });
        }
        continue;
      }

      // 4. Mailen. Fristen regnes fra betalingsmail_sendt_at — samme dato
      //    som dag 0-mailen og betalingssiden.
      const mail = bygPaamindelse(trin, {
        fornavn: fornavnAf(company.contact_person),
        betalingsUrl: `${APP_URL}/betal?token=${encodeURIComponent(link.token)}`,
        fristDato: formatDanskDato(betalingsfristDato(link.betalingsmail_sendt_at as string)),
        beloebKr,
      });

      const ok = await sendIndgangsMail({
        adminClient: supabase,
        til,
        subject: mail.subject,
        html: mail.html,
        label: `indgang-dag${trin}`,
        companyId: link.company_id,
      });
      if (!ok) {
        // Stemplet sættes IKKE — prøves igen i morgen.
        resultat.fejlet++;
        continue;
      }

      // 5. Kun ved succes: stempel med det trin der faktisk gik.
      const { error: stempelErr } = await supabase
        .from("company_betalingslink")
        .update({ sidste_paamindelse_dag: trin, updated_at: now.toISOString() })
        .eq("company_id", link.company_id);
      if (stempelErr) {
        // Mailen ER i køen; uden stempel sendes den igen i morgen. Skal ses.
        console.error(
          `[indgangs-paamindelser-cron] KRITISK: dag ${trin} er enqueued for ${link.company_id} men sidste_paamindelse_dag kunne ikke sættes — sæt det i hånden:`,
          stempelErr,
        );
        resultat.fejlet++;
        continue;
      }

      resultat.sendt++;
      resultat.pr_trin[trinNoegle]++;
      console.log(`[indgangs-paamindelser-cron] dag ${trin} sendt til ${til} (${company.name})`);

      if (trin === 31) {
        // LEDDET MANGLER: fakturaen på det fulde beløb via Stripe Invoicing
        // (docs/indgangen-design.md §4) er ikke bygget. Mailen lover en
        // faktura «i en separat mail fra Stripe» — den skal sendes i hånden
        // fra Stripe-dashboardet, i dag.
        console.error(
          `[indgangs-paamindelser-cron] FAKTURA I HÅNDEN: ${company.name} (${link.company_id}) har fået dag 31-mailen. Send fakturaen på ${beloebKr} kr. manuelt via Stripe Invoicing — automatikken er ikke bygget.`,
        );
        resultat.faktura_i_haanden.push({ company_id: link.company_id, virksomhed: company.name, beloeb_kr: beloebKr });
      }
    } catch (err) {
      console.error(`[indgangs-paamindelser-cron] Fejl for company ${link.company_id}:`, err);
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
  // sendes og intet skrives. Kun et eksplicit { "dry_run": false } sender.
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

  const resultat = await koerPaamindelser(supabase, toerKoersel);
  console.log("[indgangs-paamindelser-cron] Summary:", JSON.stringify(resultat));

  return new Response(JSON.stringify(resultat), {
    status: resultat.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
