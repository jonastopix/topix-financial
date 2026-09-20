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
