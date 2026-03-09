

## Problem

Line 259 in `dkEconomicSaldobalancePdfV1.ts` applies `flipPnlSign` (negation) to `egenkapitalLine?.ytd_amount`:

```typescript
egenkapital: flipPnlSign(egenkapitalLine?.ytd_amount ?? null),
```

The PDF shows `EGENKAPITAL I ALT` YTD = **53.213,69** (positive). `flipPnlSign` negates it to **-53.213,69**.

This is wrong because equity in the PASSIVER YTD column is already in normal convention — positive = positive equity, negative = negative equity. It doesn't need flipping.

## Root Cause

`flipPnlSign` was designed for P&L credit-convention lines (where negative = profit). But equity in the balance YTD section already has the correct sign. Anpartskapital (-40.000) + Periodens resultat (93.213,69) = 53.213,69 — the sum is already correct as written.

## Fix

**One-line change** in `dkEconomicSaldobalancePdfV1.ts` line 259:

```typescript
// Before:
egenkapital: flipPnlSign(egenkapitalLine?.ytd_amount ?? null),

// After — keep raw value, equity YTD is already normal convention:
egenkapital: egenkapitalLine?.ytd_amount ?? null,
```

**Update Test 13** expected equity value from negative to **53213.69**.

**Verify balance equation still passes**: `aktiver_i_alt` (508773.03) vs `passiver_i_alt` (508773.03) — unchanged, still PASS.

