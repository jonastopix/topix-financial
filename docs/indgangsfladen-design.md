# Indgangsfladen — fra invitation til aktivt medlem

**DESIGNDOKUMENT.** Beslutningerne er truffet 1.–2. september 2026.
§1–8 er den besluttede form, skrevet før noget var bygget. **Status 2/9
aften: trin 1–2 (opslaget bærer mail og navn; /auth forudfylder) er
bygget i #537 og bevist i drift kl. 20:30 — se tillægget §9–13. Trin
3–7 er fortsat kun design.** Samme regel som `docs/indgangen-design.md`:
hver påstand er enten målt (med kilde), eller mærket som ikke målt/åben.
Reconen bag (2/9) ligger uden for repoet; de målte fund er skrevet ind
her, så dokumentet står alene.

Afgrænsning mod `docs/indgangen-design.md`: det dokument handler om
kæden FØR invitationen (underskrift → betaling → invitation sendes).
Dette dokument handler om kæden EFTER: fra klik i invitationsmailen til
medlemmet står på forsiden.

**Ikke målt i denne recon:** det levende Supabase-projekt
(`loiavmastgeieqyiwyyr`, Lovable-ejet) kunne ikke tilgås. Om
mailbekræftelse er slået til i Supabase Auth, hvilken version af
`handle_new_user()` der kører i prod, og hvor mange auth-brugere der er
ubekræftede, er derfor ikke målt. Repoet har ingen `[auth]`-sektion i
`supabase/config.toml`, så indstillingen findes ikke i koden.

## 1. Problemet

Rejsen er otte skridt, hvor der burde være to. Målt 2/9 ved læsning af
`Auth.tsx`, `App.tsx`, `useAuth.tsx`, `Onboarding.tsx` og `Index.tsx`:

    klik i mail
      → /auth?mode=signup&invite=<token>: opret konto (navn, mail TOM, kode)
      → «Tjek din mail» (Auth.tsx:227-244, når signUp ikke giver session)
      → bekræftelsesmail (auth-email-hook → signup.tsx «Bekræft din email»)
      → klik tilbage til / (emailRedirectTo = window.location.origin)
      → /onboarding trin 1: navn IGEN (forudfyldt) + branche (valgfrit)
      → /onboarding trin 2: tre kort, samme overskrift
      → forsiden

Og landingen er Hjemmebane, mens alt før den er mørkt. Målt:

- `index.html` hardkoder `<html class="dark">`.
- Hb-tokens findes kun under `.theme-hjemmebane`
  (`src/styles/hjemmebane.css`, headerkommentar: «App-temaet (:root/.dark
  i index.css) er urørt — PDF-eksporten afhænger af det»).
- `HbMemberShell` maler `html`-elementet papirfarvet ved mount og lægger
  den tidligere værdi tilbage ved unmount (`HbMemberShell.tsx:38-50`).
- Grep på `hb-`, `Hb[A-Z]`, `font-editorial`, `hjemmebane.css`:
  `Auth.tsx` 0/0/0/0, `Onboarding.tsx` 0/0/0/0, `ResetPassword.tsx`
  0/0/0/0, `Settings.tsx` 0/0/0/0. Indgangen taler shadcn-tokens
  (`bg-background`, `bg-card`), `font-brand` (Parkinsans) og
  `glass-card`.

Det mørke er arkitektur, ikke et designvalg.

## 2. Fem målte fund der gør forenklingen mulig

**MÅLT: `profiles.company_name` er død for inviterede medlemmer.**
`Auth.tsx:26` har `const [companyName] = useState("")` — ingen setter,
intet input — og sender `company_name: ""` i metadata (:108).
`handle_new_user()` (migration `20260319101733`) indsætter kun
`user_id, full_name, email` på profilen; metadata-`company_name` bruges
alene til at navngive en NY virksomhed, når invitationen ingen
`company_id` har. `Settings.tsx` gemmer feltet i `handleSave` (:419), men
`setCompanyName` bruges kun til at læse profilen ind (:186); ingen
`value={companyName}` findes. Feltet er NULL for altid, medmindre
`create-legat-enrollment` satte det. Netværks-RPC'erne
(`get_member_profile`, `get_member_directory`, migration
`20260810120000`:94) læser `companies.name`, ikke dette felt.

**MÅLT: `onboarded_at` læses KUN af `useAuth`.** Grep på `onboarded_at`
i `src`, `supabase/functions`, `supabase/migrations`: skrives af
`Onboarding.tsx:57`, `create-legat-enrollment/index.ts:86` og én
backfill-migration (`20260226125413`); læses af `useAuth.tsx:152` — til
`needsOnboarding` (:163), til `tbr.onboarded`-flaget (:168-176) og som
betingelse `profileOnboarded` for onboarding-agenten (:211). Ingen edge
function, ingen RPC, ingen anden side. Porten hviler altså på et felt,
hvis eneste formål er at afgøre om porten skal vises.

**MÅLT: mailbekræftelsen gater ingenting.** Grep på `email_confirmed`,
`email_verified`, `confirmed_at` og `emailConfirmed`: ingen rute-guard i
`App.tsx`, ingen RLS-policy, ingen edge function læser feltet som
betingelse — med ÉN undtagelse: `process-pending-invitation`s
e-mail-fallback-sti er fail-closed på bekræftelse (`index.ts:96-104`),
mens token-stien udtrykkeligt er uafhængig («works regardless of email
confirmation», :85). `get_users_last_login` returnerer kolonnen, men
begge kaldere (`Members.tsx:307`, `AdvisorDashboard.tsx:606`) læser kun
`last_sign_in_at`. `import-application:210` returnerer `email_confirmed`
i et svar, ingen frontend-kode læser det. `create-legat-enrollment:50`
sætter `email_confirm: true` ved admin-oprettelse.
Uoverensstemmelse: `CLAUDE.md` skriver at triggerens e-mail-gren
«kræver `email_confirmed_at` — ellers fail-closed»; repoets seneste
migration af `handle_new_user()` indeholder ingen sådan betingelse.
Prod-versionen er ikke målt.

**MÅLT: de to velkomstskærme er ÉN komponent med step-state.**
`Onboarding.tsx:37`: `useState<1 | 2>(1)`. Begge trin deler `CardHeader`
med overskriften «Velkommen til The Boardroom!» (:138); kun
`CardDescription` og `CardContent` skifter (:139-145, :148-241). Begge
bærer forventningsindhold — trin 1 har boksen «Hvad sker der nu?» med tre
punkter (:175-187), trin 2 har tre kort (:113-129). Samme besked to
gange. Trin 2 nås kun via `setStep(2)` i trin 1's `handleSubmit`
(:111); da `onboarded_at` skrives i trin 1, sender en genindlæsning
mellem trinene brugeren til `/` (OnboardingRoute, `App.tsx:181`) —
trin 2 vises ikke igen.

**MÅLT: Settings har allerede alt hvad onboarding indsamler, og mere.**
`Settings.tsx`: avatar-upload til bucket `avatars`, sti
`<user_id>/avatar`, `upsert: true`, max 2 MB (:333-381); branche som
to-niveau `Select` (`INDUSTRY_OPTIONS`, :25-115, ~50 underværdier) der
ved ændring synkroniserer `kpi_benchmarks` og `kpi_targets` fra
`industry_benchmarks` (:591-636); netværksprofil til `member_profiles`
(LinkedIn, ekspertise, «Spørg mig om», «Arbejder på», :137-147 og
:439-469); fuldt navn (:993-1001). Onboarding indsamler en delmængde
(navn + 15 flade branchevalg, `ONBOARDING_INDUSTRIES` :13-29, hvert
mappet til ét underniveau) af noget der findes et bedre sted — og
Onboarding synkroniserer IKKE KPI-mål ved branchevalg (:70-79), det gør
kun Settings.

## 3. Den nye rejse — to skridt

    Klik i invitationsmailen
        ↓
    ÉN skærm: navn og mail FORUDFYLDT og låst, sæt adgangskode
        ↓
    Forsiden (Hjemmebane) med «Færdiggør din profil» som næste skridt

Begrundelse: mailen kender vi fra invitationen, og navnet skal komme
med samme vej (se §4, første forudsætning — det er IKKE tilfældet i dag).
Det eneste vi ikke ved, er adgangskoden — og det er det eneste vi bør
spørge om.

Onboarding forsvinder som PORT. Branchen indsamles stadig — målt: den
læses rigtigt af `NoegletalView.tsx:426-435` (benchmarks på
`industry_code`), `generate-weekly-focus/index.ts:65,270-274,431` og
`run-company-agent/index.ts:782-791` (returnerer `no_industry_set` uden
den) — men møder medlemmet INDE på platformen.

Arkitekturen findes. Målt i
`src/components/hjemmebane/boardroom/nextStep.ts`: `deriveFocus` bygger
en prioriteret liste med NI slots, (a)–(i) — ikke otte; kommentaren på
`FocusItem.priority` (:133) siger «(a)=1 … (h)=8», men koden har slot
(i) med `priority: 9` (:330-342). Slot (i) er allerede «Tom
netværksprofil»: titel «Fortæl de andre hvad du er god til», CTA
«Udfyld din profil» → `/settings`, gated på `askMeAboutMissing`
(`BoardroomView.tsx:1718`, kun `member_profiles.ask_me_about`). «Profilen
er ufuldstændig» er altså allerede en kilde — men kun for ét felt, og
med laveste prioritet. Om branche og billede skal ind i samme slot
eller et nyt, og med hvilken prioritet, er åbent (§7).

## 4. Fire forudsætninger

**Invitationen skal bære MAIL og NAVN.** **LØST 2/9 (#537, bevist
kl. 20:30, §9):** `lookup_invite_company_info` returnerer nu også
`email` (invitationens) og `kontakt` (`companies.contact_person`),
migration `20260902190000`. Navnet fik IKKE et felt på invitationen som
foreslået nedenfor — det læses fra virksomheden, hvor `monday-webhook`
skriver det siden 2/9. For virksomheder oprettet før 2/9 var feltet
tomt; se §10. Målingen der lå til grund (stadig sand for 1/9):
`lookup_invite_company_info` (migration `20260310210323`) returnerede kun
`name` og `logo_url` på virksomheden. `company_invitations` har
kolonnerne `id, company_id, email, invited_by, token, status,
created_at, accepted_at, accepted_by` (migrationer `20260223152943`,
`20260303211758`) — **intet navnefelt**. `monday-webhook` henter i dag
KUN kontaktpersonens e-mail fra Monday (`fetchMondayContactEmail`,
`index.ts:48,178`); navnet hentes ikke. `import-application` gemmer
`contact_name` i `companies.application_context` (:306), ikke på
invitationen. Så: opslaget skal også give medlemmets mail, invitationen
skal have et navnefelt, og webhooken skal hente og gemme
kontaktpersonens navn.

**Mailbekræftelse slås fra i Supabase.** ÉN indstilling, uden for
repoet (ikke målt om den er slået til i dag, se indledning). Målt:
`Auth.tsx:115` er skrevet til begge udfald (`data.session ? "auto" :
"confirm"`), så koden bryder ikke. Men PPI's e-mail-fallback er
fail-closed netop på bekræftelse (§2, tredje fund) — med bekræftelse
slået fra kan e-mail-stien aldrig matche, og kun token-stien virker. Det
skal gennemtænkes, ikke antages.

**`mode=signup` UDEN token skal bevares.** Målt: `manage-advisor`
sender `/auth?mode=signup` uden token (`getSignupUrl`, `index.ts:15-18`);
`Auth.tsx:20` har `hasInvitation = !!inviteToken || modeParam ===
"signup"` med kommentaren «(advisor invitations)»; triggerens gren 1
matcher `advisor_invitations` på e-mail alene. Fjernes grenen, kan der
ikke oprettes rådgivere. Samme gren bærer medlemsinvitationer hvor
token-opslaget fejlede (`CompanyInvitations.tsx:190-194`,
`Members.tsx:696-701`: `tokenParam` bliver tom streng).

**Tre flader konverteres til Hjemmebane: `/auth`, `/reset-password`,
`/settings`.** Målt: `docs/hjemmebane/konvergens.md` §1 registrerer
`/auth` og `/reset-password` som «STANDALONE-GAMMEL ·
Konverteres-før-lancering», `/settings` som «GAMMEL ·
Konverteres-før-lancering», og `/onboarding` som «Afgøres-i-onboarding-
epic … + Konverteres-før-lancering». Konvergensdokumentets bindende
vedligeholdsregel gælder: ombygningen skal bogføres dér, og dette
dokument er en flade-design-blok med et Konvergens-afsnit (§8).

## 5. FEJL DER SKAL RETTES UAFHÆNGIGT — DashboardSkeleton uden ende

MÅLT (læst, ikke kørt): fejler `process-pending-invitation` — HTTP-fejl,
exception eller `success: false` — ender alle tre i samme gren i
`useAuth.tsx:242-255`: `ownCompanyId = null`, `ownCompanyName = null`,
`membershipTier = null`. Ingen toast, ingen UI-tilstand, kun
`console.error`. På forsiden rammer en ikke-rådgiver med tier null
`DashboardSkeleton` (`Index.tsx:71-77`) UDEN timeout og UDEN besked.
Der er ingen fejl, ingen vej videre, ingen der får besked.

Det er den værste tilstand i indgangen: nogen har klikket sig hele vejen
igennem og står på en side der ser ud som om den indlæser, for evigt.

Målt hvornår en bruger overhovedet kan stå uden virksomhed: triggeren
afviser signup uden invitation (`RAISE EXCEPTION`, migration
`20260319101733`:56-58), så normalt oprettede brugere har altid
`company_members`. Vejene fundet i koden: «Forlad virksomhed»
(`Settings.tsx:483-500` sletter rækken), `manage-advisor`
`delete-company` med `delete_users: false`, og rådgivere generelt.

Rettes uafhængigt af ombygningen.

## 6. Andre fund fra reconen, ikke prioriteret

- **PPI kaldes ved HVERT load** for enhver bruger uden
  `company_members`-række (`useAuth.tsx:231-241`) — herunder alle
  rådgivere. Et edge-function-kald pr. rådgiver-load, der altid svarer
  `no_pending_invitation`.
- **PPI opretter aldrig en virksomhed**, i modsætning til triggeren.
  Er invitationen en Monday-invitation med `company_id NULL`
  (`monday-webhook:229`; kolonnen blev nullable i migration
  `20260303125635`), fejler `company_members.insert` — `company_id` er
  `NOT NULL` dér (migration `20260223152943`) → 500 «Failed to create
  membership» (`index.ts:125-135`).
- **PPI sætter invitationen `accepted` UDEN `accepted_by`**
  (`index.ts:143-146`), hvor triggeren sætter det (:99-101).
- **PPI indsætter altid en `conversation`** (`index.ts:138-140`) uden at
  tjekke om virksomheden allerede har en; triggeren tjekker (:78-86).
- **Navnet indsamles to gange:** `Auth.tsx:327-339` (required), derefter
  `Onboarding.tsx:151-159` med samme værdi forudfyldt fra
  `profile.full_name`.
- **`tour_completed_at` stemples** stille ved første forsidebesøg
  (`Index.tsx:57-65`), men intet viser noget baseret på den.
- **`ONBOARDING_INDUSTRIES` er en anden taksonomi end Settings'**: 15
  flade valg, hvert mappet til ét underniveau (fx «Detailhandel» →
  `retail_other`, «Produktion og fremstilling» → `production_industrial`).
  Et medlem der vælger «Detailhandel» i onboarding får altså
  «Anden detailhandel» i Settings.
- **Invitationslinket kan sendes uden token** fra `CompanyInvitations.tsx`
  og `Members.tsx` (tom `tokenParam` hvis opslaget fejler), mens
  `monday-webhook`, `import-application` og `send-invitation-email`s
  egen afledning (:153) altid sætter token.

## 7. Åbne punkter

- **Kan «profilen er ufuldstændig» udvides i `deriveFocus`, og med
  hvilken prioritet?** Målt at slot (i) allerede findes for ét felt
  (`ask_me_about`) med prioritet 9 (laveste, «kun i en rolig uge»). Om
  branche og billede hører i samme slot eller et nyt — og om et nyt
  medlems tomme profil skal ligge højere end en rolig uges nudge — er
  ikke afgjort.
- **Hvad sker der med brugere der allerede står midt i det gamle flow,
  når porten fjernes?** Ikke undersøgt. Målt kun: `onboarded_at` er
  backfilled for alle profiler der fandtes 26/2 (migration
  `20260226125413`), og `tbr.onboarded`-flaget i localStorage ryddes af
  `useAuth` når serveren siger nej (:157-161).
- **Rækkefølgen mellem de tre Hjemmebane-konverteringer.** Ikke afgjort.
- **Hvad `Auth.tsx`s Google-vej gør med et invitationstoken.** Målt:
  tokenet lægges kun i `redirect_uri` (:136-138), ikke i user-metadata;
  triggeren falder derfor til e-mail-match. Hvad Lovables OAuth-lag
  lægger i `raw_user_meta_data`, er ikke målt.
- **Hvad de andre medlemsflader (`/reports`, `/kpis`, …) gør uden
  `companyId`,** når PPI har fejlet. Ikke målt.

## 8. Konvergens (jf. `docs/hjemmebane/konvergens.md`, vedligeholdsregel 2 og 3)

- **(a) Hvad findes i forvejen:** `/auth`, `/reset-password`,
  `/onboarding` (standalone-gammel) og `/settings` (AppLayout-gammel);
  forsiden `/` og `/medlemmer/:id` er Hb. Vejen til Indstillinger fra
  Hb-skallen findes allerede (`HbSidebar.tsx:129-134`, med kommentaren
  «en vej til indstillinger i gammelt udtryk er bedre end ingen vej»),
  og `MemberProfileView.tsx:173-181` linker til `/settings` fra en tom
  egen profil.
- **(b) Hvordan bygges der sammen med det:** signup-skærmen bygges som
  Hb-flade; Settings konverteres og bliver hjemmet for det onboarding
  indsamlede; forsidens fokus-motor bærer «næste skridt».
- **(c) Hvilken dobbelthed afvikles:** `/onboarding` som port (§1-rækken
  «Afgøres-i-onboarding-epic» i konvergens.md lukkes med dette
  dokument); to brancheindsamlinger med hver sin taksonomi bliver til
  én (Settings'); to navneindsamlinger bliver til nul.
- **Admin-modstykke (regel 3):** intet — indgangen har ingen
  admin-flade ud over invitationsoprettelsen i `Members.tsx` og
  `CompanyInvitations.tsx`, som ikke ændres af dette dokument.
  Invitationens nye navnefelt skal dog kunne ses/rettes dér; hvor, er
  ikke afgjort.

---

# Tillæg — trin 2 bevist i drift (2. september 2026, aften)

Alt nedenfor er målt 2/9 om aftenen. Tidspunkter er kørsler i Lovable
SQL editor. Fundene om `contact_person`, tokens og triggers bygger på
reconen `~/Downloads/recon-contact-person.md` (uden for repoet); de
målte fund er skrevet ind her, så dokumentet står alene.

## 9. Trin 2 er bevist i drift — kl. 20:30

`/auth?invite=<token>` forudfylder mail (låst: `readOnly`,
`Auth.tsx:388`) og navn (redigerbart, `required`) fra invitationen.
Bevist på Two Socks' rigtige invitation, efter at `contact_person` var
sat (§10). Metadata ved signup er `{ full_name, invite_token }`.

Trin 3–7 mangler fortsat: mailbekræftelse slås fra i Supabase Auth,
Onboarding-porten pensioneres, `/auth` og `/settings` til Hjemmebane, de
tre `valueCards` får et hjem (rækkefølgen står i reconen
`~/Downloads/recon-adgangsrejsen.md` §4).

## 10. Datahullet: `contact_person` var tomt på 35 af 39 — delvist lukket

Målt kl. 20:10: `contact_person` var tom streng på 35 af 39
virksomheder, NULL på 1, udfyldt på 3. Uden feltet er trin 2 kun halvt:
mailen forudfyldes, navnet ikke.

Årsagen er målt i repoet: feltet skrives ÉT sted —
`monday-webhook/index.ts:320` via `bygKontaktnavn(fornavn, efternavn)`
— og kun i «Godkendt»-grenen fra 2/9. `import-application` skriver det
aldrig; den lægger navnet i `application_context.contact_name`. Ingen
frontend-dialog og ingen SQL-funktion skriver feltet.

Tre virksomheder blev rettet kl. 20:28 med Monday som kilde. Selve
skrivningen (rækker, guard, optælling, hvad der bevidst IKKE blev rettet)
er bogført i `docs/indgangen-design.md` §32, hvor webhooken der ejer
feltet hører til. Resultat: 6 udfyldte, 32 tomme.

**Fejl i repoet, rettet i kommentaren (ikke i adfærden):** migration
`20260902190000` sagde ved `'kontakt'` at `contact_person` «ER NULL» for
alt ikke-Monday-oprettet. Forkert: kolonnen har `DEFAULT ''` siden
`20260225104718`, og prod havde 35 tomme strenge mod 1 NULL. Adfærden
er korrekt — `Auth.tsx:101` gør `?? ""` + `trim()`, så NULL og tom
streng behandles ens — men begrundelsen ville vildlede den næste læser.
Kommentaren i migrationsfilen er rettet 2/9.

## 11. Værn om invitationslinkene — intet link blev gensendt

Krav: en UPDATE på `companies` må ikke røre nogen invitation, og intet
link må gensendes. Målt tre veje:

- **Tokens før og efter:** md5-fingeraftryk af alle fire pending tokens
  målt før og efter skrivningen kl. 20:28 — identiske: `d1cce835`,
  `fe007f4f`, `ee3ec6b5`, `328297fc`.
- **Prod kl. 20:24:** INGEN triggers på `public.companies` (`pg_trigger`,
  `not tgisinternal`). Kaskaden til `company_invitations` er en FK
  `ON DELETE CASCADE` (migration `20260225103844`), ikke en trigger.
- **Repoet:** intet sted ændrer et eksisterende token; ingen
  `UPDATE … SET token`; «gensend» (`Members.tsx`, `CompanyInvitations.tsx`,
  `manage-advisor`) genbruger altid det eksisterende token, og
  `send-invitation-email` overskriver oven i købet `signup_url` med
  tokenet fra databasen. Kun INSERT skaber tokens; ét sted sætter det
  selv (`create-legat-enrollment`, `crypto.randomUUID()`).

## 12. Fejlslutning, rettet 2/9 — `invited_by` afgør hvis invitationen er

Claude læste en pending invitation fra 15/6 (`chatrine@remm.dk`,
company `9f00e582-1050-4d47-ba8f-221e75e72fab`) som «et medlem uden
adgang». Jonas rettede: det er en EKSTRA bruger som REMM selv har
inviteret ind, og der er løbende dialog.

Signalet lå allerede i målingen og blev ikke læst: `invited_by` var
`44d1a5cb…` — en anden bruger end de tre invitationer fra 1/9
(`23e81de4…`). **Lære:** `invited_by` afgør om en invitation er vores
(rådgiverens) eller virksomhedens egen, og skal læses FØR en pending
invitation kaldes et hul. (Jf. `docs/indgangen-design.md` §24 om hvad
`invited_by` er og ikke er.)

## 13. Åbne punkter fra aftenen

- **En invitation er ikke nødvendigvis medlemmets egen adgang.** En
  virksomhed kan invitere kolleger ind: `UNIQUE` er `(company_id,
  email)`, ikke `company_id` alene. Adgangsrejsen må ikke designes som
  om der er præcis én adgang pr. aftale. Hører sammen med
  `docs/indgangen-design.md` §1: «Virksomheden er en AFTALE. Medlemmet
  er en ADGANG.»
- **`company_invitations` har INGEN udløbsmekanik.** Ingen kolonne,
  ingen status ud over `accepted` (42) og `pending` (4). Et token er
  gyldigt i ubegrænset tid — REMM's har ligget åbent siden 15/6. Til
  sammenligning udløber betalingslinket efter 30 dage
  (`docs/indgangen-design.md` §7). Om invitationer skal udløbe er et
  valg der aldrig er truffet, ikke en fejl.
- **IKKE MÅLT: om Pro-Vision og E-skilte har adgang.** De var blandt de
  fem virksomheder uden række, men har ingen pending invitation. Det
  kan betyde accepteret eller aldrig inviteret.
- De to punkter om Monday-status «I gang» og `application_context.
  contact_name` hører til webhooken: `docs/indgangen-design.md` §32.
