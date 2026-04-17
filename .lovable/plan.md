
## Oprydning af forældreløse brugere

### Tal
- **50 brugere** total i `auth.users`
- **18 brugere** uden virksomhedstilknytning
- Heraf:
  - **13 helt forældreløse** (ingen virksomhed, ingen rolle, ingen legat) — kandidater til sletning
  - **5 har en rolle** — skal IKKE røres (advisors/admins + Topix-konti)

### De 13 forældreløse brugere

| Email | Oprettet | Sidste login | Logins | Status |
|---|---|---|---|---|
| jonas+legat5@topix.dk | 10/4 | aldrig | 0 | Test-legat, aldrig logget ind |
| jonas+legat4@topix.dk | 10/4 | aldrig | 0 | Test-legat, aldrig logget ind |
| jonas+legat3@topix.dk | 10/4 | aldrig | 0 | Test-legat, aldrig logget ind |
| jonas+legat2@topix.dk | 9/4 | aldrig | 0 | Test-legat, aldrig logget ind |
| jonas+legat1@topix.dk | 9/4 | aldrig | 0 | Test-legat, aldrig logget ind |
| ditte@mondokaos.dk | 2/4 | aldrig | 0 | Pending invite, aldrig signed up færdig |
| demo@theboardroom.dk | 1/4 | 1/4 | 19 | Demo-konto |
| jonas+test2endelig@topix.dk | 27/3 | 27/3 | 11 | Test-konto |
| jonas+endeligtest@topix.dk | 27/3 | 27/3 | 23 | Test-konto |
| roskilde.dan@gmail.com | 18/3 | 18/3 | 2 | Aldrig færdiggjort onboarding |
| linealmegaard@gmail.com | 16/3 | 16/3 | 3 | Aldrig færdiggjort onboarding |
| jonasherlev@hotmail.com | 3/3 | 3/3 | 3 | Aldrig færdiggjort onboarding |
| jh@jonasherlev.dk | 27/2 | 8/4 | 55 | **Du selv?** Logger ind men har ingen company |

Alle har **0 messages, 0 reports, 0 milestones** — de er reelt tomme skaller.

### Ting at være opmærksom på

1. **`jh@jonasherlev.dk`** har 55 logins og loggede ind for en uge siden — det ser ud til at være dig selv. Skal vi beholde den? Eller var det en gammel testkonto?
2. **`demo@theboardroom.dk`** — er det en aktiv demo-konto vi vil beholde?
3. De 5 jonas+legat-konti er tydeligt tests fra legat-flow udvikling.

### Forslag — to-trins oprydning

**Trin 1 (sikker):** Slet de 11 åbenlyse test/forældreløse:
- 5x `jonas+legat[1-5]@topix.dk` 
- 2x `jonas+test/endeligtest@topix.dk`
- `ditte@mondokaos.dk`, `roskilde.dan@gmail.com`, `linealmegaard@gmail.com`, `jonasherlev@hotmail.com`

**Trin 2 (kræver din bekræftelse):**
- `jh@jonasherlev.dk` — slettes hvis det er en gammel testkonto
- `demo@theboardroom.dk` — slettes hvis demo ikke længere bruges

### Sletningsproces (per bruger)

For hver bruger sletter jeg i denne rækkefølge for at respektere FK constraints:
```text
1. user_login_log    (login-historik)
2. profiles          (profil-data)
3. user_roles        (hvis nogen — gælder ikke disse 13)
4. company_invitations  (accepted-rækker der peger på brugeren via email)
5. auth.users        (via supabase.auth.admin.deleteUser)
```
Brugerne har ingen messages/reports/milestones så de tabeller behøver vi ikke røre.

Jeg laver dette som et engangsscript via Supabase service role — ikke en edge function, da det er en éngangs-oprydning.

### Spørgsmål før jeg går i gang

1. Skal jeg medtage `jh@jonasherlev.dk` og `demo@theboardroom.dk` i sletningen, eller kun de 11 åbenlyse?
2. Skal jeg også rydde `company_invitations` med status `accepted` der peger på de slettede emails (de er forældreløse referencer nu)?
