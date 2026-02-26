
# Fix: Korrekt dataisolering ved "Vis som virksomhed" + Leveringsoverblik baseret på virksomhedens forløbsdatoer

## Problem
1. **AI Finansiel Analyse** henter rapporter via `user_id` i stedet for `company_id`. Når en rådgiver viser som en anden virksomhed, ses stadig rådgiverens egne data (NordService).
2. **Leveringsoverblik (programStart)** beregnes ud fra brugerens `profiles.created_at` i stedet for virksomhedens faktiske `start_date` fra `companies`-tabellen. Hver virksomhed har individuelle start- og slutdatoer, som bør bruges.

## Løsning

### 1. AIFinancialAnalysis: Skift fra user_id til company_id
**Fil:** `src/components/AIFinancialAnalysis.tsx`
- Ændre props fra `userId` til `companyId`
- Ændre query fra `.eq("user_id", userId)` til `.eq("company_id", companyId)`
- Opdatere alle steder der bruger komponenten (Reports.tsx, MemberDetail.tsx) til at sende `companyId` i stedet for `userId`

### 2. Reports.tsx: Brug virksomhedens start_date som programStart
**Fil:** `src/pages/Reports.tsx`
- Hent `start_date` fra `companies`-tabellen via `companyId` i stedet for `profiles.created_at`
- Brug `companies.start_date` direkte som `programStart` for DeliveryOverview

### 3. MemberDetail.tsx: Brug virksomhedens start_date
**Fil:** `src/pages/MemberDetail.tsx`
- Hent virksomhedens `start_date` fra `companies`-tabellen
- Send den som `programStart` til DeliveryOverview i stedet for at beregne fra `profile.created_at`

### 4. Opdater AIFinancialAnalysis-kald i Reports.tsx og MemberDetail.tsx
Skift props fra `userId={user.id}` til `companyId={companyId}` begge steder.

## Teknisk opsummering

| Fil | Ændring |
|-----|---------|
| `src/components/AIFinancialAnalysis.tsx` | Props: `userId` -> `companyId`, query filter: `user_id` -> `company_id` |
| `src/pages/Reports.tsx` | Hent `companies.start_date` via companyId, brug som programStart. Send `companyId` til AIFinancialAnalysis |
| `src/pages/MemberDetail.tsx` | Hent virksomhedens `start_date`, brug som programStart. Send `companyId` til AIFinancialAnalysis |

Ingen databaseændringer nødvendige -- alle tabeller har allerede `company_id` og `start_date`.
