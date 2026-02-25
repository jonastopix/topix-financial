

# Fix: Omsaetning vs. Udgifter viser ikke seneste 12 maaneder

## Problem

`RevenueChart.tsx` henter rapporter med:
- `.order("uploaded_at", { ascending: false })`
- `.limit(12)`

Dette returnerer de 12 senest uploadede rapporter, men upload-raekkefoelgen matcher ikke noedvendigvis perioderaekkefoelgen. NordService har 20 rapporter (jul 2024 til feb 2026), saa `.limit(12)` afskærer 8 maaneder tilfaeldigt baseret paa upload-dato.

## Loesning

1. **Fjern `.limit(12)`** fra queryen, saa alle rapporter hentes
2. **Tag de seneste 12 maaneder** fra det sorterede `chartData`-array i stedet (`.slice(-12)`)

Dette sikrer at grafen altid viser de 12 seneste perioder uanset upload-raekkefoelge.

## Teknisk aendring

**Fil: `src/components/RevenueChart.tsx`**

- Linje 22: Fjern `.limit(12)` fra queryen
- Linje 46: Tilfoej `.slice(-12)` efter sortering, saa kun de seneste 12 maaneder vises i grafen

Resultatet: grafen viser nu korrekt de seneste 12 maaneder i kronologisk raekkefoelge.
