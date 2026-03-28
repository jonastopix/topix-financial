

## Plan: Add session-check useEffect to Auth.tsx

### What
Add a new `useEffect` in `src/pages/Auth.tsx` that checks if the user is already logged in when the page loads with a `returnUrl` parameter. If so, immediately redirect to that URL.

### Where
Insert the new `useEffect` block right after the existing "Redirect after successful auth" `useEffect` (around line 38, after the `return () => subscription.unsubscribe();` block closes).

### Code to add
```typescript
// If already logged in and returnUrl is set, redirect immediately
useEffect(() => {
  if (!returnUrl) return;
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session && returnUrl.startsWith("https://")) {
      window.location.href = returnUrl;
    }
  });
}, [returnUrl]);
```

### Files modified
- `src/pages/Auth.tsx` — one addition, no other changes

