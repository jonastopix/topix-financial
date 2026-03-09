# Phase 4: Template Registry + Rapporttype-Coverage

## Status: ✅ IMPLEMENTERET

## Ændrede filer

| Fil | Handling |
|-----|----------|
| `supabase/functions/_shared/templateRegistry.ts` | NY — Registry med discriminated union, detection med ambiguity-regel |
| `supabase/functions/_shared/templates/dkCombinedBalancePnlV1.ts` | NY — Wrapper omkring financialParser med parser_status i validation |
| `supabase/functions/_shared/canonicalTypes.ts` | ÆNDRET — Tilføjet DeterministicMeta interface + felt i CanonicalOutput |
| `supabase/functions/_shared/canonicalEngine.ts` | ÆNDRET — deterministic_meta + parser_status som ai_check |
| `supabase/functions/extract-financial-data/index.ts` | ÆNDRET — Ny routing med discriminated union + ÉN canonical build |
| `src/components/AIFinancialAnalysis.tsx` | ÆNDRET — extraction_method fetch + DET badge |

## Routing-logik (discriminated union)

```typescript
type DeterministicExtractionResult =
  | { type: "no_match" }                    // → AI fallback
  | { type: "structural_fail"; ... }        // → needs_review, INGEN AI fallback  
  | { type: "success"; extractedData: ... } // → canonical engine
```

## Ambiguity-regel

```typescript
if (!best || best.score < 80) return null;
if (secondBest && best.score - secondBest.score < 10) return null;
```

## Validation vs AI Eligibility

| validation.status | ai_eligible | extraction_method | db status |
|---|---|---|---|
| FAIL/UNSURE | any | any | needs_review |
| PASS | false | deterministic_template | processed |
| PASS | true | deterministic_template | processed + AI feedback |

## Næste skridt

1. Test med en reel saldobalance Excel-fil
2. Verificer at DET-badge vises i UI
3. Udvid med flere templates ved behov
