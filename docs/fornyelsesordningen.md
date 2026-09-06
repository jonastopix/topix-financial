# Fornyelsesordningen

Besluttet 27. august 2026. Motoren `src/lib/fornyelse.ts` og
rådgiverfladen `FornyelsesSektion` er i drift. Fornyelsessiden og
betalingsvejen er bygget og bevist 1/9 (§5). Ingen mails — målt 6/9:
ordningen har ingen afsender (§5 punkt 5), og retningen er besluttet
(§7).

## 1. Den bærende regel

**Kommunikation kun ved «tilbyd». Alt andet er tavshed indtil udløb.**

Reglen findes fordi den modsatte fejl er alvorlig og uoprettelig: et
medlem der får at vide at det er fravalgt, kan ikke uinformeres igen.
Statussen `klar_til_afsked` er en intern dom, ikke en besked.

| beslutning | hvad medlemmet får |
|---|---|
| `tilbyd` | brief før slutdato + tilbud om 50 % af indgangsprisen + fjorten dages vindue efter udløb |
| `tilbyd_ikke` | **intet**. Kontrakten udløber som aftalt |
| ingen række | **intet**. Tavshed er standarden |

Ved `tilbyd_ikke` sendes ingen varsel, ingen forklaring, ingen
meddelelse om at en beslutning er truffet. Medlemmet oplever en aftale
der løber ud — ikke en afvisning. Ønsker de at fortsætte, kontakter de
selv, og så træffes beslutningen i en samtale mellem mennesker.

**Til den der bygger den første afsender:** `klar_til_afsked`,
`udloebet_tilbyd_ikke` og `ophoert` må ikke være målgruppe for nogen
mail, notifikation, chatbesked eller push. Ikke i en tørkørsel, ikke
bag et flag. Bygger du en målgruppe-query, skal den filtrere på
`tilbyd` — ikke på fravær af `tilbyd_ikke`, for så rammer den også dem
uden beslutning.

Statusnavnet lyder som en handling. Det er det ikke. «Afsked» beskriver
hvad der sker med kontrakten, ikke hvad der siges til mennesket.

## 2. Én side til alle uden tilbud

Siden som en udløbet uden beslutning møder, skal være **nøjagtig den
samme** som den en `tilbyd_ikke` møder.

Er de to forskellige, kan medlemmet udlede sin kategori — ved at
sammenligne med en anden, eller ved at bemærke hvad der mangler. Det
ville lække dommen uden at nogen sendte den.

## 3. Fjortendagesvinduet

Besluttet 27/8: et medlem der HAR fået et tilbud, kan forlænge i fjorten
dage EFTER slutdatoen til 50 % af sin indgangspris.

I vinduet har medlemmet **ikke adgang** til platformen. De lander på
fornyelsessiden. `computeMembershipTier` ændres derfor ikke — de er
`expired`, og gaten er det der skal gøres indbydende.

Vinduet findes endnu ikke som tilstand i motoren. I dag bevarer en
truffet beslutning sin status uanset afstanden til slutdatoen; det er
den rigtige grænse, men den skelner ikke dag 3 fra dag 40.

## 4. Hvad motoren afgør i dag

Statusser efter PR #451:

- `ophoert` — udløbet uden truffet beslutning. Afsluttet kundeforhold,
  vises ikke på rådgiverlisten. Afgøres FØR ikrafttrædelses-reglen.
- `udloebet_tilbyd` / `udloebet_tilbyd_ikke` — udløbet MED beslutning.
  Beslutningen har forrang og bevares.
- `uden_for_ordningen` — slutdato på eller før `FORNYELSE_IKRAFT_DATO`
  (2026-09-10), stadig aktiv. Personlig dialog, ordningen rører dem ikke.
- `beslutning_mangler` / `klar_til_tilbud` / `klar_til_afsked` — inden
  for tresdagesvinduet før udløb.
- `i_god_tid`, `ingen_slutdato`, `selvbetjener` — vises ikke.

**Konsekvens der skal kendes:** en virksomhed uden beslutning forsvinder
fra listen når den udløber. Beslutningen skal derfor træffes før
slutdatoen, ellers glider virksomheden ud af billedet midt i dialogen.

## 5. Hvad der mangler før noget kan sendes

Fire led, i rækkefølge:

1. **Indgangsprisen som data.** Findes ikke i databasen. Priserne er
   hardkodede i Stripe-funktionerne, de individuelle aftaler ligger på
   Monday, og `MembershipExpiredGate` siger i dag «Din fornyelsespris
   afhænger af din oprindelige aftale» netop fordi systemet ikke kender
   tallet. Uden det kan hverken en mail eller en knap nævne de 50 %.
   Beslutning udestår: beløb direkte, eller kohorte-felt.

   **LØST 1/9.** Beslutningen er truffet: beløb + afvigelsesfelt
   (`indgangspris_oere` + `fornyelsespris_oere`), ikke kohorte-felt.
   De 33 virksomheder er backfillet. Begrundelsen står i
   `docs/fornyelseskaeden-1-september.md` afsnit 2.

2. **Fjortendagesvinduet som tilstand** i motoren, så en aftager kan
   skelne «tilbudt, tre dage tilbage» fra «tilbudt, vinduet lukket».

   **STADIG ÅBENT, målt 6/9.** `FornyelseStatus` har ingen
   fjortendages-tilstand; `udloebet_tilbyd` gælder «uanset hvor længe
   siden slutdatoen er» (`src/lib/fornyelse.ts:131`), så et tilbud står
   i gaten til nogen fjerner beslutningen. Punktet er nu forudsætning
   for to ting: mailkæden (§7) og Studio Minis række
   (fornyelseskæden §13.4).

3. **Fornyelsessiden.** `MembershipExpiredGate` er i dag en gate med tre
   udveje, hvoraf den ene er en mailto. Den skal kunne bære et konkret
   tilbud — og den skal se ens ud for alle uden tilbud, jf. §2.

   **LØST 1/9 (#480, #481, #488, #492).** Gaten bærer et konkret tilbud
   med tre betalingsmodeller, afgjort serverside af
   `hent-fornyelsestilbud`; `tilbyd_ikke` og «ingen beslutning» giver
   byte-identisk svar, og siden har bevidst ingen indlæsningstilstand.
   Begrundelsen står i `docs/fornyelseskaeden-1-september.md` §6.

4. **Betalingsvejen.** Abonnementsvejen virker hele vejen (Stripe →
   webhook → `subscription_status` → tier). Kontrakt-fornyelse har ingen
   betalingsvej: `checkout.session.completed` i payment-mode springes
   bevidst over i webhooken, og intet skriver `contract_end_date`
   automatisk. Den eneste forlængelse i dag er manuel via
   `EditCompanyDialog`.

   **LØST 1/9 (#486, #487, #489), bevist i produktion samme dag.**
   `opret-fornyelse-checkout` opretter sessionen ud fra virksomhedens
   gemte pris; fornyelsesgrenen i `stripe-webhook` skriver
   `company_perioder` og flytter `contract_end_date` tolv måneder fra
   betalingsdagen, idempotent på sessionens id, og sætter `cancel_at` på
   rate-abonnementet. Se fornyelseskæden §7, §11 og §12. *Målt 6/9:*
   alle forudsætninger i prod og Stripe er grønne (fornyelseskæden
   §13.5).

5. **Afsenderen.** *Nyt punkt, målt 6/9.* Der findes ingen: ingen mail,
   ingen skabelon, ingen cron, ingen kode bag §1's «brief før slutdato».
   Kæden er to menneskelige klik og ét Stripe-event, og medlemmet hører
   først om sin fornyelse ved at MISTE adgangen og selv finde tilbuddet
   i gaten (fornyelseskæden §13.1). Det er det led der mangler før §1's
   løfte til `tilbyd`-gruppen kan holdes. Retningen står i §7.

**Om ikrafttrædelsen, målt 6/9:** 10/9 er ikke en tændingsdato. Intet
kører i koden den dag; `FORNYELSE_IKRAFT_DATO` sammenlignes med
virksomhedens slutdato og bliver virkningsløs efter 10/9. Og datogaten
omgås på tilbuds- og checkout-vejen — en virksomhed «uden for
ordningen» får et fuldt systemtilbud, hvis nogen trykker Tilbyd
(fornyelseskæden §13.2–13.3). Den reelle deadline for afsenderen er
midten af november: efter Doggybed 13/10 er der ingen fornyelse før
Livja 16/12, og derefter fjorten mellem marts og juni 2027
(fornyelseskæden §13.4).

## 6. Målt baggrund, 27. august

Seks virksomheder har mistet medlemskabet uden nogensinde at få ét målt
tal ind. Fem af dem er hele førstekohorten fra maj 2025 — samme
startdato, samme slutdato, nul målte måneder. Den sjette, Friends &
Fries, udløb 22. august og var logget ind to dage senere.

Tre udløber inden ikrafttrædelsen og falder derfor uden for ordningen:
LineAlmegaard (1/9), Studio Mini (5/9), CARMA STUDIO (7/9). To af dem
har nul målte måneder. De håndteres i personlig dialog.

Se `docs/aktiveringsmaaling-27-august.md` for det fulde billede.

## 7. Retningen — besluttet 6. september 2026

**Medlemmet skal høre om sin fornyelse fra SYSTEMET, ikke ved at miste
adgangen.** Besluttet af Jonas 6/9, efter målingen i fornyelseskæden
§13.1: i dag er det første et medlem i `tilbyd`-gruppen ser, gaten
efter udløb. §1 står ved magt — kun `tilbyd` udløser noget — men
«tilbyd» skal betyde at systemet siger det, ikke at vi håber medlemmet
logger ind.

**Formen:**

- To mails et antal dage før slutdato. Tallene er ikke afgjort.
- Et tilbud om at booke en snak med Jonas via Calendly.
- En notifikation til rådgiveren når mail 1 er sendt, så den personlige
  chatbesked kommer EFTER systemets mail og ikke i stedet for.

**Formen SPEJLER INDGANGENS KÆDE** (målt 6/9,
`~/Downloads/recon-indgangens-mailkaede.md`, uden for repoet;
`docs/indgangen-design.md` §26 bærer formen): pg_cron → `net.http_post`
med vault-nøglen → Bucket B-funktion med `authenticateServiceRole` →
TØRKØRSEL SOM STANDARD → ren motor afgør hvilken dag hver række står på
→ byg mail → enqueue → stempl KUN når afsendelsen lykkedes.

**Konsekvens for datamodellen:** `company_fornyelse` mangler
stempel-felter svarende til `company_betalingslink`s
`betalingsmail_sendt_at` og `sidste_paamindelse_dag`. Uden dem kan en
cron ikke vide hvad den allerede har gjort. De skal med i FØRSTE
migration, ikke bygges på.

**Forudsætning i motoren:** fjortendagesvinduet som tilstand (§5 punkt
2). En afsender der ikke kan skelne «tilbudt, tre dage tilbage» fra
«tilbudt, vinduet lukket», sender forkert.

**Calendly:** der findes ingen statisk Calendly-URL i huset; alle tre
steder bygger engangslinks serverside via API'et. En «snak om fornyelse
hos Jonas» kræver en ny event type, som ikke findes endnu. Og betalte
bookinger registreres i dag aldrig tilbage i platformen (målt 3/9,
OVERLEVERING DEL 3), så linket i mailen skal være et almindeligt link —
vi lover ikke en måling vi ikke kan holde.

**Deadline:** midten af november 2026 (Livja 16/12 minus 30 dage), ikke
10/9 — se §5's note om ikrafttrædelsen og fornyelseskæden §13.4.
