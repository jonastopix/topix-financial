

# Indsæt 12 historiske rapporter for NordService ApS (Jul 2024 – Jun 2025)

## Formaal

Tilfoej 12 maaneders historiske rapporter saa Year-over-Year (YOY) sammenligningen paa dashboardet aktiveres automatisk. Tallene skal vaere 15-20% lavere end de tilsvarende 2025/2026-maaneder for at vise en trovaerdig vaeksthistorie.

## Dataoversigt

Eksisterende rapporter (Jul 2025 – Feb 2026) har disse omsaetningstal:
- Jul 2025: 180k, Aug: 145k, Sep: 195k, Okt: 230k, Nov: 210k, Dec: 170k, Jan 2026: 220k, Feb 2026: 240k

De nye rapporter (Jul 2024 – Jun 2025) designes ca. 15-20% lavere:

| Periode | Omsaetning | Loenninger | Dir.omk | Marketing | Lokaler | Admin | Tech | Afskriv. | Resultat | Bank |
|---|---|---|---|---|---|---|---|---|---|---|
| Juli 2024 | 150.000 | -82.000 | -12.000 | -9.000 | -7.000 | -4.000 | -3.000 | -1.500 | 31.500 | 280.000 |
| August 2024 | 120.000 | -78.000 | -10.000 | -8.000 | -7.000 | -4.000 | -3.000 | -1.500 | 8.500 | 275.000 |
| September 2024 | 165.000 | -85.000 | -13.000 | -10.000 | -7.000 | -4.500 | -3.000 | -1.500 | 41.000 | 290.000 |
| Oktober 2024 | 195.000 | -88.000 | -14.000 | -11.000 | -7.500 | -4.500 | -3.500 | -1.500 | 65.000 | 310.000 |
| November 2024 | 175.000 | -86.000 | -13.000 | -10.000 | -7.500 | -4.500 | -3.500 | -1.500 | 49.000 | 325.000 |
| December 2024 | 140.000 | -80.000 | -11.000 | -9.000 | -7.500 | -4.000 | -3.500 | -1.500 | 23.500 | 315.000 |
| Januar 2025 | 185.000 | -87.000 | -13.500 | -10.500 | -7.500 | -4.500 | -3.500 | -1.500 | 57.000 | 335.000 |
| Februar 2025 | 200.000 | -90.000 | -14.000 | -11.000 | -7.500 | -4.500 | -3.500 | -1.500 | 68.000 | 345.000 |
| Marts 2025 | 190.000 | -88.000 | -13.500 | -10.500 | -7.500 | -4.500 | -3.500 | -1.500 | 61.000 | 355.000 |
| April 2025 | 175.000 | -86.000 | -13.000 | -10.000 | -7.500 | -4.500 | -3.500 | -1.500 | 49.000 | 345.000 |
| Maj 2025 | 160.000 | -84.000 | -12.500 | -9.500 | -7.500 | -4.000 | -3.500 | -1.500 | 37.500 | 340.000 |
| Juni 2025 | 170.000 | -85.000 | -13.000 | -10.000 | -7.500 | -4.500 | -3.500 | -1.500 | 45.000 | 348.000 |

## YOY-sammenligninger der aktiveres

Naar disse rapporter er indsat, vil dashboardet automatisk vise:

- **Jul 2025 vs Jul 2024**: 180k vs 150k = +20% omsaetning
- **Aug 2025 vs Aug 2024**: 145k vs 120k = +21% omsaetning
- **Sep 2025 vs Sep 2024**: 195k vs 165k = +18% omsaetning
- **Jan 2026 vs Jan 2025**: 220k vs 185k = +19% omsaetning
- **Feb 2026 vs Feb 2025**: 240k vs 200k = +20% omsaetning

## Teknisk implementering

### Trin 1: Indsaet 12 rapporter via data-insert

Indsaet 12 raeekker i `financial_reports` med:
- `company_id`: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- `user_id`: `23e81de4-db14-40b6-92ed-0d84ed3c71f1`
- `status`: `processed`
- `report_type`: `saldobalance`
- `file_name`: f.eks. `NordService_Juli_2024.pdf`
- `file_path`: f.eks. `demo/nordservice_jul24.pdf`
- `report_period`: dansk maanedsformat, f.eks. `Juli 2024`
- `extracted_data`: JSONB med `key_figures` der indeholder alle 9 noeglertal (omsaetning, loenninger, direkte_omkostninger, marketing, lokaler, admin, tech_software, afskrivninger, resultat, resultat_foer_skat, bank_balance)

### Trin 2: Verificer

Skift til NordService i virksomhedsvælgeren og bekraeft at dashboardet nu viser YOY-badges paa KPI-kortene.

Ingen kodeaendringer er noedvendige -- dashboardet haandterer allerede YOY-logikken automatisk via `parseReportPeriodToKey`.
