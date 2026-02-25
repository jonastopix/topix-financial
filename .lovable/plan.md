

# Tilføj auth-validering til Edge Functions

## Oversigt
Begge edge functions (`extract-financial-data` og `handout-ai-feedback`) kan i dag kaldes uden autentificering. Vi tilføjer `getClaims()`-validering så kun indloggede brugere kan bruge dem. Frontend sender allerede auth-token automatisk via `supabase.functions.invoke()`, så ingen frontend-ændringer er nødvendige.

## Ændringer

### 1. `supabase/functions/extract-financial-data/index.ts`

Tilføj auth-validering lige efter CORS-check (linje 15), før request body parses:

```typescript
// Validate auth
const authHeader = req.headers.get('Authorization');
if (!authHeader?.startsWith('Bearer ')) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const authClient = createClient(supabaseUrl, anonKey, {
  global: { headers: { Authorization: authHeader } }
});
const token = authHeader.replace('Bearer ', '');
const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
if (claimsError || !claimsData?.claims) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

Den eksisterende service-role client bibeholdes til database-operationer. Auth-clienten bruges kun til at verificere brugeren.

### 2. `supabase/functions/handout-ai-feedback/index.ts`

Præcis samme auth-blok tilføjes efter CORS-check (linje 40), før request body parses:

```typescript
// Validate auth
const authHeader = req.headers.get('Authorization');
if (!authHeader?.startsWith('Bearer ')) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const authClient = createClient(supabaseUrl, anonKey, {
  global: { headers: { Authorization: authHeader } }
});
const token = authHeader.replace('Bearer ', '');
const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
if (claimsError || !claimsData?.claims) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

### Ingen frontend-ændringer
`supabase.functions.invoke()` sender automatisk brugerens JWT-token, så frontend-koden i `FileUploadZone.tsx` og `HandoutAIFeedback.tsx` behøver ingen ændringer.

### Ingen config-ændringer
`verify_jwt = false` bibeholdes i `supabase/config.toml` — vi validerer manuelt i koden som anbefalet.
