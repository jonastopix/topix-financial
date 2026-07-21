## Plan: Deploy `extract-financial-data` edge function

### Objective
Deploy the current version of the `extract-financial-data` edge function from the repository to the live backend, without changing any code. This should bring the deployed function in line with PR #151 (merged to main).

### Scope
- **Deploy:** `supabase/functions/extract-financial-data/` → Supabase Edge Functions.
- **No code changes** to any file in the repo.
- **No migrations, no frontend build, no other functions touched.**

### Steps
1. Verify the function exists in `supabase/functions/extract-financial-data/index.ts` (pre-flight read, no edits).
2. Run `supabase--deploy_edge_functions` for `extract-financial-data` only.
3. Confirm deployment success from the tool response.

### Outcome
The deployed `extract-financial-data` function matches the current `main` branch code, including the PR #151 fix.