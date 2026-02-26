

# Aktivér email-afsendelse og send test-invitation

## Trin

### 1. Opdater EMAIL_SENDING_ENABLED secret
Sæt værdien af `EMAIL_SENDING_ENABLED` til `true` via secrets-værktøjet, så edge function'en faktisk sender emails i stedet for at logge dem.

### 2. Send test-email via edge function
Kald `send-invitation-email` med følgende payload:
```json
{
  "email": "jonas@topix.dk",
  "company_name": "The Boardroom Test",
  "signup_url": "https://topix.lovable.app/auth"
}
```

### 3. Bekræft resultat
Verificer at responset returnerer `{ success: true, test_mode: false }`, hvilket bekræfter at emailen faktisk blev sendt via Resend.

### Berørte filer
Ingen kodefiler ændres -- kun en secret opdateres og en edge function kaldes.

