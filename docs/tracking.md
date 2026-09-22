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

**(c) Rækkefølgen:** Meta (inkl. Instagram) først, så **Google Analytics**, så LinkedIn.
GA kom foran LinkedIn 21/9 (chatten), fordi GA bruges i dag — LinkedIn-annoncer kører
ikke endnu. **LinkedIn er udskudt (Jonas 21/9): delingen af `/webinar` går foran.** Klaviyo får allerede «Ansoegning paabegyndt» og «Ansoegning sendt»
fra platformen (lag 2). **TikTok bruges IKKE — pixlen skal fjernes** fra begge
GTM-containere, og derefter fra banner og cookiepolitik.

**(d) Ingen persondata til Meta.** ~~Aldrig navn, e-mail, telefon, IP, CVR eller svar.
Kun klik-id'et (`fbc`), vores eget id (hashet) og browserens user agent.~~
**OMGJORT 22/9 (Jonas 21/9 aften, «det ultimative setup, vi går ikke på kompromis» —
princip (g)):** vi sender nu også en **SHA-256-hashet** e-mail (`em`), telefon (`ph`),
fornavn (`fn`), efternavn (`ln`) og land (`country`), normaliseret præcis efter Metas
egne regler. Det, der stadig ALDRIG sendes: **IP, CVR, svar — og enhver værdi i
klartekst.** Værnet (`findForbudteNoegler`) kræver nu, at `em/ph/fn/ln/country/external_id`
er 64 hex-tegn, og afviser en rå e-mail eller et rået tal hvor som helst i payloaden.
**Et tomt felt sendes aldrig** — en tom streng ville blive til et gyldigt aftryk, der
matcher ingen. Grunden: Metas Event Match Quality («Sending additional customer
information parameters may help increase Event Match Quality»), og at ansøgeren kan bede
sig fri (`ansoegninger.meta_fravalg`).

**(d2) «LEAD» DELES MED ANNONCERNE — OG BLIVER STÅENDE** (målt og besluttet 21/9-2026
22:44–22:49). Platformens `application_started` og `application_submitted` sendes fortsat som
Metas standardnavn **`Lead`** med `content_name` som parameter. En omdøbning til egne navne
blev overvejet og **forkastet** — begrundelsen står nedenfor.

**Det, der ER målt i Events Manager (datasæt 858180112996496):**

| Måling | Resultat |
|---|---|
| Annoncesæt, der bruger «Lead» som mål «Leads» | **fire**: `120248713786770694`, `120248713786760694`, `120242386310820694`, `120242386845280694` |
| Leads 24/8–20/9 | **356** — 254 fra browser, 102 fra server (API for konverteringer) |
| Deduplikering | «opfylder ikke anbefalede fremgangsmåder» |
| Kildetype | alle 356 med kildetypen **website** |
| Hvilke domæner og tags de 356 kommer fra | **UMÅLT** |
| Platformens egne hændelser (`meta_haendelser`, 22:48) | **ÉN hændelse nogensinde** — `6cff9f4a…:started`, sendt 22:30 med testkode. **Ingen rigtige ansøgninger er sendt som Lead.** |

**Metas eksport af 13 Lead-eksempler (22:49) viser to kampagner bag navnet:**

| Kampagne | Annoncesæt | Kilde | Hvad hændelsen faktisk er |
|---|---|---|---|
| Webinarkampagnen `120248713786520694` | `120248713786770694`, `120248713786760694` | **server** (Stape) | webinartilmeldinger — `placedURL` `topix.dk/webinar?…fbclid…`, data `{"currency":"DKK"}` |
| Den direkte kampagne `120242386310830694` | `120242386845280694` (formentlig også `120242386310820694`) | **browser** | GTM-taggets **knapklik** — `content_name` `application_started` fra `theboardroom.dk/?utm_…`. Taget er sat på pause 21/9 ca. 21:40 |
| samme | samme | **browser** | det falske «sendt»-tag — `content_name` `application_submitted` fra `theboardroom.dk/ansogning-modtaget` **og fra `https://lovable.dev/`** (Lovables forhåndsvisning af sitet) |

**HVORFOR «LEAD» BLIVER STÅENDE:** den direkte kampagnes Lead-signal var et knapklik og en
tak-side, der ikke målte en ansøgning — og begge dele er nu slukket. Platformens rigtige
ansøgninger er dermed **erstatningen** for det falske signal, ikke en forurening af det. En
omdøbning ville have efterladt den direkte kampagnes annoncesæt **uden signal før webinaret**.

**Adskillelsen af webinartilmeldinger og ansøgninger sker i Events Manager** med tilpassede
konverteringer og regler på `content_name` og URL — **ikke i koden**. Koden sender ét ærligt
navn med en ærlig parameter; hvad annoncesættene optimerer på, er en indstilling.

**RETTET SAMME AFTEN, så det ikke står som en måling:** det blev undervejs påstået, at Metas
«Aktivitetseksempler» viste webinar-Leads med `lead_source` «ewebinar» fra topix.dk side om
side med platformens Leads fra app.theboardroom.dk. **Det er ikke set.** Kun tabellerne
ovenfor er målt. Påstanden står her alene for at sikre, at den ikke bliver gentaget som et fund.

**(e) Ingen jurist** — besluttet af Jonas 21/9: vi løser det ud fra, hvad vi mener er
rigtigt. User agent sendes, fordi Meta kræver den for website-hændelser
(developers.facebook.com, Conversions API Parameters: «Website events … require the
client_user_agent, action_source, and event_source_url parameters»), den gælder kun
annonce-ansøgere (kun rækker med `fbclid`), og den står i persondatateksten.
**TRIN 2 (22/9):** de tre nye hændelser er CRM-hændelser, ikke website-hændelser — de sker i vores eget system (rådgiverens klik, Calendly-webhooken, Stripe-webhooken), og Meta dokumenterer netop den sag som `action_source: "system_generated"` + `custom_data.event_source: "crm"`. De bærer derfor hverken user agent eller `event_source_url`: ansøgningens user agent hører til et ANDET øjeblik, og at sende den ville være en påstand om en browser, vi ikke har set.

**Rettet 22/9:** user agent gemmes nu for **ALLE** ansøgere, fordi alle ansøgninger sendes
— webinarvejen (annonce → topix.dk → mail → `/ansoeg?kilde=webinar`) bærer intet klik-id
og var derfor usynlig for Meta. Uden user agent kan hændelsen slet ikke sendes.

**(f) Jonas godkender kun tekster.** Resten styres af chatten — og fra 21/9 aften har
chatten Jonas' fulde mandat, også til teksterne (GA-afsnittet i persondatateksten er
afgjort sådan). Ordlyden låses af et værn, så den ikke kan skride ubemærket.

**(g) Hellere lidt for lempelige og mere data end et stramt garn af frygt.** Jonas står
på mål for det. Grænsen er loven, ikke frygten: GA's id gemmes kun med samtykke, fordi
cookien ellers ikke findes, og teksterne skal være sande.

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
| 22 | **Meta Conversions API fra platformen** | `Lead application_started` / `application_submitted` fra `ansoegninger` (§4) | cron-job, der læser `ansoegninger` | **fra 22/9: ALLE ansøgninger** (ikke kun rækker med `fbclid`) — `fbc` (URL'ens klik-id, ellers `_fbc`-cookien ordret), `fbp`, hashet eget id, user agent, og **SHA-256-hashet** `em`/`ph`/`fn`/`ln`/`country` — aldrig IP/CVR/svar og aldrig en værdi i klartekst | Meta, datasæt 858180112996496 | persondatateksten (§1e) | **i drift 21/9 aften** — bevist i Test events 16:13; **låsen slået til 16:30 og bevist i kørslen 16:43** (job 568 sender nu for alvor); §4 |
| 22b | **Meta — Kvalificeret · Schedule · Purchase** (trin 2) | `ansoegning_beslutninger` (`tal_med_dem`, `book`) og `company_perioder` (art `indgang`) | samme cron, `meta-send-cron` | `action_source: system_generated` + `custom_data { event_source: "crm", lead_event_source }`; user_data som ansøgningens (hashet em/ph/fn/ln/country, external_id, fbc, fbp) — **ingen user agent, ingen url**; Purchase bærer desuden `value` (kroner) og `currency` | Meta, samme datasæt | persondatateksten (§1e) | **BEVIST I DRIFT 22/9 14:03** — `meta_haendelser` for webinarets 6 ansøgere: started 6 · submitted 5 · **kvalificeret 3** · **booket 1**, alle sendt. `purchase` mangler af den rigtige grund (en betaling sker 30–60 dage efter). **Aktive i Events Manager 22/9 14:45:** «Kvalificeret» (API, 3) og «Planlægning»/Schedule (API, 1); Lead **EMQ 8,5/10** (var 7,8). Den fjerde brugerdefinerede konvertering oprettet 14:5x — se §4c. §4b |
| 23 | **Google Analytics' id'er på ansøgningen** | `ansoegninger.ga_client_id` / `ga_session_id`, gemt ved «opret» | fladen læser `_ga` og `_ga_6LHR66CDJ4` ved mount; egen fail-soft update efter annoncesporet | GA's klient-id og session-id — **gemmes kun, sendes endnu ikke** til nogen | (ingen modtager endnu) | samtykket på theboardroom.dk: uden «Acceptér» findes cookierne ikke, og begge felter er null | **#1071 (`edfa4f89`) i drift 21/9 17:25** — ga_client_id/ga_session_id gemmes ved opret, kun med samtykke; sendes endnu ikke; §4a |
| 24 | **Google Analytics — afsendelsen fra platformen** | `application_started` / `application_submitted` til `G-6LHR66CDJ4` (Measurement Protocol) | cron-job, der læser `ansoegninger` og `ga_haendelser` | GA's eget klient-id og session-id, kilden og utm-mærkerne, hændelsens tidspunkt — aldrig navn/e-mail/telefon/CVR/svar | Google Analytics (EU-værten) | samtykket på theboardroom.dk (uden cookie ingen hændelse) + persondatateksten | **#1073 i drift 21/9 21:02** — sporet og låsen KØRT 17:48, cron-migrationen KØRT 21:02 (job 569, låsen slået til samtidig). Nøgle, strøm, klient-id og hændelsesform **bevist i DebugView 20:57–20:59**; Realtid og dagens rapporter viste dem ikke. **Platformens egne hændelser bevist i rapporten 22/9 08:13** (beviset står ét sted: §4a). §4a |
| 25 | **Klaviyo — afmelding fra eWebinar** | `_shared/klaviyoAfmelding.ts` via `ewebinar-webhook` (i samme kald som beskeden), `klaviyo-gensend-cron` (fejlede igen) og `klaviyo-afmeld-bagud` (fejet) | eWebinar melder `action = Unsubscribed`, eller `subscribed` skifter til Unsubscribed | **kun mailadressen** — `POST /api/profile-subscription-bulk-delete-jobs` med `subscriptions.email.marketing.consent = "UNSUBSCRIBED"`. Intet `list_id` (globalt), ingen sms/push, intet telefonnummer | Klaviyo (USA) | personens egen afmelding — dette FJERNER et samtykke, det giver ikke et | **i drift 22/9 13:57**, bevist på tre profiler læst tilbage hos Klaviyo 13:58 (OVERLEVERING «22. september (dagen)» §2). Egen secret `KLAVIYO_AFMELD_KEY`; #1088. **Webhook-grenen er kode, ikke drift** — bevises af næste rigtige Unsubscribed |

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
| `client_user_agent` | **ikke fundet 21/9 middag** (kun på `aftale_underskrift`) — **gemmes fra 21/9 aften; fra 22/9 for ALLE, ikke kun med `fbclid`** (§4) | `enhed` (deviceType), ikke UA |
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

**theboardroom.dk — PR #2 (`4a61b19`), 21/9 aften:** `/ansogning-modtaget` er **nedlagt**. Ruten er nu `<Navigate to="/" replace />` (replace, så den gamle adresse ikke lægger sig i historikken), og siden er slettet. Den fyrede GTM's `Lead` og GA4's `application_submitted`, hver gang nogen landede der — og ingen ansøger er kommet dertil siden 18/9, hvor ansøgningen flyttede ind i platformen (§2 række 3). **Bevist på det levende site:** 26 filer gennemsøgt, 0 træf på siden og på `trackFormSubmitted`. Det lukker §6 punkt 12.

**TikTok ud af teksterne 21/9 aften** — pixlen er sat på pause i begge containere (se GTM-afsnittet nedenfor), og så må teksterne ikke længere sige, at vi bruger den. **theboardroom.dk PR #3 (`0f0c335`):** banneret siger nu «(Meta og LinkedIn)»; linjen `<li><strong>TikTok Pixel</strong> – annoncemåling (Singapore/USA, samtykkebaseret)</li>` er væk af privatlivspolitikken, markedsføringslinjen nævner kun Meta og LinkedIn, og cookiepolitikkens række `_ttp / _tt_*` er fjernet. **topix.dk PR #2 (`62057b1`):** marketingcookie-linjen siger «Meta, Google Ads og LinkedIn», `<li>TikTok (pixel)</li>` er væk af tredjepartslisten, og `_ttp`-posten er ude af cookiepolitikkens tabel. Nul forekomster af «tiktok» tilbage i nogen af de to `src`-træer.

**Bevist på de levende sider 21/9 (curl):** `ad_storage: 'denied'` på begge sites; «vores annoncer», «Lovable Cloud» og `platform_ansoeg` fundet i bundlerne; SuperForm-id'et og `superform_boardroom` ikke fundet i 27 (theboardroom) / 26 (topix) filer.

**Fejlen i den første beviskommando, bogført:** den ledte kun efter script-stier på formen `assets/…` — ikke `./…`-formen, som chunk-listen bruger — og meldte «ikke fundet» om noget, den ikke havde ledt efter. «Ikke fundet» var «ikke ledt». Anden kørsel ledte i alle chunks. Regel: et negativt fund kræver, at søgningen bevises at ramme det, den skal finde (samme som «tavs dom ligner grøn dom»).

**topix.dk — PR #3 (`8b36731`), 21/9 aften:** privatlivspolitikken fik A's sætning om webinarets klik-id i afsnittet om indsamlede oplysninger, ordret:

> «Tilmelder du dig vores webinar via en annonce, gemmer vi det klik-id, Meta satte på linket. Ansøger du senere om medlemskab, bruger vi det til at fortælle Meta, at annoncen virkede — sammen med en krypteret udgave af din e-mail og dit navn. Selve din tilmelding deler vi ikke med Meta.»

**Begge sites er publiceret** efter aftenens merges (Jonas 21/9 23:4x): theboardroom.dk `0f0c335` (TikTok ud) og topix.dk `8b36731`.

**Dokumentet til marketingmanden** — `tracking-til-marketing-22-09-2026.pdf`, tre sider: hændelserne, det slukkede, de to kampagner med annoncesæt-id'er, de tre nye konverteringer, hans to skift af mål i egen timing, GA4 og datakvaliteten. **Sendt 21/9 23:4x sammen med et nyt privat `/webinar`-link til Nicklas.** Det gamle link er lukket, fordi dets token stod i chatten (§6 punkt 13).

### GTM-containerne — ændret 21/9 kl. 21:35–22:05 (Jonas, med chatten)

Dette er første gang containerne selv er rørt; linjen ovenfor gjaldt frem til 21:35.

**theboardroom.dk (GTM-NL33PM5M)** — seks tags sat på **PAUSE** og udgivet: «Facebook - application_started», «Facebook - application_submitted», «GA4 - application_started», «GA4 - application_submitted», «Tiktok - Pageview» og «TikTok – purchase». De fire første er nu platformens arbejde (§4): de fyrede på `cta_click` og på den nedlagte tak-side, altså på noget andet end en ansøgning. **Samtykkeoversigten er slået til og gennemgået:** alle Meta-, LinkedIn- og Stape-tags kræver `ad_storage` — intet at rette. Det lukker §5 punkt 1 og 2.

**topix.dk (GTM-57M8R72D)** — «Tiktok - Pageview» på pause. «Facebook - boardroom_intent» (et HTML-tag) manglede et samtykkekrav og kræver nu `ad_storage`; udgivet.

**Bevaret med vilje:** «dataLayer - ewebinar_form_submit» bliver stående, fordi Klaviyos Identify bruger den. GA4-taggene «email_added» og «generate_lead» sender **ikke** e-mailen som parameter — den går kun via Googles «user-provided data», som Google-tagget krypterer — og de beholdes efter princip (g). Det afgør §5 punkt 3.

**Rester, der endnu ikke er slukket:** de fire «purchase»-tags på theboardroom.dk (Facebook, GA4, LinkedIn, Stape). Betalingen sker i platformen, så de måler ikke det, de tror. De sættes på pause, når platformens `Purchase` kører.

Ikke ændret 21/9 (§5, §6): Stape, eWebinars pixel, privatlivspolitikkens Monday.com- og Circle.so-linjer, legatets egen SuperForm (`Legat.tsx:10`, andet formular-id).

---

## 4. Platformens Conversions API — i drift 21/9 aften, bevist

**#1069 (`dc3142d8`) merget 21/9.** Migrationerne `20260921233000` (kolonnen `ansoegninger.user_agent`) og `20260921234000` (sporet `meta_haendelser` + låsen `app_config.meta_send_aktiv` = false) **KØRT i prod 15:50, FØR merge** (Jonas, Lovable SQL editor, med en vagt først; efter: `user_agent text` · sporet med RLS true, 2 politikker, 0 rækker · låsen false). `ansoegning-gem` og `meta-send-cron` **udrullet** fra Lovables build-chat — værktøjets resultat ordret: «Successfully deployed edge functions: ansoegning-gem, meta-send-cron». Secret `META_SEND_TOKEN` sat af Jonas (Events Manager-token, genereret med Dataset Quality API, kun datasættet «Topix.dk» — ikke «The Boardroom — annoncer» 1259647116283770). Cron-migrationen `20260921235500` **kørt 16:18** (efter merge, med en vagt først): job **568 «meta-send»**, `3,8,13,18,23,28,38,43,48,53,58 * * * *`, `active: true`. Låsen er stadig false, så jobbet **tørkører** ved hver kørsel, til den slås til.

**Sådan virker det:** et selvstændigt cron-job læser `ansoegninger` (kun seks kolonner) og sender `Lead application_started` (event_time = `created_at`) og `Lead application_submitted` (`indsendt_at`) til datasæt 858180112996496. `event_id` = `<ansøgnings-id>:started`/`:submitted`. Payload efter §1d: `event_name`, `event_time`, `event_id`, `action_source: "website"`, `event_source_url` (= `landing`), `user_data { external_id (hashet ansøgnings-id), fbc, client_user_agent }` — aldrig `em`, `ph`, `client_ip_address`. User agent gemmes ved «opret», kun på rækker med `fbclid`.
**UDVIDET — i drift 21/9 22:30 (#1076, `f14ef4ed`; se afsnittet nedenfor):** kandidaten er nu ENHVER ansøgning i vinduet med
user agent og landing; `user_data` bærer også `em`, `ph`, `fn`, `ln` og `country` som
SHA-256-aftryk (kun de felter, ansøgningen HAR) samt `fbp` og — når URL'en ikke bar et
`fbclid` — `_fbc`-cookien ordret. Nye kolonner `fbp`, `fbc_cookie`, `meta_fravalg`
(migration `20260922040000`). User agent gemmes nu for ALLE. Låsen i `app_config` (standard false) holder kørslen i tørkørsel; en `test_event_code` åbner uden låsen — det er bevisets vej. Den gamle `META_CAPI_TOKEN` er annoncehentningens `ads_read`-nøgle (nødnavn, `_shared/metaAdsToken.ts`) og er urørt.

### Beviserne (21/9 aften) — princip 1a

**Bevis 1, kl. 16:10 — sporet gemmes.** Prøvekladde oprettet fra `/ansoeg?fbclid=IwARproeve123&kilde=direkte` → ansøgning `fcff2198-e19b-4de7-b608-a87eb6755bae` med `fbclid`, `landing` og `user_agent` («Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) …») gemt på rækken. Kolonnen virker i prod, og user agent skrives kun fordi `fbclid` er sat.

**Bevis 2, kl. 16:11 — tørkørslen dømmer rigtigt.** `dry_run: true`, `laas_aktiv: false`, `sender_rigtigt: false`, `kandidater: 1`. `ville_sende`: `…:started` med `event_time` 14:10:09.406Z og `fbc` `fb.1.1789999809406` — altså `created_at` regnet om til millisekunder, som Metas regel siger. `sprunget: { ikke_indsendt: 1 }` (kladden er ikke indsendt, så `submitted` springes over med grund).

**Bevis 3, kl. 16:13 — hændelsen ankom hos Meta.** Én hændelse sendt med `test_event_code TEST51467` + `ansoegning_id`. Sporet: `udfald: sendt`, `status: 200`, `events_received: 1`. I Events Manager → Test events: **Lead «Behandlet», fra Server, «Manuel opsætning»**, hændelses-id `…:started`, `content_name: application_started`, handlingskilde `website`, brugerdatanøgler «Eksternt id, Klik-id, Brugeragent» — præcis de tre, og ingen kontaktoplysninger.

**Bogført om bevis 3:** hændelsen **tæller i Metas statistik**. Metas ord: hændelser med `test_event_code` «are not dropped. They flow into Events Manager and are used for targeting and ads measurement purposes» (Conversions API → Using the API). Datasættet har altså ét «påbegyndt» med et **falsk klik-id** (`IwARproeve123`) og ingen annonce bag. Det er prisen for beviset, og det er kendt — ikke en fejl at lede efter senere.

### Rettelser før merge — og hvorfor

- **Metas fejlsvar dømmes på fejlkoden, ikke kun HTTP-status.** Graph API svarer 400 også for en ugyldig nøgle (kode 190) og manglende rettigheder (10, 200–299). Med den gamle dom («alt 4xx = ugyldig») ville en forkert nøgle have stemplet hver hændelse «ugyldig» — og «ugyldig» prøves aldrig igen. Hele aftenens trafik var gået tabt for altid. Nu: nøgle/rettighed → `ingen_noegle`; midlertidigt (1, 2, 4, 17, 32, 341, 613 eller `is_transient`) → `fejl`; øvrige 4xx → `ugyldig`; 5xx → `fejl`. Citaterne står i `_shared/metaSend.ts`' filhoved.
- **Intet forsøgsloft.** Loftet var 6 forsøg, og cronen kører hvert 5. minut — den ville have opgivet efter 30 minutter. **Metas 7-dagesvindue er loftet**: `ingen_noegle`, `fejl` og `timeout` prøves igen ved hver kørsel, til dommen siger `for_gammel`. Kun `sendt` og `ugyldig` prøves aldrig igen.
- **Annoncesporet må aldrig tabes på grund af user agent.** Fejler `ansoegning-gem`s update MED user agent (fx fordi kolonnen mangler), prøves straks igen med sporet alene, og begge fejl logges. Klik-id og utm er vigtigere end user agent.
- **A's to rettelser af chatten** (chatten tog fejl, koden har ret): `fbc`-indekset er **1**, ikke 2 — Metas regel for server-genereret uden `_fbc`-cookie er «use the value 1», uanset hvor mange led domænet har. Og **testhændelser TÆLLER** — chatten sagde fejlagtigt, at de ikke gør.

### Tilbage — gjort 21/9 aften

1. ~~Persondatatekst-rettelsen~~ — merget som #1070.
2. ~~**Update** i Lovable~~ — klikket; den rettede tekst står på den levende side.
3. ~~**Låsen slås til**~~ — **slået til 16:30** (`meta_send_aktiv`: før `false` → efter `true`, 1 række opdateret). **Bevist i kørslen 16:43:** `laas_aktiv: true`, `sender_rigtigt: true`, og prøvekladden blev sprunget over som `allerede_sendt` (idempotensen holdt — den var sendt 16:13). Job 568 sender nu for alvor.
4. ~~**Prøvekladden slettes**~~ — `fcff2198-e19b-4de7-b608-a87eb6755bae` **slettet 16:47** med sit spor. Vagtet: FK-målingen først viste, at kun `meta_haendelser` pegede på rækken, så cascade tog sporet med.

### Udvidelsen (#1076, `f14ef4ed`) — alle ansøgere, hashet, i drift 21/9 kl. 22:30

Migrationen `20260922040000` **KØRT i prod 22:15, FØR merge**, med en vagt først; efter: `fbc_cookie text null` · `fbp text null` · `meta_fravalg boolean not null default false`. `ansoegning-gem` og `meta-send-cron` **udrullet fra `f14ef4ed`** — værktøjets resultat ordret: «Successfully deployed edge functions: ansoegning-gem, meta-send-cron».

**STRIKS-beviset, FØR Update** (samme rækkefølge som §4a, og af samme grund — fladen sender nu feltet `meta`): kald **13534** med `{hent, falsk token, xyz}` → **400 «Kendte felter: annoncespor, cvr_bekraeftet, firma, ga, handling, kilde, kilde_raa, meta, svar, token, virksomhedsnavn»**. `meta` står på listen, altså kendte den kørende function feltet, og felterne tjekkes stadig før tokenet.

**Beviskæden, ét stræk:**

1. **22:26 — låsen slået fra.** `meta_send_aktiv` → `false`, så cron-job 568 ikke nåede at sende prøvekladden, før testkoden var på plads. Låsen er bevisets redskab, ikke juraens (§1g).
2. **22:27 — prøvekladde `6cff9f4a-ad44-40cc-b707-69b5564efebc`** oprettet i et privat vindue med «Acceptér» og kontaktskærmen udfyldt: `fbp` = `fb.1.1790022…`, user agent, GA-id, e-mail, navn og telefon gemt. **Ingen `_fbc`** — vinduet kom ikke fra en annonce, og det er netop webinarvejen.
3. **22:27 — tørkørsel (kald 13538).** Brugerdatanøgler `[em, ph, fn, ln, country]`, `fbp: true`, `fbc_kilde: "ingen"`, `payload_afvist: 0` — og grunden «ingen_fbclid» findes ikke længere. En ansøger uden klik-id er nu en kandidat.
4. **22:30 — testhændelse `TEST51467`.** Metas Test events viste **Lead, «Behandlet», fra Server**, `content_name: application_started`, handlingskilde `website`, og brugerdatanøglerne **«Land, E-mail, Eksternt id, Browser-id, Fornavn, Efternavn, Telefon, Brugeragent»** — otte, hvor der før stod tre.
5. **22:30 — låsen slået til.** Job 568 sender nu for alvor, også for ansøgere uden klik-id.

~~**Prøvekladden slettes 22/9 kl. 08**, efter GA-tjekket i §4a — den bærer både GA-id'et og Meta-hændelsen, så den skal stå, til begge er aflæst.~~ — **SLETTET 21/9 kl. 23:43** sammen med GA-prøven, se «Oprydningen» nedenfor. Hændelserne ligger stadig hos Google og Meta, så morgenens GA-tjek bruger **rapporten**, ikke kladden.

**KENDT SVAGHED, rettes i trin 2:** navnet deles ved første mellemrum, så «Jonas Breum Herlev» giver `fn` = `jonas` og `ln` = `breumherlev`. Meta forventer efternavnet alene. **Sidste ord skal være `ln`.** Det rammer alle ansøgere med mellemnavn, og et forkert aftryk matcher ingen — det er et tabt match, ikke en lækket oplysning.

### Trin 2 (#1078, `49697491`) — Kvalificeret, Schedule og Purchase, i drift 21/9 kl. 23:28

Migrationen `20260922050000_meta_haendelser_trin2.sql` **KØRT i prod 21/9 kl. 23:20** (Jonas, Lovable SQL editor), efter merge-start men **FØR udrulningen**, med en vagt først — art-CHECK'en skulle indeholde `started` og ikke `kvalificeret`. EFTER: `CHECK ((art = ANY (ARRAY['started', 'submitted', 'kvalificeret', 'booket', 'purchase'])))`, **0 rækker uden for**. #1078 merget som `49697491`, suiten grøn med 488 filer og 6.908 prøver.

**Låsen `meta_send_aktiv` slået fra kl. 23:28** (den havde stået `true` siden 22:30), så første kørsel med den nye kode ikke sendte syv dages CRM-hændelser for alvor, før nogen havde set dem. `meta-send-cron` **udrullet fra `49697491`** — værktøjets resultat ordret: «Successfully deployed edge functions: meta-send-cron».

**Beviset, tørkørsel 23:29 (kald 13585):** status 200, `dry_run: true`, `laas_aktiv: false`, `kandidater: 2`, `ville_sende: []`, `payload_afvist: 0`, `alarm: ingen`. Grundene, ordret: `ingen_user_agent 2` · `ikke_indsendt 1` · `ikke_kvalificeret 2` · `ikke_booket 2` · `ikke_betalt 2` · `ingen_beloeb 0` · `allerede_sendt 1`. **De tre nye grunde findes kun i trin 2 — altså kører den nye kode.** De to kandidater var chattens egne prøvekladder: `79a82aec` uden user agent (fra før udvidelsen) og `6cff9f4a`, hvis `started` allerede var sendt.

**Fund: der er ingen kvalificeringer, bookinger eller betalinger i de sidste syv dage.** Der er altså intet at sende bagud og intet at vise i Metas testvisning uden at fabrikere en beslutning i en append-only tabel — det er fravalgt. **Kvalificeret, Schedule og Purchase bevises ved den første rigtige hændelse**, altså første «Tal med dem» efter webinaret 22/9: se den i Events Manager, og opret derefter den fjerde brugerdefinerede konvertering «Kvalificeret».

**Låsen `true` igen** (~23:30, målt `true` 23:43), og **Update** klikket med persondatateksten om samtale, booking og betaling.

### Oprydningen 21/9 kl. 23:43

Begge prøvekladder **slettet**, vagtet — præcis 2 rækker, begge ikke indsendt: `79a82aec-1e1e-40cd-80ce-ba8d4249e29d` (GA-prøven 18:02) og `6cff9f4a-ad44-40cc-b707-69b5564efebc` (Meta-prøven 22:27). Sporene fulgte med som cascade. **EFTER: 0 kladder, 0 meta-spor, 0 ga-spor; `meta_send_aktiv` = true, `ga_send_aktiv` = true.** Hændelserne selv ligger stadig hos Google og Meta.

### Metas Events Manager — målt 21/9 22:40–23:37 (datasæt «Topix.dk» 858180112996496)

**Oversigten:** «5.456 kr. annonceudgifter påvirket af lav datakvalitet» og «Forbedr din matchkvalitet ved at sende flere parametre» (høj prioritet). Integrationer: API for konverteringer plus Meta-pixel. Websites: topix.dk og 8 flere.

**Hændelsen «Lead»:** aktiv, matchkvalitet 7,8; **356 hændelser 24/8–20/9 — 254 fra browseren, 102 fra serveren**; «Hændelsesdækning 0 %»; deduplikering «Opfylder ikke anbefalede fremgangsmåder». **Fire annoncesæt** med mål «Leads» og «Optimering, målretning»:

| Annoncesæt-id | Navn | Forbrug |
|---|---|---|
| `120248713786770694` | Default \| Business Page Owner… | 7.547,78 kr |
| `120248713786760694` | Default \| Open Targeting \| OM | 4.626,03 kr |
| `120242386310820694` | Default \| Open Targeting \| OM | 1.786,78 kr |
| `120242386845280694` | Default \| Business Page Owner… | 2.966,14 kr |

Metas eksport af 13 eksempler (22:49) er bogført i #1078 og dækker to kampagner.

**Brugerdefinerede konverteringer FØR (23:31):** «Google Trafik» (id `964899862274375`, 70, aktiv) og «Ansøgning modtaget» (id `1745883260128691`: Lead, URL indeholder `https://theboardroom.dk/ansogning-modtaget`, værdi 50.000,00 DKK, website; 12). **«Ansøgning modtaget» er DØD fra 21/9** — siden er nedlagt (§3) og tagget på pause. Den arkiveres af marketingmanden, når ingen kampagne bruger den.

**Oprettet af Jonas 23:35–23:37**, alle tre «Inaktiv» med 0 — normalt, fordi en brugerdefineret konvertering kun tæller hændelser efter oprettelsen. Meta tillader ikke at ændre en eksisterende konverterings regel, og derfor er de nye:

| Navn | Id | Regel |
|---|---|---|
| «Ansøgning – sendt» | **`1095961763387558`** | website · Lead · `content_name` er lig med `application_submitted` · ingen værdi |
| «Ansøgning – påbegyndt» | **`2948029405548506`** | website · Lead · `content_name` er lig med `application_started` |
| «Webinar – tilmelding» | **`290860161976498?`** — sidste ciffer er ulæseligt på skærmbilledet | website · Lead · URL indeholder `topix.dk/webinar` |

**Den fjerde, «Kvalificeret», mangler endnu** og oprettes efter den første rigtige kvalificering.

---

## 4c. Events Manager — målt 22/9 kl. 14:45–14:50

**Trin 2's to nye hændelser er Aktive:** «Kvalificeret» (API, **3**) og
«Planlægning»/Schedule (API, **1**). **Lead EMQ er steget fra 7,8 til 8,5 af 10**
efter udvidelsen med hashede felter (§4b).

### To domæner, der begge kunne have ført et forkert sted hen

- **`calendly.com` er Calendlys EGEN pixel**, med `invitee_*`-hændelser. Den er
  **ikke** en dublet af vores `Schedule`, og der er **ingen dobbelttælling** at
  rette. Havde vi læst den som vores, ville næste skridt have været at fjerne en
  hændelse, der skal være der.
- **`599e87f7-….lovableproject.com` er Lovables forhåndsvisning.** Den **må ikke
  bekræftes som domæne** i Events Manager. Et bekræftet forhåndsvisningsdomæne
  ville binde datasættet til en adresse, der skifter.

### Den fjerde brugerdefinerede konvertering — oprettet, men UMÅLT

Oprettet 22/9 kl. 14:5x: **Website** · hændelse `Kvalificeret` · regel
*Event Parameters* `event_source = crm`.

**Det, der ikke vides:** om en **Website**-konvertering overhovedet tæller vores
`system_generated`-hændelser. De tre CRM-arter bærer med vilje
`action_source: "system_generated"` og hverken user agent eller
`event_source_url` (§4b) — og en Website-konvertering kan være defineret til kun
at se website-hændelser.

**Sådan afgøres det, uden at gætte:** ved den **første «Tal med dem» efter
22/9** — står konverteringen **Aktiv**, tæller den; står den **Inaktiv**, skal
reglen om. Det er punkt 3 i «26/9 — START HER».

### Metas egne anbefalinger — noteret, ikke gjort

1. **IP-adresse på hændelserne.** Vi sender den bevidst ikke i dag
   («Aldrig IP, CVR, svar eller en værdi i klartekst», CLAUDE.md). At tage den
   med er en beslutning om persondata, ikke en teknisk justering.
2. **`fbp`-dækning** — hvor mange hændelser bærer browser-id'et.
3. **Avanceret matchning på sitet.**

Ingen af de tre er besluttet. De står her, så de ikke skal findes igen.

---

## 4a. Google Analytics — opsamlingen (#1071, i drift 21/9 17:25)

**Merget som `edfa4f89`.** Migration `20260922003000` (kolonnerne `ga_client_id`, `ga_session_id`) **KØRT i prod 17:01, FØR merge**, med en vagt først; efter: begge `text`, nullable, med kommentar. `ansoegning-gem` og `meta-send-cron` **udrullet fra `edfa4f89`** — værktøjets resultat ordret: «Successfully deployed edge functions: ansoegning-gem, meta-send-cron».

**Hvad den gør:** fladen læser `_ga` og `_ga_6LHR66CDJ4` fra `document.cookie` ÉN gang ved mount (begge sessionsformater, GS1 og GS2); findes de ikke, er begge null — aldrig et gæt, aldrig et genereret id. Nyt body-felt `ga` (STRIKS); serveren dømmer formen igen (`gaAf`) og skriver i en EGEN fail-soft update EFTER annoncesporet, så en fejl her aldrig kan koste klik-id, utm eller user agent. Begge felter står i `FORBUDTE_NOEGLER` — de når aldrig Metas payload. **Sendes endnu ikke til Google.**

### Beviset for RÆKKEFØLGEN — deploy FØR Update

`ansoegning-gem` er STRIKS: den afviser ukendte body-felter. Havde Update stået først, ville den GAMLE function have mødt det nye felt `ga` fra den nye flade og svaret 400 på **hver eneste ansøgning**. Derfor blev functionen udrullet først — og det blev bevist, før Update blev klikket:

- **Kald 13321** — `{handling: "hent", token: <falsk>, ga: {...}}` → **404 «Ukendt eller lukket ansøgning»**. Ikke 400. Altså kendte den nye function feltet `ga` og nåede frem til tokenet.
- **Modprøve 13323** — samme kald med et opdigtet felt `xyz` → **400 «Ukendt felt i body: xyz. Kendte felter: annoncespor, cvr_bekraeftet, firma, ga, handling, …»**. To ting på én gang: felterne tjekkes FØR tokenet, og `ga` står på listen.

Modprøven er det, der gør 404'eren til et bevis: uden den kunne 404 også være den gamle function, der ignorerede et ukendt felt. Først derefter blev Update klikket.

### Beviserne på skærmen (17:28–17:30)

- **Prøve A, 17:28** (privat Chrome-vindue, «Acceptér» i cookiebanneret): `ga_client_id = 1810362206.1790004485`, `ga_session_id = 1790004484` — altså 17:28:04, sekundet hvor samtykket blev givet og GA satte cookien. Formen er præcis den, parseren kræver.
- **Prøve B, 17:29** («Afvis»): **begge null** — og `kilde` og `landing` gemt som altid. Det er modprøven, der beviser, at GA-updaten ikke kan koste annoncesporet: den kørte slet ikke, og sporet stod der.
- Begge prøvekladder **slettet 17:30**, vagtet (præcis 2 rækker — talt før og efter).

### Afsendelsen (#1073) — udrullet 21/9, og hvad der skulle til

**#1073 udrullet 21/9** (`ga-send-cron` + `meta-send-cron` fra `97be046e`). Migrationerne: sporet og låsen `20260922010000` **KØRT 17:48**, cron-jobbet `20260922011000` **KØRT 21:02**.

#### Første runde (18:03–20:55): alt svarede rigtigt, og intet kom frem

- **Bevis 1 (tørkørsel 18:03)** og **bevis 2 (validering 18:03, `validationMessages: []`)** holdt begge.
- **Testrækken fra bevis 2 slettet 18:04** — valideringskørslen havde skrevet en «sendt»-række i sporet, som ville have blokeret den rigtige afsendelse. Det er fejlen, A retter i denne PR (`skalSkriveSpor`).
- **Låsen slået til 18:04.** **Bevis 3: én hændelse sendt 18:04:53, status 204.**
- **Direkte test fra terminalen med nøglen**, tre varianter: `tracking_test_eu` (via `region1`), `tracking_test_www` (via `www`) og `tracking_test_nosession` (uden `session_id`). Alle tre gav **204**, og testserveren svarede `validationMessages: []`.
- **Kl. 20:54 var ingen af de fire hændelser i GA4** — hverken i Realtid eller i Rapporter → Hændelser. **Låsen derfor tilbage på `false` kl. 20:55.**

204 og tom `validationMessages` betyder kun, at kaldet blev modtaget og var velformet — **ikke at hændelsen blev talt**. Det var det, der skulle afgøres.

#### Anden runde (20:57–21:02): beviset, Google selv anbefaler

Googles fejlfindingsside ([troubleshooting](https://developers.google.com/analytics/devguides/collection/protocol/ga4/troubleshooting)) nævner **nøglen først**: rigtig strøm, stadig gyldig, kopieret præcist — den skelner mellem store og små bogstaver. Jonas kopierede den med **Kopiér-knappen** i GA4, og den var **tegn for tegn identisk** med den, chatten havde tastet af fra et skærmbillede (22 tegn). Nøglen var altså ikke fejlen — men den var den eneste ubekendte, der ikke var målt.

Googles anbefalede bevis er **DebugView med `debug_mode`** ([verify-implementation](https://developers.google.com/analytics/devguides/collection/protocol/ga4/verify-implementation)):

- **20:57:58 — `tracking_test_debug` SET i DebugView** (med `client_id` fra prøvekladden).
- **20:59:34 — `tracking_test_debug_session` SET** — med `session_id`, `timestamp_micros` to minutter bagud og parameteren `kilde`, altså **platformens egen form**.

**Konklusion: nøgle, strøm, klient-id og hændelsesform virker.** Realtid og dagens rapporter viste dem blot ikke. (Brugeregenskaben `non_personalized_ads = 1` står på brugeren; den påvirker ikke målingen.)

- **~21:00:** `GA4_SEND_SECRET` sat på ny i Lovable med den beviste værdi — den eneste ubekendte, der var tilbage.
- **21:02:** låsen slået til, og **cron-job 569 oprettet** (minutterne 2, 12, 22, 32, 42, 54).

#### Beviset i rapporten — 22/9 kl. 08:13: platformens hændelser ER talt

**Bevist i rapporten 22/9 08:13.** Rapporter → Engagement → Hændelser, dagen **21/9**, `application_started` med sekundær dimension **Time**:

- **Time 18 = 2 hændelser fra 1 bruger** — Jonas' GTM-klik 18:02 og **platformens egen hændelse 18:04**, samme klient-id (derfor to hændelser, én bruger).
- **Time 22 = 1 hændelse** — **platformens**, fra prøvekladden 22:27. GTM-tagget var slukket fra 21:40, så den kan kun være platformens.

**Kl. 00:09 stod de ikke der endnu.** Measurement Protocol behandles langsommere end browserens hændelser. **Realtid og dagens rapport er ikke beviset — rapporten dagen efter er.** Det er reglen, der gælder næste gang, en MP-hændelse skal efterprøves.

Prøvekladden `79a82aec-1e1e-40cd-80ce-ba8d4249e29d` var allerede slettet 21/9 kl. 23:43 (§4, «Oprydningen») — hændelserne lå hos Google, så beviset kunne hentes uden den.

**Uafhængigt af det:** cross-domain-listen i GA4 dækker ikke `app.theboardroom.dk` (recon-ga4.md §3.2) — `_ga` sat på theboardroom.dk er stadig læsbar (eTLD+1), men linket bærer ikke `_gl`.

---

## 4d. Mailvejene — målt og ændret 22/9 aften

Tracking er ikke kun pixels: **hvem der må sende som os**, afgøres af DNS, og
det blev målt og ændret samme aften.

### De to domæner ligger hvert sit sted — og det er let at lede forkert

| domæne | DNS hos | SPF (målt 22/9) | DMARC |
|---|---|---|---|
| `theboardroom.dk` | **Simply.com** (`ns1–3.simply.com`) | **SAT ~16:02:** `v=spf1 include:_spf.google.com ~all` | `p=none` |
| `topix.dk` | **Cloudflare** | `v=spf1 include:mailgun.org include:_spf.herodesk-mails.io ~all` | `p=quarantine adkim=s aspf=s` |

**Kortet `a20-spf-theboardroom` antog Cloudflare for begge. Det var forkert**, og
det er værd at huske: en DNS-rettelse, der ledes efter det forkerte sted, ser ud,
som om den ikke virkede.

**Fundet på `topix.dk`, som IKKE er rettet:** SPF nævner **ikke Google**, og
DMARC står `p=quarantine` med **streng** justering (`adkim=s aspf=s`) — et
DKIM-match på et underdomæne tæller ikke. Sender nogen som `@topix.dk` gennem
Google Workspace, kan mailen havne i karantæne. **Om nogen gør det, er UMÅLT**,
og at føje `_spf.google.com` til uden at vide det ville være at gætte. Kort:
`a22-spf-topix`.

### Ny afsendervej: `webinar.topix.dk` (Mailgun EU)

**BESLUTTET (Jonas 22/9):** før-webinar-mails sendes af platformen til **ALLE
tilmeldte** gennem egen Mailgun EU; Klaviyo beholder efter-webinaret. Afsender
«Morten Larsen \<morten@webinar.topix.dk\>», Reply-To kontakt@topix.dk.

Opsat 16:4x–17:0x, **verificeret af Mailgun 16:56** (alle fem poster): konto
Topix.dk ApS · `webinar.topix.dk` i **EU** · shared IP · **DKIM 2048** · DNS i
**Cloudflare**: SPF, DKIM, MX `mxa`/`mxb.eu.mailgun.org`, CNAME `email.webinar`
→ `eu.mailgun.org` (**DNS only** — ikke proxy). Secret: **`MAILGUN_SENDING_KEY`**
(domæne-sendenøgle, ikke kontoens).

**Fravalgt med begrundelse:** Red Sift-DMARC — ingen datadeling, og `topix.dk`s
egen DMARC dækker. **UMÅLT:** planen (Foundation 50k) er ikke bekræftet; det tal
afgør sendeloftet.

### eWebinars `.ics` ligger åbent — et fund om PERSONDATA, ikke om tracking

Målt 22/9 med `curl`: **HTTP 200 uden login**. Filen bærer `ORGANIZER` (Morten
Larsen), `ATTENDEE` med `RSVP=TRUE` og **navn + e-mail**, samt `LOCATION`/`URL`
= den tilmeldtes **personlige joinLink**. **`attendeeId` er fortløbende**, så
listen kan i princippet gennemløbes af enhver, der tæller opad.

Det er **eWebinars design**, ikke vores opsætning, og der er ingen indstilling
hos os. **Handlingen er at melde det til eWebinar.** Indtil da gælder: en
deltagerliste til et webinar er ikke fortrolig — og det bør indgå, næste gang
nogen overvejer, hvad der må ligge bag et webinar-link. Kort:
`a22-ewebinar-ics-aaben`.

### Bekræftelsen sagde noget, der ikke var sandt

Klaviyos flow `WFzxH9` skrev «Du har fået en kalenderinvitation», mens
**eWebinars egen bekræftelse var slået FRA**. Rettet ~15:50: eWebinars
bekræftelse **TIL** (dansk tekst, vedhæfter `invite.ics`), Klaviyos `WFzxH9`
**SLUKKET**. En tekst, der beskriver noget, systemet ikke gør, er en fejl — også
når mailen selv går igennem.

---

## 5. Åbent — marketingmandens liste

1. ~~**GTM `Lead application_started`** (theboardroom.dk, tag 138) fyrer på `cta_click` — skal trigges af **`begin_checkout`**. Og `eventID` på Lead-tags, så platformens hændelser (§4) kan dedupes.~~ — **GJORT 21/9 21:35–22:05 (§3):** de fire tags «Facebook/GA4 - application_started/submitted» er sat på **pause** og udgivet. Hændelserne kommer nu fra platformen alene, så der er intet at deduplikere og ingen trigger at rette.
2. ~~**Samtykkekrav på Lead- og GA4-tags:** taggene siger ikke selv, hvad de kræver.~~ — **GJORT 21/9 (§3):** samtykkeoversigten er slået til og gennemgået på theboardroom.dk; alle Meta-, LinkedIn- og Stape-tags kræver `ad_storage`, intet at rette. På topix.dk manglede «Facebook - boardroom_intent» (HTML) sit krav — det er sat og udgivet.
3. ~~**Navn og e-mail ud af dataLayer på topix.dk/webinar**~~ — **AFGJORT 21/9 (§3): «dataLayer - ewebinar_form_submit» BEVARES**, fordi Klaviyos Identify bruger den. GA4-taggene «email_added» og «generate_lead» sender ikke e-mailen som parameter — kun via Googles «user-provided data», som Google-tagget krypterer — og beholdes efter princip (g).
4. ~~**Fjern TikTok-pixlen** (tag 96/130 på theboardroom.dk, tag 30 på topix.dk) — derefter banner og cookiepolitik uden TikTok (`_ttp`).~~ — **GJORT 21/9:** begge containere har pixlen på **pause** og udgivet (§3), og teksterne er renset i PR #3 (theboardroom.dk) og PR #2 (topix.dk). TikTok bruges ikke.
5. ~~**eWebinars pixel:** hvilke hændelser sender eWebinar for 858180112996496, og fra hvilke sider?~~ — **LØST 21/9 22:40 i Events Manager (§4):** eWebinars egen pixel sender **«Visit Registration»** (3,3 tusind), **«Fuldfør registrering»** (= CompleteRegistration, 587) og **«Joined Session»** (38, sidst for 27 dage siden). Derfor undgår vores fravalg af webinarhændelser fra serveren en dobbelttælling.
6. ~~**Stape-serverens tags** (`nofikexx.topix.dk`): hvilke klienter og tags, hvilket datasæt/token?~~ — **LØST 21/9 (§4):** **Stape sender GA4's hændelser videre til Meta som API-hændelser**: `user_engagement`, `scroll`, `form_start`, `cta_click`, `email_added` (matchkvalitet 7,7), `ewebinar` (7,7), `click`, `webinar_intent` og `boardroom_intent`. Containeren hedder «Topix - Server side», sGTM-container **GTM-T3GRBJMG**, domæne `nofikexx.topix.dk`, EU North (Holland), 3.518 af 500.000 requests brugt (skærmbillede 22:42). Jonas har adgang til Stape.
7. **Nye tilpassede konverteringer på platformens hændelser** — `application_started` og `application_submitted` kommer nu fra serveren (§4). Konverteringerne i Events Manager skal pege på dem, ikke på de pausede GTM-tags.
8. **Kampagnernes konverteringsmål** — hvilke annoncer optimerer mod hvad, når målet skifter til platformens hændelser.
9. **Aflæsningerne, der ikke kan måles herfra** (recon-tracking §6): Events Manager → Events pr. hændelse og pr. `event_source_url` (kommer app.theboardroom.dk overhovedet?), Connection method (browser/server), Deduplication, Event match quality; Custom conversions («fuldendt ansøgning», «opstart»: regel, kilde, «last received»); Settings → Conversions API / System Users (navn, «last used», scopes); Automatic advanced matching; Ads Manager → url_tags på alle aktive annoncer. GTM → Versions (tag-navne, hvem publicerede version 6), server-containeren, Consent Overview. GA4 (G-6LHR66CDJ4, G-9S4NL9FKGK) → Events sidste 7 dage, Key events, cross-domain, Measurement Protocol secrets (`GA4_API_SECRET` i sitets `ga4-track`). Klaviyo → «Active on site» fra topix.dk. Stape-kontoen → request-loggen for `/data`.

10. **FUND 22/9 — webinarets ansøgere har intet GA-klient-id, og derfor ingen GA-hændelser. Det er ikke en fejl.** Målt kl. 14:03: af de **6 ansøgninger oprettet 09:51–09:56** efter webinaret har **0 et `ga_client_id`**, så `ga-send-cron` sendte intet for dem. **Forklaringen er UMÅLT**, men nærliggende: de kom fra webinaret (topix.dk / eWebinar) og har aldrig været på `theboardroom.dk`, hvor GA-cookien (`_ga`, `_ga_6LHR66CDJ4`) sættes — jf. §2 række 23. At cronen tier, er dens kontrakt: uden klient-id sendes ingen hændelse, fordi et opfundet `client_id` ville skabe en NY bruger i GA hver gang og gøre tallene værre, ikke bedre. **Følgen, der skal huskes, når GA læses:** ansøgninger fra webinarvejen tælles ikke i GA. Meta får dem derimod (§4b, `meta_haendelser`: started 6, submitted 5, kvalificeret 3, booket 1), fordi Meta-vejen ikke kræver en cookie. **Hvad der kan afgøre det:** cross-domain-listen i GA4 dækker ikke `app.theboardroom.dk` (§4a) — måles den, og sættes den, ville et klient-id kunne følge med fra topix.dk.

---

## 6. Åbent — til beslutning

1. ~~Datasættets **«Automatisk websitematchning» står Til**~~ — **AFGJORT 21/9 (chatten): den forbliver slået til** (den står Til i dag; der skal intet gøres). Den kan sende krypteret e-mail/telefon fra formularer på siderne (fx topix.dk/webinar) uden om §1d, men virker kun for besøgende, der har givet samtykke, og §1g gælder: hellere lidt for lempelige end et stramt garn af frygt.
2. ~~Datasættet er **delt med virksomheden «Sentury ApS» (583122777451953)** — hvem er det?~~ — **LØST 21/9 22:40 (Jonas):** konsulenter, huset sparrer med. Jonas har styr på dem.
3. **Ingen domæne-tilladelsesliste** på datasættet.
4. Hvad datasættet **«The Boardroom — annoncer» (1259647116283770)** bruges til.
5. Privatlivspolitikkens **Circle.so- og Monday.com-linjer** (theboardroom.dk `PrivacyPolicy.tsx:92`, `:94`).
6. **LinkedIn- og GA4-hændelser fra platformen** (rækkefølgen i §1c) — ikke skitseret.
7. **LØST 21/9** (#1069 og rettelsen af videregiver-sætningen): Persondatateksten i platformen: tillægget om, at vi SENDER klik-id, eget id og user agent til Meta (§1e) — tekst til Jonas, før §4 går i drift. Sentry nævnes ikke i teksten.
8. `webinar_signup` på topix.dk/webinar/tak går ingen steder (#13) — skal den?
9. ~~**En nøgle uden adgang til datasættet meldes som kode 100 / `error_subcode` 33**~~ — **LØST 21/9 aften (udkast-meta-100-33).** Metas fejlreference bærer det: for 100 med `error_subcode` 33 står der «Unsupported post request. This error may occur if your access token is not added as a system user with appropriate permissions to the ad account that owns a Custom Audience.» ([error-reference](https://developers.facebook.com/docs/marketing-api/error-reference/)) — altså rettigheder, ikke payload. `doemMetaSvar` har nu `NOEGLE_SUBKODER = [[100, 33]]`: PARRET løftes til `ingen_noegle` (prøves igen, når adgangen gives), mens kode 100 alene bliver ved med at være `ugyldig`. Prøvet med den rigtige fejlkrop i `metaSend.test.ts`.
10. **Persondatateksten i platformen siger «Supabase (databasen, via Lovable Cloud, i EU)»**, mens theboardroom.dk's privatlivspolitik 21/9 fik «EU» fjernet igen, fordi regionen ikke er målt. Mål, hvor databasen faktisk ligger, og gør de to tekster ens.
11. **`referrer` er TOM på ansøgninger fra theboardroom.dk** — målt på begge prøver 21/9 (A og B, §4a). `document.referrer` når ikke frem til `/ansoeg`. Årsagen er **umålt**: enten en `Referrer-Policy` (fx `no-referrer` / `strict-origin`) eller `rel="noreferrer"` på ansøg-linket. Følgen: kolonnen `ansoegninger.referrer` kan ikke bruges til at afgøre kilden — `kilde` og `utm_*` kan.
12. **LØST 21/9 aften** (site-PR #2 `4a61b19` + pausen af de fire tags, §3). ~~**GTM-tagget på `/ansogning-modtaget` fyrede et FALSK `application_submitted` 21/9** — set i GA4-rapporten (til `G-6LHR66CDJ4`, og formentlig også som `Lead` til Meta, da de to tags deler trigger). Ingen ansøger kan nå den side fra platformen (§2 række 3), så hændelsen er ikke en ansøgning. Det er **konkret bevis for marketingmandens punkt 1** (§5): triggeren skal om, og `application_started` skal væk fra `cta_click`.~~ Siden er nedlagt (omdirigerer til «/»), og de fire tags er på pause — hændelsen kan ikke fyre mere. Bevist på det levende site: 0 træf i 26 filer.
13. ~~**Hovedlisten — hvem får webinarflowene?**~~ — **AFGJORT 22/9 ~14:10 (Jonas, ordret): «Hovedliste»-kravet BLIVER — tilmeldte, der ikke står på Hovedliste, skal IKKE ind.** Flowene `Wq3MkG` og `SDVvCW` kræver medlemskab af **Hovedlisten** OG samtykke, og det forbliver sådan. Målt efter webinaret 22/9: 384 tilmeldte, færre i flowene — tilsigtet. En webinartilmelding er ikke i sig selv samtykke til markedsføring, og der skal ikke bygges en vej, der lægger tilmeldte på Hovedlisten automatisk. Hændelserne (§2 rækkerne om fremmøde) sendes uændret for alle. Se OVERLEVERING «22. september (dagen)» §1.

14. **Prøvedelingen «Nicklas - Marketingkonsulenten» er LUKKET og må ikke genåbnes** — tokenet har stået i chatten 21/9 (delingen af `/webinar`, se CLAUDE.md's afsnit om delingen). Nicklas får et nyt link. Et lukket link svarer 403 «ukendt», og oprydningsjobbet (job 570) sletter deling og spor 12 måneder efter lukningen.

15. **Cron-vagten tæller vores egne beviskald.** `vagt_cron` tæller ALLE non-200-svar i `net._http_response` — også de manuelle prøvekald, vi selv sender fra SQL editoren. Målt 21/9: 1×400 + 1×404 kl. 18:07 (STRIKS-modprøven, §4a) og 2×403 kl. 22:07 — alle fire er vores egne beviser, ikke fejl i drift. Vagten bør kun tælle **planlagte jobs**; ellers vænner vi os til at overse den, og så tier den dagen, noget faktisk går galt.
    **Reconen (B, 21/9 aften, `~/Downloads/recon-cron-vagt.md`):** den gældende `vagt_cron` (`20260916170000_vagtens_samlemail.sql:114`) kobler et svar i `net._http_response` til den cron-kørsel, der startede ≤ 2 min før (`:252–258`) — **rent tidsligt**. Et manuelt kald arver derfor et jobs id og tælles med i `v_jobs_ikke_200`, hvis tærskel er ≥ 2. `kald_edge` returnerer `net.http_post`s id, som ER `net._http_response.id`, men ingen gemmer det. **Rettelsen (onsdag):** cron-kaldene gemmer id'et, og vagten tæller kun dem. Mønstret findes allerede i huset: `meta_hentning_vagt`.

---

## 7. Nøgler og id'er (kun navne — værdier er secrets)

| Navn | Hvor | Til hvad | Status 21/9 |
|---|---|---|---|
| `META_ADS_TOKEN` | `_shared/metaAdsToken.ts:34` | Marketing API (læsende) | ikke sat |
| `META_CAPI_TOKEN` | `metaAdsToken.ts:36` (nødnavn) | bærer i dag Marketing API-tokenet (`ads_read`) | i drift som nødnavn — røres ikke (§4) |
| `META_AD_ACCOUNT_ID` | `meta-annoncer-cron` | `act_<id>` | skal være sat |
| `META_SEND_TOKEN` | `_shared/metaSend.ts:57` (navnet), læst KUN i `_shared/metaSendAfsendelse.ts` | Conversions API, datasæt 858180112996496 | sat i Lovable af Jonas 21/9 aften; bevist i brug 16:13 (status 200, `events_received: 1`) |
| GTM `GTM-NL33PM5M` / GA4 `G-6LHR66CDJ4` | theboardroom.dk (`~/Projekter/theboardroom-topix/index.html`) | — | i drift |
| GTM `GTM-57M8R72D` / GA4 `G-9S4NL9FKGK` | topix.dk (`~/Projekter/topix-reimagined/index.html`) | — | i drift |
| LinkedIn partner `7995353`, TikTok `CVKMIDBC77U1BR7NB7MG`, Stape `nofikexx.topix.dk` | kun i GTM-containerne | — | i drift via GTM |
| `GA4_SEND_SECRET` | `_shared/gaSend.ts` (navnet), læst KUN i `_shared/gaSendAfsendelse.ts` | Measurement Protocol mod `G-6LHR66CDJ4` | **oprettet af Jonas i GA4 21/9 aften** (web-strømmen `G-6LHR66CDJ4`) og **sat i Lovable som `GA4_SEND_SECRET`**. **Værdien har stået i chatten 21/9 — skal skiftes ud** (lav prioritet: en Measurement Protocol-nøgle kan kun SENDE hændelser, ikke læse data). Sat på ny ~21:00 med den værdi, DebugView beviste (§4a) |
| `KLAVIYO_API_KEY` | `_shared/klaviyo.ts:50` | lag 2/3 | i drift |
| `VITE_SENTRY_DSN` | `src/main.tsx:22` | Sentry (kun PROD) | i drift |

---

## 8. Fejlsporet — aftenens fejl 21/9, og reglerne de gav

Fire af aftenens seks fejl handler om tracking; de to øvrige står i `docs/OVERLEVERING.md` under «21. september (aften)».

1. **Chatten påstod en måling, den ikke havde set (22:50).** Den skrev «Nu er det klart», som om «Aktivitetseksempler» var modtaget, og beskrev `lead_source: ewebinar` og platformens Leads fra app.theboardroom.dk. **Intet af det var set.** Rettet højt i næste svar, og A's prompt rettet, så det ikke blev bogført som en måling. Den rigtige eksport (22:49) viste noget andet — to kampagner — og beslutningen om at omdøbe Lead blev derefter **trukket tilbage**. **Regel: beskriv aldrig et skærmbillede eller en fil, der ikke er modtaget — og en beslutning, der hviler på en påstået måling, tages om, når målingen kommer.**
2. **Chatten antog, at GA-ejendommen «Topix DK» var den forkerte** (18:08). Den rummer begge strømme. Jonas rettede det.
3. **Pladsholderen `KALD_ID` i en SQL** (21:23) — chatten skulle have skrevet en forespørgsel, der fandt svaret selv. Rettet til `created > now() - interval '2 minutes'`.
4. **GA Realtid viste ikke Measurement Protocol-hændelserne**, selv om DebugView viste dem (20:57–20:59). **Regel: DebugView med `debug_mode` er beviset for MP; Realtid og dagens rapporter er det ikke.**
