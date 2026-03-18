

## Root Cause: Inactivity Timer Kills Fresh Login

The auth logs confirm the exact sequence at `10:53:58-59`:

```text
1. 10:53:58  POST /token → 200  (Google OAuth login succeeds)
2. 10:53:59  GET  /user  → 200  (session is valid)
3. 10:53:59  POST /logout → 204  (IMMEDIATELY logged out!)
4. 10:53:59  POST /token → 200  (second Google login succeeds — this one sticks)
```

**What happens:**

1. User clicks "Log in with Google" → redirected to Google → returns with fresh session
2. `onAuthStateChange` fires `SIGNED_IN` → sets `user` → `enabled` becomes `true`
3. `useInactivityLogout` effect runs → reads `lastActivityAt` from localStorage
4. That timestamp is **stale** (from before the Google redirect, possibly 30+ minutes ago)
5. `elapsed > timeoutMs` → **true** → immediately calls `signOut()`
6. User sees login form again, logs in a second time
7. Now it works because step 5 stamped a fresh `lastActivityAt` before signing out

**The race:** The inactivity hook checks localStorage **before** it stamps a fresh value. On OAuth redirects, the user was "inactive" (away on Google's page), so the stale stamp triggers immediate logout.

## Minimal Fix

**In `useAuth.tsx`, stamp `lastActivityAt` synchronously when `SIGNED_IN` fires** — before React re-renders and the inactivity hook's effect runs.

```typescript
// In onAuthStateChange callback, before setUser:
if (_event === "SIGNED_IN") {
  localStorage.setItem("lastActivityAt", Date.now().toString());
}
```

This ensures that by the time `useInactivityLogout`'s effect checks localStorage, the stamp is fresh. The fix is 1 line, affects only the auth callback, and has zero side effects — stamping activity on login is always correct.

## Why the second login works

The inactivity hook already does `stampActivity()` before calling `signOut()` (line 52). So after the first forced logout, the stamp is fresh. The second login finds a recent stamp → no forced logout.

## Files changed

- `src/hooks/useAuth.tsx` — add 1 line in `onAuthStateChange` callback

## No other changes needed

- `useInactivityLogout.ts` — no changes (its logic is correct for page-reload scenarios)
- No schema, RLS, or UI changes

