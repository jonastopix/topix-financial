

## Problem
Supabase sessions persist indefinitely via localStorage with `autoRefreshToken: true`. Once logged in (e.g. via a Slack deep-link), the session stays alive forever — no inactivity-based logout exists.

## Solution: Client-side inactivity timer

Add an `useInactivityLogout` hook that tracks user activity and signs out after a configurable period of inactivity.

### 1. Create `src/hooks/useInactivityLogout.ts`

- Track last activity timestamp via `mousemove`, `keydown`, `touchstart`, `scroll`, `click` events (throttled to once per 30s to avoid performance impact)
- Store last activity time in `localStorage` (so it persists across tabs)
- Run an interval check every 60s: if `now - lastActivity > TIMEOUT`, call `supabase.auth.signOut()`
- Default timeout: **30 minutes** for advisors, configurable via `app_config` table (key: `session_timeout_minutes`)
- Clean up listeners on unmount

### 2. Wire up in `src/hooks/useAuth.tsx`

- Call `useInactivityLogout()` inside `AuthProvider` when `user` is present
- Pass `isAdvisor` to potentially differentiate timeout durations

### 3. Optional: Admin-configurable timeout

- Add a setting in `AdminConfig.tsx` to adjust timeout (15/30/60/120 min)
- Stores in existing `app_config` table with key `session_timeout_minutes`

### Key details
- Events are throttled (one update per 30s) to avoid performance issues
- `localStorage` key `lastActivityAt` ensures cross-tab awareness
- On sign-out, user is redirected to `/auth` via the existing `onAuthStateChange` handler
- No database migration needed — uses existing `app_config` table

