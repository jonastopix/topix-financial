# Meta-annoncering i eget hus — fund, research og plan

Skrevet 29/9-2026 til 30/9-opstarten. Repoet (`/home/claude/topix-financial`, HEAD `e83cfcc`) er kun LÆST; intet er ændret, committet eller pushet. Prod-basen er IKKE målt i denne session — alle tal fra platformen er hentet fra dokumenterne i repoet og er markeret med kilde. Web-opslag er markeret med URL og hvor sikkert jeg kunne læse det.

Læseregel: **MÅLT** = står som målt i repoet/dokumentation med kilde. **SLÅET OP** = læst på en Meta-side i dag. **SEKUNDÆRT** = læst hos tredjepart, ikke hos Meta. **UMÅLT** = jeg har ikke set det.

---

## 0. Konklusion i tolv linjer

1. Huset har allerede halvdelen af motoren: annoncesporet fra annonce-id til ansøgning, daglig hentning af forbrug pr. annonce, og en afsendelse af egne konverteringer (Lead, Kvalificeret, Schedule, Purchase) til Meta. Alt er **læsende**; ingen kodesti kan ændre budget, status eller bud (`docs/webinaret-og-annoncerne.md:84-86`).
2. Det, der mangler, er (a) resultater og budgetter fra Meta (`actions`, adsæt-budgetter, kampagnemål), (b) skrivevejen (ændre status/budget), (c) en regelmotor med hårde lofter, (d) en rapport, (e) et kreativforslags-lag med godkendelse.
3. **Den afgørende begrænsning er ikke teknisk, den er statistisk.** Huset har 28 betalende medlemmer i alt, 14 ansøgninger med kilde pr. 28/9 (webinar 6, andet 5, direkte 3), og webinar 22/9 gav 6 ansøgere ud af 384 tilmeldte. Ingen enkelt annonce kan dømmes på ansøgning eller medlem. Automatisk optimering kan kun ske på det øverste led (tilmelding, evt. fremmøde); ansøgning og medlem er kalibrering på kampagne-/kanalniveau.
4. Meta Marketing API kan oprette og ændre kampagner, adsæt, annoncer, kreativer og budgetter, og Insights-API'et giver alt, der skal til. Adgang til egne annoncekonti kræver Standard Access, ikke App Review (SEKUNDÆRT, se §2.3 — skal bekræftes i app-dashboardet).
5. Rate limits er ikke flaskehalsen for et hus af vores størrelse. Meta-reglerne for ændringer (fx max 4 budgetændringer pr. adsæt pr. time, SLÅET OP) er en fordel: de tvinger motoren til at være langsom.
6. **Custom/Lookalike Audiences fra kundelister er en jura- og løftefælde hos os**, ikke en teknikfælde. Privatlivsteksten på topix.dk lover ordret «Selve din tilmelding deler vi ikke med Meta» (`docs/tracking.md:187`). En audience af webinartilmeldte bryder det løfte. 28 medlemmer og 14 ansøgere er desuden for få til et fornuftigt lookalike-frø.
7. Jeg anbefaler faserne: **0** data og loft (2 uger), **1** rapport + forslag, kun læsning (3-4 uger), **2** pause af dårlige annoncer inden for loft, automatisk (fra ~uge 6), **3** budgetflytning inden for godkendt ramme, **4** kreativforslag. Ingen budgetforhøjelse og ingen ny kampagne uden godkendelse før tidligst fase 3.
8. Konsulenten leverer tre ting, der ikke lader sig automatisere: kreativ strategi (hvilken vinkel, hvilket løfte, hvilken hook), målgruppeindsigt, og at bære ansvaret for at et eksperiment er lagt rigtigt op. Motoren kan overtage: rapportering, hygiejne, pauser, budgetflytning, ensartet navngivning, dokumentation.
9. Kritisk tidslinje: webinar 13/10, optakts-kampagner senest 6/10. Motoren når ikke at være aktiv til det. Fase 1 (rapport) kan være klar til 13/10-webinarets resultatlæsning.
10. Jonas skal selv oprette: system user + token med `ads_management` (aldrig i chat, kun i Lovable → Secrets), en `spend_cap` på annoncekontoen som hård ydre sikkerhed, og bekræfte hvem der er administrator af Business Manager (dokumenterne siger, at forrige token skulle godkendes af Morten).
11. Største risici: kontolukning ved politikbrud (ikke ved rate limit), tavs støj i små tal, og at motoren optimerer på et proxy-tal (tilmelding), der ikke følger medlemmer.
12. Jeg har ikke set kampagnestruktur, budgetter, kreativer eller konsulentens aftale i repoet. De skal Jonas hente i Ads Manager, før fase 0 er færdig (§5).

---

## DEL 1 — FUND I REPOET

### 1.1 Meta-komponenter, der findes i dag

| Hvad | Sted | Status/bemærkning |
|---|---|---|
| Hentning af annoncer, forbrug, visninger, klik pr. annonce pr. dag (level=ad, time_increment=1, 7 dage bagud, upsert på (ad_id, dato)) | `supabase/functions/_shared/metaAnnoncer.ts:35` (Graph v26.0), `:41` (DAGE_BAGUD=7), `:315-335` (INSIGHTS_FELTER + insightsUrl), `:338` (kontoUrl) og `supabase/functions/meta-annoncer-cron/index.ts` | I drift, cron 03:33 UTC + vagt 04:33 (`docs/webinaret-og-annoncerne.md:397-399`). Kun læsning. |
| Tabeller `meta_annonce` (aktuel beskrivelse, tekst, billede, video, link) og `meta_annonce_dag` (forbrug i øre, visninger, klik, link_klik, rækkevidde, frekvens) | `supabase/migrations/20260919170000_meta_annoncer.sql:1-125` | Kobling til egne data: `utm_content` = `ad_id`, `utm_campaign` = `campaign_id` (`:19-21`). Historik kan ikke hentes bagud, hver dag uden cron er tabt (`docs/webinaret-og-annoncerne.md:84-85`). |
| Opslag der beviser koblingen mellem utm_content og Metas annonce-id | `supabase/functions/meta-annonce-opslag/index.ts` | I drift. |
| Token til Marketing API (kun læsning, `ads_read`) | `supabase/functions/_shared/metaAdsToken.ts:1-63` | **Bæres i dag under nødnavnet `META_CAPI_TOKEN`**; `META_ADS_TOKEN` er «ikke sat» (`docs/tracking.md` §7, tabellen; `docs/webinaret-og-annoncerne.md:88-91`). Værdien kan ikke hentes frem i Lovable; et nyt token krævede ny godkendelse hos Morten (`metaAdsToken.ts:17-19`). |
| Conversions API fra platformen: `meta-send-cron` sender Lead (`application_started`, `application_submitted`), «Kvalificeret» (custom), Schedule (første `book`), Purchase (første indgangsbetaling, `value` i kroner, DKK) | `supabase/functions/meta-send-cron/index.ts`, `_shared/metaSend.ts:210` (API v21.0), `:601` (Purchase-value), `:629` (HASHEDE_NOEGLER), `_shared/metaSendAfsendelse.ts:32`; beskrevet i `CLAUDE.md:114` | I drift. Bevist 22/9 14:03: started 6 · submitted 5 · kvalificeret 3 · booket 1 (`docs/tracking.md` række 22b). Purchase «mangler af den rigtige grund» (betaling 30-60 dage efter). Lead EMQ 8,5/10 efter trin 2 (`docs/tracking.md` §4c). |
| Spor og lås for afsendelsen | `supabase/migrations/20260921234000_meta_haendelser.sql:1-50`, `20260922050000_meta_haendelser_trin2.sql`; lås `app_config.meta_send_aktiv` | Standard false; tørkørsel som standard. Mønstret er genbrugeligt til skrivemotoren. |
| Annoncesporet på ansøgninger: `utm_*`, `fbclid`, `landing`, `referrer`, `fbp`, `fbc_cookie`, `meta_fravalg`, user agent | `supabase/migrations/20260921120000_ansoegninger_annoncespor.sql`, `20260922040000_ansoegninger_meta_udvidelse.sql`, `20260921233000_ansoegninger_user_agent.sql` | I drift. Ansøgeren kan bede sig fri (`meta_fravalg`). |
| Annoncesporet på webinartilmeldinger (`utm_source/medium/campaign/content/term`, `fbclid`, referrer, by, land, enhed) og `ad_id_udledt` | `supabase/migrations/20260919150000_webinar_annoncespor.sql`, `20260921130000_webinar_tilmeldinger_ad_id_udledt.sql` | MÅLT 19/9: 597 tilmeldinger, 586 personer, 11 distinkte `utm_content`, 3 `utm_campaign`, **581 med fbclid** (`20260919170000_meta_annoncer.sql:7-8`). |
| Kanalen ud af `utm_source` (fb → Facebook, ig → Instagram …) | `src/lib/webinar/annoncekilde.ts:22-40` | MÅLT 20/9: fb 358 · ig 60 · th 1 · an 1; «facebook» 182 (håndskrevet, ældre generation). |
| Kanoniske `url_tags` på alle annoncer (med id'er, ikke navne) | `docs/webinaret-og-annoncerne.md:392-396` | `utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}`. **Ikke arvet fra kampagne/adsæt; hver ny annonce skal have strengen selv** (`:395-397`). En motor, der opretter annoncer, skal sætte den, ellers dør sporet stille. |
| Pris pr. led (tilmelding, deltager, ansøgning, medlem), pr. annonce og samlet; «<5 personer» vises som antal, ikke pris; tæller/nævner over samme vindue | `src/lib/webinar/annoncepriser.ts:282-324` (TROVAERDIG_FRA = 5, STABIL_FRA = 25, `pris`, `kanStolesPaa`), `src/components/hjemmebane/annoncer/AnnoncepriserAfsnit.tsx`, `src/hooks/annonceforbrug.ts` | Genbrug direkte; Jonas' fund #1024 (pris fem gange for lav ved forskellige vinduer) er indbygget som regel. |
| Statistik og dom: Wilson-interval, «kan ikke afgøres» ved overlap, tre niveauer (observation/mønster/sammenligning), én ændring pr. runde, `maaForeslaas(felter, dom)` som port foran ethvert forslag | `src/lib/marketing/statistik.ts:57`, `maalingsdom.ts:83-145`, `minde.ts:108-157`, `marketingdom.ts:63`; beskrevet i `docs/marketingmotoren.md:311-361` | Bygget til Klaviyo-mails, men mønstret (og koden) er direkte genbrugeligt. **Lag 4 (agenten) er «IKKE BYGGET, ikke skitseret»** (`docs/marketingmotoren.md:276-283`). |
| Grundlag og udkastsværn til tekster (`MANGLER` som værdi, `KENDTE_TAL`, `FORBUD`, R-regler) | `src/lib/marketing/grundlag.ts:44-307`, `udkastVaern.ts:94` | Bør styre annoncetekst-forslag, som det styrer mailtekst. |
| eWebinar-tilmeldinger, fremmøde og dom (≥75 % = set) | `supabase/functions/ewebinar-webhook`, `_shared/webinarDom.ts`, `src/lib/webinar/dashboard.ts` | 22/9: 384 tilmeldte, 159 deltog (112 set, 47 delvist), 224 mødte ikke op (`docs/OVERLEVERING.md:9989-9995`). |
| GA4 Measurement Protocol fra platformen | `supabase/functions/ga-send-cron`, `docs/tracking.md` §4a | Kun for ansøgere med samtykke (`ga_client_id`). Webinarets ansøgere har intet GA-id (`docs/tracking.md` §5 punkt 10). |
| Tracking: pixler, GTM, Stape, samtykke | `docs/tracking.md` (538 linjer) | Det eneste tracking-dokument. Læs før enhver ændring i, hvad der sendes til Meta. |

### 1.2 Hvad der IKKE findes (målt ved søgning i repoet)

Søgning efter `custom.?audience|lookalike|advantage\+|adcreative|/campaigns|adsets` i `supabase/`, `src/`, `docs/` giver kun to irrelevante træf (en fejlreference i `metaSend.ts:53` og Klaviyo-kampagner). Dvs.:

- **Ingen skrivevej til Meta** (kampagne, adsæt, annonce, kreativ, budget, status). Bevidst: «Kun læseadgang» (`docs/webinaret-og-annoncerne.md:85-86`).
- **Ingen Custom Audiences, ingen Lookalikes.**
- **Ingen kampagnestruktur, budgetter eller kreativer i repoet.** Annoncenavne findes kun som eksempler («IMG | 08-kontoret-skaerm», «IMG | 11-maaneskin», `docs/webinaret-og-annoncerne.md:97, 138`). `docs/delingskreativ/` og `src/lib/delingskreativ.ts` er medlemmers delingsbilleder, ikke annoncer.
- **Ingen resultater/konverteringer fra Insights.** `INSIGHTS_FELTER` (`metaAnnoncer.ts:315-316`) har kun `spend, impressions, clicks, inline_link_clicks, reach, frequency`. Ingen `actions`, `cost_per_action_type`, `objective`, ingen adsæt- eller kampagnebudget, ingen breakdowns (placering, alder, køn, enhed).
- **Ingen historik over ændringer** i Ads Manager (budget-/statusskift), kun forbruget.
- **Ingen agent (lag 4).** Kun grundlag, evne (Klaviyo-motoren), dom og minde er bygget.
- **Konsulentens aftale, honorar og leverancer** står ikke i repoet. Jeg har ikke set dem.

### 1.3 Konsulentens rolle, som den fremgår

- Nicklas (ekstern marketingkonsulent; project-memory `people/marketing.md`) kører Meta-annoncerne og har oprettet brugerdefinerede konverteringer (`docs/tracking.md:191, 280-293`, `:475-508`).
- Han fik 21/9 et privat `/webinar`-link; det første blev lukket, fordi tokenet stod i chatten (`docs/tracking.md:507`). Han «follows the webinar numbers».
- Åbent kort til ham: `a22-kampagnernes-maal` (hvilke annoncer optimerer mod hvad, når målet skifter til platformens hændelser; `docs/tracking.md` §5 punkt 8; `docs/mangelliste.html:2533`, «egen timing»). `docs/opstart-30-09.md:148` bekræfter, at den ligger hos ham.
- Datasættet (858180112996496) er delt med Sentury ApS, «konsulenter, huset sparrer med» (`docs/tracking.md:494`).
- **UMÅLT:** om Nicklas og Sentury er samme aktør, hvad han koster, og om han har lov til at ændre budgetter.

### 1.4 Kampagnehistorik og tal (kun det, der er målt i repoet)

| Tal | Værdi | Kilde |
|---|---|---|
| Fire adsæt med mål «Leads»: forbrug | 7.547,78 + 4.626,03 + 1.786,78 + 2.966,14 = **16.926,73 kr.** (periode ikke angivet i dokumentet, derfor kan tallet ikke bruges som CPL uden en periode) | `docs/tracking.md:284-289` |
| Leads i Events Manager 24/8-20/9 | 356 (254 browser, 102 server) | `docs/tracking.md` §2d2 |
| Metas pris pr. lead | 150,74 kr. (webinar) / 58,19 kr. (VSL) | `docs/webinaret-og-annoncerne.md:142` |
| Vores pris pr. tilmelding, største annonce | 24 kr. (Metas «lead» ≠ vores tilmelding; Meta 257 mod vores 608 over hhv. 30 dage/siden 17/8) | `docs/webinaret-og-annoncerne.md:134-143` |
| Events Manager-oversigt | «5.456 kr. annonceudgifter påvirket af lav datakvalitet» | `docs/tracking.md:280` |
| To kampagner bag «Lead»: webinarkampagnen `120248713786520694` (server, Stape) og den direkte kampagne `120242386310830694` (browser, knapklik; sat på pause 21/9) | | `docs/tracking.md:63-70` |
| Tilmeldte pr. webinar | 22/9: 384; 13/10: 317-319 pr. 29/9 | `docs/OVERLEVERING.md:9989`, `docs/webinaret-og-annoncerne.md:320` |
| Fremmøde 22/9 | 159 af 384 (41 %), heraf set ≥ 75 %: 112 | `docs/OVERLEVERING.md:9989-9995` |
| Ansøgninger med kilde pr. 28/9 | webinar 6 · andet 5 · direkte 3 (14 i alt) | `supabase/migrations/20260928140000_ansoegninger_kilde_nyhedsbrev.sql:1` |
| Betalende medlemmer | 28 (21 i Stripe, 7 via e-conomic) | `docs/webinaret-og-annoncerne.md:427-428` |
| Indgangspris | 50.000 kr. normalt, 40.000 undtagelsesvis | `src/lib/indgangspris.ts:14-16, 46-50` |

**Regnestykke, skrevet ud (illustration, IKKE en måling):** Hvis vi tager 24 kr. pr. tilmelding (den største annonce) og 58 kr. som en højere case, og en tilmelding→ansøgning-rate på 6/384 = 1,6 % (webinar 22/9, kun de seks ansøgere fra 09:51-09:56; tallet er en nedre grænse, for ansøgninger kan komme senere): 24 / 0,016 = 1.500 kr. pr. ansøgning; 58 / 0,016 = 3.625 kr. Med indgangspris 40-50.000 kr. er selv en lav ansøgning→medlem-rate (fx 1 af 5) økonomisk sund, men **jeg har ikke set ansøgning→medlem-raten** (den kræver en måling i prod, se §5 punkt 6).

### 1.5 Historiske data, der kan bruges

| Datasæt | Hvor | Omfang | Egnet til |
|---|---|---|---|
| Webinartilmeldinger med annoncespor | `webinar_tilmeldinger` | ~600 ved 19/9, 384 til 22/9, ~319 til 13/10 | Pris pr. tilmelding pr. annonce, fremmøde pr. annonce (`set_procent`). Godt til øverste led. |
| Hændelsesrå | `webinar_haendelser` (rå JSON, idempotent) | alle beskeder siden 19/9 | Genberegning, hvis dommen ændres. |
| Ansøgninger med kilde og utm | `ansoegninger` (`kilde`, `utm_*`, `fbclid`, `indsendt_at`) | 14 pr. 28/9 | Kun kalibrering. For få til modellering. Kladder (`indsendt_at IS NULL`) skal filtreres (`docs/marketingmotoren.md:299-301`). |
| Beslutninger | `ansoegning_beslutninger` (`tal_med_dem`, `book`) | få | Kvalificeret/Schedule (allerede sendt til Meta). |
| Medlemmer | `company_perioder` art `indgang`, `companies` (ansøgning bliver virksomheden med samme id) | 28 | Purchase-hændelser og medlemsværdi. Alt for få til lookalike-frø. |
| Forbrug pr. annonce pr. dag | `meta_annonce_dag` | fra 17/8 (hentet i efterhånden), dagligt fra 21/9 (`docs/webinaret-og-annoncerne.md:83-86, 397`) | Alle regler. **Kun ad-niveau; ingen resultater.** |
| Klaviyo-spor | `klaviyo_spor`, mails og åbninger | | Ikke relevant for annoncer, men mønstret er det samme. |

Historik før 17/8 findes ikke hos os. Meta kan, ifølge SLÅET OP-kilderne nedenfor, kun levere totaler 37 måneder og en del breakdowns 13/6 måneder tilbage, så en engangs-hentning af hele kontoens historik i fase 0 er værd at gøre nu (§3, fase 0).

---

## DEL 2 — RESEARCH (opslag 29/9-2026)

### 2.1 Marketing API: hvad kan oprettes og ændres

- Kampagner, adsæt, annoncer, kreativer og budgetter kan oprettes og ændres via API (SEKUNDÆRT: [admanage.ai — Meta Ads API: Setup, Automation & Real Limits (2026)](https://admanage.ai/blog/meta-ads-api); den beskriver også automatiserede budgetjusteringer og pauser). Meta selv: [Marketing API-rate-limiting](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting/) forudsætter «write»-kald mod ad account, adsæt-budgetter osv.
- **Advantage+ er ændret i API'et.** Siden 29/5-2025 er der en samlet struktur: en kampagne går automatisk ind i «Advantage+»-tilstand, når budget-, målgruppe- og placeringsautomatik er slået til; `advantage_state_info` er et **read-only** felt (ADVANTAGE_PLUS_SALES/APP/LEADS/DISABLED). `smart_promotion_type` er udgået til oprettelse; `existing_customer_budget_percentage` udgået i v25.0. v24.0 (8/10-2025) forhindrede nyoprettelse af de gamle ASC/AAC-kampagner, og v25.0 (Q1 2026) forbyder det på alle versioner. Kilder: [ppc.land — unified API structure](https://ppc.land/meta-launches-unified-api-structure-for-advantage-campaigns/) og [ppc.land — deprecates legacy campaign APIs](https://ppc.land/meta-deprecates-legacy-campaign-apis-for-advantage-structure/) (SEKUNDÆRT; jeg har ikke fået Metas egen changelog-side læst).
- Metas Advantage+ betyder i praksis, at målgruppeindstillinger (lookalike, kundelister, detailed targeting) som standard er **forslag, ikke hårde begrænsninger**: [Jon Loomer — A Guide to Meta Ads Targeting in 2026](https://www.jonloomer.com/meta-ads-targeting-2026/) (SEKUNDÆRT, erfaren praktiker). Det mindsker værdien af audience-arbejde for et lille hus og øger værdien af signalkvalitet (CAPI) og kreativ.
- **Det API'et ikke kan / ikke skal:** Annoncer oprettet via API gennemgår samme annoncegodkendelse som i Ads Manager, og politikkerne gælder uændret (SEKUNDÆRT, [admanage.ai](https://admanage.ai/blog/meta-ads-api)). Faktura, betalingsmetode, kontoåbning og Business Verification foregår i Meta Business Suite/Business Settings, ikke som almindelig automatisering. Trusted brugerinterface-ting (fx nogle Advantage+-kreativfunktioner, hvis ikke i den valgte API-version) skal kontrolleres pr. version. **UMÅLT hos os:** hvilke felter i v26.0 der er tilgængelige for vores kontos mål (leads/webinar).
- **Versioner:** Meta versionerer og udfaser gamle versioner. Vores Insights-kode bruger v26.0 (`metaAnnoncer.ts:35`, kommentaren siger udgivet 29/7-2026), **afsendelsen bruger v21.0** (`metaSend.ts:210`). Jeg har ikke slået udløbsdatoen for v21.0 op. Det er en konkret ting at måle, inden fase 0 slutter: en udfaset version giver fejl uden for vores kontrol. (UMÅLT.)

### 2.2 Insights API

- Endpoint: `/act_{id}/insights` med `level`, `time_increment`, `fields`, `breakdowns`; vores kode bruger allerede `level=ad`, `time_increment=1` (`metaAnnoncer.ts:326-335`).
- Datagrænser og kvalitet (SLÅET OP, [Insights — Limits & Best Practices](https://developers.facebook.com/docs/marketing-api/insights/best-practices/)): Kaldene begrænses af rækkeantal og «data points»; overskridelse giver `error_code = 100 / subcode 1487534`. Anbefalinger: smalle datointervaller, få felter, undgå højkardinalitets-breakdowns. Asynkrone rapporter: POST returnerer `report_run_id` (udløber efter 30 dage), poll til «Job Completed». **Fra 10/6-2025** følger API-svar Ads Managers adsæt-niveau-attribution; parametrene `use_unified_attribution_setting` og `action_report_time` ignoreres.
- **Attributionsvinduer (SEKUNDÆRT, [ppc.land](https://ppc.land/meta-restricts-attribution-windows-and-data-retention-in-ads-insights-api/)):** fra 12/1-2026 returnerer API'et ikke længere 7d_view og 28d_view. Tilbage: 1d_click, 7d_click, 28d_click, 1d_engaged_view, 1d_view. Historikgrænser: unikke-tællinger og timevise breakdowns 13 måneder; frekvens-breakdowns 6 måneder; totaler 37 måneder. Det betyder: **gem hver dag i egen tabel** (som vi allerede gør for forbrug), for hentning bagud er begrænset.
- **Konsekvens for os:** Metas egne «resultater» er attribueret med Metas modeller og vinduer, og målt på Metas «Lead» (ikke vores tilmelding, jf. §1.4). Vores egen kobling `utm_content` → tilmelding → ansøgning → medlem er den sikreste sandhed; Insights bruges til forbrug, leverance og Metas egen opfattelse af resultater.

### 2.3 Adgangsniveauer, tokens, review

- **System user-tokens** (SLÅET OP, [Install Apps, Generate, Refresh and Revoke Tokens](https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens/)): en system user skal tilhøre samme Business Manager som appen; tokens genereres via API med `appsecret_proof`, `business_app`, `scope`. To typer: **ikke-udløbende** (højere risiko ved lækage) eller **60 dage** (anbefales for at begrænse lækage). «Only apps with Ads Management API standard access and above can be installed.» Scopes: `ads_management`, `ads_read`, `business_management` m.fl. Anbefaling: 60-dages-token med automatisk fornyelse, ikke ikke-udløbende, og aldrig i chat.
- **Standard vs Advanced (SEKUNDÆRT — tal og krav fra praktikere, ikke Metas egen tabel, som jeg ikke fik læst):**
  - Standard Access dækker egne annoncekonti og udvikling/test; Advanced Access er til tredjeparters konti og kræver App Review + Business Verification ([singhamandeep.com — Facebook Ads API Permission App Review 2026](https://singhamandeep.com/facebook-ads-api-permission-app-review/)).
  - «Ads Management Standard Access»-featuren (som hæver rate-limit-tieren) krævede historisk et antal succesfulde API-kald og lav fejlrate; kravene er ændret mindst én gang ([Meta-blog: Update to Ads Management Standard Access](https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/), hvor jeg kun fik overskriften; [Meta-forum-tråd](https://developers.facebook.com/community/threads/691016324664624), hvor et Meta-medlem foreslår «1000+ kald med <5 % fejl», mens en bruger brugte ≥2000). Den ene sekundære kilde nævner maj 2026: ≥500 kald i seneste 15 dage og <15 % fejl over de seneste 500 kald. **Tallene er uens og skal læses i app-dashboardet.**
  - **For os:** vi forvalter kun egne konti. Så Advanced Access og App Review er sandsynligvis ikke nødvendige; Business Verification kan alligevel blive krævet af andre grunde (fx Custom Audience-vilkår, systembrugere). **Jeg har ikke set Metas egen tekst; Jonas skal bekræfte i Business Settings → App → Access Levels.**
- **Rate limits (SLÅET OP, [Marketing API Rate Limiting](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting/)):**
  - Development tier: max score 60, decay 300 s, blokering 300 s. Standard tier: max score 9000, decay 300 s, blokering 60 s. Læsekald = 1 point, skrivekald = 3.
  - Business Use Case pr. time: `ads_management`: Standard 100000 + 40 × aktive annoncer; Development 300 + 40 × aktive annoncer. `ads_insights`: Standard 190000 + 400 × aktive annoncer − 0,001 × brugerfejl; Development 600 + 400 × aktive annoncer − 0,001 × brugerfejl.
  - Mutationer: 100 kald pr. sekund pr. app+annoncekonto.
  - Kritiske fejlkoder: 17/2446079 (bruger-request-grænse), 17/1885172 (konto-spend-limit, max 10 ændringer pr. dag), **613/1487632 (adsæt-budget, max 4 ændringer pr. time)**, 613/5044001 (QPS), 80000-80004 (Business Use Case).
  - Headere at logge: `X-Ad-Account-Usage`, `X-Business-Use-Case`, `X-FB-Ads-Insights-Throttle`.
  - **Vurdering:** med ~10-50 annoncer og én kørsel om dagen er vi langt under. Development-tieren (300 + 40 × aktive annoncer pr. time) rækker også til vores brug; Standard er ikke nødvendig for kapaciteten.
- **Kontolukning/restriktion ved API-brug:** Jeg har ikke fundet en Meta-tekst, der siger, at rate limits eller API-brug i sig selv giver kontolukning. Den sekundære kilde ([admanage.ai](https://admanage.ai/blog/meta-ads-api)) peger på annoncepolitik og forkert opførsel som risikoen, ikke teknik (lav-middel sikkerhed; UMÅLT). Den reelle risiko er: (1) politikbrud i automatisk genererede tekster (finansielle løfter, «personlige attributter»), (2) uventet aktivitetsmønster (mange nye annoncer pludseligt, hyppige redigeringer), (3) betalingsfejl, (4) kompromitteret token. Se §3 risici.
- **Læringsfasen (SEKUNDÆRT, [Blip](https://withblip.com/blog/meta-ads-learning-phase-bulk-editing/), leverandør med kommerciel interesse):** ca. 50 optimeringshændelser pr. adsæt pr. uge for at forlade læring; budgetforhøjelse >20 % i ét skridt, ændring af optimeringshændelse, målgruppe eller tilføjelse/fjernelse af kreativ nulstiller læring. Regelmotoren skal derfor bruge små skridt (≤20 % pr. 3-4 dage) og respektere, at vores hændelsesvolumen pr. adsæt er langt under 50 pr. uge for bagvedliggende mål (ansøgning/medlem).

### 2.4 Custom Audiences, Lookalikes, hashing, samtykke

- **Hashing (SLÅET OP, [Customer Information Parameters](https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/customer-information-parameters)):** `em`, `ph`, `fn`, `ln`, `db`, `ge`, `ct`, `st`, `zp`, `country` skal SHA-256-hashes efter normalisering (e-mail små bogstaver og trimmet; telefon med landekode og uden tegn). **Må ikke hashes:** `client_ip_address`, `client_user_agent`, `fbc`, `fbp`, `lead_id`, m.fl. Det er præcis, hvad `HASHEDE_NOEGLER` og `findForbudteNoegler` allerede håndhæver for CAPI (`metaSend.ts:629-678`).
- **Kundelister via API (SEKUNDÆRT, [stape-io/meta-custom-audiences-tag](https://github.com/stape-io/meta-custom-audiences-tag)):** schema med `EMAIL`, `PHONE`, `FN`, `LN` (m.fl.), max 10.000 medlemmer pr. request, token med `ads_management` tilknyttet den annoncekonto, der ejer audience. Det er en tredjeparts-implementering, ikke Metas dokumentation.
- **UMÅLT / IKKE LÆST:** Metas «Customer List Custom Audiences Terms» (`https://www.facebook.com/legal/terms/customaudience`) — siden er blokeret for min hentning (robots). Den er den bindende tekst om notice/samtykke, og Jonas (eller jeg i næste session via anden vej) skal læse den, før nogen liste uploades. Ligeledes har jeg ikke læst Metas egne krav til frøstørrelse for Lookalikes (jeg husker «mindst 100 personer fra ét land», men det er UDEN kilde og skal bekræftes).
- **Jura, EU/Danmark (delvist SLÅET OP):**
  - Datatilsynet (2023, en onlineportal): virksomhed og Meta Ireland blev **fælles dataansvarlige** ved brug af Facebook Business Tools; aftalen var utilstrækkelig (rollefordeling, tredjelandsoverførsel); påbud om at rette op eller ophøre; portalen ophørte ([Dansk Erhverv om afgørelsen](https://www.danskerhverv.dk/presse-og-nyheder/nyheder/2023/juni/datatilsynet-alvorlig-kritik-og-pabud-til-onlineportal-for-brug-af-facebook-business-tools/)). Det gælder Business Tools i almindelighed og er relevant, fordi vi allerede sender hashede e-mails m.m. til Meta.
  - VG Bayreuth 8/5-2018 (Tyskland, ældre, ikke bindende i DK): SHA-256-hashing er ikke anonymisering; upload af kundelister til Custom Audiences krævede samtykke ([SpiritLegal-referat](https://www.spiritlegal.com/en/news/details/e-commerce-retail-facebook-custom-audience-not-allowed-without-consent.html)). Illustration af juridisk risiko, ikke gældende dansk ret.
  - Datatilsynets side «Myter om GDPR» siger intet specifikt om kundelister/Custom Audiences (jeg tjekkede; UMÅLT, om andre vejledninger gør).
- **Jonas' tidligere beslutning:** ingen jurist; hellere lempeligt end frygtsomt; han bærer ansvaret (`docs/tracking.md` §1e/§1g; project-memory `areas/tracking.md`). Den beslutning gælder eksplicit tracking og CAPI. **Jeg anbefaler ikke at udvide den til kundelister uden to konkrete ting:**
  1. **Vores egen tekst lover det modsatte for webinartilmeldte.** topix.dk's privatlivspolitik (site-PR #3, ordret citat i `docs/tracking.md:187`): «Selve din tilmelding deler vi ikke med Meta.» En audience bygget af tilmeldte eller deltagere (159 fremmødte 22/9) bryder løftet, uanset hashing. Beslutningen «Webinarhændelser BYGGES IKKE» (`CLAUDE.md:114`) er truffet på et andet grundlag (manglende user agent), men lander samme sted.
  2. **Ansøgere og medlemmer er allerede i CAPI** (persondatateksten dækker det, `docs/tracking.md` §1e). En Custom Audience af dem er teknisk samme data, men et andet formål (målgruppe/lookalike i stedet for konverteringssignal). Teksten skal dække det, før det sker.
- **Størrelse:** 28 medlemmer og 14 ansøgere giver et svagt lookalike-frø, og Advantage+ behandler alligevel målgruppeinput som forslag (§2.1). Min anbefaling er derfor **ikke at bygge audience-funktioner i fase 1-3**. Det, der giver Meta mere at lære af, er flere og bedre CAPI-hændelser (det findes), ikke lister.

### 2.5 Attribution efter iOS 14 og samtykke

- Metas egne tal er modelbaserede. Vi har desuden samtykkestyret pixel: `ad_storage: denied` som default efter 21/9, så pixel-tællinger falder (`docs/tracking.md` §3, tabellens række 1). Meta oplyser «Hændelsesdækning 0 %» og «opfylder ikke anbefalede fremgangsmåder» for deduplikering (`docs/tracking.md` §2d2).
- **Vores styrke er første-parts-attribution:** annonce-id i URL'en (`{{ad.id}}`) → eWebinar-tilmelding → e-mail → ansøgning → betaling. 581 af 597 tilmeldinger bar `fbclid` (MÅLT 19/9), og e-mail-koblingen mellem tilmelding og ansøgning er allerede bygget (`docs/webinaret-og-annoncerne.md:56-58`). Den attribution er uafhængig af cookies og iOS. Begrænsning: den ser kun mennesker, der klikker og tilmelder sig med URL'ens parametre; den ser ikke visningseffekt uden klik.

---

## DEL 3 — PLAN: annoncemotor med menneske i løkken

### 3.0 Grundprincipper (arvet fra huset)

1. **Motor før flade** (project-instruktionen): rene, testede funktioner først, derefter UI.
2. **Lag i samme bur som marketingmotoren** (`docs/marketingmotoren.md`): grundlag → hændelser → motor → agent → returdata → dom. Annoncemotoren bliver et selvstændigt parallelspor, der genbruger dom (Wilson, niveauer, `maaForeslaas`) og mønstret tørkørsel + lås + spor.
3. **Bucket B** for cron, **Bucket A** for godkendelser fra rådgiverfladen (CLAUDE.md, «Nye edge functions — påkrævet mønster»). Et nyt cron-job kræver eksplicit deploy fra Lovable build-chat og et bevis (nyt felt i svaret, ny tabelrække), ikke bare merge (CLAUDE.md, «Deployment af edge functions»).
4. **Et felt, vi ikke selv sætter, er en observation, aldrig en nøgle** (CLAUDE.md, tre principper): Metas `status`, `effective_status`, `objective` læses ved hver kørsel, aldrig antaget.
5. **Skrivelås:** ny `app_config.annoncemotor_skriv_aktiv` (standard false), samme mønster som `meta_send_aktiv`. Uden låsen: tørkørsel, der skriver «ville have gjort X» i sporet.
6. **Ydre hårde lofter, som koden ikke kan omgå:** (a) `spend_cap` på annoncekontoen (kontoUrl læser den allerede, `metaAnnoncer.ts:338-341`); (b) dagsbudget-lofter pr. kampagne sat i Ads Manager; (c) vores egne lofter i tabellen `annoncegraenser` (kun Jonas kan ændre; RLS admin-only som `app_config`). Koden må aldrig have en sti, der hæver et loft.

### 3.1 Arkitektur

```
[Meta Insights]  ─daglig─▶  meta_insights_dag  (adset+ad, actions, cost per action, budget snapshots)
[Meta struktur]  ─daglig─▶  meta_struktur      (kampagne/adsæt/annonce: status, effective_status, budgetter, mål)
[egne data]      ─join──▶   webinar_tilmeldinger (utm_content) → ansoegninger (e-mail) → companies/company_perioder
                                  │
                                  ▼
                       annoncedom (ren funktion, testet)   ← genbruger statistik.ts / maalingsdom.ts / minde.ts
                                  │
                ┌─────────────────┼─────────────────────┐
                ▼                 ▼                     ▼
         rapport (mail/flade)  forslag (annoncemotor_forslag)  spor (annoncemotor_spor: FØR/sendt/EFTER)
                                  │  godkend (Bucket A, rådgiver)
                                  ▼
                       skrivevej til Meta (kun med lås; tørkørsel som standard)
```

Tabeller (skitse, ikke migration): `meta_struktur` (snapshot pr. dag: id, type, navn, status, effective_status, dagsbudget/livstidsbudget, mål, optimeringsmål, bid strategy, læringsstatus hvis tilgængelig), `meta_insights_dag` (udvid `meta_annonce_dag` med `actions` som jsonb + udvalgte kolonner: `leads`, `cost_per_lead`), `annoncegraenser`, `annoncemotor_forslag` (art, mål-id, FØR-værdi, ny værdi, begrundelse, dom, status: foreslået/godkendt/afvist/udført/fejlet, godkendt_af, godkendt_at), `annoncemotor_spor` (som `klaviyo_spor`: FØR, sendt, EFTER, Metas svar, afvigelse).

### 3.2 Faser

**Fase 0 — Grundlag og loft (uge 1-2, uden skrivning)**
- Jonas: hent kampagnestruktur, budgetter, mål og kreativer ud af Ads Manager (eksport) og læg dem i repoet under `docs/annoncer/` (en indgang, ikke en samtale; project-instruktionen: «Intet må leve kun i chatten»).
- Udvid `INSIGHTS_FELTER` med `actions`, `cost_per_action_type`, `objective` (kampagneniveau) og hent også adsæt-budgetter/-status. **Bevis i kørslen:** nyt felt i svaret og en række i ny tabel (CLAUDE.md-mønstret).
- Engangshentning af al tilgængelig historik pr. dag fra Meta (før den forsvinder ved retention-grænser; §2.2), og en kontrol af, at `meta_annonce_dag` ikke har huller (`meta_hentning_vagt` findes).
- Ret navngivning: `META_ADS_TOKEN` sættes, nødnavnet `META_CAPI_TOKEN` ryddes op (`metaAdsToken.ts:30-38`).
- Beslut lofterne (§3.4) og få dem ind i `annoncegraenser`.
- Måling af to ting, der kan ændre planen: (a) ansøgning→medlem-raten pr. webinar; (b) hvor mange tilmeldinger/uge hver aktiv annonce faktisk giver (§3.5).
- Slå udløbet af v21.0 (CAPI) op, og find ud af hvilken API-version Nicklas' værktøjer bruger.

**Fase 1 — Rapport og forslag, kun læsning (uge 3-6)**
- Daglig rapport (mail til `driftModtager()`-mønstret, plus flade som `AnnoncepriserAfsnit`): forbrug, visninger, klik, tilmeldinger, deltagelse, ansøgninger og medlemmer pr. annonce, adsæt og kampagne over SAMME vindue (mønstret fra #1024/#1033); «for få» ERSTATTER procenten under 5 personer.
- Annoncedom (rene funktioner, test først): pr. annonce klassifikation `for_tidligt · i_orden · svag · udmattet` med Wilson-interval og «kan ikke afgøres» ved overlap. Forslag skrives, udføres ikke.
- Alarmer (ikke ændringer): annonce uden gyldige `url_tags` (sporet dør stille), forbrug uden tilmeldinger i N dage, frekvens over grænse, `effective_status` ≠ ACTIVE selvom status = ACTIVE, forbrug tæt på loft.
- Succeskriterium: Jonas læser rapporten ugentligt og kan forklare de 3 vigtigste tal uden Nicklas. Konsulenten bliver stadig brugt.

**Fase 2 — Automatisk pause inden for hårde lofter (fra ca. uge 6-8; tidligst efter to webinarer med data)**
- Kun **pause** og kun af annoncer med **statistisk nok data** (definition §3.3). Ingen budgetændring, ingen ny annonce.
- Hver pause: forslag → tørkørsel → (første måned) menneskelig godkendelse i fladen (Bucket A) → udførelse med FØR/EFTER-spor og verifikation ved genlæsning (`effective_status` = PAUSED). En pause kan altid ophæves med ét klik (samme skrivevej).
- Max pauser pr. dag og max andel af aktive annoncer pr. kampagne (loft), så motoren aldrig slukker hele kampagnen.

**Fase 3 — Budgetflytning inden for godkendt ramme (fra ca. uge 10+)**
- Motoren flytter budget **mellem eksisterende adsæt** inden for kampagnen; total forbliver uændret. Ingen budgetforhøjelse. Max ændring ≤20 % pr. skridt og ≥3 dage mellem skridt pr. adsæt (læringsfase-hensyn, §2.3), og under Metas grænse på 4 adsæt-budgetændringer pr. time.
- Budgetforhøjelse (samlet) og nye kampagner kræver godkendelse hver gang, også efter fase 3. Jonas kan i en senere fase give en skriftlig blanket-ramme (fx «+20 % op til X kr./dag hvis pris pr. tilmelding < Y»), men det er hans beslutning, ikke en default.

**Fase 4 — Kreativforslag (parallelt fra fase 1, men uden tilslutning til API)**
- Genereret tekst (overskrift, primærtekst, beskrivelse, CTA) skrevet ud fra `grundlag.ts` og kontrolleret af `udkastVaern.ts` (samme R-regler som mail; ingen opfundne tal, `MANGLER` som værdi). Output er **udkast i en flade til godkendelse**, ikke et kald til Meta. Først når Jonas godkender og en fase-4b-lås er slået til, oprettes annoncen som PAUSET i Meta med korrekt `url_tags`, og Jonas trykker aktiver selv.
- Billeder/video: motoren kan foreslå koncept og layout (Canva-flow ligger uden for repoet), men produktionen er menneskelig. Motoren må ikke generere «billeder af mennesker» eller falske udtalelser (annoncepolitik + `TESTIMONIALS`-reglen i `grundlag.ts:174-204`).
- **Politikfilter før udkast:** finansielle løfter, garantier om afkast/besparelse, «du» + personlige attributter, før/efter, urealistiske krav (Metas annoncepolitik; UMÅLT hos os, skal slås op, når fase 4 bygges).

**Fase 5 (valgfri, ikke anbefalet endnu): Audiences.** Kræver læsning af Metas Custom Audience-vilkår, en tekstændring i persondatapolitikken, og en beslutning om webinarløftet (§2.4). Jeg foreslår at vente til efter fase 3 og til der er flere end ~100 medlemmer/ansøgere.

### 3.3 Regler for pause, budgetflytning og stop

Alle regler er **rene funktioner** med tests; parametrene bor i `annoncegraenser` og ændres kun af Jonas.

1. **Ingen dom før mindstedata.** Pr. annonce/adsæt kræves fx ≥ 3 dages levering **og** mindst *N* klik/tilmeldinger; tallene er en parameter, ikke et gæt. Standardforslag: mindst 5 tilmeldinger (husets eksisterende `TROVAERDIG_FRA = 5`, `annoncepriser.ts:282`) og ≥ 1.000 visninger før en annonce kan kaldes «svag». Under det: «for tidligt», ingen handling.
2. **Sammenlign på det øverste led** (tilmelding og evt. fremmøde ≥75 %). Ansøgning og medlem indgår kun som **oplysning** ved siden af og som **veto**: en annonce, der har givet ≥ X tilmeldinger og 0 ansøgninger over ≥ 2 webinarer, får en flaget «overvej», ikke en automatisk pause (for få tal til mere).
3. **Wilson-overlap = «kan ikke afgøres»** (`statistik.ts:57-86`). En pause kræver, at den svage annonces interval for pris/andel ligger **helt** ved siden af mindst én bedre annonce i samme adsæt eller kampagne.
4. **Én ændring pr. runde** (`maalingsdom.ts:121`, `MAKS_AENDRINGER_PR_RUNDE = 1`) og ventetid mellem ændringer i samme adsæt: aritmetik, ikke forsigtighed (`docs/marketingmotoren.md:344-348`).
5. **Dagligt forbrugsloft og pausesikring:** hvis dagens forbrug overstiger dagsloft × 1,0 → alarm, ikke handling (kontoens `spend_cap` og Ads Managers egne lofter er den egentlige bremse). Hvis forbrug > 0 og 0 leveringsdata i ≥ 24 timer (sporing brudt) → alarm til `driftModtager()`, ingen budgetflytning (aldrig optimere på et brudt signal).
6. **Kampagnefreeze omkring webinardatoer:** ingen ændringer de 48 timer før og de 24 timer efter et webinar (fremmødet er stadig under opgørelse; `docs/marketingmotoren.md` mønstret «en periode der ikke er gået, er ikke en periode»).
7. **Tællerne og nævnerne dækker samme vindue** (`annoncepriser.ts:151`, `afkort`) — ellers kan motoren ikke dømme.
8. **Nødstop:** `annoncemotor_skriv_aktiv = false` stopper al skrivning fra næste kørsel; en «pause alt»-knap er en separat Bucket A-handling, kun for Jonas.

### 3.4 Lofter, som Jonas skal sætte (skema — værdierne er hans)

| Parameter | Hvad | Hvor håndhæves |
|---|---|---|
| Samlet dagsbudget for kontoen | max kr./dag | Ads Manager (kontobudget/spend cap) + `annoncegraenser` |
| Samlet månedsloft | max kr./md | `spend_cap` på kontoen |
| Max dagsbudget pr. kampagne / adsæt | kr. | `annoncegraenser`, koden afviser højere |
| Max ændring pr. skridt | % (foreslået ≤ 20) | `annoncegraenser` |
| Min. dage mellem ændringer pr. adsæt | dage (foreslået ≥ 3) | motoren + Metas limit på 4/time |
| Max pauser pr. dag / max andel aktive annoncer | antal/% | motoren |
| Max pris pr. tilmelding og pr. ansøgning før alarm | kr. | rapporten; ingen automatik ud over alarm i fase 1-2 |
| Frys-vinduer | timer før/efter webinar | motoren |

### 3.5 Statistisk støj og datamængde — skrevet ud

Antagelser (alle MÅLT i repoet, se §1.4): 384 tilmeldte, 159 fremmødte (41 %), 6 ansøgere (1,6 % af tilmeldte, 3,8 % af fremmødte), 28 betalende i alt.

- Et webinar med ~350 tilmeldte og 10 aktive annoncer giver ~35 tilmeldte pr. annonce. Forventet ansøgere pr. annonce: 35 × 0,016 = **0,56**. Forventet medlemmer pr. annonce: ≪ 0,5. En annonce kan altså ikke måles på medlemmer, og næsten ikke på ansøgere.
- Til at skelne to annoncer med ansøgerrate på fx 1,6 % og 3,2 % kræves (grovt, to-sidet, 80 % power, normaltilnærmelse) ca. 2 × 800 tilmeldte pr. arm = cirka 1.600 tilmeldte til ét sammenligningspar. Det er 4-5 webinarer. (Regnestykke: n ≈ (z_α/2 + z_β)² × [p₁(1−p₁) + p₂(1−p₂)] / (p₁ − p₂)² = (1,96 + 0,84)² × [0,016×0,984 + 0,032×0,968] / (0,016)² ≈ 7,84 × 0,0467 / 0,000256 ≈ 1.430 pr. arm.) Wilson-dommen fra lag 6 vil på samme data sige «kan ikke afgøres»; det er den rigtige dom.
- På øverste led (pris pr. tilmelding, fremmøde) er der derimod nok data: en annonce med 1.000 klik og 5 % tilmeldingsrate giver 50 tilmeldinger. **Motoren skal derfor optimere på pris pr. tilmelding og fremmøde, og overvåge ansøgning/medlem som langsom kalibrering.**
- **Fare:** at optimere på billig tilmelding kan give tilmeldte, der ikke møder op eller ikke ansøger. Modforanstaltning: (a) fremmøde (≥75 % set, `webinarDom.ts`) som kvalitetsled i selve dommen; (b) et månedligt kalibreringsudtræk pr. kampagne af ansøgning/medlem pr. tilmeldt; (c) et manuelt kreativt review hver gang en kampagne skifter vinkel.

### 3.6 Risici

| Risiko | Sandsynlighed/omfang | Modforanstaltning |
|---|---|---|
| Kontolukning/restriktion pga. annoncepolitik i genererede tekster | Lav-middel, høj konsekvens (annoncekontoen er hele kanalen) | Ingen tekst går direkte til Meta uden menneskelig godkendelse; politikfilter; log af alle tekster; kun PAUSET oprettelse. |
| API-misbrug (bulk, hurtige ændringer, fejlrate) | Lav ved vores volumen; **ingen kilde, der lover, at det ikke kan give restriktion** (UMÅLT) | Langsom motor (≤1 skrivning pr. adsæt pr. dag), fejlrate-log, backoff, `X-Business-Use-Case`-header logges. |
| Token lækket (har allerede stået i chatten for andre nøgler, `docs/tracking.md:507`, §7) | Middel | Aldrig i chat; 60-dages token med rotation; egen secret `META_ADS_WRITE_TOKEN` adskilt fra `META_SEND_TOKEN` og læse-tokenet (samme adskillelseskrav som `metaTokenAdskillelse.guard`); minimal scope; system user kun på én annoncekonto. |
| Motoren optimerer på støj (små tal) | Høj | §3.3 regel 1-4; «for få» ERSTATTER procenten; observation-niveau har budget 0 (`docs/marketingmotoren.md:347-348`). |
| Proxy-optimering (billig tilmelding uden medlemmer) | Middel | §3.5. |
| Attributionsbrud (annonce uden `url_tags`; samtykke; fbclid mistet) | Høj — er allerede sket (`docs/webinaret-og-annoncerne.md:395-397`) | Alarm på annoncer uden gyldige tags; motoren sætter tags selv, når den opretter noget; ikke-dømte annoncer uden tags. |
| Læringsfasenulstilling pga. hyppige ændringer | Middel | ≤20 % og ≥3 dage (§2.3, sekundær kilde). |
| Konsulent-afhængighed og uklar ansvarsfordeling under overgangen | Middel | Overlap-periode; skriftligt hvem der må røre hvad (§4). |
| Jura ved audiences | Se §2.4 | Fase 5 er ikke med i planen. |
| Metas API-versioner udløber (v21.0 i CAPI) | Ukendt | Måles i fase 0. |
| Eget system: Merge udruller ikke edge functions | Kendt | Følg CLAUDE.md-processen (eksplicit deploy fra build-chat + bevis ved en kørsel). |

---

## 4. Ærlig vurdering: hvad konsulenten leverer, som er svært at automatisere

Det, jeg ikke kan vurdere: hvad Nicklas faktisk leverer i timer og resultater. Jeg har ikke set aftalen eller kampagnerne (§1.2). Derfor beskriver jeg kategorierne.

**Kan automatiseres godt (motoren overtager):**
- Rapportering, dagsoverblik, alarmer, navngivning, `url_tags`-hygiejne.
- Pause af tydeligt dårlige annoncer inden for lofter, når data findes.
- Budgetflytning i små skridt mellem eksisterende adsæt.
- Sammenkobling med egne konverteringer (ansøgning/medlem). Det kan en konsulent uden adgang til vores database slet ikke, og det er det, huset har opbygget siden 19/9. Her er huset foran typiske konsulenter.

**Kan hjælpes af motoren, men bør forblive menneskeligt:**
- **Kreativ strategi:** hvilken vinkel (pris, tid, tillid, jalousi over konkurrenter, socialt bevis), hvilket løfte, hvilken hook, og hvilken rækkefølge af budskaber der bygger tillid hos danske SMV-ejere. Sprogmodeller kan producere mange varianter og læse resultater, men de finder ikke selv en ny vinkel, der virker på et 350-personers publikum. Med få tal kan ingen algoritme lære det hurtigere end en person, der har set annoncer virke i andre brancher.
- **Målgruppe og placering:** i Advantage+-æraen er det mest kreativ og signalkvalitet, ikke audience-håndværk (§2.1); det svækker ikke konsulentens værdi, men flytter den til kreativ og offer.
- **Eksperimentdesign:** hvad man tester først, hvornår man dropper et eksperiment. Motoren har «én ændring pr. runde» og statistik; det er en bund, ikke en strategi.
- **Kundeindsigt:** hvad der bliver sagt i afklaringssamtaler, og hvorfor folk ikke ansøger. Det er Jonas' og Mortens viden, ikke en konsulents.
- **Kontoforhold:** kontakt til Meta-support, betalingsafvisninger, kontogennemgang ved afvisninger. Det er menneskeligt arbejde med Business Support.

**Vurdering:** motoren kan overtage det operative, og kan i praksis gøre den dyre konsulent overflødig som **operatør**. Den kan ikke gøre ham overflødig som **kreativ retning** uden at Jonas overtager den rolle. Jonas siger, at han vil køre det «100 % selv og datadrevet». Det er realistisk, hvis han (a) selv sætter kreativ retning eller køber enkeltstående kreativ sparring (ikke løbende honorar), og (b) accepterer, at datamængden gør, at en stor del af beslutningerne stadig bliver dømt med skøn, ikke med tal. Hvis han vil fjerne konsulenten helt, så gør det først, når fase 1 har kørt over to webinarer, og når kampagne- og kreativdokumentationen (§5 punkt 1) ligger i repoet. Sentury (§1.3) er en anden aktør, der har adgang til datasættet, og forholdet skal afklares, så vi ved, hvem der stadig kan røre kontoen efter overgangen.

---

## 5. Hvad Jonas skal skaffe (ingen tokens i chat; ind i Lovable → Cloud → Secrets)

1. **Ads Manager-eksport:** alle kampagner, adsæt og annoncer med mål, budgetter, målgrupper, placeringer og kreativer (tekst og billedfiler), samt en oversigt over hvad der har kørt i de seneste 6 måneder. Læg i repoet under `docs/annoncer/`. (Fase 0.)
2. **Konsulentaftalen:** hvad Nicklas har lov til at røre, honorar, opsigelsesvarsel, og om Sentury er hans firma. Hvem er admin i Business Manager (dokumenterne siger Morten godkendte forrige token, `metaAdsToken.ts:17-19`).
3. **En system user** i Business Settings → System users, tilknyttet **kun** den relevante annoncekonto (asset-niveau: fuld kontrol kun hvis fase 2+ vælges). To tokens:
   - `META_ADS_TOKEN`: læsning (`ads_read`), 60 dage, erstatter nødnavnet.
   - `META_ADS_WRITE_TOKEN`: `ads_management`, 60 dage, **oprettes først når fase 2 begynder**. Kræver at appen er installeret til system usern og har mindst Standard-tier for Ads Management-featuren (SLÅET OP: «Only apps with Ads Management API standard access and above can be installed»).
4. **Bekræft app-status:** i Meta for Developers → appen → App Review / Permissions and Features: hvilket adgangsniveau `ads_read` og `ads_management` har, og om Business Verification er gjort. Send skærmbillede til chatten (uden tokens).
5. **`spend_cap` og betalingsmetode:** sæt kontoudgiftsloft i Ads Manager (den hårde ydre bremse), og sørg for, at betalingsmetoden er stabil.
6. **Målinger i prod (Lovable SQL editor, én ad gangen):** (a) ansøgning → betalende medlem, pr. `kilde` og pr. `utm_content`; (b) antal tilmeldinger, deltagere og ansøgere pr. `utm_content` for 22/9; (c) hvor mange annoncer i Ads Manager, der IKKE har de kanoniske `url_tags`.
7. **Beslutninger:** lofterne i §3.4; om webinarløftet i privatlivsteksten skal ændres, hvis han i sidste ende vil have audiences (jeg anbefaler ikke); hvem der må godkende forslag (kun Jonas, eller også Morten).
8. **Læs Metas Customer List Custom Audience-vilkår**, hvis han vil have fase 5 (jeg kunne ikke hente siden).

---

## 6. Rettelser og forbehold

- **Jeg har ikke målt prod.** Alle platformstal er fra dokumenter i repoet. Nogle er ældre end i dag (fx 597 tilmeldinger pr. 19/9; 14 ansøgninger pr. 28/9). De kan være gamle.
- **Regnestykket i §3.5 og §1.4** bruger kun repo-tal og standardstatistik; forudsætningen om tilmelding→ansøgning på 1,6 % er en nedre grænse (kun seks ansøgninger 09:51-09:56 på selve dagen).
- **Metas egen dokumentation blev delvist blokeret for min hentning** (Custom Audience-vilkårene: robots; Lookalike-siden: 429). Afsnittene om Standard/Advanced, lookalike-frøstørrelse og Advantage+-datoer hviler på sekundære kilder og er markeret.
- **Jeg har ikke set, om kontoen er Advantage+-tilstand eller ej.** Det afgør, hvilke felter (fx budget på kampagne- eller adsætniveau) motoren skal styre.
- **Statistik:** hvis Jonas forventer, at en enkelt annonce kan «vinde» på medlemmer, er forventningen forkert med de nuværende tal. Det er det, jeg har mest lyst til at sige højt.
