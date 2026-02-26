
# Plan: Korrekt programperiode ift. rapporteringslogik

## Problem
Programmet bruger i dag `profile.created_at` (brugerens oprettelsesdato) som `programStart`. Det 12-måneders grid starter fra den måned brugeren oprettes.

Men rapportering for en given måned sker altid i den **efterfølgende** måned. Så hvis et medlem oprettes i marts 2026, kan de tidligst rapportere for **februar 2026** (måneden før). Det betyder, at de 12 rapporteringsmåneder bør starte fra måneden **foer** medlemskabets start.

Derudover bør `send-report-reminder` edge function'en kun sende påmindelser til medlemmer, der faktisk burde have rapporteret -- dvs. ikke til nye medlemmer, der endnu ikke har haft en fuld måned.

## Løsning

### 1. Juster `programStart` til foregående måned
I **3 steder** bruges `programStart`:
- `src/pages/Reports.tsx` (linje 98-100): sætter `programStart` fra `profile.created_at`
- `src/pages/MemberDetail.tsx` (linje 408): sender `profile.created_at` til `DeliveryOverview`
- `src/components/FinancialOverview.tsx`: bruger `programStart` til referencelinje i grafer

**Ændring**: Når `programStart` beregnes, trækkes 1 måned fra. Eksempel: hvis `created_at` er marts 2026, bliver `programStart` = februar 2026. Dette sikrer at de 12 slots i DeliveryOverview matcher de faktiske rapporteringsmåneder.

Berørte filer:
- `src/pages/Reports.tsx`: Juster beregningen af `programStart` (linje 98-100)
- `src/pages/MemberDetail.tsx`: Juster den `programStart` der sendes til `DeliveryOverview` (linje 408)

### 2. Juster `send-report-reminder` edge function
Funktionen bør kun sende påmindelser til virksomheder, der har haft mindst én fuld måned som medlem. Hvis en virksomhed blev oprettet i marts 2026, bør den først modtage påmindelse for februar-rapporten (som sendes i marts/april).

**Ændring**: Tilføj et tjek der sammenligner virksomhedens `start_date` (eller `created_at`) med den forventede rapportperiode. Spring virksomheder over, der er for nye til at have en forfalden rapport.

Berørt fil:
- `supabase/functions/send-report-reminder/index.ts`

## Tekniske detaljer

### programStart-beregning (Reports.tsx og MemberDetail.tsx)
```typescript
// Før (nuværende):
const start = new Date(profile.created_at);

// Efter (ny):
const created = new Date(profile.created_at);
const start = new Date(created.getFullYear(), created.getMonth() - 1, 1);
// Marts 2026 -> Februar 2026
```

### send-report-reminder filtreringslogik
Tilfoej tjek mod virksomhedens `created_at` (eller `start_date` hvis sat):
- Beregn tidligste rapportmåned for virksomheden (måneden for oprettelse minus 1)
- Hvis den forventede periode er tidligere end dette, spring virksomheden over

### Berørte filer (samlet)
- `src/pages/Reports.tsx` -- juster programStart-beregning
- `src/pages/MemberDetail.tsx` -- juster programStart ved kald til DeliveryOverview
- `supabase/functions/send-report-reminder/index.ts` -- tilfoej medlemskabs-filter
