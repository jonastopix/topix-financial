

## Plan: Komplet oprydning af test-data

### Nuværende tilstand (fra database)

**Test-virksomhed:**
- **Topix Test ApS** (`927a4f36-748d-4326-9259-bff940da7e3d`, CVR 45281736)
  - 1 medlem: `jonas+test14@topix.dk`
  - 56 financial_reports, 9 milestones, 2 handouts, 1 conversation
  - 0 invitationer, 0 group-links

**Test/demo auth-brugere:**
| Email | User ID | Tilknyttet selskab | Sidst logget ind |
|---|---|---|---|
| `jonas+test14@topix.dk` | `7f1a05ce-…` | Topix Test ApS | 20. apr |
| `kontakt@topix.dk` | `f899dbc5-…` | (ingen) — forældreløs | 26. feb |
| `demo@theboardroom.dk` | `e1380355-…` | (ingen) — forældreløs | 1. apr |
| `jonas+legat6@topix.dk` | `d22018e4-…` | Jonas legat | 13. apr |

**Forældreløse pending invitationer (11 stk, alle uden `company_id`):**
Inkl. `ditte@mondokaos.dk`, `jonas@wesdex.dk`, `martin@meresmag.dk`, `jek@pro-vision.dk`, `skriv@livja.dk`, `oko@topdanmark.dk`, `friis000@icloud.com`, `jkj@webcompanies.dk`, `cj@couriercopenhagen.dk`, `kontakt@box-cut.com`, `office@coskunholding.dk` — 10 af dem fra 27. feb 2026 (legacy), 1 fra 20. apr.

**Email-log:** 658 rækker, 299 ældre end 14 dage.

**Brugere uden login:** 6 brugere oprettet for >14 dage siden uden nogen login.

---

### Trin 1 — Hard delete `Topix Test ApS`

Bruger den eksisterende `hardDeleteCompany`-funktion (som allerede håndterer alle cascading deletes inkl. financial_reports, milestones, handouts, conversations, messages, KPI-data, alerts, Slack-logs osv.).

**Eksekveres via en engangs-edge-function** `admin-cleanup-test-data` (POST, admin-gated, dry-run mode default). Ved kald med `{ action: "hard_delete_company", company_id: "927a4f36-…", delete_users: true }`:
1. Kalder `hardDeleteCompany(adminSupabase, companyId, { deleteUsers: true })`
2. Sletter dermed også auth-brugeren `jonas+test14@topix.dk`

### Trin 2 — Slet forældreløse auth-brugere

Samme edge function med `{ action: "delete_orphan_user", user_id: "..." }`:
- `kontakt@topix.dk` (`f899dbc5-…`) — så test-flowet med invite kan køres med frisk email
- `demo@theboardroom.dk` (`e1380355-…`) — ubrugt demo-konto

For hver: slet `profiles`, `user_login_log`, `notifications`, og kald `auth.admin.deleteUser`.

**`jonas+legat6@topix.dk` BEVARES** — knyttet til "Jonas legat" og brugt aktivt.

### Trin 3 — Ryd dangling pending invitationer

Direkte SQL via insert-tool:
```sql
DELETE FROM company_invitations
WHERE status = 'pending' AND company_id IS NULL;
```
Sletter alle 11 forældreløse invitationer (alle uden `company_id`).

### Trin 4 — Ryd gammel email-log

```sql
DELETE FROM email_send_log
WHERE created_at < now() - interval '14 days';
```
Sletter ~299 gamle log-rækker. Nye rækker dannes løbende af kø-systemet.

### Trin 5 — Verifikation

Efter oprydning kører jeg tjek på:
- `companies` ikke længere indeholder Topix Test ApS
- `auth.users` ikke længere indeholder de 3 slettede brugere
- `company_invitations` har 0 pending uden `company_id`
- `email_send_log` count ~359

---

### Hvad IKKE bliver rørt
- Aktive brugere/selskaber med rigtigt data (alt udover ovenstående)
- "Jonas legat"-selskabet og dens bruger
- `handle_new_user`-trigger, RLS-politikker, edge functions
- Aktive pending-invitationer der ER tilknyttet en company

### Tekniske detaljer
- Den nye edge function `admin-cleanup-test-data` deployes med `verify_jwt = false` og admin-rolle-check via `getClaims` + `has_role`
- Den kalder den eksisterende `_shared/companyHardDelete.ts` for selve sletningen — ingen ny sletteslogik
- Funktionen bevares efter brug, så fremtidige test-oprydninger kan køres samme vej
- Efter Trin 1+2 kan du straks teste det nye importflow med `kontakt@topix.dk` som ny invite (eller en hvilken som helst frisk email)

