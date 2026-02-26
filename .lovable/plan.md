
# Send test-invitation email med opdateret tekst

## Problem
Edge function'en `send-invitation-email` bruger `getClaims()` til auth-validering, som ikke accepterer service-role tokens. Det blokerer test-kald via curl-værktøjet.

## Løsning (2 trin)

### 1. Opdater auth-logik til at acceptere service-role key
I `supabase/functions/send-invitation-email/index.ts` (linje 31-37): Tilfoej et tjek der accepterer `SUPABASE_SERVICE_ROLE_KEY` direkte, så interne kald (fx fra monday-webhook eller test) kan gå igennem uden et bruger-JWT.

```typescript
const token = authHeader.replace('Bearer ', '');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const isServiceRole = serviceRoleKey && token === serviceRoleKey;
if (!isServiceRole) {
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
```

### 2. Deploy og send test-email
Efter deploy sendes en POST til `/send-invitation-email` med:
```json
{
  "email": "jonas@topix.dk",
  "company_name": "The Boardroom Test",
  "signup_url": "https://topix.lovable.app/auth"
}
```

Dette verificerer at emnelinjen og template-teksten ("Accepter invitation") ser korrekt ud i indbakken.

### Berort fil
- `supabase/functions/send-invitation-email/index.ts` -- auth-logik udvides med service-role check
