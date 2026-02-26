

## Advisor-notifikationer og adgang til originale filer

### Problem
1. Originale rapport-filer gemmes ikke — kun tekst ekstraheres og sendes til AI. Advisors kan ikke se den faktiske fil.
2. Der er ingen tydelig notifikation til advisors, når et medlem uploader en rapport eller udfylder et handout.
3. Advisors kan ikke give feedback baseret på den originale fil.

### Losning

#### 1. Gem originale filer i Storage (per virksomhed)
Uploade den originale fil til `financial-documents` bucket (allerede oprettet, privat) med en sti struktureret som `{company_id}/{report_id}/{filnavn}`. Dette sikrer virksomhedsbaseret organisering og at advisors kan hente filen.

**Filer der andres:**
- `src/components/FileUploadZone.tsx` — Tilfoej `supabase.storage.from("financial-documents").upload(...)` efter rapport-record oprettelse. Opdater `file_path` i DB med den faktiske storage-sti.

#### 2. Storage RLS-politikker
Opret migration der giver:
- Virksomhedsmedlemmer (via `user_company_id`) SELECT/INSERT adgang til filer under deres eget `company_id` prefix
- Advisors fuld SELECT adgang til alle filer

#### 3. Advisor-notifikationstabel
Ny tabel `advisor_notifications` med kolonner:
- `id`, `type` (report_uploaded, handout_completed), `title`, `body`
- `company_id`, `member_id` (hvem udloeste det)
- `reference_id` (rapport-id eller handout-id), `reference_type`
- `read_at`, `created_at`

RLS: Advisors kan laese og opdatere (markere laest). Insert via trigger/applikation.

#### 4. Automatisk oprettelse af notifikationer
- I `FileUploadZone.tsx`: Efter succesfuld upload, insert i `advisor_notifications`
- I handout-save logik: Naar et handout markeres som udfyldt/completed, insert notifikation

#### 5. Notifikations-UI for advisors
- Tilfoej et klokke-ikon med badge i sidebar/header der viser antal ulaeste
- Dropdown/panel med liste over notifikationer
- Hvert element har:
  - Titel (f.eks. "Ny rapport fra Virksomhed X")
  - Klikbar link der navigerer til den relevante rapport/handout
  - For rapporter: Knap til at downloade/se original fil

#### 6. Download original fil fra rapport-visning
- I `Reports.tsx` (advisor-view) og i chat-besked cards med context_type=report:
  - Tilfoej en "Se original fil" knap
  - Genererer signed URL via `supabase.storage.from("financial-documents").createSignedUrl(...)`
  - Aabner filen i nyt vindue

### Teknisk sekvens

1. **Database migration**: Opret `advisor_notifications` tabel + Storage RLS policies
2. **FileUploadZone.tsx**: Tilfoej storage upload + notifikation-insert
3. **Handout completion**: Tilfoej notifikation-insert naar handout udfyldes
4. **Ny komponent**: `AdvisorNotifications.tsx` — klokke-ikon med dropdown
5. **AppSidebar.tsx**: Integrer notifikationskomponenten for advisors
6. **Reports.tsx / Chat.tsx**: Tilfoej "Se original fil" knap med signed URL download

### Afgraensning
- Notifikationer er kun for advisors (medlemmer har allerede aktivitetsfeed)
- Real-time opdatering via Supabase subscription paa `advisor_notifications`
- Filer gemmes privat med signed URLs (udloeber efter 1 time)
