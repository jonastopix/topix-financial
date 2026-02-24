
# Omstrukturering: Virksomhed som Medlem

## Ideen

I stedet for at alt data (rapporter, budgetter, milestones, handouts osv.) er knyttet direkte til en **bruger**, bliver det knyttet til en **virksomhed**. Brugere tilknyttes en virksomhed -- oftest 1 bruger pr. virksomhed, men med mulighed for 2-3.

## Nuvaerende struktur

```text
auth.users
    |
    +-- profiles (user_id, full_name, company_name)
    +-- financial_reports (user_id)
    +-- budget_targets (user_id)
    +-- milestones (user_id)
    +-- handouts (user_id)
    +-- kpi_targets (user_id)
    +-- kpi_benchmarks (user_id)
    +-- conversations (member_id)
```

`company_name` er bare et tekstfelt paa profilen -- ingen reel virksomhedsstruktur.

## Ny struktur

```text
companies
    |
    +-- company_members (company_id, user_id, role)
    +-- financial_reports (company_id)
    +-- budget_targets (company_id)
    +-- milestones (company_id)
    +-- handouts (company_id)
    +-- kpi_targets (company_id)
    +-- kpi_benchmarks (company_id)
    +-- conversations (company_id)
    
auth.users
    +-- profiles (user_id, full_name, avatar_url)
    +-- company_members (user_id -> companies)
```

## Plan

### Fase 1: Database-migration

**Ny tabel: `companies`**
- `id` (uuid, PK)
- `name` (text) -- virksomhedsnavn
- `cvr_number` (text, nullable) -- CVR-nummer
- `created_at` (timestamp)

**Ny tabel: `company_members`**
- `id` (uuid, PK)
- `company_id` (uuid, FK -> companies)
- `user_id` (uuid, FK -> auth.users)
- `role` (text, default 'owner') -- 'owner' eller 'member'
- `created_at` (timestamp)
- UNIQUE(company_id, user_id)

**Migrationsskridt:**

1. Opret `companies` og `company_members` tabeller
2. Migrer eksisterende data: For hver profil med company_name oprettes en virksomhed, og en company_member-raekke oprettes
3. Tilfoej `company_id` kolonne til alle data-tabeller (financial_reports, budget_targets, milestones, handouts, kpi_targets, kpi_benchmarks, conversations)
4. Populer `company_id` baseret paa eksisterende user_id -> company_members mapping
5. Fjern `company_name` fra profiles (eller behold som fallback midlertidigt)
6. Opdater RLS-policies til at bruge company_id i stedet for user_id (brugere kan se data for deres virksomhed)
7. Opdater `handle_new_user` trigger til ogsaa at oprette en virksomhed + company_member

**RLS-strategi:**

Ny security definer function:
```sql
CREATE FUNCTION public.user_company_id(_user_id uuid)
RETURNS uuid AS $$
  SELECT company_id FROM public.company_members 
  WHERE user_id = _user_id LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

Policies bruger derefter:
```sql
-- Eksempel: Brugere kan se rapporter for deres virksomhed
CREATE POLICY "Users can view company reports"
ON financial_reports FOR SELECT
USING (company_id = user_company_id(auth.uid()));
```

### Fase 2: Frontend-aendringer

**Hook: `useAuth.tsx`**
- Tilfoej `companyId` og `companyName` til AuthContext
- Hent company_members data sammen med profil ved login

**Ny hook: `useCompany.ts`**
- Henter virksomhedsdetaljer og team-medlemmer
- Bruges paa Settings-side til at invitere/administrere brugere

**Sider der skal opdateres:**

| Side/Komponent | Aendring |
|---|---|
| `Members.tsx` | Vis virksomheder i stedet for individuelle brugere. Klik aabner virksomhedsdetaljer. |
| `MemberDetail.tsx` | Vis virksomhedsdata med liste af tilknyttede brugere. |
| `Chat.tsx` | Conversations er nu pr. virksomhed. Vis virksomhedsnavn i stedet for brugernavn i advisor-view. |
| `AppSidebar.tsx` | Vis virksomhedsnavn fra company i stedet for profiles.company_name. |
| `FileUploadZone.tsx` | Brug `companyId` i stedet for `user.id` naar rapporter gemmes. |
| `Budget.tsx` | Brug `companyId` til at hente/gemme budget. |
| `KPIs.tsx` | Brug `companyId` til KPI-targets og benchmarks. |
| `Milestones.tsx` | Brug `companyId`. |
| `Handouts.tsx` | Brug `companyId`. |
| `Reports.tsx` | Brug `companyId`. |
| `Index.tsx` (Dashboard) | Brug `companyId` i alle queries. |
| `Settings.tsx` | Tilfoej sektion til at administrere virksomhedsoplysninger og teammedlemmer. |
| `BudgetOverview.tsx` | Brug `companyId`. |
| `FinancialOverview.tsx` | Brug `companyId`. |

**Edge functions:**
- `extract-financial-data` -- modtag ogsaa company_id
- `generate-budget-from-accounts` -- brug company_id
- `import-budget-excel` -- brug company_id
- `ai-financial-feedback` -- brug company_id
- `handout-ai-feedback` -- brug company_id

### Fase 3: Settings -- Virksomhedsadministration

Ny sektion paa Settings-siden:
- Se/rediger virksomhedsnavn og CVR
- Se teammedlemmer (andre brugere paa virksomheden)
- Inviter nye brugere til virksomheden (stretch goal)

### Risici og haandtering

- **Eksisterende data**: Migrationsscript haandterer automatisk mapping. Brugere uden company_name faar en default-virksomhed oprettet.
- **Backwards compatibility**: Beholder `user_id` paa tabellerne i en overgangsperiode, men al ny logik bruger `company_id`.
- **Auth flow**: Naar en ny bruger oprettes, oprettes ogsaa automatisk en virksomhed (med mindre de inviteres til en eksisterende).

## Implementeringsraekkefoelge

1. Database-migration (companies, company_members, tilfoej company_id, populer data, RLS)
2. useAuth + useCompany hooks
3. Opdater alle sider/komponenter til at bruge companyId
4. Opdater edge functions
5. Settings: virksomhedsadministration
6. Test end-to-end

## Omfang

Dette er en stor refaktor der roerer ved naesten alle filer. Jeg anbefaler at implementere det i 2-3 trin:
- **Trin 1**: Database + hooks + de mest centrale sider (Dashboard, Reports, Budget)
- **Trin 2**: Resten af siderne (Members, Chat, KPIs, Milestones, Handouts)
- **Trin 3**: Settings-virksomhedsadministration

Skal vi starte med Trin 1?
