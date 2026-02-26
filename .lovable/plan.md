
# Fix: "Kræver opmærksomhed" tjekker forkert måned

## Problem
Dashboardet viser "Februar-rapport mangler" d. 26. februar, men man kan forst uploade en rapport for en given maaned naar maaneden er slut. Saa i februar skal systemet kun tjekke om **januar**-rapporten mangler -- ikke februar.

## Losning
AEndr logikken i `AttentionNeeded.tsx` saa den tjekker for den **forrige maaneds** rapport i stedet for den nuvaerende maaned.

## Teknisk detalje
I `src/components/AttentionNeeded.tsx` (linje 41-76):

- Beregn forrige maaned i stedet for nuvaerende:
  - Hvis vi er i januar, tjek december forrige aar
  - Ellers tjek maaned - 1

- Opdater `currentKey`, `title`, `description` og `daysLeft`-beregning til at referere til forrige maaned

- `daysLeft` giver nu mening som "dage siden maaneden sluttede" eller kan fjernes, da deadline-konceptet er anderledes (man bor uploade saa hurtigt som muligt i den nye maaned)

Konkret aendring:
```
// Fra:
const currentKey = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;

// Til:
const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
const prevKey = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
```

Og tjek `prevKey` i stedet for `currentKey`. Titlen bliver f.eks. "Januar-rapport mangler" naar vi er i februar.
