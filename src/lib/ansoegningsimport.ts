/**
 * src/lib/ansoegningsimport.ts — motoren bag «Importér ansøgning» (13/9-2026, trin 1 af 2).
 *
 * HVORFOR: /members skal lukkes, og ansøgningsimporten er det eneste på siden
 * der skal FLYTTES frem for at dø (målt 13/9: fem virksomheder på 90 dage bærer
 * importens signatur — oprettet med kontraktdatoer, intet betalingslink). Knappen
 * skal stå på /virksomheder ved siden af «Inviter», fordi importen opretter en
 * virksomhed og derfor ikke kan bo på en virksomhedsside (Jonas 13/9).
 *
 * I trin 1 flyttes ingen flade. Parseren (Members.tsx:36-146,
 * parseApplicationExcel) og valideringen (handleImport :580-618) er trukket
 * herud som rene funktioner, så vitest kan låse dem
 * (src/lib/__tests__/ansoegningsimport.test.ts), og så trin 2 kan sætte en ny
 * flade på den samme motor. Adfærden er FLYTTET, ikke ændret: samme
 * kolonnesøgning, samme omsætnings- og datotolkning, samme fejltekster i samme
 * rækkefølge, samme body til import-application.
 *
 * Grænsen mod fladen: motoren får ALLEREDE INDLÆST regnearksdata — rækker af
 * celler, som xlsx' sheet_to_json({ header: 1, defval: null }) leverer.
 * Filen (File → ArrayBuffer → workbook) læses fortsat i fladen; motoren kender
 * hverken File, FileReader eller DOM og kan derfor testes uden browser.
 *
 * Én bevidst forskel fra Members.tsx:36-146: parseren gav `null` for en dato
 * der manglede og `undefined` for et manglende omsætningsinterval, som så blev
 * spredt ind i formular-state'en (typet som strenge). Motoren giver "" for alle
 * tomme felter — samme sandhedsværdi, samme body (begge bliver `undefined` i
 * byggImportBody), samme tomme datofelt i dialogen. Forskellen er kun at
 * <input type="date"> ikke længere får value={null}.
 */

// ── Felterne ─────────────────────────────────────────────────────────

/** De fjorten felter dialogen bærer — præcis nøglerne i Members.tsx' importForm. */
export interface AnsoegningsFelter {
  email: string;
  company_name: string;
  cvr_number: string;
  contact_name: string;
  annual_revenue: string;
  revenue_interval: string;
  industry_label: string;
  current_situation: string;
  goals: string;
  help_needed: string;
  website: string;
  phone: string;
  contract_start_date: string;
  contract_end_date: string;
}

export const TOMME_FELTER: Readonly<AnsoegningsFelter> = Object.freeze({
  email: "", company_name: "", cvr_number: "", contact_name: "",
  annual_revenue: "", revenue_interval: "", industry_label: "", current_situation: "",
  goals: "", help_needed: "", website: "", phone: "",
  contract_start_date: "", contract_end_date: "",
});

// ── Kolonnerne i Monday-eksporten ────────────────────────────────────

/**
 * Søgenøglerne mod headerrækken (Members.tsx:66-70, :76-77, :119-120, :122-135).
 * Match: første header hvis lowercase INDEHOLDER nøglen i lowercase — så
 * «CVR-nummer» rammer «CVR», og «E-mail» rammer IKKE «Email».
 */
export const KOLONNER = {
  email: "Email",
  company_name: "Name",
  cvr_number: "CVR",
  contact_name: "Kontaktperson",
  aarlig_omsaetning: "Årlig omsætning",
  omsaetning_interval: "Omsætning (interval)",
  industry_label: "Branche",
  current_situation: "Nuværende situation",
  goals: "Mål med virksomhed",
  help_needed: "Beskriv hvilken hjælp",
  website: "Hjemmeside",
  phone: "Telefon",
  contract_start_date: "Startdato",
  contract_end_date: "End date",
} as const;

/** Headerrækken søges i de første 15 rækker (Members.tsx:55). */
export const HEADER_SOEGEVINDUE = 15;
/** …og skal have FLERE end 5 udfyldte celler (:57)… */
export const HEADER_MIN_UDFYLDTE = 5;
/** …hvoraf én er præcis «Name» eller «Email» (:57). */
export const HEADER_MARKOERER: readonly string[] = ["Name", "Email"];

/** Fejlteksterne når arket ikke kan læses (Members.tsx:62, :66). Kastes som Error. */
export const FEJL_INGEN_HEADER = "Kunne ikke finde kolonneoverskrifter";
export const FEJL_INGEN_DATA = "Ingen data fundet";

/** En celle som xlsx leverer den: streng, tal, boolsk, Date eller null. */
export type Celle = unknown;
export type Arkdata = ReadonlyArray<ReadonlyArray<Celle>>;

export interface ParseResultat {
  felter: AnsoegningsFelter;
  /** Ting arket bar som motoren måtte give op på — vises ikke i trin 1. */
  advarsler: string[];
}

// ── Tolkning af omsætning og datoer (Members.tsx:74-118, ordret adfærd) ──

const OMSAETNING_LOFT = 100_000_000;

/**
 * «1.500.000» → "1500000". Et interval («500.000 - 1.000.000») → midtpunktet.
 * Én grænse («1.000.000+») → tallet. Intet tal → "".
 */
export function tolkOmsaetning(raa: string): string {
  if (!raa) return "";
  // Rent tal først (stifteren skrev den præcise omsætning)
  const rent = parseFloat(raa.replace(/[\s.]/g, "").replace(",", "."));
  if (!isNaN(rent) && rent > 0 && rent < OMSAETNING_LOFT && !raa.includes("-")) {
    return String(Math.round(rent));
  }
  // Et interval — de to grænser, og midtpunktet mellem dem
  const tal = raa.match(/[\d.]+/g)
    ?.map((n) => parseFloat(n.replace(/\./g, "")))
    .filter((n) => !isNaN(n) && n > 0 && n < OMSAETNING_LOFT);
  if (tal && tal.length >= 2) return String(Math.round((tal[0] + tal[1]) / 2));
  if (tal && tal.length === 1) return String(tal[0]);
  return "";
}

/**
 * Excel-serienummer (dage siden 1899-12-30, Lotus-skudårsfejlen indregnet)
 * i vinduet 1000 < n < 100000 → ISO-dato. Ellers alt `new Date(...)` kan
 * tolke (ISO-dato, ISO-tidsstempel, engelsk datotekst). Danske formater
 * («15-01-2026», «15/01/2026») tolkes IKKE — det er den nedarvede grænse.
 * Tom, «nan» eller utolkelig → "".
 */
export function tolkExcelDato(raa: Celle): string {
  if (raa == null || raa === "" || raa === "nan") return "";
  try {
    const num = typeof raa === "number" ? raa : parseFloat(String(raa));
    if (!isNaN(num) && num > 1000 && num < 100000) {
      const utc = new Date(Date.UTC(1899, 11, 30 + Math.floor(num)));
      if (!isNaN(utc.getTime())) return utc.toISOString().slice(0, 10);
    }
    const d = new Date(String(raa));
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return "";
  } catch {
    return "";
  }
}

// ── Parseren ─────────────────────────────────────────────────────────

/** Indekset på headerrækken, eller -1 (Members.tsx:54-61). */
export function findHeaderRaekke(rows: Arkdata): number {
  for (let i = 0; i < Math.min(rows.length, HEADER_SOEGEVINDUE); i++) {
    const udfyldte = rows[i].filter((v) => v != null);
    if (udfyldte.length > HEADER_MIN_UDFYLDTE && HEADER_MARKOERER.some((m) => udfyldte.includes(m))) {
      return i;
    }
  }
  return -1;
}

/**
 * Ansøgningen ud af arket: headerrækken findes, og rækken lige under er
 * ansøgningen. Kaster Error(FEJL_INGEN_HEADER) / Error(FEJL_INGEN_DATA) —
 * fladen viser err.message under «Kunne ikke læse filen» som før.
 */
export function parseAnsoegning(rows: Arkdata): ParseResultat {
  const headerIdx = findHeaderRaekke(rows);
  if (headerIdx === -1) throw new Error(FEJL_INGEN_HEADER);

  const headers = rows[headerIdx].map((h) => String(h ?? ""));
  const dataRow = rows[headerIdx + 1];
  if (!dataRow) throw new Error(FEJL_INGEN_DATA);

  const advarsler: string[] = [];
  const hent = (noegle: string): string => {
    const idx = headers.findIndex((h) => h.toLowerCase().includes(noegle.toLowerCase()));
    if (idx === -1) {
      advarsler.push(`Kolonnen «${noegle}» blev ikke fundet i arket.`);
      return "";
    }
    const val = dataRow[idx];
    return val != null ? String(val).trim() : "";
  };

  const email = hent(KOLONNER.email);
  const companyName = hent(KOLONNER.company_name);
  const cvr = hent(KOLONNER.cvr_number).replace(/\s/g, "");
  const kontakt = hent(KOLONNER.contact_name);

  // Præcis omsætning først, ellers intervallet; intervallet gemmes råt til agent-konteksten
  const praecis = hent(KOLONNER.aarlig_omsaetning);
  const interval = hent(KOLONNER.omsaetning_interval);
  const omsaetningRaa = praecis || interval;
  const annualRevenue = tolkOmsaetning(omsaetningRaa);
  if (omsaetningRaa && !annualRevenue) {
    advarsler.push(`Omsætningen «${omsaetningRaa}» kunne ikke tolkes som et tal.`);
  }
  const revenueInterval = interval && interval !== praecis ? interval : "";

  const branche = hent(KOLONNER.industry_label);
  const situation = hent(KOLONNER.current_situation);
  const maal = hent(KOLONNER.goals);
  const hjaelp = hent(KOLONNER.help_needed);
  const hjemmeside = hent(KOLONNER.website);
  const telefon = hent(KOLONNER.phone);

  const startRaa = hent(KOLONNER.contract_start_date);
  const slutRaa = hent(KOLONNER.contract_end_date);
  const contractStart = tolkExcelDato(startRaa);
  const contractEnd = tolkExcelDato(slutRaa);
  if (startRaa && !contractStart) advarsler.push(`Datoen «${startRaa}» i «${KOLONNER.contract_start_date}» kunne ikke tolkes.`);
  if (slutRaa && !contractEnd) advarsler.push(`Datoen «${slutRaa}» i «${KOLONNER.contract_end_date}» kunne ikke tolkes.`);

  return {
    felter: {
      email,
      company_name: companyName,
      cvr_number: cvr,
      contact_name: kontakt,
      annual_revenue: annualRevenue,
      revenue_interval: revenueInterval,
      industry_label: branche,
      current_situation: situation,
      goals: maal,
      help_needed: hjaelp,
      website: hjemmeside,
      phone: telefon,
      contract_start_date: contractStart,
      contract_end_date: contractEnd,
    },
    advarsler,
  };
}

// ── Valideringen (Members.tsx:581-621, samme tekster i samme rækkefølge) ──

export interface ValideringsFejl {
  /** toast.error's første argument. */
  tekst: string;
  /** toast.error's description, når der er en. */
  detalje?: string;
}

export type ValideringsDom = { ok: true } | { ok: false; fejl: ValideringsFejl[] };

const DATO_BUND = "2020-01-01";
/** Kontraktslut må ligge højst fem år frem (Members.tsx:603)… */
export const KONTRAKTSLUT_MAX_AAR_FREM = 5;
/** …og kontraktstart højst to (:615). */
export const KONTRAKTSTART_MAX_AAR_FREM = 2;

function aarFrem(nu: Date, aar: number): Date {
  const d = new Date(nu);
  d.setFullYear(d.getFullYear() + aar);
  return d;
}

/**
 * Alle afslag i rækkefølge — fladen viser det første (handleImport stoppede
 * ved det første). `nu` kan gives for testens skyld; defaulten er i dag.
 */
export function validerAnsoegning(felter: AnsoegningsFelter, nu: Date = new Date()): ValideringsDom {
  const fejl: ValideringsFejl[] = [];

  if (!felter.email || !felter.company_name) {
    fejl.push({ tekst: "Email og virksomhedsnavn er påkrævet" });
  }
  if (felter.cvr_number && !/^\d{8}$/.test(felter.cvr_number.trim())) {
    fejl.push({ tekst: "CVR-nummer skal være præcis 8 cifre" });
  }
  if (!felter.contract_end_date) {
    fejl.push({ tekst: "Kontraktslut er påkrævet" });
  }
  if (felter.contract_start_date && felter.contract_end_date) {
    if (new Date(felter.contract_end_date) <= new Date(felter.contract_start_date)) {
      fejl.push({ tekst: "Kontraktslut skal være efter kontraktstart" });
    }
  }
  if (felter.contract_end_date) {
    const slut = new Date(felter.contract_end_date);
    const bund = new Date(DATO_BUND);
    const loft = aarFrem(nu, KONTRAKTSLUT_MAX_AAR_FREM);
    if (slut < bund || slut > loft) {
      fejl.push({
        tekst: "Kontraktslut ser forkert ud",
        detalje: `Datoen ${felter.contract_end_date} er udenfor forventet interval (2020–${loft.getFullYear()})`,
      });
    }
  }
  if (felter.contract_start_date) {
    const start = new Date(felter.contract_start_date);
    const bund = new Date(DATO_BUND);
    const loft = aarFrem(nu, KONTRAKTSTART_MAX_AAR_FREM);
    if (start < bund || start > loft) {
      fejl.push({
        tekst: "Kontraktstart ser forkert ud",
        detalje: `Datoen ${felter.contract_start_date} er udenfor forventet interval (2020–${loft.getFullYear()})`,
      });
    }
  }

  return fejl.length === 0 ? { ok: true } : { ok: false, fejl };
}

// ── Body'en til import-application (Members.tsx:626-632, ordret) ─────

/**
 * Det der sendes til supabase.functions.invoke("import-application").
 * Nøglerne skal findes i ApplicationPayload i
 * supabase/functions/import-application/index.ts — kildeværnet i testen
 * læser filen og fejler ved en omdøbning i den ene ende.
 */
export interface ImportBody extends Omit<AnsoegningsFelter, "annual_revenue" | "revenue_interval" | "contract_start_date" | "contract_end_date"> {
  annual_revenue: number | undefined;
  revenue_interval: string | undefined;
  contract_start_date: string | undefined;
  contract_end_date: string | undefined;
}

export function byggImportBody(felter: AnsoegningsFelter): ImportBody {
  return {
    ...felter,
    annual_revenue: felter.annual_revenue ? Number(felter.annual_revenue) : undefined,
    revenue_interval: felter.revenue_interval || undefined,
    contract_start_date: felter.contract_start_date || undefined,
    contract_end_date: felter.contract_end_date || undefined,
  };
}
