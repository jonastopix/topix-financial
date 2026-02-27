

## Bulk-invitation fra rådgiversiden

### Hvad bygges
En "Invitér alle" knap tilfojes pa Members-siden (kun synlig for advisors), som:
1. Henter alle virksomheder der endnu ikke har en pending/accepted invitation
2. Viser en bekraftelsesdialog med den fulde liste (virksomhed, kontaktperson, e-mail)
3. Ved bekraftelse opretter invitationer og sender e-mails til alle pa en gang

### Hvordan det virker
- Knappen placeres i header-omradet pa Members-siden ved siden af titlen
- Ved klik hentes alle virksomheder fra `companies` og sammenlignes med `company_invitations` (pending/accepted)
- Virksomheder uden `contact_email` markeres med advarsel i listen og springes over ved afsendelse
- Bekraftelsesdialogen viser en scrollbar tabel med: Virksomhed | Kontaktperson | E-mail | Status
- "Send alle invitationer" knappen udforer sekventielt: insert i `company_invitations` + kald til `send-invitation-email` edge function
- Progressindikator vises under afsendelse (f.eks. "3/28 sendt...")
- Fejlede invitationer logges og vises efter afslutning

### Teknisk plan

**Fil: `src/pages/Members.tsx`**

- Tilfoej nye imports: `AlertDialog`-komponenterne, `Mail`, `Send` ikoner
- Tilfoej state:
  - `bulkDialogOpen` (boolean)
  - `uninvitedCompanies` (array af virksomheder uden invitation)
  - `bulkSending` (boolean)
  - `bulkProgress` (number - antal sendte)
  - `bulkErrors` (array af fejlede e-mails)
- Tilfoej funktion `openBulkInviteDialog()`:
  - Hent alle `company_invitations` med status pending/accepted
  - Filtrer `companies` der ikke har en invitation OG har en `contact_email`
  - Saet `uninvitedCompanies` og aabn dialogen
- Tilfoej funktion `executeBulkInvite()`:
  - Loop over `uninvitedCompanies`
  - For hver: insert i `company_invitations`, kald `send-invitation-email`
  - Opdater `bulkProgress` for hvert trin
  - Saml fejl i `bulkErrors`
  - Vis toast med resultat og reload data
- Tilfoej "Inviter alle" knap i header-omradet (ved siden af titlen)
- Tilfoej `AlertDialog` med:
  - Scrollbar tabel over alle uninviterede virksomheder
  - Virksomheder uden e-mail vises med advarsel (graa, "Mangler e-mail")
  - Taller: "X virksomheder klar til invitation, Y mangler e-mail"
  - Under afsendelse: progress bar + taeller
  - Knapper: "Annuller" og "Send X invitationer"

Ingen database-aendringer nødvendige. Eksisterende RLS-policies dækker allerede advisor-insert pa `company_invitations`.

