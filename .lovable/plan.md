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

## Phase 4e (E-conomic P&L Label Variant Fix) — DONE

### Root cause
E-conomic P&L exports from companies without tax/extraordinary items use "Resultat før ekstraordinære poster" and/or "Periodens resultat" instead of "Resultat før skat" / "Resultat efter skat". Both templates strictly required those labels, so `ebt` stayed null → validation FAIL → manual entry fallback.

### Fix: Template-local fallback chains (NOT global engine rule)

#### PDF Template (`dkEconomicResultatopgoerelsePdfV1.ts`)
- EBT fallback chain: "resultat før skat" → "resultat før ekstraordinære poster" → "periodens resultat"
- Net result fallback: "resultat efter skat" → "periodens resultat" (only if not consumed by EBT)
- Single-line reuse rule prevents double-counting

#### XLSX Template (`dkEconomicResultatopgoerelseXlsxV1.ts`)
- Added LABEL_MATCHERS: `resultat_foer_ekstraordinaere`, `periodens_resultat`
- Template-local fallback: if `resultat_foer_skat` null → try `resultat_foer_ekstraordinaere` → `periodens_resultat`
- Net result fallback: if `arets_resultat` null → try `periodens_resultat` (if not consumed by EBT)
- Uses existing key convention (`resultat_foer_skat`, `arets_resultat`)

#### Canonical Engine (`canonicalEngine.ts`)
- Added narrow KF_TO_CANONICAL mappings only:
  - `resultat_foer_ekstraordinaere` → `ebt`
  - `periodens_resultat` → `net_result`
- NO global engine-level ebt←net_result fallback

### Tests added (phase4_e2e_test.ts)
- PDF: "Resultat før ekstraordinære poster" variant → PASS + ai_eligible
- XLSX: same variant → PASS + ai_eligible
- XLSX: file truly missing all result labels → correctly FAILs
- PDF: "Periodens resultat" as sole bottom-line → EBT populated, single-line reuse enforced

### Files changed
| Fil | Handling |
|-----|----------|
| `dkEconomicResultatopgoerelsePdfV1.ts` | EBT/net-result fallback chain |
| `dkEconomicResultatopgoerelseXlsxV1.ts` | 2 new matchers + template-local fallback |
| `canonicalEngine.ts` | 2 narrow KF_TO_CANONICAL entries |
| `phase4_e2e_test.ts` | 4 new regression tests |

---

# Koncern v1 — Phase A + B

## Status: ✅ IMPLEMENTERET

## Phase A — Database foundation (DONE)

### Migration 1: Core tables
- `groups` (id, name, owner_user_id, anchor_company_id, timestamps)
- `group_memberships` (UNIQUE user_id — one group per user)
- `group_companies` (UNIQUE company_id — one group per company)
- `group_advisor_access` (UNIQUE group_id + advisor_user_id)
- `group_feature_flags` (UNIQUE user_id)
- RLS enabled on all tables

### Migration 2: Immutability trigger
- `protect_group_anchor_company()` — prevents UPDATE of anchor_company_id

### Migration 3: Helper functions
- `user_group_id(_user_id)` — returns group_id or NULL
- `user_has_group_feature(_user_id)` — checks feature flag
- `advisor_has_group_access(_advisor_id, _group_id)` — checks advisor access
- All SECURITY DEFINER with search_path

### Migration 4: RLS policies
- Members: SELECT own group/membership/companies
- Advisors: SELECT via `advisor_has_group_access()`
- Feature flags: advisors can manage, users can read own
- No client INSERT/UPDATE/DELETE on group tables

### Migration 5: `create_group` RPC
- SECURITY DEFINER, service-role-only (REVOKE from PUBLIC, anon, authenticated)
- Feature flag check → no existing group check → resolve/create anchor
- Pre-validate anchor not already grouped
- Validate all attach companies (membership + not grouped)
- Create group → membership → anchor in group_companies (hard insert)
- Process remaining companies with anchor dedup (skip if matches anchor)
- Seed advisor access (v1: all advisors/admins)

## Phase B — Onboarding (DONE)

### Edge function: `create-group/index.ts`
- Bucket A auth via `authenticateUser()`
- Input validation (group_name, companies array, mode validation)
- Service-role client calls `rpc('create_group')`
- Error mapping (403 for feature flag, 409 for conflicts, 400 for validation)

### useAuth additions (additive only)
- `groupId: string | null`
- `groupName: string | null`
- `isGroupUser: boolean` (derived from groupId)
- `isGroupFeatureEnabled: boolean`
- Fetched in `fetchUserData()` alongside existing queries
- Reset on sign-out

### New pages
- `/group/onboarding` → `GroupOnboarding.tsx` (behind ProtectedRoute)
- `/group/setup-complete` → `GroupSetupComplete.tsx` (behind ProtectedRoute)

### Files changed
| File | Change |
|------|--------|
| `supabase/migrations/` | 5 new migrations |
| `supabase/functions/create-group/index.ts` | New edge function |
| `supabase/config.toml` | Added create-group entry |
| `src/hooks/useAuth.tsx` | Additive: groupId, groupName, isGroupUser, isGroupFeatureEnabled |
| `src/pages/GroupOnboarding.tsx` | New page |
| `src/pages/GroupSetupComplete.tsx` | New page |
| `src/App.tsx` | 2 new routes |

## NOT YET APPROVED
- Phase C: read-only group shell
- Phase D: group chat
- Phase E: group budget

---

# Parser V2 — Godkendt Migrationsplan

## Status: GODKENDT — ikke startet

---

## 1. Revised Migration Phases

### Phase A1 — V2 extraction pipeline behind scoped rollout (internal only)

- Add `extraction_contract_version` column to `financial_reports` (default `'v1'`)
- Add `quality_signals` jsonb column to `financial_reports` (nullable)
- Add `extraction_v2_rollout` row to `app_config` with scoped rollout config
- In `extract-financial-data/index.ts`: check rollout scope at runtime → if company is in V2 cohort, write `extraction_contract_version = 'v2'`, `status = 'processed'` regardless of validation, validation results as `quality_signals`
- If company is NOT in cohort: unchanged V1 behavior, `extraction_contract_version = 'v1'`

### Phase A2 — Review/commit path for V2 reports (user-facing gate)

- Update `resolve_report_commit_candidate` to accept V2 reports: when `extraction_contract_version = 'v2'`, skip `validation_status = 'PASS'` requirement, accept if has metrics + resolvable period
- New `source_type = 'canonical_v2'` for these reports
- `ReportReviewDialog`: show quality signals as warnings for V2 reports
- `Reports.tsx` card states: warning badge for V2 partial reports

### Phase B — Unify canonical engine

- Prerequisites: A1+A2 stable 2+ weeks, all 10 regression families green
- Retire `buildCanonicalOutput()`, `normalizeToCanonical()`, `inferPeriodBasis()`
- All paths through `buildCanonicalFromSemantic()`
- Shadow-run parity proof before retirement

### Phase C — Decompose index.ts + cleanup

- Prerequisites: Phase B stable 2+ weeks
- Split into routing/extraction/normalization/persistence modules
- Delete `_legacy_` functions

---

## 2. A1/A2 Release Policy

A1 is internal-only infrastructure. A2 is the user-facing release gate.

**No real user company may be added to the V2 rollout cohort until A2 is deployed and verified.**

- A1 deploys: code is live, but `extraction_v2_rollout.scope.company_ids` contains only internal test companies
- A2 deploys: commit candidate + review UI learns about V2
- Only after A2 is verified: first real user company added to cohort

### How user-facing exposure is prevented before A2

**Layer 1 — Cohort control (primary):** `company_ids` list is manually curated. Before A2, only internal test UUIDs.

**Layer 2 — Dead-end is invisible:** V2 reports with `validation_status = 'FAIL'` return `not_ready` from pre-A2 `resolve_report_commit_candidate`. Identical to V1 FAIL reports.

**Layer 3 — Code-gated broad rollout:** `group_ids` and `all_companies` only respected when `review_path_deployed = true`.

---

## 3. Persisted Row-Level V2 Marker Strategy

**Column:** `financial_reports.extraction_contract_version text NOT NULL DEFAULT 'v1'`

| Value | Meaning |
|-------|---------|
| `v1` | Legacy pipeline. Validation gates status. `PASS`→`processed`, `FAIL`→`error` |
| `v2` | V2 pipeline. Status always `processed` for readable financial docs. Quality signals advisory only. |

---

## 4. Scoped Rollout Strategy

**Config row:** `app_config.extraction_v2_rollout`

```json
{
  "enabled": false,
  "review_path_deployed": false,
  "scope": {
    "company_ids": [],
    "group_ids": [],
    "all_companies": false
  }
}
```

**Resolution logic:**
1. If `!enabled` → V1
2. If `company_id IN company_ids` → V2 (always, even pre-A2)
3. If `review_path_deployed = false` → stop, V1 for everyone else
4. If `all_companies` → V2
5. If company in `group_ids` → V2
6. Otherwise → V1

---

## 5. What Changes per Phase

### A1
- Migration: 2 columns + config row
- `extract-financial-data/index.ts`: rollout scope check + V2 status logic

### A2
- `resolve_report_commit_candidate`: V2 branch
- `ReportReviewDialog` + `Reports.tsx`: quality signal UI

### B
- Retire legacy canonical functions, unified engine

### C
- Decompose `index.ts` into modules

---

## 6. What Does NOT Change per Phase

### A1
- `resolve_report_commit_candidate`, review UI, commit flow, canonical engine, dashboards, existing rows

### A2
- `extract-financial-data/index.ts`, `commit_report_facts`, facts schema, dashboards, templates

### B
- `resolve_report_commit_candidate`, `commit_report_facts`, DB schema, UI, templates

### C
- External contracts, UI

---

## 7. Existing-Row Migration

No migration. All existing rows retain `v1`. No background jobs. No retroactive changes.

---

## 8. Commit/Review Gating

```
IF extraction_contract_version = 'v1' → existing logic (validation_status = 'PASS' OR manual_override)
IF extraction_contract_version = 'v2' → processed + metrics + period → eligible (source_type = 'canonical_v2')
```

Gating on persisted column, not runtime flag. V1/V2 paths never cross. Manual override works for both.

---

## 9. Rollback Strategy

| Phase | Rollback | V2 rows | V1 rows | Time |
|-------|----------|---------|---------|------|
| A1 | `enabled = false` | Keep marker | None | Instant |
| A2 | Revert migration | `not_ready` | None | Migration revert |
| B | Git revert | Zero impact | Zero impact | Deploy |
| C | Restore Phase B | Zero impact | Zero impact | Deploy |

---

## 10. Regression Matrix

| Family | A1 | A2 | B | C |
|--------|----|----|---|---|
| Philbert multi-periode PDF | ✅ | ✅ | ✅ | ✅ |
| Floren multi-column PDF | ✅ | ✅ | ✅ | ✅ |
| Warburg combined XLSX credit | ✅ | ✅ | ✅ | ✅ |
| Combined XLSX business | ✅ | ✅ | ✅ | ✅ |
| Single-period saldobalance PDF | ✅ | ✅ | ✅ | ✅ |
| Standard e-conomic PnL PDF | ✅ | ✅ | ✅ | ✅ |
| Standard Dinero CSV | ✅ | ✅ | ✅ | ✅ |
| Unknown-but-readable fallback | ✅ | ✅ | ✅ | ✅ |
| Unreadable/non-financial | ✅ | N/A | ✅ | ✅ |
| Non-scoped V1 company | ✅ | ✅ | ✅ | ✅ |

---

## 11. Acceptance Tests

### A1
1. Flag OFF → V1, `v1`
2. Flag ON, not in scope → V1
3. Internal test company → `v2`, `processed`, `quality_signals`
4. Non-financial → `error`, `v1`
5. Existing rows → `v1`
6. `resolve_report_commit_candidate` → `not_ready` for V2 FAIL
7. Rollback tested
8. No real user in cohort

### A2
1. V2 (metrics + period) → reviewable, `canonical_v2`
2. V1 → unchanged
3. V2 no metrics → `not_ready`
4. Manual override both versions
5. Quality badges visible
6. 10 families green
7. Rollback tested
8. `review_path_deployed = true`

### B
1. All families identical metrics via unified engine
2. No legacy calls remain
3. Golden fixtures pass

### C
1. `index.ts` < 200 lines, modules < 300 lines
2. Tests green, no contract changes

---

## 12. Definition of Done

| Phase | Done when |
|-------|-----------|
| A1 | Columns exist. Scoped rollout works. Internal test → `v2` + `processed` + `quality_signals`. V1 unchanged. 10 families green. Rollback tested. No real user in cohort. `review_path_deployed = false`. |
| A2 | V2 branch in `resolve_report_commit_candidate`. V2 reviewable/committable. V1 zero regression. Quality badges. Manual override both. 10 families green. Rollback tested. `review_path_deployed = true`. First real company may join. |
| B | Single engine. Legacy deleted. All families identical. Shadow-run clean 1 week. |
| C | Decomposed. Modules < 300 lines. Tests green. No contract changes. |

---

## Change Control

No changes to `canonicalEngine.ts`, `extract-financial-data/index.ts`, or `normalizationProfiles.ts` outside a named phase with stated parity check, rollback, and regression sign-off.

Narrow scoped fixes (≤5 lines, explicit acceptance criteria, no contract changes) permitted only between phases.

---

# Notification Architecture — Phase 1

## Status: ✅ IMPLEMENTERET

### What was built
1. **`notifications` table** with `dedup_key` UNIQUE constraint `(user_id, dedup_key)`, RLS (SELECT/UPDATE own rows only), no client INSERT/DELETE, realtime enabled
2. **RPCs**: `mark_notifications_seen()` (batch seen_at), `mark_notification_read(p_notification_id)` (single read_at)
3. **Shared helper**: `supabase/functions/_shared/notificationWriter.ts` — idempotent INSERT with ON CONFLICT dedup
4. **Dual-write** in 3 edge functions: `send-slack-report-notification`, `send-slack-chat-notification`, `send-slack-handout-notification` — write to BOTH `advisor_notifications` (legacy) AND `notifications` (new)
5. **`notification_v2_rollout`** config in `app_config` — `{ enabled: true, test_user_ids: [] }`
6. **`NotificationCenter`** component — new bell icon with priority-aware badges, deep-link navigation, seen/read state
7. **Scoped UI in `AppSidebar`** — test_user_ids see NotificationCenter, all others see legacy AdvisorNotifications. Never both.

### What explicitly does NOT exist
- No member-facing notifications
- No email/push delivery
- No migration/cutover of legacy `advisor_notifications`
- No database triggers on `notifications`
- No shared state between chat read and notification read

### Next phases (not yet approved)
- Phase 2: Member notifications + email + preferences
- Phase 3: Legacy cutover + web push
- Phase 4: Anti-spam tuning + observability
