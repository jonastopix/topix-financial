

## Problem

Upload af årsrapport fejler med fejlen:
```
new row for relation "financial_report_facts" violates check constraint "financial_report_facts_source_type_check"
```

`financial_report_facts.source_type` har en CHECK constraint der kun tillader `canonical`, `manual`, `canonical_v2`. Vores edge function forsøger at indsætte rækker med `source_type = 'annual_report'` — som blive afvist. Det er derfor de 12 månedsfacts aldrig dukkede op, og UI ikke viser noget.

## Løsning

### Trin 1: Migration der udvider constraint
Opdatér `financial_report_facts_source_type_check` til at acceptere de tre ekstra typer vi bruger til årsrapporter og baselines:
```sql
ALTER TABLE public.financial_report_facts 
  DROP CONSTRAINT financial_report_facts_source_type_check;

ALTER TABLE public.financial_report_facts 
  ADD CONSTRAINT financial_report_facts_source_type_check 
  CHECK (source_type = ANY (ARRAY[
    'canonical'::text,
    'canonical_v2'::text,
    'manual'::text,
    'annual_report'::text,
    'manual_baseline'::text,
    'baseline'::text
  ]));
```

### Trin 2: Ryd op i de 2 fejlede rapporter
De to rapporter (`35d654af...` for 2025 og `47793782...` for 2024) står med `status='error'` og er aldrig blevet processed korrekt. Vi soft-deleter dem så brugeren har en ren start:
```sql
UPDATE financial_reports 
  SET deleted_at = now() 
  WHERE id IN ('35d654af-b1c3-470c-a08a-dbf09fe3a846', '47793782-920c-404b-8273-fa41f001662b');
```

### Trin 3: Bekræft at edge function virker
Når constraint er udvidet, kan brugeren genuploade. Edge function-koden er allerede korrekt — den fejlede kun på databaselaget.

## Hvad brugeren skal gøre efter migrationen

1. Gå til Rapportering → "Historiske årsrapporter"
2. Vælg år (2024 eller 2025)
3. Upload PDF'en igen — nu indsættes de 12 månedlige facts korrekt
4. Tallene vil dukke op på Dashboard, KPI-grafer og i AI-chat-konteksten

## Tekniske detaljer

**Filer der ændres:**
- Ny migration: `supabase/migrations/<timestamp>_extend_facts_source_type.sql`

**Hvorfor edge function-koden ikke skal ændres:**
Logikken i `extract-annual-report/index.ts` er korrekt — den kalder AI, beregner månedstal (1/12), beskytter committede måneder og indsætter med `source_type='annual_report'`. Den eneste blokering var DB-constraint.

**Effektkæde efter fix:**
```text
Upload PDF
   → AI ekstraktion (Gemini)
   → Insert 12 facts med source_type='annual_report'  ← virker nu
   → useCompanyFacts henter dem
   → Synlige i Dashboard, KPI'er, AI-chat
```

