# MCP-server — Sprint 0 Recon

**Status:** REN RECON. Ingen kode skrevet, ingen skema-ændringer. Dette dokument er en
kortlægning af repoets faktiske tilstand som grundlag for design af MCP-serveren.

**Branch:** `mcp/sprint-0-recon`
**Dato:** 2026-07-21
**Metode:** Læsning af rå filer, migrations og edge-function-kildekode. Kolonnelister for de
syv centrale tabeller er **live-verificeret mod `information_schema`** (se §7). Antagelser fra
hukommelse er undgået; hvert fund er grundet i rå output.

---

## 1. Monorepo-struktur

**Konklusion: Dette er IKKE et monorepo. Det er en single-package repo.**

- Ingen `apps/` eller `packages/`. `package.json` har **intet `workspaces`-felt**.
- Kildekode i `src/` (Vite/React-frontend), backend i `supabase/` (edge functions + migrations),
  build-scripts i `scripts/`.
- **Package manager:** Bun. `bun.lock` + `bun.lockb` er kanoniske. (`package-lock.json` findes
  også — formentlig et Lovable-scaffold-artefakt; Bun er den brugte kanal, jf. CLAUDE.md.)
- **Package:** privat, `name: vite_react_shadcn_ts`, `version: 0.0.0` (Lovable-scaffold-navn).
- **tsconfig-kæde:** rod `tsconfig.json` → refererer `tsconfig.app.json` (src, `strict: false`,
  `strictNullChecks: false`, path-alias `@/* → ./src/*`) + `tsconfig.node.json` (kun
  `vite.config.ts`, `strict: true`). Deno edge functions ligger uden for denne tsconfig.
- **ESLint:** flat config (`eslint.config.js`), `typescript-eslint` recommended +
  react-hooks/react-refresh. `@typescript-eslint/no-unused-vars: off`. Ignorerer `dist`.

### Branch-fund (korrigeret)

Der blev antaget en upushet lokal UI-restruktureringsbranch. **Den findes ikke i denne klon.**
Rå bevis:
- `git branch -vv`: kun `main`, `fix/ai-analyse-dedup`, `fix/finansiel-udvikling-dual-akse`
  (begge tracker `origin/`), samt `mcp/sprint-0-recon` (denne).
- `git stash list`: tom. `git worktree list`: kun hoved-working-tree.
- **Reflog gennemgået:** UI-restruktureringsarbejdet har aldrig eksisteret i denne klon (ingen
  skjult ref, ingen slettet branch efterladt i reflog).

**Konklusion:** Ingen monorepo-migrering undervejs lokalt. MCP-placeringen besluttes ud fra
repoets faktiske single-package-struktur. Der er intet Node/backend-workspace at hænge serveren
på i dag — placering (ny top-level pakke vs. edge function vs. nyt workspace) er en designbeslutning
til næste fase.

---

## 2. Worker/backend-lag

**Konklusion: Der findes INTET selvstændigt worker/backend-lag.** Ingen Fastify/Express/Hono/
Koa/Nest nogen steder (eneste grep-hit var falsk positiv: "hon**orar**"). Al server-side kode er
**Supabase Deno edge functions** i `supabase/functions/` (58 functions + `_shared/`).

### Supabase-klient-initialisering (konsistent mønster)

- Klient: `createClient` fra `https://esm.sh/@supabase/supabase-js@2.97.0` (version pinnet).
- **To klient-typer pr. request:**
  - `callerClient` — anon-key + caller's `Authorization`-header → RLS-scoped, til adgangstjek.
  - `adminClient` — service-role-key → bypasser RLS, konstrueres **først efter** auth-gate.

### Env / service-nøgle-håndtering

- Alt via `Deno.env.get(...)` — **aldrig hardcodet**. Nøgler: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY` (AI-gateway).
- Service-role-nøglen eksponeres aldrig i output; bruges kun til `adminClient`-konstruktion eller
  konstant `=== Bearer ${serviceRoleKey}`-sammenligning (Bucket B-gate).

### Delt auth/middleware (`supabase/functions/_shared/`)

- **`edgeFunctionAuth.ts` — kanonisk auth-helper:**
  - `authenticateUser(req)` — validerer JWT via `getClaims` (IKKE `getUser`), returnerer
    `{ callerId, authHeader, callerClient }` eller 401-`Response`.
  - `authenticateServiceRole(req)` — konstant-compare mod `SUPABASE_SERVICE_ROLE_KEY`.
  - eksporteret `corsHeaders`.
- `notificationWriter.ts`, `aiGatewayFetch.ts` — delte side-effect-helpers.
- **Ingen delt fejlhåndterings-middleware.** Hver function håndbygger `Response`-objekter med
  status + `corsHeaders`. Ingen central error-wrapper/logger.

### Tre observerede auth-arketyper (rå bevis)

| Function | Bucket | Mønster |
|---|---|---|
| `run-company-agent` | A + B (dual) | Tjekker `Bearer ${serviceRoleKey}` først (internt cron-kald → fuld tillid); ellers `authenticateUser` → RLS-tjek på `companies` via `callerClient` → `adminClient`. Tvinger `company_id` = request-værdi på alle tool-args (index.ts:1132). |
| `detect-financial-alerts` | A | `authenticateUser` → `has_role(advisor)` ELLER `company_members`-membership via `callerClient` → `adminClient` → defence-in-depth: verificér `report_id` tilhører `company_id`. |
| `run-weekly-agent` | B (cron) | `Deno.cron(...)` — ingen HTTP-overflade; kun service-role `adminClient`. Skippes af CI-auth-værn. |

**Konsekvens for MCP:** Tenant-scoping-mønsteret er allerede kodificeret — validér caller →
RLS-tjek via caller-scoped klient → service-role kun bagefter → tving altid `company_id` fra
verificeret kilde. Bliver MCP en edge function, genbruges `edgeFunctionAuth.ts` direkte; bliver
den et selvstændigt Node-lag, reimplementeres mønsteret.

---

## 3. Databaseskema (migrations-rekonstrueret + live-verificeret, jf. §7)

RLS er slået til på ALLE syv tabeller. SECURITY DEFINER-helpers `user_company_id(uid)` og
`has_role(uid, role)` gater company-scope hhv. roller (admin arver advisor). Kolonnelister nedenfor
afspejler **live-formen** (afstemt mod `information_schema`, §7), ikke den oprindelige CREATE.

### 3.1 Selskaber — `companies` (RLS ✅)

Original CREATE havde kun 4 kolonner; resten tilføjet via 12 senere ALTER-filer.

**Kolonner (live):** `id` uuid PK · `name` text NOT NULL DEFAULT '' · `cvr_number` text (unik-index
hvor ikke-tom) · `created_at` · `industry` · `contact_person/email/phone` · `website` · `address` ·
`postal_code` · `city` · `annual_revenue` numeric · `start_date` date · `end_date` date ·
`status` text DEFAULT 'active' · `slack_channel` · `logo_url` · `industry_code` · `industry_label` ·
`weekly_focus_enabled` bool DEFAULT **true** (default ændret fra false) · `is_legat` bool ·
`application_context` jsonb · `onboarding_completed` bool · `cvr_fetched_at` · `contract_start_date` ·
`contract_end_date` · `subscription_status` · `stripe_customer_id` · `stripe_subscription_id` ·
`subscription_current_period_end` · `offboarding_requested_at` · `intro_session_used_at` ·
`intro_reminder_last_sent_at` · **`is_demo` bool (LIVE-ONLY — se §7).**

**Policies:** Members view/update own (`id = user_company_id(auth.uid())`), Advisors view/update/
insert/delete all (`has_role(advisor)`). ("System can insert companies" blev DROPPED i migration
20260225215048.)

**`company_members` (RLS ✅):** Members view own (`company_id = user_company_id`), Advisors view/
insert/update/delete all (`has_role(advisor)`). ("System can insert company members" DROPPED.)

### 3.2 Uploads/parse-status — `financial_reports` (RLS ✅)

**Parse-status ændret:** original CHECK `('processing','completed','failed')` → **nuværende**
`('processing','processed','error')`, DEFAULT `'processing'`.

**Kolonner (live):** `id` uuid PK · `user_id` uuid (FK auth.users) · `file_name` · `file_path` ·
`report_type` (CHECK udvidet: saldobalance/resultatopgørelse/andet/combined/trial_balance m.fl.) ·
`report_period` · `company_name` · `cvr_number` · `extracted_data` jsonb · `uploaded_at` ·
`processed_at` · `status` (processing/processed/error) · `ai_analysis` jsonb ·
`company_id` uuid **NOT NULL** (FK companies) · `reviewed_at` · `deleted_at` (soft-delete + partial
index) · `raw_extracted_data` jsonb · `normalized_data` jsonb · `validation_status` text ·
`validation_errors` text[] · `extraction_method` text · `manual_report_period_label` ·
`manual_report_period_key` (CHECK `^\d{4}-\d{2}$`) · `manual_report_type` · `manual_normalized_data`
jsonb · `manual_override_note` · `manual_override_by` uuid · `manual_override_at` ·
`manual_override_source` (member/advisor/admin) · `manual_override_status` (draft/applied) ·
`extraction_contract_version` NOT NULL DEFAULT 'v1' · `quality_signals` jsonb.

**Policies:** Company members view/insert/update/delete (`company_id = user_company_id`),
Advisors view/insert/update/delete all (`has_role(advisor)`).

### 3.3 Nøgletal — `financial_report_facts` (RLS ✅)

Committede nøgletal (læst af `run-company-agent` via `get_company_facts`).

**Kolonner (live):** `id` uuid PK · `company_id` uuid NOT NULL (FK) · `period_key` text NOT NULL ·
`period_label` text NOT NULL · `source_report_id` uuid NOT NULL (FK financial_reports) ·
`source_type` text NOT NULL (CHECK udvidet: `canonical/canonical_v2/manual`) · `metrics` **jsonb**
NOT NULL · `committed_at` · `committed_by` uuid · `created_at`. **UNIQUE(company_id, period_key).**

De faktiske KPI-nøgler (`revenue`, `gross_profit`, `ebt`, `net_result`, `cash`, `cogs`, `payroll`,
`admin_costs`) ligger **inde i `metrics`-jsonb'en**, ikke som kolonner.

**Policies:** Company members view own (`company_id = user_company_id`), Advisors view all + delete
(`has_role(advisor)`). **Ingen member/advisor INSERT/UPDATE-policy** — facts skrives kun via
service-role (commit-flow). Read-only for brugere.

### 3.4 Agent-kørsler — INGEN dedikeret tabel

**Der findes ingen `agent_runs`/`agent_log`.** (`trigger_debug_log` blev oprettet og DROPPED igen i
migrations 20260226123752/20260226124136.) En agent-kørsel efterlader spor i output-tabeller:

**`weekly_focus` (RLS ✅)** — agentens dashboard-kort (`update_weekly_focus`), upsert pr.
`(company_id, week_key)`:
- Kolonner: `id` · `company_id` (FK cascade) · `week_key` · `status` (no_data/quiet/active) ·
  `triggers_fired` jsonb · `trigger_data` jsonb · `headline` · `summary` · `actions_generated` int ·
  `data_freshness_days` int · `generated_at` · `seen_at` · `expires_at` (now()+8 dage) · `created_at`.
  UNIQUE(company_id, week_key).
- Policies: Members view own, Advisors view all, **Service role can manage (FOR ALL,
  `auth.role() = 'service_role'`).**

**`company_actions` (RLS ✅)** — agentens `write_company_action`-output:
- Kolonner: `id` · `company_id` (FK cascade) · `user_id` (FK) · `title` · `context` · `source_type`
  (ai_weekly/milestone/handout/manual) · `source_id` · `priority` (high/medium/low) · `status`
  (open/done/parked/dismissed) · `week_key` · `generated_at` · `completed_at` · `dismissed_at` ·
  `created_at` · `updated_at`.
- Policies: Members view/insert/update own, Advisors view/insert/update all, **Service role can
  manage (FOR ALL).**

**`messages` (RLS ✅)** — agentens chat/session-prep-output via `context_type`:
- Kolonner (live): `id` · `conversation_id` (FK conversations, cascade) · `sender_id` (FK auth.users)
  · `content` · `read_at` · `created_at` · `pinned_at` · `edited_at` · **`context_type` · `context_id`
  · `context_meta` jsonb · `message_type`** (bekræftet live, §7).
- **`period_key` er IKKE en kolonne.** Den lever som nøgle inde i `context_meta`-jsonb'en:
  skrives som `{ source, trigger, period_key }` (run-company-agent index.ts:486) og
  `{ source, points, period_key, generated_at }` (index.ts:673); dedup-læses via JSONB-operator
  `.eq("context_meta->>period_key", period_key)` (index.ts:520, 684).
- `write_session_prep` skriver hertil med `context_type='session_prep'` (founder-skjult);
  `write_chat_message` med `context_type='agent'` (founder-synlig).
- Policies (efter flere sikkerheds-patches, DROP+recreate): Members view own (via
  conversation-ejerskab), Advisors view/insert/update/delete all, Members insert i egen
  conversation, Members update/delete egne beskeder (inden 15 min). Immutability-trigger
  `protect_message_immutable_fields` beskytter `sender_id`/`conversation_id`/`created_at`.

### 3.5 Email-log — `email_send_log` (RLS ✅) + støttetabeller

**Skema-drift: tabellen blev fuldstændig udskiftet.** I migration 20260319090407_email_infra.sql
blev den oprindelige `email_send_log` (med `template_id`-FK, `subject`, `is_test`, `sent_at`,
advisor-policies) **RENAMEd til `email_send_log_legacy`**, og en ny tabel oprettet med anden form.

**Kolonner (live):** `id` uuid PK · `message_id` text · `template_name` text NOT NULL ·
`recipient_email` text NOT NULL · `status` text NOT NULL (CHECK:
`pending/sent/suppressed/failed/bounced/complained/dlq`) · `error_message` text · `metadata` jsonb ·
`created_at` · **`subject` text nullable (LIVE-ONLY) · `is_test` bool NOT NULL (LIVE-ONLY) — se §7.**
Unik-index: én `sent`-række pr. `message_id`.

**Policies — service-role-only:** Service role can read/insert/update send log
(`auth.role() = 'service_role'`). Ingen bruger-adgang.

**Støttetabeller (alle RLS ✅, alle service-role-only):**
- `email_send_state` — single-row config (`id INT PK CHECK id=1`): `retry_after_until`, `batch_size`
  (10), `send_delay_ms` (200), `auth_email_ttl_minutes` (15), `transactional_email_ttl_minutes` (60),
  `updated_at`. Policy: service role FOR ALL.
- `suppressed_emails` — `id` uuid PK · `email` text NOT NULL UNIQUE · `reason`
  (unsubscribe/bounce/complaint) · `metadata` jsonb · `created_at`. Policies: service role read+insert.
- `email_send_log_legacy` — den omdøbte gamle tabel; ikke skrivemål længere.

**Konsekvens for MCP:** Email-log er **lukket for bruger-JWT** — kun service-role kan læse. En
MCP-tool der eksponerer email-status skal køre med service-role OG selv tenant-scope: der er
**ingen `company_id` på `email_send_log`** — kobling til selskab må ske via `recipient_email` →
`profiles`/`company_members`, hvilket MCP-designet skal håndtere eksplicit.

### Skema-oversigt

| Delområde | Tabel(ler) | RLS | Bruger-adgang | Service-role |
|---|---|---|---|---|
| Selskaber | `companies`, `company_members` | ✅ | egen company / advisor | bypass |
| Uploads/parse | `financial_reports` | ✅ | egen company / advisor | bypass |
| Nøgletal | `financial_report_facts` | ✅ | read: egen/advisor; ingen member-write | bypass |
| Agent-kørsler | `weekly_focus`, `company_actions`, `messages` | ✅ | egen/advisor | eksplicit `service_role` FOR ALL |
| Email-log | `email_send_log`, `email_send_state`, `suppressed_emails` | ✅ | **ingen** | service-role-only |

---

## 4. Edge functions-inventar (58 functions med `index.ts`)

`[A]` = Bucket A bruger-trigget · `[B]` = Bucket B cron/service · `[C]` = Bucket C webhook (signatur)
· `[?]` = intet synligt auth-prædikat i grep (åbent punkt, §8). **⚠️ = overlapper med planlagte
MCP-tools.**

### Agent-eksekvering (kerne-overlap)

| Function | Bucket | Beskrivelse | Overlap |
|---|---|---|---|
| `run-company-agent` | A (dual A/B) | Kører den autonome company-agent (LLM + tools) for ét event; skriver weekly_focus, session_prep, actions, milestones | ⚠️⚠️ **direkte** |
| `run-weekly-agent` | B (cron man. 07:00) | Ugentlig cron; looper aktive companies, kalder agent-logik | ⚠️ |
| `generate-weekly-focus` | A | Deterministisk (ikke-LLM) generering af weekly_focus-kort | ⚠️ |

### Finansiel data / nøgletal / parse (læse-overlap)

| Function | Bucket | Beskrivelse | Overlap |
|---|---|---|---|
| `extract-financial-data` | A | Parser uploadet rapport → `financial_reports` (raw/normalized) | ⚠️ |
| `extract-annual-report` | A | Parser årsrapport → `financial_report_facts` + `financial_reports` | ⚠️ |
| `validate-facts-parity` | A | Diagnostisk: facts vs reports-parity | ⚠️ |
| `detect-financial-alerts` | A | Anomali-detektion i facts → notifikationer | ⚠️ |
| `generate-financial-commentary` | A | Server-styret kommentar fra facts+budget → `financial_commentaries` | ⚠️ |
| `ai-data-chat` | A | LLM-chat over companies/facts/kpi/milestones/handouts | ⚠️ |
| `ai-financial-feedback` | A | AI-feedback på company-niveau | ⚠️ |
| `get-advisor-alerts` | A | Aggregerer advisor-alerts fra facts/actions/notifications | ⚠️ |
| `save-annual-baseline` | A | Gemmer årsbaseline-facts | ⚠️ |
| `update-annual-report-revenue` | A | Opdaterer årsrapport-omsætning | ⚠️ |
| `generate-ai-forecast` | A | AI-forecast fra facts | ⚠️ |
| `auto-create-baseline-budget` | A | Auto-opretter budget-baseline fra facts | (grænse) |
| `generate-budget-from-accounts` | A | Budget fra kontoplan | (budget) |
| `generate-budget-scenarios` | A | Budget-scenarier | (budget) |
| `import-budget-excel` | A | Importerer budget fra Excel | (budget) |

### Email-lag (overlap med email-log MCP-tool)

| Function | Bucket | Beskrivelse | Overlap |
|---|---|---|---|
| `process-email-queue` | [?] | Worker der drainer pgmq email-kø → `email_send_log` | ⚠️ |
| `send-notification-email` | [?] | Phase-2 email-worker → `email_send_log`/`email_templates`/pgmq | ⚠️ |
| `send-template-email` | [?] | Sender fra template | ⚠️ |
| `send-invitation-email` | [?] | Invitations-email | ⚠️ |
| `send-report-reminder` | [?] | Rapport-påmindelse | ⚠️ |
| `send-pulse-reminder` | [?] | Pulse-påmindelse | ⚠️ |
| `send-engagement-nudge` | [?] | Engagement-nudge-email | ⚠️ |
| `send-monthly-digest` | A | Månedligt digest til founders | ⚠️ |
| `nudge-report-no-reflection` | A | Nudger når rapport committet men ingen refleksion | ⚠️ |
| `auth-email-hook` | C (verifyWebhookRequest) | Supabase auth-email-hook → template-mapping + kø | ⚠️ |

### Ikke-overlappende (tenant/gruppe/betaling/slack/integration)

| Function | Bucket | Beskrivelse |
|---|---|---|
| `admin-add-company-to-group`, `admin-create-group`, `create-group`, `owner-add-company-to-group` | A | Gruppe-administration |
| `admin-cleanup-test-data` | A | Admin: ryd testdata |
| `advisor-broadcast` | A | Advisor broadcast → companies/conversations/messages |
| `manage-advisor` | A | Advisor-administration |
| `attach-user-to-company`, `process-pending-invitation` | A | Signup/invite-håndtering |
| `import-application` | A | Importerer ansøgning + CVR-opslag |
| `create-legat-enrollment`, `upgrade-legat-to-member` | A | Legat-flow |
| `create-stripe-checkout`, `create-subscription-checkout` | [?] | Stripe checkout-session |
| `create-free-intro-booking` | A | Gratis intro-booking |
| `stripe-webhook` | C (stripe-signature) | Stripe webhook |
| `calendly-webhook` | C (HMAC) | Calendly webhook |
| `monday-webhook` | C (HMAC-SHA256) | Monday.com webhook |
| `intro-reminder-cron`, `legat-reminder-cron` | B (Deno.cron) | Daglige påmindelses-cron |
| `notify-chat-reply`, `notify-kpi-comment` | A | In-app notifikationer |
| `send-welcome-message` | A | Velkomstbesked |
| `send-slack-chat-notification`, `-feedback-`, `-handout-`, `-report-notification` | A | Slack-notifikationer |
| `get-chat-attachment-url` | A | Signed URL til chat-vedhæftning |
| `handout-ai-feedback` | A | AI-feedback på handout |

### Nøglefund for MCP-designet

1. **`run-company-agent` er det direkte overlap.** En planlagt MCP "kør agent"-tool må **ikke
   reimplementere** agent-loopet — den skal **kalde** denne function. Den er allerede dual-mode og
   accepterer service-role `Bearer`-kald fra interne kilder (index.ts:902). Genbrug, ikke duplikér.
2. **Læse-tools har rigelig præcedens:** `ai-data-chat`, `get-advisor-alerts`,
   `generate-financial-commentary` viser de præcise query-mønstre (facts/companies/kpi) inkl.
   tenant-scoping, som MCP-læse-tools skal genbruge.
3. **`[?]`-funktioner: auth-mønster uverificeret** i denne recon — se §8 (åbne punkter til fase 2).

---

## 5. Eksisterende afhængigheder (MCP + zod)

**MCP: fuldt greenfield.**
- `@modelcontextprotocol/sdk`: ikke i `package.json`, **0** forekomster i `bun.lock` og
  `package-lock.json`, ikke i `node_modules`.
- Ingen MCP-kode: 0 hits på `modelcontextprotocol|McpServer|StdioServerTransport|mcp.server` i
  `src/` og `supabase/functions/`.
- → SDK'et skal tilføjes fra bunden; intet at genbruge, ingen konflikt.

**zod: findes, men reelt ubrugt i dag.**
- Deklareret direkte: `"zod": "^3.25.76"`, **resolved til præcis `3.25.76`** i `bun.lock` og
  `node_modules`. Altså **zod v3** (ikke v4).
- **0 direkte imports** i `src/`, **0** `zodResolver`/`@hookform/resolvers/zod`-brug, **0** i edge
  functions. Sovende dependency (formentlig Lovable-scaffold-rest).

**Konsekvens:**
1. `@modelcontextprotocol/sdk` kræver zod v3 til tool-schemas — repoet har allerede zod 3.25.76
   pinnet. Ingen versionskonflikt/major-bump.
2. Edge functions bruger håndrullet validering (fx UUID/PERIOD-regex, run-company-agent
   index.ts:920-921). Bliver MCP en edge function, importeres zod via `esm.sh/zod@3.25.76` (pinnet)
   eller vi fortsætter håndrullet validering. Designbeslutning til næste fase.

---

## 6. Testsetup

- **Runner:** vitest 3.2.4. Config `vitest.config.ts`: `environment: jsdom`, `globals: true`,
  `setupFiles: ["./src/test/setup.ts"]` (jest-dom + `matchMedia`-stub),
  **`include: ["src/**/*.{test,spec}.{ts,tsx}"]`**.
- **Kommando:** `bun run test` → `vitest run`. **IKKE** `bun test` (Buns indbyggede runner forstår
  ikke vitest og "passes silently nothing" — advaret eksplicit i `test.yml`).
- **src-tests (6 filer):** rene unit-tests af pure helpers (`parseMetricValue`, `membershipTier`,
  `isCompletedMonth`, `pdfStructuralExtractor`, `PasswordStrengthIndicator`, `useScrollToHash`).
  Mønster: `describe/it/expect` + `vi.mock("@/integrations/supabase/client")` for at stubbe den
  modul-niveau Supabase-klient væk. (CLAUDE.md siger "3 filer" — forældet; der er 6.)

**Edge functions er reelt utestede i CI — ærligt fund.**
- Der findes 5 Deno-test-filer, men **kun** i `extract-financial-data/` (`*_test.ts`), og de tester
  `_shared/canonicalEngine.ts` (ren parse-logik) via `deno test`-konvention
  (`deno.land/std@0.224.0/assert`).
- De køres **ikke** af vitest (forkert glob + Deno-imports), og **ingen CI-workflow kører
  `deno test`**: `test.yml` kører kun `bun run test` (src-only); `edge-function-auth.yml` kører kun
  auth-check-scriptet. De 5 filer er forældreløse.
- **Ingen edge functions HTTP-handler / auth / DB-logik er testet.** `run-company-agent`: 0 tests.
- → **MCP-serveren sætter en NY standard**, hvis den testes. Der er intet eksisterende
  edge-function-test-harness at følge; det skal etableres, ikke genbruges.

---

## 7. Live-verifikation mod `information_schema` (skema-drift bekræftet)

Kolonnelisterne i §3 er rekonstrueret fra migrations og **derefter afstemt mod live-databasen** via
`information_schema`-opslag for alle ti tabeller (inkl. støttetabellerne `email_send_state`,
`suppressed_emails` og `company_members`). **Live-formen er kanonisk.** Afvigelser fundet:

| Tabel | Afvigelse (live har DERUDOVER) | Kilde |
|---|---|---|
| `email_send_log` | `subject` (text, nullable), `is_test` (boolean NOT NULL) | SQL-editor-ALTER, **ikke i migrations** |
| `companies` | `is_demo` (boolean, nullable) | SQL-editor-ALTER, **ikke i migrations** |
| `messages` | `context_type`, `context_id`, `context_meta`, `message_type` bekræftet som kolonner; **ingen `period_key`-kolonne** (ligger i `context_meta`-jsonb, jf. §3.4) | migrations + kildekode |
| `financial_reports` | matcher migrations 1:1 | — |
| `financial_report_facts` | matcher migrations 1:1 | — |
| `weekly_focus` | matcher migrations 1:1 | — |
| `company_actions` | matcher migrations 1:1 | — |
| `email_send_state` | matcher migrations 1:1 | — |
| `suppressed_emails` | matcher migrations 1:1 | — |
| `company_members` | matcher migrations 1:1 | — |

**Skema-drift er et bekræftet mønster, ikke et engangstilfælde.** Mindst to udokumenterede
SQL-editor-ALTERs (`email_send_log.subject`/`is_test` og `companies.is_demo`) findes i live, men
ikke i `supabase/migrations/`. Årsag: historisk er ALTERs kørt direkte i Lovable SQL-editoren uden
tilsvarende migration-fil.

**Anbefaling (backlog):** Opret et afstemnings-punkt der genererer migration-filer for de drift'ede
kolonner (så repoet igen er kanonisk historik), ELLER en tilbagevendende schema-diff-kontrol
(migrations vs. live `information_schema`). MCP-serveren bør **ikke** stole blindt på
migrations-rekonstruktion for kolonne-eksistens — den bør enten kode defensivt (`select` kun kendte
kolonner) eller generere typer fra live-skemaet.

---

## 8. Åbne punkter til fase 2-sikkerhedsreview

1. **`[?]`-auth-funktioner (fra §4)** — intet auth-prædikat blev fundet ved grep i denne recon.
   Skal hver især verificeres: er de Bucket B (service-role-compare), kaldes de kun internt via
   pgmq/cron, eller mangler de reelt en gate? CI-værnet (`check-edge-function-auth.ts`) burde fange
   HTTP+service-role uden prædikat, men det er ikke bekræftet pr. function her.
   - Email-lag: `process-email-queue`, `send-notification-email`, `send-template-email`,
     `send-invitation-email`, `send-report-reminder`, `send-pulse-reminder`, `send-engagement-nudge`.
   - Betaling: `create-stripe-checkout`, `create-subscription-checkout`.
2. **Schema-drift-afstemning** (§7) — udokumenterede live-kolonner bør migreres tilbage til repoet.
3. **Edge-function-testdækning** (§6) — 0 automatiserede tests af edge-function-handlere; ny standard
   skal etableres sammen med MCP-serveren.

---

## Samlet konsekvens for MCP-placering og -design (recon-grundlag, ikke beslutning)

- **Greenfield på tre fronter:** ingen monorepo, intet Node-backend-lag, ingen MCP-kode.
- **To realistiske placeringer:** (a) ny Supabase edge function (genbruger `edgeFunctionAuth.ts`,
  auto-deploy fra merge, Deno-runtime, esm.sh-imports) — eller (b) selvstændig Node-pakke/-service
  (kræver reimplementering af auth-mønsteret + egen deploy-kanal). Beslutning i næste sprint.
- **Genbrug frem for duplikering:** `run-company-agent` kaldes (ikke reimplementeres); læse-tools
  spejler eksisterende query- og tenant-scoping-mønstre.
- **Sikkerhed fra dag ét:** alle MCP-queries tenant-scopes eksplicit; service-role læses fra env og
  eksponeres aldrig; email-log kræver service-role + manuel company-kobling via `recipient_email`.
