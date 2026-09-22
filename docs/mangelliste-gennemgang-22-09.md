# Mangellisten — gennemgang af alle kort

## Rettet 22/9 kl. 04 — reglen og de rettede lister

**Reglen (Jonas 22/9):** «Vi skal ikke bruge tid på tidligere medlemmer.»

Tal i listen skal gælde **nuværende betalende medlemmer** efter husets egen dom `erIGrundmaengden` (`supabase/functions/_shared/stilleDom.ts:196–205`) — **26 målt i prod 22/9 kl. 04:04** (A's `~/Downloads/maal-medlemmer-22-09.sql`).

**Den anden regel (Jonas 22/9):** «Ingen beslutning på et grundlag, der ikke findes. Et tal holdes op mod, hvor længe det målte har eksisteret, og hvornår medlemmet startede — ellers er det ikke et grundlag.»

Listerne 1–4 herunder er FØRSTE udgave og talte også tidligere medlemmer, legat og gæster med (fx «37 af 51 uden mål», Studio Mini). **De gældende lister: `docs/mangelliste-lister-22-09.md` (tredje udgave).**

Natten til 22/9-2026. Kilde: `docs/mangelliste.html` på main (257 kort, heraf 48 lukkede og skabelonen). Hvert af de **209 åbne kort** er læst og vurderet. Vurderingen af *værdi* og *indsats* er min. **Status i koden** er målt af A (kort 1–128, `recon-mangelliste-A.md`) og B (kort 129–256, `-B.md`); hvor recon'en har rettet min første læsning, står det ved kortet.

Indsats: **XS** under en time · **S** en halv dag · **M** en til tre dage · **L** en uge eller mere · **—** ikke kodearbejde.

## Kort fortalt

- **209 åbne kort**: 130 mangler, 37 beslutninger, 22 fejl, 20 idéer.
- **Kun 78 er egentligt byggearbejde.** Resten er 34 beslutninger, der kun kræver et ja/nej fra dig (og Morten), 25 ting der gøres uden kode (Stripe, Klaviyo, DNS, samtaler), 19 beviser der kommer af sig selv med rigtig trafik, 16 målinger (ofte én SELECT), 17 der med vilje venter, og **20 der bør lukkes, flettes eller arkiveres**.
- **Det vigtigste fund for nye medlemmer er ikke et enkelt kort, men en rute:** betaling → invitation → konto → første login → første tal → første samtale. Fem kort sidder direkte på den rute og kan give et nyt medlem en dårlig første uge: de løse ender ved ankomsten (#61), den tomme hilsen «Hej,» fra importen (#64), et medlem der har betalt men ikke har adgang uden at nogen opdager det (#72), træk på kortet uden varsel (#90) og fakturaer, der står i navnet «Topix.dk» (#78). Tre af de fem er under en times arbejde.
- **For eksisterende medlemmer er det tallene.** 19 af 27 kunder er faldet ud (#120). Det mest værdifulde er ikke nye funktioner, men at de tal, de allerede har, er rigtige: en række udrulninger og genkørsler ligger klar og er aldrig gjort (#104, #105, #106).
- **For rådgiverne** er det virksomhedssidens PR 2 (#178), som du allerede har sagt ja til, og søgning på tværs (#168).

## Hvad recon'en af koden ændrede

A (kort 1–128) og B (kort 129–256) har holdt alle 256 kort op mod koden på `28205c76`. Min første læsning holdt i hovedtræk; disse blev rettet:

- **#2 «Kom ikke»** er fikset i **#1065**, ikke #1066. Kortets egen tekst er ikke længere sand → **luk**.
- **#130 Doggybeds umulige procent** er fikset af rimelighedsgrænsen i **#965** → **luk** (jeg havde den som en måling).
- **#33 de tre fra Monday**: koden er i main → kun en måling af, om rækkerne er indsat.
- **#61 ankomstens løse ender** er mest beviser, ikke kode — bliver på listen for nye medlemmer, men arbejdet er at se efter på skærmen.
- **#115 budgettets skjulte fejl**: punkt 2 er løst siden 5/8.
- **#108**: delvist — PDF-skabelonen kender navnene, XLSX/combined gør ikke.

**Optælling (status i koden):** A: 43 fikset · 8 delvist · 62 ikke løst · 15 umålt. B: 23 fikset · 23 delvist · 59 ikke løst · 23 umålt. «Fikset» omfatter de 48 lukkede kort og kort, hvor koden er i main, men beviset i drift udestår — dem står der «Bevis» ved.

## 1 · De 20 hurtigste — kan næsten alle klares på én aften

1. **#189** — To mails for samme 1:1-betaling: session_booked-notifikationen mailes 15 min efter den direkte …  
   *Indsats XS.* Én linje i stripe-webhook. Et medlem, der køber en 1:1-session, får i dag to mails for samme betaling.
2. **#217 `m16e-messages-indeks`** — messages har intet indeks på conversation_id — panerne, mark_messages_read og …  
   *Indsats XS.* Ét indeks. Chatten og ulæst-tællingen filtrerer på en kolonne uden indeks — vokser med hvert nyt medlem.
3. **#9 `a20-ti-minutter`** — Mail 6 lover «ti minutter» — skemaets intro lover «fem til syv». Vælg ét tal  
   *Indsats XS.* En sætning i Klaviyo. Mailen og skemaet siger hver sit om, hvor lang tid ansøgningen tager.
4. **#208 `a20-spf-theboardroom`** — theboardroom.dk har ingen SPF-record — bogført som manglende 7/9, stadig ikke sat 20/9  
   *Indsats XS.* Én DNS-post. Uden SPF kan dine egne mails fra jonas@theboardroom.dk ende i spam.
5. **#78 `m16e-stripe-konto-support`** — Stripes fakturamail sagde «Svar til: kontakt@topix.dk» (rettet 15:40) og «+45 25 11 03 57» …  
   *Indsats XS.* Én indstilling i Stripe. Medlemmernes fakturaer står stadig i navnet «Topix.dk».
6. **#90 `m14-varsler`** — Ingen varsler før et træk på den nye konto — Stripes fornyelsesvarsel er slukket; valg eller …  
   *Indsats XS.* Én indstilling i Stripe. Medlemmer trækkes hver måned uden varsel.
7. **#64 `n14-4`** — #883 (contact_person fra importen) virker ikke i drift på importvejen — udrul …  
   *Indsats XS.* Udrul import-application og lav én ny import. Nye medlemmer ad importvejen får «Hej,» og et tomt navn.
8. **#113 `m16-download-uden-tal`** — Nøgletal viser «Download PDF · Download CSV» på en tom side — knapperne er disabled i kode, …  
   *Indsats XS.* En betingelse. En ny konto uden tal ser «Download PDF · CSV» på en tom side.
9. **#20 `a20-kilde-direkte-utm`** — theboardroom.dk sætter altid kilde=direkte på ansøg-linket — og afgoerKilde lader ?kilde= …  
   *Indsats XS.* Én betingelse på sitet. En annonceklikker via theboardroom.dk tælles som «direkte» — rammer aftenens måling.
10. **#29 `a18-studio-mini`** — Studio Mini ApS står som «active» med kontrakt udløbet 5/9 og beslutningen «tilbyd ikke» — …  
   *Indsats XS.* Én handling i Farlig zone. Studio Mini står som aktiv, selv om kontrakten er udløbet.
11. **#122** — Booking Innovations personale er 46 kr. om måneden (2024, årsrapport) — datafix + et …  
   *Indsats XS.* Én UPDATE. Booking Innovations personale står til 46 kr. om måneden.
12. **#153 `m17-legat-tre-maal`** — create-legat-enrollment kan fejle når virksomheden allerede har tre aktive mål — den indsætter …  
   *Indsats XS.* En gren i create-legat-enrollment. Et legat kan fejle, når virksomheden har tre aktive mål.
13. **#126** — «Aftalt» mål er ikke altid aftalt: et tomt målfelt gemmes som 0 — skriv ingen række for et …  
   *Indsats XS.* Et par linjer. Et tomt målfelt gemmes som 0.
14. **#128** — M/M på KPI-kortet arver målets farve — retningen af én måned vises som en dom uden at niveauet …  
   *Indsats XS.* En klasse. M/M-tallet farves grønt eller rødt, selv om der ikke er noget mål.
15. **#108 `m17-xlsx-combined-navne`** — XLSX-resultatopgørelsen og combined-skabelonen kender ikke «Løn, gager og honorarer», …  
   *Indsats XS.* Fire navne i en liste. BRILLEVÆRK-typens lønposter lander i «øvrige omkostninger».
16. **#123** — Redigeringstabellen for et gemt budget har ingen «indsæt fra regneark» — importen har det  
   *Indsats XS.* Genbrug importens paste-funktion i budgettabellen.
17. **#82** — Fornyelsesabonnementet i Stripe skal selv sige «Betalingsplan — adgang bæres af kontrakten til …  
   *Indsats XS.* Én linje i abonnementets beskrivelse, så ingen retter cancel_at i god tro.
18. **#205 `a20-cta-etiket`** — Sporingsetiketten på optagelsessidens knap hedder stadig superform_boardroom — …  
   *Indsats XS.* Omdøb én etiket på sitet: klik-statistikken kalder platformen «superform».
19. **#196 `a21-filhoveder-koert`** — Fire migrationer er kørt, men filhovedet siger stadig «IKKE KØRT» — reglen fra 20/9 kan få dem …  
   *Indsats XS.* Filhovederne på de migrationer, der er kørt, men siger «IKKE KØRT» (flettes med #214).
20. **#229** — 274 grene på origin ud over main (målt 16/9 aften; 39 den 10/9) — slet dem der har en merget PR  
   *Indsats XS.* Én kommando: slet de 274 grene fra mergede PR'er. Og #230 (Vercel-appen) tager fem minutter.

*Oven i de 20: **fem kort kan lukkes med det samme** (se afsnit 5), og **seks beviser kan tages med én SELECT hver**, fordi deres frist er passeret: #75, #93, #94, #148, #151 og #165.*

## 2 · De 20 kort med størst værdi for nye medlemmer

1. **#61 `w2`** — Ankomstens løse ender: indlogget browser ubevist (#919), fejl i bekræftelseslinket (§7.4), …  
   *Indsats S.* Ankomsten er det første, et nyt medlem oplever: indlogget browser, fejl i bekræftelseslinket, en mail der lover den gamle vej og to «opret»-knapper på samme skærm.
2. **#72 `a19-betaling-uden-adgang`** — Ingen alarm for «betaling uden adgang»: går stripe-webhook ned mellem perioden og kontrakten, …  
   *Indsats S.* Det værste første indtryk: man har betalt, men har ikke adgang — og intet opdager det. Én SELECT i vagten fanger det.
3. **#64 `n14-4`** — #883 (contact_person fra importen) virker ikke i drift på importvejen — udrul …  
   *Indsats XS.* «Hej,» og et tomt navn ved oprettelsen for alle, der kommer ind ad importvejen.
4. **#90 `m14-varsler`** — Ingen varsler før et træk på den nye konto — Stripes fornyelsesvarsel er slukket; valg eller …  
   *Indsats XS.* Det første træk uden varsel føles som en overraskelse på kontoen. Stripes varsel 7 dage før er én indstilling.
5. **#78 `m16e-stripe-konto-support`** — Stripes fakturamail sagde «Svar til: kontakt@topix.dk» (rettet 15:40) og «+45 25 11 03 57» …  
   *Indsats XS.* Den første faktura fra «Topix.dk» — ikke fra The Boardroom. Ét felt i Stripe.
6. **#150 `m17-en-plan-fase3`** — «Én plan» fase 3 (#941): «Dine mål» for medlemmet, skridt under målene, «Marker som nået», …  
   *Indsats XS.* «Dine mål» med skridt og fremdrift er det, der giver et nyt medlem en plan. Bygget, men aldrig set med en medlemskonto.
7. **#124** — Tre PASS-uploads uden facts venter i køen — og skal PASS uden advarsler committes automatisk?  
   *Indsats S.* Tiden fra første upload til tal på forsiden. PASS uden advarsler kan committes automatisk i stedet for at vente på en rådgiver.
8. **#167 `w15`** — Beskrivelser på de 13 kurser — ingen har en; indhold, ikke kode  
   *Indsats S.* Akademiet er det første sted uden tal, et nyt medlem møder — og ingen af de 13 kurser har en beskrivelse. Indhold, ikke kode.
9. **#113 `m16-download-uden-tal`** — Nøgletal viser «Download PDF · Download CSV» på en tom side — knapperne er disabled i kode, …  
   *Indsats XS.* En ny konto ser eksportknapper på en tom side. Tomme sider skal sige, hvad man gør, ikke tilbyde at eksportere ingenting.
10. **#140** — Systembeskeder ud af chatstrømmen — et filter: chatten viser user (og ai når medlemmet selv …  
   *Indsats S.* Den første samtale med rådgiveren drukner i systembeskeder (44 % af strømmen). Et filter.
11. **#133** — «Spørg din rådgiver om det her» som knap på hvert nøgletal — beskeden bærer tallet som en …  
   *Indsats S.* «Spørg din rådgiver om det her» ved hvert tal giver et nyt medlem en konkret grund til at skrive første gang.
12. **#192** — Mobil: der findes intet mønster i huset — én HbSide-primitiv (max-w + padding + ét lag) som …  
   *Indsats L.* Mange åbner platformen på telefonen første gang (fra velkomstmailen). Huset har intet mobilmønster.
13. **#252** — Rådgiverens tilgængelighed for medlemmerne: «åben nu / i dag / ikke», sat manuelt, som mærke i …  
   *Indsats S.* «Rådgiveren er åben nu» som mærke — sænker tærsklen for første kontakt. En dags arbejde.
14. **#145** — En afholdt session efterlader intet spor — ingen note, intet «afholdt», intet «Dine …  
   *Indsats M.* Efter den første session står intet tilbage: ingen note, intet referat. Første møde bør efterlade et spor.
15. **#56 `w5`** — Indgangens to huller: «Send invitation» kan invitere en ubetalt virksomhed uden advarsel, og …  
   *Indsats S.* Rådgiveren kan invitere en virksomhed, der ikke har betalt, uden advarsel — og RAADGIVER_MAIL_TIL er aldrig bekræftet.
16. **#8 `a20-moedelink-egne-mails`** — Mødelinket i vores egne mails — fire punkter i rækkefølge, før Calendlys kalenderinvitation …  
   *Indsats M.* Mødelinket står i dag kun i Calendlys engelske kalenderinvitation.
17. **#189** — To mails for samme 1:1-betaling: session_booked-notifikationen mailes 15 min efter den direkte …  
   *Indsats XS.* To mails for samme betaling, når man køber sin første 1:1-session.
18. **#165 `w9`** — Profilens faktalinje («Bastant Design · Design · Aarhus · stiftet 2019 · medlem siden marts …  
   *Indsats XS.* Profilens faktalinje i medlemsoversigten — det første andre medlemmer ser om én. Én SELECT afgør, om den virker.
19. **#22 `a20-afmeld-platform`** — Ingen af platformens mails kan afmeldes — byg det, der skal bygges uanset: tabellen …  
   *Indsats M.* Ingen af platformens mails kan afmeldes. Et nyt medlem, der ikke kan sige fra, stoler mindre.
20. **#132** — Direkte integration til regnskabssystemer (e-conomic først) — fjerner den handling de 19 af 27 …  
   *Indsats L.* Den største enkeltændring: tallene kommer af sig selv fra e-conomic, så et nyt medlem aldrig skal lære at uploade.

## 3 · De 10 kort med størst værdi for eksisterende medlemmer

1. **#120** — 19 af 27 kunder er faldet ud (målt 8/9) — to bruger platformen som tænkt; samtale mellem Jonas …  
   *Indsats —.* 19 af 27 kunder er faldet ud. Det er ikke et kort, men den vigtigste samtale i huset — alt andet på listen betyder mindre, hvis den ikke tages.
2. **#132** — Direkte integration til regnskabssystemer (e-conomic først) — fjerner den handling de 19 af 27 …  
   *Indsats L.* e-conomic-integrationen fjerner den handling, de 19 ikke gør: upload.
3. **#106 `m17-saldobalance-pdf-uden-i-alt`** — PDF-grupperne som træ er MERGET (#982, dbe98d36 , 22:50) — udrulning af extract-financial-data …  
   *Indsats S.* Ni virksomheders tal er forkerte, fordi en merget rettelse aldrig er udrullet og genkørt.
4. **#105 `m17-koerelisten`** — Kørelisten: PDF- og AI-rapporterne, ANLA 14, Warburg 8 og BR Roset 20 er ikke genkørt — …  
   *Indsats M.* Kørelisten: en række virksomheders resultater ændrer sig, når de genkøres i den rigtige rækkefølge.
5. **#107 `m17-ai-skema-grupper`** — AI-skemaet har ingen felter for pension, øvrige personale, autodrift, andre eksterne og …  
   *Indsats S.* AI-læste rapporter mangler pension, øvrige personale, autodrift m.fl. — de står som «udækket» hver måned.
6. **#117** — Forklaring på budgetafvigelsen: «hvilke linjer trak?» som fold-ud fra normalized_lines under …  
   *Indsats M.* «Hvilke linjer trak?» — det, medlemmet spørger om ved en budgetafvigelse, er hvorfor.
7. **#133** — «Spørg din rådgiver om det her» som knap på hvert nøgletal — beskeden bærer tallet som en …  
   *Indsats S.* En knap ved tallet, der starter en besked til rådgiveren med tallet i.
8. **#90 `m14-varsler`** — Ingen varsler før et træk på den nye konto — Stripes fornyelsesvarsel er slukket; valg eller …  
   *Indsats XS.* Varsel før hvert månedstræk.
9. **#172** — «Din måned» på forsiden — fire tal om dig selv (rapporteret, opgaver gjort, lektioner set, …) …  
   *Indsats M.* «Din måned»: fire tal om én selv — det enkleste greb mod at falde ud.
10. **#158** — Medlem-til-medlem: form C — en privat tråd i Community (to deltagere) — og «Foreslå intro» som …  
   *Indsats M.* Medlem til medlem: netværket er en del af det, de betaler for, og det kan de i dag ikke bruge direkte.

## 4 · De 10 kort med størst værdi for rådgiverne

1. **#178 `m17-virksomhedssiden-pr2`** — Virksomhedssiden PR 2: forberedelsen læser planen (Planen ind i «Din forberedelse»), og blok …  
   *Indsats M.* Virksomhedssiden PR 2: forberedelsen læser planen i stedet for at gætte. Du har sagt «ja på alle».
2. **#168** — Der findes ingen søgning — hverken for medlemmet (Community, Akademiet, chat, dokumenter) …  
   *Indsats S.* Søgning på tværs af virksomheder — «hvad har vi sagt til Floren om likviditet?». Første udgave er en eftermiddag (tsvector bag en rådgiver-RPC).
3. **#36 `a18-aftale-visning`** — Rådgiveren ser aftalens tilstand ingen steder — sendt / åbnet / udløber / underskrevet / PDF …  
   *Indsats S.* Aftalens tilstand (sendt · åbnet · udløber · underskrevet) står kun i tabellen.
4. **#224 `w14`** — Edge functions har ingen fejllæser — (b) Stripes failed-webhook-mail i Dashboard er nul kode …  
   *Indsats M.* Edge functions har ingen fejllæser — Stripe gentog Doggybeds event fem gange, uden at nogen så det.
5. **#197 `a21-princip-1-klokker`** — Princip 1: stille-klokkerne og Meta-vagten skal nå mail — i dag er begge signaler, kun en …  
   *Indsats S.* Stille-klokkerne og Meta-vagten når aldrig en mail — kun en browser. Husets eget princip.
6. **#3 `a21-redigerbare-mails`** — Redigerbare mails — afslagsmailen først: den redigerede tekst gemmes på afslaget, så …  
   *Indsats M.* Redigerbare mails, afslagsmailen først.
7. **#185** — Forsidens dom mangler to slags: «strandet upload» (parkeret — 1 virksomhed ramt 11/9) og «tal …  
   *Indsats S.* Forsidens dom mangler «strandet upload» — den eneste virksomhed uden godkendte tal ses ikke.
8. **#7 `a20-calendly-no-show`** — Calendly kan melde no-show selv — men abonnementet sender ikke invitee_no_show.created , og …  
   *Indsats S.* No-show fra Calendly: abonnementet mangler én hændelse, og ingen har markeret ét.
9. **#109 `m17-kontrolsum-forside-snapshot`** — Kontrolsummen bor på rapporten (quality_signals.udaekket) — forsiden og facts viser den ikke; …  
   *Indsats S.* Kontrolsummen (udækket) på forsiden og rapportkortet, ikke kun ved godkendelsen.
10. **#183** — Mailoverblikket findes som dokument (docs/mailfortegnelsen.md) — gør fortegnelsen til SIDEN på …  
   *Indsats M.* Mailoverblikket som side: alle mails med udløser, tidspunkt og hvor de rettes.

## 5 · Fikset, forældet, dobbelt eller uden værdi

### Kan lukkes nu (arbejdet er gjort)

- **#2 `a21-kom-ikke`** — «Kom ikke» mangler i fladen — og køen markerer «afholdt» ved sluttid uanset …. «Kom ikke» er fikset i koden i #1065 (3e262816) — bekræftet af A's recon: ikke_moedt står i MENNESKE_HANDLINGER, migrationen findes.
- **#33 `a18-tre-fra-monday`** — De TRE afviste fra Monday skal på ventelisten — udkastet ligger klar i …. Koden til de tre fra Monday er i main (A). Tilbage er kun at måle, om de tre rækker er indsat — så lukkes kortet.
- **#154 `a21-eventflytning-til-alle`** — Mailen om et flyttet event går kun til dem, der har svaret «deltager» — den …. Eventflytning til alle med adgang er bygget i #1067 (21/9) og bevist (Livja) — bekræftet af B.
- **#130 `m17-doggybed-budget`** — Doggybed «Omsætning 21776% over budgettet» på rådgiverens forside (17/9 00:06) …. Doggybeds «21776 % over budgettet» kan ikke længere stå på forsiden: rimelighedsgrænsen kom med #965 (e4fbcd25) — B fandt Doggybed-sagen som testcase i motoren. Selve budgetrækken er data, ikke kode.
- **#199 `a21-smaa-tabeller-statistik`** — Små tabeller uden statistik: company_members er aldrig analyseret — mål hvilke …. ANALYZE er kørt på alle 56 tabeller uden statistik 21/9 kl. 22:37.
- **#28 `a18-meta-capi`** — Meta Conversions API på ansøgningsflowet ligger som udkast — intet sendes før …. Meta Conversions API er i drift i en anden form end udkastet (#1069, #1076, #1078). Kortet om «vent på juristen» er afløst.
- **#83** — Datogaten omgås hvor pengene skifter hænder — virkningsløs efter 10/9; kortet …. Kortet siger selv: slettes 25/9, hvis intet er sket.

### Beviset kan tages nu, fordi datoen er passeret (én SELECT hver, derefter lukkes de)

- **#75 `m17-moms-webhook`** — Fjeldgaardshops træk 18/9 → står moms_oere på TBR-nummeret?
- **#93 `m16-livja-kort`** — Stripes forsøg 19/9 → har Livja fået nyt kort?
- **#94 `m16-traek-grund`** — Træk 18/9 → siger klokken grunden?
- **#148 `m17-en-plan-fase0`** — Mandag 21/9 06 UTC → kun forslag med mål?
- **#151 `m17-en-plan-fase5`** — Samme mandag → «N kunder har ingen mål» på forsiden?
- **#165 `w9`** — Er migration 20260909150000 kørt i prod?
- **#87 `m15-vinduet`** — Vindue 2 til CARMA sendes i dag 22/9 kl. 13 — se sporet i eftermiddag.

### Dobbelte — flettes

- **#4 ↔ #248** (mailloftet): samme sag, to kort. Flet til #248.
- **#196 ↔ #214** (filhoveder «IKKE KØRT»): samme sag; #1078 fandt 35 filer. Ét kort, én PR.
- **#62** «Beviser der udestår» er et samlekort, som listens eget filter «I DRIFT — BEVIS UDESTÅR» allerede viser. Arkivér.

### Ikke opgaver — flyttes ud af listen

- **#1** er skabelonen. **#207** («et signal, kun en browser kan vise, er ikke et signal») og **#92** (kobl aldrig på mail eller navn) er principper — de står i CLAUDE.md og hører ikke til på en liste over mangler.

### Forældede eller uden værdi nu — arkivér med én linje

- **#79 `m16e-lisbeth-alarm-mails`** — Lisbeth fik alarm-mailene 16/9 — en linje nu kommer seks dage for sent.
- **#201 `a21-soendagens-fem-haendelser`** — Søndagens fem hændelser 20/9 — spørgsmålet er forældet.
- **#247 `n14-1`** — Det fremmede Supabase-projekt kan ikke måles herfra; automationen er slukket. Accepteret risiko.
- **#139** — Kortet siger selv «ingen handling» — afgøres, når #140 eller #133 bygges.
- **#187** — Dør med konvergensen; kortet siger «ret kun hvis den ses».
- **#170 `w18`** — Top posts og svar-mails i Community giver ingen værdi, før der er trafik at sortere.
- **#253** — Én bruger med flere virksomheder: 0 i prod.
- **#255** — Push: ingen har bedt om det.
- **#256** — Sekvensmotoren venter på en femte sekvens.
- **#11 `a20-kreativbibliotek`** — Kreativbiblioteket er en pladsholder uden indhold. Skriv opgaven — eller arkivér.

### Venter med vilje — ingen handling før datoen

- #10 og #14 (efter 13/10) · #27 (kontrollér 19/10) · #76 (når YKRG betaler) · #77 (1/11) · #86 (lukker med CARMA) · #98 (efter #97) · #164 (partnerindhold) · #222 · #237 · #243 · #251 · #202 · #232 (ved ~60 kunder).

## 6 · Alle 209 åbne kort — vurderet

Pr. sektion i listens egen rækkefølge. **Anbefaling:** Byg · Bevis (kommer med trafik) · Beslut (dig/Morten) · Gør (uden kode) · Mål (én SELECT/grep) · Vent · Luk · Flet · Arkivér.


### (top)

| # | Kort | Status | Rammer | Indsats | Anbefaling | Vurdering |
|---|---|---|---|---|---|---|
| 1 | Overskrift | fejl | medlem | — | Arkivér | Skabelonkortet, ikke en opgave |

### Indgangen — fra ansøgning til aktivt medlem

| # | Kort | Status | Rammer | Indsats | Anbefaling | Vurdering |
|---|---|---|---|---|---|---|
| 2 | «Kom ikke» mangler i fladen — og køen markerer «afholdt» ved sluttid uanset fremmøde, så et afslag kan takke … | mangler | medlem | XS | Luk | Fikset i koden: #1065 (3e262816) — ikke_moedt i MENNESKE_HANDLINGER; bekræftet af A |
| 3 | Redigerbare mails — afslagsmailen først: den redigerede tekst gemmes på afslaget, så reserve-køen sender den; … | mangler | medlem | M | Byg | Redigerbar afslagsmail; recon først |
| 4 | Mailloftet: rådgivermailen om ny ansøgning tabes ved 429; ingen alarm ved rate_limited ; ingen vagt på … | mangler | raadgiver | S | Flet | Dublet af #248 (mailloftet) — flet til ét kort |
| 5 | Afholdt-rykkerens tekst forudsætter «De hørte «jeg sender aftalegrundlaget»» | mangler | medlem | XS | Byg | Tekst i rykkeren; afhænger af #2 |
| 7 | Calendly kan melde no-show selv — men abonnementet sender ikke invitee_no_show.created , og Jonas har aldrig … | mangler | raadgiver | S | Gør | Jonas: Calendly-abonnement + markér no-show |
| 8 | Mødelinket i vores egne mails — fire punkter i rækkefølge, før Calendlys kalenderinvitation kan undværes: … | mangler | medlem | M | Byg | Mødelink i egne mails — fire punkter |
| 9 | Mail 6 lover «ti minutter» — skemaets intro lover «fem til syv». Vælg ét tal | mangler | medlem | XS | Gør | Klaviyo: ret «ti minutter» til «fem til syv» |
| 10 | Bekræftelsesflowets gengangere: uden sletning af profilfeltet eWebinar forlader ingen segmentet TsEybU — den, … | mangler | medlem | S | Vent | Efter 13/10 |
| 11 | Kreativbiblioteket — opgaven blev formuleret til C, men aldrig sendt; den findes ikke som kort, ikke som … | mangler | raadgiver | — | Beslut | Pladsholder uden indhold — skriv opgaven eller arkivér |
| 12 | Webinarets tidspunkt skal stå på Klaviyo-profilen — påmindelsesmailene nævner ikke tiden, og sessionerne … | beslutning | medlem | XS | Bevis | Fikset i koden: #1066 (ac8ec575), bekræftet af A — drift bevises før 6/10 |
| 13 | Profilmodellen — hvad Klaviyo BØR vide om en person ( naeste_webinar , tb_ansoegning_trin , aktiveringsraten) … | beslutning | medlem | M | Beslut | Profilmodel for Klaviyo |
| 14 | Bot-klik-filteret på Ikke op 02/03 kan skrives ( Bot Click = false som metric_filters ) — men ikke … | mangler | medlem | XS | Vent | Efter 13/10 |
| 15 | Udkast 3 af 3 — kampagne_spor og fladen pr. spor: skitseret, ikke bygget | ide | raadgiver | M | Byg | Kampagne→ansøgning→medlem pr. annonce; delvist dækket af aftenens Meta-arbejde |
| 18 | 179 er tilmeldt webinaret 13/10, og der er ingen, der sender dem en optakt af sig selv — kampagnerne bygges i … | mangler | medlem | S | Gør | Klaviyo-kampagner til 13/10 — senest 6/10 |
| 19 | Hændelsen «Tilmeldt webinar» ligger som udkast og merges onsdag 23/9 — historikken begynder, når koden er i … | mangler | medlem | XS | Byg | Udkast klar — onsdag |
| 20 | theboardroom.dk sætter altid kilde=direkte på ansøg-linket — og afgoerKilde lader ?kilde= vinde over … | mangler | ingen | XS | Byg | Én betingelse: utm vinder over kilde=direkte |
| 21 | Ni mails på én dag til den, der gør præcis det, vi beder om — fire systemer, ingen ved noget om hinanden | beslutning | medlem | S | Beslut | Ni mails → seks: vælg én bekræftelse |
| 22 | Ingen af platformens mails kan afmeldes — byg det, der skal bygges uanset: tabellen kontakt_ikke , … | mangler | medlem | M | Byg | Afmelding: tabel + header + link |
| 24 | «Havde bruger» og «var aktiv» skal bogføres på virksomheden, FØR dag 45 sletter beviset — ellers kan vi … | mangler | raadgiver | S | Byg | Bogfør «havde bruger» før dag 45 sletter |
| 27 | kontakt@theboardroom.dk er spærret hos mailudbyderen til 18/10 kl. 20:47 (hard bounce 18/9 kl. 20:47:49) — … | mangler | raadgiver | — | Vent | Kontrollér 19/10 kl. 00:00 — ingen opgave før |
| 28 | Meta Conversions API på ansøgningsflowet ligger som udkast — intet sendes før juristen har svaret om … | beslutning | medlem | — | Arkivér | Afløst af #1069/#1076/#1078 (Meta CAPI i drift 21/9) |
| 29 | Studio Mini ApS står som «active» med kontrakt udløbet 5/9 og beslutningen «tilbyd ikke» — rettes til … | mangler | raadgiver | XS | Gør | Studio Mini → «tidligere» (én handling) |
| 33 | De TRE afviste fra Monday skal på ventelisten — udkastet ligger klar i ~/Downloads/udkast-venteliste-tre/ … | mangler | raadgiver | XS | Mål | Koden er i main (A); mål om de tre rækker er indsat — så luk |
| 34 | CARMA STUDIO er i sit fornyelsesvindue til 25/9 — første virksomhed hvor «tilbyd ikke» møder ventelisten | mangler | raadgiver | XS | Gør | CARMA-vinduet til 25/9 — se efter |
| 35 | Der kommer ingen jurist (Jonas 20/9) — aftaleteksten (v3) og persondatateksten læses igennem med de øjne, vi … | mangler | medlem | S | Gør | Gennemlæs aftale v3 + persondata (ændret 21/9) |
| 36 | Rådgiveren ser aftalens tilstand ingen steder — sendt / åbnet / udløber / underskrevet / PDF står kun i … | mangler | raadgiver | S | Byg | Aftalens tilstand på ansøgning/virksomhed |
| 38 | Virksomheden efter dag 60: når aftalen lukkes «betalte ikke», står companies -rækken tilbage uden slutdato … | beslutning | raadgiver | S | Beslut | Virksomhed efter dag 60 — vælg vej |
| 39 | Formularen lover «ufærdig slettes efter 30 dage» og «op til 12 måneder» — ingen cron holder løftet | mangler | medlem | S | Byg | Sletteløftet: cron eller ret teksten |
| 40 | TBR-0008 står under en slettet Stripe-kunde — chattens fejl (h) mod «Beslutninger der står fast» | mangler | ingen | XS | Gør | Ret køreplanen (uden for repoet) |
| 41 | Invitationen siger «spærret» på alle fire veje — rettet i kode #915, ubevist i drift | fejl | raadgiver | — | Bevis | Kommer med første spærrede adresse |
| 42 | Invitationsmailen takker kun for en betaling når der ER betalt — rettet i kode #917, ubevist | fejl | medlem | — | Bevis | Kommer med næste import/Stripe-invitation |
| 54 | process-pending-invitation kaldes ved hvert load for alle uden company_members — dvs. hver rådgiver-load | mangler | ingen | XS | Mål | grep: findes kaldet stadig? fjern/gate |
| 55 | Kohortelinjen «Nye medlemmer (30 dage): N af M kom igen efter dag 1» — bygget #929, skærmbevis udestår; det … | mangler | medlem | — | Bevis | Aflæsning 29/9 |
| 56 | Indgangens to huller: «Send invitation» kan invitere en ubetalt virksomhed uden advarsel, og … | mangler | raadgiver | S | Byg | Advarsel ved invitation af ubetalt + bekræft RAADGIVER_MAIL_TIL |
| 57 | sikrIndgangsInvitation kender «allerede accepteret» — rettet #902, grenene ubeviste | mangler | ingen | — | Bevis | Kommer med første tilbagevendende kunde |
| 58 | Efter dag 31 sker der intet — skal der rykkes på fakturaen, og af hvem? | beslutning | medlem | S | Beslut | Dag 31+: klokke på dag 45 — før 20/10 |
| 61 | Ankomstens løse ender: indlogget browser ubevist (#919), fejl i bekræftelseslinket (§7.4), mailen lover den … | mangler | medlem | S | Bevis | Mest beviser (indlogget browser, §7.4, §7.7) + kosmetik; umålt i koden (A) |
| 62 | Beviser der udestår — 20 udrulninger der venter på adfærd i drift, samlet ét sted | mangler | ingen | — | Arkivér | Samlekort — filteret «bevis udestår» gør det samme |
| 63 | Fem nedarvede fejl i importens parser er låst i test som «NEDARVET FEJL» — ikke rettet; (A) ramte 16/9 | mangler | ingen | S | Byg | Fem nedarvede parserfejl (A ramte 16/9) |
| 64 | #883 (contact_person fra importen) virker ikke i drift på importvejen — udrul import-application eksplicit og … | fejl | medlem | XS | Gør | Udrul import-application + ny import (contact_person tom) |
| 69 | Berigelsen stempler ikke rækken: «findes ikke i registret» og «motoren rammer ikke koden» ligner «ikke slået … | mangler | raadgiver | S | Byg | Berigelsen stempler rækken |
| 70 | Ti timers dødvande på dag 31: betalingslinket lukker kl. 02:00 dansk, og fakturaen sendes først kl. 12 — i … | mangler | medlem | S | Beslut | Dag 31-dødvande: flyt cronen til natten |
| 71 | Betalingspåmindelserne kender ingen hverdagsregel — for 23/9-underskrifterne falder dag 25 på en søndag og … | mangler | medlem | S | Beslut | Hverdagsregel for betalingspåmindelser |
| 72 | Ingen alarm for «betaling uden adgang»: går stripe-webhook ned mellem perioden og kontrakten, står pengene … | mangler | medlem | S | Byg | Alarm: betalt uden adgang (én SELECT i vagten) |

### Betaling og fornyelse — inkl. migrationen

| # | Kort | Status | Rammer | Indsats | Anbefaling | Vurdering |
|---|---|---|---|---|---|---|
| 74 | Syv Stripe-kunder med betalte Boardroom-rater (55 fakturaer, 240.625 kr.) har ingen virksomhed i platformen — … | beslutning | ingen | S | Beslut | Syv Stripe-kunder uden virksomhed |
| 75 | Momsen pr. betaling fra Stripes total_taxes (#934) — webhooken har ikke skrevet en række endnu; bevis: … | mangler | medlem | XS | Mål | 18/9 er passeret — mål moms_oere og luk |
| 76 | YKRG's junibetaling er udestående — sendt via e-conomic i stedet for Stripe; ikke i company_traek før den er … | mangler | ingen | — | Vent | Når YKRG betaler |
| 77 | Nordic By Hand betaler rate 2 senere — e-conomic-faktura #141 er oprettet og sendt, forfalder 1/11; ikke i … | mangler | ingen | — | Vent | 1/11 |
| 78 | Stripes fakturamail sagde «Svar til: kontakt@topix.dk» (rettet 15:40) og «+45 25 11 03 57» (fjernet af Jonas … | mangler | medlem | XS | Gør | Stripe: kontonavn uden «Topix.dk» |
| 79 | Lisbeth Gade fik to alarm-mails 16/9 («Bankovertræk i Maj 2026» 14:20:07, «… Juni 2026» 14:25:06) for … | beslutning | medlem | — | Arkivér | 16/9 — for sent til en linje nu |
| 80 | Alarmer til medlemmer kun for den seneste afsluttede måned — og aldrig som mail (#923) — I DRIFT IFØLGE … | mangler | medlem | — | Bevis | Næste godkendte måned |
| 81 | e-conomic-integrationen på den gamle Stripe-konto er død siden 26/7-2025 — 0 af 160 betalte 2026-fakturaer er … | fejl | raadgiver | L | Beslut | e-conomic-bogføring død siden 7/2025 — bogholderen |
| 82 | Fornyelsesabonnementet i Stripe skal selv sige «Betalingsplan — adgang bæres af kontrakten til {dato}», så … | mangler | ingen | XS | Gør | Én linje i abonnementsbeskrivelsen |
| 83 | Datogaten omgås hvor pengene skifter hænder — virkningsløs efter 10/9; kortet udløber 24/9 og slettes 25/9 … | beslutning | raadgiver | — | Luk | Slettes 25/9 efter egen tekst |
| 85 | Tre virksomheder rammer aldrig fornyelsesordningen: Alexander Lund og Martin Larsen uden slutdato, Bastant … | beslutning | raadgiver | — | Gør | Samtale om tre virksomheder |
| 86 | CARMAs slutdato er flyttet i hånden (7/9 → 11/9) — data siger noget andet end kontrakten | mangler | ingen | — | Vent | Lukker med CARMAs fornyelse |
| 87 | Et udløbet medlem i forlængelsesvinduet: vinduesmail 1 bevist (CARMA 16/9 13:00), vindue 2 kommer 22/9; køens … | mangler | medlem | — | Bevis | Vindue 2 til CARMA i dag 22/9 |
| 90 | Ingen varsler før et træk på den nye konto — Stripes fornyelsesvarsel er slukket; valg eller forglemmelse? | beslutning | medlem | XS | Beslut | Slå Stripes varsel til (7 dage) — tillid |
| 92 | Tre af de flyttede har en anden mail i platformen end i Stripe (BR Roset, Homie, Two Socks) — kobl aldrig på … | mangler | ingen | — | Arkivér | Regel, ikke opgave — flyt til CLAUDE.md |
| 93 | Livjas kort er lukket af banken (invalid_account, do_not_try_again) — nyt kort før Stripes næste forsøg 19/9 … | mangler | medlem | XS | Mål | 19/9 passeret — har Livja nyt kort? |
| 94 | Et fejlet træk fortæller nu hvorfor, og perioden er abonnementslinjens — rettet #905, bevis ved næste fejlede … | mangler | raadgiver | XS | Mål | 18/9 passeret — mål og luk |
| 95 | Åbne fakturaer på den gamle konto: 24 (219.892,50 kr.) skal afgøres FØR kontoen lukkes — og bogholderen skal … | mangler | ingen | S | Gør | 24 gamle fakturaer før kontoen lukkes |
| 96 | Retries opbrugt → fakturaen sendes automatisk (Jonas 10/9: «i stedet for at lukke abonnementet … sender vi en … | mangler | medlem | M | Byg | Faktura efter opbrugte retries — fem forudsætninger |
| 97 | companies.stripe_customer_id er tom for de 13 flyttede (sat på 1 af 40, målt 16/9) — SQL i hånden, efter 22/9 | mangler | ingen | S | Gør | SQL: stripe_customer_id for de 13 |
| 98 | Exit-abonnenter kan ikke opsige selv — Customer Portal-linket venter på stripe_customer_id | ide | ingen | — | Vent | Efter #97 |
| 100 | Betaling uden om platformen har ingen flade — fornyelsen regner af indgangspris_oere, som kun stripe-webhook … | mangler | raadgiver | M | Byg | Flade for betaling uden om platformen |

### Dine tal — rapportering, KPI, budget, handouts, parsing

| # | Kort | Status | Rammer | Indsats | Anbefaling | Vurdering |
|---|---|---|---|---|---|---|
| 101 | 45 manuelt rettede måneder hvor rettelsen er identisk med udtrækket — slip rettelsen (så genkørsler og de nye … | beslutning | raadgiver | XS | Beslut | 45 manuelle rettelser: slip dem |
| 102 | BR Roset 2025-07 og YKRG 2026-04 — to måneder chatten fandt ved genkørslen, som kræver Jonas' afgørelse før … | beslutning | raadgiver | XS | Beslut | To måneder — Jonas afgør |
| 103 | BR Rosets tal er AI-skøn i hele tusinder (17 af 20 måneder med regnet ≫ resultat) — acceptér, eller route … | beslutning | medlem | XS | Beslut | BR Roset: acceptér AI-skøn eller skabelon |
| 104 | Brick Works' 22 måneder genkøres igen for balancen — resultatet er rigtigt (genkørt 17/9), balancen tom … | mangler | medlem | S | Gør | Koden er i main (A) — genkør Brick Works |
| 105 | Kørelisten: PDF- og AI-rapporterne, ANLA 14, Warburg 8 og BR Roset 20 er ikke genkørt — resultatet ændres for … | mangler | medlem | M | Gør | Kørelisten: genkørsler i rækkefølge |
| 106 | PDF-grupperne som træ er MERGET (#982, dbe98d36 , 22:50) — udrulning af extract-financial-data og genkørsel … | mangler | medlem | S | Gør | Koden er i main (A) — udrul extract-financial-data + genkør ni |
| 107 | AI-skemaet har ingen felter for pension, øvrige personale, autodrift, andre eksterne og ekstraordinære poster … | mangler | medlem | S | Byg | AI-skemaets fem manglende felter |
| 108 | XLSX-resultatopgørelsen og combined-skabelonen kender ikke «Løn, gager og honorarer», … | mangler | medlem | XS | Byg | Delvist: PDF ja, XLSX/combined nej (A) |
| 109 | Kontrolsummen bor på rapporten (quality_signals.udaekket) — forsiden og facts viser den ikke; og der findes … | mangler | raadgiver | S | Byg | Kontrolsum på forside og rapportkort |
| 110 | D's migration «en FAIL-rapport kan ikke committes som measured af et medlem» ligger i udkast (STOP) — kør den … | beslutning | medlem | XS | Beslut | FAIL kræver rådgiver — kør efter genkørslerne |
| 111 | Rapporter uden fil i storage (legacy-sti «uploads/…») kan ikke genkøres — «Genupload original» først; og 5–10 … | mangler | medlem | S | Byg | Legacy-filer + fortegn 5–10 % |
| 112 | ebitda_margin_pct lyver om formlen — den er resultat FØR SKAT; skriv noten de steder nøglen læses (omdøbning … | mangler | ingen | XS | Byg | Note om formlen (omdøbning senere) |
| 113 | Nøgletal viser «Download PDF · Download CSV» på en tom side — knapperne er disabled i kode, men de skal udgå … | fejl | medlem | XS | Byg | Skjul Download på tom side |
| 114 | «Fra budget» som målkilde på Nøgletal — besluttet 11/9, men to spørgsmål skal afgøres først: enheden (gruppe, … | ide | medlem | M | Beslut | Budget som målkilde — to spørgsmål først |
| 115 | Budgettets tre skjulte fejl: dobbeltrækker pr. bruger i budget_targets, en ubrugt SQL-funktion med forskudt … | fejl | ingen | S | Mål | Punkt 2 er løst siden 5/8 (A); mål dubletterne i prod |
| 117 | Forklaring på budgetafvigelsen: «hvilke linjer trak?» som fold-ud fra normalized_lines under kategorien — … | ide | medlem | M | Byg | «Hvilke linjer trak?» som fold-ud |
| 118 | PHILBERT: to filer strander stadig — en e-conomic-PDF i layoutet «Almindelig» uden skabelon, og en XLSX med … | fejl | medlem | S | Byg | PHILBERTs to strandede filer |
| 119 | Rapportpåmindelsen rykker de 19 faldet-ud tre gange om måneden, måned efter måned — blive, stoppe, eller … | beslutning | medlem | XS | Beslut | Rapportpåmindelsen til de faldet-ud |
| 120 | 19 af 27 kunder er faldet ud (målt 8/9) — to bruger platformen som tænkt; samtale mellem Jonas og Morten, … | beslutning | medlem | — | Gør | Samtale Jonas/Morten om de 19 — næste måling 8/10 |
| 121 | Årsrapporten: ni af elleve udtræk er hule — byg udtrækket som strukturel skabelon (klasse B + skattebilag som … | beslutning | medlem | L | Beslut | Årsrapporten: skabelon eller manuel |
| 122 | Booking Innovations personale er 46 kr. om måneden (2024, årsrapport) — datafix + et tærskelværn i … | fejl | medlem | XS | Gør | Datafix Booking Innovation |
| 123 | Redigeringstabellen for et gemt budget har ingen «indsæt fra regneark» — importen har det | mangler | medlem | XS | Byg | Paste i budgettabellen (genbrug) |
| 124 | Tre PASS-uploads uden facts venter i køen — og skal PASS uden advarsler committes automatisk? | beslutning | medlem | S | Beslut | Auto-commit af PASS uden advarsler |
| 125 | Rallysupports to eksporter af samme måneder — hvilken gælder? (Var: «parseren klassificerer på ét ord — find … | beslutning | raadgiver | XS | Beslut | Rallysupports to eksporter |
| 126 | «Aftalt» mål er ikke altid aftalt: et tomt målfelt gemmes som 0 — skriv ingen række for et tomt felt, og slet … | fejl | medlem | XS | Byg | Tomt målfelt → ingen række |
| 127 | «Standardmål»-mærket er død kode efter #832 — ryd medlemmet, mærket, grenen og de tre tests i én oprydnings-PR | mangler | ingen | S | Byg | Oprydnings-PR: død «standardmål» |
| 128 | M/M på KPI-kortet arver målets farve — retningen af én måned vises som en dom uden at niveauet kendes | fejl | medlem | XS | Byg | M/M i ink-soft uden aftalt mål |
| 129 | Triggeren BENCHMARK_BELOW fyrer på branche-intervaller der ikke skelner (seedet 29/3, aldrig kurateret) — … | beslutning | medlem | S | Beslut | BENCHMARK_BELOW: blive, om, eller dø |
| 130 | Doggybed «Omsætning 21776% over budgettet» på rådgiverens forside (17/9 00:06) — et budgettal tæt på nul mod … | fejl | raadgiver | — | Luk | Fikset i koden: #965 (e4fbcd25) rimelighedsgrænse — bekræftet af B; selve budgetrækken er data |
| 132 | Direkte integration til regnskabssystemer (e-conomic først) — fjerner den handling de 19 af 27 ikke gør: … | ide | medlem | L | Byg | e-conomic-integration (pilot en uge) |

### Chat og rådgiverforløbet

| # | Kort | Status | Rammer | Indsats | Anbefaling | Vurdering |
|---|---|---|---|---|---|---|
| 133 | «Spørg din rådgiver om det her» som knap på hvert nøgletal — beskeden bærer tallet som en frosset chip | ide | medlem | S | Byg | «Spørg din rådgiver om det her» ved tallet |
| 134 | Svar på en konkret besked i chatten (citatet følger originalen) — bygget #930, migrationen bevist 18:00, … | mangler | medlem | — | Bevis | Ni trin på skærm |
| 135 | AI-fanen hører ved tallene, ikke ved rådgiverchatten — mål brugen før den flyttes | beslutning | medlem | XS | Mål | Mål AI-fanens brug før flytning |
| 136 | Aktivitetslog pr. virksomhed — en tidslinje skrevet af triggers i stedet for øjebliksbilleder regnet ved … | ide | raadgiver | M | Vent | Idé — ikke nu |
| 137 | Rådgiverens samtaleliste regner ulæst-tal og «seneste besked» af de 500 nyeste beskeder på tværs af alt — … | mangler | raadgiver | M | Byg | Samtalelisten: RPC + tekstkolonne (vokser) |
| 138 | Blok 3 på virksomhedssiden — emnerne venter på klassificeringen af de 588 menneskebeskeder mod de ni emner | mangler | raadgiver | L | Mål | Klassificér beskeder før flade |
| 139 | Indholdsmodellen er gaflet: chattens content er flad tekst, Community er struktureret JSON (Tiptap) | mangler | ingen | — | Arkivér | Ingen handling før #140/#133 bygges |
| 140 | Systembeskeder ud af chatstrømmen — et filter: chatten viser user (og ai når medlemmet selv bad om analysen); … | mangler | medlem | S | Byg | Systembeskeder ud af chatstrømmen |
| 143 | En chatbesked i rådgiverens klokke åbner samtalen og ruller til beskeden — rettet #927, skærmbevis udestår | mangler | raadgiver | — | Bevis | Ét klik i klokken |
| 144 | Rådgiver som medlem — Jonas skifter hat mellem rådgiver og sin egen medlemsvirksomhed uden to logins | ide | raadgiver | M | Vent | Idé |
| 145 | En afholdt session efterlader intet spor — ingen note, intet «afholdt», intet «Dine sessioner»; … | beslutning | medlem | M | Beslut | Hvad skrives ned efter en session |
| 146 | Jonas-sessionen: 11 af 38 virksomheder står med begge rettigheder åbne — skal de lukkes, og hvilke? | beslutning | medlem | XS | Beslut | De 11 Jonas-sessioner |

### Opgaver og milepæle

| # | Kort | Status | Rammer | Indsats | Anbefaling | Vurdering |
|---|---|---|---|---|---|---|
| 148 | «Én plan» fase 0a+0b (#935, #936): dubletkontrol og højst ét åbent forslag for AI'en; udløbne forslag synlige … | mangler | medlem | XS | Mål | 21/9 06 UTC passeret — mål og luk |
| 149 | «Én plan» fase 1 (#938): company_actions.maal_id, milestones.completed_at, motoren maal.ts — et lukket skridt … | mangler | medlem | — | Bevis | Ét lukket skridt |
| 150 | «Én plan» fase 3 (#941): «Dine mål» for medlemmet, skridt under målene, «Marker som nået», målvælger i … | mangler | medlem | XS | Bevis | Skærm med medlemskonto |
| 151 | «Én plan» fase 5 (#942): AI'en foreslår kun skridt mod et aktivt mål; ingen forslag under gennemgang eller … | mangler | medlem | XS | Mål | 21/9 06 UTC passeret — mål og luk |
| 152 | Gennemgangen af de 8 virksomheder med flere end tre aktive mål (Floren Engros 17, BR Roset 14, Rallysupport … | mangler | raadgiver | — | Gør | Rådgiverarbejde: 8 virksomheder |
| 153 | create-legat-enrollment kan fejle når virksomheden allerede har tre aktive mål — den indsætter legat-målet … | fejl | medlem | XS | Byg | Legat-mål som parkeret ved tre aktive |

### Fællesskabet — community, netværk, events, akademiet

| # | Kort | Status | Rammer | Indsats | Anbefaling | Vurdering |
|---|---|---|---|---|---|---|
| 154 | Mailen om et flyttet event går kun til dem, der har svaret «deltager» — den skal gå til alle med adgang, med … | beslutning | medlem | — | Luk | Bygget i #1067 (21/9) |
| 156 | Forsidens forløbslinje: «start i Akademiet» kun til den der aldrig er begyndt — rettet #914, skærmbevis … | mangler | medlem | — | Bevis | Ny konto + en med lektioner |
| 158 | Medlem-til-medlem: form C — en privat tråd i Community (to deltagere) — og «Foreslå intro» som … | mangler | medlem | M | Byg | Privat tråd + «Foreslå intro» |
| 159 | Et frit udvalg af Boardroom-lektioner på topix.dk — udstillingsvindue for Akademiet (fælles kilde) eller … | beslutning | medlem | M | Beslut | Lektioner på topix.dk |
| 160 | «Kunne du bruge den?» er i drift (#907/#909, bevist på skærm 16/9 11:42) — det første rigtige svar udestår; … | mangler | medlem | — | Bevis | Første rigtige svar |
| 161 | Ugens nyheder som én ugentlig auto-tråd i Community (ugens push, nye lektioner, events) — med kommentarer ved … | ide | medlem | S | Beslut | Ugentlig auto-tråd |
| 162 | En gæst skal møde en grænse i Community, ikke en fejl — de fem adgangsdomme er uenige om NULL i … | fejl | medlem | S | Byg | Gæster møder en grænse, ikke en fejl |
| 164 | «Ugens push» der fremhæver en partneraftale — vent til rabataftalerne har indhold | ide | medlem | — | Vent | Vent på partnerindhold |
| 165 | Profilens faktalinje («Bastant Design · Design · Aarhus · stiftet 2019 · medlem siden marts 2026») mangler i … | mangler | medlem | XS | Mål | Er 20260909150000 kørt? (én SELECT) |
| 166 | Profilredigering hører på ens egen profilside — og rådgivere kan ikke rette deres egen netværksprofil siden … | mangler | raadgiver | S | Byg | Profilredigering på profilsiden |
| 167 | Beskrivelser på de 13 kurser — ingen har en; indhold, ikke kode | mangler | medlem | S | Gør | Kursusbeskrivelser (Jonas & Morten) |
| 168 | Der findes ingen søgning — hverken for medlemmet (Community, Akademiet, chat, dokumenter) eller for … | mangler | medlem | S | Byg | Søgning: tsvector bag advisor-RPC først |
| 169 | Events har ingen lokation — et fysisk event kan ikke sige hvor | mangler | medlem | S | Byg | Lokation på events |
| 170 | Community-idéerne der er tilbage: top posts (én query), svar-mails til alle i tråden (beslutning) — like fra … | ide | medlem | — | Arkivér | Lav værdi — top posts kan vente til der er trafik |
| 171 | Affiliate: et medlem der henviser et nyt MEDLEM får 10.000 kr. (Jonas 14/9) — attribution, udbetaling og … | ide | medlem | L | Beslut | Affiliate 10.000 kr. — model først |
| 172 | «Din måned» på forsiden — fire tal om dig selv (rapporteret, opgaver gjort, lektioner set, …) og … | ide | medlem | M | Byg | «Din måned» — lille, mål kohorten |
| 173 | Video på et Community-opslag: hvem må optage — huset (Bunny-sporet findes) eller ethvert medlem (moderering, … | beslutning | medlem | — | Beslut | Video i Community — hvem optager |

### Rådgiverfladen — det der står tilbage efter 4/9

| # | Kort | Status | Rammer | Indsats | Anbefaling | Vurdering |
|---|---|---|---|---|---|---|
| 174 | «Online nu» på rådgiverens forside (Realtime Presence, privat kanal) — i drift #931, migrationen bevist … | mangler | raadgiver | — | Bevis | Et kundemedlem på forsiden |
| 175 | Fremdrift-fanens medlemsdetalje siger det når hentningen fejler (aldrig «0 af 0 videoer gennemført») — rettet … | mangler | raadgiver | — | Bevis | Kan kun bevises med fejl |
| 176 | «Svar pr. lektion» tæller kun kunders medlemmer — rettet #916, ubevist på skærm; legat-medlemmers svar tæller … | fejl | raadgiver | XS | Byg | Filtrér legat i brugbar-tallet |
| 177 | Planen stod gemt på virksomhedssiden — nu i midten: før tallene i fuld bredde, chatten lavere, aftalen foldet … | mangler | raadgiver | XS | Bevis | Skærm Floren Engros |
| 178 | Virksomhedssiden PR 2: forberedelsen læser planen (Planen ind i «Din forberedelse»), og blok 1-køen viser … | mangler | raadgiver | M | Byg | Virksomhedssiden PR 2 (Jonas: ja på alle) |
| 179 | Refleksionslinjerne på rådgiverens forside lukker af sig selv når I har svaret, kræver mindst 3 tegn og viser … | mangler | raadgiver | XS | Bevis | Forsiden efter Update |
| 180 | Tre gamle deep-links peger stadig på /members/…?section=milestones/reports (CompanyChatPane, … | mangler | raadgiver | XS | Byg | Tre gamle deep-links |
| 181 | Sessionerne står på virksomhedssiden (tre spor, #844) — tilbage er beviset: en rigtig booking gennem et … | mangler | raadgiver | — | Bevis | Én rigtig booking |
| 182 | Adresse, by og postnummer kan ikke rettes af nogen i Hjemmebane — kolonnerne findes og vises, men ingen … | mangler | raadgiver | XS | Byg | Adresse/by/postnr i dialogen |
| 183 | Mailoverblikket findes som dokument (docs/mailfortegnelsen.md) — gør fortegnelsen til SIDEN på … | beslutning | raadgiver | M | Byg | Mailoverblikket som side |
| 184 | Admin-menuen: ét spørgsmål tilbage — hvad hedder Platformconfig («Rådgivere og roller»?), og fjernes de tre … | beslutning | raadgiver | XS | Beslut | Admin-menuens navn |
| 185 | Forsidens dom mangler to slags: «strandet upload» (parkeret — 1 virksomhed ramt 11/9) og «tal der ligner en … | mangler | raadgiver | S | Byg | Forsidens dom: strandet upload |
| 186 | Sletning af en person har ingen vej — og «skift owner» hører til samme familie; efterladenskaberne fra gamle … | mangler | raadgiver | M | Byg | Sletning af en person |
| 187 | Den gamle skals company-picker lander på /virksomheder efter «Vis som virksomhed» — formentlig hører man til … | ide | raadgiver | — | Arkivér | Dør med konvergensen |

### Design og konvergens

| # | Kort | Status | Rammer | Indsats | Anbefaling | Vurdering |
|---|---|---|---|---|---|---|
| 188 | Idébanken: medlemmer foreslår og ser hvad andre har foreslået — feedback-tabellen og admin-fladen findes, … | ide | medlem | M | Vent | Idébank — ikke nu |
| 189 | To mails for samme 1:1-betaling: session_booked-notifikationen mailes 15 min efter den direkte bekræftelse — … | fejl | medlem | XS | Byg | Én linje: email_sent_at ved insert |
| 190 | Auth-mails står ikke i vores egen log — hullet er ét felt bredt (kun «Nulstil din adgangskode»), og det … | mangler | raadgiver | S | Byg | Auth-mails i egen log |
| 191 | Ni døde mails og skabeloner (mailfortegnelsen K1–K9) — én oprydning | mangler | ingen | S | Byg | Ni døde mails — én oprydning |
| 192 | Mobil: der findes intet mønster i huset — én HbSide-primitiv (max-w + padding + ét lag) som alle views … | mangler | medlem | L | Byg | Mobil: HbSide-primitiv, virksomhedssiden først |
| 194 | Former der skal løftes til hjemmebane/: HbOverlejring ud af milestones/, faner på HbSegmented, Hb-editoren … | mangler | ingen | M | Byg | Former løftes til hjemmebane/ |
| 195 | Seks gamle komponenter på Hjemmebane-flader — to har en Hb-tvilling der kan tage over, EditCompanyDialog … | fejl | raadgiver | M | Byg | Seks gamle komponenter i Hb-flader |

### Drift og fundament — ydeevne, overvågning, RLS, døde felter

| # | Kort | Status | Rammer | Indsats | Anbefaling | Vurdering |
|---|---|---|---|---|---|---|
| 196 | Fire migrationer er kørt, men filhovedet siger stadig «IKKE KØRT» — reglen fra 20/9 kan få dem kørt igen | mangler | ingen | XS | Flet | Dublet af #214 — ét filhoved-PR |
| 197 | Princip 1: stille-klokkerne og Meta-vagten skal nå mail — i dag er begge signaler, kun en browser kan vise | mangler | raadgiver | S | Byg | Stille-klokker og Meta-vagt skal nå mail |
| 198 | ad_id_udledt -kommentaren (coalesce) rettes i fil og i prod | mangler | ingen | XS | Byg | Kommentar i fil og prod |
| 199 | Små tabeller uden statistik: company_members er aldrig analyseret — mål hvilke flere | mangler | ingen | — | Luk | Gjort 21/9 22:37: ANALYZE på 56 tabeller (B kunne ikke se det i koden: prod-handling) |
| 200 | Stille-klokkerne: fundet: 27 mod 28 betalende; E-skilte ikke_aktiv | mangler | raadgiver | XS | Mål | 27 mod 28 — hvem mangler |
| 201 | Søndagens 4 «Deltog» + 1 «Mødte ikke op» 14:38–14:44 — hvem, og ramte de et flow? | mangler | medlem | — | Arkivér | Forældet — søndagens hændelser |
| 202 | Importens hentning: 14 sider / ~70 s; updatedSince , hvis budgettet ikke rækker | mangler | ingen | S | Vent | updatedSince, hvis budgettet ikke rækker |
| 203 | email_send_log s unikke indeks påstås, findes ikke i migrationerne — mål i prod | mangler | ingen | XS | Mål | Én SELECT: findes indekset? |
| 204 | Ads Manager har ingen standard for URL-parametre — en ny annonce uden {{ad.id}} opdages først, når … | mangler | raadgiver | S | Byg | Linje der råber ved annonce uden {{ad.id}} |
| 205 | Sporingsetiketten på optagelsessidens knap hedder stadig superform_boardroom — klik-statistikken kalder … | mangler | ingen | XS | Byg | Omdøb etiketten på sitet |
| 207 | Princip: et signal, kun en browser kan vise, er ikke et signal | beslutning | raadgiver | — | Arkivér | Et princip, ikke en opgave — står i CLAUDE.md |
| 208 | theboardroom.dk har ingen SPF-record — bogført som manglende 7/9, stadig ikke sat 20/9 | mangler | alle | XS | Gør | SPF-record på theboardroom.dk |
| 210 | «Procenten går aldrig ned» hviler kun på koden — to POST'er i samme sekund kan gemme 40 % på en, der så 82 | mangler | raadgiver | XS | Byg | greatest()-trigger |
| 212 | En replay-seer bliver «Deltog i webinar» i Klaviyo — uden session, uden frisk — ved et tilfælde | beslutning | ingen | XS | Beslut | Replay som «deltog» |
| 213 | Går KLAVIYO_API_KEY tabt ved en rotation, er hele dagen ét stille spor af ingen_noegle -rækker | mangler | ingen | XS | Byg | console.warn ved manglende nøgle |
| 214 | 20 migrationer siger «IKKE KØRT» i filhovedet — flere er beviseligt kørt (20260916150000 14:18, … | fejl | ingen | S | Byg | Filhoveder à jour (35 filer, jf. #1078) |
| 216 | monday-webhook svarer 500 «Unexpected end of JSON input» uden header og med tom body — den læser body'en før … | fejl | ingen | XS | Byg | Nøglen før body'en |
| 217 | messages har intet indeks på conversation_id — panerne, mark_messages_read og ulæst-tællingerne filtrerer på … | mangler | ingen | XS | Byg | Indeks (conversation_id, created_at) |
| 218 | Hvilken kode kører? CLAUDE.md siger edge functions auto-deployer fra merge, OVERLEVERING siger en ændret delt … | mangler | ingen | S | Mål | Canary: hvilken kode kører |
| 219 | DataCVR: grænsen (25 om dagen eller om måneden?) og vilkårene for kommerciel brug er ikke afklaret — kilden … | mangler | ingen | — | Gør | DataCVR-vilkår |
| 220 | Samle de 15 inline #709-skriveværn («en UPDATE skal ramme rækker») i én hjælper i kraevRaekker.ts — efter 22/9 | mangler | ingen | S | Byg | Skriveværn i én hjælper |
| 221 | Self-host fonte i stedet for tre Google Fonts-@import — ydeevne og GDPR | mangler | ingen | S | Byg | Self-host fonte |
| 222 | Data-drevne Akademi-områder og handout-definitioner — bevidst udskudt 4/8; ikke før nogen vil oprette et … | mangler | ingen | — | Vent | Udskudt med vilje |
| 223 | Boardroom-MCP fase 1 er bygget og frosset siden 4/8 — udvid den til rådgiver-MCP'en (medlemskontekst + … | beslutning | raadgiver | XS | Beslut | MCP: (a)/(b)/(c) |
| 224 | Edge functions har ingen fejllæser — (b) Stripes failed-webhook-mail i Dashboard er nul kode og ikke målt om … | fejl | raadgiver | M | Byg | Fejllæser for edge functions |
| 225 | Tavse queryFn'er: handouts og klokken kaster nu (#928, ubevist) — tilbage er RabataftalerView og admin-views … | fejl | ingen | M | Byg | Fire tavse flader |
| 226 | Advisor og admin er ikke skilt ad — hver ny admin-gate er en Morten-gate; skriv tabellen over gates med … | beslutning | ingen | S | Beslut | Advisor/admin-gates |
| 227 | Oprydningens rester efter #836: én etiket, fire kommentarer — og to slettede functions (run-weekly-agent, … | mangler | ingen | XS | Byg | Oprydningsrester |
| 228 | Lektionsstien bygges inline syv steder ved siden af lektionsSti — plus tre områderuter; ét kildeværn kan låse … | mangler | ingen | XS | Byg | lektionsSti syv steder |
| 229 | 274 grene på origin ud over main (målt 16/9 aften; 39 den 10/9) — slet dem der har en merget PR | mangler | ingen | XS | Gør | Slet merged grene (én kommando) |
| 230 | Vercel-appen hænger stadig check-suites (queued) — fjern appen fra repoet under GitHub → Settings → … | mangler | ingen | XS | Gør | Fjern Vercel-appen (5 min) |
| 231 | Fem domme om medlemsadgang — tre SQL-domme uden paritetstest; om døren (#807, migration 20260911050000) er … | mangler | ingen | S | Byg | Paritetstest for SQL-dommene |
| 232 | hentAdvisorDashboard henter hele porteføljen i JavaScript — holder til ~60 kunder, ikke 100; i dag 29 (målt … | mangler | ingen | L | Vent | RPC til forsiden — ved ~60 kunder |
| 233 | Ydeevne: Sentry måler allerede 10 % af sidevisningerne, ingen læser det; bundlen er aldrig målt — første greb … | mangler | ingen | XS | Mål | Sentry p95 + bundle — nul kode |
| 234 | Invarianter i vagten — rammen findes (vagt_cron hver time), de to første tjek mangler: ugenøgle på … | mangler | ingen | S | Byg | To invarianter i vagten |
| 235 | Restore er aldrig afprøvet — chattens altafgørende nr. 1; ikke målt om Lovable Cloud udstiller backups eller … | mangler | ingen | S | Gør | Afprøv restore — kritisk |
| 236 | To skrivere på ugekortet (mandagens cron og et godkendt agentforslag), samme konfliktnøgle, ingen markør for … | mangler | ingen | XS | Byg | skrevet_af på ugekortet |
| 237 | verify_jwt = false på 37 ældre functions (31 true, målt 10/9) — migreres én ad gangen; CI-værnet kræver at … | mangler | ingen | M | Vent | Løbende migrering |
| 238 | kr() findes i fire kopier (MembershipExpiredGate, Betal, fornyelsesbaand, virksomhedsSignaler) — én lille PR … | mangler | ingen | XS | Byg | kr() i én hjælper |
| 239 | Sletteliste: fire ting der er bygget og aldrig kobles til en flade — DashboardActionCenter, AdvisorDashboard … | mangler | ingen | S | Byg | Slet fire ubrugte + én tabel |
| 240 | Slettefunktionens liste nævner ikke community_reaktioner, community_visninger, forside_sidst_set og … | mangler | ingen | XS | Mål | pg_constraint mod auth.users |
| 241 | Døde DB-kolonner og -tabeller — profiles.company_name, group_conversations/group_messages, og de unavngivne … | mangler | ingen | S | Byg | Døde kolonner, én ad gangen |
| 243 | En sjette mailnøgle for Community — udsat til nogen slår «Opdateringer» fra (målt 10/9: nul af 31) | beslutning | medlem | — | Vent | Til nogen slår fra |
| 244 | Ingen opbevaringspolitik — hvor længe beholder vi loginposter, chat, rapporter og filer for et aktivt medlem, … | beslutning | ingen | M | Beslut | Opbevaringspolitik |
| 246 | To admin-veje kan slette uden frist og uden spor (bulk-remove-members, cleanup-shells, … | beslutning | ingen | S | Beslut | Tre admin-slettveje |
| 247 | hzlkypibayzkkumwohap — et fremmed Supabase-projekt som Mondays automationer pegede på 21/3–14/9; fik det data? | mangler | ingen | — | Arkivér | Kan ikke måles herfra — accepteret risiko |
| 248 | Mailloftet er pr. time og pr. workspace — Lovable Support hævede det til 300 app-mails/time 18/9 (gældende … | fejl | medlem | S | Byg | Mailloftet (flettet med #4): alarm + vagt på køen |
| 249 | Tekstudgaven af hver mail med en knap siger knappens tekst TO gange — htmlTilTekst fjerner ikke … | mangler | medlem | XS | Byg | Strip Outlook-blokken |
| 250 | Rådgivernes info-notifikationer hober sig op i notifications (587 markeret læst i hånden 14/9; 35 gamle … | mangler | raadgiver | XS | Beslut | Info-rækker til rådgivere |

### Idéer — ikke sekvenseret endnu

| # | Kort | Status | Rammer | Indsats | Anbefaling | Vurdering |
|---|---|---|---|---|---|---|
| 251 | À la carte-tilkøb ved siden af medlemskabet — generalisér 1:1-sessionens vej: et katalog af Stripe-produkter … | ide | medlem | M | Vent | Kataloget først |
| 252 | Rådgiverens tilgængelighed for medlemmerne: «åben nu / i dag / ikke», sat manuelt, som mærke i menuen (samme … | ide | medlem | S | Byg | Rådgiverens tilgængelighed som mærke |
| 253 | Én bruger med flere virksomheder — parkeret: prod 11/9 har 0 brugere med to company_members-rækker; useAuth … | ide | medlem | — | Arkivér | Parkeret — 0 brugere med to |
| 254 | «Måske relevant for dig» — lektionen der passer til ugens fokus, regelbaseret V1; merget #932 21:09 (rettet … | mangler | medlem | — | Bevis | Merget #932 |
| 255 | Push-kanal (service worker) findes ikke — parkeret: mail + klokke er formen, ingen har bedt om push | ide | medlem | — | Arkivér | Parkeret — ingen har bedt om det |
| 256 | Sekvensmotoren — tre sekvenser i samme form (legat, onboarding, indgang) med hver sin dommer; bliver et kort … | ide | ingen | — | Arkivér | Parkeret — venter på en femte sekvens |
| 257 | To rådgivere til hundrede virksomheder — et produktspørgsmål før et værktøjsspørgsmål: skal I være flere, … | beslutning | raadgiver | — | Beslut | Produktspørgsmål: flere rådgivere |

---
*Status i koden bekræftes af A's og B's recon (`recon-mangelliste-A.md` og `-B.md`). Hvor recon'en viser noget andet end her, retter jeg listen.*