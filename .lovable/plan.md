

# Plan: Test det fulde invitation- og onboarding-flow

## Udfordring

`handle_new_user`-triggeren korer kun ved **ny bruger-oprettelse** (INSERT i auth.users). Hvis vi bare fjerner dig fra company_members og opretter en invitation, vil triggeren aldrig fyre igen nar du logger ind -- fordi din auth-bruger allerede eksisterer.

## Losning: To-trins tilgang

### Trin 1 -- Tilfoej "invitation-check ved login" i koden

Udbyg `useAuth`-hooket, saa det efter login tjekker om brugeren mangler en virksomhedstilknytning (ingen company_members-raekke) OG har en ventende invitation. Hvis ja, koer den samme logik som triggeren: tilknyt til virksomheden, opret conversation, marker invitation som accepteret.

Dette er ogsaa en vaerdifuld forbedring for produktionen -- det haandterer edge cases hvor triggeren fejler, eller en bruger allerede havde en konto foer de blev inviteret.

**Filer der aendres:**
- `src/hooks/useAuth.tsx` -- tilfoej en `checkPendingInvitation`-funktion i `fetchUserData` der:
  1. Hvis brugeren ikke har nogen company_members-raekke
  2. Og der findes en pending invitation med matchende email
  3. Kalder en ny edge function til at processere invitationen (da vi har brug for service_role for at laese/skrive paa tvaers af RLS)

- Ny edge function `process-pending-invitation/index.ts`:
  1. Modtager user_id og email
  2. Finder pending invitation (case-insensitive)
  3. Indsaetter company_members-raekke
  4. Opretter conversation
  5. Markerer invitation som accepteret
  6. Returnerer company_id og company_name

### Trin 2 -- Forbered testdata via database

Naar koden er klar:

1. **Fjern dig fra company_members** for din nuvaerende virksomhed (Topix.dk)
2. **Nulstil onboarded_at** i profiles-tabellen (saa onboarding-siden vises)
3. **Opret en invitation** i company_invitations for din email til Topix.dk-virksomheden

Derefter logger du ud og ind igen. Flowet bliver:
1. Login med eksisterende credentials
2. `useAuth` opdager ingen company_members + finder pending invitation
3. Edge function tilknytter dig til virksomheden
4. `onboarded_at` er null → redirect til /onboarding
5. Du udfylder onboarding → lander paa dashboard

## Tekniske detaljer

### Ny edge function: `process-pending-invitation`

```text
Input:  { user_id, email }
Output: { success, company_id, company_name }

Logik:
1. SELECT fra company_invitations WHERE lower(trim(email)) = lower(trim(input.email)) AND status = 'pending'
2. INSERT INTO company_members (company_id, user_id, role) VALUES (invitation.company_id, user_id, 'member')
3. INSERT INTO conversations (member_id, company_id) VALUES (user_id, invitation.company_id)
4. UPDATE company_invitations SET status = 'accepted', accepted_at = now() WHERE id = invitation.id
5. SELECT name FROM companies WHERE id = invitation.company_id
```

### AEndringer i useAuth.tsx

I `fetchUserData`, efter company_members-queryen returnerer null:
- Kald edge function med brugerens id og email
- Hvis succesfuld, saet ownCompanyId/ownCompanyName med det returnerede resultat

### Database-operationer for test

```text
1. DELETE FROM company_members WHERE user_id = '<dit-user-id>' AND company_id = '<topix-company-id>'
2. UPDATE profiles SET onboarded_at = NULL WHERE user_id = '<dit-user-id>'
3. INSERT INTO company_invitations (company_id, email, invited_by) VALUES ('<topix-company-id>', '<din-email>', '<advisor-user-id>')
```

## Resultat

- Fuldt testbart flow uden at slette din auth-bruger
- Robust fallback-mekanisme der ogsaa virker i produktion
- Klar til at invitere rigtige kontaktpersoner efterfoelgende

