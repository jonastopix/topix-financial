

## Problemer identificeret

Der er fire separate problemer:

### 1. "Inviteret som kontakt@topix.dk" vises forkert på MemberDetail
**Årsag:** Logikken i `MemberDetail.tsx` (linje 199-215) finder "invitation mismatch" ved at hente de seneste 10 invitationer for virksomheden og finde den første med en anden email end brugerens. Den finder `kontakt@topix.dk` (som er en helt anden invitation) og konkluderer fejlagtigt at Jonas blev "inviteret som kontakt@topix.dk".

**Fix:** Ændr logikken så den kun viser mismatch hvis invitationen har `status = 'accepted'` OG invitationens email matcher det tidspunkt brugeren blev oprettet (dvs. kig på om der faktisk er en invitation der blev accepteret af denne bruger). Bedste tilgang: match via `accepted_at` tæt på brugerens `created_at`, eller endnu bedre — gem `accepted_by_user_id` på invitationen i `handle_new_user` triggeren.

**Simplere kortsigtet fix:** Fjern den fejlbehæftede heuristik og erstat med en direkte lookup: find en invitation med `status = 'accepted'` hvor `email != profil-email`, og hvor ingen anden bruger har den invitation-email. Alternativt: tilføj `accepted_by` kolonne til `company_invitations` i `handle_new_user` triggeren.

### 2. Signup-link viser generel URL uden token
**Årsag:** `CompanyInvitations.tsx` linje 196 hardcoder `https://topix.lovable.app/auth` som signup-link, uden invitation-token. Det burde enten vise det specifikke invite-link med token, eller slet ikke vise et generelt link (da det ikke kobler til virksomheden).

**Fix:** Fjern den generelle "Del signup-linket" tekst. Invitationsmailen indeholder allerede det korrekte link med token. Alternativt: vis per-invitation det specifikke link med token.

### 3. Accepteret invitation nulstilles ikke ved sletning af teammedlem
**Årsag:** Når et teammedlem fjernes via `manage-advisor` edge function, nulstilles invitationen ikke. Den forbliver `accepted`, hvilket forhindrer geninvitation.

**Fix:** I `manage-advisor`'s `remove-member` action: nulstil relaterede `company_invitations` til `pending` (eller slet dem), så brugeren kan inviteres igen.

### 4. Kontaktperson-kobling i Members-oversigten
**Årsag:** Members-oversigten bruger `companies.contact_person` feltet, som ikke nødvendigvis matcher den faktiske ejer/bruger. For Topix vises `-` fordi `contact_person` er tomt. Dette er korrekt, men kan virke forvirrende.

---

## Plan

### A. Tilføj `accepted_by` kolonne (migration)
```sql
ALTER TABLE company_invitations ADD COLUMN accepted_by uuid;
```
Opdatér `handle_new_user` trigger til at sætte `accepted_by = NEW.id` ved accept.

### B. Fix MemberDetail invitation-mismatch (MemberDetail.tsx)
Erstat den nuværende heuristik (linje 199-215) med et præcist opslag: find invitation hvor `accepted_by = userId` og `email != profil-email`.

### C. Fix signup-link i CompanyInvitations (CompanyInvitations.tsx)
Fjern den generelle signup-URL (linje 291-293). Vis i stedet per-invitation det specifikke invite-link med token for pending invitationer.

### D. Nulstil invitation ved fjernelse af medlem (manage-advisor edge function)
I `remove-member` action: nulstil `company_invitations` med `accepted_by = target_user_id` til `status = 'pending'`, `accepted_at = null`, `accepted_by = null`.

### Filer der ændres
- **Migration:** Tilføj `accepted_by` kolonne + opdatér `handle_new_user` trigger
- `src/pages/MemberDetail.tsx` — fix invitation-mismatch logik
- `src/components/CompanyInvitations.tsx` — fix signup-link til per-invitation token-link
- `supabase/functions/manage-advisor/index.ts` — nulstil invitation ved member removal

