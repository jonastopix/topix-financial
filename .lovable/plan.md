

## Gensend invitation til specifik virksomhed

### Hvad der bygges
En "Gensend invitation"-knap i den udvidede virksomhedsvisning pa Members-siden, sa radgivere kan gensende invitations-emailen til virksomheder der allerede har en pending invitation.

### Funktionalitet
- Nar en virksomhed udvides, vises en "Gensend invitation"-knap i Actions-sektionen, hvis der findes en pending invitation for virksomheden
- Knappen gensender invitations-emailen via den eksisterende `send-invitation-email` edge function
- Der oprettes IKKE en ny invitation-record -- den eksisterende pending invitation genbruges
- En bekraftelses-toast vises efter afsendelse

### Teknisk implementation

**Fil: `src/pages/Members.tsx`**

1. Udvid `loadCompanies` til ogsa at hente `company_invitations` med status `pending`, og tilfoej invitation-data (email, company_id) til `CompanyData`-interfacet
2. Tilfoej en `handleResendInvitation`-funktion der:
   - Finder den pending invitation for virksomheden
   - Kalder `send-invitation-email` edge function med den eksisterende invitations email og virksomhedsnavn
   - Viser success/error toast
3. Tilfoej en "Gensend invitation"-knap i Actions-sektionen (ved linje ~977-1004), med `Send`-ikon, der kun vises nar virksomheden har en pending invitation
4. Tilfoej loading-state for gensend-handlingen

### UI
- Knappen placeres i "Rapporter & Chat"-boksen sammen med de andre action-knapper
- Stil: sekundar knap med `Send`-ikon, tekst "Gensend invitation"
- Knappen disables under afsendelse og viser en spinner

### Ingen databaseaendringer nødvendige
Den eksisterende `send-invitation-email` edge function og `company_invitations`-tabellen genbruges som de er.
