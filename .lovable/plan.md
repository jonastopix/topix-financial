

## Problem

1. **Datoen er forkert**: Oversigten viser `created_at` (27. feb) i stedet for den senest afsendte dato. Christina's invitation blev senest gensendt 4. marts, men UI'et viser stadig den oprindelige oprettelsesdato.

2. **Ingen slet-knap**: Der er ingen mulighed for at slette en afventende invitation.

## Plan

### 1. Vis senest afsendte dato i stedet for oprettelsesdato

**Tilgang**: Hent den seneste `sent_at` fra `email_send_log` for hver pending invitation (baseret på `recipient_email`), og brug den i stedet for `created_at`.

**Ændringer i `src/pages/Members.tsx`**:
- I data-fetch logikken: efter invitationer er hentet, lav et ekstra query mod `email_send_log` for de relevante emails
- Byg et map fra email → seneste `sent_at`
- Brug `lastSentAt || created_at` som fallback i visningen (linje 1215)

### 2. Tilføj slet-knap for afventende invitationer

**Ændringer i `src/pages/Members.tsx`**:
- Ny handler `handleDeleteInvitation(invitationId)` der kalder `supabase.from("company_invitations").delete().eq("id", invitationId)`
- Tilføj en slet-knap (Trash2 ikon) ved siden af Gensend-knappen i pending-invitation oversigten (linje ~1218-1232)
- Bekræftelsesdialog inden sletning for at undga utilsigtede sletninger
- Reload data efter sletning

**RLS**: Sletning er allerede tilladt for advisors via eksisterende policy på `company_invitations` (company members can delete company invitations). For standalone invitationer (company_id = null) skal vi tilføje en ny RLS policy.

### 3. Database-migration

Ny RLS policy på `company_invitations`:
```sql
CREATE POLICY "Advisors can delete invitations"
ON public.company_invitations
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'advisor'::app_role));
```

### Tekniske detaljer

- `email_send_log` har allerede data med seneste afsendelse per email
- Queryet bliver: `SELECT recipient_email, MAX(sent_at) FROM email_send_log WHERE recipient_email IN (...) GROUP BY recipient_email`
- Fallback til `created_at` hvis ingen log-entry findes

