# Fornyelsesordningen

Besluttet 27. august 2026. Motoren `src/lib/fornyelse.ts` og
rådgiverfladen `FornyelsesSektion` er i drift. Fornyelsessiden og
betalingsvejen er bygget og bevist 1/9 (§5). Fjortendagesvinduet er
bygget som tilstand og bevist 7/9 (§3). Ingen mails — målt 6/9:
ordningen har ingen afsender (§5 punkt 5); retningen er besluttet 6/9
og tallene 7/9 (§7).

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

**BYGGET 7/9 (#678).** Vinduet er tilstanden `udloebet_vindue_lukket`
i motoren — den ellevte status — og findes KUN efter beslutningen
`tilbyd`: `tilbyd_ikke` har aldrig haft et tilbud og har derfor intet
vindue at lukke; `udloebet_tilbyd_ikke` er uændret. Grænsen er 14 hele
UTC-kalenderdage efter slutdatoen (`FORNYELSE_TILBUDSVINDUE_EFTER_UDLOEB_DAGE`,
ikke at forveksle med beslutningsvinduet på 60 dage før udløb):
slutdato 1/10 giver sidste tilbudsdag 15/10, lukket 16/10. Kan dagene
ikke regnes (`dage_til_udloeb` null), bevares tilbuddet frem for at
lukke på et tal vi ikke har.

Betydningen, som alle aftagere følger: vinduet er lukket, der er intet
tilbud mere, kundeforholdet er slut, og enhver videre samtale er
menneskelig. Historikken bevares i `company_fornyelse` (beslutningen og
varselsstemplerne bliver stående) — tilstanden bærer den ikke. Derfor
er den skjult på rådgiverlisten som `ophoert`, giver ingen grund på
forsiden, og giver `{ tilbud: null }` i gaten — samme svar som
`tilbyd_ikke`, så kategorien ikke lækker.

`hent-fornyelsestilbud` kalder fra 7/9 MOTOREN frem for selv at tjekke
tier og beslutning; tilbud og betaling dømmer dermed på samme kilde.
Det lukkede hullet «et tilbud der aldrig udløber». Bevist i drift 7/9
kl. 09:36–09:38: dag 10 gav tilbud, dag 15 tog det væk — detaljen i
`docs/fornyelseskaeden-1-september.md` §14.

## 4. Hvad motoren afgør i dag

Elleve statusser efter PR #451 og #678:

- `ophoert` — udløbet uden truffet beslutning. Afsluttet kundeforhold,
  vises ikke på rådgiverlisten. Afgøres FØR ikrafttrædelses-reglen.
- `udloebet_tilbyd` / `udloebet_tilbyd_ikke` — udløbet MED beslutning.
  Beslutningen har forrang og bevares.
- `udloebet_vindue_lukket` — udløbet med beslutning `tilbyd`, og mere
  end 14 dage siden slutdatoen (§3). Vises ikke på rådgiverlisten.
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

   **LØST 7/9 (#678).** Tilstanden hedder `udloebet_vindue_lukket`;
   reglen og beviset står i §3. Studio Minis række (fornyelseskæden
   §13.4) lukker af sig selv 20/9 — om den skal ryddes før, er en
   beslutning.

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
omgås stadig på tilbuds- og checkout-vejen — `hent-fornyelsestilbud`
kalder fra 7/9 motoren, men udløbsgrenen afgøres FØR datogaten, så en
virksomhed «uden for ordningen» med beslutning `tilbyd` får et
systemtilbud de første 14 dage efter udløb (fornyelseskæden
§13.2–13.3). Den reelle deadline for afsenderen er
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

**Formen, tallene besluttet 7/9:**

- Mail 1 ved 30 dage før slutdato, mail 2 ved 7 dage før. Tilbuddet
  lever 14 dage efter slutdato (§3).
- Et tilbud om at booke «En snak om din fornyelse» hos Jonas:
  https://calendly.com/topix-jonas/fornyelse — et almindeligt link, ikke
  et engangslink (se Calendly nedenfor).
- En notifikation til rådgiveren når mail 1 er sendt, så den personlige
  chatbesked kommer EFTER systemets mail og ikke i stedet for.

**Konsekvens af dag 30:** rådgiverbeslutningen skal foreligge senest
dag 30 før slutdato, ellers sendes intet. En glemt beslutning forsinker
ikke mailen — den aflyser den. Det er §1's regel set fra kalenderen:
kun `tilbyd` udløser noget, og kun hvis det står der når cron'en kigger.

**Formen SPEJLER INDGANGENS KÆDE** (målt 6/9,
`~/Downloads/recon-indgangens-mailkaede.md`, uden for repoet;
`docs/indgangen-design.md` §26 bærer formen): pg_cron → `net.http_post`
med vault-nøglen → Bucket B-funktion med `authenticateServiceRole` →
TØRKØRSEL SOM STANDARD → ren motor afgør hvilken dag hver række står på
→ byg mail → enqueue → stempl KUN når afsendelsen lykkedes.

**Datamodellen — LØST 7/9 (#674, i prod kl. 08:51):** `company_fornyelse`
har `varsel_1_sendt_at` og `varsel_2_sendt_at`, begge nullable, plus en
eksplicit service-role-policy. To navngivne kolonner frem for et
dag-nummer som `company_betalingslink.sidste_paamindelse_dag`, fordi de
to varsler kan sendes uafhængigt: en sen beslutning skal kunne give
varsel 2 uden varsel 1. Tabellen har INGEN trigger (målt), så
skrivestien — også cron'en — skal selv sætte `updated_at`.

**Forudsætning i motoren — LØST 7/9 (#678):** fjortendagesvinduet er
tilstanden `udloebet_vindue_lukket` (§3). Afsenderen kan skelne
«tilbudt, tre dage tilbage» fra «tilbudt, vinduet lukket».

**Calendly — LØST 7/9:** event-typen «En snak om din fornyelse» findes,
https://calendly.com/topix-jonas/fornyelse. Det er et almindeligt link,
ikke et engangslink: betalte bookinger registreres aldrig tilbage i
platformen (målt 3/9, OVERLEVERING DEL 3), så vi lover ikke en måling
vi ikke kan holde.

**Det der mangler nu:** afsenderen selv — mail, skabelon, cron. Intet
af det findes (§5 punkt 5).

**Deadline:** midten af november 2026 (Livja 16/12 minus 30 dage), ikke
10/9 — se §5's note om ikrafttrædelsen og fornyelseskæden §13.4.
