# CLAUDE.md

The Boardroom — finansiel rådgivnings-platform for SMV'er bygget på Supabase + Vite/React.

## Kommandoer

```sh
bun install
bun dev
bun test
bun lint
supabase db push
supabase functions deploy <name>
```

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
