/**
 * supabase/functions/_shared/virksomhedsraekke.ts
 *
 * Spejlet ordret fra src/lib/virksomhedsraekke.ts — enhver ændring her SKAL
 * også laves der. Pariteten håndhæves af testen i
 * src/lib/__tests__/virksomhedsraekkeParitet.test.ts.
 *
 * Filens eneste import er branchemotoren i ./branchekode (spejlet samme
 * vej, paritetstestet i branchekodeParitet.test.ts). Importstien er den
 * eneste tilladte forskel mellem de to kopier, som i fornyelse.ts.
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

import { udledBranchekode } from "./branchekode.ts";

/** Det vi bruger af cvrapi.dk-svaret (import-application: lookupCVR). */
export interface CvrSvar {
  name?: string;
  founded?: string;
  industry_code?: string;
  industry_label?: string;
  /** cvrapi.dk's egne feltnavne — målt live 3/9 (hentCvrData). */
  address?: string;
  zipcode?: string;
  city?: string;
}

export interface VirksomhedsInput {
  company_name: string;
  cvr_number?: string | null;
  website?: string | null;
  phone?: string | null;
  industry_label?: string | null;
  start_date?: string | null;
  // Adressen som ansøgeren/rådgiveren skrev den: Monday («Firma-adresse»,
  // «Postnummer», «By») eller importformularen (address, zip, city).
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
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

/** Trimmet tekst, eller null når feltet er tomt — aldrig en tom streng der ser udfyldt ud. */
function tekst(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
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

  // Branchekoden udledes af CVR-registrets DB25-kode (besluttet 3/9,
  // docs/indgangen-overhaling.md §6): motoren OVERSÆTTER registerkoden
  // til app-taksonomiens industry_code — registerkoden selv må stadig
  // ikke i feltet (se industry_code nedenfor). Rammer motoren ikke, er
  // svaret null, aldrig other_general. KUN her, ved oprettelse: ved
  // genbrug af en eksisterende virksomhed på CVR (virksomhedsOprettelse)
  // kaldes rækkebyggeren ikke, og branchefelterne røres ikke — en
  // virksomhed der allerede findes, har måske fået sin kode rettet i
  // hånden.
  const branche = udledBranchekode(cvrSvar?.industry_code);

  // Branchen som tekst: ansøgerens/rådgiverens tekst vinder over
  // CVR-registrets (:281) — registrets branchetekst er en fallback, ikke
  // en rettelse. Motorens label kommer sidst og KUN hvor feltet ellers
  // ville være tomt (besluttet 3/9: aldrig overskrive noget nogen har
  // skrevet). I praksis rammer det kun et CVR-svar med kode men uden
  // tekst — cvrapi.dk sender normalt begge.
  const industryLabel =
    input.industry_label || cvrSvar?.industry_label || branche?.industry_label || null;

  // Stiftelsesdatoen: input vinder; ellers CVR-registrets, parset. Kan den
  // ikke parses, bliver der ingen dato (:261-278) — «better no date than
  // invalid insert».
  let startDate: string | null = input.start_date || null;
  if (!startDate && cvrSvar?.founded) {
    startDate = parseCvrStiftelsesdato(cvrSvar.founded);
  }

  // Adressen (3/9): samme forrang som branchen — det ansøgeren/rådgiveren
  // skrev vinder, CVR-registret er fallback, ikke en rettelse. Målt i
  // prod 3/9: kun 1 af 32 aktive virksomheder havde alle tre felter, og
  // FLOOR1 (oprettet via import med CVR-opslag) ingen af dem, fordi
  // hverken rækken eller hentCvrData bar adressen. Uden den kan Stripe
  // Tax ikke bestemme momssatsen, og dag 31-fakturaen finaliseres uden
  // moms. Tomme og blanke felter bliver null — en tom streng ser udfyldt
  // ud for enhver der tjekker «er feltet sat». KUN ved oprettelse: ved
  // genbrug på CVR kaldes rækkebyggeren ikke (se industry_code ovenfor).
  const address = tekst(input.address) ?? tekst(cvrSvar?.address);
  const postalCode = tekst(input.postal_code) ?? tekst(cvrSvar?.zipcode);
  const city = tekst(input.city) ?? tekst(cvrSvar?.city);

  return {
    name,
    cvr_number: input.cvr_number || null,
    industry_label: industryLabel,
    // CVR's registerkode (DB25) må stadig IKKE i industry_code: kolonnen
    // bærer app-taksonomien (brancher.ts) og er nøgle til
    // industry_benchmarks — en registerkode giver nul benchmarks. Målt i
    // prod 3/9: WESDEX (439100) og Two Socks (563020) har en registerkode
    // stående i feltet i dag og får derfor nul benchmarks; det er en
    // eksisterende fejl, som IKKE rettes her. Feltet bærer motorens
    // oversættelse af registerkoden, eller null når den ikke rammer — så
    // vælger medlemmet i Settings, og tjeklisten spørger. Målt 3/9: kun
    // 11 af 32 aktive virksomheder har en registerkode i raw_cvr_data, så
    // motoren rammer primært virksomheder der kommer ind fremover.
    // CVR-svaret er bevaret råt i application_context.raw_cvr_data
    // nedenfor.
    industry_code: branche?.industry_code ?? null,
    website: input.website || null,
    contact_phone: input.phone || null,
    // NY i forhold til import-application, som ikke sætter contact_email.
    // Indgangen KRÆVER den: hent_betalingsdata_til_checkout svarer kun når
    // companies.contact_email findes, og stripe-webhookens indgangsgren
    // sender invitationen til den. Uden feltet kan der ikke betales.
    contact_email: input.contact_email || null,
    address,
    postal_code: postalCode,
    city,
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
