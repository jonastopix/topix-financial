
Målet er klart: `kontakt@topix.dk` skal ikke længere fremstå som “brugeren”, når den reelle aktive bruger er `jonas@topix.dk`.

Status efter gennemgang:
- Backend-data er faktisk korrekt nu for Topix:
  - 1 medlem: Jonas
  - invitationen har `status='accepted'` og `accepted_by = Jonas`
- Fejlen er derfor primært visningslogik i UI (ikke manglende data-link).

Implementeringsplan

1) Fjern invitation-email som primær identitet i alle “accepted”-visninger
- Problem i dag:
  - `MemberDetail` viser badge: “Inviteret som: kontakt@topix.dk”
  - `CompanyInvitations` viser accepted-række med `inv.email` som første tekst
  - `Members` (expanded company card) viser invitation-email direkte under “Invitation”
- Løsning:
  - Når invitation er `accepted`, skal UI vise den accepterende bruger (via `accepted_by`), ikke den oprindelige invitation-email.
  - Invitation-email må kun vises i `pending`-kontekster (hvor den er operationel og relevant).

2) MemberDetail: stop “Inviteret som”-forvirringen
- Fil: `src/pages/MemberDetail.tsx`
- Ændring:
  - Fjern/stram logik så badge “Inviteret som …” ikke vises for accepterede medlemmer med gyldig `accepted_by`.
  - Hvis der opstår legacy-edgecase uden `accepted_by`, vis hellere intet badge end potentielt misvisende email.
- Resultat:
  - Jonas’ detaljeside viser kun Jonas’ egen email og ikke `kontakt@topix.dk`.

3) CompanyInvitations: accepted-rækker vises som “accepteret af bruger”
- Fil: `src/components/CompanyInvitations.tsx`
- Ændring:
  - Behold nuværende enrich med acceptor-profil.
  - Justér rendering:
    - `pending`: vis invitation-email + “Afventer” (uændret)
    - `accepted`: vis “Accepteret af {navn} ({email})” som primær tekst
    - skjul oprindelig invitation-email i accepted-rækker for at undgå at den ligner en aktiv bruger.
  - Fallback ved manglende acceptor-profil: vis neutral “Accepteret” uden mail.
- Resultat:
  - `kontakt@topix.dk` fremstår ikke som aktiv bruger i Settings.

4) Members-side: invitation-blok skal være status, ikke pseudo-brugeridentitet
- Fil: `src/pages/Members.tsx`
- Ændring:
  - Udvid invitation-info-model med `accepted_by` (og afledt acceptor navn/email fra eksisterende profil/member-data).
  - I expanded “Invitation”-sektion:
    - `pending`: vis pending-email + “Afventer svar”
    - `accepted`: vis “Accepteret af {navn/email}” + dato
    - skjul rå `invitationEmail` i accepted-state.
  - Behold `invitationEmail` internt til “Nulstil & gensend” handling (funktionelt behov), men uden at vise den som bruger-identitet.
- Resultat:
  - Virksomheden vises korrekt med aktiv bruger-identitet, ikke gammel invite-modtager.

5) Tekniske detaljer (konkret regler)
- Visningsregel:
  - `if status === 'pending' => show invitation email`
  - `if status === 'accepted' => show acceptor (accepted_by -> profile/member)`
- Fallbacks:
  - Ingen `accepted_by` eller manglende profil => vis neutral accepted-tekst uden email.
- Ingen schema-ændringer nødvendige.
- Ingen ny migration nødvendig i denne omgang (problemet er UI-semantik).

6) Verificering (end-to-end)
- Topix / MemberDetail:
  - Jonas-side må ikke vise “Inviteret som: kontakt@topix.dk”
- Settings / CompanyInvitations:
  - Accepted invitation skal vise accepterende bruger, ikke `kontakt@topix.dk` som primær identitet
- Members / virksomhedskort:
  - Invitation-sektion for accepted skal vise “Accepteret af …”
  - Pending invitationer på andre virksomheder skal fortsat vise invitation-email korrekt

Filer der rettes
- `src/pages/MemberDetail.tsx`
- `src/components/CompanyInvitations.tsx`
- `src/pages/Members.tsx`
