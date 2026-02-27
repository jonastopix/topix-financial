

# Fix: Komplet gennemgang af Excel-indlæsning og AI-extraction

## Grundproblem (root cause)

Problemet er fundamentalt: Nar en Excel-fil (.xlsx) uploades, laeser koden den som `file.text()` (linje 124 i FileUploadZone.tsx). Men xlsx-filer er ZIP-arkiver med XML indeni -- sa `file.text()` producerer **ulaeselig binaer tekst**. Det betyder:

1. AI'en modtager volapyk og hallucinererer firmanavn, CVR og periode
2. Regex-overrides (`extractPeriodFromText`, `extractCvrFromText`) kan ikke finde noget i binaer tekst
3. `knownCompanyName` retter kun firmanavnet, men perioden forbliver forkert
4. AI-analysen bruger det hallucinererede firmanavn fra extracted_data

PDF-upload fungerer derimod korrekt fordi siderne renderes som billeder (vision mode).

## Plan: 4 aendringer

### 1. Installer SheetJS og pars Excel korrekt (client-side)

Installer `xlsx`-pakken (SheetJS) og omskriv `extractTextFromFile` i FileUploadZone.tsx sa Excel-filer parses til laeseligt CSV-format:

```text
Excel (binary ZIP) --> SheetJS parser --> CSV-lignende tekst --> sendes til AI
```

Den parsede tekst vil indeholde korrekte headers som "Resultatopgorelse for perioden 01.10.25 - 31.10.25" og "CVR 39199971", sa bade AI og regex-overrides kan laese dem.

### 2. Haerdn AI-prompten med kendt firmanavn

I `extract-financial-data/index.ts`: Hvis `knownCompanyName` er sat, injicer det direkte i systemprompten -- ikke kun som post-processing override. Tilfoej til prompten:

> "Virksomhedens navn er: Carma Studio. Brug KUN dette navn. Returner ALDRIG et andet firmanavn."

### 3. Fix AI-analyse (ai-financial-feedback) 

Sikr at `companyContext.name` altid bruger det kendte firmanavn fra databasen (companies-tabellen) i stedet for det AI-ekstraherede. Slaa virksomhedsnavnet op via `company_id` pa rapporten.

### 4. Styrk regex-overrides som fallback

Udvid `extractPeriodFromText` og `extractCvrFromText` til at haandtere flere formater:
- Perioder som "Oktober 2025", "Okt 2025", "10/2025"
- CVR uden "CVR" prefix (bare 8-cifret tal efter kendte patterns)
- Datoformater som "01/10/2025 - 31/10/2025"

## Tekniske detaljer

### Fil 1: `package.json`
- Tilfoej dependency: `xlsx` (SheetJS Community Edition)

### Fil 2: `src/components/FileUploadZone.tsx`
- Importer SheetJS
- Omskriv `extractTextFromFile` for Excel: `XLSX.read(buffer) -> sheet_to_csv()` for alle sheets
- Behold PDF-logikken uaendret

### Fil 3: `supabase/functions/extract-financial-data/index.ts`
- Injicer `knownCompanyName` i systemprompten (ikke kun post-processing)
- Udvid regex-overrides med flere formater
- Tilfoej logging af modtaget fileContent-laengde og foerste 200 tegn (debugging)

### Fil 4: `src/components/FileUploadZone.tsx` (pipeline-sektion)
- Naar AI-analyse kaldes: brug `knownCompanyName || extractedData.company_name` som companyContext.name
- Sikr at det rigtige navn propageres til milestones og activity messages

## Forventet resultat

- Excel-filer parses korrekt til laeseligt tekst foer AI modtager dem
- Periode, CVR og firmanavn laeeses deterministisk fra teksten (regex)  
- AI'en far eksplicit besked om korrekt firmanavn i prompten
- AI-analysen refererer til det rigtige firma
- Ingen flere hallucineringer af forkerte navne eller perioder

