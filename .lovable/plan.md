

# Historisk rapport-import for rådgivere

## Problemet
Du har rapporter fra et tidligere system, som skal importeres til de respektive virksomheder, så medlemmerne ser deres historik fra dag ét.

## Løsningen
En ny "Import rapporter" funktion i rådgivervisningen (Members-siden), hvor du kan:

1. Vælge en virksomhed fra dropdown
2. Trække flere PDF/Excel-filer ind på én gang
3. Systemet kører dem igennem den eksisterende AI-pipeline (extraction + analyse) og tilknytter dem automatisk til den valgte virksomhed

## Teknisk plan

### 1. Ny admin-side: Bulk Import (`src/pages/BulkImport.tsx`)
- Kun tilgængelig for rådgivere (advisor role check)
- Dropdown med alle virksomheder (fra `companies` tabellen)
- Genbruger den eksisterende `FileUploadZone` komponent, men med et `companyId` og `userId` override
- Viser progress for alle filer der behandles

### 2. Tilpas FileUploadZone til admin-brug
- Tilføj en optional `adminMode` prop, der springer activity-messages og advisor-notifications over (da det er rådgiveren selv der uploader)
- Brug virksomhedens ejer-bruger som `user_id` på rapporten (hentes fra `company_members` hvor `role = 'owner'`)

### 3. Tilføj route og navigation
- Ny route `/admin/import` i `App.tsx`
- Link fra Members-siden eller sidebar under admin-sektionen

### 4. Ingen databaseændringer
- Bruger eksisterende `financial_reports` tabel og `extract-financial-data` edge function
- Rapporterne tilknyttes den valgte `company_id` og virksomhedens ejer-`user_id`

## Brugerflow
1. Gå til "Import rapporter" i admin-menuen
2. Vælg virksomhed fra listen
3. Træk alle historiske rapporter ind (understøtter multi-fil upload)
4. Vent på at AI-pipeline kører igennem hver fil
5. Når medlemmet logger ind, ser de al deres historik med trends, grafer og AI-analyser

