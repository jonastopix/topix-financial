/**
 * supabase/functions/_shared/virksomhedsraekke.ts
 *
 * Spejlet ordret fra src/lib/virksomhedsraekke.ts — enhver ændring her SKAL
 * også laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/virksomhedsraekkeParitet.test.ts.
 *
 * Filen har nul imports og kan derfor loades af både Vite/Vitest (Node)
 * og Deno uden ændringer.
 *
 * Insert-rækken til `companies` som ren funktion. Ingen IO, ingen
 * Supabase, ingen datoer ud over "nu" til cvr_fetched_at.
 *
 * HVORFOR DEN FINDES: import-application og monday-webhook skal begge
 * oprette virksomheder, og de må ikke drive fra hinanden. Målt 2/9
 * (recon-delt-oprettelse.md §4): der er NUL tests på begge funktioner,
 * intet CI-værn ville fange en regression, og eneste bevis ville være en
 * manuel import fra /members. Ved at udskille rækkebygningen som en ren
 * funktion får feltlisten testdækning hvor der i dag er ingen. Udskilt
 * fra import-application/index.ts, trin 3 «Resolve company (reuse or
 * create)» — insert-blokken, parseCvrFoundedDate og navneopløsningen —
 * gengivet felt for felt med hver kommentar der forklarer et valg. IO'en
 * omkring den (CVR-opslag, genbrug, insert) ligger i
 * supabase/functions/_shared/virksomhedsOprettelse.ts.
 *
 * KRITISK — KONTRAKTDATOER FINDES IKKE I SIGNATUREN. Hverken
 * contract_start_date eller contract_end_date kan sendes ind, og rækken
 * bærer dem aldrig — heller ikke som null. Det er ikke en udeladelse, det
 * er værnet: målt 2/9 læser TRE uafhængige steder contract_end_date som
 * «har betalt» — hent_betalingstilbud (status 'betalt'),
 * afgoerBetalingsfrist (src/lib/betalingsfrist.ts), og useAuth via
 * computeMembershipTier (no_date → full). Sættes de ved underskrift,
 * siger betalingssiden «Tak — du er inde» før nogen har betalt, og
 * webhookens idempotens ser en betalt virksomhed. Kontrakten løber fra
 * BETALINGSDAGEN (docs/indgangen-design.md §1) og skrives af
 * stripe-webhook. import-application, som stadig tager datoer fra
 * rådgiverens regneark, sætter dem derfor i en SEPARAT opdatering efter
 * oprettelsen — aldrig gennem denne funktion, og aldrig gennem hjælperen.
 */

/** Det vi bruger af cvrapi.dk-svaret (import-application: lookupCVR). */
export interface CvrSvar {
  name?: string;
  founded?: string;
  industry_code?: string;
  industry_label?: string;
}

export interface VirksomhedsInput {
  company_name: string;
  cvr_number?: string | null;
  website?: string | null;
  phone?: string | null;
  industry_label?: string | null;
  start_date?: string | null;
  // ansøgningstekst
  current_situation?: string | null;
  goals?: string | null;
  help_needed?: string | null;
  annual_revenue?: number | null;
  revenue_interval?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  application_date?: string | null;
}

/**
 * Convert CVR-API date strings to ISO YYYY-MM-DD.
 * Handles: "YYYY-MM-DD", "DD/MM - YYYY", "DD/MM/YYYY", "DD-MM-YYYY".
 * Returns null when input cannot be parsed (better no date than invalid insert).
 *
 * (parseCvrFoundedDate fra import-application, omdøbt — ordret samme adfærd.)
 */
export function parseCvrStiftelsesdato(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  // ISO already
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DK formats: "DD/MM - YYYY", "DD/MM/YYYY", "DD-MM-YYYY", "DD.MM.YYYY"
  const dk = s.match(/^(\d{1,2})[/\-.\s]+(\d{1,2})[/\-.\s]+(\d{4})$/);
  if (dk) {
    const dd = dk[1].padStart(2, "0");
    const mm = dk[2].padStart(2, "0");
    return `${dk[3]}-${mm}-${dd}`;
  }

  return null;
}

/**
 * Bygger insert-rækken til `companies`. Feltlisten er låst af testen i
 * src/lib/__tests__/virksomhedsraekke.test.ts — glemmer nogen et felt om
 * et halvt år, fejler den.
 *
 * `now` er injicerbar af samme grund som i fornyelse.ts: samme input
 * skal give samme output i en test.
 */
export function byggVirksomhedsRaekke(
  input: VirksomhedsInput,
  cvrSvar: CvrSvar | null,
  now: Date = new Date(),
): Record<string, unknown> {
  // Navneopløsningen fra import-application (:280): CVR-registrets navn
  // vinder over det ansøgeren skrev — registret er kilden til det
  // juridiske navn.
  const name = cvrSvar?.name || input.company_name;

  // Branchen: ansøgerens/rådgiverens tekst vinder over CVR-registrets
  // (:281) — registrets branchetekst er en fallback, ikke en rettelse.
  const industryLabel = input.industry_label || cvrSvar?.industry_label || null;

  // Stiftelsesdatoen: input vinder; ellers CVR-registrets, parset. Kan den
  // ikke parses, bliver der ingen dato (:261-278) — «better no date than
  // invalid insert».
  let startDate: string | null = input.start_date || null;
  if (!startDate && cvrSvar?.founded) {
    startDate = parseCvrStiftelsesdato(cvrSvar.founded);
  }

  return {
    name,
    cvr_number: input.cvr_number || null,
    industry_label: industryLabel,
    // CVR's NACE/DB07-tal må IKKE i industry_code: kolonnen bærer
    // app-taksonomien (INDUSTRY_OPTIONS) og er nøgle til
    // industry_benchmarks — en NACE-kode giver nul benchmarks.
    // Koden sættes af medlemmet i onboarding/Settings. CVR-svaret
    // er bevaret råt i application_context.raw_cvr_data nedenfor.
    industry_code: null,
    website: input.website || null,
    contact_phone: input.phone || null,
    // NY i forhold til import-application, som ikke sætter contact_email.
    // Indgangen KRÆVER den: hent_betalingsdata_til_checkout svarer kun når
    // companies.contact_email findes, og stripe-webhookens indgangsgren
    // sender invitationen til den. Uden feltet kan der ikke betales.
    contact_email: input.contact_email || null,
    start_date: startDate,
    cvr_fetched_at: cvrSvar ? now.toISOString() : null,
    onboarding_completed: false,
    application_context: {
      current_situation: input.current_situation || null,
      goals: input.goals || null,
      help_needed: input.help_needed || null,
      annual_revenue: input.annual_revenue || null,
      revenue_interval: input.revenue_interval || null,
      contact_name: input.contact_name || null,
      application_date: input.application_date || null,
      raw_cvr_data: cvrSvar || null,
    },
  };
}
