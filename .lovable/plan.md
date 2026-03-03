

## Problem

Invitationen til `susanne@two-socks.com` (id: `7e8c3fb1`) har status `accepted` men ingen auth-bruger eksisterer. Ny invitation fejler med duplicate key pga. unik constraint på email i `company_invitations`.

## Løsning

Nulstil den eksisterende invitation til `pending` via en SQL-opdatering:

```sql
UPDATE company_invitations 
SET status = 'pending', accepted_at = NULL 
WHERE id = '7e8c3fb1-2f33-4d9a-ae6b-e3a3a0d95051';
```

Derefter kan invitationen gensendes fra UI'et som normalt. Tokenet (`2c98f14d-95b9-4c82-982e-f258e3202a91`) er stadig gyldigt og koblet til Two Socks' company_id.

## Fil der ændres

Ingen filændringer. Kun en database-opdatering.

