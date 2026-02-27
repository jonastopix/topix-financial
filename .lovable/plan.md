

## Plan: Forbedret finansiel dataekstraktion med validering

### Problemet
Den nuværende extraction mangler validering og raw-data, hvilket gør det svært at opdage fejl. ChatGPT-prompten har flere gode ideer vi kan adoptere uden at omskrive hele systemet.

### Tilgang
Vi opgraderer den eksisterende edge function med tre nøgleforbedringer, men beholder vores tool-calling arkitektur (som fungerer godt).

### Ændringer

#### 1. Tilføj validering til tool-schema og prompt (extract-financial-data/index.ts)

Udvid tool-parametrene med et `validation`-objekt:
```text
validation: {
  status: "PASS" | "FAIL" | "UNSURE",
  checks: [
    { name: "daekningsbidrag_sum", result: "PASS|FAIL|SKIP", details: "..." },
    { name: "resultat_consistency", result: "PASS|FAIL|SKIP", details: "..." },
    { name: "balance_equation", result: "PASS|FAIL|SKIP", details: "..." }
  ]
}
```

Prompten instruerer AI'en til at:
- Tjekke at omsaetning - direkte_omkostninger er lig med daekningsbidrag (tolerance 1 kr.)
- Tjekke at subtotaler stemmer med summen af underposter
- Tjekke balance-ligning for saldobalancer
- Sætte status = "UNSURE" hvis den er i tvivl om et tal

#### 2. Tilføj raw_sign til line_items

Udvid `line_items` med:
- `raw_sign`: "PLUS" eller "MINUS" - det originale fortegn fra dokumentet
- `account_no`: kontonummer hvis tilgængeligt
- `class`: standardiseret klassificering (REVENUE, COGS, OPEX, DEPR, FIN_EXPENSE, TAX, ASSET, LIABILITY, EQUITY)

Dette giver os mulighed for at debugge fortegnsproblemer efter extraction.

#### 3. Post-processing validering i edge function

Efter AI returnerer data, korer vi vores egne valideringstjek i TypeScript:
- Tjek at `omsaetning - direkte_omkostninger` matcher `daekningsbidrag` (inden for tolerance)
- Tjek at resultat_foer_skat har korrekt fortegn ift. de andre poster
- Log warnings til console hvis valideringen fejler
- Gem `validation`-objektet i `extracted_data` i databasen

#### 4. Forbedret prompt med eksplicit talformat-instruktion

Tilfoej til systemprompten:
- Eksplicit instruktion om dansk talformat (tusindtalsseparator "." og decimal ",")
- Parenteser som negativt tal: "(1.234,56)" = -1234.56
- UKLASSIFICERET fallback: hvis AI'en ikke kan klassificere en linje, sæt class til "UKLASSIFICERET"

### Filer der aendres

| Fil | Aendring |
|-----|----------|
| `supabase/functions/extract-financial-data/index.ts` | Udvidet prompt, tool-schema med validation + raw_sign + class, post-processing validering |

### Hvad vi IKKE aendrer
- Frontend-koden: den bruger allerede `key_figures` fra `extracted_data`, og det format forbliver det samme
- Dashboard/rapporteringskomponenter: ingen aendringer nødvendige
- Database-schema: `extracted_data` er allerede JSONB, så det nye format passer ind

### Forventet resultat
- Hver rapport faar en `validation.status` der viser om tallene er konsistente
- Raw fortegn bevares til debugging
- AI'en faar en escape-hatch ("UNSURE") i stedet for at gætte forkert
- Post-processing i edge function fungerer som second line of defense

