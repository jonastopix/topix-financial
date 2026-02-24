

# Fix: Budget Widget Viser Forkerte Tal

## Problem Identificeret

BudgetOverview-widgetten paa dashboardet har **to kritiske bugs**:

### Bug 1: Omsaetning genkendes aldrig
Koden checker `cat.includes("omsætning")` (med ae-ligatur), men den faktiske kategori-key i databasen er `omsaetning` (ASCII uden ligatur). Derfor ender **alle** budget-raekker — inkl. omsaetning — i "Omkostninger"-gruppen.

### Bug 2: Ingen filtrering paa aar eller scenarie
Widgetten henter ALLE `budget_targets` for brugeren uden at filtrere paa period-format. Da periods er gemt som f.eks. `2026-base-0`, summeres alle scenarier (base + optimistisk + pessimistisk) og potentielt alle aar. Det giver forkerte (for hoeje) tal.

## Loesung

### Fil: `src/components/BudgetOverview.tsx`

1. **Fix kategori-matching**: Tilfoej `omsaetning` (uden ligatur) til revenue-checket:
   ```
   cat.includes("omsaetning") || cat.includes("omsætning") || cat.includes("revenue")
   ```

2. **Filtrer paa aar og base-scenarie**: Tilfoej `.like("period", "${currentYear}-base-%")` til queryen, saa kun indevaerende aars base-scenarie medregnes.

3. **Beregn korrekt maanedligt budget**: Da hver raekke repraesenterer en enkelt maaned, summeres de 12 maaneder korrekt til aarstotaler.

### Ingen andre filer aendres
- `/budget`-siden er korrekt — den parser period-formatet rigtigt
- Ingen database-aendringer

## Resultat
- Omsaetning vises korrekt som "Omsaetning" (ikke blandet ind i omkostninger)
- Budget-tal reflekterer kun base-scenariet for det aktuelle aar
- Afvigelsesmarkering (groen/roed) fungerer nu korrekt
