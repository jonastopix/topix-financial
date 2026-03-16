

## Oprydning af testdata + trigger-fix

### Hvad slettes (13 virksomheder)

**8 × "s virksomhed"** (ghost — ingen profiler, ingen data):
`3dc3cae0`, `f4a18cc5`, `82d97483`, `708cf444`, `b592c8ce`, `4bb964dc`, `4a53ac53`, `ef1e7a4c`

**5 × QA-E virksomheder** (testdata fra koncern-QA, 281 budget_targets):
`eeeee001-...-c00000000001` til `c00000000005`

**2 × QA-grupper** + tilhørende data (2 conversations, 2 messages, 3 advisor_access, 1 membership, 6 group_companies):
- `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee` (Test Koncern Phase D QA)
- `eeeee001-0000-0000-0000-000000000001` (Phase E QA Group)

### Hvad beholdes

Alle 18 reelle virksomheder inkl. **Topix Test ApS**.

### Implementering — én database migration

**Del 1: Slet QA gruppe-data** (foreign key rækkefølge)
1. `group_messages` → via `group_conversations` for de 2 QA-grupper
2. `group_conversations` for de 2 QA-grupper
3. `group_advisor_access` for de 2 QA-grupper
4. `group_memberships` for de 2 QA-grupper
5. `group_companies` for de 2 QA-grupper
6. `groups` — slet de 2 QA-grupper

**Del 2: Slet virksomhedsdata** (13 companies)
1. `budget_targets` for QA-E virksomheder (281 rækker)
2. `company_members` for alle 13 virksomheder (8 rækker fra ghost)
3. `conversations` for alle 13 virksomheder (0 rækker, men sikkerhed)
4. `companies` — slet de 13 virksomheder

**Del 3: Fix `handle_new_user` trigger** — forhindrer fremtidige "s virksomhed"

Begge steder i funktionen hvor virksomhedsnavnet sættes, ændres fra:
```sql
COALESCE(NEW.raw_user_meta_data->>'full_name', '') || 's virksomhed'
```
til:
```sql
COALESCE(
  NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
  split_part(NEW.email, '@', 1),
  'Ny bruger'
) || 's virksomhed'
```

Dette sikrer at brugere uden `full_name` får email-prefix som fallback (f.eks. "jonas's virksomhed" i stedet for "s virksomhed").

