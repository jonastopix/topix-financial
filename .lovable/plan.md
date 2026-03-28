

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

