

## Oprydningsplan: 27 shell-virksomheder + 2 accepted

### Hvad der sker

**Markér som accepted (2):**
- Alina Beauty & Skincare (invitation `29077d00`)
- Two socks (invitation `7e8c3fb1`)

**Slet shell-data for 27 virksomheder** (Aqua Danmark, Box-cut, BRILLEVÆRK, Capture IT, Carma Studio, Courier Copenhagen, CyberSikker, D.A.S. GRUPPEN, Din økonomiafdeling, doggybed, E-skilte, Fortyfivefaces, Friends & Fries, Friis cykler, Insurance Partners, KJ AUTO, Livja, mitkørekort, Olsen & Kompagni, Pro-Vision, Rallysupport, Regnskabsvikar, Rock it Rosie, Smag & Slægt, Studio Mini, Warburg VVS, Wesdex):

For hver virksomhed:
1. Slet `handout_lever_milestones` (via handout_id)
2. Slet `handouts` (company_id)
3. Slet `milestones` (company_id)
4. Slet `budget_targets` (company_id)
5. Slet `kpi_targets` + `kpi_benchmarks` (company_id)
6. Slet `financial_reports` (company_id)
7. Slet `advisor_notifications` (company_id)
8. Slet `messages` (via conversation_id)
9. Slet `conversations` (company_id)
10. Slet `company_members` (company_id)
11. Slet `profiles` (user_id)
12. Slet auth user (admin API)
13. Slet `companies` (id)
14. Sæt `company_invitations.company_id = null` (behold invitation som pending)

Nogle virksomheder har 2 members (E-skilte, Fortyfivefaces), og Pro-Vision har ingen user_id — håndteres korrekt.

### Teknisk implementering

Tilføj en ny `cleanup-shells` action i `manage-advisor/index.ts`. Den modtager to lister:
- `accept_invitation_ids`: invitationer der markeres accepted
- `delete_company_ids`: virksomheder der slettes med al tilhørende data

Edge function bruger service role key til at slette på tværs af tabeller og kalder `auth.admin.deleteUser()` for shell-brugerne.

### Fil der ændres

| Fil | Ændring |
|-----|---------|
| `supabase/functions/manage-advisor/index.ts` | Ny `cleanup-shells` action med fuld kaskade-sletning |

### Kald fra klienten

Funktionen kaldes én gang med de konkrete ID'er. Ingen UI-ændringer nødvendige — det er en engangsoperation.

