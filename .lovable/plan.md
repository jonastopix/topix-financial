# Phase 4 + 4b + 4c: Template Registry + PDF Support

## Status: ✅ IMPLEMENTERET

## Phase 4 (Excel) — DONE
- DK_COMBINED_BALANCE_PNL_V1 template for Excel saldobalance
- Discriminated union routing (no_match / structural_fail / success)
- Ambiguity rule (score ≥ 80, gap ≥ 10)

## Phase 4b (PDF Combined) — DONE
- DK_ECONOMIC_SALDOBALANCE_PDF_V1 for combined P&L + Balance PDF
- Label-first extraction with account-number fallback
- Mixed column basis (P&L = Perioden, Balance = År til dato)
- Equity sign fix: YTD equity kept raw (not negated)

## Phase 4c (PDF P&L Only) — DONE

### Template: DK_ECONOMIC_RESULTATOPGOERELSE_PDF_V1

Ren e-conomic Resultatopgørelse PDF (P&L only, ingen balance).

### Ændrede/nye filer

| Fil | Handling |
|-----|----------|
| `supabase/functions/_shared/templates/dkEconomicResultatopgoerelsePdfV1.ts` | NY — Template B (P&L only) |
| `supabase/functions/_shared/pdfTextParser.ts` | ÆNDRET — CVR pattern 2, period regex pattern 2 (slash), section marker on period lines |
| `supabase/functions/_shared/templateRegistry.ts` | ÆNDRET — Registreret Template B |
| `supabase/functions/_shared/canonicalEngine.ts` | ÆNDRET — Tilføjet `lokaleomkostninger`→`facility_costs`, `transportomkostninger`→`vehicle_costs` mappings |
| `supabase/functions/extract-financial-data/phase4_e2e_test.ts` | ÆNDRET — 3 nye tests (15-17) |

### Detection scores

| Scenario | Template A score | Template B score |
|----------|-----------------|------------------|
| Combined PDF (AKTIVER+PASSIVER) | 90-100 | 0 (blocked) |
| P&L-only PDF | 0 (no "Saldobalance") | 80 |
| Non-e-conomic PDF | 0 | 0 |

### Sign normalization (P&L template)

- Revenue: abs (neg credit → pos)
- Costs (all): abs
- Gross profit/Result: flipSign (neg credit = profit → pos)

### Canonical mapping

- `statement_type: "pnl"`
- `column_basis_rule: "single"` (one column of numbers)
- `selected_period_basis: "period"`
- New KF→canonical: `lokaleomkostninger`→`facility_costs`, `transportomkostninger`→`vehicle_costs`

### E2E verified metrics (SnowWaves ApS)

```
revenue:        1,813,150.25
cogs:             320,439.86
gross_profit:   1,492,710.39
payroll:           31,554.65
sales_costs:        6,317.58
facility_costs:     3,280.00
vehicle_costs:      4,524.76
admin_costs:       31,787.91
depreciation:       1,663.27
ebt:            1,413,582.22
net_result:     1,413,582.22
```

### Safety gate

- validation.status: PASS
- ai_eligible: true (revenue + ebt present)
- DB status: "processed" (eksisterende flow)
- ai_eligible_payload: ✅ Indeholder IKKE raw_lines, normalized_lines, correction_log, provenance

### Tests (15-17)

- Test 15: Acceptance — fil matcher Template B, IKKE Template A
- Test 16: Full E2E — extraction, canonical, safety gate, ai_eligible_payload verification
- Test 17: Saldobalance PDF matcher IKKE Template B
