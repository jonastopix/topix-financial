

# Plan: Månedlige rapporterings-påmindelser via email

## Oversigt
Opsætning af automatiske email-påmindelser til medlemmer, der ikke har uploadet deres månedlige rapport. Påmindelser sendes d. 10. og d. 20. i den efterfølgende måned. Hvis rapporten allerede er uploadet, sendes ingen mail.

## Komponenter

### 1. Email-template til påmindelse
Ny fil: `supabase/functions/send-report-reminder/_templates/reminder.tsx`
- React Email template i samme stil som den eksisterende invitations-template
- Viser virksomhedsnavn og hvilken måned der mangler rapport for
- CTA-knap der linker til rapporteringssiden

### 2. Edge Function: `send-report-reminder`
Ny fil: `supabase/functions/send-report-reminder/index.ts`
- Kaldes via cron (ingen JWT-verifikation, men validerer en intern header/secret)
- Logik:
  1. Beregn hvilken måned der skal tjekkes (forrige måned ift. dags dato)
  2. Hent alle virksomheder med deres medlemmer (via `companies` + `company_members` + `profiles`)
  3. For hver virksomhed: tjek om der findes en `financial_reports`-record for den pågældende periode
  4. Hvis IKKE: hent medlemmets email og send påmindelse via Resend
- Bruger eksisterende `RESEND_API_KEY` og `EMAIL_SENDING_ENABLED` test-mode toggle
- Logger hvilke mails der sendes/skippes

### 3. Cron-job via pg_cron
To scheduled jobs:
- **10. i hver måned kl. 08:00 UTC**: Kalder `send-report-reminder` edge function
- **20. i hver måned kl. 08:00 UTC**: Kalder `send-report-reminder` edge function

Bruger `pg_cron` + `pg_net` til at kalde edge function via HTTP POST.

### 4. Konfiguration i `supabase/config.toml`
Tilføj `verify_jwt = false` for den nye function.

## Tekniske detaljer

### Rapport-periode matching
`financial_reports.report_period` indeholder perioden som tekst (f.eks. "Februar 2026"). Edge function matcher dette mod den forventede periode for at afgøre om rapport er indleveret.

### Email-indhold
- Emne: "Påmindelse: Rapport for [måned] mangler"
- Afsender: `MOLA Founder <noreply@boardroom.topix.dk>` (samme som invitation)
- Indhold: Kort besked om at rapporten mangler, med link til platformen

### Sikkerhed
- Edge function tjekker en authorization header (service role key fra cron)
- Respekterer `EMAIL_SENDING_ENABLED` toggle ligesom invitation-emails

### Berørte filer
- **Ny**: `supabase/functions/send-report-reminder/index.ts`
- **Ny**: `supabase/functions/send-report-reminder/_templates/reminder.tsx`
- **Opdateret**: `supabase/config.toml` (tilføj function config)
- **Database**: Aktivér `pg_cron` + `pg_net` extensions, opret 2 cron schedules

