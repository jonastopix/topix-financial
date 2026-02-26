

# Plan: Aktivér invitations-emails (slå test-mode fra)

## Hvad er problemet?

Invitations-systemet er fuldt implementeret, men `EMAIL_SENDING_ENABLED` er sat til noget andet end `true` (eller slet ikke sat). Det betyder at `send-invitation-email`-funktionen korer i test-mode og kun logger i stedet for at sende via Resend.

## Hvad skal der gores?

### 1. Saet `EMAIL_SENDING_ENABLED` til `true`

Opdater den eksisterende secret til vaerdien `true`, saa emails faktisk sendes via Resend fra `noreply@boardroom.topix.dk`.

### 2. Verificer med en test-invitation

Efter aktivering: opret en ny invitation fra CompanyInvitations-komponenten. Modtageren bor modtage en email med signup-link.

## Risici

- Resend API-noeglen (`RESEND_API_KEY`) og domae-verifikation (`boardroom.topix.dk`) skal vaere korrekt konfigureret i forvejen -- det ser ud til at vaere paa plads allerede.
- Naar dette er aktiveret, vil ALLE fremtidige invitationer sende rigtige emails. Saerlig der ikke bor sendes test-invitationer til tilfaeldige emails.

## Tekniske detaljer

- Fil: Ingen kodeaendringer nodvendige
- Secret: `EMAIL_SENDING_ENABLED` saettes til `true` via secrets-vaerktojet
- Edge function `send-invitation-email` er allerede klar til live-mode (linje 56-71 i funktionen)

