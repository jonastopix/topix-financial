/**
 * Syntetiske fixtures (INGEN kundedata) til «de tre sidste skabeloner» (17/9-2026):
 * Dinero CSV, Dinero PDF, generic PDF (kontogrupper.ts) og XLSX-P&L + combined (subtotalGrupper.ts).
 *
 * Alle fem bærer samme regnestykke, så tallene kan sammenlignes på tværs:
 *   omsætning 600.000 · vareforbrug 200.000 · løn 150.000 · salg 20.000 · lokaler NETTO −15.000
 *   (husleje 40.000, refusion −55.000 → kredit-netto = andre driftsindtægter 15.000) · administration
 *   10.000 · øvrige 4.000 (Dinero/generic: en linje uden klasse) hhv. 36.000 (XLSX/combined: fremmed
 *   arbejde 30.000 + andre eksterne 6.000) · afskrivninger 5.000 · finansielle poster NETTO −2.500
 *   (Dinero/generic: rente −3.000 + gebyr 500 → finansielle indtægter 2.500, omkostninger 0;
 *   XLSX/combined: renteindtægter 2.500 og renteudgifter 1.000) · skat 12.000.
 *   Dinero/generic: ebt = 228.500. XLSX/combined: ebt = 195.500 (øvrige 36.000, renteudgifter 1.000).
 */

// ── Dinero CSV (kreditkonvention: omsætning negativ, omkostninger positive) ──
export const REST_DINERO_CSV = [
  "Konto;Kontonavn;Beløb",
  "1010;Salg af varer;-500.000,00",
  "1020;Salg af ydelser;-100.000,00",
  "2010;Vareforbrug;200.000,00",
  "3010;Løn og gager;150.000,00",
  "4010;Annoncering;20.000,00",
  "5010;Husleje;40.000,00",
  "5020;Husleje refusion;-55.000,00",
  "7010;Kontorartikler;10.000,00",
  "7020;Telefon og transport;4.000,00", // tvetydig (admin «telefon» + vehicle «transport») → øvrige omkostninger
  "8010;Afskrivning inventar;5.000,00",
  "8110;Rente, bank;-3.000,00",
  "8120;Bankgebyrer;500,00",
  "9010;Selskabsskat;12.000,00",
].join("\n");

// ── Dinero PDF-tekst (kreditkonvention). «Diverse poster» står uden konto og uden sektion → uklassificeret. ──
const PDF_BODY = [
  "Resultatopgørelse 01/06-2026 - 30/06-2026",
  "Omsætning",
  "1010 Salg af varer   -500.000,00",
  "1020 Salg af ydelser   -100.000,00",
  "OMSÆTNING I ALT   -600.000,00",
  "Variable omkostninger",
  "2010 Vareforbrug   200.000,00",
  "VAREFORBRUG   200.000,00",
  "DÆKNINGSBIDRAG I ALT   -400.000,00",
  "Personaleomkostninger",
  "3010 Løn og gager   150.000,00",
  "PERSONALEOMKOSTNINGER   150.000,00",
  "Salgsfremmende omkostninger",
  "4010 Annoncering   20.000,00",
  "SALGSOMKOSTNINGER   20.000,00",
  "Lokaleomkostninger",
  "5010 Husleje   40.000,00",
  "5020 Husleje refusion   -55.000,00",
  "LOKALEOMKOSTNINGER   -15.000,00",
  "Administration",
  "7010 Kontorartikler   10.000,00",
  "ADMINISTRATION   10.000,00",
  "Afskrivninger",
  "8010 Afskrivning inventar   5.000,00",
  "AFSKRIVNINGER   5.000,00",
  "Finansielle poster",
  "8110 Rente, bank   -3.000,00",
  "8120 Bankgebyrer   500,00",
  "FINANSIELLE POSTER   -2.500,00",
  "Diverse poster   4.000,00",
  "RESULTAT FØR SKAT   -228.500,00",
  "9010 Selskabsskat   12.000,00",
  "RESULTAT EFTER SKAT   -216.500,00",
];

export const REST_DINERO_PDF_TEXT = [
  "--- Side 1 ---",
  "Hentet: 01/07-2026 Kl. 08.00   Testfirma Syntetisk ApS (CVR-nr. 11111111)",
  "Udskrevet fra dinero.dk",
  ...PDF_BODY,
].map((l) => l + " ").join("\n");

/** Samme opgørelse uden Dinero-mærket → den generiske PDF-skabelon. */
export const REST_GENERIC_PDF_TEXT = [
  "--- Side 1 ---",
  "Hentet: 01/07-2026 Kl. 08.00   Testfirma Syntetisk ApS (CVR-nr. 11111111)",
  ...PDF_BODY,
].map((l) => l + " ").join("\n");

// ── e-conomic-agtig resultatopgørelse XLSX (kreditkonvention) ──
// «Personaleomkostninger i alt» er en FORÆLDRE-subtotal (= lønninger) uden matcher: den må ikke tælles.
export const REST_XLSX_PNL_ROWS: any[][] = [
  ["Testfirma Syntetisk ApS", null, null],
  ["Resultatopgørelse", null, null],
  ["CVR 11111111", null, null],
  ["01.06.26 - 30.06.26", null, null],
  [null, null, null],
  ["Nummer", "Navn", "Beløb"],
  [1000, "Varesalg", -600000],
  [1995, "Omsætning i alt", -600000],
  [2010, "Varekøb", 200000],
  [2990, "Vareforbrug i alt", 200000],
  [2995, "Dækningsbidrag", -400000],
  [3100, "Løn & Gage", 150000],
  [3190, "Lønninger i alt", 150000],
  [3390, "Salgsomkostninger i alt", 20000],
  [3490, "Lokaleomkostninger i alt", -15000],
  [3590, "Fremmed arbejde i alt", 30000],
  [3690, "Andre eksterne omkostninger i alt", 6000],
  [3698, "Administrationsomkostninger i alt", 10000],
  [3790, "Personaleomkostninger i alt", 150000],
  [3998, "Resultat før afskrivninger", -199000],
  [4597, "Afskrivninger i alt", 5000],
  [4998, "Resultat før renter", -194000],
  [5100, "Renteindtægter i alt", -2500],
  [5190, "Renteudgifter i alt", 1000],
  [5198, "Resultat før skat", -195500],
  [5998, "Årets resultat", -195500],
];

/** Som ovenfor, men «Fremmed arbejde i alt» hedder noget ingen matcher kender — resultatlinjen skal bevise den. */
export const REST_XLSX_PNL_ROWS_UKENDT_GRUPPE: any[][] = REST_XLSX_PNL_ROWS.map((r) =>
  r[1] === "Fremmed arbejde i alt" ? [r[0], "Konsulentydelser i alt", r[2]] : r,
);

/** Samme resultatopgørelse i FORRETNINGSFORTEGN (omsætning positiv, omkostninger negative) — ANLA-formatet. */
export const REST_XLSX_PNL_ROWS_BUSINESS: any[][] = REST_XLSX_PNL_ROWS.map((r) => (typeof r[2] === "number" ? [r[0], r[1], -r[2]] : r));

// ── Combined balance + resultatopgørelse XLSX (FORRETNINGSFORTEGN: omsætning positiv, omkostninger negative) ──
export const REST_COMBINED_ROWS: any[][] = [
  ["Testfirma Syntetisk ApS", null, null],
  ["Balance og resultatopgørelse", null, null],
  [null, null, null],
  [null, null, null],
  ["Nummer", "Navn", "01.06.26 - 30.06.26"],
  [1010, "Varesalg", 600000],
  [1995, "Omsætning i alt", 600000],
  [2010, "Varekøb", -200000],
  [2990, "Vareforbrug i alt", -200000],
  [2995, "Dækningsbidrag", 400000],
  [3100, "Løn & Gage", -150000],
  [3190, "Lønninger i alt", -150000],
  [3390, "Salgsomkostninger i alt", -20000],
  [3490, "Lokaleomkostninger i alt", 15000],
  [3590, "Underleverandører i alt", -30000],
  [3690, "Andre eksterne omkostninger i alt", -6000],
  [3698, "Administrationsomkostninger i alt", -10000],
  [3998, "Resultat før afskrivninger", 199000],
  [4597, "Afskrivninger i alt", -5000],
  [5100, "Finansielle indtægter i alt", 2500],
  [5190, "Finansielle omkostninger i alt", -1000],
  [5198, "Resultat før skat", 195500],
  [5998, "Årets resultat", 195500],
  [6100, "Tilgodehavender fra salg", 200000],
  [6500, "Likvide beholdninger i alt", 100000],
  [6998, "Aktiver i alt", 300000],
  [7100, "Egenkapital i alt", 150000], // combined_dk_business_v1: equity KEEP, liability NEGATE — gæld/passiver negative, egenkapital positiv
  [7900, "Kortfristet gæld i alt", -150000],
  [7998, "Passiver i alt", -300000],
];
