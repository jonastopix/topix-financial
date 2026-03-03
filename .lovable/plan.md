
Jeg kan se, hvorfor det opleves som om ændringerne “ikke er der”. Der er flere konkrete årsager i koden lige nu:

1) Oversigten blev lagt på **/members**, men du står på **/settings**  
2) Pending-oversigten på Members vises kun, når der findes pending (ingen tom-state)  
3) Invitation-data i Members bygges via en “seneste invitation pr. virksomhed”-heuristik, som er skrøbelig  
4) Fjern medlem i Members bruger stadig direkte delete (ikke den sikre backend-flow), så invitation-state kan blive hængende

## Plan (implementering)

### 1) Gør invitationsoverblik synligt og stabilt
- Byg pending-oversigten fra **company_invitations** (ikke fra company-kortenes afledte status).
- Vis kortet **altid** (også når der er 0 pending) med tom-state.
- Brug invitationens egen `created_at` (ikke virksomhedens oprettelsesdato) som “Sendt”.
- Behold gensend-knap pr. række.

### 2) Placering så du faktisk ser den
- Behold global oversigt på **Members**.
- Tilføj samme visuelle pending-sektion på **Settings** (for aktuel virksomhed), så den også er synlig dér, hvor du arbejder nu.

### 3) Ret invitation-livscyklus konsekvent
- Når en accepteret invitation nulstilles til pending, nulstil også `accepted_by` (ikke kun `accepted_at`).
- Gælder i:
  - Members: `handleResendInvitation`
  - Members: `handleStandaloneInvite`
  - Settings/CompanyInvitations: `confirmInvite`

### 4) Ret “Fjern medlem”-flowet som stadig bryder forventningen
- I Members-siden: stop med lokal `company_members.delete()` som primær vej.
- Brug samme backend-fjern-flow som MemberDetail (så invitation-reset og oprydning sker ens hver gang).

### 5) Håndter legacy-data (forklarer Topix-tilfældet)
- Der findes accepterede invitationer med `accepted_by = null` (fx historiske rækker), så den nye kobling kan ikke altid bruges direkte.
- Tilføj en backfill-migration:
  - Sæt `accepted_by` for accepterede invitationer hvor email matcher et eksisterende medlem i samme virksomhed.
- Tilføj fallback i remove-member:
  - Hvis ingen `accepted_by`-match, reset invitation hvor email matcher den fjernede profils email i samme virksomhed.

## Tekniske detaljer
- Members inviteringsstatus skal ikke længere komme fra én map-overwrite pr. virksomhed.
- Query for invitationsoverblik skal inkludere mindst:
  `id, company_id, email, status, created_at, accepted_at, accepted_by, token`.
- Existing RLS kan genbruges; ingen ny policy nødvendig.
- Databaseændring: kun backfill/normalisering af eksisterende data (ingen ny offentlig adgang).

## Verifikation (end-to-end)
1) Gå til **Members**: pending-kort vises altid (også ved 0).  
2) Gå til **Settings**: pending-sektion vises for virksomheden.  
3) Fjern et medlem fra Members → invitation resettes korrekt.  
4) Geninvitér samme email → virker uden “accepted hænger fast”.  
5) Topix-case: “inviteret som …” må ikke være misvisende, og geninvitation skal kunne lade sig gøre efter fjernelse.
