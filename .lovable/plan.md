

## Fjern medlem fra virksomhed

### Overblik
Tilfoej en "Fjern medlem"-knap pa MemberDetail-siden (kun for radgivere) med bekraeftelsesdialog, der fjerner brugerens company_members-raekke, profil og auth-bruger.

### Tekniske aendringer

**1. Udvid `manage-advisor` edge function med `remove-member` action**

Tilfoej en ny action `remove-member` i `supabase/functions/manage-advisor/index.ts` der:
- Modtager `target_user_id` (ikke email-baseret, da vi allerede har userId)
- Validerer at caller er advisor
- Sletter relaterede data i raekkefoelge:
  - `company_members` for den paagaeldende bruger
  - `profiles` for brugeren  
  - Auth-brugeren via `adminSupabase.auth.admin.deleteUser()`
- Returnerer success/error

**2. Opdater `src/pages/MemberDetail.tsx`**

- Tilfoej en rod "Fjern medlem"-knap (Trash2-ikon) i member header-sektionen, ved siden af statistik-blokkene
- Knappen aabner en AlertDialog med:
  - Brugerens navn og email
  - Tydelig advarsel om at handlingen er permanent
  - "Annuller" og "Fjern medlem" knapper
- Ved bekraeftelse: kalder edge function med `action: 'remove-member'` og `target_user_id`
- Ved succes: viser toast og navigerer til `/members`
- Importerer AlertDialog-komponenter og Trash2-ikon

### Sikkerhed
- Edge function validerer JWT og tjekker advisor-rolle (eksisterende pattern)
- Bruger service role key til auth.admin.deleteUser (kun server-side)
- Knappen er kun synlig for advisors (allerede haandteret via `isAdvisor` guard)

