

## Plan: Three Targeted Fixes

### FIX 1 — Delete `src/components/FinancialTrends.tsx`
Remove the file entirely. It contains only hardcoded mock data and is not imported anywhere.

### FIX 2 — `src/components/FinancialOverview.tsx`
Change label `"EBITDA Margin"` → `"Resultatmargin"` (around line 79). No calculation change.

### FIX 3 — `src/components/PerformanceScore.tsx`
Replace all falsy checks with `!= null` guards on five locations:
- `revenueGrowth` computation (prev?.omsaetning and latest.omsaetning)
- `dbMargin` computation (latest.omsaetning and latest.daekningsbidrag)
- `netMargin` computation (latest.omsaetning and latest.resultat_foer_skat)
- `bankScore` computation (latest.bank_balance)
- `bankScore` value display (latest.bank_balance)

No calculations change — only null-safety patterns.

### Files touched
1. `src/components/FinancialTrends.tsx` — **delete**
2. `src/components/FinancialOverview.tsx` — one label change
3. `src/components/PerformanceScore.tsx` — five falsy→null-check fixes

