

# Deterministisk Excel-extraction med template-detektion

## Problemet

Den nuvaerende pipeline sender Excel-data som CSV-tekst til en AI, som hallucinererer vaerdier, firmanavne og perioder. KJ Auto's regnskabsrapporter foelger et fast template med kendte ark ("DATA", "P&L Top Line") og faste celleadresser. Det er spild af AI-kald og fejlkilde at lade AI gaette paa vaerdier der staar i kendte celler.

## Loesning: Hybrid template-baseret extraction

### Arkitektur

```text
Excel upload
    |
    v
SheetJS parser (allerede installeret)
    |
    v
Template-detektor: Har filen "DATA" + "P&L Top Line" ark?
    |                    |
   JA                   NEJ
    |                    |
    v                    v
Deterministisk       AI-baseret extraction
cell-reading         (nuvaerende pipeline)
    |                    |
    v                    v
Mappes til key_figures format
    |
    v
Gem i DB + AI-analyse (uaendret)
```

### Fil 1: `src/lib/excelTemplates.ts` (NY)

Opretter den deterministiske extractor baseret paa brugerens ChatGPT-kode, tilpasset til projektet:

- `detectTemplate(workbook)` — checker om arket "DATA" og "P&L Top Line" findes
- `extractKJAutoTemplate(workbook)` — laeser specifikke celler:
  - Firmanavn fra DATA!A2
  - CVR fra DATA!A5
  - Periode fra "P&L Top Line"!C3
  - Omsaetning fra C28/J28
  - DB I fra C173/J173
  - DB II fra C30/J30
  - EBT fra DATA!C346/F346
- Sanity checks (omsaetning C28 vs C29)
- Returnerer data i same format som AI-extractionen (`ExtractedData`)

Mapper til eksisterende `key_figures`:
- `omsaetning` = turnover.month (absolutvaerdi)
- `omsaetning_aar` = turnover.ytd (absolutvaerdi)
- `daekningsbidrag` = db1.month
- `daekningsbidrag_aar` = db1.ytd
- `resultat_foer_skat` = ebt.month (behold fortegn)
- `resultat_foer_skat_aar` = ebt.ytd (behold fortegn)

Inkluderer ogsaa administrations-, lokale-, driftsmiddel-omkostninger og EBITDA fra kendte cellepositioner.

### Fil 2: `src/components/FileUploadZone.tsx` (AENDRING)

I `processFile`-funktionen, efter SheetJS-parsning:

1. Foer AI-kaldet: kald `detectTemplate(workbook)` 
2. Hvis template genkendes: kald `extractKJAutoTemplate(workbook)` 
3. Hvis PASS: spring `extract-financial-data` edge function over, gem direkte i DB
4. Hvis FAIL eller ukendt template: fald tilbage til eksisterende AI-pipeline

Konkret flow:
- Filen laeses allerede som ArrayBuffer for SheetJS (linje 127-128)
- Tilfoej template-detektion lige efter SheetJS-parsning
- Hvis deterministisk extraction lykkes, spring AI-extraction over og gaa direkte til step 3 (AI-analyse)

### Fil 3: `supabase/functions/extract-financial-data/index.ts` (MINDRE AENDRING)

Ingen store aendringer. Funktionen forbliver som fallback for filer uden genkendt template. Tilfoej et felt `extraction_method: "deterministic" | "ai"` til det gemte `extracted_data` saa vi kan se hvilken metode der blev brugt.

## Vigtige designvalg

1. **DB I bruges som "Daekningsbidrag"** — C173/J173 er den klassiske definition (omsaetning minus vareforbrug). DB II (C30/J30) gemmes separat som reference.

2. **Formel-evaluering**: Mange celler i denne template indeholder formler (=SUM, =DATA!C346). SheetJS cacher normalt formler ved `read()`, men som fallback inkluderes en minimal formel-evaluator der haandterer simple references og SUM().

3. **Template-detektion er konservativ**: Kun filer med BAADE "DATA" og "P&L Top Line" ark behandles deterministisk. Alt andet gaar til AI.

4. **Alle 5 uploadede filer** (Aug, Okt, Nov, Dec 2025 + Jan 2026) vil automatisk haandteres korrekt efter denne aendring.

## Tekniske detaljer

### Celle-mapping (KJ Auto template)

| Metric | Maaned-celle | YTD-celle |
|--------|-------------|-----------|
| Omsaetning | P&L Top Line!C28 | P&L Top Line!J28 |
| DB I | P&L Top Line!C173 | P&L Top Line!J173 |
| DB II | P&L Top Line!C30 | P&L Top Line!J30 |
| EBT | DATA!C346 (fallback: P&L!C370) | DATA!F346 (fallback: P&L!J370) |
| Admin omk. | Parsees fra CSV-sektion | Parsees fra CSV-sektion |
| Lokaleomk. | Parsees fra CSV-sektion | Parsees fra CSV-sektion |

### Validering

- Omsaetning C28 skal matche C29 (kontrol) inden for 0.5 kr tolerance
- Alle 8 paakraevede vaerdier skal vaere til stede (ellers FAIL)
- CVR skal kunne parses fra DATA!A5

