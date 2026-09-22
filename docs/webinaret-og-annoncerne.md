# Webinaret og annoncerne — fra Facebook-klik til medlem, og hvad det koster

**Skrevet 20/9-2026 (bogføringen af 19.–20/9), ført ajour efter #1036.** Kilder: commit-beskederne
#1013–#1029, #1034 og #1036 (læst, ikke skrevet af), udkastmapperne i
`~/Downloads/`, og målinger mod prod-basen og Klaviyo 20/9 kl. 08:05–08:25.
Tider er danske. Se også `docs/marketingmotoren.md` (lagene, der bruger
tallene) og `docs/OVERLEVERING.md` DEL 2 «19.–20. september».

---

## 0. Kæden i én linje

```
Meta-annonce ─fbclid/utm_content─▶ eWebinar-tilmelding ─email─▶ ansøgning ─▶ aftale ─▶ medlem
   (#1018 · #1023)                 (#1013 · #1014 · #1015)      (ansøgningsflowet 18/9)
                                          │
                                          └─ fremmøde (set_procent) ─▶ Klaviyo «deltog / mødte ikke» (#1034)
```

Meta ser klikket. eWebinar ser tilmeldingen og hvor meget der blev set.
**Kun platformen ser hele vejen** — og derfor kan prisen pr. led regnes her og
ingen andre steder (#1021).

---

## 1. eWebinar → platformen (#1013, #1014, #1015 · 19/9 08:58–09:47)

- **`ewebinar-webhook`** (Bucket C, `verifyEwebinarSignature` over den RÅ
  body, trigger «All»): hver besked gemmes rå i `webinar_haendelser`
  (idempotent på SHA-256 af body), og én aktuel række pr. tilmelding i
  `webinar_tilmeldinger` (procenten går aldrig ned). **Dommen «har set (≥ 75 %)
  / delvist / mødte ikke op» UDLEDES af `set_procent`** i
  `_shared/webinarDom.ts` (spejlet i `src/lib`, paritetstest) — aldrig gemt,
  aldrig af hændelsestypen; uden tal falder den tilbage på eWebinars `state`.
- **`ewebinar-import`** (#1014): engangsimport af de eksisterende tilmeldte
  (330 ved bygning, 597 ved kørsel) i tre tilstande — mål, tørkørsel,
  skrivning — samme fletning som webhooken, så to veje ikke kan give
  dubletter. Uden `EWEBINAR_API_KEY` rører den intet.
- **Målt og sagt højt:** eWebinars dokumenterede felter bærer IKKE en
  procent; «Total watched %» findes kun i deres datamodel. Feltet `attended`
  gemmes og bærer formentlig deltagelsen — **bevises først tirsdag 22/9.**
- **#1015 — annoncesporet:** målingen af API'et viste mere end vi ledte
  efter. Hver tilmelding bærer HELE sporet: `utm_source/medium/campaign/
  content/term`, `referrer`, `fbclid` plukket UD af origin-URL'en, plus by,
  land, enhed, tidszone og `widget_source`. Egne kolonner (migration
  `20260919150000`), ikke kun rå — så en BESTEMT Facebook-annonce kan følges
  hele vejen til et medlemskab, noget ingen annonceplatform kan, fordi de kun
  ser klikket. IP gemmes bevidst ikke i egen kolonne.
- **Koblingen til ansøgninger er email alene** (begge `lower`), ét opslag
  (`hooks/webinar.ts`). Anbefalingen læser stadig KUN ansøgerens eget svar —
  målingen vises ved siden af.

**Tilstand i prod 20/9 08:23:** migrationerne `20260919130000`, `140000`
(`kilde`) og `150000` er KØRT; begge functions er oppe (401 på tomt kald —
som altid kun «oppe», ikke «ny kode»). 594–597 tilmeldinger importeret 19/9.

---

## 2. Tallene på rådgiverfladen — `/webinar` (#1017 · 19/9 10:49)

`src/lib/webinar/dashboard.ts` + `WebinarView.tsx`. Jonas så siden og fandt
fire ting; tre kom til:

- **Tragten øverst:** tilmeldte → mødte op → så færdigt → ansøgte → blev
  medlem, med procent af leddet før. Hele vejen på én linje.
- Pr. session: ansøgt-% og medlems-%; «mødte op» som brøk OG procent («29 af
  91 · 32 %»); tal på grafen; **tiden fra tilmelding til ansøgning**, så vi
  ved hvornår der skal skrives til folk; kolonner og overskrifter flugter
  (rod: to grids, `auto` løste forskelligt — én delt `TAL_GRID`).
- **`pct` runder aldrig små tal til nul:** 1 ansøgning ud af 594 er «0,2 %»,
  ikke «0 %».
- «fb» og «facebook» er to navne for samme kilde.

Udkast: `~/Downloads/udkast-webinar-dashboard/`.

---

## 3. Meta — annoncerne, forbruget og tokenet (#1018, #1022, #1023, #1025, #1027)

- **#1018 (11:19):** de 597 tilmeldinger bærer elleve annoncer — kun som
  numre. `meta-annonce-opslag` beviser koblingen `utm_content ↔ Metas
  annonce-id`; `meta-annoncer-cron` gemmer forbrug, visninger og klik pr.
  annonce pr. dag i `meta_annonce` + `meta_annonce_dag` (migration
  `20260919170000`, KØRT). **Historikken kan ikke hentes bagud** — hver dag
  uden cronen er en dag, vi aldrig får igen. **Kun læseadgang:** ingen
  kodesti kan ændre budget, status eller bud.
- **#1022 (15:53) — tokenet under forkert navn:** genereret rigtigt, godkendt
  af en anden administrator, men gemt som `META_CAPI_TOKEN`; værdien kan ikke
  hentes frem igen i Lovable. Koden læser `META_ADS_TOKEN` først og falder
  tilbage på nødnavnet — faldbacken bor ét sted, logger en advarsel, og et
  værn går rødt den dag Conversions API lægges i repoet (for da bærer det
  navn et token til pixlen). **Navnene ryddes op, næste gang der alligevel
  skal genereres et token.**
- **#1023 (16:05) — første rigtige kald:** vi bad hvert objekt om det andets
  felter (`objective` bor på kampagnen, ikke annoncen → 400). Og **ni af
  elleve mærkater er slet ikke id'er** — det er navne, vi selv har skrevet i
  annoncelinket («IMG | 08-kontoret-skaerm»). Svaret tæller nu tre grupper:
  fundne id'er, læsbare navne, ikke-fundne id'er — «2 af 2», ikke «2 af 11».
  «IKKE PRØVET» når alle mærkater er navne. Målt: to id'er dækker 400
  tilmeldinger, ni navne resten af 608, ingen uden kilde.
- **#1025 (17:40) — vinduet:** kaldet blev sendt med `since` 1/8, og cronen
  tog imod det uden at bruge det — hentede syv dage og svarede «alt i orden».
  Nu virker `since`/`until` (syv dage som standard); en grænse forhindrer, at
  nogen henter to år (insights-API'et bliver langsomt og dyrt). Hele
  perioden fra 17/8 hentet bagefter.
- **#1027 (18:05) — bodyen:** datoerne var pakket i et objekt, koden ikke
  kendte; fem afvisninger for forkerte datoer, ingen for en ukendt nøgle.
  **Døren var lukket, vinduet stod åbent.** Ukendte felter afvises nu med
  besked. Målingen bag værnet: **62 functions læser felter af en body, og
  ingen afviser ukendte felter** — detektoren fandt to fejl i sig selv
  undervejs (37 → 62), og en dårligere detektor havde erklæret 25 grønne.

Secrets: `META_ADS_TOKEN` (pt. under `META_CAPI_TOKEN`), `META_AD_ACCOUNT_ID`.
Udkast: `udkast-meta-annoncer/`, `udkast-meta-vindue/`, `udkast-body-felter/`,
`recon-meta-annoncer/`.

---

## 4. Prisen pr. led (#1021, #1024, #1028, #1029 · 15:45–19:18)

`src/lib/webinar/annoncepriser.ts` + `AnnoncepriserAfsnit.tsx` — på
`/webinar`, men bygget så det kan flyttes til en marketingflade uden at røre
en linje (henter kun forbruget selv; egne tal kommer ind som props).

- **#1021:** pris pr. tilmelding, pr. deltager, pr. ansøgning og pr. medlem
  — pr. annonce og samlet. **Et tal, der bygger på for få personer (< 5),
  vises ikke som en pris, men som det antal det er**, så «50.000 kr. pr.
  medlem» af ét medlem ikke kan stå og ligne en sandhed. Nul data giver en
  sætning, ikke 0 kr.
- **#1024 — Jonas' fund:** forbruget hentet for én uge, tilmeldingerne talt
  for hele perioden → en pris ca. **fem gange for lav**. Nu regnes enhver pris
  over SAMME vindue i tæller og nævner; perioden står på skærmen; kan de to
  ender ikke dækkes, vises prisen ikke (`afkort`: skær vinduet ned til det,
  data dækker — så «sidste 7 dage» kan vælges selv om Metas tal halter en
  dag). **Metas «lead» er ikke vores tilmelding:** Meta 257 over 30 dage, vi
  608 siden 17/8 — forskellen er forklaret på skærmen.
- **#1028 — dobbelttællingen (målt i prod 19/9 18:20):** samme navn i fire
  annoncer → «IMG | 11-maaneskin» stod fire gange, hver med alle 53
  tilmeldinger, og prisen blev 2, 24, 27 og 37 kr. for det samme. Forbruget
  for et navn lægges nu sammen på tværs af annoncerne; et værn sikrer at **en
  tilmelding aldrig optræder i mere end én række** (`id:` vinder over
  `navn:`). Meta: 150,74 kr. pr. lead (webinar) / 58,19 (VSL); vi: 24 kr. pr.
  tilmelding på den største annonce — forskellen er, hvad der tælles.
- **#1029 — læsbarheden:** enheden ved tallene («46 af 572 tilmeldte»),
  valutaen én gang (ikke «kr. DKK»), «Flere kampagner»-rækken forklarer sig
  selv, og **en session, der ikke er afholdt endnu, siger det** i stedet for
  «0 mødte op (0 %)».

Udkast: `~/Downloads/udkast-annoncepriser/`.

---

## 5. Ét mønster, ikke to fejl — tæller og nævner

To fund på to dage, fra hver sin ende:

> **Tæller og nævner skal dække samme periode — og en periode, der ikke er
> gået, er ikke en periode.**

| | annoncepriserne (#1024, 19/9) | dommen (#1033, 19/9 nat) |
|---|---|---|
| Hvad der ikke passede | **forbruget** dækkede en anden periode end tilmeldingerne | **nævneren** dækkede en periode, der ikke var gået endnu |
| Hvordan det så ud | en pris fem gange for lav | «0 % ansøgte inden 48 timer», tretten timer efter webinaret |
| Hvorfor det var farligt | et tal, nogen ville skrue op efter | et tal, nogen ville ændre en mail efter |
| Rettelsen | `afkort`: skær **vinduet** ned til det, data dækker | `maalMails`: skær **rækkerne** fra, hvis vindue ikke er lukket |
| På skærmen | «13.–18. september», og at der blev skåret | «ingen ansøgte inden 48 t endnu», og at tallet ikke er færdigt |

Fælles forudsætning: **tiden gives ind** (`sidsteDage(antal, nu)`,
`maalMails(ind, nu)`). Et modul, der spørger maskinens ur, kan ikke prøves på
en onsdag morgen fire dage ude i fremtiden — og så var fejlen aldrig fundet.
`annoncepriser.ts:afkort` og `marketing/maalingsdom.ts:maalMails` henviser
til hinanden i filhovederne. Se `docs/marketingmotoren.md` §7 fejl 6.

---

## 6. Fremmødet til Klaviyo (#1034 · 20/9 08:07)

Se `docs/marketingmotoren.md` §2. Kort: efter-flowet `YcBF9f` er datostyret og
fyrer på ALLE tilmeldte — også dem, der aldrig kom. Webhooken sender nu
«deltog» / «mødte ikke op» med session og tidspunkt, når `doemSetGrad`
skifter. Ingen migration. **Bevist i drift 20/9 08:41** af `ewebinar-proeve`
(#1036): tre kald, tre gange `enig: true`, begge metrikker i Klaviyo med 202 —
signering og verifikation er enige, så en 401 midt i webinaret er udelukket
ad den vej. Prøven signerer indefra, bygger registranten selv (`PROEVE-`) og
er ikke et signerings-orakel; to andre veje (nøglen i basen; webhook uden
signatur) blev afvist. **Og det gamle datostyrede flow `YcBF9f` skal slås fra
FØR tirsdag kl. 13:30** — ellers dobbelt post til 345; nul modtagere i syv
dage (Jonas 20/9), så det kan ske nu. Udkast: `udkast-webinar-fremmoede/`,
`recon-klaviyo-fremmoede/`, `recon-fremmoede/`.

---

## 7. Tirsdag 22/9 — det, der skal bevises

`~/Downloads/recon-boelgen-2/` (bølgen regnet om på 597 tilmeldte:
mail-loft, CVR-loft, rådgiverlisten ved 30 nye, tidsplan og beredskab) og
`recon-efter-webinaret/` (øjeblikket efter en hel visning).

- `attended`/procenten bærer deltagelsen (§1) — ellers `set_procent` via
  API-opslag bagefter.
- «deltog / mødte ikke op» når Klaviyo (§6) — ✅ bevist 20/9 08:41 af
  prøven; metrikkerne `Y9rrmF` og `WJ8PrD` findes.
- **`YcBF9f` slået fra før kl. 13:30** (§6) — ellers dobbelt post.
- **CVR-loftet** (`docs/OVERLEVERING.md` «19.–20. september» §3): 20/dag,
  klokken ved 80 %, berigelsen slået fra hele ugen 21.–26/9.
- Onsdag morgen: dommen svarer «observation» — og det er rigtigt.

## 7b. Tirsdag 22/9 — AFHOLDT og målt kl. 10:24

`maal-webinar-22-09.sql`, ét resultatsæt, kørt af Jonas. Fuld bogføring i
`docs/OVERLEVERING.md` «22. september (dagen)» §1 — her står kun tallene og
de to ting, der ændrer, hvad vi ved.

| | antal |
|---|---:|
| Tilmeldte | **384** |
| **Deltog** | **159** (set ≥ 75 %: **112** · delvist: **47**) |
| Mødte ikke op | **224** |
| Ukendt | 1 |

**Til Klaviyo:** «Deltog i webinar» 214 hændelser / 159 profiler · «Moedte ikke
op» 225 / 224 · `frisk = ja` på alle · **ingen profil fik begge** · 2 timeouts
gensendt af job 567. Flere hændelser end profiler er ventet: `unique_id` er
`<ewebinar_id>:<grad>`, og en opgradering fra «delvist» til «set» er en ny
hændelse, ikke en dublet.

**Det, §7 skulle bevise, er bevist** — med to tilføjelser:

1. **eWebinar TIER IKKE.** Reservevejen i køreplanen (`ewebinar-import` med
   `send_fremmoede: true`, kun hvis eWebinar ikke selv meldte fravær) var ikke
   nødvendig: eWebinar sendte **Missed/NotJoined for alle 224**. Importens
   no-show-vej blev ikke brugt og bliver stående som beredskab.
2. **«Deltog» sendes ved LOGIN, ikke ved slutningen.** Første hændelse faldt
   **09:00:04** med grad «delvist» — `doemSetGrad` svarer «delvist» på state
   `Joined`. Rigtigt, men det skal huskes, når tallet læses: 159 «deltog»
   betyder «kom ind ad døren»; **112** er dem, der blev.

**Og et fund, der ikke var planlagt:** `klaviyo_profil` **findes ikke i prod**.
#1066 er merget, men migrationen `20260921190000` er aldrig kørt, så
`klaviyo-profil-cron` er ikke i drift — samme klasse som `a18-tre-fra-monday`:
koden er i main, SQL'en er ikke kørt. Kort: `a21-webinar-tidspunkt`.

**Færre i flowene end tilmeldte — og det BLIVER sådan.** `Wq3MkG`/`SDVvCW`
kræver medlemskab af **Hovedlisten** OG samtykke. **AFGJORT 22/9 ~14:10 (Jonas,
ordret): «Hovedliste»-kravet BLIVER — tilmeldte, der ikke står på Hovedliste,
skal IKKE ind.** En webinartilmelding er ikke i sig selv samtykke til
markedsføring, og flowene må ikke optage nogen på det grundlag. Følgen, som er
tilsigtet: hændelsen når Klaviyo for alle 384, men flowet optager kun dem, der
allerede må modtage. Ingen ændring i lag 2.

---

## 7c. Webinarets tidspunkt på profilen — i drift 22/9 kl. 14:31

Påmindelsesmailene nævnte ikke tidspunktet, og sessionerne ligger på forskellige
tider (22/9 kl. 9, 13/10 kl. 11). eWebinar skriver kun en DATO uden tid
(«09/22/2026»), så platformen skriver selv tidspunktet.

I drift 22/9: job **571**, hver time på minut 17. Beviset er én rigtig skrivning
(kald 14306, status 201) **læst tilbage i Klaviyo gennem API'et**:
`tb_naeste_webinar` «2026-10-13 11:00:00» og `tb_naeste_webinar_tekst` «tirsdag
13. oktober kl. 11.00». Detaljerne i `docs/marketingmotoren.md` §2.2.

**Ikke lukket endnu:** tagget skal ind i `WFzxH9` og `UiECQS` + kampagnerne til
13/10, og kortet lukkes efter en **Preview** (`koereplan-webinar-tidspunkt.md`
trin 9). Fristen er kampagnerne til 13/10, altså senest **6/10**.

---

## 7d. Bekræftelsen og før-webinar-mailene — ændret 22/9 aften

**Bekræftelsen kom fra den forkerte ende.** Klaviyos flow `WFzxH9` skrev «Du har
fået en kalenderinvitation», mens **eWebinars egen bekræftelse var slået FRA** —
så der kom ingen invitation. Jonas rettede begge ~15:50: eWebinars bekræftelse
**TIL** med dansk tekst (den vedhæfter `invite.ics`; Apple Mail viste «Siri fandt
en begivenhed»), og Klaviyos `WFzxH9` **SLUKKET**. Én bekræftelse, fra den der
faktisk vedhæfter kalenderen.

**BESLUTTET (Jonas 22/9): før-webinar-mailene flytter til vores egen Mailgun.**
Platformen sender til **ALLE tilmeldte** via **Mailgun EU**; **Klaviyo beholder
efter-webinaret**. Afsender «Morten Larsen \<morten@webinar.topix.dk\>»,
Reply-To kontakt@topix.dk.

Grunden til, at det kan lade sig gøre for alle: Klaviyo-flowene kræver
Hovedlisten OG samtykke (§7b), og det krav bliver. En før-webinar-mail til en
tilmeldt er ikke markedsføring på et samtykke — den er en besked om det, de har
tilmeldt sig.

**Opsat 16:4x–17:0x, verificeret af Mailgun 16:56:** konto (Topix.dk ApS) ·
`webinar.topix.dk` i EU · shared IP · DKIM 2048 · DNS i Cloudflare (SPF, DKIM,
MX `mxa`/`mxb.eu.mailgun.org`, CNAME `email.webinar` → `eu.mailgun.org`, DNS
only) · secret `MAILGUN_SENDING_KEY`. **UMÅLT: planen (Foundation 50k) er ikke
bekræftet.** A bygger `udkast-webinar-foer-flow`.

### Et fund, vi ikke selv kan rette: eWebinars `.ics`

Målt 22/9 med `curl`: **HTTP 200 uden login**. `METHOD:REQUEST`, `ORGANIZER`
Morten Larsen, `ATTENDEE` `RSVP=TRUE`, `LOCATION`/`URL` = personligt joinLink.
**`attendeeId` er fortløbende, og filen bærer navn + e-mail** — listen kan i
princippet gennemløbes. eWebinars design; **meld det til dem**. Indtil da:
deltagerlisten til et webinar er ikke fortrolig. Kort: `a22-ewebinar-ics-aaben`.

---

## 8. 20. september — sporet lukkes fra klik til ansøgning, og fem felter viste sig at være observationer

**Princippet, der binder dagen sammen: et felt, vi ikke selv sætter, er en
observation — aldrig en nøgle.** Fem gange betød et felt ikke det, det hed:
eWebinars `eWebinar`-egenskab er en dato, der overskrives ved gentilmelding
(`recon-klaviyo-fremmoede`); Klaviyo læser `session_tid` som «string», så et
datofilter i et flow er dødt (#1040 → egenskaben `frisk`, regnet hos os);
`utm_source` er den bogstavelige værdi af én parameter i linket — tre
annoncegenerationer, fem stavemåder (#1044); `companies.status` er en
beslutning, et menneske har taget, og `subscription_status` er
exit-abonnentens felt — ingen af dem betyder «betaler»
(`recon-medlemsforloebet/fund-status-og-betalende.md`); og Stripes eget
`status` er `canceled` på 19 løbende abonnementer, fordi de kører på en
schedule. **Reglen:** nøglen udledes ved læsning, ét sted, med tests —
`annoncekilde.ts` for kanalen, `webinarDom.ts` for fremmødet, `stilleDom.ts`
for stilheden, `kontrakter` for «betaler». Klaviyo får den færdige dom som
egenskab, aldrig et råt felt at dømme på.

**Det, der ændrede sig — i rækkefølge langs kæden (§0):**

1. **Annoncen** — `url_tags` på ALLE annoncer sat til den kanoniske streng
   med id'er, ikke navne (Jonas 20/9; `recon-meta-annoncer` §11):
   `utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}`.
   Intet arves fra konto, kampagne eller annoncesæt — hver ny annonce skal
   have strengen selv, ellers dør sporet stille (`brud.maerkeErIkkeId`).
   Hentningen kører nu af sig selv: cron `meta-annoncer` 03:33 UTC,
   `meta-hentning-vagt` 04:33 (#1045; tabellen `meta_hentning`) — og den
   første kørsel blev beviset for, at «View code» ikke er driften (#1047).
2. **Kanalen** — `src/lib/webinar/annoncekilde.ts` + `_shared`-spejl (#1044):
   fb/facebook → Facebook, ig → Instagram, th → Threads, an → Audience
   Network, msg → Messenger; en sjette værdi er en rød prøve, indtil nogen
   oversætter den.
3. **Sitet** — theboardroom.dk's syv «Ansøg om en plads»-knapper sendte
   `?kilde=website` uden klikkets parametre (`udkast-to-spor-1` §A, Jonas i
   Lovable): nu `?kilde=direkte` + `sessionStorage`-klikket følger med; og
   platformen kender `website` som alias for `direkte` (#1049).
   topix.dk/webinar/optagelse's to knapper førte ind i SuperForm-formularen
   til det Monday-board, der blev slukket 19/9 00:50 (`recon-landingssider`
   §0) → `app.theboardroom.dk/ansoeg?kilde=webinar`.
4. **Døren** — `/ansoeg` gemmer de otte annoncespor-felter (utm_*, `fbclid`,
   landing, referrer) på ansøgningen, fail-soft (#1052; migration
   `20260921120000` kørt før merge). Beviset er en «opret» med
   `?utm_content=TESTAD` — værdierne på nyeste række, ikke «View code».
5. **Forløbet** — rådgiveren rykkes som ansøgeren (#1046): trin, der venter på
   os, har en trappe til kontakt@; «kom de?»-klokken efter samtalen. Calendly
   markerer aldrig no-show (0 af 33 invitees på syv måneder) — klokken er den
   eneste kilde.
6. **Optakten** — flowet `UiECQS` slukket 20/9 kl. 16: det havde syv
   mennesker i sig, ikke 354 (de 310 faldt ud, da fire mails blev nyoprettet
   19/9 aften), og countdown-forsinkelsen 1 → 2 dage pegede den forkerte vej
   (regnes fra webinar-datoen: 2 = søndag). Optakten er to kampagner til
   listen `Sz5fdA`: «1 dag før» mandag kl. 12:00, «på dagen» tirsdag kl. 05:00
   (Jonas rettede tidszonen i fladen før planlægningen; C målte tiderne i
   Klaviyos API — køreplanens 14:00/07:00 var før rettelsen). Kampagnerne til 13/10 bygges på samme måde
   (`koereplan-13-10.md`).
7. **Medlemmet** — 28 betalende målt på `kontrakter` (21 i Stripe, 7 via
   e-conomic); 5 har aldrig fået en bruger ind, 4 er holdt op med at logge
   ind; to klokker med trappe (#1048, `stilleDom.ts`, cron `stille-klokker`
   04:30 UTC). Målt på de udløbne: med bruger fornyede 3 af 4, uden 1 af 12,
   7 kan ikke måles — sletningen dag 45 tog beviset (mangelliste
   `a20-bevis-slettes-dag-45`).

**Det, der stadig ikke er bevist:** at annoncens id når hele vejen ind i en
rigtig ansøgning (TESTAD-prøven er kunstig); at `meta_hentning` får sin første
række i nat; at kampagnerne sender mandag 14:05 (Recipients ≈ 354). §7's liste
gælder stadig.
