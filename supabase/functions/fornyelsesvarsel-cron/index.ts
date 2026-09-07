// Fornyelsens varsler — varsel 1 ved 30 dage før slutdato, varsel 2 ved 7.
//
// SAMME FORM SOM indgangs-paamindelser-cron: HTTP-indgang (IKKE Deno.cron —
// den eksekveres aldrig på Supabases edge-runtime, målt 13/8),
// authenticateServiceRole bag verify_jwt = true (Bucket B), og TØRKØRSEL
// SOM STANDARD: uden body findes kandidaterne og logges, men intet sendes
// og intet skrives. Kun et eksplicit { "dry_run": false } sender.
//
// AFSENDELSEN OG STEMPLINGEN (bygget 7/9, efter den rene rapport i #681):
// mailen bygges af varsel1Mail / varsel2Mail (_shared/fornyelsesMail.ts,
// #694), lægges i køen transactional_emails med sendIndgangsMail (samme
// send-vej og samme email_send_log-bogføring som indgangen), og FØRST NÅR
// enqueue lykkedes stemples varsel_1_sendt_at eller varsel_2_sendt_at på
// company_fornyelse. Tabellen har INGEN updated_at-trigger (målt 7/9), så
// updated_at sættes her. Fejler stemplet EFTER en vellykket afsendelse,
// logges det KRITISK og tælles som fejl — mailen ER i køen, og uden
// stempel går den igen i morgen: hellere en dublet end tavshed (samme
// regel som indgangs-paamindelser-cron:315-328). Fejler afsendelsen,
// stemples der ikke, og der prøves igen i morgen.
//
// MODTAGEREN er companies.contact_email, som indgangen (contact_person
// giver fornavnet). Ingen adresse → sprunget over med grund, ikke en fejl.
// PRISEN er beregnFornyelsespris (_shared/fornyelsespris.ts) — samme
// kilde som hent-fornyelsestilbud; grundbeløbet er ens for alle tre
// modeller, så ét kald (fuld) er nok. Kan prisen ikke regnes (ingen
// indgangspris, ukendt prispunkt), sendes der IKKE: et varsel uden pris
// er værre end tavshed — sprunget over med grund, logget.
// Rådgiver-notifikationen når mail 1 er sendt (ordningens §7) er IKKE
// bygget her.
//
// TØRKØRSLEN dømmer, finder modtager og pris, og fortæller hvem der ville
// få hvad — uden at sende og uden at stemple. Det er den eneste måling
// før jobbet tændes.
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
// først når en tørkørsel med den nye kode er læst.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";
import { authenticateServiceRole, corsHeaders } from "../_shared/edgeFunctionAuth.ts";
import { afgoerForfaldentVarsel, type Varselsnummer } from "../_shared/fornyelsesvarsel.ts";
import { LABEL_VARSEL_1, LABEL_VARSEL_2, varsel1Mail, varsel2Mail } from "../_shared/fornyelsesMail.ts";
import { beregnFornyelsespris, erFejl } from "../_shared/fornyelsespris.ts";
import { formatDanskDato, fornavnAf, sendIndgangsMail } from "../_shared/indgangsMailAfsendelse.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface VarselsResultat {
  ok: boolean;
  dry_run: boolean;
  /** Undersøgte: fornyelsesrækker med beslutning 'tilbyd' og en virksomhed med slutdato. */
  fundet: number;
  /** Enqueuede mails, stemplet (altid 0 i tørkørsel). */
  sendt: number;
  /** Kun tørkørsel: ville have fået en mail (modtager og pris fundet). */
  ville_sende: number;
  /** Motoren siger varsel 1 er forfaldent nu. */
  varsel_1: number;
  /** Motoren siger varsel 2 er forfaldent nu. */
  varsel_2: number;
  sprunget_over: {
    /** Motoren siger intet varsel (for tidligt, allerede sendt, slutdato passeret). */
    ingen_forfalden: number;
    /** companies-rækken mangler, har ingen slutdato, eller kunne ikke læses. */
    ingen_virksomhed: number;
    /** contact_email er tom — kan ikke sendes, stemples ikke. */
    ingen_email: number;
    /** Prisen kan ikke regnes (ingen indgangspris / ukendt prispunkt) — sendes ikke, stemples ikke. */
    ingen_pris: number;
  };
  /** De sprungne over med grund, så en tørkørsel viser HVEM der mangler HVAD. */
  sprunget_over_liste: { company_id: string; virksomhed: string; varsel: Varselsnummer; grund: string }[];
  /** Sendingen eller stemplet fejlede — prøves igen i morgen (uventet fejl tæller også her). */
  fejlet: number;
  /** Én post pr. virksomhed med et forfaldent varsel — grunden er motorens, skrevet til at blive læst. */
  forfaldne: {
    company_id: string;
    virksomhed: string;
    dage_til_udloeb: number | null;
    varsel: Varselsnummer;
    grund: string;
    /** Modtageren og prisen som mailen ville bære — null når de mangler (se sprunget_over_liste). */
    modtager: string | null;
    beloeb_kr: number | null;
  }[];
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
  contact_person: string | null;
  contact_email: string | null;
  indgangspris_oere: number | null;
  fornyelsespris_oere: number | null;
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
    ville_sende: 0,
    varsel_1: 0,
    varsel_2: 0,
    sprunget_over: { ingen_forfalden: 0, ingen_virksomhed: 0, ingen_email: 0, ingen_pris: 0 },
    sprunget_over_liste: [],
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
    .select("id, name, contract_end_date, contact_person, contact_email, indgangspris_oere, fornyelsespris_oere")
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

      // 4. Modtageren — som indgangen: contact_email. Tom adresse er ikke
      //    en fejl der vælter kørslen; den tælles og listes, så rådgiveren
      //    kan rette virksomheden.
      const til = (company.contact_email ?? "").trim();

      // 5. Prisen — SAMME kilde som hent-fornyelsestilbud
      //    (beregnFornyelsespris). Grundbeløbet er ens for alle tre
      //    betalingsmodeller, så ét kald (fuld) giver det tal mailen bærer.
      //    Fejl (ingen indgangspris / ukendt prispunkt) → intet varsel: et
      //    varsel uden pris er værre end tavshed.
      const pris = beregnFornyelsespris({
        indgangspris_oere: company.indgangspris_oere ?? null,
        fornyelsespris_oere: company.fornyelsespris_oere ?? null,
        betalingsmodel: "fuld",
      });
      const beloebKr = erFejl(pris) ? null : pris.grundbeloeb_oere / 100;

      resultat.forfaldne.push({
        company_id: fornyelse.company_id,
        virksomhed: company.name,
        dage_til_udloeb: varsel.dage_til_udloeb,
        varsel: varsel.varsel,
        grund: varsel.grund,
        modtager: til || null,
        beloeb_kr: beloebKr,
      });

      if (!til) {
        console.error(
          `[fornyelsesvarsel-cron] ${company.name} (${fornyelse.company_id}) har ingen contact_email — varsel ${varsel.varsel} ikke sendt`,
        );
        resultat.sprunget_over.ingen_email++;
        resultat.sprunget_over_liste.push({ company_id: fornyelse.company_id, virksomhed: company.name, varsel: varsel.varsel, grund: "ingen contact_email" });
        continue;
      }
      if (erFejl(pris) || beloebKr === null) {
        const grund = erFejl(pris) ? `${pris.grund} — ${pris.detalje}` : "ingen pris";
        console.error(
          `[fornyelsesvarsel-cron] ${company.name} (${fornyelse.company_id}): prisen kan ikke regnes (${grund}) — varsel ${varsel.varsel} ikke sendt`,
        );
        resultat.sprunget_over.ingen_pris++;
        resultat.sprunget_over_liste.push({ company_id: fornyelse.company_id, virksomhed: company.name, varsel: varsel.varsel, grund: `prisen kan ikke regnes: ${grund}` });
        continue;
      }

      if (toerKoersel) {
        console.log(
          `[fornyelsesvarsel-cron] TØRKØRSEL ville sende varsel ${varsel.varsel} til ${til} (${company.name}, ${varsel.dage_til_udloeb} dage til slutdato, ${beloebKr} kr.)`,
        );
        resultat.ville_sende++;
        continue;
      }

      // 6. Mailen. Slutdatoen som dansk dato med år (formatDanskDato, UTC-
      //    komponenter — contract_end_date er en date-kolonne, så
      //    new Date("YYYY-MM-DD") er UTC-midnat og datoen bliver den samme).
      const args = {
        fornavn: fornavnAf(company.contact_person),
        virksomhed: company.name,
        slutDato: formatDanskDato(new Date(company.contract_end_date!)),
        beloebKr,
      };
      const mail = varsel.varsel === 1 ? varsel1Mail(args) : varsel2Mail(args);
      const label = varsel.varsel === 1 ? LABEL_VARSEL_1 : LABEL_VARSEL_2;

      const ok = await sendIndgangsMail({
        adminClient: supabase,
        til,
        subject: mail.subject,
        html: mail.html,
        label,
        companyId: fornyelse.company_id,
      });
      if (!ok) {
        // Stemplet sættes IKKE — prøves igen i morgen.
        resultat.fejlet++;
        continue;
      }

      // 7. Kun ved succes: stempel det varsel der faktisk gik. updated_at
      //    sættes her — company_fornyelse har ingen trigger (målt 7/9).
      const stempelfelt = varsel.varsel === 1 ? "varsel_1_sendt_at" : "varsel_2_sendt_at";
      const { error: stempelErr } = await supabase
        .from("company_fornyelse")
        .update({ [stempelfelt]: now.toISOString(), updated_at: now.toISOString() })
        .eq("company_id", fornyelse.company_id);
      if (stempelErr) {
        // Mailen ER i køen; uden stempel sendes den igen i morgen. Skal ses.
        console.error(
          `[fornyelsesvarsel-cron] KRITISK: varsel ${varsel.varsel} er enqueued for ${fornyelse.company_id} men ${stempelfelt} kunne ikke sættes — sæt det i hånden:`,
          stempelErr,
        );
        resultat.fejlet++;
        continue;
      }

      resultat.sendt++;
      console.log(`[fornyelsesvarsel-cron] varsel ${varsel.varsel} sendt til ${til} (${company.name})`);
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

  const resultat = await koerVarsler(supabase, toerKoersel);
  console.log("[fornyelsesvarsel-cron] Summary:", JSON.stringify(resultat));

  return new Response(JSON.stringify(resultat), {
    status: resultat.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
