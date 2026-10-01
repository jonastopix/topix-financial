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

### 2a. Hvor sikkert er tallet — Wilson på «Hvor kom de fra» (udkast 30/9-2026)

**Hvorfor.** Marketinganalytikerens værdivurdering 30/9 (målt i prod): med to
afholdte sessioner er leddet tilmeldt → mødte op / så færdigt (≥ 75 %) det
eneste, der kan skille annoncer ad. 22/9 havde 10 annoncer, 7 med ≥ 5
tilmeldte — fx 52 af 192 = 27 % mod en lille på 7 af 8 = 88 %. Rå procenter
lader 7 af 8 ligne en vinder og 1 af 2 ligne halvdelen. Nicklas (ekstern
marketing) vælger annoncer til 13/10 ud fra tabellen.

**Dommen** (`annoncespor()` i `src/lib/webinar/dashboard.ts`, spejlet i
`_shared/webinarDashboard.ts`; lag 6's `statistik.ts` spejlet BYTE-ENS i
`_shared/marketingStatistik.ts`, paritet i `webinarDashboard.paritet.test.ts`):
hver kilde-, kampagne- og annoncelinje bærer `maaling` = `{ grundlag,
fremmoede, saaFaerdigt }`, hver en `Andelsdom` (`andelsdom()`):

- **Wilson 95 %** med lag 6's `wilson` og `intervalOrd` — ingen ny formel.
- **Nævneren er de AFHOLDTE** (tilmeldte − kommende): en tilmeldt 13/10 kan
  ikke være mødt op endnu (§5 — tæller og nævner skal dække samme periode).
  «Kun det næste webinar» giver derfor «–» overalt.
- **Nævneren er personens FØRSTE række** (`foersteTilmeldingPrPerson`, samme
  som resten af sporet) — ikke den bedste grad over flere sessioner. En, der
  udeblev 22/9 og så færdigt 29/9 fra en anden annonce, tæller som udeblevet
  på den annonce, der hentede hende ind.
- **Under 5 ERSTATTER «for få» procenten** (`SPOR_FORHOLD_FRA` = 5, låst til
  `TROVAERDIG_FRA` og lag 6's `PERSONER_FOR_ET_FORHOLD` af en test — kan ikke
  importeres, fordi annoncepriser.ts importerer dashboard.ts). Intervallet er
  `null` i svaret, så ingen flade kan vise det alligevel.
- **«Skiller sig ud» KUN når intervallet ikke overlapper resten tilsammen**
  (`sammenlign` → «adskilte»), med `retning` højere/lavere, **OG begge grupper
  har ≥ 5 af HVERT udfald** (`SPOR_HAENDELSER_FOR_AT_SKILLE` = lag 6's
  `HAENDELSER_FOR_SAMMENLIGNING`, låst af en test): linjen `succes ≥ 5` og
  `n − succes ≥ 5`, resten det samme. Under det vises intervallet stadig (når
  n ≥ 5), men udfaldet er «kan ikke afgøres» (`grund: "for_faa_haendelser"`).
  Overlap = «kan ikke afgøres», aldrig «ens». Resten under 5 = kan ikke
  afgøres; resten tom = «ingen andre annoncer i kampagnen».
- **Hvor reglerne afviger fra lag 6** (rådets gennemsyn 30/9 — påstanden «lag
  6's, ikke nye» er fjernet fra koden): (1) hændelsesgrænsen er SKÆRPET til
  begge udfald i begge grupper (lag 6 tæller kun den mindste gruppes
  succeser); (2) lag 6's sessionsgrænse (8 webinarer) er IKKE overtaget — lag
  6 sammenligner mails på tværs af webinarer, her sammenlignes personer i de
  samme sessioner. Mærket er derfor et SPOR, ikke en anbefaling.
- **Resten er søjlens helhed:** kilde og kampagne mod alle andre i sporet,
  annoncen mod de andre annoncer i SIN kampagne (samme målgruppe og budget). En
  kampagne med én annonce kan derfor ikke afgøres på annonceniveau.
- Feltet er tal og ord — ingen personer — og går ud gennem delingen
  (`udenRaekker`, `findForbudteNoegler` uændret).

**22/9 i dommen** (prøvet i `webinarWilson.test.ts`): annoncen med 52 af 192
«så færdigt» = **27 % (21–34 %)** mod kampagnens anden annonce 32 af 101 = 32 %
(23–41 %) → kan ikke afgøres. «07-vaerkstedet» 7 af 8 = **88 % (53–98 %) af 8**
mod resten af Adv+-kampagnen → intervallerne overlapper ikke, men ÉN, der ikke
så færdigt, er under 5 → **kan ikke afgøres** (rettet 30/9 efter rådets fund;
udkastet sagde «skiller sig ud · højere»). En annonce med 1–4 afholdte står som
«for få».

**Fladen** (`WebinarView.tsx`, `SporSikkerhed`/`SporAndel`): under rækken, i
11 px: «mødte … · færdigt 27 % (21–34 %) af 192» (dommens `sporTal`, ordret) og
mærket i ord — målet og retningen: «flere så færdigt end resten» / «færre mødte
op end resten» — i en neutral ramme, ingen farve for op/ned. Under `md` går
linjen i fuld bredde under hele rækken (`col-span-full`; navnekolonnen er ~130
px på 360 px). Hvad der er sammenlignet med, står i `title` og i en
`sr-only`-span (en `aria-label` på en `<span>` læses ikke op). Fodnoten siger:
med mange rækker vil én ofte skille sig ud ved et tilfælde; brug mærket som et
spor, ikke en dom. Kildeværn i `webinarWilson.test.ts`: fladen skriver kun
dommens ord (ingen `pct()` af rå andele, ingen division, læser aldrig
`interval`), dommen har ingen egen formel, og hændelsesgrænsen står i dommen.

**Fail-soft:** et delt-svar uden `maaling` (den gamle `webinar-delt`) tegner
sporet uden sikkerhedslinjen (`if (!m || m.grundlag === 0) return null`;
prøvet i `WebinarVisning.maaling.test.tsx`) — før rådets gennemsyn ville
`/delt/webinar` være død med en TypeError.

**Udrulning — rækkefølgen:** `webinar-delt` FØRST (eksplicit deploy fra
Lovable build-chat; den regner med de spejlede domme og trækker
`_shared/marketingStatistik.ts` ind). **Beviset er `maaling` i et delt-svar**
(`dashboard.spor.kilder[0].maaling` — kun den nye kode har feltet). DEREFTER
Update for fladen. Ingen migration.

**Status 30/9 aften (#1184 merget `2deb10bb` 22:10):** rådets «ret først» er
rettet (Fable: to høje — fail-soft uden `maaling`, og «skiller sig ud» krævede
kun 5 personer; nu ≥ 5 succeser og ≥ 5 ikke-succeser i begge grupper, så 22/9's
7 af 8 er «kan ikke afgøres»). `webinar-delt` er udrullet («Successfully
deployed edge functions: webinar-delt»). **Beviset (`maaling` i et delt-svar)
udestår** — det kræver et delingslink; Update for fladen er ikke klikket.

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
only) · secret `MAILGUN_SENDING_KEY`. **Planen er Foundation** (bekræftet af Jonas 22/9 aften). A bygger `udkast-webinar-foer-flow`.

### Et fund, vi ikke selv kan rette: eWebinars `.ics`

Målt 22/9 med `curl`: **HTTP 200 uden login**. `METHOD:REQUEST`, `ORGANIZER`
Morten Larsen, `ATTENDEE` `RSVP=TRUE`, `LOCATION`/`URL` = personligt joinLink.
**`attendeeId` er fortløbende, og filen bærer navn + e-mail** — listen kan i
princippet gennemløbes. eWebinars design; **meld det til dem**. Indtil da:
deltagerlisten til et webinar er ikke fortrolig. Kort: `a22-ewebinar-ics-aaben`.

---

## 7e. Platformen sender selv webinarmailene — i drift 22/9 kl. 19:29

**#1094, #1095, #1097.** Fire migrationer kørt 18:48–19:28, otte udrulninger,
én prøve og én rigtig kørsel. Fuld bogføring i `docs/OVERLEVERING.md`
«22. september (dagen)» §8–§11.

**Første rigtige kørsel 19:29:00** (cron.job 573): `sendt 1 · med_invitation 1 ·
fejlede 0` — én bekræftelse til en ny tilmeldt til 13/10. Og
**`for_tidlig_tilmelding` 593**: så mange blev IKKE sendt, fordi tilmeldingen
lå før skillelinjen.

### Hvem sender hvad nu

| mail | afsender | tidspunkt | ændret 22/9 |
|---|---|---|---|
| Bekræftelse | **platformen** | straks, **kun nye** (efter 19:03) | eWebinars SLUKKET 19:03 · Klaviyos `WFzxH9` slukket |
| **14 dage før** | **platformen** | 08:00, **MED `invite.ics`** som bekræftelsen | **I DRIFT 28/9 10:00** (#1102 + migration `20260928120000`): lukker hullet for de ~217, der tilmeldte sig 13/10 før 19:03 og aldrig fik en invitation — går til ALLE, uden `BEKRAEFTELSE_FRA`-port; samme 2-timers nåde. Prøve til jonas@topix.dk 10:05 ok/200/hentet, prøverækken slettet 10:06. Sender **29/9 08:09–09:59 til 317**; aflæses ~10:05 (§7f) |
| 7 / 1 dag før | **platformen** | 08:00 | ny. **3 dage før og «dagen» (07:30) er udgået 30/9** (besluttet af Jonas 30/9 kl. 06:06 (morgenlistens D1: "Ja det skal de. Drop de to"); `mail-worstcase` §4 P1-8) |
| 1 time før | **platformen** | −60 min | eWebinars 1-times SLUKKET |
| **10 min før** | **eWebinar** | −10 min | **BEHOLDT**, oversat til dansk 22/9 |
| Efter webinaret | **Klaviyo** | uændret | `Wq3MkG`, `SDVvCW` urørte (`UiECQS` slukket 19:0x) |

Platformen har overtaget alt FØR webinaret på nær de sidste ti minutter; Klaviyo
har alt EFTER; eWebinar har én mail tilbage.

### Fem arter sendes — `tre_dage` og `dagen` udgået (30/9)

Efter `mail-worstcase` §4 P1-8, besluttet af Jonas 30/9 kl. 06:06 (morgenlistens D1: "Ja det skal de. Drop de to"): en deltager får bekræftelse · 14 dage ·
7 dage · 1 dag · 1 time (plus eWebinars egen 10-minutters-mail); `tre_dage` og
`dagen` står i `UDGAAEDE_ARTER`, ikke i `PLANEN`, og ordene bliver i `ARTER` og
`webinar_mails_art_check` (historik; ingen migration). **Indhentningens loft
(30/9):** en mail, vi selv har fejlet med, indhentes højst til artens
`indhentesSenestDageFoer` — **8 · 4 · 1 dage** før sessionen for `fjorten_dage` ·
`syv_dage` · `en_dag` (inklusivt, danske kalenderdage), så teksten stadig er
sand; uden loftet ville en fejlet «om en uge» løbe til dagen før `en_dag`.

### Bekræftelsen sendes ALDRIG bagud (Jonas ~19:05)

`BEKRAEFTELSE_FRA = 2026-09-22T17:03:00Z` — det øjeblik, eWebinars bekræftelse
blev slukket. Ældre tilmeldinger får ingen.

**Grundlaget er to SUMMER, ikke navne:** Klaviyos `WFzxH9` har sendt 556
bekræftelser de sidste 90 dage, og eWebinars egen gik 15:50–19:03. **Hvem af de
216 der faktisk har fået én, er IKKE målt pr. person** — kommentaren i dommen
sagde det modsatte og er rettet i begge spejle.

Beslutningen står, fordi den fejler i den rigtige retning: en manglende
bekræftelse til en gammel tilmelding er en mangel; en dublet til 216 mennesker
er en fejl, de kan se. **Kun bekræftelsen** — de fem påmindelser går til alle.

### Bagud-fyldningen, der gjorde mailene mulige

Migration `20260922170000` (kørt 18:48) fyldte de tre nye kolonner fra `raa` på
**alle 691 rækker**. De **216 til 13/10 har `join_link` og `kalender_link`, 0
uden**. Uden den ville en påmindelse til en gammel tilmelding stå **uden knap** —
og #1097's rettelse (ingen mail lover et link, der kommer) ville ikke kunne
holdes.

---

## 7f. 28. september — 14-dagsmailen i drift, tragten målt, sitet og Klaviyo gennemgået

**14-dagsmailen** (`fjorten_dage`, #1102 + migration `20260928120000` kørt 10:00): 14 dage før kl. 08:00, MED invitationen, uden `BEKRAEFTELSE_FRA`-port. Samtidig lukket det hul, hvor teksten sagde «vedhæftet» i en mail uden invitationen — teksten følger nu, om filen faktisk kom med, og det gælder også bekræftelsen. Første hele hold er derfor **29/9** (317), ikke 6/10 (kortet `a22-webinarmail-foerste-hold` er rettet).

**Tragten for sessionen 22/9, målt 28/9 08:28:** 384 tilmeldte · 159 deltog · 113 så ≥ 75 % · 17 klikkede «Ansøg til The Boardroom» inde i webinaret · 17 klikkede «Ikke klar til at ansøge endnu» · **4 af de 17 indsendte samme dag** · 35 så ≥ 75 % og klikkede intet. Skemaet taber næsten ingen: 13 oprettet nogensinde, 11 indsendt (85 %), median 12 minutter. **Frafaldet ligger FØR skemaet** — rækken oprettes først ved skærm 1's «Slå op», så 11 af de 17 forsvandt uden spor (introsiden med prisen, CVR som første spørgsmål). `~/Downloads/recon-ansoegning-frafald.md`, `maal-ansoegning-frafald.sql`; OVERLEVERING «28. september» §3.

**Sitet** (`~/Downloads/recon-sitet-webinar-ansoeg.md`): 13 links på topix.dk og 2 på theboardroom.dk fører til `/webinar`, hvor handlingen er eWebinars tilmelding; tre af /webinar-sidens knapper siger «Få adgang …», og sidens meta lover «webinar – frit tilgængeligt». Optagelsessiden er offentlig, i sitemap (`priority 0.6`), uden noindex, med et offentligt Cloudflare Stream-embed — linket kan deles frit; **beslutning 28/9: noindex + viderestilling** (kort `m28-optagelsessiden`). `kilde=webinar` dækker fire ting, der ikke kan skilles ad (klik i webinaret, takkesiden, en Klaviyo-mail, et delt link); kun Klaviyo-vejen bærer et ekstra spor (`utm_source=klaviyo`). Modsigelserne mellem site, slides, Klaviyo og platformen (4.167/4.375, «kort»/«ti minutter»/«elleve spørgsmål», «2-20 mio.»/«mindst 2 mio.», «konkurrentfelt»/«niche», «ingen faste møder»/«mindst én live session») i §4 dér.

**Klaviyo** (`~/Downloads/recon-klaviyo-hvem-faar-hvad.md`): de to tændte flows mail for mail; flow-rapporten 20–28/9 viser 142 af 159 deltagere og 192 af 224 no-shows i flowene (Hovedliste-gaten); konflikterne 29/9, 6/10 og 13/10 og løftet om optagelsen. Mailprogrammet, der kom ud af det (seks segmenter, listen «Medlemmer (ekskluderes)», kampagnen til de 220 29/9 10:00, «Morten skriver» flyttet, mail 4+5 slukket, optagelsen sendes ikke, sunset efter 13/10): `docs/marketingmotoren.md` §9.

**Eftermiddagen 28/9:**

- **Optagelsen taget ned** (topix.dk #4 14:03, #5 14:12): `/webinar/optagelse` noindex, ude af begge sitemaps, adressen bevaret for fire udsendte Klaviyo-mails; teksten «holdes live med spørgsmål og svar» var forkert og er rettet. Resterne i platformen (webinar-afmelds kvittering, grundlagets `optagelseslink`) i #1107. Platformens syv webinarmails lover ingen optagelse (#1103: «Kan du ikke alligevel? Så meld dig til en anden dag — jeg holder webinaret igen.»).
- **Kilden «nyhedsbrev»:** migration `20260928140000` kørt 13:18 — CHECK'en har seks kilder; fordeling målt: webinar 6 · andet 5 · direkte 3. **theboardroom.dk #5 (13:19):** en medsendt `?kilde=` følger uændret videre til `/ansoeg`, hvis den er et af platformens seks ord — det rettede også `?kilde=webinar`, som til 28/9 blev til «direkte» på sitet. Målt, ikke rettet: `index.html`s to præ-renderede links har `?kilde=direkte` hårdkodet, indtil React monterer.
- **Nyhedsbrevet i drift på topix.dk** (footeren og `/webinar/tak` → Klaviyo `client/subscriptions`, Hovedlisten `RZtwMb`, revision 2026-07-15; bevist 14:13). Velkomstserien `TGxxUc` er en kladde — en ny abonnent får i dag intet. `docs/marketingmotoren.md` §9.3.

## 7g. Mortens hilsen i «dagen før» — udkast 30/9, TÆNDES med én række

**Ønsket (Jonas 30/9):** Morten optager en kort, personlig håndholdt video, der skal
ind i mailen «dagen før» (`en_dag`). Den er ikke optaget endnu — så mailen skal
kunne tændes, når videoen ligger på Bunny, **uden ny kode og uden deploy**.

**Konfigurationen** er `app_config.webinar_en_dag_video` (jsonb; migration
`20260930180000` indsætter `null`). Formen dømmes STRIKS af `laesVideoKonfig` i
`supabase/functions/_shared/webinarVideo.ts`:

```json
{ "library_id": "123456", "video_id": "<GUID>", "pull_zone": "vz-<…>.b-cdn.net",
  "titel": "Mortens hilsen før webinaret", "varighed_min": 2, "aktiv": false }
```

| værdi | virkning | `video.status` i svaret |
|---|---|---|
| `null` (standard) | mailen PRÆCIS som i dag — også i prøven | `ikke_sat` |
| ugyldig / delvis / ukendt nøgle | FAIL-CLOSED: uden video | `ugyldig` + grund |
| rækken kan ikke læses | FAIL-CLOSED: uden video | `laesefejl` |
| gyldig, `aktiv: false` | KUN prøven til én adresse får videoen | `slukket` / `proeve` |
| gyldig, `aktiv: true` | alle `en_dag`-mails | `taendt` |

**Mailen med video:** efter «Det er forskellen på at lære noget og at bruge noget.»
står husets sætning «Jeg har lavet en kort video til dig inden i morgen.», Bunnys
stillbillede (hele billedet er et link) og en lysegrøn knap «Se Mortens hilsen
(N min)»; derefter mailen som før, med «Gå til webinaret» som den mørke, primære
knap. Tekstudgaven får linjen «Se Mortens hilsen (N min): <link>». Ingen afspiller
— mailklienter kan ikke. **Uden video** er `en_dag` tegn for tegn som før, og de
andre arter er uændrede, også når en video gives ind (prøvet på alle arter).
Ordet «optagelse» står stadig ingen steder; titlen afvises, hvis den nævner det.

**Klikmålingen.** Huset målte ikke klik i webinarmails (Mailguns sporing er slået
fra, `mailgunAfsendelse.ts`). Nu: cronen trækker mail-rækkens id FØR mailen bygges
og skriver sporet med samme id; linket er `…/functions/v1/webinar-video?m=<id>`.
`webinar-video` (offentlig, `verify_jwt = false`) dømmer formen før noget opslag,
slår en sendt `en_dag`-række op (`verifyVideoKlik`) og skriver ét anonymt klik i
`webinar_video_klik` (`mail_id` + `klikket_at`; migration `20260930181000`), før den
viderestiller til `https://iframe.mediadelivery.net/play/<library>/<video>` —
bygget af konfigurationen, aldrig af URL'en. Tallet:

```sql
select count(*) as klik, count(distinct k.mail_id) as unikke_mails,
       (select count(*) from public.webinar_mails where art = 'en_dag' and udfald = 'ok'
          and session_tid = '<session>') as sendt
  from public.webinar_video_klik k join public.webinar_mails m on m.id = k.mail_id
 where m.session_tid = '<session>';
```

Forbehold: mailsikkerhed (Safe Links o.l.) kan «klikke» før mennesket — unikke
mails er det bedste tal, ikke et bevis for, at videoen blev set.

**UMÅLT — skal måles, før der tændes** (begge uden Referer-header):
1. `curl -sI https://<pull_zone>/<video_id>/thumbnail.jpg` → 200 `image/jpeg`.
   Hjemmebanes pull zone svarer 403 uden referrer (`bunnyMedia.ts`, målt 9/8); i
   en mail er der ingen referrer, så billedet ville stå tomt (alt-teksten og
   knappen bærer stadig ærindet).
2. `curl -sI https://iframe.mediadelivery.net/play/<library>/<video_id>` → 200. Et
   bibliotek med «embed view token authentication» (chattens 765771 har det)
   afviser det usignerede link.

**Tændingen, ét skridt ad gangen:**
1. Merge.
2. KØR `20260930180000_webinar_en_dag_video.sql` og `20260930181000_webinar_video_klik.sql` (FØR/EFTER-SQL i filhovederne).
3. Eksplicit deploy fra build-chat af `webinar-mail-cron` og `webinar-video`. Beviset: tørkørslen svarer `video: {"status": "ikke_sat", …}`.
4. Mål de to URL'er ovenfor.
5. Jonas sætter konfigurationen med `"aktiv": false` (guarded UPDATE `WHERE config_value = 'null'::jsonb`). Tørkørslen svarer `slukket` — eller `ugyldig` med grunden.
6. **Prøve til `lh@greensolar.dk`**: `{"dry_run": false, "email": "lh@greensolar.dk", "art": "en_dag", "nu": "<dagen før sessionen, 08:00–10:00 dansk>"}` (tørkørsel med samme body først) → `video.status "proeve"`, `med_video 1`; mailen læses, billedet står, knappen afspiller, og ét klik står i `webinar_video_klik`. Adressen skal være tilmeldt en kommende session. Slet prøverækken i `webinar_mails` bagefter (klikket følger med).
7. Jonas **tænder**: `UPDATE public.app_config SET config_value = jsonb_set(config_value, '{aktiv}', 'true'::jsonb), updated_at = now() WHERE config_key = 'webinar_en_dag_video' AND config_value->>'aktiv' = 'false';` → UPDATE 1; næste kørsel `taendt`.

Rækkefølgen afviger bevidst fra «prøve → sæt konfigurationen»: prøven skal vise
den række, der går i luften — ikke en kopi i en body, der kan være stavet
anderledes. Værn: `webinarMail.guard` dom 19 og `webinarVideo.test.ts`.

## 7h. 30. september aften — /webinar viser, at annoncerne ikke giver medlemmer (observation, ikke målt årsag)

**Hvad der er læst:** siden `/webinar`s egne tal, 30/9 aften. Intet er målt ud
over det, siden selv viser; ingen årsag er undersøgt.

- Kampagnen **«VSL | Adv+ | OM»: 9.450 kr. brugt, 0 tilmeldte.**
- **45 annoncer** har forbrug og **0 tilmeldinger**.
- **17/8–29/9 samlet: 34.905 kr. → 795 tilmeldte → 186 deltagere → 7 ansøgninger → 0 medlemmer.**

**Hvad det IKKE er:** en dom. Tallene siger ikke, *hvorfor* kampagnen og de 45
annoncer ikke giver tilmeldinger (målingen af klik, landingsside og
tilmeldingsflow er ikke gennemgået), og et ledtal uden medlemmer er ikke det
samme som, at annoncerne ikke virker: betalingen (Purchase) sker 30–60 dage
efter ansøgningen (CLAUDE.md «Metas Conversions API»), så medlemmer kan ligge
efter vinduets slutning. Med 7 ansøgninger når ingen andel
Wilsons grænse («for få» erstatter procenten, §2a). Samme observation står i
OVERLEVERING DEL 2 «30. september» §7h; genvurderingen af marketinganalytikeren
er sat til efter 13/10 (`docs/marketingmotoren.md` §4).

---

## 7i. Webinarkoblingen — forslag + klik (udkast 1/10-2026)

**Besluttet af Jonas 1/10 kl. 08:25: «forslag + klik».**

**Problemet (målt i prod 30/9 nat af hovedsessionen):** Green Solar
(`lh@greensolar.dk`) blev medlem; ansøgningen har `kilde = direkte`, og ingen
webinartilmelding har hendes mail. En sandsynlig tilmelding findes under en
gmail-adresse (via fb, tilmeldt 8/9 til sessionen 22/9, eWebinar «Missed /
Didn't join»). Tragten kobler ansøgning ↔ tilmelding KUN på `lower(email)`, så
hun tæller ikke — hverken som ansøger eller som medlem.

**Løsningen, i tre lag:**

1. **Dommen** `foreslaaWebinarKobling(ansoegning, tilmeldinger)` i
   `src/lib/webinar/kobling.ts` (ren, `kobling.test.ts`): tilmeldinger under en
   ANDEN mail, hvis navn matcher (normaliseret: NFC, små bogstaver, trim, flere
   mellemrum → ét, æøå bevaret; «fuldt» navn ens ELLER første + sidste ord ens —
   begge kræver mindst to ord, et fornavn alene er ikke nok) og/eller hvis
   telefon matcher (kun cifre, `0045`/`45`-præfiks fjernet, sidste 8 cifre).
   Kun tilmeldinger SKARPT FØR ansøgningens `created_at`, højst **90 dage** før
   (tilmeldingens tid = `registreret_at`, ellers rækkens `created_at`).
   Rangeret navn + telefon > telefon > navn; fuldt navn før for+efternavn;
   seneste før ældre. Grunden står i ord. **Et forslag tæller aldrig.** En
   tilmelding, der allerede er koblet til en ANDEN ansøgning, foreslås aldrig
   (tredje argument `optagne`; rådets fund M2 1/10).
2. **Klikket** er en række i `ansoegning_webinar_kobling` (migration
   `20261001120000`): én pr. ansøgning OG én pr. tilmelding (to UNIQUE'er),
   rådgivere SELECT/INSERT/DELETE, ingen medlemsadgang, ingen SECURITY DEFINER.
   **Hvorfor én pr. tilmelding (M2):** tragten tæller ansøgerne som et SÆT af
   mails; to ansøgninger koblet til samme tilmelding får samme mail og tælles som
   ÉN (prøvet i `kobling.test.ts`). Databasen nægter den anden (23505 → fladen
   siger det i ord), og dommen foreslår den ikke. Fladen:
   `WebinarKoblingAfsnit` under «Svarene» på ansøgningen — «Mulig
   webinartilmelding» (navn · mail · tilmeldt · titel · status · grund) +
   «Kobl til webinaret»; efter klikket «Koblet til webinaret 22/9 af {rådgiver}»
   + «Fjern koblingen». Intet vises, når mailen allerede matcher en tilmelding.
3. **Tragten tæller koblingen** som et mail-match: `medWebinarKobling` i
   `dashboard.ts` (spejlet byte-ens i `_shared/webinarDashboard.ts`) giver
   ansøgningen tilmeldingens mail i stedet for sin egen — ERSTATTER, lægger
   ikke til (én ansøgning er én ansøger). Kaldt ÉN gang øverst i
   `webinarDashboard` og i `annoncepriser` (begge spejle). Data hentes i
   `hooks/webinarDashboard.ts` (`hentKoblingsMails`) og i `webinar-delt`
   (samme opslag, service role). Fail-soft på en manglende tabel
   (`erManglendeTabel` / 42P01 · PGRST205) OG på en ukendt relation (PGRST200 —
   indlejringen `webinar_tilmeldinger(email)` kræver, at PostgREST kender FK'en;
   migrationen slutter med `NOTIFY pgrst, 'reload schema';`): ingen koblinger,
   intet vælter.

**Kandidat-opslaget (rådets fund L5):** hooken henter KUN de kolonner, dommen og
fladen bruger (`KOBLING_TILMELDING_KOLONNER` = id · created_at · email · navn ·
webinar_titel · session_tid · session_type · registreret_at · state · attended ·
set_procent — intet annoncespor, ingen by/enhed, ingen `raa`; låst til typen af
`webinarKobling.guard` dom 8), NYESTE FØRST (`registreret_at` desc, null sidst,
så `created_at` desc, `id`), sideinddelt med `.range` i sider á 1.000 (PostgREST
klipper stille ved max-rows 1.000, DEL 4 #929) til loftet `KANDIDAT_LOFT` =
5.000. Rammes loftet, står det i ord på ansøgningen (`loftTekst`): «Kun de 5.000
nyeste tilmeldinger i vinduet er gennemset — en ældre tilmelding kan mangle
blandt forslagene.»

**Kendte grænser for forslaget (rådets fund L6 — dommen er bevidst snæver):**

- **Almindelige navne:** «Mette Jensen» kan matche flere personer. Navnet alene
  er et forslag, aldrig en kobling — rådgiveren afgør, og fladen viser mail,
  dato, session og status ved hvert forslag, så hun kan skelne. Højst tre forslag
  vises (`KOBLING_FORSLAG_MAKS`).
- **Omvendt rækkefølge:** «Hansen Lone» mod «Lone Hansen» matcher IKKE — dommen
  sammenligner første med første og sidste med sidste ord. Bevidst: at bytte om
  ville fordoble de falske træf på almindelige navne.
- **Ét-ords navne:** «Lone» alene (på en af siderne) giver aldrig et
  navneforslag — et fornavn kan ikke bære en kobling. Kun telefonen kan, og den
  er UMÅLT på tilmeldingen (nedenfor).
- Også uden for dommen: stavevarianter (`Soren` ≠ `Søren`), bindestreger
  (`Havndrup-Hansen` er ét ord) og mellemnavne, der bytter plads med efternavnet.

**Beviset for udrulningen af `webinar-delt` (rådets fund M3):** delt-svaret bærer
feltet `koblinger_talt` — antallet af rådgiverbekræftede koblinger, der indgik i
dommen (`koblingerTalt` i `_shared/webinarDelingSvar.ts`). Et TAL, aldrig en
mail; det går gennem `bygDeltSvar` og `findForbudteNoegler` som resten
(`kobling.test.ts`). KUN den nye kode har feltet; 0 er et gyldigt svar (også før
migrationen). Uden feltet kører den gamle bundle, uanset hvad «View code» viser.

**Vinduet — hvorfor 90 dage:** tragten og annoncesporet har INGEN dagsgrænse
(tragtens grænse er `indsendt_at > session_tid`, §2). Det eneste vindue i huset
for «en webinartilmelding før en ansøgning» er Meta-sendingens fbc-led
(`WEBINAR_FBCLID_MAKS_DAGE = 90`, CLAUDE.md «fbc har nu tre led»). Samme tal.

**ÅBENT — telefonen på tilmeldingen er UMÅLT.** `webinar_tilmeldinger` har ingen
telefonkolonne (migration `20260919130000`), og om eWebinars `raa` bærer et
telefonfelt — og under hvilken nøgle — er ikke målt. Dommen kan bruge et nummer,
når det gives ind; hooken giver `telefon: null`. I dag bærer NAVNET forslaget.
Målingen, før telefonen kobles på (Lovable SQL editor):
`SELECT DISTINCT jsonb_object_keys(raa) FROM public.webinar_tilmeldinger WHERE raa IS NOT NULL;`

**Rækkefølgen (merge lægger kilden; den udruller ikke):**

1. Migration `20261001120000` KØRT i Lovable → SQL editor og MÅLT
   (EFTER-SELECT'en i filhovedet: tabel 1 · rls true · 3 policies · unik 2 ·
   grant_anon false · grant_update false).
2. **Eksplicit udrulning af `webinar-delt`** fra build-chatten (den henter nu
   koblingerne). **Beviset:** et delt-svar (`/delt/webinar?t=…`, eller kaldet
   målt serverside som 21/9) bærer feltet `koblinger_talt` (et tal). Et 200 uden
   feltet er den gamle kode.
3. **FØRST DEREFTER Update** i Lovable (ansøgningsfladen + `/webinar`).
4. Første kobling: Green Solars ansøgning → «Kobl til webinaret» → `/webinar`
   viser sessionen 22/9 med én mere i «blev medlem» (hvis den gmail-tilmelding
   er forslaget — det er ikke målt, at navnene matcher).

---

## 7j. Målstregerne og de varme leads (udkast 1/10-2026)

**Kilden:** Nicklas' dokument 1/10, «Det styrer vi efter — mål ved start»:
fremmøde over 55 % · ansøgere blandt dem, der ser det færdigt, over 10 % · pris
pr. ansøgning under 2.500 kr. · pris pr. nyt medlem under 15.000 kr. Hans egne
tal (25/8 + 22/9): 469 tilmeldt · 189 mødte · 132 så færdigt · 6 ansøgte · 0
medlemmer — tragten knækker efter webinaret.

**A. Målstregerne** (`src/lib/webinar/maalstreger.ts`, spejlet ordret som
`_shared/webinarMaalstreger.ts`, paritet i `webinarDashboard.paritet.test.ts`).
Målene står ÉT sted (`MAAL_*`). Definitionerne genbruger husets:

| Mål | Tæller / nævner | Vindue | Genbrugt fra |
|---|---|---|---|
| Fremmøde | mødte op / (tilmeldte − kommende), personer | alle afholdte sessioner | `taelDeltagelse` på de afholdte (tragten, «I alt») |
| Ansøgere blandt så-færdigt | «set» (≥ 75 %) med indsendt ansøgning SKARPT efter første afholdte session / «set» | alle afholdte sessioner | tragtens grænse i tid (`tragt`: `foersteSession` + `faellesEfter`) + `medWebinarKobling` |
| Pris pr. ansøgning | forbrug / ansøgere blandt personer, hvis første tilmelding faldt i vinduet | «Hele perioden» (`valg: "daekning"`) | `annoncepriser().samlet` (`byggLinje`) |
| Pris pr. nyt medlem | samme forbrug / `blevMedlem` (underskrevet OG betalt) | samme | samme |

Dommen: procentmål med Wilson 95 % — «over/under målet» kun når HELE intervallet
ligger på én side, ellers «kan ikke afgøres»; under 5 ERSTATTER «for få»
procenten. Kronemål uden interval; under 5 personer sættes INGEN pris («for
få»). «Ingen data» uden forbrug, udækket vindue eller anden valuta end DKK.
**Vinduet står fast på «Hele perioden»** — prisafsnittets periodevælger flytter
ikke målstregerne. Pris pr. ansøgning har (som annoncepriserne) INGEN grænse i
tid mod sessionen; fremmøde/ansøgere har tragtens.

Fladen (`WebinarView.tsx`, sektionen «Målene» under tragten) skriver kun
dommens ord og tegner dommens bar-positioner; kildeværn i `maalstreger.test.ts`.
Den delte side får dommen gennem `webinar-delt` → `bygDeltSvar` som feltet
`maalstreger` (tal, ingen rækker); uden feltet (gammel function) tegnes intet.

**B. Varme leads** (`src/lib/webinar/varmeLeads.ts`, KUN rådgiveren; INTET
spejl): «set» på en afholdt session med tidspunkt inden for 14 dage (inklusiv),
UDEN indsendt ansøgning (mail eller kobling), én linje pr. person (nyeste
session), nyeste først, flaget «inden for 24 timer» regnet fra sessionens
START. Nicklas' anden betingelse (omsætning over 2 mio.) kan IKKE dømmes:
`webinar_tilmeldinger` har ingen CVR/omsætning. Husets CVR-opslag
(`ansoegning-cvr`, `ansoegning-cvr-opslag`, `berig-virksomheder`, DataCVR 25
opslag/døgn) er bevidst IKKE brugt. Persondata: `varmeLeads` står i
`FORBUDTE_NOEGLER`, og et kildeværn (`varmeLeads.test.ts`) fælder enhver
function eller den delte side, der nævner dommen. **Næste skridt:** en
«ringet»-markering kræver en tabel.

**Rækkefølgen:** merge → **eksplicit udrulning af `webinar-delt`** (den trækker
en NY delt fil ind, `webinarMaalstreger.ts`) → **beviset:** et delt-svar bærer
feltet `maalstreger` (fire linjer) → FØRST DEREFTER Update. Ingen migration.

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


**Det tekniske råds lave fund til #1179 (Fable, 30/9 aften — bogført, ikke rettet):** (1) klik-tabellen har ingen unik nøgle — én modtager kan give mange rækker; tallet læses derfor altid som `count(distinct mail_id)`. (2) Et klik logges, før functionen ved, om videoen kan vises — «klik» betyder «trykkede», ikke «så». (3) `webinar-video` er en ubegrænset viderestiller til Bunnys faste vært for hvem som helst (ingen persondata; accepteret). (4) Fejler sporskrivningen efter afsendelsen, bærer mailen et id, ingen række har — klikket dømmes «ukendt». (5) Tørkørslen svarer `proeve` for video-status, når `email` er givet, også med `dry_run`. (6) Konflikt med `feat/webinarmotor-skive3` i `webinar-mail-cron`: den, der merger sidst, beholder både `video` i `bygWebinarMail` og `id: mailId` i sporet og kører `webinarMail.guard` + `webinarMotorSkive3.guard`.
