


## Add "Regnskab" milestone category

A new milestone category "Regnskab" will be added to the existing category registry.

### Changes

**File: `src/lib/milestoneCategories.ts`**
- Add `"regnskab"` to the `MilestoneCategory` type union
- Add entry in `MILESTONE_CATEGORIES` with:
  - Label: "Regnskab"
  - Icon: `Calculator` (from lucide-react)
  - Badge style: a warm color not yet used (e.g. `bg-rose-500/15 text-rose-600`)

That's it — one file, ~5 lines added. The `CATEGORY_OPTIONS` export auto-generates from the record, so all dropdowns and displays pick it up immediately.

## Replace free-text industry field with two-level dropdown ✅

### Summary
Replaced the single free-text "Branche" input in Settings.tsx with two side-by-side Select dropdowns (main category → subcategory). Added `industry_code` and `industry_label` columns to companies table.

### Migration
- Added `industry_code text` and `industry_label text` columns to `companies`
- Migrated existing free-text `industry` values to `industry_label` for companies without `industry_code`

### Implementation
- `INDUSTRY_OPTIONS` constant with 16 main categories and subcategories
- Two Select dropdowns: main category + subcategory (only shown when main has multiple subs; auto-selected when only one sub)
- On load: derives main category from stored `industry_code`
- On save: persists both `industry_code` and `industry_label`

### Note for future work
- `industry_label` (not `industry_code`) should be sent to AI functions — the human-readable label provides meaningful context (e.g. "Eventlogistik og specialtransport" vs "transport_event")
