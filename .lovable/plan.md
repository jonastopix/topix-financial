

# Månedsoversigt: Budget vs. Realiseret med Afvigelsesmarkering

## Hvad ændres

Månedsoversigt-tabben erstattes med en ny visning der viser **budgetterede tal side-by-side med realiserede tal** fra uploadede regnskabsrapporter, pr. måned. Afvigelser markeres visuelt med farver og ikoner.

## Brugeroplevelse

- Hver budgetkategori viser to rækker: **Budget** og **Actual** (realiseret)
- En tredje implicit linje viser **afvigelsen** i procent
- Celler farves: gron hvis favorable, rod hvis ugunstig (over 10% afvigelse), gul for mindre afvigelser
- Måneder uden rapport-data viser "--" i actual-rækken
- Et overordnet summary-kort viser total omsætning, omkostninger og EBITDA for budget vs. actual

## Datakilder

- **Budget**: Hentes fra `scenarioData.base` (allerede tilgængelig i state)
- **Actual**: Hentes fra `financial_reports` tabellen, hvor `extracted_data.key_figures` indeholder realiserede nøgletal per rapportperiode (f.eks. "Oktober 2025")
- Mapping mellem rapportperioder og måneds-index sker via den eksisterende `parseReportPeriodToKey` funktion fra `financialUtils.ts`

## Teknisk implementering

### Fil: `src/pages/Budget.tsx`

1. **Tilfoej data-fetching**: Brug `useQuery` til at hente `financial_reports` for brugeren (status = "processed"), filtreret på det valgte år
2. **Byg actuals-map**: For hver rapport, map `report_period` til månedsindex (0-11) og udtræk `key_figures` (omsaetning, loenninger, marketing, lokaler, admin, etc.)
3. **Map budget-kategorier til report-keys**: Genbrug logik fra `BudgetComparison.tsx`s `mapReportToActuals` -- lav en mapping fra budgetkategori-keys til extracted_data keys
4. **Erstat Månedsoversigt tab-indhold** (linje 702-776):
   - Vis summary-kort med Budget vs. Actual totaler
   - Vis en tabel med kolonner: Kategori | Jan Budget | Jan Actual | ... | Dec Budget | Dec Actual
   - Alternativt (og mere overskueligt): vis to sub-rækker pr. kategori i samme 12-måneds grid, med afvigelsesmarkering i cellerne
   - EBITDA-række i bunden med budget vs. actual

### Celle-formatering
- Celle viser budgettal og actual under hinanden
- Afvigelsesfarve:
  - Gron (`text-primary`): favorable afvigelse (actual >= budget for indtægt, actual <= budget for omkostning)
  - Rod (`text-destructive`): ugunstig afvigelse over 10%
  - Gul (`text-chart-warning`): ugunstig afvigelse under 10%
  - Gra (`text-muted-foreground`): ingen actual-data

### Kategori-mapping
Opretter en mapping-konstant der kobler budget template-keys til report key_figures:

```text
omsaetning       -> key_figures.omsaetning
direkte_omk      -> key_figures.direkte_omkostninger
loenninger       -> key_figures.loenninger
marketing        -> key_figures.marketing
lokaler          -> key_figures.lokaler
admin            -> key_figures.admin
tech_software    -> key_figures.tech_software
```

### Filer der oprettes/ændres

- **`src/pages/Budget.tsx`**: Erstatter Månedsoversigt tab-indholdet (linje 702-776) med den nye budget vs. actual visning. Tilfojer useQuery til at hente rapportdata og beregne actuals pr. måned.

Ingen nye filer, ingen database-ændringer, ingen nye dependencies.
