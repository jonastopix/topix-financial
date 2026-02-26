
# E-mail Administration for Advisors

## Oversigt
Opret et nyt admin-menupunkt "E-mail skabeloner" hvor advisors kan oprette, redigere og administrere e-mail-skabeloner med visuel redigering, tekstredigering og betingelsesbaserede triggers -- alt styret fra databasen.

## Arkitektur

### Database: `email_templates` tabel
Ny tabel der gemmer skabeloner med:
- `id`, `name` (internt navn, f.eks. "Rapport-påmindelse")
- `subject` (e-mail emne med variable-placeholders som `{{period}}`, `{{company_name}}`)
- `body_html` (HTML indhold med inline styles, redigerbar)
- `sender_name` (f.eks. "The Boardroom")
- `sender_email` (f.eks. "noreply@boardroom.topix.dk")
- `trigger_type` enum: `cron` | `event` | `manual`
- `trigger_config` JSONB: for cron = `{"schedule": "0 8 5 * *"}`, for event = `{"event": "report_missing"}`, for manual = `{}`
- `enabled` boolean
- `variables` JSONB: liste af tilgængelige variable (til UI-hjælp)
- `created_at`, `updated_at`, `updated_by`

RLS: Kun advisors kan CRUD.

### Frontend: Ny side `/admin/emails`

**1. Oversigtsside**
- Liste over alle e-mail-skabeloner med navn, trigger-type, aktiv/inaktiv toggle
- "Opret ny skabelon" knap
- "Send test" knap pr. skabelon

**2. Redigeringsside (dialog/inline)**
- **Tekst-tab**: Rediger subject og body_html som ren tekst/kode med variable-placeholders
- **Visuel-tab**: Live preview af e-mailen med eksempeldata indsat i variables
- **Trigger-tab**: Opsæt betingelser:
  - Cron-schedule (med dansk forklaring, f.eks. "Den 5. i hver måned kl. 08:00")
  - Event-baseret (rapport mangler, ny bruger oprettet etc.)
  - Manuel (send via knap)
- **Indstillinger**: Afsendernavn, afsender-email, aktiv/inaktiv

**3. Test-funktion**
- Indtast en test-email og send preview direkte

### Edge Function: `send-template-email`
Ny generisk edge function der:
1. Henter skabelon fra `email_templates` via ID
2. Erstatter variable-placeholders med faktiske værdier
3. Sender via Resend
4. Understøtter test-mode med `test_email` parameter

### Opdater eksisterende `send-report-reminder`
Modificer den til at hente sin skabelon fra `email_templates` i stedet for hardcoded HTML. Fallback til den nuværende hardcoded skabelon hvis ingen template findes.

### Navigation
Tilføj "E-mail skabeloner" med `Mail`-ikon til `advisorNavItems` i AppSidebar.

## Implementeringsrækkefølge

1. Opret `email_templates` tabel med RLS-politikker
2. Seed default skabelon (rapport-påmindelse) med den eksisterende HTML
3. Opret `/admin/emails` side med liste og redigeringsformular
4. Tilføj route og sidebar-navigation
5. Opret `send-template-email` edge function
6. Opdater `send-report-reminder` til at læse fra `email_templates`

## Tekniske detaljer

- Body-redigering bruger en `<textarea>` med monospace font til HTML, plus en live-preview `<iframe>` ved siden af
- Variable-system: `{{variable_name}}` syntax, erstattes server-side med `String.replace`
- Cron-schedule vælger: Dropdown for dag-i-måned + tidspunkt, genererer cron-expression automatisk
- Trigger-config gemmes som JSONB for fleksibilitet til fremtidige trigger-typer
- Preview renderes client-side ved at erstatte variables med eksempeldata
