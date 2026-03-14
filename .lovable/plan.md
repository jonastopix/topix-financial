

## Google Login Integration

### Udfordringer og løsning

Der er tre scenarier der skal håndteres:

1. **Ny bruger opretter sig med Google** — skal fungere som normal signup (profil oprettes, invitation linkes osv.)
2. **Eksisterende bruger logger ind med Google** — skal matche på email og linke identiteterne
3. **Bruger med anden Google-email** — kan koble Google login via Settings-siden

### Implementeringsplan

#### 1. Opsæt Lovable Cloud Google OAuth
Brug `Configure Social Auth`-værktøjet til at generere `src/integrations/lovable/`-modulet og installere `@lovable.dev/cloud-auth-js`. Google OAuth er automatisk managed af Lovable Cloud — ingen API-nøgler behøves.

#### 2. Tilføj Google-knap på Auth-siden (`src/pages/Auth.tsx`)
- Tilføj en "Log ind med Google" / "Opret med Google" knap over email-formularen
- Separator med "eller" mellem Google og email-login
- Ved invite-flow: send `invite_token` med i redirect URL som query parameter, så det kan opfanges efter OAuth callback
- Kald `lovable.auth.signInWithOAuth("google", { redirect_uri: ... })`

#### 3. Håndter OAuth callback i `useAuth.tsx`
- `onAuthStateChange` fanger allerede `SIGNED_IN` events — dette virker automatisk for Google login
- `handle_new_user` triggeren i databasen opretter profil med `full_name` fra `raw_user_meta_data` — Google leverer dette automatisk
- Invite-token fra URL query params skal læses og behandles efter redirect

#### 4. Tilføj "Tilknyt Google" i Settings (`src/pages/Settings.tsx`)
- Nyt afsnit under profil/password: "Tilknyttede login-metoder"
- Vis om Google er tilknyttet (check `user.identities`)
- Knap til at tilknytte Google via `supabase.auth.linkIdentity({ provider: 'google' })` — dette tillader en anden Google-email end den bruger er oprettet med
- Knap til at fjerne Google-tilknytning hvis der er en password-metode som backup

#### 5. Email-mismatch håndtering
- Lovable Cloud / Supabase håndterer identity linking automatisk — en bruger kan have flere identities (email+password OG Google OAuth) med forskellige emails
- `handle_new_user` triggeren kører kun for helt nye brugere, ikke for identity linking
- Profilen beholder den originale email; Google-identiteten er separat

### Tekniske detaljer
- Lovable Cloud managed Google OAuth kræver ingen opsætning af credentials
- `lovable.auth.signInWithOAuth("google", ...)` bruges i stedet for `supabase.auth.signInWithOAuth`
- `supabase.auth.linkIdentity()` bruges til at tilknytte Google til eksisterende konto
- `user.identities` array viser hvilke providers der er tilknyttet

