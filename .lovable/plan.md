

## Plan: Håndter "bruger findes allerede"-tilfældet ved import-application

Roden til problemet er at `import-application` ikke tjekker om email allerede har en auth-konto. Dette skaber forvirring fordi advisor sender invitation, founder klikker link, intet sker — og ingen får besked.

### Trin 1 — Diagnose i edge function (backend)

Opdatér `supabase/functions/import-application/index.ts` så den **inden invitations-oprettelse** tjekker om email allerede findes som auth-bruger via `adminClient.auth.admin.listUsers({ filter: 'email=eq.<x>' })`.

Hvis brugeren findes:
- Returnér `{ ok: false, reason: "user_already_exists", existing_user_id, email_confirmed: bool }` (200, ikke 500)
- Spring oprettelse af company, invitation og email-afsendelse over

### Trin 2 — Klar fejlbesked i frontend

I `src/pages/Members.tsx` `handleImport`, udvid eksisterende reason-håndtering med:

```ts
if (data?.reason === "user_already_exists") {
  toast.error("Bruger findes allerede", {
    description: "Denne email har allerede en konto. Tilføj brugeren til virksomheden manuelt eller bed dem logge ind.",
  });
  resetImportDialog();
  return;
}
```

### Trin 3 — Oprydning af den nuværende dangling invitation

Den nuværende `pending` invitation for `kontakt@topix.dk` (id `b168474c-…`) er forældreløs — den vil aldrig blive accepteret fordi triggeren ikke kører for eksisterende brugere. To muligheder:

**A.** Ryd op med en migration der sletter invitationen, så test-flowet kan køres igen med en frisk email.

**B.** Knyt eksisterende auth-bruger (`f899dbc5-…`) manuelt til den nyoprettede company via `company_members`-insert, og markér invitationen som `accepted`.

Anbefaling: **A** (slet invitation + company der blev oprettet i samme run), da `kontakt@topix.dk` er en testbruger.

### Hvad der IKKE bliver ændret

- Auth-flowet — Supabase's "no email on repeated signup" er korrekt og må ikke omgås
- `handle_new_user`-triggeren
- `send-invitation-email`

### Forventet resultat

- Advisor får øjeblikkelig fejl ved import hvis email allerede har konto, i stedet for tavs fejl efter signup-forsøg
- Ingen forældreløse invitationer
- Test-emailen `kontakt@topix.dk` ryddes så den kan genbruges

