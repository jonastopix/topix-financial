

## Samlet pending-invitationsoversigt

### Hvad der bygges
En ny sektion på Members-siden (mellem invitation-stats og login-stats) der viser en samlet liste over alle pending invitationer med:
- Email, virksomhedsnavn, sendt-dato
- Gensend-knap per invitation
- Collapsible/expandable (default åben hvis der er pending)

### Implementering

**Fil: `src/pages/Members.tsx`**

1. Byg en `pendingInvitations`-liste fra det allerede loadede `companies`-data (filtrér `invitationStatus === 'pending'`), med `invitationEmail`, `name` og `created_at`.

2. Indsæt en ny Card-sektion efter invitation-stats (`linje ~1090`) og før login-stats (`linje ~1092`):
   - Header: "Afventende invitationer" med count-badge
   - Tabelvisning: Email | Virksomhed | Sendt | Gensend-knap
   - Tom-state: "Ingen afventende invitationer"
   - Genbruger eksisterende `handleResendInvitation`-funktion

Ingen database-ændringer. Ingen nye filer. Kun UI-tilføjelse baseret på eksisterende data.

