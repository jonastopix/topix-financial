

## Fix: Invitationslink peger på forkert URL

### Problem
Invitationsmailen bruger `window.location.origin` til at generere signup-linket. Hvis rådgiveren sender invitationer fra preview-miljøet, vil linket pege på preview-URL'en som ikke virker for modtagerne.

Derudover viser loggen at Jeppe Chris ramte en rate limit (429-fejl) da han forsøgte at oprette sig -- det løser sig ved at vente et minut og prøve igen.

### Løsning
Hardcode den published URL (`https://topix.lovable.app`) i stedet for `window.location.origin` i alle steder der genererer signup-links.

### Teknisk plan

**Fil: `src/pages/Members.tsx`** (linje 510)
- Erstat `${window.location.origin}/auth` med `https://topix.lovable.app/auth`

**Fil: `src/components/CompanyInvitations.tsx`** (linje 127)
- Erstat `${window.location.origin}/auth` med `https://topix.lovable.app/auth`

### Bemærkning om rate limit
Jeppe Chris fik en 429-fejl kl. 13:21 i dag. Han skal bare vente ca. 1 minut og prøve at oprette sig igen på `https://topix.lovable.app/auth`. Selve signup-flowet virker korrekt (status 200 ses lige inden rate limit-fejlen).

