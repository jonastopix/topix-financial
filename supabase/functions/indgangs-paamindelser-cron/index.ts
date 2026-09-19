// Indgangens påmindelser — dag 14, 25 og 31 efter betalingsmailen — og
// DAG 60 (18/9 aften): en underskrevet, ubetalt aftale er død; ansøgningen
// lukkes gennem motoren, rådgiverne får en klokke (lukDoedAftale nederst;
// dommen er erAftaleDoed i _shared/betalingsfrist.ts). RETTET 19/9:
// lukkeårsagen afhænger af faktura_sendt_at — «betalte ikke» kun når der
// FAKTISK blev sendt en faktura, ellers «udløbet». Se lukDoedAftales hoved.
//
// KØRSLEN STOPPER SELV (19/9): et tidsbudget (STANDARD_BUDGET_MS, kan hæves
// med { "budget_ms": … }) og et stop ved rate limit (skalKoeStoppe). Femten
// dag 31-rækker i én kørsel tager længere end kald_edge's standard-timeout,
// og en afbrudt kørsel skal være vores egen beslutning, ikke pg_nets saks.
// Rækkefølgen er ældste underskrift først, så ingen sultes.
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
// giver 25, ikke 14). DAGENE ER KONTRAKTENS (rettet 2/9): de regnes fra
// underskrevet_at, ikke fra betalingsmailen. Kom dag 0 sent (prisen sat
// dag 20), er første påmindelse dag 25 — rytmen følger fristen. Cronen sender den og stempler
// sidste_paamindelse_dag med det trin der faktisk gik. Fejler sendingen,
// stemples der IKKE, så mailen prøves igen næste dag (samme regel som
// intro-reminder-cron:220).
//
// DAG 31 (bygget 3/9): FAKTURAEN FØRST, mailen bagefter. Mailen siger i
// datid «har vi sendt dig en faktura … i en separat mail fra Stripe», så
// fakturaen skal findes før mailen går. sendIndgangsFaktura
// (_shared/indgangsFaktura.ts) opretter og sender den via Stripe
// Invoicing og er idempotent (stempel faktura_invoice_id + opslag hos
// Stripe), så «fandtes allerede» tæller som klar. Fejler eller springes
// fakturaen over, sendes dag 31-mailen IKKE, intet stemples, og
// virksomheden står i svarets faktura_i_haanden med grund: send fakturaen
// manuelt, eller ret fejlen — så prøves der igen i morgen. Tørkørslen
// kalder IKKE motoren: den opretter ingen faktura og skriver intet.
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
// SIDEN 19/9 planlægges jobbet gennem public.kald_edge med en højere timeout
// og et matchende budget — se migration 20260919160000. Formen nedenfor er
// den oprindelige (rå net.http_post) og står som historik:
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
import { afgoerBetalingsfrist, AFTALE_DOED_DAG, erAftaleDoed, type Paamindelsesdag } from "../_shared/betalingsfrist.ts";
import { hentAnsoegning, RAADGIVER_BESKED, REFERENCE_TYPE, udfoerOvergang, virksomhedsnavnAf } from "../_shared/ansoegningMotor.ts";
import { skrivRaadgiverBesked } from "../_shared/raadgiverBesked.ts";
import { dag14Mail, dag25Mail, dag31Mail, type IndgangsMail } from "../_shared/indgangsMail.ts";
import { hentFakturaBeloeb, sendIndgangsFaktura } from "../_shared/indgangsFaktura.ts";
import {
  betalingsfristDato,
  formatDanskDato,
  fornavnAf,
  sendIndgangsMailMedUdfald,
} from "../_shared/indgangsMailAfsendelse.ts";
import { skalKoeStoppe } from "../_shared/mailFejl.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = "https://app.theboardroom.dk";

/**
 * TIDSBUDGET (19/9, recon-indgangspaamindelser §4). Kald_edge kalder med en
 * KLIENT-timeout; løber den ud, lukker pg_net forbindelsen og edge-funktionen
 * AFBRYDES midt i løkken (målt 3/9 og 10/9). Dag 31 koster op til seks
 * Stripe-kald + én mail pr. række — målt 16/9: ca. 3,5 sekunder. Femten
 * underskrifter samme aften giver én dag med femten dag 31-rækker ≈ 50
 * sekunder, og standard-timeouten er 30.
 *
 * Derfor stopper kørslen SELV, før timeouten gør det: så når den at stemple
 * det den har gjort, at svare, og at sige hvor mange der er tilbage. De
 * resterende tages næste døgn — intet tabes (stemplet sættes pr. række), og
 * rækkefølgen er ÆLDSTE UNDERSKRIFT FØRST, så de samme aldrig sultes.
 *
 * STANDARD 25 s ligger under kald_edge's standard-timeout (30 s), så den er
 * sikker uden nogen SQL-ændring. Jobbet kan give mere: migration
 * 20260919160000 planlægger det med timeout 120 s og { "budget_ms": 100000 }.
 * Budgettet skal ALTID være mindre end jobbets timeout.
 */
const STANDARD_BUDGET_MS = 25_000;
/** Loftet følger kald_edge_loft_ms() (150 s) minus plads til at svare. */
const MAKS_BUDGET_MS = 140_000;

interface PaamindelsesResultat {
  ok: boolean;
  dry_run: boolean;
  /** Linkrækker med betalingsmail_sendt_at sat (betalt sorteres fra af motoren, ikke af opslaget — 11/9). */
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
  /**
   * Kørslen stoppede SELV (19/9): "tid" = tidsbudgettet var brugt (se
   * STANDARD_BUDGET_MS), "rate_limit" = udbyderen svarede 429 og de næste
   * ville ramme samme mur (skalKoeStoppe, _shared/mailFejl.ts). null = alle
   * kandidater blev behandlet.
   */
  afbrudt: null | "tid" | "rate_limit";
  /** Kandidater der IKKE blev forsøgt, fordi kørslen stoppede. De tages næste døgn. */
  resterende: number;
  /** Tidsbudgettet for denne kørsel (ms) og hvor lang tid løkken faktisk tog. */
  budget_ms: number;
  varighed_ms: number;
  /**
   * DØD PÅ DAG 60 (18/9 aften): underskrevet, ubetalt i AFTALE_DOED_DAG dage → ansøgningen lukkes
   * «betalte_ikke» gennem motoren (via koe) og rådgiverne får en klokke; ingen påmindelse/faktura
   * sendes for en død aftale. uden_ansoegning: linkrækken har intet ansoegning_id (Monday-vejen) —
   * intet at lukke. allerede: ansøgningen står ikke på «underskrevet» (lukket i går, eller genåbnet).
   * TO ÅRSAGER (19/9): «betalte ikke» kræver at fakturaen ER sendt (faktura_sendt_at). Blev der
   * aldrig bedt om pengene, lukkes der «udloebet» — se lukDoedAftale.
   */
  doede: {
    lukket: number;
    ville_lukke: number;
    uden_ansoegning: number;
    allerede: number;
    fejlet: number;
    /**
     * Af de lukkede: hvor mange der blev lukket «betalte ikke» (fakturaen VAR
     * sendt) og hvor mange «udløbet» (der blev aldrig sendt en faktura — 19/9).
     */
    betalte_ikke: number;
    udloebet: number;
  };
  /** Fordeling af det der blev sendt / ville sendes, pr. trin. */
  pr_trin: Record<"14" | "25" | "31", number>;
  /** Dag 31: fakturaen via Stripe Invoicing (_shared/indgangsFaktura.ts), sendt FØR mailen. */
  faktura: {
    /** Oprettet og sendt i denne kørsel. */
    sendt: number;
    /** Fandtes allerede (stempel eller hos Stripe) — mailen sendes alligevel, hvis den ikke er gået. */
    fandtes_allerede: number;
    /** Sendt, men Stripe Tax kunne ikke regne moms (typisk manglende adresse) — tjek fakturaen i Stripe. */
    uden_moms: { company_id: string; virksomhed: string; invoice_id: string }[];
    /** Kun tørkørsel: ville have oprettet og sendt en faktura. */
    ville_sende: number;
  };
  /**
   * Dag 31 nået, men fakturaen kunne IKKE sendes (sprunget over eller
   * fejlet). Dag 31-mailen er så IKKE sendt, og intet er stemplet: send
   * fakturaen i hånden fra Stripe, eller ret grunden — så prøves der
   * igen i morgen.
   */
  faktura_i_haanden: { company_id: string; virksomhed: string; beloeb_kr: number; grund: string }[];
  error?: string;
}

interface LinkRaekke {
  company_id: string;
  /** Ansøgningen bag virksomheden (e-underskriften, 18/9) — null ad Monday-vejen. */
  ansoegning_id: string | null;
  prisniveau_oere: number | null;
  underskrevet_at: string;
  token: string;
  betalingsmail_sendt_at: string | null;
  sidste_paamindelse_dag: number | null;
  /** Stemplet fra _shared/indgangsFaktura.ts — sat KUN når dag 31-fakturaen faktisk er sendt. */
  faktura_sendt_at: string | null;
}

interface VirksomhedsRaekke {
  id: string;
  name: string;
  contact_person: string | null;
  contact_email: string | null;
  contract_end_date: string | null;
}

/** Fakturaens tal til dag 31 — total og om momsen blev beregnet (10/9). */
interface FakturaBeloeb {
  totalOere: number | null;
  momsBeregnet: boolean | null;
}

function bygPaamindelse(
  trin: Paamindelsesdag,
  a: { fornavn: string | null; betalingsUrl: string; fristDato: string; beloebKr: number; faktura?: FakturaBeloeb | null },
): IndgangsMail {
  switch (trin) {
    case 14:
      return dag14Mail({ fornavn: a.fornavn, betalingsUrl: a.betalingsUrl });
    case 25:
      return dag25Mail({ fornavn: a.fornavn, betalingsUrl: a.betalingsUrl, fristDato: a.fristDato, beloebKr: a.beloebKr });
    case 31:
      return dag31Mail({
        fornavn: a.fornavn,
        beloebKr: a.beloebKr,
        fakturaTotalOere: a.faktura?.totalOere ?? null,
        momsBeregnet: a.faktura?.momsBeregnet ?? null,
      });
  }
}

async function koerPaamindelser(
  supabase: SupabaseClient,
  toerKoersel: boolean,
  budgetMs: number,
): Promise<PaamindelsesResultat> {
  const startMs = Date.now();
  const resultat: PaamindelsesResultat = {
    ok: true,
    dry_run: toerKoersel,
    fundet: 0,
    sendt: 0,
    ville_sende: 0,
    sprunget_over: { ingen_forfalden: 0, betalt: 0, ingen_virksomhed: 0, ingen_email: 0 },
    doede: { lukket: 0, ville_lukke: 0, uden_ansoegning: 0, allerede: 0, fejlet: 0, betalte_ikke: 0, udloebet: 0 },
    fejlet: 0,
    afbrudt: null,
    resterende: 0,
    budget_ms: budgetMs,
    varighed_ms: 0,
    pr_trin: { "14": 0, "25": 0, "31": 0 },
    faktura: { sendt: 0, fandtes_allerede: 0, uden_moms: [], ville_sende: 0 },
    faktura_i_haanden: [],
  };

  // 1. Målgruppe: linkrækker hvor dag 0 ER sendt. contract_end_date
  //    ligger på companies og filtreres i trin 2 — to enkle opslag frem
  //    for et embedded filter; mængden er lille (nye medlemmer i deres
  //    første måned).
  // ÆLDSTE UNDERSKRIFT FØRST (19/9): stopper kørslen på sit tidsbudget, skal
  // de mest presserende være taget — og rækkefølgen skal være den samme hver
  // dag, så de sidste i listen aldrig sultes flere døgn i træk.
  const { data: links, error: linkErr } = await supabase
    .from("company_betalingslink")
    .select("company_id, ansoegning_id, prisniveau_oere, underskrevet_at, token, betalingsmail_sendt_at, sidste_paamindelse_dag, faktura_sendt_at")
    .not("betalingsmail_sendt_at", "is", null)
    .order("underskrevet_at", { ascending: true });
  if (linkErr) {
    console.error("[indgangs-paamindelser-cron] company_betalingslink-opslag fejlede:", linkErr.message);
    return { ...resultat, ok: false, error: linkErr.message };
  }
  const linkRaekker = (links ?? []) as LinkRaekke[];
  if (linkRaekker.length === 0) {
    console.log("[indgangs-paamindelser-cron] Ingen linkrækker med betalingsmail sendt");
    return resultat;
  }

  // 2. Virksomhederne — ALLE med en linkrække. Før (til 11/9) filtrerede
  //    opslaget på «contract_end_date er null»: «betalt» dømt på at datoen
  //    fandtes, så en tidligere kunde med en passeret slutdato fik aldrig
  //    en påmindelse. Nu dømmer motoren i trin 3 (erGaeldendeSlutdato) — én
  //    dom, ikke et filter og en dom der kan glide fra hinanden.
  const { data: companies, error: companyErr } = await supabase
    .from("companies")
    .select("id, name, contact_person, contact_email, contract_end_date")
    .in("id", linkRaekker.map((l) => l.company_id));
  if (companyErr) {
    console.error("[indgangs-paamindelser-cron] companies-opslag fejlede:", companyErr.message);
    return { ...resultat, ok: false, error: companyErr.message };
  }
  const virksomheder = new Map<string, VirksomhedsRaekke>();
  for (const c of (companies ?? []) as VirksomhedsRaekke[]) virksomheder.set(c.id, c);

  const kandidater = linkRaekker.filter((l) => virksomheder.has(l.company_id));
  resultat.fundet = kandidater.length;
  const now = new Date();

  for (let i = 0; i < kandidater.length; i++) {
    const link = kandidater[i];
    // TIDSBUDGETTET (19/9): stop SELV, før kald_edge's timeout klipper os midt i
    // en Stripe-faktura. Det der er stemplet, er stemplet; resten tages i morgen.
    if (Date.now() - startMs >= budgetMs) {
      resultat.afbrudt = "tid";
      resultat.resterende = kandidater.length - i;
      console.warn(
        `[indgangs-paamindelser-cron] TIDSBUDGET brugt (${budgetMs} ms): ${resultat.resterende} af ${kandidater.length} kandidater blev ikke forsøgt i dag — de tages næste kørsel (ældste underskrift først). Er det gentaget, skal jobbets timeout og budget hæves (migration 20260919160000).`,
      );
      break;
    }
    const company = virksomheder.get(link.company_id);
    if (!company) {
      resultat.sprunget_over.ingen_virksomhed++;
      continue;
    }

    try {
      // 3. Motoren afgør — betalt vinder altid (en slutdato der GÆLDER),
      //    og det er her og kun her det dømmes (11/9).
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
      // DØD PÅ DAG 60 — før påmindelserne: en død aftale får hverken rykker eller faktura (springet
      // ville ellers sende dag 31 på dag 60, hvis intet var sendt). Idempotent gennem motoren: er
      // ansøgningen ikke længere «underskrevet», er der intet at gøre.
      if (erAftaleDoed(tilstand)) {
        await lukDoedAftale(supabase, link, company, tilstand.dage_siden_underskrift ?? AFTALE_DOED_DAG, now, toerKoersel, resultat);
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
          `[indgangs-paamindelser-cron] TØRKØRSEL ville sende dag ${trin} til ${til} (${company.name}, ${tilstand.dage_siden_underskrift} dage siden underskrift)`,
        );
        resultat.ville_sende++;
        resultat.pr_trin[trinNoegle]++;
        if (trin === 31) {
          // Ingen faktura i tørkørsel — motoren kaldes ikke, intet oprettes.
          resultat.faktura.ville_sende++;
        }
        continue;
      }

      // 3b. DAG 31: FAKTURAEN FØRST. Mailen nedenfor siger i datid «har vi
      //     sendt dig en faktura … i en separat mail fra Stripe», så den
      //     må ikke gå før fakturaen findes. Motoren er idempotent, så en
      //     faktura der allerede er sendt (fx mailen fejlede i går) giver
      //     «fandtes allerede», og mailen går så nu. Kan fakturaen ikke
      //     sendes, springes mailen OG stemplet over — næste kørsel prøver
      //     igen, og svaret bærer virksomheden i faktura_i_haanden.
      // Dag 31-mailen skriver FAKTURAENS beløb (10/9): totalen og om momsen
      // blev beregnet. Ved «sendt» står det i resultatet; fandtes fakturaen
      // i forvejen, slås den op — og fejler det, falder mailen tilbage på
      // listeprisen mærket «ekskl. moms» (fakturaBeloebTekst).
      let fakturaBeloeb: FakturaBeloeb | null = null;
      if (trin === 31) {
        const faktura = await sendIndgangsFaktura(supabase, link.company_id);
        if (faktura.udfald === "sendt") {
          resultat.faktura.sendt++;
          fakturaBeloeb = { totalOere: faktura.total_oere, momsBeregnet: faktura.moms_beregnet };
          if (!faktura.moms_beregnet) {
            resultat.faktura.uden_moms.push({ company_id: link.company_id, virksomhed: company.name, invoice_id: faktura.invoice_id });
          }
        } else if (faktura.udfald === "fandtes_allerede") {
          resultat.faktura.fandtes_allerede++;
          if (typeof faktura.total_oere === "number") {
            fakturaBeloeb = { totalOere: faktura.total_oere, momsBeregnet: faktura.moms_beregnet ?? null };
          } else {
            const hentet = await hentFakturaBeloeb(faktura.invoice_id);
            fakturaBeloeb = hentet ? { totalOere: hentet.total_oere, momsBeregnet: hentet.moms_beregnet } : null;
          }
        } else {
          const grund = faktura.udfald === "fejlet" ? faktura.aarsag : faktura.grund;
          console.error(
            `[indgangs-paamindelser-cron] FAKTURA I HÅNDEN: ${company.name} (${link.company_id}) er på dag 31, men fakturaen kunne ikke sendes (${grund}). Dag 31-mailen er IKKE sendt og intet stemplet. Send fakturaen manuelt via Stripe Invoicing, eller ret grunden — så prøves der igen i morgen.`,
          );
          resultat.faktura_i_haanden.push({ company_id: link.company_id, virksomhed: company.name, beloeb_kr: beloebKr, grund });
          resultat.fejlet++;
          continue;
        }
      }

      // 4. Mailen. Fristen er kontraktens: regnes fra underskrevet_at
      //    (rettet 2/9) — samme dato som dag 0-mailen og betalingssiden.
      const mail = bygPaamindelse(trin, {
        fornavn: fornavnAf(company.contact_person),
        betalingsUrl: `${APP_URL}/betal?token=${encodeURIComponent(link.token)}`,
        fristDato: formatDanskDato(betalingsfristDato(link.underskrevet_at)),
        beloebKr,
        faktura: fakturaBeloeb,
      });

      const udfald = await sendIndgangsMailMedUdfald({
        adminClient: supabase,
        til,
        subject: mail.subject,
        html: mail.html,
        label: `indgang-dag${trin}`,
        companyId: link.company_id,
      });
      if (!udfald.sent) {
        // Stemplet sættes IKKE — prøves igen i morgen.
        resultat.fejlet++;
        // RATE LIMIT (19/9): udbyderens loft er pr. time og deles af HELE
        // arbejdsområdet. De næste ville ramme nøjagtig samme mur, hver med sin
        // logrække — én besked er nok. Samme dom som send-notification-email og
        // ansoegning-rykker-cron (skalKoeStoppe, _shared/mailFejl.ts).
        if (skalKoeStoppe(udfald)) {
          resultat.afbrudt = "rate_limit";
          resultat.resterende = kandidater.length - i - 1;
          console.error(
            `[indgangs-paamindelser-cron] RATE LIMIT hos udbyderen — kørslen stopper. ${resultat.resterende} af ${kandidater.length} kandidater blev ikke forsøgt; intet er stemplet, så de tages næste kørsel.`,
          );
          break;
        }
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
    } catch (err) {
      console.error(`[indgangs-paamindelser-cron] Fejl for company ${link.company_id}:`, err);
      resultat.fejlet++;
    }
  }

  resultat.varighed_ms = Date.now() - startMs;
  return resultat;
}

/**
 * Hvorfor blev der aldrig sendt en faktura? Ren dom over de tre kendte grunde — teksten går ordret i
 * klokken, så en rådgiver kan se, hvad der skulle have været gjort. Rækkefølgen er cronens egen:
 * prisen spærrer før mailen, mailen før fakturaen.
 */
function aarsagUdenFaktura(link: LinkRaekke, company: VirksomhedsRaekke): string {
  if (link.prisniveau_oere === null) return "prisniveauet blev aldrig sat, så hverken betalingsmail eller faktura kunne sendes";
  if (!(company.contact_email ?? "").trim()) return "virksomheden har ingen kontaktmail, så hverken betalingsmail eller faktura kunne sendes";
  return "fakturaen kunne ikke sendes — se faktura_i_haanden i cronens svar og loggen fra _shared/indgangsFaktura.ts";
}

/**
 * Dag 60 (18/9 aften): ansøgningen bag linkrækken lukkes gennem motoren (underskrevet → lukket, alle
 * trapper annulleret, sporet skrevet via «koe»), så klokke til rådgiverne. Virksomheden røres IKKE
 * (den er oprettet ved underskriften) — hvad der skal ske med den, er økonomisidens beslutning
 * (README). Tørkørsel: tæller ville_lukke, skriver intet.
 *
 * TO ÅRSAGER, IKKE ÉN (19/9, recon-indgangspaamindelser §3 og §6). erAftaleDoed dømmer «alt andet end
 * betalt», og det rammer også de aftaler, hvor der ALDRIG blev bedt om pengene: prisen blev aldrig
 * sat (afventer_pris — så er der ikke engang sendt en dag 0-mail), kontaktmailen er tom, eller
 * fakturaen fejlede hver dag fra 31 til 60. Før 19/9 fik alle tre lukkeårsagen «betalte ikke» og en
 * klokke, der sagde «fakturaen fra dag 31 er ubetalt» — om en faktura, der ikke findes, og med
 * skylden lagt hos en, der aldrig blev spurgt. Stemplet faktura_sendt_at (sat KUN når Stripe har
 * sendt, _shared/indgangsFaktura.ts) afgør nu:
 *   sat   → betalte_ikke · lukkeårsag «betalte_ikke» · klokken nævner fakturaens dato
 *   tom   → udloeb       · lukkeårsag «udloebet»    · klokken siger, at der aldrig blev sendt en, og hvorfor
 * Begge veje er samme død og samme genåbning («afholdt»); begge værdier er kendt af databasens to
 * CHECK-lister i forvejen, så der følger ingen migration med.
 */
async function lukDoedAftale(
  supabase: SupabaseClient,
  link: LinkRaekke,
  company: VirksomhedsRaekke,
  dage: number,
  now: Date,
  toerKoersel: boolean,
  resultat: PaamindelsesResultat,
): Promise<void> {
  if (!link.ansoegning_id) {
    resultat.doede.uden_ansoegning++;
    return;
  }
  const a = await hentAnsoegning(supabase, link.ansoegning_id);
  if (!a || a.trin !== "underskrevet") {
    resultat.doede.allerede++;
    return;
  }
  // Fakturaen afgør årsagen (19/9). Stemplet, ikke dagstallet: dag 31 kan være
  // passeret, uden at der nogensinde gik en faktura.
  const fakturaSendt = (link.faktura_sendt_at ?? "").trim();
  const betalteIkke = fakturaSendt !== "";
  const aarsag = betalteIkke ? "betalte ikke" : "udløbet";

  if (toerKoersel) {
    resultat.doede.ville_lukke++;
    console.log(`[indgangs-paamindelser-cron] TØRKØRSEL ville lukke ansøgningen «${aarsag}» for ${company.name} (${link.company_id}, dag ${dage})`);
    return;
  }
  const handling = betalteIkke ? ({ art: "betalte_ikke" } as const) : ({ art: "udloeb" } as const);
  const res = await udfoerOvergang(supabase, { ansoegning: a, handling, via: "koe", truffetAf: null, nu: now });
  if (res.ok === false) {
    console.error(`[indgangs-paamindelser-cron] ${handling.art} afvist for ${a.id} (${company.name}): ${res.grund}`);
    resultat.doede.fejlet++;
    return;
  }
  const navn = virksomhedsnavnAf(a);
  const halen = `Virksomheden «${company.name}» står stadig i platformen uden slutdato — se økonomisiden.`;
  await skrivRaadgiverBesked(supabase, {
    type: RAADGIVER_BESKED.lukket_af_koen,
    title: betalteIkke ? `Lukket: ${navn} betalte ikke` : `Lukket: ${navn} blev aldrig bedt om pengene`,
    body: betalteIkke
      ? `Dag ${dage} efter underskriften — fakturaen fra dag 31 (sendt ${formatDanskDato(new Date(fakturaSendt))}) er ubetalt. Ansøgningen er lukket «betalte ikke» og kan genåbnes. ${halen}`
      : `Dag ${dage} efter underskriften — og der blev ALDRIG sendt en faktura: ${aarsagUdenFaktura(link, company)}. Ansøgningen er derfor lukket «udløbet», ikke «betalte ikke»: ${navn} er aldrig blevet bedt om pengene. Den kan genåbnes. ${halen}`,
    reference_type: REFERENCE_TYPE,
    reference_id: a.id,
  });
  resultat.doede.lukket++;
  if (betalteIkke) resultat.doede.betalte_ikke++;
  else resultat.doede.udloebet++;
  console.log(`[indgangs-paamindelser-cron] ansøgningen ${a.id} lukket «${aarsag}» (${company.name}, dag ${dage})`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = authenticateServiceRole(req);
  if (auth !== true) return auth;

  // TØRKØRSEL default: uden body findes kandidaterne og logges, men intet
  // sendes og intet skrives. Kun et eksplicit { "dry_run": false } sender.
  //
  // budget_ms (19/9): hvor længe løkken må køre, før den stopper SELV og svarer.
  // Skal altid være mindre end kalderens timeout — se STANDARD_BUDGET_MS. Et
  // ulæseligt eller urimeligt tal falder tilbage på standarden frem for at
  // vælte kørslen: en cron skal køre, også når nogen har skrevet noget sludder
  // i jobbets body.
  let toerKoersel = true;
  let budgetMs = STANDARD_BUDGET_MS;
  try {
    const body = await req.json();
    if (body?.dry_run === false) toerKoersel = false;
    const oensket = Number(body?.budget_ms);
    if (Number.isFinite(oensket) && oensket >= 1_000 && oensket <= MAKS_BUDGET_MS) {
      budgetMs = Math.floor(oensket);
    } else if (body?.budget_ms !== undefined) {
      console.warn(
        `[indgangs-paamindelser-cron] budget_ms=${JSON.stringify(body?.budget_ms)} er uden for 1000..${MAKS_BUDGET_MS} — bruger standarden ${STANDARD_BUDGET_MS} ms`,
      );
    }
  } catch {
    /* ingen body, sikker tørkørsel */
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const resultat = await koerPaamindelser(supabase, toerKoersel, budgetMs);
  console.log("[indgangs-paamindelser-cron] Summary:", JSON.stringify(resultat));

  return new Response(JSON.stringify(resultat), {
    status: resultat.ok ? 200 : 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
