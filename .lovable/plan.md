

# Rapportering + AI Styrkelse — Implementeringsplan

## Status Quo

Nuværende arkitektur har disse svagheder:
- **Ingen facts layer**: Dashboards og AI læser direkte fra `financial_reports.normalized_data` / `extracted_data` / `manual_normalized_data` — et JSONB-kaos med 3 mulige kilder
- **Ingen review-step**: Upload → parse → canonical → AI kører automatisk uden bruger-godkendelse
- **AI er embedded i rapporten**: `ai_analysis` JSONB-kolonne på `financial_reports` — ingen historik, ingen regenerering uden at overskrive
- **Fil-centrisk UX**: Brugeren tænker i filer, ikke perioder
- **AI-output er ustruktureret**: Prompt-styret, men ingen fast kontrakt for præsentationssektioner

## Fase 1: `financial_report_facts` — Facts Layer

### Database

Ny tabel `financial_report_facts`:

```text
id              uuid PK
company_id      uuid FK → companies
period_key      text NOT NULL        -- "2026-01" (YYYY-MM)
period_label    text                 -- "Januar 2026"
source_report_id uuid FK → financial_reports
source_type     text                 -- "canonical" | "manual"
metrics         jsonb NOT NULL       -- kanoniske metrics (revenue, ebt, cash, etc.)
committed_at    timestamptz
committed_by    uuid
created_at      timestamptz
UNIQUE(company_id, period_key)
```

- RLS: company members kan SELECT egen company, advisors kan SELECT alle
- Kun INSERT/UPDATE via commit-flow (RLS blokerer direkte member-writes — commit sker via SECURITY DEFINER function)

### Commit Function

SQL function `commit_report_facts(p_report_id uuid)`:
1. Læser `financial_reports` row
2. Verificerer status = 'processed' OG (validation_status = 'PASS' ELLER manual_override_status = 'applied')
3. Resolver metrics fra korrekt kilde (manual → canonical → legacy)
4. UPSERT i `financial_report_facts` (ON CONFLICT company_id, period_key)
5. Returnerer facts row

### Migration af eksisterende data

Backfill-migration: kommittér alle eksisterende PASS/manual-approved rapporter til facts.

### Code Changes

- `financialUtils.ts`: Ny helper `getFactsForCompany()` der læser fra facts-tabellen
- Dashboards (`Index.tsx`, `FinancialOverview.tsx`, `KPICard.tsx`): Skift fra at læse `financial_reports` til `financial_report_facts`
- Group RPCs (`get_my_group_financial_summary`, `get_group_financial_summary_for_advisor`): Refaktorér til at læse fra facts i stedet for kompleks CTE over financial_reports

## Fase 2: Import-Review Flow

### UX Flow

```text
Upload → Parse → Canonical → REVIEW SCREEN → Commit Facts
                                  ↓
                            AI genereres først HER
```

### Review Screen

Ny komponent `ReportReviewCard.tsx`:
- Viser periode, kilde, extracted metrics i tabel
- Sammenlignet med eksisterende facts for perioden (hvis nogen)
- "Godkend & Publicér" knap → kalder `commit_report_facts()`
- "Afvis" knap → marker rapport som reviewed men ikke committed
- Status-felt på `financial_reports`: nyt felt `review_status` ('pending_review' | 'approved' | 'rejected')

### Pipeline Change

`FileUploadZone.tsx` → `runPostExtractionPipeline()`:
- Stop ved `status = 'pending_review'` i stedet for at køre AI automatisk
- AI køres først EFTER commit (fase 3)

## Fase 3: `financial_commentaries` — AI som Separat Objekt

### Database

Ny tabel `financial_commentaries`:

```text
id              uuid PK
company_id      uuid FK → companies
facts_id        uuid FK → financial_report_facts
period_key      text NOT NULL
generated_at    timestamptz
model_id        text              -- "google/gemini-3-flash-preview"
analysis        jsonb NOT NULL    -- struktureret AI output
generation_input jsonb            -- snapshot af hvad AI modtog
created_at      timestamptz
UNIQUE(company_id, period_key, generated_at)  -- tillader historik
```

- RLS: Same som facts (company members SELECT, advisors SELECT + INSERT via function)

### Commit → Generate Flow

Efter `commit_report_facts()` succeeds:
1. Client kalder `generate-financial-commentary` edge function
2. Edge function læser fra `financial_report_facts` (ikke financial_reports)
3. Gemmer resultat i `financial_commentaries`
4. Client viser kommentaren

### Regenerering

- Bruger kan trykke "Generér ny analyse" → ny row i `financial_commentaries`
- Historik bevares — seneste vises som default

### Migration

Backfill eksisterende `ai_analysis` fra `financial_reports` til `financial_commentaries`.

## Fase 4: Periode-Først UX

### Ny Rapportside-Arkitektur

Erstat fil-listen med en **periodevisning**:

```text
┌─────────────────────────────────────────┐
│  2026                                    │
│  ┌──────┬──────┬──────┬──────┬──────┐  │
│  │ Jan  │ Feb  │ Mar  │ Apr  │ ...  │  │
│  │  ✅  │  ✅  │  ⏳  │  —   │      │  │
│  └──────┴──────┴──────┴──────┴──────┘  │
│                                          │
│  ── Januar 2026 ─────────────────────── │
│  Facts: Omsætning 1.2M · EBT 180K      │
│  AI: Overordnet vurdering...            │
│  Kilde: resultat_jan_2026.xlsx          │
│  Status: Godkendt                        │
└─────────────────────────────────────────┘
```

### Komponenter

- `PeriodGrid.tsx`: Årsvisning med måned-status (facts/pending/missing)
- `PeriodDetail.tsx`: Samlet visning af facts + AI + kildefil(er) for én periode
- Upload trigger: "Upload rapport for [måned]" i stedet for generisk upload

## Fase 5: Standardiseret AI-Præsentation

### Ny Tool Schema

Opdatér `ANALYSIS_TOOL` i `ai-financial-feedback` (eller ny function):

```json
{
  "overall_assessment": "string — 2-3 sætningers overordnet vurdering",
  "key_strengths": [{ "title": "string", "detail": "string", "metric_ref": "string" }],
  "key_risks": [{ "title": "string", "detail": "string", "severity": "advarsel|kritisk", "metric_ref": "string" }],
  "focus_areas": [{ "title": "string", "action": "string", "timeline": "string" }],
  "management_questions": ["string"]
}
```

### Præsentationskomponent

Ny `FinancialCommentaryCard.tsx`:
- Overordnet vurdering (altid vist)
- Styrker (collapsible sektion med grønne indikatorer)
- Risici (collapsible med gul/rød severity)
- Fokusområder (action-orienterede kort)
- Ledelsesspørgsmål (bullet-liste)

---

## Implementeringsrækkefølge

Faserne bygger på hinanden og skal implementeres sekventielt:

1. **Fase 1** først — facts layer er fundamentet for alt andet
2. **Fase 2** — review-flow sikrer data-kvalitet inden commit
3. **Fase 3** — AI-kommentarer bygger på committede facts
4. **Fase 4** — periode-UX kræver facts + commentaries
5. **Fase 5** — standardiseret AI-output kræver ny commentary-tabel

Skal vi starte med Fase 1?

