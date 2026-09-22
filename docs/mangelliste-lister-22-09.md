# Mangellisten — de fire lister (22/9, tredje udgave)

**To regler for listerne (Jonas 22/9):**

1. **Kun nuværende betalende medlemmer og ansøgere på vej ind.** Tidligere medlemmer får ingen tid. «Nuværende betalende» er husets egen dom `erIGrundmaengden` (`_shared/stilleDom.ts:196–205`): 26 målt i prod 22/9 kl. 04:04.
2. **Ingen beslutning på et grundlag, der ikke findes.** Platformen er ny, og flere funktioner er fra de sidste dage («Én plan» fra 16–17/9). Et tal holdes op mod, hvor længe det målte har eksisteret, og hvornår medlemmet startede — ellers er det ikke et grundlag. Listerne rummer derfor kun konkrete ting, medlemmerne møder i dag, og som vi VED virker forkert eller mangler.

Fakta, der bruges: PHILBERTs kontrakt udløber 29/9 og Doggybeds 13/10. Tre nuværende medlemmer har over 3 aktive mål (Rallysupport 11, Booking Innovation 8, Rezycl 6) — for dem foreslår AI'en intet, før rådgiveren har valgt højst tre. Ventelisten er tom i prod (udkastets SQL er aldrig kørt).

Indsats: **XS** under en time · **S** en halv dag · **M** en til tre dage · **L** en uge+ · **—** ikke kode.

## 1 · De 20 hurtigste

1. **`a18-tre-fra-monday` — De TRE afviste fra Monday skal på ventelisten — udkastet ligger klar i …**  
   *XS.* Ventelisten er tom i prod: udkastets SQL er aldrig kørt. Kør den, og Lev Positiv og Tatti kan tilbydes plads.
2. **To mails for samme 1:1-betaling: session_booked-notifikationen mailes 15 min efter den …**  
   *XS.* Én linje: to mails for samme 1:1-betaling.
3. **`m16e-messages-indeks` — messages har intet indeks på conversation_id — panerne, mark_messages_read og …**  
   *XS.* Ét indeks på `messages(conversation_id, created_at)`.
4. **`a20-ti-minutter` — Mail 6 lover «ti minutter» — skemaets intro lover «fem til syv». Vælg ét tal**  
   *XS.* Én sætning i Klaviyo: «ti minutter» mod skemaets «fem til syv».
5. **`a20-spf-theboardroom` — theboardroom.dk har ingen SPF-record — bogført som manglende 7/9, stadig ikke sat 20/9**  
   *XS.* SPF på theboardroom.dk (én DNS-post).
6. **`m16e-stripe-konto-support` — Stripes fakturamail sagde «Svar til: kontakt@topix.dk» (rettet 15:40) og «+45 25 11 03 …**  
   *XS.* Stripe: fakturaerne står i navnet «Topix.dk».
7. **`m14-varsler` — Ingen varsler før et træk på den nye konto — Stripes fornyelsesvarsel er slukket; valg …**  
   *XS.* Stripe: varsel 7 dage før hvert træk.
8. **`n14-4` — #883 (contact_person fra importen) virker ikke i drift på importvejen — udrul …**  
   *XS.* Udrul `import-application` + én ny import: «Hej,» og tomt navn ad importvejen.
9. **`m16-download-uden-tal` — Nøgletal viser «Download PDF · Download CSV» på en tom side — knapperne er disabled i …**  
   *XS.* Skjul «Download PDF · CSV» uden tal.
10. **`a20-kilde-direkte-utm` — theboardroom.dk sætter altid kilde=direkte på ansøg-linket — og afgoerKilde lader ?kilde= …**  
   *XS.* utm vinder over `kilde=direkte`.
11. **Booking Innovations personale er 46 kr. om måneden (2024, årsrapport) — datafix + et …**  
   *XS.* Én UPDATE: Booking Innovations personale står til 46 kr./md.
12. **`m17-legat-tre-maal` — create-legat-enrollment kan fejle når virksomheden allerede har tre aktive mål — den …**  
   *XS.* Legat-målet som parkeret ved tre aktive.
13. **«Aftalt» mål er ikke altid aftalt: et tomt målfelt gemmes som 0 — skriv ingen række for …**  
   *XS.* Et tomt målfelt gemmes ikke som 0.
14. **M/M på KPI-kortet arver målets farve — retningen af én måned vises som en dom uden at …**  
   *XS.* M/M i ink-soft uden aftalt mål.
15. **`m17-xlsx-combined-navne` — XLSX-resultatopgørelsen og combined-skabelonen kender ikke «Løn, gager og honorarer», …**  
   *XS.* Fire navne i XLSX/combined-matcherne.
16. **Redigeringstabellen for et gemt budget har ingen «indsæt fra regneark» — importen har det**  
   *XS.* Paste i budgettabellen.
17. **Fornyelsesabonnementet i Stripe skal selv sige «Betalingsplan — adgang bæres af …**  
   *XS.* Én linje i abonnementsbeskrivelsen.
18. **`a20-ingen-noegle-warn` — Går KLAVIYO_API_KEY tabt ved en rotation, er hele dagen ét stille spor af ingen_noegle …**  
   *XS.* `console.warn` ved manglende Klaviyo-nøgle.
19. **`m17-gamle-members-links` — Tre gamle deep-links peger stadig på /members/…?section=milestones|reports …**  
   *XS.* Tre gamle deep-links til `/members/…`.
20. **274 grene på origin ud over main (målt 16/9 aften; 39 den 10/9) — slet dem der har en …**  
   *XS.* Slet de 274 grene fra mergede PR'er (+ Vercel-appen).

## 2 · De 20 med størst værdi for nye medlemmer — den gode start

1. **`w2` — Ankomstens løse ender: indlogget browser ubevist (#919), fejl i bekræftelseslinket …**  
   *S.* Ankomsten er det første, de møder: indlogget browser, bekræftelseslinket og mailens løfte er ubeviste — og der er to «opret»-knapper på samme skærm.
2. **`a19-betaling-uden-adgang` — Ingen alarm for «betaling uden adgang»: går stripe-webhook ned mellem perioden og …**  
   *S.* Betalt uden adgang — ingen alarm fanger det, hvis webhooken falder mellem perioden og kontrakten.
3. **`n14-4` — #883 (contact_person fra importen) virker ikke i drift på importvejen — udrul …**  
   *XS.* «Hej,» og tomt navn for dem, der kommer ind ad importvejen.
4. **`m14-varsler` — Ingen varsler før et træk på den nye konto — Stripes fornyelsesvarsel er slukket; valg …**  
   *XS.* Første månedstræk kommer uden varsel.
5. **`m16e-stripe-konto-support` — Stripes fakturamail sagde «Svar til: kontakt@topix.dk» (rettet 15:40) og «+45 25 11 03 …**  
   *XS.* Første faktura står i navnet «Topix.dk».
6. **`m17-en-plan-fase3` — «Én plan» fase 3 (#941): «Dine mål» for medlemmet, skridt under målene, «Marker som …**  
   *XS.* «Dine mål» er bygget, men aldrig set med en medlemskonto. Se det, før nye medlemmer møder det.
7. **Tre PASS-uploads uden facts venter i køen — og skal PASS uden advarsler committes …**  
   *S.* Den første upload: i dag venter en rapport uden advarsler på en rådgiver, før tallene står på forsiden. Auto-commit ved PASS forkorter vejen til første tal.
8. **`w15` — Beskrivelser på de 13 kurser — ingen har en; indhold, ikke kode**  
   *S.* Akademiet er det første sted uden tal — ingen af de 13 kurser har en beskrivelse.
9. **`m16-download-uden-tal` — Nøgletal viser «Download PDF · Download CSV» på en tom side — knapperne er disabled i …**  
   *XS.* En tom side skal sige, hvad man gør — ikke tilbyde at eksportere ingenting.
10. **Systembeskeder ud af chatstrømmen — et filter: chatten viser user (og ai når medlemmet …**  
   *S.* Den første samtale med rådgiveren deler strøm med systembeskederne.
11. **«Spørg din rådgiver om det her» som knap på hvert nøgletal — beskeden bærer tallet som en …**  
   *S.* «Spørg din rådgiver om det her» ved tallet giver en konkret grund til at skrive første gang.
12. **Mobil: der findes intet mønster i huset — én HbSide-primitiv (max-w + padding + ét lag) …**  
   *L.* Velkomstmailen åbnes ofte på telefonen — huset har intet mobilmønster.
13. **Rådgiverens tilgængelighed for medlemmerne: «åben nu / i dag / ikke», sat manuelt, som …**  
   *S.* «Rådgiveren er åben nu» sænker tærsklen for første kontakt.
14. **En afholdt session efterlader intet spor — ingen note, intet «afholdt», intet «Dine …**  
   *M.* Første session efterlader intet spor — ingen note, intet referat.
15. **`w5` — Indgangens to huller: «Send invitation» kan invitere en ubetalt virksomhed uden advarsel, …**  
   *S.* Rådgiveren kan invitere en virksomhed, der ikke har betalt, uden advarsel.
16. **`a20-moedelink-egne-mails` — Mødelinket i vores egne mails — fire punkter i rækkefølge, før Calendlys …**  
   *M.* Mødelinket står kun i Calendlys engelske invitation.
17. **`m16-fortsaet-forloeb` — Forsidens forløbslinje: «start i Akademiet» kun til den der aldrig er begyndt — rettet …**  
   *—.* Forsidens «start i Akademiet» — se den med en ny konto.
18. **To mails for samme 1:1-betaling: session_booked-notifikationen mailes 15 min efter den …**  
   *XS.* To mails ved første 1:1-køb.
19. **`a20-afmeld-platform` — Ingen af platformens mails kan afmeldes — byg det, der skal bygges uanset: tabellen …**  
   *M.* Ingen af platformens mails kan afmeldes.
20. **Direkte integration til regnskabssystemer (e-conomic først) — fjerner den handling de 19 …**  
   *L.* e-conomic: tallene kommer af sig selv, så et nyt medlem aldrig skal lære at uploade.

## 3 · De 10 med størst værdi for eksisterende medlemmer — det, de møder i dag

1. **`m17-saldobalance-pdf-uden-i-alt` — PDF-grupperne som træ er MERGET (#982, dbe98d36 , 22:50) — udrulning af …**  
   *S.* Ni nuværende medlemmers tal er forkerte: rettelsen er merget, men aldrig udrullet og genkørt (Topix.dk er gæst og tages ud).
2. **`m17-koerelisten` — Kørelisten: PDF- og AI-rapporterne, ANLA 14, Warburg 8 og BR Roset 20 er ikke genkørt — …**  
   *M.* Kørelisten — genkørsler i rækkefølge ændrer flere nuværende medlemmers resultater.
3. **`w12` — PHILBERT: to filer strander stadig — en e-conomic-PDF i layoutet «Almindelig» uden …**  
   *S.* To af PHILBERTs filer strander stadig. Hendes kontrakt udløber 29/9.
4. **`m17-ai-skema-grupper` — AI-skemaet har ingen felter for pension, øvrige personale, autodrift, andre eksterne og …**  
   *S.* AI-læste rapporter mangler pension, øvrige personale, autodrift m.fl. — de står som «udækket» hver måned.
5. **`m17-xlsx-combined-navne` — XLSX-resultatopgørelsen og combined-skabelonen kender ikke «Løn, gager og honorarer», …**  
   *XS.* BRILLEVÆRK-typens lønposter lander i «øvrige omkostninger» i XLSX/combined.
6. **`m14-varsler` — Ingen varsler før et træk på den nye konto — Stripes fornyelsesvarsel er slukket; valg …**  
   *XS.* Hvert månedstræk uden varsel — rammer alle på rater.
7. **`m16e-stripe-konto-support` — Stripes fakturamail sagde «Svar til: kontakt@topix.dk» (rettet 15:40) og «+45 25 11 03 …**  
   *XS.* Hver faktura i navnet «Topix.dk».
8. **Forklaring på budgetafvigelsen: «hvilke linjer trak?» som fold-ud fra normalized_lines …**  
   *M.* «Hvilke linjer trak?» ved en budgetafvigelse — det, medlemmet spørger om.
9. **«Spørg din rådgiver om det her» som knap på hvert nøgletal — beskeden bærer tallet som en …**  
   *S.* En knap ved tallet, der starter en besked til rådgiveren med tallet i.
10. **Direkte integration til regnskabssystemer (e-conomic først) — fjerner den handling de 19 …**  
   *L.* e-conomic-integrationen — den største enkeltændring: upload forsvinder.

## 4 · De 10 med størst værdi for rådgiverne

1. **`m17-virksomhedssiden-pr2` — Virksomhedssiden PR 2: forberedelsen læser planen (Planen ind i «Din forberedelse»), og …**  
   *M.* Virksomhedssiden PR 2 — forberedelsen læser planen (du har sagt ja).
2. **`a18-tre-fra-monday` — De TRE afviste fra Monday skal på ventelisten — udkastet ligger klar i …**  
   *XS.* Ventelisten er tom — kør SQL'en, tilbyd Lev Positiv og Tatti.
3. **`m17-gennemgangen-af-de-8` — Gennemgangen af de 8 virksomheder med flere end tre aktive mål (Floren Engros 17, BR …**  
   *—.* Tre medlemmer har over 3 aktive mål (Rallysupport 11, Booking Innovation 8, Rezycl 6). AI'en foreslår intet for dem, før I har valgt højst tre.
4. **Der findes ingen søgning — hverken for medlemmet (Community, Akademiet, chat, dokumenter) …**  
   *S.* Søgning på tværs af virksomheder.
5. **`a18-aftale-visning` — Rådgiveren ser aftalens tilstand ingen steder — sendt / åbnet / udløber / underskrevet / …**  
   *S.* Aftalens tilstand på ansøgning og virksomhed.
6. **`w14` — Edge functions har ingen fejllæser — (b) Stripes failed-webhook-mail i Dashboard er nul …**  
   *M.* Fejllæser for edge functions.
7. **`a21-princip-1-klokker` — Princip 1: stille-klokkerne og Meta-vagten skal nå mail — i dag er begge signaler, kun en …**  
   *S.* Stille-klokkerne og Meta-vagten skal nå mail.
8. **`a21-redigerbare-mails` — Redigerbare mails — afslagsmailen først: den redigerede tekst gemmes på afslaget, så …**  
   *M.* Redigerbare mails.
9. **Forsidens dom mangler to slags: «strandet upload» (parkeret — 1 virksomhed ramt 11/9) og …**  
   *S.* Forsidens dom: «strandet upload» (PHILBERT er et eksempel lige nu).
10. **`a20-calendly-no-show` — Calendly kan melde no-show selv — men abonnementet sender ikke invitee_no_show.created , …**  
   *S.* No-show fra Calendly.

## Ude af listerne — og hvorfor

- **`a18-studio-mini`** — Studio Mini står allerede som «tidligere» (målt 04:04). Lukket.
- **«Tre virksomheder rammer aldrig fornyelsesordningen»** — Alexander Lund og Martin Larsen findes ikke som virksomheder, og Bastant Design har en gratis kontrakt. Ingen er betalende. Arkiveret.
- **Tal om svar på forslag, mål og «faldet ud»** — ikke et grundlag endnu: funktionerne er dage gamle, og mange medlemmer er ikke kommet i gang. Kortet «19 af 27 er faldet ud» har sit eget kriterium og sin næste måling 8/10.
- **Tidligere medlemmers sager** står ikke på nogen af listerne.