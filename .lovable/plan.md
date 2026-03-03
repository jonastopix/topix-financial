

## Plan: Forenkl Monday-webhook og led brugere til Indstillinger efter tour

### Overblik

To ændringer:

1. **Monday-webhook**: Stop med at oprette virksomhed. Send kun en invitation til kontaktpersonens email. Brugeren opretter selv sin virksomhed ved signup (via `handle_new_user` triggeren, som allerede opretter en default virksomhed hvis ingen invitation matcher).

2. **Guided Tour**: Efter tourens afslutning, navigér brugeren til `/settings` så de kan udfylde virksomhedsnavn, CVR, logo etc.

---

### Tekniske detaljer

#### 1. Monday-webhook (`supabase/functions/monday-webhook/index.ts`)

Nuværende flow: Webhook modtager "I gang" status → opretter virksomhed i `companies` → opretter invitation → sender email.

Nyt flow: Webhook modtager "I gang" → henter kontaktpersonens email fra Monday → opretter invitation **uden company_id** (eller opretter en "placeholder" invitation) → sender email.

**Problem**: `company_invitations` tabellen kræver `company_id` (NOT NULL). To muligheder:

- **A)** Gør `company_id` nullable i `company_invitations` og tilpas `handle_new_user` til at håndtere invitationer uden company_id (brugeren opretter selv sin virksomhed).
- **B)** Behold virksomhedsoprettelsen men gør den minimal (kun navn fra Monday-item). Fjern al den detaljerede metadata-mapping, da brugeren selv udfylder det i Settings.

**Anbefaling: Option B** — Behold den enkle virksomhedsoprettelse med kun navnet fra Monday. Fjern den detaljerede GraphQL-fetch af metadata (CVR, adresse, telefon etc.), da brugeren selv udfylder det i Settings. Dette kræver ingen databaseændringer og `handle_new_user` fungerer uændret.

Konkret:
- Fjern `fetchMondayItemData()` og `COLUMN_MAPPING` for metadata-felter
- Behold kun hentning af `contact_email` (via simpel GraphQL eller column mapping)
- Opret virksomhed med kun `name: pulseName`
- Resten forbliver som nu (invitation + email)

#### 2. Guided Tour → Settings redirect (`src/components/GuidedTour.tsx`)

- Ændre sidste steps tekst til at nævne at de nu skal udfylde virksomhedsoplysninger
- I `finish()` funktionen: efter at gemme `tour_completed_at`, navigér til `/settings` i stedet for blot at lukke touren
- Kræver at `onComplete` callback modtager en navigation-instruktion, eller at GuidedTour selv bruger `useNavigate`

#### 3. Index.tsx

- Ingen ændring nødvendig — `onComplete` callback lukker touren, og GuidedTour håndterer navigation internt.

---

### Filer der ændres

| Fil | Ændring |
|-----|---------|
| `supabase/functions/monday-webhook/index.ts` | Fjern metadata-mapping, behold kun email-hentning + simpel virksomhedsoprettelse |
| `src/components/GuidedTour.tsx` | Tilføj `useNavigate`, opdater sidste step tekst, navigér til `/settings` ved afslutning |

