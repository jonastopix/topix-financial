/**
 * saldobalancePdfGrupperSyntetisk.ts — SYNTETISK e-conomic saldobalance-PDF i KJ AUTO-FORMEN (17/9-2026).
 *
 * INGEN kundedata: fiktivt firma, fiktive konti og beløb. Opbygningen er den målte i Jonas' fil
 * (Saldobalance_feb2026_KJauto.pdf, ~22:00): grupper UDEN «i alt» (overskriftslinje → kontolinjer →
 * sumlinje med samme navn), grupper inde i grupper (Nettoomsætning rummer omsætningsgrupperne; Personale-
 * udgifter rummer «Løn i alt»; Udlejning af fast ejendom rummer en indtægt og en lille omkostning;
 * Kapacitetsomkostninger rummer alle driftsgrupper; Gæld rummer Lang-/Kortfristet gæld), 4-cifrede
 * resultatkonti og 5-cifrede balancekonti, kreditformat (omsætning og overskud negative), «Resultat før
 * renter» → «Renteudgifter» → «Resultat før ekstraordinære poster» → «Resultat», og totalerne «Aktiver» /
 * «Passiver» uden «i alt». pdftotext -layout-form (tekst, ikke strukturel payload).
 */

export const KJ_FORM_TEKST = `                              1274971 - Testhuset Auto ApS - CVR 12345678

Rapporter » Regnskab »
Saldobalance for perioden 01.02.26 - 28.02.26
(NB! Indeholder muligvis ikke-bogførte posteringer i kassekladderne.)


Nr.     Navn                                                Perioden      År til dato

        Resultatopgørelse


        Nettoomsætning


        Omsætning Værksted
1105 Salg diverse                                          -150.000,00      -300.000,00
1115 Arbejdsløn                                            -250.000,00      -500.000,00
        Omsætning Værksted                                 -400.000,00      -800.000,00


        Omsætning Bilsalg
1210 Salg biler                                            -600.000,00    -1.200.000,00
        Omsætning Bilsalg                                  -600.000,00    -1.200.000,00
        Nettoomsætning                                   -1.000.000,00    -2.000.000,00


        Vareforbrug


        Vareforbrug Værksted
2150 Varekøb                                                200.000,00       400.000,00
        Vareforbrug Værksted                                200.000,00       400.000,00
        Vareforbrug Bilsalg
2250 Køb af biler                                           400.000,00       800.000,00
        Vareforbrug Bilsalg                                 400.000,00       800.000,00
        Vareforbrug                                         600.000,00     1.200.000,00
        Dækningsbidrag                                     -400.000,00      -800.000,00


        Kapacitetsomkostninger
        Salgsfremmende omk.
3010 Annoncer                                                20.000,00        40.000,00
        Salgsfremmende omk.                                  20.000,00        40.000,00
        Personaleudgifter
        Løn i alt
3100 Løn                                                    200.000,00       400.000,00
        Løn i alt                                           200.000,00       400.000,00
3190 Personaleudgifter                                       20.000,00        40.000,00
        Personaleudgifter                                   220.000,00       440.000,00
        Administrationsomkostninger
5080 Telefon og internet                                     50.000,00       100.000,00
        Administrationsomkostninger                          50.000,00       100.000,00
        Lokaleomkostninger
5200 Husleje                                                 30.000,00        60.000,00
        Lokaleomkostninger                                   30.000,00        60.000,00
Nr.    Navn                                                Perioden      År til dato
        Udlejning af fast ejendom
        Sekundære lejeindtægter
5900 Lejeindtægt                                            -20.000,00       -40.000,00
        Sekundære lejeindtægter                             -20.000,00       -40.000,00
        Personbil
5950 Personbil                                                5.000,00        10.000,00
        Personbil                                             5.000,00        10.000,00
        Udlejning af fast ejendom                           -15.000,00       -30.000,00
        Driftsmiddelomkostninger
6010 Småanskaffelser                                         10.000,00        20.000,00
        Driftsmiddelomkostninger                             10.000,00        20.000,00
        Kapacitetsomkostninger                              315.000,00       630.000,00
        Afskrivninger
        Resultat før renter                                 -85.000,00      -170.000,00
        Renteindtægter
        Renteudgifter
8100 Renter bank                                              2.000,00         4.000,00
        Renteudgifter                                         2.000,00         4.000,00
        Resultat før ekstraordinære poster                  -83.000,00      -166.000,00
        Ekstraordinære poster
        Resultat                                            -83.000,00      -166.000,00
Nr.     Navn                                                Perioden      År til dato
        AKTIVER:
        Anlægsaktiver
        Grunde og bygninger:
11510   Kostpris, primo                                           0,00       500.000,00
11540   Afskrivninger primo                                       0,00      -100.000,00
        Bogført værdi                                             0,00       400.000,00
        Anlægsaktiver                                             0,00       400.000,00
        Omsætningsaktiver
        Varebeholdninger
21400   Reservedelslager                                          0,00       300.000,00
        Varebeholdninger                                          0,00       300.000,00
        Tilgodehavender
23100   Tilgodehavende fra salg                              10.000,00       100.000,00
        Tilgodehavender                                      10.000,00       100.000,00
        Likvide beholdninger
31000   Kasse                                                 5.000,00        10.000,00
33000   Bank                                                -25.000,00       -60.000,00
        Likvide beholdninger                                -20.000,00       -50.000,00
        Omsætningsaktiver                                   -10.000,00       350.000,00
        Aktiver                                             -10.000,00       750.000,00
Nr.     Navn                                                Perioden      År til dato
        Passiver
        Egenkapital (personlig)
41100   Egenkapital, primo                                        0,00      -317.000,00
        Periodens resultat                                  -83.000,00      -166.000,00
        Egenkapital (personlig)                             -83.000,00      -400.000,00
        Gæld
        Langfristet gæld
52200   Banklån                                                   0,00      -200.000,00
        Langfristet gæld                                          0,00      -200.000,00
        Kortfristet gæld
        Leverandørgæld
57100   Varekreditorer                                       93.000,00      -150.000,00
        Leverandørgæld                                       93.000,00      -150.000,00
        Kortfristet gæld                                     93.000,00      -150.000,00
        Gæld                                                 93.000,00      -350.000,00
        Passiver                                             10.000,00      -750.000,00
        Afstemningstotal                                          0,00             0,00
`;

/** Det regnestykket giver — og som testen kræver: 1.000.000 − 600.000 − 200.000 (løn) − 20.000 (øvrige personale)
    − 20.000 (salg) − 50.000 (admin) − 30.000 (lokaler) − 10.000 (driftsmidler → øvrige) − 2.000 (renter) + 15.000
    (udlejning, nettoindtægt) = 83.000 = Resultat. Balancen: 400.000 + 300.000 + 100.000 − 50.000 = 750.000. */
export const KJ_FORM_FORVENTET = {
  revenue: 1_000_000, cogs: 600_000, gross_profit: 400_000,
  payroll: 200_000, other_staff_costs: 20_000, sales_costs: 20_000, admin_costs: 50_000, facility_costs: 30_000,
  other_costs: 10_000, other_operating_income: 15_000, financial_costs: 2_000, ebt: 83_000,
  assets_total: 750_000, inventory: 300_000, trade_receivables: 100_000, cash: -50_000, equity_total: 400_000, debt_total: 350_000, liabilities_total: 750_000,
};
