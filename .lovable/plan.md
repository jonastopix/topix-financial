

## PROBLEMANALYSE

Systemet har en kritisk fejl: AI'en læser Excel-regnskaber direkte uden at forstå regnskabsmæssige fortegnskonventioner. Dette resulterer i:

1. **Egenkapital vises som negativ** når den er positiv (raw: -2.327.790,71 kr. → actual: +2.327.790,71 kr.)
2. **Omsætning og resultater fejltolkes** (raw: -1.482.730,84 kr. → actual: +1.482.730,84 kr.)
3. **Bankovertræk misforstås** (raw: -408.726,10 kr. → actual: -408.726,10 kr. = OVERTRÆK)
4. **AI konkluderer insolvens** når virksomheden har 45,4% egenkapital

**Root cause:** Ingen deterministisk parser-lag før AI-analysen.

## LØSNING: 5-LAGS ARKITEKTUR

```
Upload → Template Detection → Raw Extraction → Normalization → Validation → AI Feedback
```

### LAG 1: Template Detection

**Ny funktion:** `detectReportTemplate(rows)`

Detekterer "DK_COMBINED_BALANCE_PNL_V1" hvis:
- Row 1 indeholder virksomhedsnavn
- Row 2 indeholder "Balance"
- Row 5 indeholder "Nummer", "Navn" og periode
- Kontoplan starter ved 998 (resultatopgørelse) og 6000+ (balance)

### LAG 2: Raw Extraction

**Ny funktion:** `extractRawLines(rows, template)`

For hver række:
```typescript
{
  account_no: number | null,
  label: string,
  raw_value: number | null,
  row_number: number
}
```

Ignorerer:
- Tomme rækker
- Header-rækker
- Sektionsoverskrifter uden værdi

### LAG 3: Normalization Engine

**Ny funktion:** `normalizeFinancialData(rawLines, template)`

**FORTEGNSREGLER for DK_COMBINED_BALANCE_PNL_V1:**

**Resultatopgørelse (konto 998-5998):**

Flip fortegn for subtotaler/resultatlinjer:
- "Omsætning ialt"
- "Dækningsbidrag"
- "Resultat før afskrivninger"
- "Indtjeningsbidrag"
- "Resultat før skat"
- "Årets resultat"

**Regel:** `normalized = raw * -1`

Behold fortegn for omkostninger:
- "Vareforbrug ialt"
- "Lønninger ialt"
- "Afskrivninger ialt"
- Alle omkostningskategorier

**Regel:** `normalized = abs(raw)`

**Balance - Aktiver (konto 6000-7998):**

Behold som-is:
`normalized = raw`

**Undtagelse:** Bank/likvider med negativt fortegn = OVERTRÆK
- "Likvide beholdninger ialt"
- Bankkonto-linjer

Hvis `raw < 0`, behold negativ. Dette er bankovertræk, ikke positiv cash.

**Balance - Passiver (konto 8000-9799):**

Flip fortegn for subtotaler:
- "Egenkapital ialt"
- "Hensættelser ialt"
- "Kortfristet gæld ialt"
- "Gæld ialt"
- "Moms ialt"
- "Passiver ialt"

**Regel:** `normalized = abs(raw)`

**KRITISK UNDTAGELSE: Mellemregning**

"Mellemregning ialt" må IKKE flippes eller klassificeres som gæld.

```typescript
{
  class: "RELATED_PARTY_NET",
  normalized_value: raw_value,  // Behold fortegn
  include_in_debt: false
}
```

### LAG 4: KPI Mapping

**Ny funktion:** `mapToKPISchema(normalizedLines)`

Mapper labels til faste felter:

```typescript
{
  // P&L
  revenue: "Omsætning ialt" → 1.482.730,84,
  cogs: "Vareforbrug ialt" → 424.012,48,
  gross_profit: "Dækningsbidrag" → 1.058.718,36,
  payroll: "Lønninger ialt" → 454.526,66,
  payroll_related: "Pensioner & sociale bidrag ialt" → 76.067,33,
  ebitda: "Resultat før afskrivninger" → 259.313,64,
  ebit: "Indtjeningsbidrag" → 244.518,28,
  ebt: "Resultat før skat" → 235.159,08,
  
  // Balance
  assets_total: "Aktiver ialt" → 5.121.980,21,
  inventory: "Varelager" → 1.045.493,21,
  trade_receivables: "Tilgodehavender fra salg & tjenesteydelser" → 2.985.401,46,
  unbilled_wip: "Igangværende arbejde manglende fakturering" → 403.506,35,
  cash: "Likvide beholdninger ialt" → -408.726,10,
  equity_total: "Egenkapital ialt" → 2.327.790,71,
  related_party_net: "Mellemregning ialt" → 503.981,20,
  debt_total: "Gæld ialt" → 3.201.729,70,
  vat_payable: "Moms ialt" → 711.322,48,
  
  // Afledte
  gross_margin_pct: 71.4,
  ebt_margin_pct: 15.9,
  equity_ratio_pct: 45.4
}
```

### LAG 5: Validation Engine

**Ny funktion:** `validateFinancialData(kpiData)`

**KRITISKE VALIDERINGER:**

```typescript
// P&L checks
revenue - cogs === gross_profit (±1% tolerance)
ebitda - depreciation === ebit (±1% tolerance)
ebit - financial_costs - extraordinary_items === ebt (±1% tolerance)

// Balance checks
abs(assets_total) === abs(liabilities_total) (±1% tolerance)
abs(net_result) === "Balancekontrol - Årets resultat" (±1% tolerance)

// Data integrity
revenue > 0 && revenue !== null
assets_total > 0 && assets_total !== null
equity_total !== null
```

**Output:**

```typescript
{
  validation_status: "PASS" | "FAIL",
  validation_errors: string[],
  confidence: "HIGH" | "MEDIUM" | "LOW"
}
```

### LAG 6: AI Feedback (kun hvis PASS)

**Opdateret edge function:** `extract-financial-data`

**NYT FLOW:**

```typescript
// 1. Parse Excel → raw data
// 2. Detect template
// 3. Extract raw lines
// 4. Normalize
// 5. Map to KPI
// 6. Validate
if (validation_status !== "PASS") {
  return {
    status: "validation_failed",
    errors: validation_errors,
    message: "Rapporten kan ikke analyseres sikkert. Dataudtrækket fejlede validering."
  };
}

// 7. Send ONLY normalized KPI schema to AI
const aiResponse = await callLovableAI({
  extractedData: normalizedKPIs,
  companyName: company_name
});
```

**OPDATERET AI SYSTEMPROMPT:**

```
Du er CFO/investor-rådgiver.

Du modtager KUN validerede, normaliserede regnskabsdata.

KRITISKE REGLER:
- Du må ALDRIG gætte på fortegn eller normalisering
- Hvis cash er negativ men equity er positiv: "likviditetspres", IKKE "insolvens"
- Du må ALDRIG konkludere "negativ egenkapital" medmindre equity_total < 0 i normalized data
- Du må ALDRIG konkludere "teknisk konkurs" medmindre equity_ratio_pct < 0

FORVENTET OUTPUT:
1. Overblik (1-2 linjer)
2. Nøgletal (bullets)
3. Vurdering (2-3 linjer)
4. 2-4 anbefalinger
```

## FILER DER ÆNDRES

### 1. Ny fil: `src/lib/financialParser.ts`

Indeholder alle parser-funktioner:
- `detectReportTemplate()`
- `extractRawLines()`
- `normalizeFinancialData()`
- `mapToKPISchema()`
- `validateFinancialData()`

### 2. Opdater: `supabase/functions/extract-financial-data/index.ts`

- Importer `financialParser`
- Kald parser FØR AI
- Gem både `raw_data` og `normalized_data` i DB
- Send KUN `normalized_data` til AI
- Hvis validation fejler: returner fejl uden AI-kald

### 3. Opdater: `src/components/FileUploadZone.tsx`

- Vis validation status i UI
- Hvis FAIL: vis fejlbesked i stedet for AI-feedback
- Vis badges: "Positiv egenkapital", "Bankovertræk", "Høj kapitalbinding"

### 4. Opdater DB schema: `financial_reports` tabel

Tilføj kolonner:
```sql
ALTER TABLE financial_reports
ADD COLUMN raw_extracted_data jsonb,
ADD COLUMN normalized_data jsonb,
ADD COLUMN validation_status text,
ADD COLUMN validation_errors text[],
ADD COLUMN extraction_method text;
```

## ACCEPTANCE TEST: Januar 2026

**Input:** Januar_2026.xlsx (uploaded fil)

**Forventet normalized output:**

```json
{
  "validation_status": "PASS",
  "metrics": {
    "revenue": 1482730.84,
    "gross_profit": 1058718.36,
    "gross_margin_pct": 71.4,
    "ebt": 235159.08,
    "ebt_margin_pct": 15.9,
    "assets_total": 5121980.21,
    "equity_total": 2327790.71,
    "equity_ratio_pct": 45.4,
    "cash": -408726.10,
    "trade_receivables": 2985401.46,
    "inventory": 1045493.21,
    "debt_total": 3201729.70
  }
}
```

**Forventet AI conclusion:**

"Stærk drift med høj dækningsgrad og positiv indtjening. Positiv egenkapital på 2,33 mio. kr. og ikke insolvens. Reel udfordring er likviditet: høje debitorer (2,99 mio. kr.), igangværende arbejde (403 t.kr.), lagerbinding (1,05 mio. kr.) og bankovertræk på 409 t.kr."

## IMPLEMENTERINGSRÆKKEFØLGE

1. **Opret `financialParser.ts`** med template detection og normalization logic
2. **Tilføj DB-kolonner** via migration
3. **Opdater `extract-financial-data`** til at bruge parser
4. **Opdater AI-prompt** til kun at læse normalized data
5. **Opdater UI** til at vise validation status
6. **Test med Januar_2026.xlsx**

## BEMÆRKNINGER

- Eksisterende rapporter i DB forbliver uændrede (legacy data)
- Kun nye uploads bruger den nye parser
- Hvis template ikke genkendes, fallback til eksisterende AI-baseret extraction (med advarsel)
- Admin kan se både raw og normalized data i debug mode

