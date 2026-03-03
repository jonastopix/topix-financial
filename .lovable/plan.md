

## Plan: Fjern virksomhedsoprettelse fra Monday-webhook

Du har ret — det er unødvendigt at oprette en virksomhed i webhook'en. `handle_new_user`-triggeren opretter allerede automatisk en virksomhed når en bruger signer op uden en matchende invitation. Så flowet bør være:

**Monday "I gang"** → hent kontakt-email → send signup-email → brugeren signer op → `handle_new_user` opretter virksomheden automatisk → brugeren udfylder detaljer i Settings.

### Udfordring

`company_invitations.company_id` er **NOT NULL**. Uden en virksomhed kan vi ikke oprette en invitation i den eksisterende tabel. To løsninger:

**A) Gør `company_id` nullable** i `company_invitations` og tilpas `handle_new_user` til at håndtere invitationer uden company_id. Brugeren får sin egen virksomhed som normalt.

**B) Spring `company_invitations` over** og send bare en signup-email direkte med et generisk link (`/auth?mode=signup`). Ingen token-tracking, ingen invitation-record.

### Anbefaling: Option A

Option A bevarer fuld sporbarhed (hvem blev inviteret, hvornår, status) og token-baseret pairing, men uden at kræve en forud-oprettet virksomhed.

### Tekniske ændringer

1. **Database-migration**: `ALTER TABLE company_invitations ALTER COLUMN company_id DROP NOT NULL;`

2. **`handle_new_user` trigger**: Tilpas logikken så invitationer uden `company_id` behandles som "opret ny virksomhed" (ligesom ingen invitation), men invitationen markeres stadig som `accepted`.

3. **Monday-webhook** (`supabase/functions/monday-webhook/index.ts`): Fjern al virksomhedsoprettelse. Hent email → opret invitation (med `company_id: null`) → send email. Fjern også "already exists"-check da der ikke oprettes nogen virksomhed.

4. **`lookup_invite_company` RPC**: Tilpas til at returnere `null` gracefully når `company_id` er null (virker allerede via JOIN, men verificeres).

### Filer der ændres

| Fil | Ændring |
|-----|---------|
| Database migration | Gør `company_id` nullable |
| `handle_new_user` trigger | Håndter invitation uden company_id |
| `supabase/functions/monday-webhook/index.ts` | Fjern virksomhedsoprettelse, kun email + invitation |

