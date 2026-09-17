/**
 * mamutSaldoSyntetisk.ts — SYNTETISK Mamut/C5-saldoliste (17/9-2026). INGEN kundedata: fiktivt
 * firma, fiktive beløb. Formen er den målte i kundens fil (udkastets README): række 0 «Saldo: <tekst>», række 1
 * «Kontonummer · Kontonavn · Beløb», konti stigende, sumkonti MED kontonummer («… I alt»),
 * subtotalerne «Dækningsbidrag 1/2», «Resultat før afskrivninger», «Resultat før skat», «Årets
 * resultat», og «Skat af årets resultat» + «Skatter i alt» EFTER resultat før skat; balancen fra
 * 5000 med «Aktiver I alt», «Egenkapital i alt», «Gæld I alt», «Passiver I alt» (kredit negativ).
 * De STRUKTURELLE træk fra virkeligheden er med: konto 999 «Resultatopgørelse» (e-conomic-fælden),
 * en gruppe uden kendt navn («Andre omk. I alt» → øvrige), en finansiel indtægt med POSITIVT fortegn
 * (kundens var negativ — begge skal bære eget fortegn), en omkostningsgruppe hvis sum er en KREDIT
 * (lokaler: fremleje > husleje → 0 og andre driftsindtægter), kassekredit (negative likvide midler).
 *
 * Filen mamut_saldo_syntetisk_v1.xlsx er genereret af netop denne tabel (script i udkastets
 * README; `XLSX.utils.aoa_to_sheet(syntetiskeRaekker())`). Testen læser xlsx'en gennem xlsxRawParser
 * og regner de forventede tal AF TABELLEN.
 */

export const SYNTETISK_SALDO_TEKST = "marts saldo 2026";

/** [nr, navn, beløb] — som arket. */
export const SYNTETISKE_KONTI: ReadonlyArray<readonly [number, string, number]> = [
  [999, "Resultatopgørelse", 0],
  [1000, "Omsætning", 0],
  [1010, "Salg af varer", 150000.00],
  [1020, "Salg til udlandet", 50000.00],
  [1490, "Rabatter", -2000.00],
  [1499, "Omsætning I alt", 198000.00],
  [2010, "Varekøb", -80000.00],
  [2020, "Fragt", -5000.00],
  [2699, "Variable omkostninger I alt", -85000.00],
  [2700, "Dækningsbidrag 1", 113000.00],
  [3010, "Lønninger", -40000.00],
  [3020, "Pension", -4000.00],
  [3998, "Løn I alt", -44000.00],
  [3999, "Dækningsbidrag 2", 69000.00],
  [4010, "Annoncer", -6000.00],
  [4099, "Salgsfremmende omk. I alt", -6000.00],
  [4110, "Brændstof", -1500.00],
  [4199, "Bilomk. I alt", -1500.00],
  [4210, "Husleje", -12000.00],
  [4220, "Fremleje (indtægt)", 14000.00],
  [4299, "Lokaleomk. I alt", 2000.00],
  [4310, "Revisor", -5000.00],
  [4320, "Kontorartikler", -2500.00],
  [4398, "Administrationsomk. I alt", -7500.00],
  [4399, "Resultat før afskrivninger", 56000.00],
  [4410, "Afskrivning inventar", -3000.00],
  [4499, "Afskrivninger I alt", -3000.00],
  [4610, "Renteindtægter", 250.00],
  [4699, "Finansielle indtægter I alt", 250.00],
  [4710, "Renteudgifter", -1250.00],
  [4799, "Finansielle udgifter I alt", -1250.00],
  [4899, "Ekstraordinære poster I alt", 0],
  [4920, "Gebyrer og bøder", -800.00],
  [4930, "Andre omk. I alt", -800.00],
  [4940, "Resultat før skat", 51200.00],
  [4950, "Skat af årets resultat", -11000.00],
  [4998, "Skatter  i alt", -11000.00],
  [4999, "Årets resultat", 40200.00],
  [5000, "Balance", 0],
  [5210, "Goodwill", 100000.00],
  [5299, "Immaterielle aktiver I alt", 100000.00],
  [6510, "Lager", 30000.00],
  [6599, "Varelager I alt", 30000.00],
  [6710, "Debitorer", 45000.00],
  [6799, "Tilgodehavender I alt", 45000.00],
  [6910, "Bank (kassekredit)", -20000.00],
  [6950, "Likvide midler I alt", -20000.00],
  [6999, "Aktiver I alt", 155000.00],
  [7410, "Egenkapital primo", -79000.00],
  [7445, "Resultat år til dato", -40200.00],
  [7494, "Egenkapital i alt", -119200.00],
  [8210, "Kreditorer", -25800.00],
  [8310, "Moms", -10000.00],
  [8899, "Gæld I alt", -35800.00],
  [8999, "Passiver I alt", -155000.00],
];

/** Rækkerne som de står i arket (array-of-arrays). */
export function syntetiskeRaekker(): unknown[][] {
  return [
    [`Saldo: ${SYNTETISK_SALDO_TEKST}`, null, null],
    ["Kontonummer", "Kontonavn", "Beløb"],
    ...SYNTETISKE_KONTI.map(([nr, navn, beloeb]) => [nr, navn, beloeb]),
  ];
}

/** De forventede tal, regnet AF tabellen. */
export function syntetiskeForventninger() {
  const konto = (nr: number) => SYNTETISKE_KONTI.find(([n]) => n === nr)![2];
  const erSum = (navn: string) => /\bi\s*alt$/i.test(navn) || /^(dækningsbidrag|resultat\b|årets\s+resultat|balance$)/i.test(navn);
  const detaljerFoerEbt = SYNTETISKE_KONTI.filter(([nr, navn]) => nr < 4940 && !erSum(navn));
  const sumDetaljer = detaljerFoerEbt.reduce((s, [, , b]) => s + b, 0);
  return {
    revenue: konto(1499),
    cogs: -konto(2699),
    gross_profit: konto(2700),
    payroll: -konto(3998),
    sales_costs: -konto(4099),
    vehicle_costs: -konto(4199),
    facility_costs: 0,                       // gruppen er en kredit (+2.000) → 0 …
    other_operating_income: konto(4299),     // … og 2.000 i andre driftsindtægter
    admin_costs: -konto(4398),
    ebitda: konto(4399),
    depreciation: -konto(4499),
    financial_income: konto(4699),           // +250 — bærer eget fortegn (kun når motoren kender nøglen)
    financial_costs: -konto(4799),
    other_costs: -konto(4930),               // «Andre omk. I alt» kender skabelonen ikke → øvrige
    ebt: konto(4940),
    net_result: konto(4999),
    sumDetaljerFoerEbt: sumDetaljer,         // = ebt (kontrolsummen)
    assets_total: konto(6999),
    inventory: konto(6599),
    receivables_total: konto(6799),
    cash: konto(6950),                       // −20.000: kassekredit beholder fortegn
    equity_total: -konto(7494),              // kredit → positiv
    debt_total: -konto(8899),
    liabilities_total: -konto(8999),
  };
}
