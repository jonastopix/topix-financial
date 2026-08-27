# Fornyelsesordningen

Besluttet 27. august 2026. Motoren `src/lib/fornyelse.ts` og
rådgiverfladen `FornyelsesSektion` er i drift. Ingen mails og ingen
fornyelsesside er bygget.

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

2. **Fjortendagesvinduet som tilstand** i motoren, så en aftager kan
   skelne «tilbudt, tre dage tilbage» fra «tilbudt, vinduet lukket».

3. **Fornyelsessiden.** `MembershipExpiredGate` er i dag en gate med tre
   udveje, hvoraf den ene er en mailto. Den skal kunne bære et konkret
   tilbud — og den skal se ens ud for alle uden tilbud, jf. §2.

4. **Betalingsvejen.** Abonnementsvejen virker hele vejen (Stripe →
   webhook → `subscription_status` → tier). Kontrakt-fornyelse har ingen
   betalingsvej: `checkout.session.completed` i payment-mode springes
   bevidst over i webhooken, og intet skriver `contract_end_date`
   automatisk. Den eneste forlængelse i dag er manuel via
   `EditCompanyDialog`.

## 6. Målt baggrund, 27. august

Seks virksomheder har mistet medlemskabet uden nogensinde at få ét målt
tal ind. Fem af dem er hele førstekohorten fra maj 2025 — samme
startdato, samme slutdato, nul målte måneder. Den sjette, Friends &
Fries, udløb 22. august og var logget ind to dage senere.

Tre udløber inden ikrafttrædelsen og falder derfor uden for ordningen:
LineAlmegaard (1/9), Studio Mini (5/9), CARMA STUDIO (7/9). To af dem
har nul målte måneder. De håndteres i personlig dialog.

Se `docs/aktiveringsmaaling-27-august.md` for det fulde billede.
