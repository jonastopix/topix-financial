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

### `get_event_non_responders(p_event_id uuid) → TABLE (user_id uuid)`
- Active members (the `get_member_directory` verdict: `company_members`, not advisor, not legat, `is_membership_active`) WITHOUT an active `event_registrations` row for the event — both `attending` and `declined` count as answers and exclude
- Returns ONLY `user_id` — no profile data; consumer is cron reminders (event-reminders window A), never display
- STABLE, SECURITY DEFINER with `search_path = public`
- Grants: `EXECUTE TO authenticated` AND `TO service_role` — service_role does not inherit authenticated grants (learned 2026-08-10: `get_member_directory` cannot be called from cron); `REVOKE ALL FROM PUBLIC` and `FROM anon`
- Introduced in migration `20260810210000_event_svar.sql`

### `har_aktivt_medlemskab(_user_id uuid) → boolean`
- **Fail-closed** community access verdict (dated note 2026-08-11): true ONLY
  when the user belongs to at least one non-legat company with a SET and
  FUTURE `contract_end_date`. Deliberately excludes self-serve subscribers
  (subscription fields are NOT evaluated — the 299 kr./md. subscription
  covers tal/budget/handouts/tasks, not community), legat companies, and
  NULL end dates. This is the opposite polarity of `is_membership_active`
  (fail-open, built for the member directory) — do not swap them.
- Uses `EXISTS` over ALL of the user's companies — `user_company_id` is
  deliberately avoided (LIMIT 1 without ORDER BY picks arbitrarily for
  multi-company users)
- STABLE, SECURITY DEFINER with `search_path = public`
- Grants: `EXECUTE TO authenticated` only — `REVOKE ALL FROM PUBLIC` and `FROM anon`
- Consumed by the eight member policies on `community_traade`,
  `community_svar`, `community_reaktioner`, `community_visninger`
  (advisor policies unchanged, gated by `has_role`)
- Introduced in migration `20260811160000_community_adgang.sql`

### `har_aktivt_abonnement(_user_id uuid) → boolean`
- **Fail-closed** exit-subscription verdict (dated note 2026-08-13): true
  ONLY when the user belongs to at least one non-legat company with
  `subscription_status = 'active'` AND a SET and FUTURE
  `subscription_current_period_end`. Deliberately does NOT evaluate
  `contract_end_date` — a subscriber has precisely an EXPIRED contract
  date.
- Uses `EXISTS` over ALL of the user's companies — `user_company_id` is
  deliberately avoided (LIMIT 1 without ORDER BY picks arbitrarily for
  multi-company users)
- STABLE, SECURITY DEFINER with `search_path = public`
- Grants: `EXECUTE TO authenticated` only — `REVOKE ALL FROM PUBLIC` and `FROM anon`
- Consumed by the three member SELECT policies on `content_items`,
  `content_collections` and `content_item_attachments`: full members
  (`har_aktivt_medlemskab`) see all published content, subscribers see
  ONLY `area = 'talks'` — a whitelist, so new areas are hidden until
  deliberately opened (advisor and service-role policies unchanged,
  gated by `has_role`/`service_role`)
- **Deliberate break (2026-08-13)**: `har_aktivt_medlemskab` and
  `har_aktivt_abonnement` deliberately have separate input bases — the
  contract date versus the subscription fields. The date decides full
  membership; the subscription decides exit access. They answer each
  their own question and must never be consolidated.
- Introduced in migration `20260813100000_abonnent_gate_indhold.sql`

### `maa_se_community_billede(_user_id uuid, _sti text) → boolean`
- **Fail-closed** access verdict for signing community images — the edge
  function's gate BEFORE service-role `createSignedUrl` against the private
  `community-billeder` bucket, NOT an RLS policy (the bucket has no SELECT
  policy; service-role bypasses RLS, so this function IS the read gate)
- False on NULL/empty path, false without community access
  (`har_aktivt_medlemskab` OR advisor via `has_role`), true ONLY when the
  path appears as an image node (`attrs.path`) in `indhold_json` on an
  ACTIVE thread or ACTIVE reply — hiding content revokes image access
- jsonpath `'$.**'` is EXISTS-only here: multi-level duplicate matches (the
  `20260811200000` text-derivation trap) are harmless for existence checks
- STABLE, SECURITY DEFINER with `search_path = public`
- Grants: `EXECUTE TO authenticated` AND `TO service_role` — service_role
  does not inherit authenticated grants (learned 2026-08-10 with
  `get_member_directory`); `REVOKE ALL FROM PUBLIC` and `FROM anon`
- Introduced in migration `20260812110000_community_billed_adgangsdom.sql`

### `maa_se_community_fil(_user_id uuid, _sti text) → boolean`
- **Fail-closed** access verdict for signing community file attachments —
  the edge function's gate BEFORE service-role `createSignedUrl` against
  the private `community-filer` bucket, NOT an RLS policy (no SELECT
  policy on the bucket; this function IS the read gate)
- Same shape as `maa_se_community_billede` but matches nodes with
  `type = "fil"` (Danish, our own node type — not a Tiptap standard node)
  instead of `type = "image"`; the two buckets/node types cannot share a
  verdict function
- False on NULL/empty path, false without community access
  (`har_aktivt_medlemskab` OR advisor via `has_role`), true ONLY when the
  path appears as a fil node (`attrs.path`) in `indhold_json` on an
  ACTIVE thread or ACTIVE reply — hiding content revokes file access
- jsonpath `'$.**?(...)'` written without whitespace between wildcard and
  filter (the unambiguous form); multi-level duplicate matches are
  harmless under EXISTS
- STABLE, SECURITY DEFINER with `search_path = public`
- Grants: `EXECUTE TO authenticated` AND `TO service_role` — service_role
  does not inherit authenticated grants (learned 2026-08-10 with
  `get_member_directory`); `REVOKE ALL FROM PUBLIC` and `FROM anon`
- Introduced in migration `20260812140000_community_fil_adgangsdom.sql`

### `get_community_medlemmer() → TABLE (user_id, navn, avatar_url, virksomhed)`
- Lookup list behind @-mentions in community: all users where
  `har_aktivt_medlemskab(user_id)` is true PLUS all advisors — exactly
  the set that can see community itself
- **Polarity note — do NOT confuse with `get_member_directory`**: the
  directory uses fail-open `is_membership_active` (built for the member
  directory surface); this function uses the fail-closed community
  verdict, so the picker can never show someone who cannot open the post
  they are mentioned in
- Fail-closed access check FIRST in body (har_aktivt_medlemskab OR
  advisor) — empty result, not error (get_community_feed rationale)
- Caller is deliberately INCLUDED (self-filtering belongs in the client);
  company name picked deterministically (oldest membership, id
  tie-break) — `user_company_id` deliberately avoided (LIMIT 1 without
  ORDER BY); duplicate-free by construction (source is `profiles`, PK
  user_id); ORDER BY navn
- STABLE, SECURITY DEFINER with `search_path = public`
- Grants: `EXECUTE TO authenticated` only — `REVOKE ALL FROM PUBLIC` and
  `FROM anon`
- Introduced in migration `20260812150000_community_naevnelse_rpc.sql`

### Member-visibility RPCs: `get_member_profile(p_user_id uuid)`, `get_event_participants(p_event_id uuid)`, `get_member_directory()`
- All three: STABLE, SECURITY DEFINER with `search_path = public`
- Grants: `EXECUTE TO authenticated` only — `REVOKE ALL FROM PUBLIC` and `FROM anon`
- Fixed shared column set (as of migration `20260810200000_profil_struktur.sql`): `user_id, full_name, avatar_url, company_name, industry_label, company_description, website, linkedin_url, expertise, ask_me_about, working_on, working_on_updated_at, member_since, is_advisor`
- **NEVER expose** `email`, `notification_email_prefs`, `registered_at` or `cancelled_at`
- Field changes (migration `20260810200000`): `member_profiles.bio` is REMOVED, replaced by `ask_me_about` + `working_on` (+ `working_on_updated_at` freshness stamp); `companies.description` is a new shared field. All are deliberately shared content — the NEVER-expose list is unchanged.
- The return type changed in `20260810200000`, so all three RPCs were DROPped and re-created (Postgres rejects CREATE OR REPLACE on return-type changes) — grants were re-applied explicitly in the same migration (`REVOKE FROM PUBLIC/anon`, `EXECUTE TO authenticated`).
- `get_event_participants`: active registrations only (`cancelled_at IS NULL`) AND `response = 'attending'` (migration `20260810210000_event_svar.sql`) — the list shows who is coming, never who is not, neither as name nor count. `event_registrations.response` (`attending | declined`) is independent of `cancelled_at`: a decline is an active answer, a cancellation withdraws the answer
- `get_member_directory`: UNION of company members (`is_advisor = false`) and advisors/admins from `user_roles` (company columns NULL, sorted last) — advisors have no `company_members` row
- **Active-membership gate** (migration `20260810150000_directory_aktive_medlemmer.sql`): `get_member_directory` (member branch only — advisors have no company) and `get_event_participants` include only rows where `is_membership_active(user_company_id(user_id))` is true. `get_member_profile` deliberately does NOT gate: a profile must remain resolvable by direct lookup, e.g. from a historical participant list.
- **Legat gate** (migration `20260810180000_directory_legat_filter.sql`): the same two RPCs also exclude legat users — mirrors useAuth's `isLegat` condition verbatim (`legat_enrollments` row with `status IN ('active','completed')`, non-advisors only; advisors are explicitly exempt in the participants predicate). Legat users have their own environment (`/legat`) and do not belong in the member network. `get_member_profile` again deliberately does NOT gate.
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

**Addendum (2026-08-31, session_prep-carve-out på messages)**:
medlems-SELECT-politikken "Members can view own messages" er strammet
med `context_type IS DISTINCT FROM 'session_prep'` foran
company/member-joinet, migration `20260831131200_session_prep_rls.sql`
(ALTER POLICY — bevidst ingen DROP + CREATE, så der aldrig findes et
vindue uden medlems-SELECT). Formål: rådgiverens session-forberedelse
("Founderen ser IKKE denne forberedelse", run-company-agents prompts)
var kun skjult af ét klient-filter (CompanyChatPane) — rækkerne blev
hentet ned i medlemmets browser og skjult i renderingen. Målt 31/8 som
medlemmet selv (transaktion, rullet tilbage): 18 af 44 beskeder i en
samtale var rådgiver-interne og hentbare; efter politikken 0.
Rådgiverens permissive SELECT ("Advisors can view all messages",
`has_role`) er urørt — rådgivere ser dem fortsat, også i "Se som
medlem", hvor klient-filteret består som bælte og seler (isAdvisor er
UI-tilstand; JWT'en er stadig rådgiverens). postgres_changes-realtime
respekterer RLS, så medlemmet modtager heller ikke INSERTs. Kørt
manuelt i Lovable SQL editor 2026-08-31 13:12 UTC; migrationen i
repoet er paritets-bogføring og skal ikke køres igen.

**Addendum (2026-08-31, SELECT-politik på message_reactions genskabt)**:
`message_reactions` stod med RLS slået til, INSERT- og DELETE-politikker
— og INGEN SELECT. Skrivningen virkede, visningen var død (53 reaktioner
sat 18/3–20/7 af folk der aldrig så resultatet). Rodårsag: den
oprindelige SELECT-politik (migration `20260317140729`) refererede
`group_messages` og `user_can_access_group_conversation`, og koncern-
oprydningens `DROP ... CASCADE` (migration `20260805224500`) tog
politikken med sig STILLE — der findes intet DROP POLICY i historikken.
Ny politik "Users can view reactions on visible messages" (migration
`20260831162500_reaktioner_select_rls.sql`, kørt manuelt i Lovable
2026-08-31, paritets-bogføring): reaktioner er synlige præcis når
beskeden er det — EXISTS mod `messages`, så messages-RLS'ens dom
(company-scope, has_role, session_prep-carve-out) arves frem for at
gentages. Verificeret som medlem: egne 3 reaktioner synlige, ikke de
øvrige 50. **Lærdom (fejlklasse)**: CASCADE-drops fjerner afhængige
politikker uden spor i migrations-historikken — gennemgang 31/8 af alle
overlevende tabellers politikker med koncern-referencer fandt kun denne
ene ramt (pulse_checkins' gruppe-politik var eksplicit erstattet).
Fremtidige CASCADE-drops skal efterfølges af `pg_policies`-diff i prod.

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

### Opgave-modellens skrivevej (`company_actions`)

Ændret 2026-08-22, migration `20260822224100_opgave_model_rls.sql` (PR #385).

**Politikker efter ændringen (tre i alt)**:

| cmd | policy | clause |
|---|---|---|
| ALL | `Service role can manage company actions` | `auth.role() = 'service_role'` |
| SELECT | `Advisors can view all company actions` | `has_role(auth.uid(), 'advisor')` |
| SELECT | `Members can view own company actions` | `company_id = user_company_id(auth.uid())` |

**Deliberate break (2026-08-22)**: INSERT og UPDATE er fjernet for både
authenticated medlemmer og rådgivere. Det er med vilje. Tabellen bærer
opgave-modellen, hvor tilstandsovergange styres af
`src/lib/opgaveEngine.ts`. Motoren kører i browseren og kan omgås; RLS
kan ikke udtrykke regler som "deferral_count må kun stige med én" uden
at duplikere logikken i SQL. Derfor sker al skrivning gennem edge
functions med service role, så motoren er den ene sandhed (beslutning A,
`docs/opgave-model-design.md`).

Før ændringen havde medlemmets UPDATE-politik ingen `with_check` og
faldt tilbage på `qual`. Et medlem kunne dermed sætte `deferral_count`
til nul, flytte `expires_at` eller markere en opgave som gjort uden at
have gjort den.

**Konsekvens hvis nogen tilføjer INSERT eller UPDATE tilbage**:
forpligtelses- og udløbsreglerne (B1, B2, B7, B8, B10, B11) kan omgås
fra klienten. Tilføj dem aldrig uden først at flytte reglerne med.

**Skrivevejen (tilføjet 2026-08-24)**: tre Bucket A-functions med
`verify_jwt = true` — `opgave-accepter`, `opgave-udskyd`, `opgave-luk`.
Alle følger notify-community-svar-formen: `authenticateUser` → opslag
med kalderens klient (RLS gater company-medlemskab) → eksplicit
ejerskabs-tjek `user_id = callerId` (RLS'ens SELECT er company-scoped,
men B1/§7 gør `user_id` til ejeren — kun ejeren må forpligte, udskyde
eller lukke) → motoren dømmer overgangen → service-role UPDATE af
præcis de felter motoren ændrede, med optimistisk lås på status (og
`deferral_count` for udskydelse). Tilstandsmaskinen er spejlet i
`supabase/functions/_shared/opgaveEngine.ts` (edge kan ikke importere
fra `src/`); paritet håndhæves af
`src/lib/__tests__/opgaveEngineSpejl.paritet.test.ts`. `expired` er
ikke et klient-udfald — det hører til den kommende udløbs-cron (B8).

**Verifikation**: `pg_policies`-udtræk 2026-08-22 22:41 bekræfter tre
politikker tilbage. Ingen levende flade skrev til tabellen på
ændringstidspunktet (`docs/opgave-model-kortlaegning.md` §2), og begge
skrivende edge functions bruger `SUPABASE_SERVICE_ROLE_KEY`.

### Service-role-only tables (no client INSERT/UPDATE/DELETE)
- `slack_conversation_threads`
- `slack_notification_log`
- `slack_handout_notification_log`
- `slack_report_notification_log`
- `company_actions` — afviger fra de øvrige: klienter HAR SELECT
  (medlem company-scoped, rådgiver bredt); kun skrivning er
  service-role-only, se afsnittet ovenfor
- `agent_runs` — kørselslog for run-company-agent inkl. ræsonnement og
  tør-kørsels-forslag (migration `20260825120000_agent_runs.sql`,
  `docs/agent-forslag-design.md` §4.2). Afviger som company_actions:
  rådgivere HAR SELECT (`has_role(auth.uid(), 'advisor')`); kun skrivning
  er service-role-only (edge-funktionen). BEVIDST ingen medlems-policies:
  reasoning-kolonnen bærer rå model-output over virksomhedens tal.
  Opbevaring (design §6.3, besluttet 2026-08-25, migration
  `20260825233000_agent_runs_opbevaring.sql`): pg_cron-jobbet
  `agent-runs-opbevaring` (ren SQL, 05:00 UTC dagligt) sætter reasoning
  til NULL efter 90 dage (kolonnen er derfor nullable — NULL betyder
  "fjernet ved opbevaring") og sletter rækker ældre end 12 måneder UDEN
  approved/rejected-forslag. Kørsler med en afgørelse bliver stående:
  agent_proposals.run_id er ON DELETE CASCADE, og afgørelsen er læringen.
  Jobbet kører som tabelejer (postgres) og er ikke RLS-gated — det er
  forventet for cron, ikke et hul.
- `agent_proposals` — ét agent-forslag pr. række til godkendelseslaget
  (migration `20260825200000_agent_proposals.sql`,
  `docs/agent-forslag-design.md` §7). Samme form som agent_runs:
  rådgiver-SELECT via `has_role`, service-role ALL, INGEN
  klient-skrivepolicies — heller ikke for rådgivere: afgørelser
  (approved/rejected) er tilstandsovergange og skal dømmes i en kommende
  Bucket A-edge function, ikke i klient-RLS. CHECK-constraints:
  `forkast_kraever_grund` (rejected kræver ikke-tom decision_reason),
  `forkast_kraever_kategori` (rejected kræver decision_category — stabile
  slugs fra `agent_proposals_decision_category_valid`-CHECK'en:
  ikke_relevant/forkert_tolkning/allerede_talt_om/forkert_timing/andet;
  visningstekst hører til fladen — en grund der ikke kan tælles er ikke
  læring; migration `20260825230000`) og `afgjort_kraever_afgoerer`
  (afgørelse kræver decided_by + decided_at).
  ON DELETE CASCADE fra både agent_runs og companies.

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
- `agent-forslag-afgoer` — Bucket A m. `verify_jwt = true` i config.toml
  (PR #267-mønstret) + advisor gate (`has_role` via callerClient) FØR
  service-role-konstruktion; target-ressourcen (agent_proposals +
  agent_runs) læses med kalderens klient (RLS advisor-SELECT). Afgørelsens
  rækkefølge er bindende: skrivningen (delt vej,
  `_shared/agentSkriveveje.ts`) udføres FØR status sættes — fejlet
  skrivning efterlader 'proposed'. decided_by er altid kalderens
  auth.uid(), aldrig request-body. Optimistisk lås på status='proposed'.

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
