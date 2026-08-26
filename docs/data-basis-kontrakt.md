# data_basis-kontrakten: estimat mod måling i financial_report_facts

Indført 2026-08-26 (branch `faktum-datagrundlag`, migration
`20260826120000_data_basis_paa_facts.sql`). Dette er det ENE sted skelnen
står — næste skriver skal ikke gætte.

## Skelnen

| Kolonne | Bærer | Værdier |
|---|---|---|
| `source_type` | **HVEM** der skrev rækken — skrivevejens identitet | `canonical`, `canonical_v2`, `manual`, `annual_report`, `manual_baseline`, `baseline` |
| `data_basis` | **HVAD** rækken er — dommen over tallet | `measured`, `estimated` |

- **`measured`**: tal fra en rigtig periode-rapport for netop den måned
  rækken sidder på.
- **`estimated`**: afledt eller fordelt tal — en årsrapports årstal divideret
  med 12 og kopieret ud i tolv måneder, en baseline-fordeling bag en
  `_annual_baseline_sentinel_`-attraprapport, eller enhver fremtidig
  konstruktion der ikke er en måling af måneden selv.

`source_type` kan IKKE bære dommen. Målt i prod 26/8: `manual` dækker både
rigtige måneds-commits (via `commit_report_facts`) og baseline-fordelinger
(`save-annual-baseline` skriver `source_type='manual'` bag sentinel-attrappen).
Samme mærkat, to vidt forskellige epistemiske statusser — deraf kolonnen.

## Regler for skrivere

1. **Sæt altid `data_basis` eksplicit.** Kolonnens default (`'measured'`)
   findes udelukkende som værn mod en overset fremtidig skriver — den er
   ikke en skrivevej. Håndhævet af CI-testen
   `src/test/factsDataBasisGuard.test.ts` (fejler på TS-inserts/upserts uden
   `data_basis` og på SQL-INSERTs i migrationer ≥ `20260826120000` uden
   kolonnen i kolonnelisten).
2. **Kendte skriveveje og deres dom:**
   - `commit_report_facts` (alle resolver-grene: canonical/canonical_v2/manual) → `'measured'`
   - `extract-annual-report` → `'estimated'`
   - `save-annual-baseline` → `'estimated'`
   - `auto-create-baseline-budget` → `'estimated'`
3. **En ny skriver** der ikke oplagt er det ene eller det andet er et
   design-spørgsmål, ikke et default-spørgsmål.

## Læsere

`useCompanyFacts` eksponerer feltet på `CompanyFact.data_basis`.
`factsAdapter` arbejder kun på `metrics`-objektet — `data_basis` er en
række-kolonne og må aldrig flyttes ind i metrics. Pr. denne PR ændrer INGEN
komponent adfærd på feltet; det er alene gjort tilgængeligt, så senere spor
(estimat-markering i grafer, agent-vægtning m.v.) kan skelne uden ny migration.

## Deploy-note

Migrationen køres manuelt i Lovable → SQL editor (jf. CLAUDE.md).
SELECT-før/efter-tallene i migrationskommentaren udfyldes ved kørsel:
forventet 156 + 12 = 168 `estimated`, 162 `measured`, 330 i alt (målt 26/8).
