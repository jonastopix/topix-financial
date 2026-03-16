

## Bug: Advisor "Vis som virksomhed" Causes Loop

### Root Cause

When Morten (advisor, `tour_completed_at = null`, no company membership) toggles "Vis som medlem":

1. `isAdvisor` becomes `false` (line 42: `rawAdvisor && !viewingAsMember`)
2. `companyId` is `null` (Morten has no company)
3. Dashboard falls through to the member view
4. `shouldShowTour` evaluates to `true` because `!isAdvisor && profile && !profile.tour_completed_at`
5. Tour fires, finishes, navigates to `/settings`
6. Morten goes back to `/` → profile in memory still has `tour_completed_at = null` (no refresh) → tour fires again → loop

### Fix

Two changes in `src/pages/Index.tsx`:

**Change 1**: Use `rawAdvisor` instead of effective `isAdvisor` for the tour guard. Advisors should never see the member onboarding tour, regardless of view mode.

```typescript
// Line 46 — change from:
const shouldShowTour = !isAdvisor && profile && !profile.tour_completed_at;
// To:
const shouldShowTour = !rawAdvisor && profile && !profile.tour_completed_at;
```

**Change 2**: After the tour completes, refresh the profile so `tour_completed_at` is updated in memory (prevents re-trigger on remount). In the `GuidedTour` `onComplete` callback:

```typescript
// In the showTour handler, after setShowTour(false), call refreshProfile
{showTour && (
  <GuidedTour onComplete={() => { setShowTour(false); refreshProfile(); }} />
)}
```

This requires destructuring `refreshProfile` from `useAuth()` on line 40.

### Impact

- Advisors will never see the guided tour, even in "Vis som medlem" mode
- No regression for normal members — they still get the tour
- Profile refresh prevents edge case re-triggering for any user

