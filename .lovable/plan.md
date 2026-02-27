

## Vis mailadresse på medlemsdetaljesiden

### Problem
Mailadressen for brugere vises ikke på `/members/:userId`-siden. Dette gør det svært at identificere dubletter (som Line Almegaard Bakke-situationen, hvor samme person muligvis har oprettet sig med en anden mailadresse end den, der blev inviteret).

### Løsning
Tilføj en `email`-kolonne til `profiles`-tabellen, udfyld den automatisk ved oprettelse, backfill eksisterende brugere, og vis den på medlemsdetaljesiden.

### Tekniske ændringer

**1. Database-migration**
- Tilføj `email text` kolonne til `profiles`
- Opdatér `handle_new_user()`-triggeren til at gemme `NEW.email` i profilen
- Backfill eksisterende profiler med email fra `auth.users`

**2. `src/pages/MemberDetail.tsx`**
- Udvid profil-query til at inkludere `email`
- Vis mailadressen i member header-sektionen med et Mail-ikon
- Vis også den inviterede mailadresse fra `company_invitations` hvis den afviger (så man nemt kan se om brugeren har brugt en anden mail end invitationen)

**3. Vis inviteret email (bonus)**
- Hent eventuel invitation fra `company_invitations` for brugerens virksomhed
- Hvis inviteret email afviger fra profil-email, vis begge med tydelig markering

Dette løser også mysteriet med dubletter: man kan se om en person har brugt en anden mailadresse end den, de blev inviteret på.

