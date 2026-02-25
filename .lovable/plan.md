

# Fix budget periodeformater for NordService ApS

## Problem

Budget-tabellen for NordService bruger periodeformatet "Januar 2026", "Februar 2026" osv., men koden i `Budget.tsx` (linje 252-256) forventer formatet `year-scenario-monthIdx`, f.eks. `2026-base-0` for januar. Derfor parses ingen budget-vaerdier, og Maanedsoversigt viser "0k" overalt.

Der mangler ogsaa en `__template__` marker (periodevardien "konsulent_service" tyder paa et forsog, men den er gemt forkert).

## Loesning

Opdater alle 132 budget_targets-raekker (11 kategorier x 12 maaneder) for NordService saa periodevardien aendres fra dansk maanedsformat til det korrekte `year-scenario-monthIdx` format:

| Nuvaerende periode | Ny periode |
|---|---|
| Januar 2026 | 2026-base-0 |
| Februar 2026 | 2026-base-1 |
| Marts 2026 | 2026-base-2 |
| April 2026 | 2026-base-3 |
| Maj 2026 | 2026-base-4 |
| Juni 2026 | 2026-base-5 |
| Juli 2026 | 2026-base-6 |
| August 2026 | 2026-base-7 |
| September 2026 | 2026-base-8 |
| Oktober 2026 | 2026-base-9 |
| November 2026 | 2026-base-10 |
| December 2026 | 2026-base-11 |

Derudover rettes `__template__` markeren saa `period = 'konsulent_service'` og `category = '__template__'`.

## Teknisk implementering

### Trin 1: Opdater periodeformater via data-update

Koer 12 UPDATE-statements der omdoeber perioderne:

```sql
UPDATE budget_targets SET period = '2026-base-0' WHERE company_id = 'a1b2c3d4-...' AND period = 'Januar 2026';
UPDATE budget_targets SET period = '2026-base-1' WHERE company_id = 'a1b2c3d4-...' AND period = 'Februar 2026';
-- ... osv for alle 12 maaneder
```

### Trin 2: Ret template-marker

Opdater raekken med `period = 'konsulent_service'` saa den har `category = '__template__'` og beholder `period = 'konsulent_service'`.

### Trin 3: Fix BudgetVsActualTab query

`BudgetVsActualTab` henter rapporter med `.eq("user_id", userId!)` (linje 972), men NordService-rapporterne har en anden `user_id`. Vi bor aendre queryen til at bruge `company_id` i stedet, da det er mere korrekt for multi-bruger virksomheder. Alternativt sikre at demo-brugerens ID matcher.

### Trin 4: Verificer

Skift til NordService i virksomhedsvaelgeren og bekraeft at budget-tabellen og Maanedsoversigt nu viser korrekte tal.

## Ingen kodeaendringer noevendige (muligvis)

Hvis demo-brugeren er den samme som `user_id` paa rapporterne, er det kun data-opdateringer. Hvis ikke, skal linje 972 i Budget.tsx aendres fra `user_id` til `company_id`.
