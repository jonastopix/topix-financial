

# Ren start: Fjern alle medlemmer og gen-invitér

## Overblik

Fjern alle 37 medlemmer (beholder admins og advisors), nulstil invitationer, fix alle links, og opdater invitationsmailen til jeres branding. Derefter kan I sende invitationer ud forfra uden parringsproblemer.

## Trin

### 1. Udvid manage-advisor med en "bulk-cleanup" action

Tilføj en ny action `bulk-remove-members` til den eksisterende `manage-advisor` edge function, der:
- Kun kan kaldes af admin/advisor (allerede håndhævet)
- Finder alle brugere med rollen `member`
- For hver: sletter `company_members`, `profiles`, `user_roles`, og auth-bruger
- Returnerer antal slettede

### 2. Nulstil invitationer

I samme bulk-cleanup: slet alle rækker i `company_invitations` så der er rent bord.

### 3. Fix links

- **monday-webhook**: Ret `signup_url` fra `https://topix.lovable.app/auth` til `https://topix.lovable.app/auth?mode=signup`

### 4. Opdater fallback invitationsmail

I `send-invitation-email/index.ts`: Opdater `FALLBACK_HTML` til at bruge brand-farven `#0fa968` (emerald) i stedet for `#6366f1` (indigo), og opdater font-styling til at matche jeres templates.

### 5. Tilføj "Fjern alle medlemmer"-knap i UI

Tilføj en knap på Members-siden (kun synlig for advisors) med bekræftelsesdialog der:
- Viser antal medlemmer der vil blive fjernet
- Kalder `manage-advisor` med `action: 'bulk-remove-members'`
- Refresher siden efter succes

### 6. Deploy og test

Deployer opdaterede edge functions og verificerer flowet.

---

## Tekniske detaljer

**Filer der ændres:**
- `supabase/functions/manage-advisor/index.ts` — ny `bulk-remove-members` action
- `supabase/functions/monday-webhook/index.ts` — fix signup_url (linje 290)
- `supabase/functions/send-invitation-email/index.ts` — opdater FALLBACK_HTML farver
- `src/pages/Members.tsx` — tilføj "Fjern alle medlemmer"-knap med bekræftelsesdialog

**Hvad der IKKE røres:**
- Admin-bruger (jonas@topix.dk)
- Advisor-brugere (jonas@topix.dk, jh@jonasherlev.dk, morten@molainvest.dk)
- Virksomheder (de 34 companies bevares — kun medlemmer og invitationer fjernes)

**Data der slettes:**
- 37 member-profiler og deres auth-konti
- 5 milestones (tilknyttet brugere)
- 30 pending + 4 accepted invitationer
- Relaterede company_members-rækker

