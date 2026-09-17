/**
 * Syntetiske fixtures (INGEN kundedata — «Testfirma Syntetisk ApS», opdigtede tal) til de to formater målt 17/9-2026:
 *   1. e-conomics balancerapport som PDF i KLIENTENS pdfjs-tekstform (Warburgs månedsrapport): «NNNN   Navn   beløb »,
 *      sidehovedet EFTER tabellen på side 1, «ialt» (ét ord), kreditformat, børne-«ialt» under Autodrift, kommentarlinjer
 *      uden kontonummer, balance (≥ 6000) som periodens bevægelser.
 *   2. «etiket;beløb»-CSV (BR Rosets format): to kolonner, ingen kontonumre, forretningsformat, hele kroner med dansk
 *      tusindtalspunktum, balance efter «Balance <år>». Findes i to udgaver: ren UTF-8 og «klientens» (æ/ø/å → U+FFFD).
 *
 * Regnestykket i PDF'en (kredit, negativ = indtægt):
 *   omsætning −900.000 · vareforbrug 300.000 · DB −600.000 · løn 250.000 · pension 40.000 · øvrige personale 10.000 ·
 *   salg 20.000 · lokaler 30.000 · admin 50.000 · autodrift 45.000 (vareauto 30.000 + personauto 15.000) → EBITDA −155.000 ·
 *   afskrivninger 5.000 → −150.000 · finansindtægter −200 · finansudgifter 1.200 → −149.000 · ekstraordinære 4.000 →
 *   RESULTAT FØR SKAT −145.000 = ÅRETS RESULTAT.
 * Regnestykket i CSV'en (business): 551.000 − 137.000 − 148.000 − 2.000 − 8.000 − 2.000 − 20.000 − 13.000 − 18.000 − 5.000
 *   − 6.000 = 192.000 (samme struktur som den målte fil, andre beløb i balancen).
 */

const L = (nr: number | null, navn: string, beloeb: string | null) => (nr === null ? `${navn} ` : `${nr}   ${navn}${beloeb === null ? "" : "   " + beloeb} `);

export const BALANCERAPPORT_PDF_TEXT = [
  "--- Side 1 ---",
  "Nummer   Navn   01-06-2026 til 30-06-2026 ",
  L(998, "Resultatopgørelse", null),
  L(1000, "Omsætning", null),
  L(1010, "Varesalg m. moms", "-900.000,00"),
  L(1011, "Varesalg u. moms", "0,00"),
  L(1995, "Omsætning ialt", "-900.000,00"),
  L(2000, "Vareforbrug", null),
  L(2010, "Varekøb", "280.000,00"),
  L(2040, "Fremmed arbejde", "20.000,00"),
  L(2990, "Vareforbrug ialt", "300.000,00"),
  L(2995, "Dækningsbidrag", "-600.000,00"),
  L(3000, "Lønninger", null),
  L(3100, "Løn & Gage", "260.000,00"),
  L(3160, "Refunderet dagpenge", "-10.000,00"),
  L(3190, "Lønninger ialt", "250.000,00"),
  L(3195, "Pensioner & sociale bidrag", null),
  L(3200, "Pension", "40.000,00"),
  L(3298, "Pensioner & sociale bidrag ialt", "40.000,00"),
  L(3299, "Øvrige personaleudgifter", null),
  L(3310, "Kursusudgifter m. moms", "10.000,00"),
  L(3398, "Øvrige personaleudgifter ialt", "10.000,00"),
  L(3399, "Salgsomkostninger", null),
  L(3410, "Annoncer & reklame m. moms", "20.000,00"),
  L(3498, "Salgsomkostninger ialt", "20.000,00"),
  L(3499, "Lokaleomkostninger", null),
  L(3510, "Husleje m.moms", "30.000,00"),
  L(3598, "Lokaleomkostninger ialt", "30.000,00"),
  L(3599, "Administrationsomkostninger", null),
  L(3620, "Telefon", "5.000,00"),
  L(3642, "Regnskabsmæssige assistance", "45.000,00"),
  L(3698, "Administrationsomkostninger ialt", "50.000,00"),
  L(3699, "Autodrift", null),
  L(3700, "Autodrift vareauto", null),
  L(3710, "Benzin og olie, gulplade", "30.000,00"),
  L(3748, "Autodrift vareauto ialt", "30.000,00"),
  L(3799, "Autodrift hvidplade", null),
  L(3820, "Forsikringer, hvidplade", "15.000,00"),
  L(3895, "Autodrift personauto ialt", "15.000,00"),
  L(3898, "Autodrift ialt", "45.000,00"),
  L(3998, "Resultat før afskrivninger", "-155.000,00"),
  "Testfirma Syntetisk ApS Månedsrapport juni 2026 ",
  "Balance ",
  "Udskrevet 05-07-2026 09:00 (alle tal i kr.) ",
  "Omsætningen er som ventet og kan ikke sammenlignes med ",
  "2025 hvor et projekt blev solgt. ",
  "",
  "--- Side 2 ---",
  L(4499, "Afskrivninger", null),
  L(4550, "Afskrivning driftsmidler", "5.000,00"),
  L(4597, "Afskrivninger ialt", "5.000,00"),
  L(4598, "Indtjeningsbidrag", "-150.000,00"),
  L(4798, "Resultat før finansielle poster", "-150.000,00"),
  L(4999, "Finansieringsindtægter", null),
  L(5020, "Renter debitorer", "-200,00"),
  L(5098, "Finansieringsindtægter ialt", "-200,00"),
  L(5099, "Finansieringsudgifter", null),
  L(5135, "Bøder", "1.200,00"),
  L(5197, "Finansieringsudgifter ialt", "1.200,00"),
  L(5198, "Resultat før ekstraordinære poster", "-149.000,00"),
  L(5199, "Ekstraordinære poster", null),
  L(5260, "Manglende bilag/info", "4.000,00"),
  L(5297, "Ekstraordinære poster ialt", "4.000,00"),
  L(5298, "Resultat før skat", "-145.000,00"),
  L(5299, "Skat og resultatdisponering", null),
  L(5998, "Årets resultat", "-145.000,00"),
  L(6000, "Balance", null),
  L(6001, "Aktiver", null),
  L(7100, "Tilgodehavender fra salg & tjenesteydelser", "-40.000,00"),
  L(7158, "Tilgodehavender ialt", "-40.000,00"),
  L(7211, "Bank", "200.000,00"),
  L(7228, "Likvide beholdninger ialt", "200.000,00"),
  L(7998, "Aktiver ialt", "160.000,00"),
  L(8000, "Passiver", null),
  L(8041, "Årets resultat", "-145.000,00"),
  L(8198, "Egenkapital ialt", "-145.000,00"),
  L(8870, "Varekreditorer", "-15.000,00"),
  L(9765, "Gæld ialt", "-15.000,00"),
  L(9799, "Passiver ialt", "-160.000,00"),
].join("\n");

/** Samme opgørelse i FORRETNINGSFORTEGN (omsætning positiv) — konventionen aflæses af omsætningens fortegn. */
export const BALANCERAPPORT_PDF_TEXT_BUSINESS = BALANCERAPPORT_PDF_TEXT.replace(/(\d{4}   [^\n]+?   )(-?)([\d.]+,\d{2}) $/gm, (_m, a: string, minus: string, tal: string) =>
  `${a}${minus === "-" ? "" : "-"}${tal} `.replace("-0,00", "0,00"));

export const BALANCERAPPORT_FORVENTET = {
  revenue: 900000, cogs: 300000, gross_profit: 600000, payroll: 250000, payroll_related: 40000, other_staff_costs: 10000,
  sales_costs: 20000, facility_costs: 30000, admin_costs: 50000, vehicle_costs: 45000, ebitda: 155000, depreciation: 5000,
  ebit: 150000, financial_income: 200, financial_costs: 1200, other_costs: 4000, ebt: 145000, net_result: 145000,
};

// ── etiket;beløb-CSV ──
const CSV_LINJER = [
  ";Juni", ";", "Nettoomsætning;551.000", "Andre driftsindtægter;0", ";", "Vareforbrug;137.000", ";", "Bruttoavance I;414.000", ";",
  "Lønninger;148.000", ";", "Bruttoavance II;266.000", ";", "Produktionsomkostninger;2.000", "Salgsomkostninger;8.000",
  "Bilomkostnigner;2.000", "Lokaleomkostninger;20.000", "Administrationsomkostninger;13.000", "Øvrige kapacitetsomkostninger;18000",
  "Faste omkostninger i alt;63.000", ";", "Resultat af primær drift;203.000", ";", "Afskrivninger EDB;5.000", ";",
  "Resultat før renter;198.000", ";", "Finansielle omkostninger;6000", ";", "Årets resultat;192.000", ";", ";",
  "Balance 2026;", ";", ";Juni", ";", "AKTIVER;", ";", "Produktionsanlæg;100.000", "EDB;50.000", ";", "Anlægsaktiver i alt;150.000", ";",
  "Varelager;800.000", ";", "Tilgodehavender fra salg;120.000", "Andre tilgodehavender;30.000", "Tilgodehavender i alt;150.000", ";",
  "Kassebeholdning;10.000", "Bankkonto;90000", "Likvide beholdninger ;100.000", ";", "Omsætningsaktiver i alt;1.050.000", ";",
  "Aktiver i alt;1.200.000", ";", ";Juni", "PASSIVER;", ";", "Egenkapital primo;500.000", "Private hævninger;-60.000", "Skat;-40.000",
  "Periodens resultat;300.000", ";", "Egenkapital i alt;700.000", ";", "Langfristet gæld;0", ";", "Leverandører;150.000",
  "Skyldig moms;250.000", "Anden gæld;100.000", ";", "Kortfristede gældsforpligtelser;500.000", ";", "Gældsforpligtelser i alt;500.000", ";",
  "Passiver i alt;1.200.000",
];
export const ETIKET_CSV_UTF8 = CSV_LINJER.join("\r\n") + "\r\n";
/** Som klienten ser en ISO-8859-1-fil læst med file.text(): hvert æ/ø/å er U+FFFD. */
export const ETIKET_CSV_KLIENT = ETIKET_CSV_UTF8.replace(/[æøåÆØÅ]/g, "�");
export const ETIKET_FORVENTET = {
  revenue: 551000, cogs: 137000, gross_profit: 414000, payroll: 148000, sales_costs: 8000, vehicle_costs: 2000, facility_costs: 20000,
  admin_costs: 13000, other_costs: 20000, other_operating_income: 0, ebitda: 203000, depreciation: 5000, ebit: 198000, financial_costs: 6000,
  ebt: 192000, net_result: 192000, assets_total: 1200000, inventory: 800000, receivables_total: 150000, cash: 100000,
  equity_total: 700000, current_liabilities: 500000, debt_total: 500000, liabilities_total: 1200000,
};
