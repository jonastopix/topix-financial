
# Tilfoej Nye Budget-Kategorier Manuelt i Preview

## Funktionalitet

En "+ Tilfoej kategori"-knap i bunden af hver gruppe (Indtaegter, Variable, Personale osv.) der aabner en inline formular til at oprette en ny budget-kategori med navn, gruppe-tilhoersforhold og 12 maanedlige beloeb.

## Implementering

### Fil: `src/components/BudgetFromAccounts.tsx`

1. **Ny state**: `addedCategories` (array af `BudgetCategory`) til at holde manuelt tilfoejede kategorier separat fra AI-genererede.

2. **"+ Tilfoej kategori"-knap**: Vises i bunden af hver gruppe-sektion. Klik aabner en inline formular med:
   - Input til kategori-navn (label)
   - Auto-genereret key baseret paa label (lowercase, replace spaces)
   - Gruppe saettes automatisk til den gruppe knappen er i
   - 12 maanedlige felter (starter paa 0, redigerbare)
   - "Tilfoej" og "Annuller" knapper

3. **Integration med eksisterende logik**:
   - `result.categories` kombineres med `addedCategories` i renderingen og i `handleConfirm`
   - `getFinalMonthly`, overrides, og labelOverrides fungerer ogsaa for tilfoejede kategorier
   - Summary KPIs (omsaetning, omkostninger, resultat) inkluderer de nye kategorier
   - Nulstil-knappen clearer ogsaa `addedCategories`
   - Tilfoejede kategorier faar `source_lines: ["Manuelt tilføjet"]`

4. **Slet-mulighed**: Tilfoejede kategorier faar en lille X-knap saa de kan fjernes igen (AI-genererede kan ikke slettes).

### Visuelt
- Tilfoejede kategorier markeres med en lille "Manuelt" badge
- Knappen bruger Plus-ikonet og matcher det eksisterende design
- Inline formular vises direkte i gruppen uden modal/dialog
