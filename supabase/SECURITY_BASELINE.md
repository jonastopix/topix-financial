# Security Baseline Checklist

> **Purpose**: This document is the authoritative checklist for any future migration
> squash, schema baseline, or audit. Every item listed here MUST be preserved exactly
> in any new baseline migration. Last updated after hardening patches 5–10.

---

## 1. Security-Definer Functions

These functions execute with owner privileges (bypassing RLS). They are foundational
to the entire access-control model.

### `has_role(_user_id uuid, _role app_role) → boolean`
- Checks `user_roles` table for the given role
- **Admin inherits advisor**: `has_role(x, 'advisor')` returns true if user has 'admin'
- Used in every advisor/admin RLS policy across all tables
- SECURITY DEFINER with `search_path = public`

### `user_company_id(_user_id uuid) → uuid`
- Returns the user's `company_id` from `company_members`
- Used in every company-scoped RLS policy
- SECURITY DEFINER with `search_path = public`

### `get_users_last_login(user_ids uuid[]) → TABLE (user_id uuid, last_sign_in_at timestamptz, email_confirmed_at timestamptz)`
- Returns `last_sign_in_at` and `email_confirmed_at` from `auth.users` for the provided UUIDs
- **Advisor-only**: body enforces `has_role(auth.uid(), 'advisor'::app_role)` — returns 0 rows when caller is not an advisor
- Grant: `EXECUTE TO authenticated` (security lives in the body, not the grant)
- STABLE, SECURITY DEFINER with `search_path = public`
- Only known caller: `src/pages/Members.tsx` (advisor-route)
- Hardened in migration `20260507120000_harden_get_users_last_login.sql` (BACKLOG.md punkt #1)

---

## 2. Auth Trigger

### `handle_new_user()` on `auth.users AFTER INSERT`
- Multi-path orchestration trigger handling:
  - **Token-based invite**: Matches `company_invitations.token`, creates membership, conversation
  - **Email-based invite**: Fallback matching on normalized email
  - **Advisor invite**: Matches `advisor_invitations.email`, assigns advisor role
  - **New company**: Creates company + membership + conversation when no invite matches
- Creates `profiles` row for every new user
- **Critical**: This trigger operates on `auth.users` — it must NOT be modified
  in ways that break the signup flow

---

## 3. Immutable-Field Triggers (Hardening Patch 5)

### `protect_message_immutable_fields()` on `messages BEFORE UPDATE`
- Prevents mutation of: `sender_id`, `conversation_id`, `created_at`
- Raises exception on any attempt to change these fields

### `protect_handout_immutable_fields()` on `handouts BEFORE UPDATE`
- Prevents mutation of: `user_id`, `company_id`, `created_at`
- Raises exception on any attempt to change these fields

---

## 4. Data Normalization Triggers

### `trg_normalize_invitation_email` on `company_invitations BEFORE INSERT`
- Lowercases and trims `email` field
- Ensures consistent matching during invitation acceptance

---

## 5. Key RLS Policy Patterns

All policies on tables in the `public` schema are **RESTRICTIVE** (not
permissive) — they stack with AND logic. Note: `storage.objects` policies
are PERMISSIVE (Supabase default for the storage schema) and OR-stack —
see section 9 for the storage-specific policy map.

### Company-scoped access
```sql
company_id = user_company_id(auth.uid())
```
Applied to: `financial_reports`, `milestones`, `handouts`, `budget_targets`,
`kpi_targets`, `kpi_benchmarks`, `conversations`, `messages` (via join),
`company_invitations`, `company_members`

### Advisor access (full read, scoped write)
```sql
has_role(auth.uid(), 'advisor'::app_role)
```
Applied to: all data tables for SELECT; most tables for INSERT/UPDATE/DELETE

### Admin access
```sql
has_role(auth.uid(), 'admin'::app_role)
```
Applied to: `app_config` management, `user_roles` management

### Self-only policies
```sql
auth.uid() = user_id
```
Applied to: `profiles`, `financial_reports` (owner ops), `handouts` (owner ops)

### Service-role-only tables (no client INSERT/UPDATE/DELETE)
- `slack_conversation_threads`
- `slack_notification_log`
- `slack_handout_notification_log`
- `slack_report_notification_log`
- `circle_activity`
- `circle_course_progress`

---

## 6. Security Outcomes from Hardening Patches 5–10

### Messages ownership mutation rules (Patch 5)
- `sender_id`, `conversation_id`, `created_at` are immutable after insert
- RLS enforces `sender_id = auth.uid()` on INSERT
- Conversation membership validated via JOIN on insert/update/delete

### Handouts user-owned model (Patch 5)
- `user_id`, `company_id`, `created_at` are immutable after insert
- UNIQUE constraint on `(user_id, module)` prevents duplicate handouts
- RLS enforces `user_id = auth.uid()` AND `company_id = user_company_id(auth.uid())`

### Financial reports manual override / effective-period (Patches 5, 9)
- `user_id`, `company_id`, `uploaded_at` are immutable after insert
- Manual override fields (`manual_override_status`, `manual_report_period_key`,
  `manual_report_period_label`, `manual_report_type`) provide an immutable
  audit trail — original parser data is never overwritten
- Effective-period resolution is exclusive: a report counts for ONE period only
  (either manual override period or raw `report_period`, never both)
- `deleted_at` soft-delete is respected in all queries

### Invitation email normalization (Patch 6)
- `trg_normalize_invitation_email` trigger ensures `email` is always lowercase + trimmed
- `process-pending-invitation` edge function uses server-verified email only
  (never trusts client-supplied email)
- Email fallback requires `email_confirmed_at` — unverified emails fail closed

### Fail-closed webhook rule (Patches 7–8)
- Edge functions that receive external webhooks verify signatures before
  any processing (HMAC-SHA256 for Monday.com, `verifyWebhookRequest` for auth hooks)
- User-triggered functions validate JWT via `getClaims()` before any
  service-role reads/writes/side effects
- Service-role/cron functions gate on `SUPABASE_SERVICE_ROLE_KEY` comparison
  before any operations

### Caller→resource access checks (Patch 8)
- All user-triggered edge functions that perform service-role operations
  first verify the caller has RLS-level access to the target resource
  using a JWT-scoped client
- This prevents privilege escalation via edge function bypass

---

## 7. Edge Function Auth Contracts

### Shared auth helper: `_shared/edgeFunctionAuth.ts`
- `authenticateUser(req)` — Bucket A (user-triggered)
- `authenticateServiceRole(req)` — Bucket B (cron/internal)
- Bucket C (webhooks) — per-function signature verification

### Security-sensitive functions requiring extra care:
- `auth-email-hook` — system webhook, signature-verified
- `monday-webhook` — HMAC-SHA256 with `MONDAY_SIGNING_SECRET`
- `send-report-reminder` — service-role-only gate
- `manage-advisor` — admin role gate + service-role operations
- `process-pending-invitation` — self-only guard + server-verified email

---

## 8. Future Baseline Procedure

When squashing migrations into a clean baseline:

1. **Dump**: `pg_dump --schema-only` to capture current state
2. **Verify**: Diff the dump against the new baseline migration — zero drift allowed
3. **Checklist**: Walk through every section of this document and confirm each
   item exists and matches exactly in the baseline
4. **Test**: Apply the baseline to a fresh database and run the application
5. **Archive**: Move old migration files to `supabase/migrations/_archive/` — do NOT delete
6. **Timing**: Only perform after the hardening sequence has been validated in
   production for at least 2–4 weeks

### Items that MUST NOT be altered during squash:
- [ ] `has_role()` function with admin→advisor inheritance
- [ ] `user_company_id()` function
- [ ] `handle_new_user()` trigger on `auth.users`
- [ ] `protect_message_immutable_fields()` trigger
- [ ] `protect_handout_immutable_fields()` trigger
- [ ] `trg_normalize_invitation_email` trigger
- [ ] `get_users_last_login()` body's advisor-gate (`has_role(auth.uid(), 'advisor'::app_role)`) — gate must remain in the body, not in the grant
- [ ] All RESTRICTIVE RLS policies (exact policy names and expressions)
- [ ] All storage.objects PERMISSIVE policies listed in section 9 (in particular the advisor INSERT branch for `financial-documents`, without which advisor uploads false-deny)
- [ ] `app_role` enum values: `member`, `advisor`, `admin`
- [ ] UNIQUE constraint on `handouts(user_id, module)`
- [ ] All foreign key relationships

---

## 9. Storage Bucket Policies

Storage uses **PERMISSIVE** policies (Supabase default for the `storage`
schema). Multiple INSERT or SELECT policies for the same `cmd` OR-stack:
a row passes if ANY policy passes. This is the opposite of the public
schema's RESTRICTIVE/AND model — adding a "stricter" policy alongside a
loose one does NOT tighten access. The loose one always wins.

### Bucket: `financial-documents` (private)

**Path convention**: `{company_id}/...`
- Main flow: `{company_id}/{report_id}/{sanitized_filename}` — set by
  `buildStoragePath()` in `src/lib/reportFileAccess.ts`
- Annual flow: `{company_id}/annual/{year}_{ts}_{sanitized_filename}` —
  set inline in `src/pages/Reports.tsx:260`
- Legacy paths starting with `uploads/...` exist in the bucket but are
  refused by the frontend (`isLegacyPath()` short-circuits openers)

**Policies on `storage.objects` for this bucket** (after migration
`20260523183330_fix_financial_documents_storage_rls`):

| cmd | policy | clause |
|---|---|---|
| INSERT | `Members can upload to own company` | `(storage.foldername(name))[1] = public.user_company_id(auth.uid())::text` |
| INSERT | `Advisors can upload to any company` | `public.has_role(auth.uid(), 'advisor')` |
| SELECT | `Members can view own company files` | `(storage.foldername(name))[1] = public.user_company_id(auth.uid())::text` |
| SELECT | `Advisors can view all files` | `public.has_role(auth.uid(), 'advisor')` |
| DELETE | `Members can delete own company files` | `(storage.foldername(name))[1] = public.user_company_id(auth.uid())::text` |
| DELETE | `Advisors can delete any files` | `public.has_role(auth.uid(), 'advisor')` |

All policies above also gate on `bucket_id = 'financial-documents'`.

**Why advisor branches are required (not optional)**: in advisor sessions,
`useAuth.tsx:113` resolves `companyId` to the customer's UUID via
`overrideCompanyId`, so the upload path is `{customer_company_id}/...`,
but `auth.uid()` is the advisor (typically not a `company_members` row).
`user_company_id(auth.uid())` returns NULL, so the members-branch
false-denies every advisor upload. The advisor-branch is what keeps the
flow working. Same logic applies to advisor permanent-delete in the
trash UI (`Reports.tsx:1743`).

### Bucket: `chat-attachments` (public)

**Known issues**: bucket is `public = true`, SELECT policy is `TO public`
with no path or membership check, INSERT policy lacks a tenant/path
check. Public-bucket flag means files are served via
`/storage/v1/object/public/...` which bypasses RLS entirely — tightening
the SELECT policy alone would not close the read exposure. Remediation
requires making the bucket private, replacing `getPublicUrl` with signed
URLs in `src/lib/chatAttachments.ts`, and migrating existing
`message.context_meta.attachments[].url` data. **Tracked separately —
not in scope for the financial-documents migration.**

### Other buckets (not security-critical at this time)

- `avatars` (public): user-id-scoped path, OK for the use case
- `company-logos` (public): logos are intentionally public
- `feedback-screenshots`: internal-only feedback feature
