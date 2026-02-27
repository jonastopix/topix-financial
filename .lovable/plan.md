

## Introduktion af Admin-rolle

Formalet er at adskille "admin" fra "advisor", sa advisors kun har adgang til radgivningsfunktioner (Chat, Medlemmer, og mulighed for at se virksomhedsdata via "Vis som virksomhed"), mens admin (jonas@topix.dk) beholder fuld adgang til alt.

### Hvad aendres

**1. Database: Tilfoej 'admin' til app_role enum og tildel rollen**
- Tilfoej `admin` som vaerdi i `app_role` enum
- Tildel admin-rollen til jonas@topix.dk baseret pa email-opslag

**2. useAuth hook: Expose `isAdmin`**
- Tilfoej `isAdmin` boolean til AuthContext, baseret pa om brugeren har `admin`-rollen i `user_roles`

**3. Sidebar: Begrans advisor-navigation**
- Advisors ser kun: Chat og Medlemmer (udover de standard-sider de kan tilga via "Vis som virksomhed")
- Admin ser alt inkl. Import, E-mail skabeloner, Platformconfig og Indstillinger
- Advisors ser IKKE: Import rapporter, E-mail skabeloner, Platformconfig
- "Indstillinger" vises kun for medlemmer og admins, ikke advisors

**4. Route-beskyttelse**
- `/admin/config`, `/admin/emails`, `/admin/import` kraever admin-rolle (redirect til `/` hvis ikke admin)
- `/settings` skjules for advisors (de har ikke en virksomhed at konfigurere)

**5. AdminConfig-siden: Advisor-administration kun for admin**
- Tjek for `isAdmin` i stedet for `isAdvisor` pa AdminConfig-siden

### Tekniske detaljer

```text
Filer der aendres:
- supabase migration (ny)     -> ALTER TYPE app_role ADD VALUE 'admin'; INSERT admin role
- src/hooks/useAuth.tsx        -> tilfoej isAdmin
- src/components/AppSidebar.tsx -> opdel advisorNavItems i adminNavItems
- src/pages/AdminConfig.tsx    -> brug isAdmin guard
- src/pages/EmailTemplates.tsx -> brug isAdmin guard  
- src/pages/BulkImport.tsx     -> brug isAdmin guard
- src/App.tsx                  -> AdminRoute wrapper
```

Migration SQL:
```sql
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';

-- Tildel admin-rolle til jonas@topix.dk
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'
FROM auth.users
WHERE email = 'jonas@topix.dk'
ON CONFLICT DO NOTHING;
```

Sidebar-logik:
- `advisorNavItems` reduceres til kun `Medlemmer`
- Nyt `adminNavItems` array: Import, E-mail skabeloner, Platformconfig
- Chat og de ovrige sider forbliver i `baseNavItems` (tilgaengelige for alle)
- Indstillinger fjernes fra baseNavItems for advisors (ikke-admin)
