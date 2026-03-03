

# Token-baseret invitationssystem

## Problem i dag
Invitationer er bundet til en specifik e-mail. Hvis en bruger opretter sig med en anden e-mail, bliver de ikke tilknyttet virksomheden. Det skaber dubletter og forvirring.

## Løsning
Invitationslinket indeholder et unikt token (allerede i `company_invitations.token`). Når en bruger klikker linket og opretter sig — uanset hvilken e-mail de bruger — tilknyttes de automatisk den rigtige virksomhed.

## Hvad ændres

### 1. Auth-siden (`src/pages/Auth.tsx`)
- Læs `invite` query-parameter fra URL
- Gem token i signup-metadata: `data: { full_name, invite_token }`
- Vis evt. virksomhedsnavnet på signup-formularen ("Du er inviteret til X")

### 2. Database-trigger (`handle_new_user`)
- **Først** tjek om `raw_user_meta_data->>'invite_token'` er sat
- Slå token op i `company_invitations` (status=pending)
- Tilknyt bruger til virksomheden via `company_members`
- Marker invitation som accepted
- **Dernæst** fald tilbage til email-matching (bagudkompatibilitet)

### 3. Signup-URL med token
Alle steder der genererer signup_url ændres:
- `src/pages/Members.tsx` — advisor-invitationer
- `src/components/CompanyInvitations.tsx` — team-invitationer  
- `supabase/functions/send-invitation-email/index.ts` — email-template
- `supabase/functions/monday-webhook/index.ts` — automatiske invitationer

Format: `https://topix.lovable.app/auth?mode=signup&invite=<token>`

### 4. Edge function (`process-pending-invitation`)
Tilføj token-baseret lookup som supplement til email-matching, så login-fallback også virker med tokens.

### 5. Email-template
Opdater teksten så den ikke siger "med denne e-mail" men i stedet fokuserer på virksomhedstilknytning.

## Sikkerhed
- Tokens er allerede UUID'er (svære at gætte)
- Kun pending-invitationer accepteres
- En invitation kan kun bruges én gang
- Eksisterende email-matching bevares som fallback

## Filer der ændres
- `src/pages/Auth.tsx` — læs invite-token, send i metadata
- `src/pages/Members.tsx` — inkluder token i signup_url
- `src/components/CompanyInvitations.tsx` — inkluder token i signup_url
- `supabase/functions/send-invitation-email/index.ts` — modtag/inkluder token
- `supabase/functions/process-pending-invitation/index.ts` — token-lookup
- Database migration: opdater `handle_new_user` trigger til at tjekke token først

