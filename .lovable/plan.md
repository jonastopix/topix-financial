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

## Phase 4d (XLSX P&L Sign Convention Fix) — DONE

### Template: DK_ECONOMIC_RESULTATOPGOERELSE_XLSX_V1

Fix for 3 bugs i XLSX P&L template der forhindrede detection af rigtige e-conomic filer.

### Ændringer

| Fix | Beskrivelse |
|-----|-------------|
| Header scan | Udvidet fra `slice(0, 3)` → `slice(0, 6)` — "Resultatopgørelse" kan ligge på række 3+ |
| Period regex | Understøtter nu 2-cifret år (`01.12.25` → `01-12-2025`) |
| Sign convention | Dynamisk inferens: `detectSignConvention()` tjekker revenue/cost anchors |
| CVR extraction | Parser "CVR 45281736" fra header rows |
| Company name | Stripper leading numeric IDs ("1796416 - Topix.dk ApS" → "Topix.dk ApS") |
| Confidence | Dynamisk: HIGH kun når parser_status=PASS + convention≠unknown + subtotals≥5 |

### Sign convention logik

```
Revenue > 0 AND Cost < 0 → BUSINESS convention
  → profit subtotals: abs (allerede korrekt fortegn)

Revenue < 0 AND Cost > 0 → CREDIT convention
  → profit subtotals: flipSign (negativ = profit → positiv)

Uklart/manglende anchors → UNKNOWN
  → profit subtotals: abs (sikker fallback, flipper ikke blindt)
  → sign_convention check: FAIL → parser_status: FAIL → ai_eligible: false
```

### Tests

- Test 21: Credit convention data → flipSign korrekt (eksisterende)
- Test 22: Canonical output PASS + ai_eligible (eksisterende)
- Test 23: Missing revenue → FAIL (eksisterende)
- Test 24: **NY** — Business convention (Topix.dk ApS Dec 2025) → abs korrekt, alle positive

### E2E verified metrics (Topix.dk ApS, December 2025)

```
revenue:      57,487.52
cogs:          5,677.48
gross_profit: 51,810.04
payroll:           0.00
admin_costs:      90.84
ebt:          51,719.20
net_result:   51,719.20
```
