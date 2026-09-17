/**
 * saldobalanceSyntetisk.ts — SYNTETISK e-conomic saldobalance-XLSX (17/9-2026).
 *
 * INGEN kundedata (Jonas 17/9): fiktivt firma, fiktivt CVR, fiktive beløb. Opbygningen
 * er den målte (to rigtige filer 17/9): rækkerne 1–6 som e-conomic skriver dem,
 * kolonnerne A Nr. · B Navn · C «Perioden · Indeværende år» · D «Perioden · Året før» ·
 * E «År til dato · Indeværende år» · F «År til dato · Året før» · G Note; ingen sektioner,
 * ingen sumkonti. De STRUKTURELLE træk fra virkeligheden er med: kreditposter i
 * 3400-gruppen (lejeindtægter), balancens akkumulerede afskrivninger 5111/5116 (kun i E),
 * resultatkonti uden for skabelonens navngivne intervaller (2770, 3131, 4210), en
 * kreditnota i omsætningsgruppen og en lagerregulering (kredit) i vareforbruget.
 *
 * Filen saldobalance_syntetisk_v1.xlsx er genereret af netop denne tabel (script i
 * udkastets README; `XLSX.utils.aoa_to_sheet` af RAEKKER). Testen læser xlsx'en gennem
 * xlsxRawParser og regner de forventede tal AF TABELLEN — så filen og tabellen kan
 * aldrig drive fra hinanden ubemærket.
 */

export const SYNTETISK_FIRMA = "9999999 - Testhuset ApS - CVR 12345678";
export const SYNTETISK_PERIODE = "01.03.26 - 31.03.26";

/** [nr, navn, C periode, E år til dato]. Balance-konti har C = 0 (som i de rigtige filer). */
export const SYNTETISKE_KONTI: ReadonlyArray<readonly [number, string, number, number]> = [
  [1010, "Salg af varer/ydelser m/moms", -180000.00, -500000.00],
  [1110, "Salg af varer/ydelser til udlandet", -20000.00, -60000.00],
  [1210, "Kreditnotaer", 1500.00, 4000.00],
  [1310, "Vareforbrug", 60000.00, 170000.00],
  [1320, "Lagerregulering", -5000.00, -8000.00],
  [2210, "Lønninger", 40000.00, 120000.00],
  [2770, "Rejseudgifter", 3000.00, 7000.00],
  [2810, "Annoncer og reklame", 8000.00, 20000.00],
  [3131, "Bro/færge/parkering", 700.00, 1900.00],
  [3401, "Lejeindtægter", -30000.00, -90000.00],
  [3410, "Husleje", 12000.00, 36000.00],
  [3420, "El, vand og varme", 2500.00, 8100.00],
  [3610, "Kontorartikler", 4200.00, 9000.00],
  [3620, "Revisor og bogholder", 6000.00, 6000.00],
  [4210, "Renteindtægter, bank", -100.00, -250.00],
  [4410, "Renteudgifter, bank", 900.00, 2600.00],
  [5111, "Indretning, anskaffelse primo", 0, 120000.00],
  [5116, "Indretning, afskrivning primo", 0, -30000.00],
  [5117, "Indretning, årets afskrivninger", 0, 0],
  [5610, "Debitorer", 0, 45000.00],
  [5810, "Bank", 0, 80000.00],
  [6110, "Egenkapital primo", 0, 150000.00],
  [6810, "Kreditorer", 0, -20000.00],
  [6910, "Moms", 0, -12000.00],
];

/** Rækkerne som de står i arket (array-of-arrays) — samme layout som e-conomic. */
export function syntetiskeRaekker(): unknown[][] {
  return [
    [],
    [SYNTETISK_FIRMA],
    ["Rapporter > Regnskab >"],
    [`Saldobalance for perioden ${SYNTETISK_PERIODE}`],
    ["", null, "Perioden", null, "År til dato"],
    ["Nr.", "Navn", `Indeværende år${SYNTETISK_PERIODE}`, "Året før01.03.25 - 31.03.25", "Indeværende år01.01.26 - 31.03.26", "Året før01.01.25 - 31.03.25", "Note"],
    ...SYNTETISKE_KONTI.map(([nr, navn, c, e]) => [nr, navn, c, null, e, null, ""]),
  ];
}

/** De forventede tal, regnet AF tabellen (ikke skrevet af) — testen sammenligner motoren med disse. */
export function syntetiskeForventninger() {
  const pnl = SYNTETISKE_KONTI.filter(([nr]) => nr >= 1000 && nr <= 4999);
  const sum = (fra: number, til: number) => pnl.filter(([nr]) => nr >= fra && nr <= til).reduce((s, [, , c]) => s + c, 0);
  const grupper: Record<string, number> = {
    omsaetning: sum(1000, 1299), direkte_omkostninger: sum(1300, 1499), loenninger: sum(2200, 2299), salgsomkostninger: sum(2800, 2899),
    lokaleomkostninger: sum(3400, 3599), administrationsomkostninger: sum(3600, 3799), finansieringsudgifter: sum(4400, 4499),
  };
  const navngivne = new Set(Object.keys(grupper));
  const iNavngiven = (nr: number) => (nr >= 1000 && nr <= 1299) || (nr >= 1300 && nr <= 1499) || (nr >= 2200 && nr <= 2299) || (nr >= 2800 && nr <= 2899) || (nr >= 3400 && nr <= 3599) || (nr >= 3600 && nr <= 3799) || (nr >= 4400 && nr <= 4499);
  grupper.oevrige_omkostninger = pnl.filter(([nr]) => !iNavngiven(nr)).reduce((s, [, , c]) => s + c, 0);
  void navngivne;
  const ebt = -pnl.reduce((s, [, , c]) => s + c, 0);
  const revenue = -grupper.omsaetning;
  const positiv = (k: string) => Math.max(0, grupper[k]);
  const andre = Object.entries(grupper).filter(([k, v]) => k !== "omsaetning" && v < 0).reduce((s, [, v]) => s - v, 0);
  const cogs = positiv("direkte_omkostninger");
  const gross_profit = revenue - cogs;
  const drift = positiv("loenninger") + positiv("salgsomkostninger") + positiv("lokaleomkostninger") + positiv("administrationsomkostninger") + positiv("oevrige_omkostninger");
  const ebitda = gross_profit - drift + andre;
  return {
    revenue, cogs, gross_profit,
    payroll: positiv("loenninger"), sales_costs: positiv("salgsomkostninger"), facility_costs: positiv("lokaleomkostninger"),
    admin_costs: positiv("administrationsomkostninger"), other_costs: positiv("oevrige_omkostninger"), financial_costs: positiv("finansieringsudgifter"),
    other_operating_income: andre, depreciation: 0, ebitda, ebit: ebitda, ebt,
    pnlKonti: pnl.length,
  };
}
