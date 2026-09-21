# Tracking — husets ene dokument om, hvad der sendes til hvem

**Skrevet 21/9-2026 (aften).** Kilder: `~/Downloads/recon-tracking.md` (målt 21/9 kl.
~14:20–14:40 på de levende sider, GTM-containerne, eWebinars tilmeldingsside, repoet
`ac8ec575` og dokumenterne i `~/Downloads`) og Jonas' beslutninger 21/9 (ordret i
chatten). Står noget ikke i de to, står her «umålt» eller «åbent». Datoer og tider er
danske. Se også `docs/webinaret-og-annoncerne.md` (annoncesporet fra klik til
ansøgning) og `docs/marketingmotoren.md` (lag 2: hændelserne til Klaviyo).

Fra nu af er dette det ENE dokument om tracking. Recon-, rapport- og udkastfiler i
`~/Downloads` er kilder — ikke sandheden.

---

## 1. Principperne (Jonas 21/9 — styres af chatten)

**(a) Intet sendes, vi ikke har målt, at det sendes.** Hver hændelse bevises i Metas
Test events, før vi stoler på den. En regel i en GTM-container, en linje i en
persondatatekst eller en kolonne i basen er ikke et bevis — en hændelse, der ses
ankomme, er.

**(b) Platformen er kilden til sandheden for «ansøgning startet/sendt»** — ikke et
knapklik og ikke et sidebesøg. I dag er Metas `Lead application_started` et klik på
en hvilken som helst knap på theboardroom.dk, og `Lead application_submitted` et besøg
på en side, ingen når (§2, §5). Sandheden er rækken i `ansoegninger`: `created_at`
(første gem) og `indsendt_at` (indsendelse).

**(c) Rækkefølgen:** Meta (inkl. Instagram) først, så LinkedIn (kommer snart), så
Google Analytics. Klaviyo får allerede «Ansoegning paabegyndt» og «Ansoegning sendt»
fra platformen (lag 2). **TikTok bruges IKKE — pixlen skal fjernes** fra begge
GTM-containere, og derefter fra banner og cookiepolitik.

**(d) Ingen persondata til Meta.** Aldrig navn, e-mail, telefon, IP, CVR eller svar.
Kun klik-id'et (`fbc`), vores eget id (hashet) og browserens user agent.

**(e) Ingen jurist** — besluttet af Jonas 21/9: vi løser det ud fra, hvad vi mener er
rigtigt. User agent sendes, fordi Meta kræver den for website-hændelser
(developers.facebook.com, Conversions API Parameters: «Website events … require the
client_user_agent, action_source, and event_source_url parameters»), den gælder kun
annonce-ansøgere (kun rækker med `fbclid`), og den står i persondatateksten.

**(f) Jonas godkender kun tekster.** Resten styres af chatten.

---

## 2. Trackingkortet — hvert signal, målt 21/9, ført ajour med §3 og §4

| # | Signal | Hvor | Udløses af | Sender (persondata?) | Til | Samtykke bag | Status |
|---|---|---|---|---|---|---|---|
| 1 | Meta pixel **PageView** | theboardroom.dk (GTM-NL33PM5M, tag 75) | hver sideindlæsning (`gtm.js`) | pixel-id 858180112996496, URL, `_fbp`/`_fbc`-cookies; advanced matching slået fra | Meta | tag kræver `ad_storage`. **Efter 21/9 (§3):** default `denied` → fyrer først efter «Acceptér» (før 21/9: default `granted`, fyrede før banneret) | i drift |
| 2 | Meta **Lead** `application_started` | theboardroom.dk (tag 138: `fbq("track","Lead",{content_name:"application_started"})`) | dataLayer **`cta_click`** — ALLE knapper, også «Se det gratis webinar» | som 1 | Meta | tagget har ingen consent-liste; afhænger af at `fbq` findes (1) | i drift, fejlmærket — §5 |
| 3 | Meta **Lead** `application_submitted` («fuldendt ansøgning») | theboardroom.dk (tag 123) | `gtm.js` OG URL indeholder **`/ansogning-modtaget`** | som 1 | Meta | ingen consent-liste | **fyrer aldrig for den nye vej** — platformen linker ikke dertil (§2.1); siden findes stadig |
| 4 | GA4 `application_started`/`application_submitted` | theboardroom.dk (tag 143/140 → G-6LHR66CDJ4) | som 2/3 | cta_text, cta_location | Google | ingen consent-liste | som 2/3 |
| 5 | GA4 config + page_view, cta_click, begin_checkout, view_prices, engaged_session, calendly_booking, purchase | theboardroom.dk → G-6LHR66CDJ4 | sitets `gtag.ts` | GA-klient-id; ved `klaviyo_form`: e-mail + fornavn i dataLayer | Google (+ Stape, #8) | `analytics_storage` (default `denied` efter 21/9) | i drift |
| 6 | **LinkedIn Insight** (partner 7995353) + konverteringer 20931657 (page), 21302857 (calendly), 21302865/21302849 (view_prices/begin_checkout), 21302817–… (engaged 30/60/90/120 s), 21155681/21155705 (paywall) | theboardroom.dk | gtm.js, klaviyo_form, calendly_booking, engaged_session, purchase, view_prices, begin_checkout (= klik på «Ansøg om en plads») | li_fat_id-cookie, URL | LinkedIn | `ad_storage` | i drift |
| 7 | **TikTok pixel** CVKMIDBC77U1BR7NB7MG — Pageview + CompletePayment | theboardroom.dk (tag 96, 130) | gtm.js; purchase | _ttp-cookie | TikTok | `ad_storage` | **skal fjernes** (§1c, §5) |
| 8 | **Server-side GTM via Stape** — `https://nofikexx.topix.dk/data` | theboardroom.dk OG topix.dk (Data Tag v8) | engaged_session, klaviyo_form (`generate_lead`), calendly_booking, purchase | `user_data` (e-mail, navn, telefon, adresse fra dataLayer, hvis sat), `event_id`, «common cookie» | Stape-serveren — **hvad den sender videre (Meta CAPI? GA4?) er umålt** | ad_storage + analytics_storage | i drift, umålt — §5 |
| 9 | Klaviyo onsite: `klaviyoForms`-lytter → `klaviyo_form` (e-mail + fornavn i dataLayer); `__kla_off`-cookie styres af consent | begge sites | Klaviyo-formular indsendt | e-mail, fornavn | Klaviyo (via GTM → GA4/LinkedIn/Stape) | consent-tag | ingen Klaviyo-formular fundet på siderne — umålt om nogen findes |
| 10 | Meta pixel **PageView** | topix.dk (GTM-57M8R72D, tag 19) | gtm.js | som 1 | Meta | default `denied`; tag kræver `ad_storage` | i drift |
| 11 | Meta **trackCustom `boardroom_intent`** | topix.dk (`fbq("trackCustom","boardroom_intent",{content_name, content_category})`) | klik på «The Boardroom»-links (footer, bro-sektion) | cta-tekst | Meta | ingen consent-liste; kræver `fbq` (10) | i drift |
| 12 | topix.dk **`ewebinar_form_submit`** → GA4 `generate_lead`, `email_added`, `ewebinar`; **Klaviyo `_learnq.identify({email, first_name})`** | topix.dk/webinar (tag 47 + HTML-tag på `gtm.dom`, der lytter på `.ewebinar__RegisterButton`) | KLIK på «Tilmeld dig» (før eWebinar har valideret) | **navn + e-mail i klartekst i dataLayer** | Google, Klaviyo | Klaviyo-identify: `ad_storage`; GA4-tags: ingen | i drift — §5 (navn/e-mail ud af dataLayer) |
| 13 | topix.dk/webinar/tak: dataLayer `webinar_signup` (email_hash SHA-256, utm fra `localStorage["topix_utm_params"]`, 30 dage) | topix.dk (sitets `ewebinar.ts` + `WebinarTak.tsx`) | landing på /webinar/tak med `?data=` (eWebinars krypterede attendee-payload) | hashet e-mail, utm | **ingen** — GTM-57M8R72D har ingen trigger for `webinar_signup` | — | går ingen steder |
| 14 | GA4 (G-9S4NL9FKGK) page_view, cta_click (`cta_destination`), webinar_intent, signup_intent, video_play/pause/progress/complete, calendly_booking, engaged_session | topix.dk | sitets `tracking.ts` | GA-klient-id | Google (+ Stape) | ingen consent-liste på GA4-event-tags | i drift. **Efter 21/9 (§3):** `cta_destination` for ansøg-knapperne er `platform_ansoeg` (før `superform_boardroom`) |
| 15 | LinkedIn Insight 7995353 + konv. 20931657, 21302857, 21302849, engaged-trappen | topix.dk | gtm.js, klaviyo_form, calendly_booking, engaged_session | cookie | LinkedIn | `ad_storage` | i drift |
| 16 | TikTok pixel CVKMIDBC77U1BR7NB7MG Pageview | topix.dk | gtm.js | cookie | TikTok | `ad_storage` | **skal fjernes** |
| 17 | **eWebinars egen Meta-pixel** — `setSettings.meta.pixelId: "858180112996496"` | topix.ewebinar.com (tilmeldingssiden + widget'en på topix.dk/webinar) | eWebinars egne hændelser — **hvilke: umålt** | umålt | Meta | eWebinar: `gdpr.bannerMode: "Off"`, `showConsentCheckbox: false` | i drift, umålt — §5 |
| 18 | **app.theboardroom.dk — INGEN pixel, GTM, GA, dataLayer, cookiebanner** | index.html (41 linjer) + bundle (1,29 MB): 0 træf på fbq/gtag/googletagmanager/dataLayer/_fbp/_fbc | — | — | — | — | målt |
| 19 | **Sentry** | app.theboardroom.dk (`src/main.tsx:21–27`) | fejl + 10 % traces | fejl, query-nøgler; `sendDefaultPii` ikke sat, ingen replay | Sentry | ingen banner; ikke nævnt i persondatateksten | i drift |
| 20 | **Klaviyo «Ansoegning paabegyndt»** | platform, server: `ansoegning-gem` «gem»-grenen (`index.ts:270–272`) | e-mail kommer ind (skærm 6 «kontakt», «Næste») | profil = e-mail; properties `{kilde}`; unique_id = ansøgnings-id. Ingen utm/fbclid/telefon | Klaviyo (USA) | persondatateksten (`persondata.ts:81`) | i drift (lag 2) |
| 21 | **Klaviyo «Ansoegning sendt»** | `_shared/ansoegningMotor.ts:269–274` | indsendelse (`indsendt_at` sat) | e-mail; kilde, branche, omsaetningsinterval, antal_ansatte | Klaviyo | som 20 | i drift (lag 2) |
| 22 | **Meta Conversions API fra platformen** | `Lead application_started` / `application_submitted` fra `ansoegninger` (§4) | cron-job, der læser `ansoegninger` | `fbc`, hashet eget id, user agent (kun rækker med `fbclid`) — aldrig navn/e-mail/telefon/IP/CVR/svar | Meta, datasæt 858180112996496 | persondatateksten (§1e) | **under bygning (21/9 aften)** — §4 |

### 2.1 Ansøgningsvejen i platformen (målt 21/9, repo `ac8ec575`)

- Ruter: `/ansoeg` (App.tsx:249), `/ansoeg/persondata` (:250), `/ansoeg/status` (:252) — uguardede, `?t=<token>` er legitimationen. Elleve skærme i ÉN rute (`skema.ts:106–118`); kontaktskærmen (e-mail, telefon) er nr. 6.
- **Efter «send»: ingen egen URL.** `Ansoeg.tsx:287–296` sætter en tilstand («kvittering»); URL'en forbliver `/ansoeg?t=…`. Kvitteringens eneste link: «Tilbage til theboardroom.dk» (forsiden). Ingen redirect til `theboardroom.dk/ansogning-modtaget` — 0 træf i repoet og i app-bundlen. Derfor fyrer #3 aldrig for den nye vej.
- Første gem = «opret» (`ansoegning-gem/index.ts:177–198`): INSERT + fail-soft UPDATE med annoncesporet (utm_*, `fbclid`, `landing` uden `?t=`, `referrer` — `20260921120000`, #1052). «gem» = Klaviyo «paabegyndt», når e-mailen kommer ind. «indsend» = `indsendt_at` → `registrerIndsendelse` → Klaviyo «sendt» → kvitteringsmail.
- Klik-sporet læses ÉN gang ved mount (`laesAnnoncespor`, `skema.ts:413–424`): `fbclid` kun `^[A-Za-z0-9_-]+$` og ≤ 255, ellers null.

### 2.2 Hvad basen har til en website-hændelse (målt 21/9)

| Metas felt | `ansoegninger` | `webinar_tilmeldinger` |
|---|---|---|
| `fbclid` | findes (`20260921120000:40`) | findes (plukket ud af `origin`-URL'en; 581 af 597 havde ét 19/9) |
| kliktidspunkt (til `fbc = fb.<idx>.<ms>.<fbclid>`) | **ingen kolonne** — nærmeste `created_at` (første gem) | nærmeste `registreret_at` |
| `_fbc` / `_fbp` | ikke fundet (app'en har ingen pixel, der sætter dem) | ikke fundet |
| `event_source_url` | `landing` (URL uden `?t=`, ≤ 1000) | `origin` / `first_origin` |
| `client_user_agent` | **ikke fundet 21/9 middag** (kun på `aftale_underskrift`) — **gemmes fra 21/9 aften, kun med `fbclid`** (§4) | `enhed` (deviceType), ikke UA |
| `client_ip_address` | kun `ip_hash` (sha256(ip + dag), irreversibel) — sendes ikke (§1d) | i `raa` — sendes ikke |
| `event_time` (≤ 7 dage bagud) | `created_at` / `indsendt_at` | `registreret_at` |
| `event_id` | ansøgnings-id (uuid) | `ewebinar_id` |
| e-mail/telefon/navn | findes — sendes ikke (§1d) | findes — sendes ikke |

Pixlens Lead-tags (#2, #3) har intet `eventID` — dedup mod platformens hændelser kan ikke ske, før de er rettet (§5).

### 2.3 Samtykket bag

- **theboardroom.dk:** cookiebanner `localStorage["tbr_cookie_consent"]`, «Afvis»/«Acceptér» (`CookieBanner.tsx:38–64`); tilbagevendende med `accepted` får `consent update granted` ved modul-import, FØR GTM (som indlæses 1.500 ms efter `load`). Default i `index.html` er `denied` fra 21/9 (§3) — cookiepolitikkens «alle analyse- og markedsføringscookies er blokeret som standard» er dermed sand.
- **topix.dk:** default `denied` + `wait_for_update: 500`; banner med kategorier (nødvendige/analytics/marketing), `localStorage["topix_cookie_consent"]`. Privatlivspolitikken nævner Google, Meta, LinkedIn, Klaviyo; cookiepolitikken lister `_fbp`, `_fbc`, `li_fat_id`, `_ttp`.
- **eWebinar:** `gdprBannerMode: "Off"`, `showConsentCheckbox: false`.
- **Platformen:** ingen banner (ingen cookies sættes af tredjepart). Persondatateksten (`persondata.ts:45`, godkendt 19/9) siger «gemmer vi det klik-id, Meta selv satte på linket» — ikke «sender»; nævner ikke cookies og ikke Sentry. Tillægget om afsendelse (§1e) skal ind, før §4 går i drift — tekst til Jonas (§1f).

---

## 3. Ændret 21/9 — de to hjemmesider

**topix.dk — PR #1 (`8cb6c86`):** tak-sidens «Ansøg om en plads» (`WebinarTak.tsx:177`) pegede stadig på SuperForm-formularen `68de44ea…` (Monday-boardet bag den er slukket 19/9) → `https://app.theboardroom.dk/ansoeg?kilde=webinar`, som optagelsessidens to knapper (Lovable 20/9). Etiketten `ctaDestination` er `platform_ansoeg` alle tre steder (før `superform_boardroom`). Ingen superform/spot-nik tilbage i `src/`.

**theboardroom.dk — PR #1 (`3849aa5`):** Consent Mode-standarden i `index.html`: `ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`, `personalization_storage` → `'denied'`; `functionality_storage`, `security_storage` → `'granted'`; `+ wait_for_update: 500` (som topix.dk). GTM-indlæsningen urørt. Bannertekst: «Vi bruger cookies til analyse, videoafspilning og til at måle vores annoncer (Meta, LinkedIn og TikTok).» (godkendt af Jonas 21/9). Privatlivspolitikken: ansøgningsformularen er platformen — «The Boardroom-platformen (app.theboardroom.dk) – ansøgningsformular (Supabase via Lovable Cloud)» (godkendt; «, EU» taget ud — hvor databasen ligger, er ikke målt). `/ansogning-modtaget` urørt (GTM-reglen for «fuldendt ansøgning» hænger på den, til platformens hændelser er i drift).

**Bevist på de levende sider 21/9 (curl):** `ad_storage: 'denied'` på begge sites; «vores annoncer», «Lovable Cloud» og `platform_ansoeg` fundet i bundlerne; SuperForm-id'et og `superform_boardroom` ikke fundet i 27 (theboardroom) / 26 (topix) filer.

**Fejlen i den første beviskommando, bogført:** den ledte kun efter script-stier på formen `assets/…` — ikke `./…`-formen, som chunk-listen bruger — og meldte «ikke fundet» om noget, den ikke havde ledt efter. «Ikke fundet» var «ikke ledt». Anden kørsel ledte i alle chunks. Regel: et negativt fund kræver, at søgningen bevises at ramme det, den skal finde (samme som «tavs dom ligner grøn dom»).

Ikke ændret 21/9 (§5, §6): GTM-containerne, TikTok, Stape, eWebinars pixel, privatlivspolitikkens Monday.com- og Circle.so-linjer, legatets egen SuperForm (`Legat.tsx:10`, andet formular-id).

---

## 4. Under bygning (21/9 aften) — platformens Conversions API

Detaljerne udfyldes, når udkastet er merget. Det, der er besluttet:

- **Et selvstændigt cron-job**, der læser `ansoegninger` og sender **`Lead application_started`** (første gem) og **`Lead application_submitted`** (indsendelse) til Meta — ikke fra `ansoegning-gem`/motoren selv.
- **User agent gemmes fra 21/9 aften**, kun på rækker med `fbclid` (§1e).
- **En lås i `app_config`** til beviset: hændelserne sendes med `test_event_code`, til de er set ankomme i Events Manager → Test events (§1a). Først derefter uden.
- **Datasæt 858180112996496** (= pixlen på begge sites og hos eWebinar).
- **En NY nøgle**, genereret af Jonas 21/9 i Events Manager (med Dataset Quality API), kun til datasættet «Topix.dk» — ikke «The Boardroom — annoncer» (1259647116283770).
- **Den gamle `META_CAPI_TOKEN` er annoncehentningens `ads_read`-nøgle** (nødnavn, `_shared/metaAdsToken.ts`) og røres ikke. CAPI får sin egen secret.
- Payload efter §1d: `event_name`, `event_time`, `event_id` (ansøgnings-id), `action_source: "website"`, `event_source_url` (`landing`), `user_data { external_id (hashet), fbc, client_user_agent }`. Ikke `em`, `ph`, `client_ip_address`.

Åbent i bygningen: `fbc`'s subdomain-indeks (`fb.1.` vs. `fb.2.` for `app.theboardroom.dk` — måles på første testhændelse); kliktidspunktet (ingen kolonne — `created_at` er første gem); dedup mod pixlens Lead-tags (de har intet `eventID`, §5).

---

## 5. Åbent — marketingmandens liste

1. **GTM `Lead application_started`** (theboardroom.dk, tag 138) fyrer på `cta_click` — skal trigges af **`begin_checkout`** (kun «Ansøg om en plads»). Og `eventID` på Lead-tags, så platformens hændelser (§4) kan dedupes.
2. **Samtykkekrav på Lead- og GA4-tags:** tag 138/123 (Lead), 140/143 og de øvrige GA4-event-tags har ingen consent-liste (målt i containeren). Med default `denied` (§3) fyrer `fbq` ikke før accept — men taggene selv siger ikke, hvad de kræver.
3. **Navn og e-mail ud af dataLayer på topix.dk/webinar:** HTML-tagget på `gtm.dom` lægger `user_data:{name, email}` i klartekst ved klik på «Tilmeld dig» (#12).
4. **Fjern TikTok-pixlen** (tag 96/130 på theboardroom.dk, tag 30 på topix.dk) — derefter banner og cookiepolitik uden TikTok (`_ttp`).
5. **eWebinars pixel:** hvilke hændelser sender eWebinar for 858180112996496, og fra hvilke sider (tilmelding, join, replay)? Aflæses i eWebinar → Integrations.
6. **Stape-serverens tags** (`nofikexx.topix.dk`): hvilke klienter og tags (Meta CAPI? GA4? LinkedIn?), hvilket datasæt/token. Kun i GTM's server-container.
7. **Aflæsningerne, der ikke kan måles herfra** (recon-tracking §6): Events Manager → Events pr. hændelse og pr. `event_source_url` (kommer app.theboardroom.dk overhovedet?), Connection method (browser/server), Deduplication, Event match quality; Custom conversions («fuldendt ansøgning», «opstart»: regel, kilde, «last received»); Settings → Conversions API / System Users (navn, «last used», scopes); Automatic advanced matching; Ads Manager → url_tags på alle aktive annoncer. GTM → Versions (tag-navne, hvem publicerede version 6), server-containeren, Consent Overview. GA4 (G-6LHR66CDJ4, G-9S4NL9FKGK) → Events sidste 7 dage, Key events, cross-domain, Measurement Protocol secrets (`GA4_API_SECRET` i sitets `ga4-track`). Klaviyo → «Active on site» fra topix.dk. Stape-kontoen → request-loggen for `/data`.

---

## 6. Åbent — til beslutning

1. Datasættets **«Automatisk websitematchning» står Til** — kan sende krypteret e-mail/telefon fra formularer på siderne (fx topix.dk/webinar) uden om §1d.
2. Datasættet er **delt med virksomheden «Sentury ApS» (583122777451953)** — hvem er det?
3. **Ingen domæne-tilladelsesliste** på datasættet.
4. Hvad datasættet **«The Boardroom — annoncer» (1259647116283770)** bruges til.
5. Privatlivspolitikkens **Circle.so- og Monday.com-linjer** (theboardroom.dk `PrivacyPolicy.tsx:92`, `:94`).
6. **LinkedIn- og GA4-hændelser fra platformen** (rækkefølgen i §1c) — ikke skitseret.
7. Persondatateksten i platformen: tillægget om, at vi SENDER klik-id, eget id og user agent til Meta (§1e) — tekst til Jonas, før §4 går i drift. Sentry nævnes ikke i teksten.
8. `webinar_signup` på topix.dk/webinar/tak går ingen steder (#13) — skal den?

---

## 7. Nøgler og id'er (kun navne — værdier er secrets)

| Navn | Hvor | Til hvad | Status 21/9 |
|---|---|---|---|
| `META_ADS_TOKEN` | `_shared/metaAdsToken.ts:34` | Marketing API (læsende) | ikke sat |
| `META_CAPI_TOKEN` | `metaAdsToken.ts:36` (nødnavn) | bærer i dag Marketing API-tokenet (`ads_read`) | i drift som nødnavn — røres ikke (§4) |
| `META_AD_ACCOUNT_ID` | `meta-annoncer-cron` | `act_<id>` | skal være sat |
| ny CAPI-secret (navn afgøres i udkastet) | — | Conversions API, datasæt 858180112996496 | genereret af Jonas 21/9, ikke sat i Lovable endnu — åbent |
| GTM `GTM-NL33PM5M` / GA4 `G-6LHR66CDJ4` | theboardroom.dk (`~/Projekter/theboardroom-topix/index.html`) | — | i drift |
| GTM `GTM-57M8R72D` / GA4 `G-9S4NL9FKGK` | topix.dk (`~/Projekter/topix-reimagined/index.html`) | — | i drift |
| LinkedIn partner `7995353`, TikTok `CVKMIDBC77U1BR7NB7MG`, Stape `nofikexx.topix.dk` | kun i GTM-containerne | — | i drift via GTM |
| `KLAVIYO_API_KEY` | `_shared/klaviyo.ts:50` | lag 2/3 | i drift |
| `VITE_SENTRY_DSN` | `src/main.tsx:22` | Sentry (kun PROD) | i drift |
