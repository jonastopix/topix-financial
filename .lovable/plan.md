

## Analysis: ai_eligible Rule for Combined vs Pure Trial Balance

### Current State (Already Correct)

The existing `computeAiEligible` in `canonicalEngine.ts` already implements the exact rule you want:

```text
pnl       + PASS + revenue + ebt              → true
combined  + PASS + revenue + ebt + assets      → true
trial_balance                                  → false
balance                                        → false
```

### Why Warburg/Januar 2026 Failed

The report was uploaded via the **AI extraction path**, where Gemini labeled `report_type` as "Saldobalance". `detectStatementType()` matched "saldo" → returned `trial_balance` → `ai_eligible = false`.

### Deterministic Path (Already Correct)

The Excel template `DK_COMBINED_BALANCE_PNL_V1` explicitly sets `report_type: "combined"` → `detectStatementType` returns `"combined"` → `computeAiEligible` returns `true` (given PASS + metrics).

### What Needs to Happen

**No code changes required.** The rules are already sharp and correct:

| Path | report_type | statement_type | ai_eligible |
|------|------------|----------------|-------------|
| Deterministic Excel (saldobalance) | `"combined"` | `combined` | **true** |
| Deterministic PDF (saldobalance) | `"combined"` | `combined` | **true** |
| AI extraction (saldobalance) | `"Saldobalance..."` | `trial_balance` | **false** |
| AI extraction (resultatopgørelse) | `"Resultat..."` | `pnl` | **true** |

This is the correct behavior: deterministic templates that have verified both P&L and balance data are labeled `combined`. AI-extracted saldobalancer without structural verification stay `trial_balance` and are blocked.

### Verification Plan (Warburg re-upload)

1. Delete the existing AI-extracted report (ID `9d56aaf1-...`) and associated milestones/notifications
2. Re-upload `Januar_2026-5.xlsx` via Reports UI
3. The deterministic Excel template will match (score ~92) and set `report_type: "combined"`
4. Expected results:
   - `extraction_method: "deterministic_template"`
   - `statement_type: "combined"`
   - `validation_status: "PASS"`
   - `ai_eligible: true`
   - EBT and net_result: **positive** (deterministic sign rules, not the AI safety-net)
   - AI analysis becomes available

### How Combined vs Pure Trial Balance Is Distinguished

The distinction is structural, not heuristic:

- **Deterministic templates** parse the actual file structure, verify both P&L accounts (1000-4999) and balance accounts (5000+) are present, and declare `"combined"` with confidence
- **AI extraction** reports whatever label the AI sees in the document header ("Saldobalance") — this stays `trial_balance` because we cannot structurally verify the data quality

This is the safest approach: only let structurally verified combined reports through to AI analysis.

