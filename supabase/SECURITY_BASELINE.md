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
- Known callers (målt med grep 13/9, efter /members blev slettet): `src/components/hjemmebane/virksomheder/VirksomhedslisteView.tsx`, `src/hooks/useVirksomhed.ts`, `src/components/AdvisorDashboard.tsx` — alle advisor-flader
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
- **2/10-2026 (migration `20261002242000`, IKKE KØRT, kræver grønt lys):** the two
  member SELECT policies (`community_traade`, `community_svar`) and the read RPCs
  move to `kan_laese_community` (below). All write policies and write RPCs stay
  on this function — it is the WRITE verdict for community from then on.

### `kan_laese_community(_user_id uuid) → boolean` (2/10-2026, migration `20261002242000_community_gaest_laeser.sql`, IKKE KØRT — KRÆVER GRØNT LYS)
- **READ-only community verdict** (Jonas 14/9: «En gæst ser Community, men skriver
  ikke»): `har_aktivt_medlemskab(uid) OR EXISTS` membership in a company with
  `vis_i_netvaerk = false AND is_legat = false AND contract_end_date IS NULL AND
  is_demo IS DISTINCT FROM true AND data_slettet_at IS NULL` (the guest; demo and
  deleted companies excluded — council finding 2/10; `er_kunde` deliberately not read,
  it is a counting marker, never an access verdict). Narrow by design: an EXPIRED company with the flag is not a guest; a
  company without end date and without the flag is not a guest.
- STABLE, SECURITY DEFINER, `search_path = public`; `REVOKE ALL FROM PUBLIC, anon`;
  `GRANT EXECUTE TO authenticated, service_role`.
- Consumed ONLY by: policies «Members can view active threads» / «Members can view
  active replies» (DROP + CREATE same name/command/role/shape — only the verdict
  changes; PERMISSIVE grants of a yes, nothing to deny, §5) and the gates of
  `get_community_feed`, `get_community_traad`, `get_community_svar`,
  `maa_se_community_billede`, `maa_se_community_fil` (bodies otherwise identical to
  their latest migration — source guard `communityGaest.guard` dom 3).
- NOT consumed by: any INSERT/UPDATE/DELETE policy, `community_reaktioner`,
  `community_visninger`, `registrer_community_visning`, `get_community_medlemmer`
  (also the recipient list for the post mail), storage upload/delete. Truth table
  and FØR/EFTER-SQL: `docs/adgangsdomme.md` §7 and the migration header.

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

### `marker_community_spoergsmaal(p_traad_id uuid, p_markeret boolean) → void` (rådgivernes «Spørgsmål» 2/10-2026, migration `20261002243000` — IKKE KØRT, KRÆVER JONAS' GRØNNE LYS)
- Advisor gate FIRST (`has_role(auth.uid(), 'advisor')`, RAISE otherwise), before any
  UPDATE — `skjul_community_traad` shape; a service account (`public.tjenestekonti`)
  is refused right after the gate
- Then `pg_advisory_xact_lock(hashtext('community_spoergsmaal'))` (rådets fund 2/10):
  two concurrent markings run one after the other, so the second clears the first's
  row — no 23505 from the partial unique index reaches the user
- Only an `aktiv` thread; only a thread whose AUTHOR is an advisor (a member's post
  never becomes «Spørgsmål fra rådgiverne»); row locked `FOR UPDATE`
- `true` = clear every other marking, then set `now()` on this one (clear BEFORE set,
  so the partial unique index is never hit); `false` = clear this one. Touches neither
  `status`, `fastgjort` nor `updated_at`
- VOLATILE, SECURITY DEFINER with `search_path = public`; grants: `EXECUTE TO
  authenticated` only — `REVOKE ALL FROM PUBLIC` and `FROM anon`
- Measured on a local Postgres 16 stub (not prod): member RPC → RAISE; member direct
  UPDATE/INSERT of the column → RAISE (trigger); advisor on a member's post → RAISE;
  second direct marking → unique_violation; new marking replaces the old

### `get_community_feed(p_limit, p_offset)` / `get_community_traad(p_traad_id)` — three columns appended (same migration, DROP + CREATE)
- RETURNS TABLE gains `spoergsmaal_markeret_at timestamptz`, `jeg_har_svaret boolean`
  (caller has an ACTIVE reply in the thread) and `antal_svarere bigint` (distinct
  authors of ACTIVE replies, thread author excluded) LAST; the feed orders
  `(spoergsmaal_markeret_at IS NOT NULL AND status = 'aktiv') DESC` before the
  canonical sort (a hidden marked thread is not on top for advisors)
- Changing RETURNS TABLE requires DROP, which drops grants → REVOKE/GRANT repeated
  (20260812090000 form); access check, status rule and everything else are
  `20261002242000` (the guest read verdict: gate `kan_laese_community`, not
  `har_aktivt_medlemskab`) verbatim — until that branch is merged the guard compares
  with a verbatim fixture of its two read RPCs
  (`src/lib/__fixtures__/community_gaest_laeser_20261002242000_laese_rpc.sql`), and
  once the file exists the fixture must equal it block for block — the source guard `communitySpoergsmaal.guard` strips the
  `-- SPOERGSMAAL` lines and requires the rest to match word for word, with ONE declared
  exception: the feed body's two comment lines «Nøjagtig den kanoniske sortering …»
  (no longer true) are replaced by marker lines (`ERSTATTEDE_KOMMENTARLINJER`). Before running:
  `20261002242000` must be RUN, and `pg_get_functiondef` in prod must equal
  `20261002242000` (gate `kan_laese_community`), otherwise STOP
- `get_community_svar` untouched

### `community_mest_laest_uge() → TABLE (traad_id uuid, laesere bigint)` (Community «Mest læst denne uge» 2/10-2026, migration `20261002275000` — IKKE KØRT, KRÆVER JONAS' GRØNNE LYS)
- Why DEFINER: `community_visninger` is self-only SELECT for members (RLS), so a member
  cannot count other people's views. The function returns ONLY aggregates (a count per
  thread — the same kind of number as `antal_visninger`, which the feed already shows);
  never a user id
- Gate FIRST (before `RETURN QUERY`): `auth.uid() IS NOT NULL AND
  (kan_laese_community(auth.uid()) OR has_role(auth.uid(), 'advisor'))` — otherwise an
  empty result, not an error (get_community_feed shape). SQL editor/service role:
  `auth.uid()` NULL → empty
- Counts DISTINCT `bruger_id` with `set_at >= mandag 00:00 Europe/Copenhagen` of the
  current ISO week (`date_trunc('week', now() AT TIME ZONE 'Europe/Copenhagen') AT TIME
  ZONE 'Europe/Copenhagen'`), only threads with `status = 'aktiv'`, the thread's author
  and service accounts (`public.tjenestekonti`) excluded; at most 20 rows, most first.
  `set_at` is the FIRST view (`registrer_community_visning` inserts `ON CONFLICT DO
  NOTHING`), so «readers this week» = first-time readers this week
- plpgsql, STABLE, SECURITY DEFINER with `search_path = public, pg_temp`; no writes, no
  other DDL; `REVOKE ALL FROM PUBLIC` and `FROM anon`; `GRANT EXECUTE TO authenticated,
  service_role`. Client: `communityApi.hentMestLaestUge` (fail-soft on 42883/PGRST202)
  + pure `communityMestLaest.vaelgMestLaest` (threshold 3, a tie = no badge). Source
  guard `communityMestLaest.guard`. Not exercised in a real Postgres in the draft — the
  header carries FØR/EFTER SQL (one result set) and a transaction-and-rollback probe;
  rollback = `DROP FUNCTION IF EXISTS public.community_mest_laest_uge();`

### Cron-vagten: `vagt_cron()`, `get_cron_vagt()`, table `cron_vagt_log` (migration `20260909234500_cron_vagten.sql`)
- Background (9/9): `vault.secrets` was emptied (~06:52, Lovable's mail update); all nine cron jobs sent `Bearer ` with no key and got 401 for ~17 hours while `cron.job_run_details` said "succeeded" (that only means `net.http_post` was enqueued). Nobody noticed until 23:39.
- `vagt_cron()`: SECURITY DEFINER, `search_path = public`, run hourly by pg_cron (`vagt-cron`, `7 * * * *`) as `postgres`. **Pure SQL — no `net.http_post`, no decryption of any secret** (it only `count(*)`s `vault.secrets` by name), so it works precisely when everything else is down. Reads `vault.secrets`, `net._http_response`, `cron.job_run_details`, `cron.job`, `notifications`; writes `cron_vagt_log` and, when red, one `advisor_notifications` row per advisor (`type = 'drift'`, deduped on unread same title within 24 h). EXECUTE revoked from PUBLIC, anon and authenticated — only the cron runner calls it.
- `get_cron_vagt()`: STABLE SECURITY DEFINER, advisor-only via `has_role` in WHERE (nul rows otherwise), `GRANT EXECUTE TO authenticated`; returns the last 24 h of `cron_vagt_log`. Read by the advisor front page ("Driften: …").
- `cron_vagt_log`: RLS enabled; SELECT for advisors only; no client write policies (only the function writes).
- Rules and thresholds are documented in the migration header; the paused-queue case is yellow, not red, by decision 9/9.
- Five versions 9–10/9 (`20260910100000` alias, `20260910120000` join + PK-only read of `cron.job_run_details`, `20260910130000` `array_append`, `20260910140000` messenger): `advisor_notifications.company_id` is now **nullable** — a drift message is not about a company (previously `NOT NULL` since `20260226070216`; every other writer still sets it). The notification insert runs in its own EXCEPTION block so a messenger failure never rolls back the log row.
- **Driftsagentens læser `drift_agent_laes()`** (udkast 30/9-2026, `20260930151000_driftsagent_rettigheder.sql` — **a NEW SECURITY DEFINER, requires Jonas' explicit go-ahead before it is run; not run**): takes the vagt's road to `cron`/`net` (definer owned by `postgres`) instead of granting `service_role` USAGE on schema `cron` (which, with pg_cron's functions' EXECUTE possibly left to PUBLIC — unmeasured — would let `service_role` call `cron.schedule`/`cron.unschedule`). `ALTER FUNCTION … SECURITY DEFINER` + `SET search_path = public, pg_temp`; no parameters; STABLE; SELECT-only (no INSERT/UPDATE/DELETE, `kald_edge`, `net.http_post`, `cron.schedule` — `driftDom.guard` dom 3); dynamic SQL only over a constant list of spor tables; never returns `cron.job.command` or a response body (only `drift_agent_kerne`'s numbers/booleans). EXECUTE revoked from PUBLIC, anon and authenticated; granted to `service_role` only. The header's FØR/EFTER SQL measures owner, `prosecdef`, `proconfig`, EXECUTE per role and `has_schema_privilege('service_role','cron','USAGE')` / `has_function_privilege('service_role','cron.schedule(text,text,text)'|'cron.unschedule(text)','EXECUTE')` — the cron/net lines must be unchanged. Rollback: back to SECURITY INVOKER.
- Ninth version 16/9 (`20260916170000_vagtens_samlemail.sql`, explicit go-ahead from Jonas 16/9 — SECURITY DEFINER functions are on the CLAUDE.md FORBIDDEN list): the samlemail types (`event_published`, `community_opslag`, mirrored from `_shared/samlemail.ts`) are kept out of `usendte_30m` and only count as overdue once the latest samlemail window (17:00 Copenhagen, open ≥ 30 min) opened after the row was ready; waiting rows are reported in `tal.samlemail_venter`. Header, grants (revoked from PUBLIC/anon/authenticated) and everything else unchanged — enforced by `src/lib/__tests__/vagtSamlemail.guard.test.ts`, which strips the marked `-- NIENDE` lines and requires the remaining body to equal the eighth version byte for byte, and requires the type list and hour to match `samlemail.ts`.

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
- **Fact line** (migration `20260909150000_profilen_forfra.sql`): all three RPCs gained two trailing columns, `city` (`companies.city`) and `stiftet_aar` (`EXTRACT(year FROM companies.start_date)`, the CVR founding date) — public register data, NULL on the advisor branch. Return type changed → DROP + CREATE again, grants re-applied. Deliberately NOT exposed: `annual_revenue`, `revenue_interval`, any `financial_report_facts` — "no numbers between members that they did not choose to write themselves" (Jonas 9/9). Same migration re-labels the shared text fields (`companies.description` = «Det laver vi», `ask_me_about` = «Det har jeg været igennem», `working_on` = «Det leder jeg efter») and NULLs `working_on` (meaning change; 0 of 25 members had a row 9/9). `companies.description` is now written by the member through the existing `Members can update own company` policy — no policy change.
- Introduced in migration `20260810120000_member_profiles.sql`; rationale under `member_profiles` in section 5

### Payment-link lookups: `hent_betalingstilbud(betalingstoken uuid) → json`, `hent_betalingsdata_til_checkout(betalingstoken uuid) → json`
- Both: `language sql`, STABLE, SECURITY DEFINER with `search_path = public`; the
  token is the ARGUMENT, never a filter (`WHERE bl.token = betalingstoken LIMIT 1`)
  — RLS is row-level and cannot see the URL, so a "lookup by token" policy would
  expose every row (migration `20260902090000_hent_betalingstilbud.sql`). Table
  `company_betalingslink` has advisor FOR ALL and service_role FOR ALL only; no
  anon/member policy — the token is a bearer credential and lives in a table the
  client can never read (`20260902080000_betalingslink.sql`).
- `hent_betalingstilbud`: callable by **anon** (the visitor has no account yet),
  authenticated and service_role — `REVOKE ALL FROM PUBLIC` then explicit
  `GRANT EXECUTE` to the three. Returns `status`, `virksomhed`,
  `prisniveau_oere`, `frist`, `dage_tilbage` and, since migration
  `20260916150000_betal_efter_fristen.sql` (Jonas 16/9: «Vi skal bygge det
  bedste»), `faktura_sendt_den` (`faktura_sendt_at::date::text`, NULL until the
  day-31 invoice has actually been sent) and `faktura_url` (Stripe's
  `hosted_invoice_url`, NULL until sent). The invoice link is itself a bearer
  URL that Stripe mails to the same `contact_email` the token went to — same
  audience, same action (pay). **NEVER expose** `contact_email`, `cvr_number`,
  `company_id`, `company_fornyelse` decisions or anything not listed. «betalt»
  is judged on `contract_end_date + 1 > now()` (the door, `20260911050000`);
  `src/lib/__tests__/doeren.guard.test.ts` locks that file and
  `betalEfterFristen.guard.test.ts` locks the newer one (the last file run wins).
- `hent_betalingsdata_til_checkout`: **service_role only** (`REVOKE` from
  PUBLIC, anon and authenticated). Returns `company_id`, `virksomhed`,
  `kontakt_email`, `prisniveau_oere` — and only while payment is allowed
  (not paid, price set, mail sent, within the 30-day window, contact email
  present). Kept separate precisely so the anon-callable function never has a
  reason to carry the mail or the company id. Unchanged by `20260916150000`.
- Column `company_betalingslink.faktura_url` (added `20260916150000`) is written
  ONLY by `_shared/indgangsFaktura.ts` (`stemplFaktura`) in the same UPDATE as
  `faktura_invoice_id`/`faktura_sendt_at`, after Stripe has finalized and sent
  the invoice. The client shows it only as an `https://` link in a new window
  (`src/lib/betalEfterFristen.ts` rejects anything else).

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

### `protect_aftale_immutable_fields()` on `aftale_underskrift BEFORE UPDATE` (udkast 18/9-2026, migration `20260918290000`)
- Always locked: `token`, `ansoegning_id`, `company_id`, `skabelon_id`, `dokument_titel`, `dokument_tekst`, `dokument_aftryk`, `prisniveau_oere`, `modtager_email`, `modtager_navn`, `sendt_at`, `sendt_af`, `created_at`
- After `status = 'underskrevet'`: `status`, `underskrevet_at`, `underskrevet_navn`, `underskrevet_ip`, `underskrevet_user_agent` locked; `pdf_sti`, `pdf_aftryk`, `kvittering_sendt_at` may only go NULL → value once (the two writes `aftale-underskrift` makes after signing)
- After `status = 'annulleret'`: `status` and `annulleret_*` locked. From `sendt`, `underskrevet_*`/`pdf_*` may only be set together with `status = 'underskrevet'`
- Why: the signed document must be evidence in the table, not only in the receipt mails and the PDF. Service role bypasses RLS — the trigger does not. Behaviour measured in WASM Postgres (draft `test/`), source guard `src/lib/__tests__/aftaleUforanderlig.guard.test.ts`

### `protect_aftale_spor()` on `aftale_spor BEFORE UPDATE OR DELETE`
- UPDATE always raises. DELETE raises when direct (`pg_trigger_depth() <= 1`); a cascade from deleting the `aftale_underskrift` row (personal-data deletion via `companies`/`ansoegninger` ON DELETE CASCADE) runs at depth 2 and is allowed
- The audit trail is append-only for everyone, including service role

---

### `protect_webinar_deling_spor()` on `webinar_deling_spor BEFORE UPDATE OR DELETE` (udkast webinar-deling 21/9-2026, migration `20260922020000`)

Mirror of `protect_aftale_spor` (same body, same rule): UPDATE always raises; DELETE raises only when direct (`pg_trigger_depth() <= 1` inside the trigger) — the cascade from `webinar_delinger` runs inside the RI trigger (depth 2) and passes, so a share and its trail can be deleted together (`oprettet_af` is `on delete restrict`). The trail (`webinar_deling_spor`) is append-only for every role including `service_role`. No SECURITY DEFINER; `search_path = public`. Not exercised in a real Postgres in the draft (no local/WASM Postgres) — the migration header carries the transaction-and-rollback probe; the SQL is locked by `webinarDeling.guard` dom 4.

### `companies_medlem_kolonnevaern()` on `companies BEFORE UPDATE` (udkast 29/9-2026, migration `20260930090000` — KØRT i prod 30/9-2026)
- Sikkerhedsanalysen 29/9 fund 1 (KRITISK): «Members can update own company» har ingen kolonnebegrænsning, så et medlem kunne selv sætte `contract_end_date`, `is_legat`, `*_session_used_at`, prisfelter, `stripe_customer_id`, `status` … Kolonne-GRANTs duer ikke (rådgivere deler rollen `authenticated`).
- Når kalderen er et medlem — `current_user` eller JWT-rollen er `authenticated`/`anon`, og `has_role(auth.uid(), 'advisor')` er falsk — afvises (42501) enhver ændret kolonne UDEN for hvidlisten: `name, cvr_number, contact_email, website, contact_phone, industry_code, industry_label, logo_url, weekly_focus_enabled, description, offboarding_requested_at, onboarding_completed` (målt i `src/` 29/9). Fail-closed: en ny kolonne er beskyttet, til nogen åbner den.
- Rådgivere/admin, `service_role` (edge functions) og `postgres` uden JWT (SQL editor, migrationer, pg_cron) passerer. SECURITY INVOKER, `search_path = public`; ingen eksisterende funktion eller companies-policy er rørt.
- Kildeværn: `src/lib/__tests__/companiesKolonnevaern.guard.test.ts` — hvidlisten ⊆ ikke-forbudte kolonner, hver medlemssti i `src/` skriver kun hvidlistede kolonner, hver fil der opdaterer companies er klassificeret (medlem/rådgiver), og hvidlisten åbner intet ubrugt. Bevis-kørslen (rullet tilbage) står i migrationens filhoved.
- 1/10-2026: `jonas_session_tilbudt_at` (migration `20261001110000`, rådgiverens «Session med Jonas · tilbudt») står IKKE på hvidlisten. Den er derfor beskyttet for medlemmer uden ændring i triggeren og står i værnets `FORBUDTE`.
- Åbent: `name` og `cvr_number` er medlemsskrivbare (Indstillinger) — analysens A4 (navnet i invitationsmailen) og CVR-genbrugskæden er ikke lukket af værnet.

### `protect_maaned_foerste_godkendelse()` on `maaned_foerste_godkendelse BEFORE UPDATE` (Boardroom Score 30/9-2026, migration `20260930130000`)

UPDATE always raises, for every role including `service_role` — the table is memory («when was this month FIRST approved»), and memory is never edited. DELETE has no client policy; the only DELETE is the cascade from `companies`. Not SECURITY DEFINER; `search_path = public`; EXECUTE revoked from PUBLIC/anon/authenticated.

### `husk_foerste_godkendelse()` on `financial_report_facts AFTER INSERT OR UPDATE OF data_basis` (same migration)

Writes one row per `(company_id, period_key)` into `maaned_foerste_godkendelse` with `now()` when a facts row BECOMES `measured` (INSERT, or UPDATE that flips `data_basis` to measured); `ON CONFLICT DO NOTHING` — the first stays. SECURITY DEFINER with `search_path = public` for the same reason as `cleanup_facts_on_report_delete`: every writer of facts (`commit_report_facts`, the annual/baseline edge functions with service role) must never have its INSERT rolled back by RLS on the memory table. It inserts into that one table only; EXECUTE revoked from PUBLIC/anon/authenticated (a trigger function cannot be called directly anyway). No existing SECURITY DEFINER function was changed. Proof of operation is a run, not the catalog — see `docs/boardroom-score.md` §4a for the FØR/EFTER query and the «replace a month, timestamp must not move» probe.

### `community_traade_spoergsmaal_vaern()` on `community_traade BEFORE INSERT OR UPDATE` (rådgivernes «Spørgsmål» 2/10-2026, migration `20261002243000` — IKKE KØRT, KRÆVER JONAS' GRØNNE LYS)

`spoergsmaal_markeret_at` can only be set (INSERT) or changed (UPDATE) by an advisor (`has_role(auth.uid(), 'advisor')`, admin inherits); everyone else gets RAISE. **Setting** it to a value additionally requires — the RPC's own rules, because advisors have UPDATE on ALL threads and a direct PostgREST PATCH must be judged the same (rådets fund 2/10) — that the caller is not a service account (`NOT EXISTS tjenestekonti`), the thread's author is an advisor, and `NEW.status = 'aktiv'`. **Hide/delete clears it:** an UPDATE leaving `NEW.status <> 'aktiv'` sets the column to NULL for any caller (a consequence of the status change, checked before the depth and role checks). A marked row updated in OTHER columns is not judged (the view counter writes the thread on a member's visit) — members have their own INSERT/UPDATE policies on the table (20260811160000), so without the trigger a member could mark their own post through PostgREST. `pg_trigger_depth() > 1` lets the counter triggers' indirect updates through, same shape as `protect_community_traad_immutable_fields`, which is deliberately NOT changed (FORBIDDEN list) — this is an additive trigger of its own. Not SECURITY DEFINER; `search_path = public`. `auth.uid()` is NULL in the SQL editor and for service role → `has_role` false → the column can only be set by a logged-in advisor (fail-closed on purpose). «At most one at a time» is the partial unique index `community_traade_et_spoergsmaal_uidx ON ((true)) WHERE spoergsmaal_markeret_at IS NOT NULL`.
### `opkald_raadgiver_kolonnevaern()` on `opkaldsanmodninger BEFORE UPDATE` (2/10-2026, migration `20261002270000`, IKKE KØRT)

A client (`authenticated`/`anon`, judged like `companies_medlem_kolonnevaern`) may change only `ringet_at` and `ringet_af`, and `ringet_af` must equal `auth.uid()`. service_role and postgres without a JWT pass. Undoing («fortryd», `ringet_at`/`ringet_af` → null) is DELIBERATELY open to any advisor — `OLD.ringet_af = auth.uid()` is not required (rådets fund 5, 2/10: advisors share all members, Jonas 1/10). See §5 «Må vi ringe til dig?».

## 4. Data Normalization Triggers

### `trg_normalize_invitation_email` on `company_invitations BEFORE INSERT`
- Lowercases and trims `email` field
- Ensures consistent matching during invitation acceptance

---

## 5. Key RLS Policy Patterns

**Corrected 2026-09-03:** policies on tables in the `public` schema are
**PERMISSIVE** — Postgres' default for `CREATE POLICY` — and OR-stack: a
row passes if ANY permissive policy for that command passes. The earlier
statement here («all policies … are RESTRICTIVE … stack with AND») was
wrong; measured 3/9 there were 0 restrictive policies out of 268 in
`public`. `storage.objects` policies are also PERMISSIVE — see section 9.

### Restrictive policies — the only way to DENY (added 2026-09-03)

A policy that is meant to **deny** something MUST be created `AS
RESTRICTIVE`. A restrictive policy is AND-ed with everything else: a row
must pass ALL restrictive policies AND at least one permissive policy.
Written as permissive, a «hide X from non-members» policy does the
opposite of its name: its first clause («`company_id <> demo`») is true
for every non-demo row, so it GRANTS access to all other companies' rows
instead of hiding the demo's.

**Rule to remember:** a policy whose name contains «hide», «skjul»,
«kun», «only», «non-members» or any other negation is WRONG if it is
permissive. Check `pg_policies.permissive` before trusting the name.

Measured 2026-09-03 22:46 as an ordinary member (one company): the four
demo policies were permissive, and the member could read 38 companies,
102 milestones, 314 `financial_report_facts` rows and 35 conversations —
everything, not the 1 / 0 / 0 / 1 they owned. Fixed in prod 22:48;
after: 1 / 0 / 0 / 1. Advisor access unchanged (38 / 102 / 314 / 35).
Migration `20260903230000_demo_policies_restrictive.sql` is the record.

**As of 2026-09-03 there are exactly FOUR restrictive policies in
`public`**, all `FOR SELECT TO authenticated`, all with the shape
`<not demo> OR <member of the company> OR has_role(auth.uid(), 'admin')`:

| table | policy |
|---|---|
| `companies` | «Hide demo company from non-members» (`is_demo = false OR …`) |
| `conversations` | «Hide demo conversations from non-members» |
| `financial_report_facts` | «Hide demo facts from non-members» |
| `milestones` | «Hide demo milestones from non-members» |

The demo company (`a0de0000-0000-4000-8000-000000000001`, `is_demo =
true`) did not exist in prod on 2026-09-03; the policies are kept so a
recreated demo company cannot leak. Note: an advisor WITHOUT admin
(Morten) would not see a demo company under these policies — that is the
policies' intent («from non-members», admin exempt), not a defect.

Verify: `select tablename, policyname, permissive from pg_policies where
schemaname = 'public' and permissive = 'RESTRICTIVE';` → the four rows
above, nothing else.

**Second example of the same failure class (found 2026-09-03 23:02):**
«Users can update own messages within 15 min» (migration
`20260317143551`) was added as a NEW permissive policy, but the older
«Members can update own messages» (`20260310193358:8`, no time limit,
`sender_id = auth.uid() AND EXISTS (conversation is mine)`) was never
dropped. Permissive policies OR-stack, so the loose one won: any user
could edit their own messages without a time limit and regardless of
`message_type`. «Within 15 min» was never enforced in the database —
only in the client (`useMessageActions.ts`, `canEditMessage`). Fixed in
prod 23:03 by dropping the old policy; migration
`20260903233000_messages_update_15min.sql` is the record. Two UPDATE
policies remain on `messages`: «Advisors can update messages» and
«Users can update own messages within 15 min».

**The rule, stated once:** a restriction can NOT be added as a new
permissive policy. It must either be `AS RESTRICTIVE`, or REPLACE the
looser policy (drop the old one in the same migration). A migration
that only adds a tighter permissive policy changes nothing.

Known, open, lower severity — found 2026-09-03, migrations WRITTEN
2026-09-10 (not yet run in prod; verify with each file's SELECT):

- **`messages` DELETE** had no time limit and two overlapping policies
  («Members can delete own messages» `20260310193358:29`, «Users can
  delete own messages» `20260317143551:28`, `sender_id OR advisor` — the
  broadest won). Decided 10/9: deletion gets the SAME rule as editing.
  `20260911020000_messages_delete_15min.sql` REPLACES both with «Users can
  delete own messages within 15 min» (`sender_id = auth.uid() AND
  message_type = 'user' AND created_at > now() - 15 min`) and «Advisors
  can delete messages» (`has_role advisor`). The client mirrors the rule
  in `src/lib/beskedRegler.ts` (`kanSletteBesked`). Expected after run:
  exactly 2 DELETE policies on `messages`.
- **storage «Authenticated users can upload feedback screenshots»** had
  `WITH CHECK` on `bucket_id` alone. `20260911030000_feedback_bucket_mappetjek.sql`
  REPLACES it with «Users can upload own feedback screenshots»
  (`bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[1]
  = auth.uid()::text`) and sets the bucket to 5 MB / `image/*` — the same
  limits the client enforces. Reads unchanged (owner-folder or advisor);
  still no UPDATE/DELETE policies on the bucket.

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

**Addendum (2026-09-29, sikkerhedsanalysen fund 6 og 7 — migration `20260930090000`, KØRT i prod 30/9-2026)**:
- **Fund 7:** «Members can insert own notifications» på `advisor_notifications` (WITH CHECK `member_id = auth.uid()` alene; `type`, `advisor_id`, `title`, `body` frie) droppes. Ingen klient brugte den (eneste klient-insert, `src/lib/advisorNotifications.ts`, havde ingen kaldere og er slettet); alle skrivere er edge functions med service role. `advisor_notifications` har derefter ingen klient-INSERT.
- **Fund 6 — ÅBENT:** «Users can insert own reports/milestones/kpi targets/benchmarks» tjekker stadig kun `user_id` (BACKLOG [P4] ovenfor). En WITH CHECK på `company_id = user_company_id(auth.uid())` er ikke skrevet, fordi `user_company_id` tager én vilkårlig række (LIMIT 1) og `company_members` ikke er unik på `user_id` — et medlem i to virksomheder ville miste skriveadgang. Migrationens FØR-SELECT sektion 5–6 måler antallet af brugere i flere virksomheder og eksisterende rækker uden for skribentens virksomhed; stramningen skrives, når tallene er læst.
  - **Forstærket for `milestones` (1/10-2026 aften, «Dine mål»-motoren, det tekniske råds fund 9):** hullet har nu to følger mere. (a) Målet står på den ANDEN virksomheds forside og i «Dine mål» (hentningen filtrerer på `company_id`, `src/hooks/dineMaalGrundlag.ts:hentMaalMedTal`). (b) Triggeren `milestones_hoejst_tre_aktive` tæller pr. `company_id` — tre fremmede aktive mål blokerer offerets egne («Du har allerede 3 aktive mål»). Desuden har «Users can update own milestones» og «Company members can update company milestones» INGEN WITH CHECK (Postgres bruger da USING), så et medlem kan også flytte sit eget mål til en fremmed `company_id` ved UPDATE.
  - **Forberedt, IKKE KØRT:** `supabase/migrations/20261002280000_milestones_with_check.sql` (første linje «-- IKKE KØRT. KRÆVER JONAS' GRØNNE LYS (RLS-stramning, SECURITY_BASELINE fund 6).»): `ALTER POLICY … WITH CHECK` på de fire medlemspolitikker for INSERT/UPDATE (`auth.uid() = user_id AND company_id = public.user_company_id(auth.uid())` for «Users …», `company_id = public.user_company_id(auth.uid())` for «Company members …»). Ingen DROP, USING røres ikke. Politiknavnene er KODELÆSTE (20260223155456:22–23, 20260224222456:192/196) og SKAL måles i `pg_policy` før kørsel (filens FØR-SQL sektion 1); sektion 2 (brugere i flere virksomheder) skal være 0, ellers STOP og vælg med Jonas (fx en `company_members`-baseret EXISTS). Tilbagerulningen står i filen. Kildeværnet `maalSkriv.guard` dom 2 tillader filen KUN i denne form. Reports/kpi targets/benchmarks er IKKE omfattet.

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
Applied to: `app_config` management, `user_roles` management,
`tjenestekonti` (FOR ALL, USING + WITH CHECK — migration
`20260930140000_tjenestekonti.sql`, 30/9-2026)

**`tjenestekonti` (30/9-2026)**: `user_id` (PK, FK auth.users ON DELETE
CASCADE), `formaal`, `oprettet_at`. RLS enabled. Two policies: "Admin
skriver tjenestekonti" (FOR ALL TO authenticated, admin predicate above)
and "Indloggede ser tjenestekonti" (FOR SELECT TO authenticated, USING
true) — every logged-in user may read WHICH user_ids are service accounts
(the client filters advisor lists from SECURITY DEFINER RPCs with it,
`src/lib/tjenestekonto.ts`); no other column is sensitive. No member or
advisor write path: a client cannot mark itself a service account (the
only effects of the mark are "no inactivity logout" and "not shown as a
person", and — 30/9 — "viewing writes no read marks"). Grants written out:
SELECT/INSERT/UPDATE/DELETE to authenticated (the policies decide rows and
who), anon: REVOKE ALL. Measure before the Update click with the migration's
EFTER-SELECT (efter_grant_authenticated = true, efter_grant_anon = false) —
a REST probe with the anon key cannot return 200 for this table. No
function, trigger or existing policy touched.

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
condition (approved 2026-08-05) — CLOSED 2026-10-02 (Akademiet F0)**: until
F0, `acknowledged_at` was SOURCE-LESS — no audit trail distinguished
member-set from advisor-set completion, and members saw advisor-set marks as
their own. Since migration `20261002260000_member_progress_markering.sql`
(NOT YET RUN at the time of writing) the advisor's mark lives in its own
columns `markeret_at`/`markeret_af`; the client (`adminContentApi.batchMarker`)
writes ONLY those, and `itemProgressState` (progressState.ts) treats a member
timestamp EQUAL to `markeret_at` as the advisor's stamp (the backfilled batch
rows from 5/8 and 12/8). Enforcement in the database: migration
`20261002261000_member_progress_markering_vaern.sql` adds the BEFORE INSERT OR
UPDATE trigger `member_progress_markering_vaern` (same shape as
`protect_weekly_focus_seen_only`): an authenticated user other than the row's
owner may not write `seen_at`, `acknowledged_at`, `skipped_at`,
`last_position_seconds`, `brugbar`, `brugbar_at` — except clearing
`acknowledged_at`/`seen_at` to NULL when they equal `OLD.markeret_at` (undoing
the advisor's own backfilled stamp). The owner may not set or change
`markeret_at`/`markeret_af`, and an advisor may not re-stamp a backfilled
batch row (stamp equal to `OLD.markeret_at`) without clearing that stamp in
the same write. `auth.uid() IS NULL` (service role, SQL
editor) passes. No policy changed, no SECURITY DEFINER. Source guard:
`src/lib/hjemmebane/__tests__/akademiF0.guard.test.ts`. Rows written by
advisors before 2/10 as single-row acknowledgements remain indistinguishable
from the member's own (documented ceiling, `docs/akademi-grundlag.md` §7–§8).

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
Applied to: `advisor_company_acknowledgments` (writes). Since 8/9-2026
(migration `20260908150000_luk_opgaven.sql`) the table is a LOG of closed
front-page tasks («Færdiggjort» / «Ikke relevant»): `udfald` and `grundlag`
(jsonb, reason-key → basis the judgement was built on). Rows from the earlier
snooze model (`snoozed_until`/`basis_at`, `udfald` NULL) are ignored by the
judgement (`src/lib/opgaveLukning.ts`). The UNIQUE (advisor_id, company_id)
constraint is dropped: one row per closing. Writes stay owner-scoped through
the FOR ALL policy above; a second, SELECT-only policy
`has_role(auth.uid(), 'advisor'::app_role)` lets every advisor READ every
row, because a closed task is the company's, not the advisor's. Members have
no access (no policy matches them). Contains no member PII, only `advisor_id`,
`company_id`, timestamps, the outcome and reason keys/period keys.

### Session bookings — advisor read (`session_bookings`)
```sql
has_role(auth.uid(), 'advisor'::app_role)
```
SELECT-only policy added 8/9-2026 (migration `20260908190000_session_tid.sql`)
next to the original owner-only SELECT (`auth.uid() = user_id`), admin SELECT
and service-role FOR ALL. Reason: the company page (`/virksomhed/:id`) shows
whether the free intro session is booked or held, and the advisor holding it
is not necessarily an admin. Advisors get no write access; writes stay with
service role (edge functions `create-stripe-checkout`, `stripe-webhook`,
`create-free-intro-booking`, `calendly-webhook`). Rows carry `user_id`,
`company_id`, Stripe ids, Calendly URIs and, from 8/9, `start_tid`/`slut_tid`
— no member PII beyond the ids.

`calendly-webhook` (Bucket C) verifies the HMAC signature against TWO signing
keys from 13/9-2026 — `CALENDLY_WEBHOOK_SIGNING_KEY` (Morten's subscription,
legacy name) and `CALENDLY_WEBHOOK_SIGNING_KEY_JONAS` (Jonas' subscription) —
one per Calendly subscription, so rotating one never 401s the other (Calendly
retries 24h, then sets the subscription `disabled`, unrecoverable). A missing
key is skipped; no key at all → 503. The matching key is logged, not enforced:
the row's `advisor` + `amount_dkk` gate the only side effect (reopening the
included right on a host cancellation: `companies.intro_session_used_at` for
Morten's included row, `companies.jonas_session_used_at` for Jonas' included
row, migration `20260913220000`; a paid Jonas row (`amount_dkk > 0`) never
reopens anything — pure, tested in `_shared/calendlyWebhookDom.ts`).
`create-free-intro-booking` (Bucket A) serves both included tracks from 13/9
via body `{ advisor }` (default `morten`); the atomic gate
`UPDATE companies … WHERE <right> IS NULL` is the same for both columns.

### Member read on own agreement (`company_perioder`, `company_traek`)
```sql
company_id = public.user_company_id(auth.uid())
```
Migration `20260909120000_medlemmets_adgang_til_aftalen.sql`: one SELECT-only
policy per table for `authenticated`, next to the existing advisor SELECT and
service-role FOR ALL. Members get no INSERT/UPDATE/DELETE — periods and
charges are written by `stripe-webhook` (service role) and periods by
advisors. `company_fornyelse` deliberately gets no member policy: the
decision, note and warning stamps are the advisors' notes, not the member's
agreement.

### Front-page «siden sidst» (`forside_sidst_set`, `get_siden_sidst`)
Migration `20260909100000_siden_sidst.sql`. `forside_sidst_set` holds one
row per user (`user_id` PK, `set_at`) — when the advisor last opened the
front page; self-only SELECT/INSERT/UPDATE (`user_id = auth.uid()`), same
pattern as `conversation_last_seen`. `get_siden_sidst(siden timestamptz)` is
a `STABLE SECURITY DEFINER` sql function, EXECUTE to authenticated, with
`has_role(auth.uid(), 'advisor')` in the WHERE — zero rows for non-advisors
(the `get_users_last_login` pattern). It reads `financial_report_facts`,
`messages`/`conversations`, `company_actions`, `company_traek`,
`company_perioder`, `company_members` and `companies` across all companies
and returns only counts and up to six company names per kind. No message
content, no amounts, no member ids leave the function.

`get_siden_sidst_virksomheder(siden timestamptz)` (17/9-2026, migration
`20260917170000_siden_sidst_virksomheder.sql`, PR 3 «links på navnene»;
SECURITY DEFINER green-lit by Jonas 17/9-2026, verbatim: «Vi går med din
anbefaling»): a NEW function beside the old one — same body, same `STABLE
SECURITY DEFINER`,
same `SET search_path = public`, same `has_role(auth.uid(), 'advisor')` gate
in the WHERE, same `GRANT EXECUTE TO authenticated` — that returns
`virksomheder jsonb` (`[{"id": <company uuid>, "name": …}]`, up to six per
kind, newest first) instead of `navne text[]`, so the front page can link
each name to `/virksomhed/{id}`. Company ids are already visible to advisors
everywhere (`companies` SELECT policy); still no message content, amounts or
member ids. `get_siden_sidst` is left untouched; the hook
(`src/hooks/sidenSidst.ts`) falls back to it only on PostgREST `PGRST202`
(function not found — Update before migration). Guard:
`src/lib/__tests__/forsideNavneLinker.guard.test.ts`.

### Realtime Presence — online-medlemmer (`realtime.messages`)
Migration `20260917100000_online_presence.sql` (16/9-2026, Jonas: «Ja» —
only advisors may see, in real time, which members have the app open; legat
and guests are shown too, legat with the «Legat» tag). Two RLS policies on
Supabase's `realtime.messages` table (Realtime Authorization for Presence),
scoped to ONE private channel topic `online-medlemmer` (`ONLINE_KANAL` in
`src/lib/hjemmebane/online.ts`; the guard `online.guard.test.ts` keeps the
SQL literal and the constant identical):
- INSERT `to authenticated` with `realtime.topic() = 'online-medlemmer' AND
  extension = 'presence'` — members publish their own presence (track).
- SELECT `to authenticated` with the same topic/extension AND
  `public.has_role(auth.uid(), 'advisor')` — only advisors receive presence.
Members have NO select policy and therefore receive nothing («With no
policies, clients connect but receive no messages», Realtime Settings) —
members never see each other. The advisor client never tracks (no INSERT
needed). The channel is opened with `config.private = true` on both sides;
«Allow public access» stays ENABLED — private channels enforce these
policies regardless, and a public channel with the same topic is a
different channel (Realtime Concepts). The eight existing `postgres_changes`
channels are unchanged. `has_role` is called, not modified. The presence
payload carries no PII (`online_at` only; the presence key is the user id,
which the advisor already reads via `profiles`).
**Superseded in the client 30/9-2026** by the heartbeat table below: the
Presence channel never showed a name (members only had INSERT and were
most likely rejected at join — silently; unproven). The two policies above
are left in place (no DROP in that PR); no client opens the channel.

### Online heartbeat — `online_hjerteslag`
Migration `20260930120000_online_hjerteslag.sql` (30/9-2026). One row per
user (`user_id` PK → `auth.users` ON DELETE CASCADE, `sidst_set`). RLS
enabled; four PERMISSIVE policies, all `to authenticated`:
- INSERT with check `user_id = auth.uid()`; UPDATE using + with check
  `user_id = auth.uid()` — a member writes only its own row.
- SELECT using `user_id = auth.uid()` — own row only. REQUIRED for the
  upsert: PostgreSQL applies the SELECT policy to the existing and new row
  of `INSERT … ON CONFLICT DO UPDATE` (CREATE POLICY, «Policies Applied by
  Command Type»). A member sees nothing about anyone else.
- SELECT using `has_role(auth.uid(), 'advisor')` — advisors (admin
  inherits) see all rows.
No DELETE policy; DELETE and TRUNCATE revoked from `authenticated`
(TRUNCATE ignores RLS), everything revoked from `anon`. A BEFORE INSERT OR
UPDATE trigger (`online_hjerteslag_servertid`, SECURITY INVOKER) sets
`sidst_set = now()` — the client clock is never trusted. The advisor reads
through `online_hjerteslag_friske(vindue_sekunder)` (SQL, STABLE, SECURITY
INVOKER — RLS decides; execute granted to `authenticated` only). No
SECURITY DEFINER. `has_role` is called, not modified. Guard:
`src/components/hjemmebane/forside/__tests__/online.guard.test.ts` dom 1–3, 8.

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

### Edge-rettelser 30/9-2026 (sikkerhedsanalysen fund 2, 4, 5, 8, 9, C7) — kun kode, ingen migration

- **`extract-annual-report`** (fund 2): rapporten slås op med `callerClient`
  og dømmes af `_shared/rapportEjerskab.ts` FØR service role —
  `doemRapportEjer` (rækken findes for kalderen og har `company_id` = kaldets;
  404/403) og `doemRapportFil` (filen er RÆKKENS `file_path` i
  `<company_id>/`, uden `..`/`.`/`//`/`\`/kontroltegn). Body'ens `file_path` og
  `user_id` læses ikke; `committed_by` = kalderen; årstallet skal være fire
  cifre (det indsættes i `.or()`/`.like()`); hver service-role-skrivning på
  rapporten er `.eq("id").eq("company_id")`.
- **`update-annual-report-revenue`** (fund 5): samme `doemRapportEjer` FØR
  service role; læsning og skrivning af rapporten bundet til `company_id`.
- **`notify-chat-reply`** (fund 8): `has_role(advisor)` og samtale-opslaget
  med `callerClient` FØR service role (403/404). Eneste kalder er
  `CompanyChatPane`, kun når `isAdvisor`.
- **`run-company-agent`** (fund 9): live-porten `_shared/agentLiveAdgang.ts`
  (`maaKoereLive`) FØR service role. Tørkørsel: alle med adgang. Live:
  service role og rådgivere altid; et medlem KUN `report_committed` og
  `anomaly_detected` — de to, medlemmets egen rapport-commit starter
  (`reportCommit.ts`, `ReportReviewDialog.tsx`, målt 30/9). Analysens «kun
  rådgiver live» ville have brudt dem. 403 `live_kraever_raadgiver`.
- **`stripe-webhook` / `calendly-webhook`** (C7/F1): den delte dom
  `_shared/webhookSignatur.ts` — konstant tid (`konstantTidLighed.ts`), ALLE
  `v1` prøves, samme hemmelighed og HMAC-form som før. Stripe: tidsvindue
  300 s (stripe-node `DEFAULT_TOLERANCE`; Stripe signerer hver levering på
  ny). Calendly: vinduet håndhæves IKKE endnu — Calendlys dokumentation
  siger ikke, om gentagelser signeres på ny, og et afvist abonnement bliver
  `disabled` efter 24 timer; alderen logges («signaturalder N s»), så det kan
  måles, før vinduet slås til (Calendly foreslår 180 s).
- **Frontend `/auth?returnUrl=`** (fund 4): `src/lib/sikkerReturUrl.ts`
  (`sikkerReturSti`) i `Auth.tsx` og `App.tsx:AuthRoute` — altid en intern
  sti; vores egen https-adresse (create-legat-enrollments
  `returnUrl=https://app.theboardroom.dk/legat`) oversættes til stien; alt
  andet → `/`. Ingen `window.location.href = returnUrl`.
- Kildeværn `src/lib/__tests__/sikkerhedEdge.guard.test.ts` (seks domme med
  mutationsprøver); rene prøver `rapportEjerskab`, `agentLiveAdgang`,
  `webhookSignatur`, `sikkerReturUrl`.

### Service-role-only tables (no client INSERT/UPDATE/DELETE)
- `slack_conversation_threads`
- `slack_notification_log`
- `slack_handout_notification_log`
- `slack_report_notification_log`
- `ansoegning_visninger` — anonyme trin før en ansøgning (vist/start/tastet),
  skrevet af `ansoegning-gem` «spor» (token-fri, IP-dagshash-loft, fail-closed).
  RLS slået til UDEN policies: ingen klient læser eller skriver; læsning i SQL
  editor. Ingen persondata (værn `ansoegningVisning.guard`). Migration
  `20260928170000_ansoegning_visninger.sql`, udkast 28/9-2026.
- `drift_agent_koersler` og `drift_agent_jobs` — driftsagentens egen log og
  «første gang set» pr. cron-job, skrevet KUN af `drift-agent-cron` (Bucket B).
  RLS slået til UDEN policies. Ingen persondata: fundenes sætninger bygges af
  job-/spornavne, tal og klokkeslæt, og pg_crons fejlbesked føres gennem
  `udenMail()`. `public.drift_agent_kerne(text)` er SECURITY INVOKER;
  `public.drift_agent_laes()` oprettes SECURITY INVOKER og gøres til SECURITY
  DEFINER af `20260930151000` (se «Driftsagentens læser» under Cron-vagten —
  KRÆVER Jonas' grønne lys); begge EXECUTE kun til `service_role`; af et
  HTTP-svar tages kun tal og sandhedsværdier, og `cron.job.command` returneres
  aldrig. **Ingen GRANT på skemaerne `cron` eller `net` til `service_role`**
  (første udgave af `20260930151000` gav USAGE på `cron` — det kan åbne
  `cron.schedule`/`cron.unschedule`, altså skriveret; fjernet efter teknisk råd
  30/9). `drift_agent_jobs` fyldes i migrationen med de eksisterende jobs.
  Migration `20260930150000_driftsagent.sql`, udkast 30/9-2026 (værn
  `driftDom.guard`).
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

### Ansøgningsmotoren (`ansoegninger`, `ansoegning_beslutninger`, `planlagte_haendelser`) — udkast 18/9-2026

- **Én tabel med formularen (B):** `ansoegninger` bærer både kladden (B: `token`, `indsendt_at`) og motoren (A: `trin`, `lukkeaarsag`, `rykkere_sendt`, `paa_pause_til`, `company_id`). Migration `20260918200000_ansoegninger.sql`.
- **Ansøgeren har INGEN politik** (ingen politik = ingen adgang). Adgang går kun gennem edge functions med tokenet som legitimation: B's `ansoegning-gem`/`-cvr` FØR indsendelse (`hent_ansoegning_til_gem`, B's SECURITY DEFINER — B's STOP), motorens `ansoegning-link` EFTER (`verifyAnsoegningslink`, `_shared/ansoegningLinkAuth.ts`: service-role-opslag på `token` hvor `indsendt_at` er sat — ingen SQL-funktion). Svaret bærer aldrig anbefalingen eller beslutningerne.
- **Rådgivere:** SELECT på alle tre tabeller; UPDATE på `ansoegninger` (note, pris, felter) — men motorens felter (trin, lukkeaarsag, lukket_*, rykkere_sendt, trin_sat_at, paa_pause_til, company_id, konverteret_at, token, indsendt_at, anbefaling, samtale_*) afvises af den NYE BEFORE UPDATE-trigger `protect_ansoegning_motor_fields` for alt andet end service role. Ny trigger på egen tabel; ikke på `auth.users`, ikke SECURITY DEFINER.
- **Trinnet skrives ét sted:** `_shared/ansoegningMotor.ts:udfoerOvergang` (dommen `afgoerOvergang`, optimistisk lås `.eq("trin", fra)`). Kaldere: `ansoegning-handling` (Bucket A, `authenticateUser` + `has_role` advisor FØR service role), `ansoegning-link` (token), `ansoegning-rykker-cron` (Bucket B), `calendly-webhook` (Bucket C, EFTER `session_bookings`-opslaget) og C's `aftale-underskrift` (e-signatur).
- **Idempotens:** `planlagte_haendelser.idempotensnoegle` UNIQUE, gives videre som `email_send_log.message_id` (UNIQUE WHERE status = sent). `company_betalingslink.ansoegning_id` partielt unikt (som `monday_item_id`).
- **Samme id:** ved «underskrevet» oprettes `companies` med `id = ansoegninger.id` (`opretEllerGenbrugVirksomhed(…, { id })`); CVR-genbrug er eneste undtagelse. Ingen kontraktdatoer — stripe-webhook skriver dem ved betaling.
- Kildeværn: `src/lib/__tests__/ansoegningMotor.guard.test.ts` (8 domme med selvbevis).

### E-underskriften (`aftale_skabelon`, `aftale_underskrift`, `aftale_kode`, `aftale_spor`, bucket `aftaler`) — udkast 18/9-2026

- **Migration** `20260918220000_aftaleunderskrift.sql` (kræver A's `20260918200000` først — FK til `ansoegninger`). Ingen SECURITY DEFINER-funktion rører `has_role`/`user_company_id`.
- **Modtageren har INGEN konto og INGEN politik.** Alt går gennem edge-funktionen `aftale-underskrift` (`verify_jwt = false`, bevidst) med tokenet som legitimation: `verifyAftaletoken` (`_shared/aftaletokenAuth.ts`, service-role-opslag på `aftale_underskrift.token` UNIQUE uuid) FØR enhver anden databaseadgang — samme klasse som `verifyBetalingstoken`; registreret som prædikat i `scripts/check-edge-function-auth.ts`. Ingen anon-RPC: hver åbning skal i sporet med IP/browser fra request-headerne.
- **Rådgivere:** SELECT på `aftale_underskrift` og `aftale_spor`, FOR ALL på `aftale_skabelon`, SELECT i bucket `aftaler`. Afsendelse og annullering går KUN gennem `send-til-underskrift` (Bucket A: `authenticateUser` + `has_role` advisor, `verify_jwt = true`), så en sendt aftale aldrig findes uden spor og mail.
- **Koderne (`aftale_kode`) er service-role-only** — ikke engang rådgivere læser hash'ene. Kun `sha256(aftale_id:kode)` gemmes; forsøg tælles atomisk i SQL (`registrer_kodeforsoeg`, `WHERE forsoeg < 5`, CHECK ≤ 5); `annuller_gamle_koder` erstatter åbne koder. Begge funktioner: SECURITY DEFINER, EXECUTE kun til `service_role`.
- **Sporet (`aftale_spor`) er append-only:** INSERT/SELECT for service_role, SELECT for rådgivere, ingen UPDATE/DELETE-politik for nogen; kildeværnet låser at koden kun indsætter.
- **Én ejer pr. aftale:** CHECK præcis én af `company_id`/`ansoegning_id` (D1: virksomheden oprettes ved underskriften af A's motor, `udfoerOvergang(underskrevet, via e_signatur)`). Underskriften sender ALDRIG invitationen og skriver aldrig kontraktdatoer — adgang gives ved betaling (`stripe-webhook`, urørt).
- Kildeværn: `src/lib/__tests__/aftaleUnderskrift.guard.test.ts` (9 domme + 8 selvbeviser).

### Webinar-delingen (`webinar_delinger`, `webinar_deling_spor`) — udkast 21/9-2026, migration `20260922020000`

- **Modtageren har INGEN konto og INGEN politik.** Alt går gennem edge-funktionen `webinar-delt` (`verify_jwt = false`, bevidst) med tokenet som legitimation: `verifyDelingstoken` (`_shared/delingstokenAuth.ts`) FØR enhver anden databaseadgang — samme klasse som `verifyAftaletoken`; registreret som prædikat i `scripts/check-edge-function-auth.ts`. **Nyt i huset: tokenet gemmes KUN som SHA-256-aftryk** (`token_aftryk`, UNIQUE, CHECK hex-64); opslag på aftryk-lighed med service role, derefter konstant-tid-sammenligning (`konstantTidLighed.ts`). Tokenet er 256 bit (32 bytes `crypto.getRandomValues`, base64url) og findes kun i svaret ved oprettelsen og i modtagerens link. Ukendt/udløbet/lukket giver ÉT svar udadtil (403 `ukendt`); grunden står i sporet.
- **Svaret bærer ingen rå rækker:** `webinar-delt` regner dashboardet på serveren (spejlede domme `_shared/webinarDashboard.ts`, `_shared/annoncepriser.ts`) og går svaret igennem for tilmeldingens personfelter (`findForbudteNoegler`) før det sendes — 500 `svar_afvist` frem for et læk. Kildeværn: `src/lib/__tests__/webinarDeling.guard.test.ts` + prøven på svar-objektet i `webinarDeling.test.ts`.
- **Rådgivere:** SELECT på `webinar_delinger` og `webinar_deling_spor` (listen). Opret/forlæng/luk går KUN gennem `webinar-deling` (Bucket A: `authenticateUser` + `has_role` advisor via `callerClient.rpc`, `verify_jwt = true`), så en deling aldrig findes uden spor.
- **Opbevaring 12 måneder (Jonas 21/9):** cron-jobbet `webinar-delinger-opbevaring` (`52 4 * * *`, migration `20260922021000`, ren SQL) sletter delinger 12 måneder efter det tidligste passerede af `lukket_at`/`udloeber_at`; sporet følger med cascaden. Antallet står i `cron.job_run_details.return_message` («DELETE n»).
- **Sporet er append-only:** INSERT/SELECT for service_role, SELECT for rådgivere, ingen UPDATE/DELETE-politik, og `protect_webinar_deling_spor` (§3) nægter UPDATE altid og DELETE direkte (cascaden fra `webinar_delinger` slipper igennem). Hver visning og afvisning PÅ EN KENDT DELING logges med IP/user-agent (`deling_id NOT NULL`); et ukendt token skrives aldrig i sporet (det kan ikke slettes, og der er ingen rate-limit) — kun i functionens log, uden tokenet.

### Webinarkoblingen (`ansoegning_webinar_kobling`) — udkast 1/10-2026, migration `20261001120000`

- **Kun rådgivere:** SELECT/INSERT/DELETE TO authenticated med `has_role(auth.uid(), 'advisor')` (admin arver). Ingen UPDATE (en kobling rettes ved at fjerne og koble igen), ingen medlemsadgang, anon intet (REVOKE). INSERT kræver `koblet_af = auth.uid()` (default `auth.uid()`), så ingen kobler i en andens navn.
- **Ingen SECURITY DEFINER, ingen funktion, ingen trigger.** `webinar-delt` læser tabellen med service role (RLS gælder ikke) og bruger tilmeldingens mail KUN som nøgle i dommen — den forlader aldrig serveren.
- **Data:** ansøgnings-id, tilmeldings-id, rådgiverens uid, tidspunkt, forslagets grund i ord. FK'erne er `ON DELETE CASCADE` begge veje: en slettet ansøgning eller tilmelding (persondata) tager koblingen med. To UNIQUE'er: én kobling pr. ansøgning og én pr. tilmelding (tragtens mailsæt ville ellers tælle to ansøgninger som én).
- **Det delte svar** (`webinar-delt`) bærer kun antallet `koblinger_talt` — aldrig koblingens mail; prøvet gennem `findForbudteNoegler` i `src/lib/webinar/__tests__/kobling.test.ts`. Rådgiverens kandidat-opslag henter kun de felter, forslaget og fladen bruger (intet annoncespor, ingen by/enhed, ingen `raa`).
- Kildeværn: `src/lib/__tests__/webinarKobling.guard.test.ts` (9 domme). Design: `docs/webinaret-og-annoncerne.md` §7i.

### Boardroom Score — hukommelsen `maaned_foerste_godkendelse` (30/9-2026, migration `20260930130000`)

- **Read-only for every client.** SELECT for company members (`company_id = user_company_id(auth.uid())`) and advisors (`has_role(auth.uid(), 'advisor')`); no INSERT/UPDATE/DELETE policy for anyone. The only writer is the trigger `husk_foerste_godkendelse` (§3) on `financial_report_facts`; the only DELETE is the cascade from `companies`. UPDATE is refused by `protect_maaned_foerste_godkendelse` (§3).
- **Why it exists:** the Boardroom Score streak judges on a month's FIRST approval. `financial_report_facts.created_at` dies with the row on «Erstat gammel data» (soft-delete → `cleanup_facts_on_report_delete` deletes facts → `commit_report_facts` inserts anew) and on permanent deletion, so a corrected old month looked late. The memory survives both. Design and the operational proof: `docs/boardroom-score.md` §4a.
- **Data:** company id, period key, one timestamp. No amounts, no persons.

### Dine mål, skive 3 — `milestones.bekraeftet_at/bekraeftet_af` og `maal_kvartalstjek` (2/10-2026, migration `20261002100000`, IKKE KØRT)

- **Bekræftelsen bor på rækken** (`milestones.bekraeftet_at timestamptz NULL`, `bekraeftet_af uuid NULL`, kun tilføjende): et mål, en rådgiver/agent/handout skrev, tæller først som medlemmets, når medlemmet har sat stemplet. **Ingen ny policy på `milestones`:** medlemmet skriver gennem den eksisterende «Company members can update company milestones» (USING `company_id = user_company_id(auth.uid())`, uden WITH CHECK — fund 6 ovenfor gælder stadig), som også dækker et mål med rådgiverens `user_id`. Klientens UPDATE er guardet `.is("bekraeftet_at", null).eq("status", "active")`. Rådgiveren har kun SELECT og kan ikke bekræfte — fladen deaktiverer knapperne. Backfillen i migrationen sætter `bekraeftet_at = created_at` KUN for `source = 'manual'` med `user_id` i `company_members` for virksomheden (guard `WHERE bekraeftet_at IS NULL`).
- **`maal_kvartalstjek` — append-only svar-spor:** RLS slået til; SELECT/INSERT TO authenticated for medlemmer af virksomheden (`company_id = user_company_id(auth.uid())`), INSERT desuden `valgt_af = auth.uid()` og EXISTS på `milestones` (målet hører til virksomheden — under medlemmets egen RLS) **og databasens dom (rådets fund 11, 2/10):** målet er bekræftet (`bekraeftet_at IS NOT NULL`), kvartalet er forfaldent — `greatest(bekraeftet_at som dansk dato, date '2026-10-02') + 3·kvartal måneder ≤ i dag (Europe/Copenhagen) < anker + 12 måneder` — ingen eksisterende række med `kvartal ≥` det nye (self-subquery under medlemmets SELECT-policy; ingen rekursion), og målets status passer til valget (`behold`/`justeret` → `active`; `parkeret` → `active`/`parked`; `naaet` → `active`/`completed`, fordi klienten skriver handlingen FØR rækken). Udtrykket er spejlet i klienten (`maalBekraeft.maaRegistrereKvartalstjek`) og holdt ens af `dineMaalSkive3.guard` dom 7; SELECT for rådgivere (`has_role(auth.uid(), 'advisor')`, forsidens linje). **Ingen UPDATE/DELETE-policy, ingen GRANT UPDATE/DELETE** (kun SELECT, INSERT til authenticated; anon intet — REVOKE). Rækker forsvinder kun med målet/virksomheden (FK `ON DELETE CASCADE` — kaskaden kører som tabelejer). Alle policies PERMISSIVE og giver kun JA — intet at nægte (§5). `UNIQUE (milestone_id, kvartal)`; CHECK på `kvartal IN (1,2,3)` og `valg IN ('behold','justeret','parkeret','naaet')` — ordforrådet står ORDRET i `src/lib/hjemmebane/maalBekraeft.ts` (kildeværn `dineMaalSkive3.guard` dom 4).
- **Ingen SECURITY DEFINER, ingen funktion, ingen trigger.** Triggeren `milestones_hoejst_tre_aktive` er bevidst IKKE rørt og tæller stadig alle aktive (også ubekræftede) — fladen lover derfor aldrig en plads, databasen afviser (`dineMaal.pladsOptagetAfUbekraeftede`). En trigger, der kun tæller bekræftede, er et åbent punkt (grønt lys). **Bygget 2/10 (migration `20261002241000_maal_pladser_kun_bekraeftede.sql`, IKKE KØRT, kræver grønt lys):** `haandhaev_hoejst_tre_aktive_maal` tæller kun `status = 'active' AND bekraeftet_at IS NOT NULL` og dømmer også, når `bekraeftet_at` sættes på et aktivt forslag; triggeren forbliver SECURITY INVOKER; ny SECURITY INVOKER-RPC `maal_pladser_kun_bekraeftede()` lader klienten måle, hvilken regel databasen kører (`src/lib/hjemmebane/maalPladsdom.ts`; «alle» ved fejl). Sandhedstabellen står i migrationens filhoved.
- **Data:** stempler, uid'er, kvartal og et ord — ingen beløb, ingen persondata ud over uid.
- Kildeværn: `src/lib/__tests__/dineMaalSkive3.guard.test.ts` (8 domme; dom 6 holder migrationen tilføjende, dom 7 policyen = klientens dom). Design: `docs/dine-maal-design.md` «Skive 3».

### «Må vi ringe til dig?» (`opkaldsanmodninger`) — bygget 2/10-2026, migration `20261002270000`, IKKE KØRT

- **Mennesket har INGEN konto og INGEN politik.** Alt går gennem edge-funktionen `ring-mig-op` (`verify_jwt = false`, bevidst) med tokenet som legitimation: `laesRingToken` (`_shared/ringToken.ts`: HMAC-SHA256 over `webinar_tilmeldinger.ewebinar_id` med `RING_SECRET`, konstant tid — samme klasse som `laesAfmeldToken`) FØR `createClient`; registreret som prædikat i `scripts/check-edge-function-auth.ts`. **Tokenet åbner ikke alene:** rækken i `webinar_tilmeldinger` skal have DELTAGET (`doemSetGrad` → `opkaldDom.harDeltaget`, kun `set`/`delvist`); ukendt token, ukendt tilmelding og «mødte ikke op» giver ÉT svar (403 «ukendt»), så functionen ikke er et opslagsværk over fremmøde. STRIKS body (`kendteFelter`), IP-dagsloft (10 pr. IP-dagshash pr. time, 200 i alt; fail-closed på tællingen; `ip_hash` på rækken, aldrig rå IP).
- **Tokenet leveres** som `ring_op_url` — profilegenskab OG hændelsesegenskab i samme kald som Klaviyo-hændelsen «Deltog i webinar» (`webinarHaendelser.byggFremmoede` → `profilEgenskaber`, KUN «deltog»-overgangen; `ewebinar-webhook` og `ewebinar-import` regner det fail-soft). Det lander dermed i `klaviyo_haendelser.sendt` (service-role-only) og hos Klaviyo på personens egen profil, hvor det står, til en ny deltagelse overskriver det. Et token giver KUN adgang til at bede om et opkald for den tilmelding — ingen læsning.
- **Data:** navn, telefon i E.164 (CHECK `^\+45[2-9][0-9]{7}$`), samtykkets ordlyd ORDRET (`samtykke_ordlyd`, CHECK 10–300 tegn) og tidspunkt, `ringet_at`/`ringet_af` som par (CHECK), `ip_hash`. FK til `webinar_tilmeldinger` `ON DELETE CASCADE`; `ringet_af` → `auth.users` `ON DELETE SET NULL`. **Nummeret forlader aldrig serveren** ud over `/opkald`: klokken bærer navn + dato (`klokkeTitel`), Klaviyo-hændelsen «Bad om opkald» bærer mail + tilmeldingens id'er, svaret bærer tællere (kildeværn `ringMigOp.guard` dom 2).
- **RLS:** anon INTET (REVOKE); `authenticated` har GRANT SELECT, UPDATE — policies SELECT og UPDATE for `has_role(auth.uid(), 'advisor')` (admin arver); INGEN INSERT/DELETE til klienten; service_role ALT. **Kolonneværn:** triggeren `opkald_raadgiver_kolonnevaern` (BEFORE UPDATE, `security invoker`, samme form som `companies_medlem_kolonnevaern`) lader en klient ændre KUN `ringet_at`/`ringet_af`, og `ringet_af` skal være `auth.uid()`; service_role/postgres passerer. Alle policies PERMISSIVE og giver kun JA — intet at nægte (§5).
- **Opbevaring 90 dage (Jonas 2/10 «Slet nummeret efter 90 dage — ja»):** cron-jobbet `opkald-opbevaring` (`'33 5 * * *'`, ren SQL i samme migration) sletter rækker med `samtykke_at < now() − 90 days` — SLETNING, ikke anonymisering (rækken bærer intet andet end nummeret, navnet og samtykket til dem). Antallet står i `cron.job_run_details.return_message`.
- **Rådets fund 2/10 (rettet før kørsel):** SELECT- og UPDATE-politikken udelukker **tjenestekonti** (`not exists (select 1 from public.tjenestekonti …)`); linket **udløber** 30 dage efter sessionen (`tokenUdloebet`, 403 «ukendt» som et forkert token); et **gentaget indsend** inden for 10 min afvises (`sidst_indsendt_at`, 429, intet sendes); en **åben anmodning overskrives aldrig** — kun en ringet genåbnes, med ny `runde_id` (ny klokke og hændelse); **fortryd «ringet»** er bevidst åben for enhver rådgiver; **ip_hash** er husets usaltede sha256(ip:dato) — vendbar over IPv4-rummet, altså persondata, slettes med rækken, og XFF kan forfalskes; tokens i URL'en (`/ring-mig-op?t=`, `/aftale?token=`, `/delt/webinar?t=`) fjernes fra Sentry-hændelser (`src/lib/sentryRens.ts`).
- **Ingen SECURITY DEFINER, ingen anon-RPC.** Kildeværn: `src/lib/__tests__/ringMigOp.guard.test.ts` (10 domme). Design: `docs/samtykke-og-opkald.md` del 2 + §2.10.

### Webinarmotoren (`webinarer`, `webinar_sessioner`, `webinar_gentagelser`, `webinar_interaktioner`, `webinar_deltagelser`, `webinar_pulser`, `webinar_motor_log`, `webinar_svar`, `webinar_reaktioner`, `webinar_spoergsmaal`) — skive 1, 30/9-2026, migration `20261003010000` (omdøbt 2/10-2026 fra `20260930100000`, så den ukørte fil sorterer efter de kørte — metaSend.guard dom 11)

- **Seeren har INGEN konto og INGEN politik; ingen anon-politik på nogen webinartabel.** Alt offentligt går gennem tre edge functions (`verify_jwt = false`, bevidst): `webinar-tilmeld` (værnet `verifyOffentligTilmelding`, `_shared/webinarTilmeldVaern.ts`: origin-liste, honningfelt, IP-dagshash-loft, fail-closed — samme klasse som `ansoegning-gem` «opret») og `webinar-rum`/`webinar-puls` (`verifyDeltagertoken`, `_shared/webinarDeltagerAuth.ts`). Begge prædikater er registreret i `scripts/check-edge-function-auth.ts`.
- **Deltagertokenet er en HMAC, intet gemmes** (en bevidst afvigelse fra delingstokenets SHA-256-aftryk: `webinar-mail-cron` skal kunne bygge linket igen i op til syv mails). `HMAC-SHA256(WEBINAR_JOIN_SECRET, "<tilmelding_id>:<token_version>")`, regnet igen og sammenlignet i konstant tid FØR databaseopslaget; derefter skal `token_version` passe (`+= 1` tilbagekalder). Secret'en læses kun i `webinarDeltagerAuth.ts` (rotation: `WEBINAR_JOIN_SECRET_FORRIGE`).
- **Rå data er service-role-only:** `webinar_pulser` og `webinar_motor_log` har kun service_role-politikken. Rådgivere har SELECT på de otte andre; ingen rådgiver-skrivning endnu (kommer med `webinar-admin`, skive 6).
- **To nye SQL-funktioner, begge SECURITY INVOKER** (ikke definer), EXECUTE kun til `service_role` (revoke fra public/anon/authenticated): `webinar_puls_skriv` (dedup + OR af bits + pulsrækker + tilmeldingens `set_procent`, én transaktion) og `webinar_reaktion_tael`. Én BEFORE UPDATE-trigger på den NYE tabel `webinar_interaktioner` (`webinar_interaktion_uforanderlig`): en udgivet tidslinje-version ændres aldrig.
- **Svarene bærer ingen persondata:** hvert JSON-svar går gennem `findMotorForbudte` (`_shared/webinarMotor/svar.ts`) — 500 `svar_afvist` frem for et læk. IP gemmes aldrig rå (kun `ip_dagshash`).
- Kildeværn: `src/lib/__tests__/webinarMotor.guard.test.ts` (seks domme med mutationer). Dokument: `docs/webinarmotor.md`.

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
  any processing (Stripe-signature, `verifyCalendlySignature`, `verifyEwebinarSignature`,
  `verifyWebhookRequest` for auth hooks; Monday.com's HMAC-JWT er historie — opsagt 2/10-2026)
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
  - **Fase 3a, trin 1 (udkast 1/10-2026, `docs/prod-hjem-plan.md`; built, NOT
    deployed):** two roads in, judged by the pure `domServiceRole` in
    `_shared/serviceNoegle.ts` (vitest `src/lib/__tests__/serviceNoegle.test.ts`):
    (1) the KEY — `apikey` (or `Authorization: Bearer sb_secret_…`) equal in
    constant time to the runtime's `SUPABASE_SERVICE_ROLE_KEY`, with the
    `sb_secret_…` form required on BOTH sides (a missing/legacy runtime key
    closes the road); (2) the role claim, UNCHANGED, which is only safe behind
    `verify_jwt = true`. A wrong key never rejects on its own — it falls
    through to (2), so trin 1 changes no answer for today's callers. The
    `check-verify-jwt-invariant` rule (authenticateServiceRole ⇒ `verify_jwt =
    true`) still holds unchanged. **Trin 2 (not built):** per function,
    `verify_jwt = false` ONLY together with a «key only» mode that refuses the
    role claim, and the invariant script rewritten to enforce exactly that —
    without it the role claim is forgeable by anyone.
  - `public.kald_edge` (SECURITY DEFINER, migration `20261002290000_kald_edge_apikey.sql`,
    **not run; needs Jonas' explicit go-ahead to run**): still sends the legacy
    `Authorization: Bearer` from vault `email_queue_service_role_key`
    unchanged, and additionally `apikey` from the NEW vault entry
    `kald_edge_sb_secret` when it exists and has the `sb_secret_…` form —
    otherwise exactly as before, never an error. No GRANT/REVOKE: `CREATE OR
    REPLACE` keeps owner and ACL (measured by the header's FØR/EFTER SQL).
    Rollback without SQL: delete the vault entry.
- Bucket C (webhooks) — per-function signature verification

### Security-sensitive functions requiring extra care:
- `bunny-content-admin` — Bucket A + advisor gate (`has_role` via callerClient)
  before any Bunny Stream operation; returns only a time-boxed, video-scoped
  TUS upload signature — the Bunny API key never reaches the frontend
- `get-video-embed` — Bucket A; access control is the RLS published-gate via
  callerClient + a server-side drip check (C1 decision D5, advisors bypass,
  fail-closed without a membership anchor); signs Bunny embed URLs server-side
  (`BUNNY_STREAM_TOKEN_AUTH_KEY` never reaches the frontend, TTL 1h)
- `chat-video` (29/9-2026, videosvar i chatten) — Bucket A m. `verify_jwt = true`
  (PR #267-mønstret): `authenticateUser` FØRST; ingen service-role-klient.
  **EGET BUNNY-BIBLIOTEK (29/9 aften):** chatvideoerne ligger i biblioteket
  «boardroom-chat» (Library ID 765771; Premium Encoding + Just-In-Time,
  Early-Play fra, 480p/720p H.264, embed view token authentication og block
  direct URL file access slået til) — ikke i Hjemmebanes 720547. Functionen
  læser PRÆCIS tre egne secrets, `BUNNY_CHAT_LIBRARY_ID`, `BUNNY_CHAT_API_KEY`
  og `BUNNY_CHAT_TOKEN_AUTH_KEY`, gennem én tabel (`SECRETS`); de delte
  `BUNNY_STREAM_*` (bunny-content-admin, get-video-embed) bruges ALDRIG her,
  og der er ingen fallback: mangler en, svarer alle tre handlinger 503
  `not_configured` med `mangler: [navne]`. Collection-kravet
  (`BUNNY_STREAM_CHAT_COLLECTION_ID`, `iChatCollection`) er væk — hele
  biblioteket er chattens.
  Tre handlinger:
  - `opret` — advisor-gaten ORDRET som `bunny-content-admin` (`has_role` via
    `callerClient`) FØR Bunny kaldes; Create Video i chat-biblioteket med
    titlen alene; svarer med en tidsbegrænset, video-scoped TUS-signatur (6 t)
    for chat-biblioteket — API-nøglen forlader aldrig functionen.
  - `afspil` — beskeden læses gennem `callerClient` (RLS på `messages` afgør,
    om kalderen må se den; 403 uden at skelne «nægtet»/«findes ikke»), GUID'et
    KUN af `context_meta.video.guid` (`laesChatVideo`). FØR signering:
    (a) afsenderen er rådgiver (`has_role(sender_id, 'advisor')`), (b) Bunnys
    Get Video (mod chat-biblioteket, med chat-nøglen) viser `videoLibraryId`
    = chat-biblioteket (`iChatBibliotek`, fail-closed på begge sider og på et
    id, der ikke er et helt positivt tal). Ellers 403 uden signatur — en
    akademivideos GUID i en besked kan ikke omgå `get-video-embed`s
    published-gate og dryp. Status: Get Video (4 Finished eller en færdig
    opløsning); er den ikke «klar», spørges Get Video play data
    (`/videos/{guid}/play`, signeret med samme token/expires-par som
    embeddet, TTL 60 s), og `isPlayable === true` er «klar» — Bunnys eneste
    dokumenterede «afspillelig nu». Status 7/8 (JitSegmenting/
    JitPlaylistsCreated) er ALDRIG «klar» i sig selv. Embed-URL'en signeres
    som `get-video-embed` (TTL 1 t) og KUN når status er «klar».
  - `slet` — kun beskedens afsender eller en admin (`maaSlette`); samme to
    tjek som `afspil` FØR `DELETE /library/{id}/videos/{guid}`, fordi
    medlemmernes INSERT-policy på `messages` ikke begrænser `context_meta`,
    og en Bunny-sletning ikke kan fortrydes. 404 hos Bunny = allerede væk (ok).
  Dommen er ren i `_shared/chatVideo.ts` (spejl `src/lib/chatVideo.ts`,
  paritetsprøve); kildeværn `chatVideo.guard` (seks domme med mutationsprøver;
  dom 6 fælder, hvis `BUNNY_STREAM_*` eller en collection bruges igen).
  Status spørges hos Bunny (ingen webhook, ingen statustabel).
- `auth-email-hook` — system webhook, signature-verified
- `monday-webhook` — **NEDLAGT 2/10-2026** (Jonas 1/10: «Vi bruger ikke Monday
  mere. Det er opsagt.»): svarer 410 Gone på alt uden parsing, env, service-role
  eller database — derfor uden auth-prædikat (CI: «skip-no-sr»); `verify_jwt =
  false` med begrundelse i config.toml, så 410-beviset kan måles. Værnet
  `mondayVaek.guard` låser formen og at ingen function kalder `api.monday.com`
  eller læser `MONDAY_API_TOKEN`/`MONDAY_SIGNING_SECRET`/`MONDAY_WEBHOOK_SECRET`
  (de tre secrets er ubrugte hos Lovable og kan fjernes dér). Historik: 14/9–2/10
  to veje (`_shared/mondayVaern.ts`, slettet) — HMAC-SHA256-JWT eller `?noegle=`
  i konstant tid (`_shared/konstantTidLighed.ts`, som lever videre for
  aftale-underskrift, webhookSignatur, ewebinarSignatur, delingstokenAuth).
- `ewebinar-webhook` (udkast 19/9-2026) — Bucket C: `verifyEwebinarSignature`
  (`_shared/ewebinarSignatur.ts`) over den RÅ body (`req.text()`) FØR
  `JSON.parse` og FØR service-role-klienten; HMAC-SHA256 over
  «<X-EWebinar-Timestamp>.<body>» mod `EWEBINAR_WEBHOOK_SIGNING_SECRET`
  (UTF-8- og hex-nøgleform prøves, den der matchede logges), sammenlignet i
  konstant tid. 401 uden match; 503 uden secret; 500 kun ved DB-fejl. Skriver
  kun `webinar_haendelser` (rå log, idempotent på SHA-256 af body) og
  `webinar_tilmeldinger` — service_role ALL, advisor SELECT, ingen
  klientskrivning. Kildeværn `ewebinarWebhook.guard`.
- `ewebinar-import` (udkast 19/9-2026) — Bucket B m. `verify_jwt = true`:
  `authenticateServiceRole(req)` FØR `EWEBINAR_API_KEY` læses og FØR
  service-role-klienten. Engangshentning af eWebinars eksisterende
  registranter over REST (`GET /v2/registrants`, `nextCursor`-paginering);
  **tørkørsel som standard** — kun `{"dry_run": false}` skriver. Skriver de
  samme to tabeller som webhooken gennem webhookens egen dom
  (`plukTilmelding` + `fletTilmelding`), med `ewebinar_id` som nøgle: de to
  veje kan ikke skabe dubletter, og importen kan aldrig sænke en kendt
  procent. `EWEBINAR_API_KEY` er team-scoped («equivalent to a user login»)
  og må kun stå i Lovable-secrets. Kildeværn `ewebinarImport.guard`.
- `webinar-video` (udkast 30/9-2026) — offentlig, `verify_jwt = false`
  (bevidst: et klik i en indbakke bærer hverken Authorization eller apikey).
  Legitimationen er mail-rækkens id i URL'en (`?m=<webinar_mails.id>`, uuid
  trukket af `webinar-mail-cron` før mailen bygges): formen dømmes FØR
  opslaget (`laesKlikId`), og `verifyVideoKlik` (`_shared/webinarVideo.ts`,
  registreret prædikat) slår en SENDT `en_dag`-række op. Kun et kendt id
  logges — i `webinar_video_klik` (migration `20260930181000`: mail_id +
  tidspunkt, ingen IP/user agent/adresse; FK on delete cascade; service_role
  ALL, advisor SELECT). **Ingen åben viderestilling:** målet bygges af
  `app_config.webinar_en_dag_video` (library = cifre, video = GUID) på den
  faste vært `iframe.mediadelivery.net` (`bunnyAfspilUrl`), aldrig af URL'en.
  Kildeværn `webinarMail.guard` dom 19.
- `send-report-reminder` — service-role-only gate
- `manage-advisor` — admin role gate + service-role operations
- `process-pending-invitation` — self-only guard + server-verified email
- `agent-forslag-afgoer` — Bucket A m. `verify_jwt = true` i config.toml
- `flyt-event` (udkast 18/9) — Bucket A m. `verify_jwt = true`: `authenticateUser` → advisor/admin via `user_roles` → service role. Flytter dato/tid på et event og giver de tilmeldte (attending, ikke afmeldt) besked; UPDATE før beskeder; kun publicerede events får beskeder. Editoren må aldrig sende `starts_at`/`ends_at` til `updateEvent` for et publiceret event (kildeværn `flytEvent.guard`).
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
- [ ] All RLS policies (exact policy names and expressions) — and that `pg_policies.permissive` is `RESTRICTIVE` for exactly the four demo policies in section 5 and `PERMISSIVE` for everything else
- [ ] All storage.objects PERMISSIVE policies listed in section 9 (in particular the advisor INSERT branch for `financial-documents`, without which advisor uploads false-deny)
- [ ] `app_role` enum values: `member`, `advisor`, `admin`
- [ ] UNIQUE constraint on `handouts(user_id, module)`
- [ ] All foreign key relationships

---

## 9. Storage Bucket Policies

Storage uses **PERMISSIVE** policies (Supabase default for the `storage`
schema). Multiple INSERT or SELECT policies for the same `cmd` OR-stack:
a row passes if ANY policy passes. The `public` schema works the SAME way
(corrected 2026-09-03, section 5) — adding a "stricter" permissive policy
alongside a loose one does NOT tighten access. The loose one always wins.
Only `AS RESTRICTIVE` tightens.

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

**Path must belong to the sender (2026-09-29, «ændring 5»)**:
`get-chat-attachment-url` reads `sender_id` together with `context_meta`
in the same `callerClient` lookup and refuses (403, nothing signed) unless
`stiTilhoererAfsender(path, sender_id)` holds — the path's first folder must
be exactly the message's `sender_id` (`_shared/chatVedhaeftningSti.ts`,
mirrored in `src/lib`, parity test). Before this, RLS on `messages` only
proved the caller may SEE the message; `context_meta` has no constraint in
the database, so a member could put another user's path into their own
message and get it signed.

**INSERT policy (`Authenticated users can upload chat attachments`)**:
`bucket_id = 'chat-attachments' AND (storage.foldername(name))[1]
= auth.uid()::text`, written into the repo by
`20260929150000_chat_vedhaeftning_mappetjek.sql`. What was believed (Claude,
29/9): the repo's only version of the policy (`20260317133757`) checks
`bucket_id` alone, so prod was assumed to have an open upload hole. That was
wrong — measured in prod 29/9 BEFORE the migration was run, `pg_policies`
already carried the folder check (BEFORE = AFTER); there was no hole in prod.
The migration therefore brings the repo in line with prod and is idempotent.
The two older migration comments that say the folder check exists
(`20260911030000:12-13`, `20260903233000:56-57`) describe prod correctly; how
the check got into prod is not recorded in the repo.

- `uploadChatAttachments` writes the `path` form (`{userId}/{ts}-{name}`);
  the historical public-URL form in `attachments[].url` is still read.
  Historical public-URL copies outside the app are dead as of 2026-08-06
  (accepted).

### Other buckets (not security-critical at this time)

- `avatars` (public): user-id-scoped path, OK for the use case
- `company-logos` (public): logos are intentionally public
- `feedback-screenshots`: internal-only feedback feature
