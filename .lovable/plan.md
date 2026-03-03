

## Problem

Topix-casen afslører to konkrete fejl:

1. **Backfill-migrationen virkede ikke for Topix** fordi den matchede på email (kontakt@topix.dk ≠ jonas@topix.dk). `accepted_by` er stadig NULL.
2. **"Inviteret som: kontakt@topix.dk"** på MemberDetail vises fordi koden falder igennem til et match uden `accepted_by`.
3. **Settings viser "kontakt@topix.dk Accepteret"** uden kontekst om hvem der accepterede — det ser ud som om kontakt@topix.dk er en bruger.

## Plan

### 1) Ret backfill: sæt `accepted_by` via company_members (ikke kun email-match)

Kør en ny migration der sætter `accepted_by` for accepted invitationer, hvor der kun findes ét medlem i virksomheden og invitationen er den eneste accepted for den virksomhed:

```sql
UPDATE public.company_invitations ci
SET accepted_by = cm.user_id
FROM public.company_members cm
WHERE ci.company_id = cm.company_id
  AND ci.status = 'accepted'
  AND ci.accepted_by IS NULL
  AND (SELECT count(*) FROM public.company_members WHERE company_id = ci.company_id) = 1;
```

Dette fixer Topix-casen (én invitation, ét medlem → link dem).

### 2) MemberDetail: Gør "Inviteret som"-badge mere meningsfuld

- Behold kun badgen, når invitation-emailen faktisk afviger fra brugerens profil-email (nuværende logik).
- Sørg for at query altid matcher via `accepted_by` — og tilføj fallback via company_id + status + single-member check, så den virker selv for legacy-data der endnu ikke har `accepted_by` sat.

### 3) Settings/CompanyInvitations: Vis hvem der accepterede

- Når en invitation er accepted og `accepted_by` er sat, vis brugerens navn/email i stedet for kun invitations-emailen.
- Formatér: "kontakt@topix.dk → Accepteret af Jonas Herlev (jonas@topix.dk)" eller lignende.
- Når `accepted_by` er NULL men status er accepted, vis bare "Accepteret".

### Filer der rettes
- **Database-migration** (backfill `accepted_by` via company_members)
- `src/pages/MemberDetail.tsx` (robustere invitation-query)
- `src/components/CompanyInvitations.tsx` (vis acceptant-info)

