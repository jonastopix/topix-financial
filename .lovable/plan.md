

## Oprydning af Jeppe Chris' duplikerede brugerkonto

### Baggrund
Jeppe Chris (kontakt@jeppechris.dk) har to brugerkonti tilknyttet Stadio ApS:

| | Oprindelig konto (beholdes) | Duplikat (slettes) |
|---|---|---|
| User ID | `e5c1657b-...` | `cdfa53b9-...` |
| Oprettet | 25. feb | 27. feb |
| Onboardet | Ja | Nej |
| Data (beskeder, rapporter, milestones) | Ja | Ingen |

### Handlinger (i rækkefølge)

1. **Slet conversation** for duplikat-brugeren (`18e60352-...`)
2. **Slet company_member** for duplikat-brugeren (`c3dfe51d-...`)
3. **Slet profil** for duplikat-brugeren (`45e3a995-...`)
4. **Slet auth-bruger** `cdfa53b9-ec5e-45a1-91cf-8c353bc3210f` via admin API

### Teknisk detalje
- Alle sletninger udføres via database insert-tool (DELETE statements)
- Auth-brugeren slettes via Supabase admin auth API i en edge function eller direkte SQL mod `auth.users`
- Invitation-records (`accepted`) for Stadio ApS bevares uændret, da de peger på den korrekte invitation

### Resultat
Jeppe Chris vil kun fremgå én gang under Stadio ApS med sin oprindelige, onboardede konto.
