

# Opsaet email-invitation system (TEST-MODE)

## Oversigt

Bygger infrastrukturen til at sende invitations-emails via Resend, men med en **test-mode toggle** saa ingen emails sendes foer du siger go. Alt logges i stedet for at blive sendt.

## Forudsaetninger

Du skal oprette en Resend-konto og tilfoeje API-noeglen som secret. Du skal ogsaa verificere dit domaine paa Resend foer emails kan sendes fra det.

## Tekniske trin

### 1. Tilfoej RESEND_API_KEY som secret
- Beder dig om at oprette en API-noegle paa resend.com og indtaste den

### 2. Tilfoej EMAIL_SENDING_ENABLED secret
- Saettes til `false` som standard
- Naar du er klar til at gaa live, aendres den til `true`
- Edge function checker denne vaerdi foer afsendelse

### 3. Opret Edge Function: `send-invitation-email`

Funktionen:
- Modtager `email`, `company_name`, `signup_url` som input
- Checker `EMAIL_SENDING_ENABLED` secret — hvis `false`, logger den blot "Email would be sent to X" og returnerer success uden at sende noget
- Hvis `true`, sender en pen invitations-email via Resend med virksomhedsnavn og signup-link
- Bruger React Email template til professionelt design

### 4. Opret React Email template

Simpel invitations-email paa dansk:
- Velkomst med virksomhedsnavn
- Forklaring om platformen
- CTA-knap til signup
- Hvid baggrund, rent design

### 5. Opdater `CompanyInvitations.tsx`

Efter succesfuld invitation-insert, kald `send-invitation-email` Edge Function. Viser en note til brugeren om at emailen er i test-mode (ingen email sendt endnu).

### 6. Opdater `monday-webhook/index.ts`

Efter automatisk invitation-oprettelse, kald ogsaa `send-invitation-email`. Samme test-mode logik gaelder.

## Sikkerhed

- Ingen emails sendes foer `EMAIL_SENDING_ENABLED` saettes til `true`
- Alt logges saa du kan verificere at det virker korrekt foer go-live
- Du styrer selv hvornaar det aktiveres

