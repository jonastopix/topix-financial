

## Gensend invitationer til alle pending medlemmer

### Baggrund
Der er 30 virksomhedsinvitationer med status "pending". Signup-linket i koden peger allerede korrekt til `https://topix.lovable.app/auth?mode=signup`. Vi tilføjer en knap så rådgivere kan gensende invitations-emails til alle pending modtagere med et enkelt klik.

### Teknisk ændring

**Fil: `src/pages/Members.tsx`**

Tilføj en "Gensend alle pending invitationer"-knap i advisor-sektionen (ved siden af eksisterende bulk-funktioner):

1. Knappen henter alle `company_invitations` med `status = 'pending'` inklusiv virksomhedsnavne
2. Viser en bekræftelsesdialog med antal modtagere
3. Ved bekræftelse: itererer sekventielt gennem listen og kalder `send-invitation-email` edge function for hver med:
   - `email`: invitationens email
   - `company_name`: virksomhedens navn
   - `signup_url`: `https://topix.lovable.app/auth?mode=signup`
4. Viser real-time progress (fx "Sender 5/30...")
5. Ved afslutning: toast med antal succesfulde/fejlede

### Sikkerhed
- Kun synlig for advisors (eksisterende `isAdvisor` guard)
- Bruger den eksisterende `send-invitation-email` edge function som allerede validerer JWT
- Ingen database-ændringer nødvendige — invitationerne forbliver "pending"

### UI-placering
Knappen placeres i advisor-toolbaren på Members-siden, med et `RefreshCw`-ikon og teksten "Gensend pending invitationer".
