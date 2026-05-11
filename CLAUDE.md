# CLAUDE.md

The Boardroom — finansiel rådgivnings-platform for SMV'er bygget på Supabase + Vite/React.

## Kommandoer

```sh
bun install
bun dev
bun test
bun lint
```

## Deployment af migrationer

Dette projekt kører på Lovable Cloud — Lovable ejer Supabase-projektet (ref: `loiavmastgeieqyiwyyr`). Det betyder:

- `supabase db push` virker IKKE. CLI fejler med "necessary privileges"-fejl fordi udviklerens konto ikke ejer projektet.
- `supabase link --project-ref ...` fejler af samme årsag.
- Migrationer skrevet i `supabase/migrations/` deployes ved at køre SQL'en manuelt i Lovable → SQL editor.

Workflow ved nye migrationer:
1. Skriv migration-fil i `supabase/migrations/<timestamp>_<navn>.sql`.
2. Commit + PR + merge til main (almindeligt git-flow).
3. Efter merge: åbn Lovable → SQL editor, paste migrationens SQL-body (uden migration-kommentaren øverst hvis ønsket), kør Run.
4. Verificér med `SELECT pg_get_functiondef(...)` eller anden passende query.

Migrationsfilen i repoet er kanonisk historik — Lovable's SQL editor er den faktiske eksekverings-kanal.

## Deployment af edge functions

Edge functions auto-deployer fra git-merge til main. Bekræftet empirisk via canary-eksperimentet i PR #15/16 (2026-05-11): kommentar-ændring i `get-advisor-alerts` var live i prod-koden ("View code") efter merge, FØR "Update"-knap blev klikket. Frontend-canary samme PR krævede derimod Update-klik for at blive synlig.

CLI-kanalen (`supabase functions deploy <name>`, `supabase functions list`) fejler med 403/privileges, samme klasse af fejl som `supabase db push`. Lovable Cloud hoster Supabase-projektet, og udviklerens egen CLI-konto har ikke management-rettigheder. CLI er ikke deploy-kanalen.

Workflow ved nye eller ændrede functions:
1. Skriv/redigér function-fil under `supabase/functions/<name>/`.
2. Commit + PR + merge til main (almindeligt git-flow).
3. Hvis PR'en også rører `src/`-filer: klik "Update" i Lovable for at publish'e frontend-builden.
4. Verificér i Lovable → Edge functions → vælg function → "View code".

UI-quirk ved verifikation: feltet "Last updated" på function-listen er IKKE pålideligt — det kan vise forældet timestamp efter en fersk deploy. "Deployments"-tælleren eller den faktiske source-kode i "View code" er sandheden. Hvis "Deployments"-tælleren heller ikke synes at opdatere pålideligt, er "View code" det definitive bevis. Brug aldrig "Last updated" til at konkludere om en deploy er gået igennem.

**Asymmetri-note** (bekræftet 2026-05-11): De tre deploy-lag har forskellige kanaler:
- **Edge functions** (`supabase/functions/`): auto fra git-merge til main. Ingen manuel handling påkrævet.
- **Frontend** (`src/`): manuel via Lovable "Update"-knap. Et merge alene aktiverer Update-knappen men ændrer ikke prod-builden på `app.theboardroom.dk` før klikket.
- **Migrationer** (`supabase/migrations/`): manuel via Lovable → SQL editor. Hverken merge eller Update trigger migrations-deploy.

## Deployment af frontend

Frontend-koden under `src/` (Vite-build til `app.theboardroom.dk`) deployes IKKE automatisk fra git-merge. Lovable's UI viser en "Update"-knap når der er en ny version klar — klik den for at re-builde og publish'e den nye frontend-build.

"Update"-knappen er den eneste kanal for frontend-ændringer. Et merge til main lægger koden i repoet, men prod-builden på `app.theboardroom.dk` opdateres først efter klikket.

## Stack

Vite + React 18 + TypeScript + shadcn-ui + Tailwind på frontend.
Supabase (Postgres + Auth + Edge Functions/Deno) på backend.
Bootstrappet via Lovable (`@lovable.dev/cloud-auth-js`, `lovable-tagger`, `@lovable.dev/webhooks-js`).
Sentry, TanStack Query, React Router v6, react-hook-form + zod, Tiptap.
Integrationer: Stripe, Slack, Circle (community), Monday.com webhook, pdfjs-dist + xlsx (regnskabsparsing).

## Arkitektur

**Tenant-model**: `companies` er rod-entiteten. Brugere knyttes via `company_members`. Helper-funktionen `user_company_id(uid)` (SECURITY DEFINER) returnerer brugerens company_id og bruges i alle company-scoped RLS-policies.

**Roller**: enum `app_role` med værdier `member` | `advisor` | `admin`. Tjekkes via `has_role(uid, role)` (SECURITY DEFINER). Admin arver advisor — `has_role(x, 'advisor')` returnerer true hvis x har `admin`.

**RLS-mønstre** (alle policies er RESTRICTIVE — stacker med AND):
- Company-scoped: `company_id = user_company_id(auth.uid())`.
- Advisor-bred: `has_role(auth.uid(), 'advisor')` — fuld read, scoped write.
- Admin-only: `has_role(auth.uid(), 'admin')` — for `app_config`, `user_roles`.
- Self-only: `auth.uid() = user_id` — for `profiles`, ejer-ops på `handouts` og `financial_reports`.
- Service-role-only tabeller (ingen klient-mutation): `slack_*_log`, `circle_*`, `email_send_*`, `*_oauth_*`.

**Edge function-buckets**. Alle functions har `verify_jwt = false` i `supabase/config.toml` — det er bevidst pga. Supabases signing-keys-system, og konsekvensen er at hver function SKAL validere selv før første service-role-handling.
- **Bucket A — bruger-trigget**: kald `authenticateUser(req)` FØRST. Brug derefter `callerClient` (JWT-scoped) til RLS-tjek af target-ressourcen, før service-role-klienten konstrueres.
- **Bucket B — service-role/cron**: kald `authenticateServiceRole(req)` FØRST. Afvis alt der ikke bærer service-role-nøglen.
- **Bucket C — eksterne webhooks**: per-funktion signaturverifikation FØR parsing (HMAC-SHA256 for Monday.com, `verifyWebhookRequest` for auth-hook, Stripe-signature for Stripe).

**Immutability-triggers** (BEFORE UPDATE) blokerer ændring af identitets-/audit-felter, selv hvis RLS-policies skulle slække:
- `protect_message_immutable_fields` på `messages`: `sender_id`, `conversation_id`, `created_at`.
- `protect_handout_immutable_fields` på `handouts`: `user_id`, `company_id`, `created_at`.

**Signup**: `handle_new_user()` AFTER INSERT på `auth.users` orkestrerer fire grene:
1. Token-baseret invite (matcher `company_invitations.token`).
2. Email-baseret invite (kræver `email_confirmed_at` — ellers fail-closed).
3. Advisor-invite (matcher `advisor_invitations.email`).
4. Ny virksomhed (når intet invite-match findes).

Se `supabase/SECURITY_BASELINE.md` for den autoritative checklist.

## FORBIDDEN uden eksplicit grønt lys

- Ændring af `has_role()`, `user_company_id()` eller andre SECURITY DEFINER-funktioner.
- Ændring af `handle_new_user()` eller andre triggers på `auth.users`.
- Ændring af `protect_*_immutable_fields`-triggers.
- Migration-squash. Afvent 2–4 ugers prod-validering iht. SECURITY_BASELINE.md afsnit 8.
- Forsøg på `supabase db push` eller `supabase link` (vil fejle pga. Lovable Cloud-ejerskab).
- Sætte `verify_jwt = true` på edge functions uden verificering af alle kald-stier.
- Ændre tsconfig strict-flags i denne PR. Skal være dedikeret refactor.

## Nye edge functions — påkrævet mønster

- **Bucket A**: `authenticateUser(req)` FØR nogen service-role-handling. Brug `callerClient` til RLS-tjek af target-ressourcen før service-role-klienten oprettes.
- **Bucket B**: `authenticateServiceRole(req)` først.
- **Bucket C**: signaturverifikation før parsing af payload.
- Pinn altid versioner i `esm.sh`-imports. Ingen `@2` — brug `@2.97.0`.

## Nye migrations

- Filnavn: `<YYYYMMDDHHMMSS>_<beskrivelse>.sql`.
- Hvis migrationen rører noget der står i `supabase/SECURITY_BASELINE.md`, opdater baseline-dokumentet i samme PR.
- Ingen `DROP POLICY` uden begrundelse i migration-kommentar.

## Git-flow

- Lovable skriver til `main`. Claude Code arbejder altid på feature-branches → PR → merge.
- Pull før hver session: `git pull origin main`.
- Lovable og Claude Code skriver ALDRIG samtidig.

## Test

- `bun test` skal være grøn før commit.
- Coverage er pt. minimal (3 filer: `src/test/example.test.ts`, `src/hooks/__tests__/useScrollToHash.test.tsx`, `src/lib/__tests__/pdfStructuralExtractor.test.ts`).
- Nye security-kritiske stier (RLS, triggers, RPC, edge function-auth) bør have test før merge.

## Dokumentations-disciplin

- Ved arkitektur-ændring: opdater `CLAUDE.md` i samme PR.
- Ved baseline-relevant ændring: opdater `supabase/SECURITY_BASELINE.md` i samme PR.
