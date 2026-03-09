# Phase 4 + 4b: Template Registry + PDF Support

## Status: ✅ IMPLEMENTERET

## Phase 4 (Excel) — DONE
- DK_COMBINED_BALANCE_PNL_V1 template for Excel saldobalance
- Discriminated union routing (no_match / structural_fail / success)
- Ambiguity rule (score ≥ 80, gap ≥ 10)

## Phase 4b (PDF) — DONE

### Ændrede/nye filer

| Fil | Handling |
|-----|----------|
| `supabase/functions/_shared/pdfTextParser.ts` | NY — PDF text parser for e-conomic format |
| `supabase/functions/_shared/templates/dkEconomicSaldobalancePdfV1.ts` | NY — PDF combined template med label-first extraction |
| `supabase/functions/_shared/templateRegistry.ts` | ÆNDRET — PDF support, tryDeterministicPdfExtraction, shared routing |
| `supabase/functions/_shared/canonicalTypes.ts` | ÆNDRET — column_basis_rule i DeterministicMeta |
| `supabase/functions/extract-financial-data/index.ts` | ÆNDRET — PDF deterministic routing før AI |
| `supabase/functions/extract-financial-data/phase4_e2e_test.ts` | ÆNDRET — 4 nye PDF tests (9-12) |

### 4 Rettelser implementeret

1. **Ambiguity konsistent**: Template A (combined) kræver AKTIVER/PASSIVER for score ≥90. Fremtidig Template B (P&L-only) får -60 penalty ved AKTIVER/PASSIVER → ingen reel konkurrence.

2. **Mixed column basis eksplicit**: Template A erklærer `column_basis_rule: "mixed"` — P&L bruger Perioden, Balance bruger År til dato. Gemt i deterministic_meta.

3. **Cash/debitor label-first**: Subtotaler (likvide beholdninger, tilgodehavender) er primær strategi. Kontonumre (5800-5899, 5600-5699) er fallback med warning log.

4. **PDF failure tests**: Test 9 (no text → no_match), Test 10 (partial header → no_match), Test 11 (valid detection + corrupt data → structural_fail), Test 12 (full extraction + ambiguity check).

### Detection scores

| Scenario | Template A score | Template B score (fremtidig) |
|----------|-----------------|------------------------------|
| Combined PDF (AKTIVER+PASSIVER) | 100 | ≤40 (blocked) |
| P&L-only PDF | ≤60 | ~90 |
| Non-e-conomic PDF | 0 | 0 |

### Sign normalization

Template håndterer sign flipping (ikke canonical engine):
- Revenue: Math.abs (neg credit → pos)
- Costs: Math.abs
- Profit/Result: -value (neg profit in saldo → pos)
- Assets: Math.abs
- Liabilities: Math.abs
- Equity: -value (neg credit → pos equity)
- Cash/Debitorer: keep raw sign
