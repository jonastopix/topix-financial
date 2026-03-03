
Problem bekræftet. Fejlen er ikke i databasen længere, men i UI-flowet:

- Invitationen for `susanne@two-socks.com` findes allerede som `pending` på virksomheden **Two socks**.
- `/members`-modalen **Inviter ny bruger** kører altid en ny `insert` i `company_invitations`.
- Derfor rammer den unik constraint `company_invitations_company_id_email_key` hver gang på samme email+company.

Plan for løsning

1) Gør “Inviter ny bruger” idempotent i `src/pages/Members.tsx`
- Opdatér `handleStandaloneInvite` så den ikke kun forsøger `insert`.
- Nyt flow når virksomhed er valgt:
  - slå eksisterende invitation op på `(company_id, email)` med `.maybeSingle()`
  - hvis fundet:
    - hvis status = `accepted`: opdatér til `pending` + `accepted_at = null`
    - hvis status = `pending`: genbrug token direkte
  - hvis ikke fundet: opret ny invitation som i dag
- Send derefter invitation-mail med token (samme funktion som nu).
- Tilføj tydelig succesbesked:
  - “Invitation gensendt …” når eksisterende række blev genbrugt
  - “Invitation sendt …” når ny række blev oprettet.

2) Håndtér race condition / parallel klik
- Behold `try/catch`, men ved `23505`:
  - hent eksisterende token for `(company_id, email)`
  - fortsæt med mailafsendelse i stedet for at fejle.
- Det gør flowet robust selv ved samtidige forsøg.

3) Samme robusthed i settings-team invitationer
- Opdatér `src/components/CompanyInvitations.tsx` (`confirmInvite`) med samme “find-or-reset-or-create”-logik.
- Så undgår vi samme duplicate key-problem i den anden invitation-indgang.

4) Verifikation (end-to-end)
- Case A: eksisterende `pending` (Susanne) → “Send invitation” må lykkes uden DB-fejl.
- Case B: eksisterende `accepted` → bliver nulstillet til `pending` og mail sendes.
- Case C: helt ny email → ny række oprettes og mail sendes.
- Case D: uden valgt virksomhed → eksisterende “fri signup”-flow forbliver uændret.
- Bekræft i netværk at vi ikke længere stopper på 409 før mailflow.

Tekniske noter
- Ingen migrations nødvendige.
- RLS/policies er allerede på plads for advisor update/insert på `company_invitations`.
- `single()` undgås ved opslag der kan mangle data; brug `.maybeSingle()` i lookup-trin.
- Midlertidig workaround (indtil ændringen er ude): brug “Gensend invitation” på virksomhedskortet i Members.
