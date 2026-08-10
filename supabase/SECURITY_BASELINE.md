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

### `is_membership_active(p_company_id uuid) → boolean`
- SQL mirror of the canonical membership-tier computation — **copy no. 3**
  of the logic: 1) `src/lib/membershipTier.ts` (canonical), 2)
  `supabase/functions/_shared/membershipTier.ts` (Deno mirror), 3) this
  function. Changes to tier logic MUST be mirrored in all three places.
- Fail-open by design (mirrors useAuth): NULL/unknown company → true,
  missing `contract_end_date` ("no_date") → true; false only for "expired"
  (contract past AND no active Stripe subscription)
- STABLE, SECURITY DEFINER with `search_path = public`
- Grants: `EXECUTE TO authenticated` only — `REVOKE ALL FROM PUBLIC` and `FROM anon`
- Introduced in migration `20260810150000_directory_aktive_medlemmer.sql`

### Member-visibility RPCs: `get_member_profile(p_user_id uuid)`, `get_event_participants(p_event_id uuid)`, `get_member_directory()`
- All three: STABLE, SECURITY DEFINER with `search_path = public`
- Grants: `EXECUTE TO authenticated` only — `REVOKE ALL FROM PUBLIC` and `FROM anon`
- Fixed shared column set: `user_id, full_name, avatar_url, company_name, industry_label, website, linkedin_url, expertise, bio, is_advisor`
- **NEVER expose** `email`, `notification_email_prefs`, `registered_at` or `cancelled_at`
- `get_event_participants`: active registrations only (`cancelled_at IS NULL`) — the list shows who is coming, not registration history
- `get_member_directory`: UNION of company members (`is_advisor = false`) and advisors/admins from `user_roles` (company columns NULL, sorted last) — advisors have no `company_members` row
- **Active-membership gate** (migration `20260810150000_directory_aktive_medlemmer.sql`): `get_member_directory` (member branch only — advisors have no company) and `get_event_participants` include only rows where `is_membership_active(user_company_id(user_id))` is true. `get_member_profile` deliberately does NOT gate: a profile must remain resolvable by direct lookup, e.g. from a historical participant list.
- Introduced in migration `20260810120000_member_profiles.sql`; rationale under `member_profiles` in section 5

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

**Addendum (2026-08-05, mål-adgang på /noegletal)**: `kpi_targets` and
`kpi_benchmarks` additionally have advisor write policies — "Advisors can
insert kpi targets" / "Advisors can insert benchmarks" (INSERT, WITH CHECK
`has_role(auth.uid(), 'advisor')`) and "Advisors can update kpi targets" /
"Advisors can update benchmarks" (UPDATE, USING + WITH CHECK same
predicate), migration `20260805220000_kpi_targets_benchmarks_advisor_write.sql`.
Purpose: both advisor and member set targets/benchmarks on the Hb KPI
surface. No DELETE policies (the UI only upserts). Policies stack
permissively; self-only and company-scoped policies are untouched.
**Accepted condition (approved 2026-08-05)**: `user_id` on these tables is
"last writer" — the upsert (`onConflict company_id,kpi_key`) flips the
row's `user_id` to whoever saved last. Harmless for access (member access
is company-scoped, not user_id-scoped) and doubles as a coarse trail of
who last set the value. Note: the pre-existing self-insert policies check
only `auth.uid() = user_id` with NO company predicate — a known gap logged
as BACKLOG [P4] (baseline-stramning), deliberately not addressed in the
advisor-write migration.

### Advisor access (full read, scoped write)
```sql
has_role(auth.uid(), 'advisor'::app_role)
```
Applied to: all data tables for SELECT; most tables for INSERT/UPDATE/DELETE

`pulse_checkins` (member reflections) carries this broad advisor SELECT policy
too, named "Advisors can view all checkins" (migration
`20260611140000_advisor_read_pulse_checkins.sql`). It is read-only for advisors
(members remain the only writers via "Members manage company checkins"). It was
originally added because an older group-scoped advisor policy returned 0 rows
for standalone companies; that group-scoped policy is now DROPPED entirely
(koncern removal, see note below) and this broad policy is the sole advisor
read path.

**Koncern-objekter FJERNET (2026-08-05, SPOR 3)**: alle koncern-/group-
DB-objekter er droppet med eksplicit grønt lys — 8 tabeller (groups,
group_companies, group_memberships, group_advisor_access,
group_feature_flags, group_conversations, group_messages,
budget_category_group_map), 21 funktioner (heraf SECURITY DEFINER-helpers
som user_group_id/advisor_has_group_access og alle group-RPC'er), policyen
"Advisors read checkins for their companies" på pulse_checkins samt
kolonnen notifications.group_id. Eksekveret manuelt i prod ca. 22:45 og
committet for paritet som migration
`20260805224500_drop_koncern_objects.sql`. Recon: hb-koncern-recon.txt §C.

### Admin access
```sql
has_role(auth.uid(), 'admin'::app_role)
```
Applied to: `app_config` management, `user_roles` management

### Self-only policies
```sql
auth.uid() = user_id
```
Applied to: `profiles`, `financial_reports` (owner ops), `handouts` (owner ops),
`member_progress` (FOR ALL, USING + WITH CHECK), `event_registrations`
(SELECT/INSERT/UPDATE only — no member DELETE; cancellation is a
`cancelled_at` UPDATE, preserving capacity history)

**Addendum (2026-08-05, advisor-fremdriftsværktøjet)**: `member_progress`
additionally has advisor write policies — "Advisors can insert progress"
(INSERT, WITH CHECK `has_role(auth.uid(), 'advisor')`) and "Advisors can
update progress" (UPDATE, USING + WITH CHECK same predicate), migration
`20260805200000_member_progress_advisor_write.sql`. Purpose: manual
Circle-migration + ongoing advisor marking via `/admin/indhold/fremdrift`.
Policies stack permissively; the self-only policy is untouched. **Accepted
condition (approved 2026-08-05)**: `acknowledged_at` is SOURCE-LESS — no
audit trail distinguishes member-set from advisor-set completion (only
`updated_at` changes). Members see advisor-set marks as their own.

### Platform-global content (authenticated read published)
```sql
status = 'published'   -- member SELECT gate; no company_id predicate
```
Applied to: `content_collections`, `content_items`, `partners`, `events`
(events use `status IN ('published', 'cancelled', 'completed')` so members
can see cancellations and links to recordings). Introduced in migration
`20260804120000_hjemmebane_content_layer.sql` (Projekt Hjemmebane, C0
datamodel decision B1).

This is a deliberate break with the company-scoped pattern: the content
layer is shared across ALL companies (Circle-exit content), so member read
access gates on publication status only, never on `user_company_id()`.
Writes remain advisor-only (`has_role(auth.uid(), 'advisor')`) plus a
service-role FOR ALL policy. Members have NO write access to content
tables; their only writes are `member_progress` and `event_registrations`
(self-only, above).

Drip pacing (`drip_after_days`) is deliberately NOT enforced in RLS in V1 —
it is filtered in the app layer (C0 decision B6, accepted as a P4 note in
`BACKLOG.md`). RLS enforcement would require a new SECURITY DEFINER helper,
which is forbidden without explicit approval.

**Parent-gated variant** (`content_item_attachments`, migration
`20260804210000_content_item_attachments.sql`): attachments deliberately have
no `status` column of their own — they follow their parent item. The member
SELECT policy therefore gates on the PARENT's publication status via EXISTS:

```sql
EXISTS (
  SELECT 1 FROM public.content_items i
  WHERE i.id = content_item_attachments.item_id
    AND i.status = 'published'
)
```

No draft attachments leak. Double bottom: the subquery runs as the calling
user, so `content_items`' own RLS also applies inside the EXISTS. Writes
remain advisor-only + service-role FOR ALL (exact mirror of the
content_items policies).

### Advisor-owned rows (own acknowledgements)
```sql
advisor_id = auth.uid() AND has_role(auth.uid(), 'advisor'::app_role)
```
Applied to: `advisor_company_acknowledgments`. Durable, company-wide advisor
"Kvitter" state for the dashboard action queues: `snoozed_until` null means
cleared until a newer signal appears, a future value is a remind window, and
`basis_at` snapshots the newest signal timestamp at acknowledgement time. Each
advisor sees and writes only their own rows (owner-scoped); members have no
access (no policy matches them). Contains no member PII, only `advisor_id`,
`company_id` and timestamps.

### Shared member-profile layer (`member_profiles`)
- Purpose: the PERSONAL layer of the member profile — `linkedin_url`,
  `expertise`, `bio`. Industry and website live on `companies` (so two
  colleagues can never state different ones); name and avatar stay in
  `profiles`.
- RLS: self-only SELECT/INSERT/UPDATE (`auth.uid() = user_id`),
  advisor-wide SELECT via `has_role(auth.uid(), 'advisor')`, service_role
  FOR ALL. **No member DELETE** (deliberate — cleanup happens via
  `ON DELETE CASCADE` from `auth.users` or service-role).
- Contains no sensitive fields; everything in the table is shared content
  by design.

**Deliberate break / rationale (2026-08-10)**: cross-company member
visibility goes through the three member-visibility RPCs (section 1), NOT
through a broad SELECT policy on `profiles` — `profiles` also carries
`email` and `notification_email_prefs`, and opening that table would expose
them. The RPC path gives three functions each with a single purpose instead
of one open table, and the boundary is readable in the schema: everything
in `member_profiles` is shared, nothing outside it is.

This is the first time members become visible to each other across
companies. Decided by Jonas and Morten 2026-08-10; the precedent is Circle,
where members are already visible to each other. Migration
`20260810120000_member_profiles.sql`.

### Service-role-only tables (no client INSERT/UPDATE/DELETE)
- `slack_conversation_threads`
- `slack_notification_log`
- `slack_handout_notification_log`
- `slack_report_notification_log`

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
- `bunny-content-admin` — Bucket A + advisor gate (`has_role` via callerClient)
  before any Bunny Stream operation; returns only a time-boxed, video-scoped
  TUS upload signature — the Bunny API key never reaches the frontend
- `get-video-embed` — Bucket A; access control is the RLS published-gate via
  callerClient + a server-side drip check (C1 decision D5, advisors bypass,
  fail-closed without a membership anchor); signs Bunny embed URLs server-side
  (`BUNNY_STREAM_TOKEN_AUTH_KEY` never reaches the frontend, TTL 1h)
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

### Bucket: `content-assets` (private)

Created in migration `20260804120000_hjemmebane_content_layer.sql` (Projekt
Hjemmebane). **Private from day one** (`public = false`) — the deliberate
opposite of the `chat-attachments` mistake below. Member delivery happens
ONLY via signed URLs with expiry (`createSignedUrl()` requires the SELECT
policy below). Videos never touch this bucket — they live in Bunny Stream.

**Path convention**: `covers/<item-uuid>/...`,
`templates/<item-uuid>/<filnavn>`, `partners/<partner-uuid>/...`,
`attachments/<item-uuid>/<filnavn>` (item materials, added with
`content_item_attachments` — same bucket, same policies, no new grants)

**Policies on `storage.objects` for this bucket**:

| cmd | policy | clause |
|---|---|---|
| SELECT | `Members can read content assets` | `bucket_id = 'content-assets'` (TO authenticated) |
| INSERT | `Advisors can upload content assets` | `bucket_id = 'content-assets' AND public.has_role(auth.uid(), 'advisor')` |
| UPDATE | `Advisors can update content assets` | `bucket_id = 'content-assets' AND public.has_role(auth.uid(), 'advisor')` |
| DELETE | `Advisors can delete content assets` | `bucket_id = 'content-assets' AND public.has_role(auth.uid(), 'advisor')` |

Because `storage.objects` policies are PERMISSIVE and OR-stack, every
policy carries the bucket check inside its own predicate — a policy
without a bucket check must NEVER be created for this schema.

### Bucket: `chat-attachments` (private)

Flipped to `public = false` 2026-08-06 (migration
`20260806082800_chat_attachments_private.sql`, executed manually in
prod 08:28). The open SELECT policy (`Anyone can read chat attachments`,
`TO public`, no path/membership check) was dropped in the same step —
proven by negative test (public URL → 400 NoSuchBucket) and positive
test (attachments render via fresh signing).

**Read path**: exclusively via the `get-chat-attachment-url` edge
function (Bucket A) — caller access is gated by RLS on the underlying
`messages` row via `callerClient`, then a service-role
`createSignedUrl` mints a 600 s signed URL. No SELECT policy on
`storage.objects` is needed for this path (service-role bypasses RLS).
Frontend consumes it through `useChatAttachmentUrl` (TanStack Query,
staleTime 9 min against the 10 min TTL).

**Remaining items (→ chat-attachments PR 5, tracked in BACKLOG.md)**:
- INSERT policy (`Authenticated users can upload chat attachments`)
  still lacks a tenant/path check — should be tightened to the caller's
  own `{userId}/` prefix.
- `uploadChatAttachments` still stores the public-URL *form* in
  `message.context_meta.attachments[].url`; the edge function's parser
  handles both that form and a plain `path` field, so switching writes
  to `path` is cleanup, not a blocker. Historical public-URL copies
  outside the app are dead as of 2026-08-06 (accepted).

### Other buckets (not security-critical at this time)

- `avatars` (public): user-id-scoped path, OK for the use case
- `company-logos` (public): logos are intentionally public
- `feedback-screenshots`: internal-only feedback feature
