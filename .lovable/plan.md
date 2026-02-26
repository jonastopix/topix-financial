

# Endelig 360-gennemgang: Fund og rettelser

## Status: Grundlæggende arkitektur er solid

Sikkerhed (RLS), auth-flows, company-isolation og AI-integration er generelt velfungerende. Men gennemgangen har afdaekket **3 reelle bugs** og **2 forbedringspunkter** der bor fixes for go-live.

---

## Kritiske bugs (SKAL fixes)

### 1. BudgetVsActualTab: Forkert data-isolering
**Fil:** `src/components/budget/BudgetVsActualTab.tsx` (linje 27)
**Problem:** Henter finansielle rapporter via `user_id` i stedet for `company_id`. Det betyder:
- Advisors ser deres egne (ikke-eksisterende) rapporter i stedet for virksomhedens
- Virksomheder med flere brugere ser kun den ene brugers data
**Fix:** Aendre query til at bruge `company_id` og sende `companyId` som prop i stedet for `userId`.

### 2. Handouts: Manglende companyId i useEffect dependency
**Fil:** `src/pages/Handouts.tsx` (linje 56)
**Problem:** `useEffect` afhaenger af `[user, activeModule]` men mangler `companyId`. Nar en advisor skifter virksomhed via "Vis som virksomhed", genindlaeses handouts-data IKKE.
**Fix:** Tilfoej `companyId` til dependency-arrayet.

### 3. KPIs: Manglende companyId i useEffect dependency
**Fil:** `src/pages/KPIs.tsx` (linje 157)
**Problem:** Samme moenster som Handouts - `useEffect` har `[user, companyId]` (dette er faktisk korrekt!). Dog: `kpiMetrics` useMemo (linje 228) afhaenger af `userTargets` og `userBenchmarks` men mangler `getTarget` funktionen som closure-refererer til `userTargets`. Dette er dog funktionelt korrekt da `userTargets` allerede er i deps. **Ingen fix nødvendig her.**

---

## Forbedringer (ANBEFALET for go-live)

### 4. Reports page: Bruger companyId korrekt ✓
Reports.tsx bruger allerede `company_id` i sine queries. Ingen problemer.

### 5. Chat: Korrekt isolering ✓
Chat bruger `company_id` filter for advisors og RLS for medlemmer. Fungerer korrekt.

---

## Opsummering af alle moduler

| Modul | Data-isolering | AI-integration | Funktionalitet |
|-------|---------------|----------------|----------------|
| Dashboard | OK (company_id) | N/A | OK |
| Rapportering | OK (company_id) | OK (JWT-valideret) | OK |
| Budget | **BUG** (user_id i VsActual) | OK (JWT-valideret) | OK ellers |
| Milestones | OK (company_id) | N/A | OK |
| Handouts | OK, men **BUG** (stale data) | OK (JWT-valideret) | OK ellers |
| KPI'er | OK (company_id) | N/A | OK |
| Chat | OK (company_id + RLS) | N/A | OK |
| Indstillinger | OK | N/A | OK |
| Members (advisor) | OK (advisor RLS) | N/A | OK |
| Auth / Onboarding | OK | N/A | OK |

---

## Teknisk implementeringsplan

### Trin 1: Fix BudgetVsActualTab (kritisk)
- Tilfoej `companyId` prop til `BudgetVsActualTab`
- Aendre query fra `.eq("user_id", userId!)` til `.eq("company_id", companyId!)`
- Opdater `Budget.tsx` til at sende `companyId` i stedet for `userId`

### Trin 2: Fix Handouts useEffect dependency
- Aendre linje 56 fra `[user, activeModule]` til `[user, activeModule, companyId]`

### Trin 3: Verifikation
- Sikre at alle aendringer kompilerer og at appen loader korrekt

