# Værdilisten — hvad vi lukker, og i hvilken rækkefølge (3/10-2026)

**Hvad det er:** en rangering af alle 209 åbne kort i `docs/mangelliste.html` (merget til main i #1264), en top-liste med præcise færdig-definitioner, alt der venter på Jonas samlet ét sted og en plan for søndag 4/10. Kun dokumentation. Intet er skrevet i prod, og der er ikke kørt nye SELECT'er til dette dokument: alle tal er fra gennemgangen 3/10 (kortenes «Målt 3/10», «Livetjek 3/10», «Rådet 3/10»), fase 2-recon'erne (hastighed · drift/sikkerhed/datakvalitet · brug; arbejdsfiler uden for repoet, sammenfattet i OVERLEVERING DEL 2 «3. oktober — mangellisten gennemgået») og `docs/aabne-opgaver.md` på grenen `docs/aabne-opgaver` (målt 3/10 ca. 04–05). Hvor et tal er mit eget skøn eller udledt, står det.

**Version 2 (3/10, efter rådets «ret først»):** seksten fund rettet — Klaviyo-punktet skåret til flowene (kampagnerne er allerede rigtige), `webinar-mail-cron` holdes tilbage til efter 6/10 kl. 10:15, sikkerhedspakken i to trin, F åbner kl. 08 med Update-målingen som dagens første handling, Update som fælles kanal (§4.2), migrationer i runder, Jonas' belastning regnet realistisk med en beslutning om «Kør selv» (§4.5), nicklas-beviset bundet til #1257, skive 3's status, stakkens nye rækkefølge (#1262 øverst), 13 manglende beslutningskort placeret, fem punkter tilføjet, fase 3a med dato, agentbeviset rettet, Bunny-secrets på én dag, og henvisning til spec'en for den interaktive pakke og SMS-recon'en. Hvad der er rettet og hvorfor står i §6.

**Rammen (Jonas 3/10):** «Vi gider ikke flere åbne opgaver hele tiden … tingene skal afsluttes og testes og lukkes.» **Færdig = merget, udrullet, bevist live som rådgiver OG som medlem, og kortet lukket** («LUKKET d/m — <beviset>» på kortet i mangellisten). Et kort, der kun er merget, er ikke færdigt. En pakke, der ikke kan nå færdig samme dag, startes ikke — den skæres til en skive, der kan.

---

## 0. Det korte

**Top 10 (rækkefølgen efter overstyringerne i §1):**

| # | Hvad | Kort | Frist | Hvem · model |
|---|---|---|---|---|
| 1 | To fejlende Stripe-træk: ring til de to, slå Stripes «efter sidste forsøg» op | `g03-to-traek-fejler` | 5/10 08:02Z og 7/10 09:01Z | Jonas · Claude (Opus, kun læsning i Stripe) |
| 2 | «Om to uger»-hullet: dommen taber den, der blev holdt tilbage uden forsøg | `g03-fjorten-dage-otte-mangler` | før `syv_dage` 6/10 08:00 | Jonas beslutter · Claude (Fable) |
| 3 | Webinarstakken mod åbningen 14/10 — ny rækkefølge med #1262 øverst, `webinar-mail-cron` holdt tilbage til 6/10 kl. 10:15 | `a01-capi-webinar` + PR #1255–#1263 | go/no-go 9/10 | Jonas (§8.2) · Claude (Fable) |
| 4 | Luk det igangsatte: Update-målingen (dagens første handling), tre Bucket A-functions, nicklas-linket, #1146 | U-punkt 30, `a01-bucket-a-bevis`, `a01-nicklas-link`, `g03-event-lokation`, `a29-overblik-bevis` | nicklas FØR nogen udrulning af `webinar-delt` | Claude (Haiku · Sonnet) · Jonas (delingslink) |
| 5 | Tallene rigtige: AI-skemaets fem grupper, så genkørslen af de AI- og PDF-læste | `m17-ai-skema-grupper`, `m17-saldobalance-pdf-uden-i-alt`, `m17-koerelisten` | — | Jonas ja til overskrivning · Claude (Opus) |
| 6 | Restore er aldrig prøvet | `g03-restore-uproevet` | — | Jonas (Lovable → Cloud) |
| 7 | run-company-agent: F0-rettelsen + «mål» i stedet for «milestone» + nyt DEPLOY_STAMP, én udrulning, bevist søndag ved et kald | `a01-agent-bevis`, `a02-akademi-f0`, `g03-agent-milesten-ord` | — | Claude (Opus) |
| 8 | Persondatatekster, der er sande: Meta/Google nævnt, og sletteløftet holdt eller rettet — samme arbejde som webinarets privatlivstekst B4 | `g03-persondata-meta`, `a18-jurist`, `a18-sletteloefte` | før første CAPI-hændelse fra motoren | Claude (Opus) skriver · Jonas godkender |
| 9 | Klaviyo: R63TqD erstatter Xr6Pm9 i Velkomst TGxxUc og Sunset XCqPKg (kampagnerne er allerede rigtige) | `g03-klaviyo-r63tqd-erstatter` | ingen hård — flowet kører hver dag | Jonas/Morten i Klaviyo · Claude (Haiku) beviser |
| 10 | Legacy-nøglerne, fase 3a første skive: vault-posten + `20261002290000` + én Bucket B-function bevist | `a01-legacy-noegler`, `g03-verify-jwt-fase3a` | man 5/10 kl. 12 (O2: risiko 5, fristen «Late 2026» er ukendt) | Jonas + Claude (Fable) |

Hastighed, første skive (`a22-forside-langsom` (a)) er nr. 11 og er stadig søndagens pakke D — den mistede pladsen i top 10 til fase 3a, fordi en risiko 5 med en ukendt hård frist vejer tungere end en kendt irritation (§1.3 O2).

**Hvad brugen siger (fase 2, målt 3/10) — fire beslutninger, ikke byggeopgaver:**

| Fund | Tallet | Beslutningen (kort) | Hvad det betyder for listen |
|---|---|---|---|
| Chatten og Dine tal bærer værdien | chat: 15 personer / 14 virksomheder skrev på 30 d (mod 11); tal: 11 virksomheder uploadede og fik første måned godkendt — men **10 af 28 har ALDRIG fået en måned godkendt** | Hvad var aftalen med de 10, og er hindringen produkt, onboarding eller forventning? (`g03-dine-tal-brug-8-10`, 8/10) · husets svartidsløfte (`g03-svartid-19-timer`; median 19,4 t) | Brugsfaktor 1,25; pakke B søndag |
| Dine mål bruges næsten ikke | 3 af 28 med bekræftet mål; 30 ubekræftede (agent/handout/ai, ingen fra en rådgiver); kvartalstjek 0; 165 skridt udløbet mod 18 gjort | Sætter rådgiverne målene SAMMEN med medlemmet? Færre skridtforslag? (`g03-dine-maal-bruges-ikke`) | Ingen polering af Dine mål før svaret |
| Akademiet falder | «set» 13 → 6 personer, «gennemført» 12 → 5 (30 d mod 30 d) | Hvad gør vi ved faldet? (`g03-akademiet-falder`) | Ingen kursusbeskrivelser/nye lektionsflader før svaret |
| Netværket læses, skrives ikke | 17 læser, 16 tilmelder sig events; 3 tråde og 2 svar fra medlemmer på 30 d | Skal medlemmer skrive mere — og hvordan? (`g03-netvaerket-laeses-ikke-skrives`) | Ingen medlem-til-medlem før svaret |

**Jonas' næste fem handlinger** (resten i §3): (1) svar på webinarmotorens §8.2 B1–B9 før søndag 08:00 — og på beslutningen i §4.5 («Kør selv» søndag?); (2) ring/skriv til de to med fejlende træk før mandag 08:02Z (10:02 dansk); (3) Bunny-biblioteket og de tre webinar-secrets søndag (én runde, §4.3); (4) afgør de højst 3 uden invitation før tirsdag 08:00; (5) grønt lys (eller nej) til sikkerhedspakken E trin 1a (§4).

**Søndag 4/10:** fire pakker åbner kl. 08 (A webinarstakken · B tallene · C agent + forsidefejl · **F beviser**), og dagens første handling er F's Update-måling i en frisk fane, før noget nyt merges. D (hastighed) tager den første ledige plads, E (sikkerhed, trin 1a) den næste. Migrationer i runder kl. 09, 12, 16, 19; deploy-runder kl. ca. 11, 15, 19. Højst fire åbne ad gangen (§4.1).

---

## 1. Scoringen

### 1.1 Formlen

For hvert åbent kort er «Værdi 3/10»-linjen (rådets rettelser har forrang) regnet om sådan:

```
værdi      = medlem + rådgiver + 1,5 · forretning + 1,5 · risiko          (0–25)
justeret   = brug(sted) · (medlem + rådgiver) + 1,5 · forretning + 1,5 · risiko
prioritet  = justeret · status ÷ indsats
             indsats: S = 1 · M = 2 · L = 4
             status:  fejl = 1,25 · mangler = 1 · beslutning = 1 · idé = 0,5
```

**Hvorfor 1,5 på forretning og risiko:** de to er det, der koster penge eller tillid, når det står — en fejlet betaling, en mail til den forkerte, et hul i adgangen. Medlem og rådgiver er vigtige, men en forbedring for et medlem kan vente en uge; en tabt betaling kan ikke. **Hvorfor fejl × 1,25:** regelsættet §4a — «fejl, som et medlem, en rådgiver eller Jonas rammer, går altid forrest». **Hvorfor idé × 0,5:** §4a — nye funktioner bygges kun, når gevinsten er målt; ellers lægges de frem. **Hvorfor ÷ indsats:** Jonas' ramme er at lukke; to små færdige kort er mere værd end ét stort halvt.

### 1.2 Brugsfaktoren (fase 2-brug, målt i prod 3/10)

Brugsfaktoren ganges KUN på medlem + rådgiver (glæden ved fladen), ikke på risiko og forretning — en sikkerheds- eller pengefejl er lige alvorlig på et sted, ingen bruger.

| Sted | Faktor | Begrundelse (fase 2, universet 28 virksomheder / 26 personer) |
|---|---|---|
| Din rådgiver (chat) | 1,25 | Bærer værdien: 15 personer / 14 virksomheder skrev seneste 30 d (mod 11 før); 15 åbnede chatten seneste 7 d. |
| Dine tal | 1,25 | Bærer værdien: 11 virksomheder uploadede seneste 30 d (mod 8), 11 fik en måned godkendt første gang (mod 6). Og hullet er stort: 10 af 28 har ALDRIG fået en måned godkendt. |
| Dit Boardroom, rådgiverfladen, betaling, indgang, webinar, drift | 1,0 | Brugt dagligt (login 18 personer/7 d; rådgiverne 2 aktive) eller forretningskritisk uden «brug» i snæver forstand. |
| Netværket | 0,75 | Læses (17 personer) og events tilmeldes (16 personer), men skrives næsten ikke: 3 tråde og 2 svar fra medlemmer på 30 d. Fordele/Anbefal er umålt. |
| Akademiet | 0,75 | Falder: egne «set» 13 → 6 personer, «gennemført» 12 → 5. |
| Dine mål | 0,75 | Bruges næsten ikke: 3 af 28 med bekræftet mål, kvartalstjek 0, 165 skridt udløbet mod 18 gjort. |

**Konsekvensen, skrevet ud:** et sted, ingen bruger, får ikke værdi af at blive poleret. Kort, der kun forbedrer Dine mål, Akademiet eller Netværkets skriveflade, står derfor lavt, indtil Jonas har truffet beslutningerne `g03-dine-maal-bruges-ikke`, `g03-akademiet-falder` og `g03-netvaerket-laeses-ikke-skrives` (§3). Fejl på samme steder (fx «VENTER PÅ JERES JA» to gange) står stadig højt nok til at blive taget, fordi de er små og rammer dem, der faktisk kommer.

### 1.3 Overstyringerne (formlen sorterer; mennesket overstyrer — og skriver hvorfor)

| | Regel | Hvad den flyttede |
|---|---|---|
| O1 | **«Haster» med en frist inden for 7 dage går først**, uanset tal. | `g03-to-traek-fejler`, `g03-fjorten-dage-otte-mangler`. **`g03-klaviyo-r63tqd-erstatter` er IKKE længere O1** (rettet v2): fristen var kampagne #5 7/10, og #5 (7/10) og #6 (15/10) ekskluderer allerede både R63TqD og Xr6Pm9 (målt i Klaviyo-API'et af rådet 3/10). Tilbage er Velkomst og Sunset, som ingen hård dato har — nr. 9. |
| O2 | **En hård dato med en følge, der ikke kan gøres om**, løftes, så den er færdig i god tid. | `a20-bevis-slettes-dag-45` (26/10: CARMA's tal er væk for altid), webinarstakken (9/10 og 14/10), `m28-flows-uden-optagelse` (Deltog-flowet efter 13/10), `g03-ring-mig-op-bevis` (beviset kan kun tages 13/10 efter kl. 11), og **`a01-legacy-noegler` — risiko 5 med en hård, men UKENDT frist** (Supabase fjerner legacy-nøglerne «Late 2026, TBC»): når fristen ikke kan kendes, er den eneste sikre dato «så tidligt som muligt». Første skive får derfor en fast plads (man 5/10 kl. 12) og top 10 (rettet v2; før stod den med «Søn 4/10» uden plads i søndagsplanen). |
| O3 | **Det, der er sat i gang, lukkes før nyt** (Jonas' ramme). Merget-men-ikke-udrullet og «bevis udestår» løftes, fordi de er billige og lukker kort. Derfor åbner F kl. 08 (rettet v2). | `a01-bucket-a-bevis`, `a01-agent-bevis`, `a29-overblik-bevis`, `a01-nicklas-link`, `w11`, `g03-event-lokation` (#1146 åben i fire dage), U-punkt 30 (Update-målingen), PR #1043 (åben 13 dage). |
| O4 | **Ejeren oplever platformen som langsom.** Anmelderne satte rådgiver 3 og «M» på `a22-forside-langsom`; men del (a) er lille (målt 1,49 s pr. rådgiverindlæsning) og rammer begge rådgivere hver dag. | `a22-forside-langsom` (a) fra nr. 134 til top 10; `a22-rls-initplan` løftet ind i sikkerhedspakken, fordi den rører de samme politikker. |
| O5 | **Beslutningskort er ikke byggeopgaver.** Høj værdi + «beslutning» flyttes til Jonas-listen (§3), og «færdig» er da en bogført beslutning, ikke kode. | `g03-dine-tal-brug-8-10` (nr. 4 i formlen), `m17-manuelle-rettelser`, `g03-svartid-19-timer`, `g03-pass-uden-facts`, `m17-brroset-runde-tusinder`, `m17-rallysupport-to-eksporter`. |
| O6 | **Afhængighed før værdi:** et kort, der kun giver mening efter et andet, rykker med det. | `m17-koerelisten` efter `m17-ai-skema-grupper`; `g03-retries-opbrugt-faktura` efter Stripe-opslaget i `g03-to-traek-fejler`; `m28-tragten-foer-skemaet` efter #1261 (samme `/ansoeg`); vagtpakken efter #1258 (samme `drift-agent-cron`). |
| O7 | **Idéer med den største medlemsværdi straffes af formlen** (L × idé). Det er bevidst — men den største skal ikke glemmes. | `g03-economic-integration` (medlem 5 · forretning 5; formel-nr. 161) står i «Ikke nu» med en dato for, hvornår den tages op (§5). |

### 1.4 Kritik af metoden (læs før tallene bruges)

- Værdierne 0–5 er anmeldernes **skøn**, efterprøvet af rådet på en stikprøve — ikke målinger. Formlen gør skønnene sammenlignelige; den gør dem ikke sandere.
- To kort med samme tal kan have helt forskellig hast. Derfor overstyringerne — og derfor står fristerne i §3, ikke i formlen.
- Brugsfaktoren bygger på 30 dages data fra et lille univers (26 personer). Én aktiv virksomhed mere flytter procenterne mærkbart.
- Der findes arbejde uden kort: webinarstakken (#1255–#1263), SMS, udrulningen af #1156-sikkerhedsfixene og Update-målingen af #1224–#1254. De står i top-listen som **U-punkter** med forslag til nye kort.

Hele rangeringen af de 209 kort står i Bilag A.

---

## 2. Top-listen (30)

**Rækkefølgen i §0 gælder.** Numrene herunder er v1's og bevares, så henvisninger fra OVERLEVERING og kortene holder; punkt 31–34 er nye i v2.

Format pr. punkt: **værdien** i én sætning · **færdig** (merge · SQL editor · udrulning · bevis · livetjek rådgiver/medlem · kortet lukket) · afhænger af · hvem · model · indsats · formlens tal (prioritet / justeret værdi / plads i Bilag A).

Model efter `docs/claude-regelsaet.md` §5: Haiku = bogføring, recon, målinger; Sonnet = almindelig kode og mindre flader; Opus = motorer, data, spejl; **Fable = penge, mails til rigtige mennesker, adgang, offentlige endpoints** (også som CTO i rådet, §4b). Fable er tilgængelig fra søndag 08:00; lørdag kører kun Opus/Sonnet/Haiku.

### 1. To fejlende Stripe-træk — `g03-to-traek-fejler` (HASTER)
- **Værdi:** to betalende medlemmer kan miste adgangen, og vi ved ikke, hvad Stripe gør efter sidste forsøg.
- **Færdig:** (1) Jonas har talt med begge (TBR-0018 før 5/10 08:02Z, TBR-0014/YKRG før 7/10 09:01Z), udfaldet bogført i OVERLEVERING; (2) abonnementernes «efter sidste forsøg» (cancel / unpaid / past_due) slået op i Stripe live (Stripe-MCP, `stripe_context` + `livemode: true`, kun læsning) og skrevet ind på kortet og i `g03-retries-opbrugt-faktura`; (3) klokkens svingende modtagerantal (2/1/3) målt i `advisor_notifications` og forklaret; (4) efter 7/10: `company_traek` viser begge træk betalt eller en bogført aftale — kortet lukkes med det.
- **Afhænger af:** intet. **Hvem:** Jonas (opkald) · Claude (opslag). **Model:** Opus (penge, men kun læsning). **Indsats:** S. **Formel:** 21,9 / 17,5 / nr. 1.

### 2. «Om to uger» tabte dem, der aldrig blev forsøgt — `g03-fjorten-dage-otte-mangler` (HASTER)
- **Opdateret 3/10 kl. 11:30:** recon'en målte årsagen (budgettet sultede den alfabetiske hale bag 211 fejlede — ikke loft/pause; 3 uden invitation, 5 med) og rettelsen er bygget på MAIN, ikke oven på #1258: PR #1269 (CTO godkendt). Skiverne herunder er afløst af #1269 + Jonas' ja/nej; se OVERLEVERING «3. oktober kl. 11:30».
- **Værdi:** dommen dømmer en, der blev holdt tilbage af loft/pause/budget uden forsøg, som «sen tilmelding» og taber mailen tavst; samme mønster kan ramme hver art.
- **Kritisk note:** kortets skridt (1) — «mål årsagen for de 8 i `net._http_response` 29/9» — **kan ikke længere tages**: pg_net-svar lever ca. 6 timer (regelsættet (mm)), og driftsagentens log begyndte først 30/9. Årsagen kan kun udledes (probationspausen 29/9 er den sandsynlige), ikke måles. Skriv det på kortet.
- **Færdig, i to skiver:**
  - **Skive 1 (før 6/10 08:00, ingen kode):** Jonas' to svar bogført (de højst 3 uden invitation: ja/nej til en invitation på anden vis; skal «udsat/over_loft» tælle som bevis for, at personen var klar). En SELECT, der sammenligner tilmeldte (ikke afmeldte) med `ok`-rækker pr. art for 13/10, er skrevet mod skemaet og køres **6/10 kl. ca. 10:15 dansk** (efter `syv_dage`' nåde på 2 timer) — resultatet bogført.
  - **Skive 2 (kode, bygget OVEN PÅ #1258, fordi både #1257 og #1258 ændrer `webinar-mail-cron` og #1258 `_shared/webinarMailDom.ts`; udrulles tidligst efter 6/10 kl. 10:15 — se §4.4 punkt 2a):** en markør i sporet ved udsættelse (eller tilsvarende), så en udsat person indhentes som en fejlet; paritetstest i begge spejle; værn; råd (Fable); merge efter stakken; eksplicit deploy af `webinar-mail-cron`; beviset = svarets nye felt i en tørkørsel; kortet lukkes.
- **Afhænger af:** Jonas' to svar; skive 2 af #1258. **Hvem:** Jonas · Claude. **Model:** Haiku (skive 1-SQL) · Fable (skive 2). **Indsats:** M. **Formel:** 8,75 / 14,0 / nr. 3.

### 3. Klaviyo: R63TqD i Velkomst og Sunset — `g03-klaviyo-r63tqd-erstatter` (§0 nr. 9; ikke længere «haster»)
- **Rettet v2 (rådet 3/10, målt i Klaviyo-API'et):** kampagne #5 (7/10) og #6 (15/10) **ekskluderer allerede BÅDE R63TqD og Xr6Pm9**. Kampagnerne er rigtige og beholder begge. Punktet er skåret til de to flows, hvor Xr6Pm9 stadig står alene: **Velkomst TGxxUc** (flowfilter) og **Sunset XCqPKg**. Listen Xr6Pm9 har **26** profiler (v1 skrev 25), segmentet R63TqD 31. **«Op til 6 medlemmer» er ikke målt** — 31 − 26 = 5 er en forskel i antal, ikke et mål for, hvor mange medlemmer der står i segmentet og ikke på listen (eller omvendt); det kræver en sammenligning profil for profil.
- **Værdi:** et medlem, der ikke står på den håndfyldte liste, kan få velkomst- eller sunsetmails; flowene kører hver dag, så der er ingen hård dato, men heller ingen grund til at vente.
- **Færdig:** (1) R63TqD erstatter Xr6Pm9 i flowfiltret på Velkomst TGxxUc og på Sunset XCqPKg; Claude læser **ufiltreret gennem flowet** (Klaviyo-regel 5–6: en flowmails skabelon og filtre findes gennem flowet, aldrig i `GET /api/templates`) og viser `get_flow` med R63TqD og uden Xr6Pm9 for begge; (2) forskellen liste/segment MÅLT profil for profil (`get_profiles_for_list` Xr6Pm9 mod `get_profiles_for_segment` R63TqD: hvem står kun ét sted, og hvorfor) og bogført; (3) **Xr6Pm9 fjernes fra kampagnerne og slettes først, når (2) er målt og forklaret** — ved et nyt kort; kortet lukkes efter (1) og (2).
- **Afhænger af:** intet. **Hvem:** Jonas/Morten i Klaviyo (eller `klaviyo-motor` med `betingelser`) · Claude beviser og måler. **Model:** Haiku. **Indsats:** S. **Formel:** 12,0 / 12,0 / nr. 2 (før O1 faldt bort).

### 4. Webinarstakken til åbningen 14/10 — U-punkt + `a01-capi-webinar`
- **Værdi:** webinaret er leadkanalen; at eje det fjerner eWebinar-afhængigheden og giver tragten på id (`ansoegninger.webinar_tilmelding_id`). Jonas har besluttet at fortsætte og ikke gå på kompromis med den interaktive pakke.
- **Færdig (hele stakken):** se §4.4 — merge #1255 → #1256 → #1257 → #1258 → #1259 → #1261 → #1263 → #1262 (ombygget, ØVERST — rettet v2), hver migration KØRT og målt FØR merge (regelsættet §1a), secrets sat, functions udrullet med beviserne i §8.1 trin 5 i `docs/webinarmotor.md`, intern prøve 6–7/10 på fysiske telefoner MED LYD, go/no-go 9/10 bogført, `CompleteRegistration` set i Events Manager → Test events, `webinarmotor_offentlig_aktiv` = true 14/10 og den første eksterne tilmelding som `P-<uuid>` med bekræftelsen `ok`. Livetjek som rådgiver (`/webinar/motor`, konsollen) og som seer (en egen testadresse på telefon). `a01-capi-webinar` lukkes, når #1262 er bygget om, merget og låsen er åbnet efter B4.
- **Afhænger af:** Jonas' §8.2 B1–B9; privatlivsteksten (punkt 8). **Hvem:** Jonas · Claude. **Model:** Fable (offentlige endpoints, mails, Meta). **Indsats:** L (i mange skiver). **Formel:** `a01-capi-webinar` 10,5 / 10,5 / nr. 23; stakken har intet kort — **foreslås som nyt kort `g04-webinarmotor-aabning`**.

### 5. Tallene rigtige — `m17-ai-skema-grupper` → `m17-saldobalance-pdf-uden-i-alt` → `m17-koerelisten`
- **Værdi:** Dine tal bærer platformens værdi (brugsfaktor 1,25); AI-læste rapporter hos 12 virksomheder taber fem omkostningsgrupper, og 5 af 8 PDF-virksomheder er ikke genkørt efter #982.
- **Færdig:** (1) PR: fem felter i `key_figures` + prompten i `extract-financial-data` (pension, øvrige personale, autodrift, andre eksterne, ekstraordinære), test af regnestykket gennem `omkostningsnoegler.ts`; råd; merge; eksplicit udrulning; beviset = én nybehandlet AI-rapport med en af de nye nøgler i `metrics`; (2) snapshot oprettet (`udkast-genkoersel-plan/03-snapshot-og-rollback.sql`, tabellerne findes ikke i prod) — **Jonas' ja, fordi genkørslen overskriver facts** (§3); (3) genkørsel i hold à 10: PDF-rapporterne (KJ AUTO, Rallysupport, Nordic, remm., Doggybed, BRILLEVÆRK, Floren, Capture IT's 5) og de AI-læste — Topix.dk tages ud; (4) «udækket» målt før/efter pr. virksomhed og bogført; (5) livetjek som rådgiver på virksomhedssiden (to virksomheder) og som medlem i virksomhedsvisning (Dine tal: en måned med de nye grupper); kortene `m17-ai-skema-grupper` og `m17-saldobalance-pdf-uden-i-alt` lukkes; `m17-koerelisten` omskrives til ANLA alene (venter på `m17-manuelle-rettelser`).
- **Afhænger af:** Jonas' ja til overskrivning. **Hvem:** Claude. **Model:** Opus. **Indsats:** M (samlet). **Formel:** 16,5 / 16,5 / nr. 5–6 og 44.

### 6. Restore er aldrig prøvet — `g03-restore-uproevet`
- **Værdi:** risiko 5 — «en backup, man ikke har prøvet, er en antagelse».
- **Færdig:** Jonas har fundet «Backups»/PITR i Lovable → Cloud (eller fået Supports svar), gendannet én tabel til et testprojekt, og det står i OVERLEVERING og `docs/prod-hjem.md` med dato; kortet lukket.
- **Afhænger af:** intet. **Hvem:** Jonas. **Model:** — (Haiku bogfører). **Indsats:** S. **Formel:** 15,0 / 15,0 / nr. 7.

### 7. run-company-agent, én udrulning — `a01-agent-bevis`, `a02-akademi-f0`, `g03-agent-milesten-ord` (agentdelen)
- **Værdi:** agenten tror i dag, at medlemmet selv har gennemført 199 backfillede lektioner, siger «milestone» til medlemmer, og ingen kan se, hvilken kode der kører.
- **Rettet v2 (påstanden):** v1 skrev «ingen kan se, hvilken kode der kører». Det rigtige er: `agent_runs.deploy_stamp` viser **«v7 tjenestekonti (2026-09-30)»** på alle kørsler siden 30/9 (10 stk., senest **2/10 12:53 UTC**, målt 3/10). Stemplet blev ikke bumpet i #1191, #1215 eller #1224, så databasen kan ikke skelne, om de tre er udrullet (#1215 og #1224 er merget efter udrulningen 1/10 01:26 og ikke bogført udrullet). Vi ved altså, at «v7-stemplet» kører — ikke hvilke merges bag det, der er med.
- **Færdig:** PR: `index.ts` læser fremskridt gennem `itemProgressState`/`erRaadgiverensStempel` (ikke rå `acknowledged_at`), prompt og værktøjsbeskrivelser siger «mål», `DEPLOY_STAMP` = «v8 … 2026-10-04»; test; råd (Opus); merge; eksplicit udrulning (build-chat, `get_diff` tom); **beviset tages SØNDAG ved et kald, ikke ved at vente på en godkendt rapport** (rettet v2): en tørkørsel, hvis functionen har en; ellers ét manuelt kald for testvirksomheden Topix.dk ApS (kontakt@topix.dk, regelsættet §2) — og beviset er den nye `agent_runs`-række med v8 (eller v8 i svaret). Har functionen hverken tørkørsel eller en sikker vej til ét kald på testvirksomheden: STOP og spørg Jonas, før der kaldes på en rigtig virksomhed. Livetjek som medlem (virksomhedsvisning): agentens næste skridtforslag uden «milesten». `markeret_af` = null på de 199 bogføres som «ukendt rådgiver» (anbefaling — ingen backfill uden kilde). Kortene lukkes.
- **Afhænger af:** intet. **Hvem:** Claude. **Model:** Opus. **Indsats:** S–M. **Formel:** 11,0 / 11,0 / nr. 19 og 26.

### 8. Persondatatekster, der er sande — `g03-persondata-meta`, `a18-jurist`, `a18-sletteloefte` (+ webinarets B4)
- **Værdi:** `meta_send_aktiv` = true sender hashede ansøgerdata til Meta NU, og teksten nævner ikke Meta; samme afstemning skal laves for webinarets privatlivstekst (B4), før motoren sender én CAPI-hændelse.
- **Tilføjet v2 — `a18-sletteloefte` (risiko 4):** formularen og persondatateksten lover «ufærdig slettes efter 30 dage» og «op til 12 måneder»; intet job holder løftet (ansøgningens eneste cron er `ansoegning-rykker`). Samme PR afgør: enten en slette-cron (kladder > 30 d uden `indsendt_at`; lukkede > 12 mdr. uden venteplads — tørkørsel som standard, sletning er §3 og kræver Jonas' ja) eller teksten rettes til det, vi faktisk gør. Hænger sammen med beslutningen `g03-opbevaringspolitik` (§3).
- **Færdig:** én PR, der afstemmer `src/lib/ansoegning/persondata.ts` mod `docs/tracking.md` §2 række for række (Meta, Google, Klaviyo; hvad, til hvem, hvordan man beder sig fri — `meta_fravalg`); et udkast til topix.dk-teksten (site-repoet er ikke i sessionen — Jonas publicerer); Jonas har læst aftale v3 pkt. 5.1/5.3, de tre betalingsmodeller og bindingen og bogført «læst af Jonas d/m, rettet: …»; Update; livetjek som anonym på `/ansoeg` (teksten) og på topix.dk (efter Jonas' publicering). Kortene lukkes.
- **Afhænger af:** Jonas' gennemlæsning. **Hvem:** Claude skriver · Jonas godkender/publicerer. **Model:** Opus. **Indsats:** S. **Formel:** 12,5 / 10,0 / nr. 16 og 9.

### 9. Tre Bucket A-functions uden udrulning — `a01-bucket-a-bevis`
- **Værdi:** fristreglerne for skridt og mål (#1216) håndhæves i dag kun i fladen, ikke serverside (rådet: risiko 4).
- **Færdig:** eksplicit deploy af `opgave-accepter`, `opgave-udskyd`, `maal-skriv` (én build-chat-besked, værktøjets svar citeret, `get_diff` tom); beviset med testmedlemmet kontakt@topix.dk (regelsættet §2): `opgave-udskyd` → `begraenset_til_maalets_frist` eller `ved_maalets_frist`, `opgave-accepter` → `maalet_ikke_aktivt`/`efter_maalets_frist`, `skridt-tilfoej` → 400 `efter_maalets_frist`; `maal-skriv` «rediger» med et direkte kald; Update, hvis udskyd-toasten ikke er ude (mål i frisk fane); kortet lukket.
- **Afhænger af:** intet. **Hvem:** Claude. **Model:** Haiku (deploy + bevis; testdata kun på testmedlemmet). **Indsats:** S. **Formel:** 10,5 / 10,5 / nr. 22.

### 10. Hastighed, første skive — `a22-forside-langsom` (a), `g03-ydeevne-sentry`, `g03-region-compute-rundtur`
- **Værdi:** ejeren synes, platformen er langsom; rådgiverens forside venter op til 4 s på et kald, der næsten altid svarer `no_pending_invitation` (målt 1,49 s).
- **Færdig:** (0) FØR: SELECT — kan en rådgiver have en afventende `company_invitations`-række (tal, ingen mails)? Svaret bogført; er det 0 og umuligt efter `handle_new_user`, springes PPI over for rollen advisor uden `invite_token`; (1) PR: `useAuth.tsx`/`authIndlaesning.ts` + `build.rollupOptions.output.manualChunks` (react · supabase · sentry · tanstack) i `vite.config.ts`; tests; merge; Update; (2) beviset i FRISK fane som rådgiver: PPI kaldes ikke, antal kald og «sidste kald færdigt» før/efter (baseline 57 kald / 4.272 ms), hoved-chunkens størrelse målt i drift; som medlem: forsiden indlæses som før (ingen regression); (3) Sentry → Performance: de fem tungeste p95 skrevet i OVERLEVERING; (4) **Jonas** måler «Waiting for server response» på et trivielt REST-kald fra Silkeborg to gange — over 150 ms uden kold start → regionsspørgsmålet bliver et beslutningskort. Kortene lukkes; `a22-forside-langsom` omskrives til (b) = `g03-advisor-dashboard-skala`.
- **Afhænger af:** SELECT'en. **Hvem:** Claude · Jonas (måling). **Model:** Sonnet (kode) · Opus i rådet (auth-sti). **Indsats:** S. **Formel:** 3,75 / 6,0 / nr. 134 → **O4**.

### 11. Forsidens tre fejl fra livetjekket — `g03-bank-som-i-november`, `g03-din-plan-dobbelt-overskrift`, `g03-agent-milesten-ord` (forsidedelen)
- **Værdi:** det medlemmet ser først, siger «BANK est. 3.517 kr. som i november», «VENTER PÅ JERES JA» to gange og «milestone».
- **Færdig:** én frontend-PR: bank og retning kun af målte rækker (eller «estimat fra årsregnskabet» uden retning) i `dinMaaned.ts`; én overskrift i «Din plan»; «mål» i `nextStep.ts:630`; et værn, der fælder «milesten/milestone» i medlemsrettet tekst; `forsidePlan.guard` ajourført; Update; livetjek som rådgiver i virksomhedsvisning Floren Engros på 1440 og ~400 px (§4b-gennemsynet); kortene lukket.
- **Afhænger af:** intet (agentdelen er punkt 7). **Hvem:** Claude. **Model:** Sonnet. **Indsats:** S. **Formel:** 8,75 / 7,0 / nr. 41 og 154 og 153.

### 12. Sletningens bevis før CARMA — `a20-bevis-slettes-dag-45`, `a18-carma-25-9`, `g03-udloebet-uden-for-sletning`
- **Værdi:** 26/10 slettes første rigtige virksomhed; uden «sidste login» og «logins 90 dage før slut» i stemplet kan vi aldrig måle, om fornyelsesklokkerne virkede.
- **Færdig:** PR: `slet-medlemsdata-cron` skriver `sidste_login_at` og `logins_90_dage_foer_slut` i `data_slettet_raekker` (jsonb, ingen migration), tørkørslen viser felterne; råd (Fable: sletning); merge; eksplicit udrulning; beviset = tørkørsels-svar med felterne; Jonas har afgjort CARMA (ring eller sletning; slutdato 7/9 eller 11/9 — en guarded UPDATE kun med hans ja) og kunden uden for ordningen (engangssag eller bevidst behold); kortene lukket — CARMA-kortet først, når 26/10 (eller 22/10) er passeret, og stemplet er læst.
- **Afhænger af:** Jonas' to afgørelser. **Hvem:** Claude · Jonas. **Model:** Opus (kode) · Fable (råd). **Indsats:** S. **Formel:** 9,5 / 9,5 / nr. 34.

### 13. Klaviyos «Deltog» lover en optagelse, der er taget ned — `m28-flows-uden-optagelse` (+ `m28-pris-to-tal` b)
- **Værdi:** efter 13/10 får ~370 tilmeldte en mail, hvis tekstdel linker til en død side og siger prisen uden form.
- **Færdig:** TYARdA's tekstdel rettet GENNEM FLOWET via `klaviyo-motor` (ingen optagelse; prisen «4.167 kr./md. ved én betaling · 4.375 kr./md. i tolv rater»; ring-op-linket bag samme betingelse), de fire andre skabeloners tekstdel tjekket; `klaviyo_spor` uden `klaviyo_afveg`; Jonas' Preview-mail læst; webinarets slides rettet (Morten); kortet lukket før 13/10.
- **Afhænger af:** intet. **Hvem:** Claude · Morten (slides). **Model:** Opus. **Indsats:** S. **Formel:** 10,0 / 10,0 / nr. 28.

### 14. Sikkerhed med grønt lys — `g03-security-definer-anon`, `a02-milestones-with-check`, `g03-with-check-15-politikker`, derefter `a22-rls-initplan`
- **Værdi:** anon kan kalde en skrivende funktion uden auth (`cleanup_stale_processing_reports()`) og læse rådgivernes navne; et medlem kan flytte egen række til en fremmed virksomhed på 17 politikker. `a22-rls-initplan` rører de SAMME politikker og giver hastighed (skøn 0,2–0,5 s på forsiden) — derfor i samme pakke, efter.
- **REVOKE i to trin (rettet v2, rådet 3/10) — risikoen på `g03-security-definer-anon` hæves fra 3 til 4** (et forkert REVOKE kan lukke `/auth`, `/ansoeg` eller `/aftale` for anonyme):
  - **Trin 1a:** KUN `cleanup_stale_processing_reports`, `get_all_advisor_profiles` og de rent skrivende/markerende funktioner blandt de 18 (dem, ingen anonym flade har grund til at kalde). Listen skrives ud funktion for funktion i migrationen med begrundelsen pr. linje.
  - **Trin 1b:** `has_role`, `user_company_id`, `is_legat_user` — KUN efter (i) en **anon-røgprøve**: i en DO-blok med `RAISE EXCEPTION` til sidst, `SET LOCAL ROLE anon` og en SELECT mod HVER tabel under de 63 politikker, der står for PUBLIC, før og efter REVOKE i samme transaktion — samme antal rækker/samme fejl, ellers STOP; og (ii) **livetjek som anonym** (privat vindue, ingen session) af `/auth`, `/ansoeg`, `/aftale`, `/delt/webinar` og `/ring-mig-op` efter kørslen. Fejler én: rul tilbage med GRANT (står ordret i filhovedet).
  - Søndag: trin 1a. Trin 1b kun, hvis røgprøven er skrevet og grøn, ellers mandag.
- **Færdig pr. trin:** PR med migrationen («IKKE KØRT»-hovedet) + `SECURITY_BASELINE.md`; råd (Fable); **Jonas' grønne lys** (FORBIDDEN-listen); tørkørsel i en DO-blok med `RAISE EXCEPTION` (regelsættet (kk)) inkl. en negativ test som medlem (`SET LOCAL ROLE authenticated` + rigtig `request.jwt.claims`): forsøget på at flytte en række fejler; kørt i SQL editor; EFTER-SELECT (`pg_policy` with_check sat; `has_function_privilege('anon', …)` = false på de 18); hovedet vendt til KØRT; merge; livetjek som medlem (gem et mål, upload en rapport, rediger profil) og som rådgiver (forsiden, virksomhedssiden); kortene lukket. `a22-rls-initplan`: pg_stat før/efter på de ~12 mest brugte tabeller.
- **Afhænger af:** Jonas' grønne lys pr. migration. **Hvem:** Claude · Jonas. **Model:** Fable. **Indsats:** S + S + M (+ M). **Formel:** 7,5 / 4,5 / 4,9 / 2,5 (første tal efter rådets risiko 3 → 4).

### 15. Forsidens dom: «strandet upload» — `g03-strandet-upload`
- **Værdi:** 5 virksomheder har en fejlet upload uden en lykkedes efter; rådgiveren ser det ingen steder — og Dine tal er der, værdien bor.
- **Færdig:** definitionen låst mod `genkoersel.ts:74-78` og tallet målt med den; slags «strandet_upload» i `forsidensDom` med link til virksomhedens tal; test; merge; Update; livetjek som rådgiver: forsiden viser de N; kortet lukket. (`g03-rapporteringsfejl-slags6` er en måling først — Haiku, samme dag, kortet omskrives med tallet.)
- **Hvem:** Claude. **Model:** Sonnet. **Indsats:** S. **Formel:** 12,5 / 12,5 / nr. 14.

### 16. Sessionernes returvej — `w11`
- **Færdig:** Jonas tjekker i Calendly, om de to inviterede (28/9, 29/9) har booket, og om Mortens bookinger er i samme organisation/webhook-abonnement; ellers én testbooking gennem et id-bærende link → rækken skifter til `booked` med `start_tid`, og sessionen står med tid på virksomhedssiden (livetjek som rådgiver); kortet lukket.
- **Hvem:** Jonas · Claude (Haiku). **Indsats:** S. **Formel:** 12,5 / 12,5 / nr. 13.

### 17. Beviser, der lukker kort — `a29-overblik-bevis`, `m16-de-foerste-30-dage`, `m16-klokke-chat`, `m16-fortsaet-forloeb`, `m16-maaske-relevant`, `w13`
- **Færdig:** hvert bevis taget i frisk fane, skærmbillede beskrevet på kortet, kortet lukket — eller omskrevet med det, der faktisk ses (fx `m16-fortsaet-forloeb`: livetjekket 3/10 så linjen skubbet ud hos Floren). `w13` venter på den første rigtige gæst (ingen findes) og lukkes ikke søndag.
- **Hvem:** Claude. **Model:** Haiku. **Indsats:** S.

### 18. Webinar-delt bevist før næste udrulning — `a01-nicklas-link`
- **Færdig:** Jonas opretter et kortlivet delingslink og giver det til Claude; ét svar måles (`maalstreger` med fjerde `maalOrd` «under 7.500 kr.» og intet `kilde`, `koblinger_talt`, `spor.kilder[0].maaling`, 0 × «@»); linket lukkes; kortet lukket.
- **Rettet v2 og runde 2 (rådet):** **#1257 ændrer `webinar-delt` direkte, og #1258 gennem tre delte filer (`webinarDashboard`, `annoncepriser`, `webinarDelingSvar`); #1258 ændrer også `webinarMailAlarm`/`webinarMailDom`, som `drift-agent-cron` bundler. Beviset tages før den første udrulning af `webinar-delt`.** Målingen bag v2's første del: `webinar-delt` ændres i **#1257** (målt 3/10 med `gh api …/pulls/1257/files`: `webinar-delt`, `webinar-mail-cron`, `webinar-motor-cron`, `webinar-puls`, `webinar-rum`, `webinar-tilmeld`); #1258 ændrer af functions kun `webinar-mail-cron`. Beviset skal derfor tages FØR den FØRSTE udrulning af `webinar-delt` efter #1257's merge — uanset hvilken PR, der udløser den. **Søndagens deploy-runder udruller IKKE `webinar-delt`** (§4.3); beviset tages søndag i pakke F, så det er gjort, før nogen runde kan komme til at tage den med.
- **Hvem:** Jonas · Claude. **Model:** Haiku. **Indsats:** S. **Formel:** 9,5 / 9,5 / nr. 32.

### 19. Events får en lokation — `g03-event-lokation` (#1146)
- **Færdig:** migration `20260929210000` kørt (FØR/EFTER), `GET /rest/v1/events?select=lokation&limit=0` → 200, #1146 opdateret mod main og merget, Update, livetjek som rådgiver (sæt en adresse på et event) og som medlem (eventet viser adressen; .ics bærer LOCATION); kortet lukket.
- **Hvem:** Claude. **Model:** Sonnet. **Indsats:** S. **Formel:** 3,75 / 3,75 / nr. 136 → **O3** (en PR, der har ventet i fire dage).

### 20. Udrulningsrunden for koden, der ikke kører — U-punkt (+ `g03-dobbeltmail-1-1`, `m16-auto-deploy-canary`)
- **Værdi:** sikkerhedsfixene fra #1156 (konstant-tids signaturer, ejertjek, rådgivergate) står i `stripe-webhook`, `calendly-webhook`, `manage-advisor`, `extract-annual-report`, `update-annual-report-revenue`, `notify-chat-reply`, `create-stripe-checkout`, `generate-budget-scenarios` uden bogført udrulning (aabne-opgaver §5, LÆST, ikke målt ved kald).
- **Færdig:** (1) først `m16-auto-deploy-canary` som en lille delt `_shared/version.ts` + `?version=1` i de functions, runden rører (ikke alle 116 — så pakken ikke rører alle filer); (2) `g03-dobbeltmail-1-1` i `stripe-webhook` (email_sent_at ved insert); (3) én build-chat-runde for de 8 + `send-report-reminder`, `import-application`, `berig-virksomheder`, `send-welcome-message`, `saet-indgangs-prisniveau`, `send-indgangs-betalingsmail`; (4) beviset = `?version=1` svarer med main's commit for hver; (5) næste 1:1-køb giver én mail (`g03-dobbeltmail-1-1` lukkes dér). **Foreslås som nyt kort `g04-udrulningsrunde-1156`.**
- **Afhænger af:** pakke A's deploy-runder (samme build-chat, én besked pr. runde). **Hvem:** Claude. **Model:** Fable (penge/webhooks). **Indsats:** M. **Dag:** mandag 5/10 eller senere.

### 21. Vagten og driftsagenten — `a02-vagt-jobnavn`, `g03-vagt-roed-gentages`, `a19-betaling-uden-adgang`, `g03-vagt-invarianter`, `w14`, `n14-11`
- **Værdi:** en ikke-200 tabes efter 6 timer; «betaling uden adgang» ses af ingen; edge-fejl har ingen læser; Lovables mailloft-429 er ubevist.
- **Færdig:** `kald_edge` skriver (request_id, jobnavn); agent og vagt gemmer ALLE ikke-200 med jobnavn; opsamlingen deduplikerer på `aftryk`; SELECT'en «betaling uden adgang» (forventet 0) og «tilmeldte mod spor pr. art efter nåden» som fund; migration (vagtens SECURITY DEFINER → grønt lys); deploy af `drift-agent-cron`; beviset = `"drift_agent"` med ny version og en provokeret testfejl med jobnavn; kortene lukket.
- **Afhænger af:** #1258 (rører `drift-agent-cron`/`webinarMailAlarm` via `driftDom.ts`) — bygges oven på stakken. **Hvem:** Claude · Jonas (grønt lys). **Model:** Opus. **Indsats:** M. **Dag:** efter stakkens merge.

### 22. Dag-1-klokken — `g03-dag1-klokke-laas`
- **Færdig:** `klokke-mail-cron` genprøver `venter_paa_velkomst`-dommen ved afsendelse (MORGEN-type), test + værn; merge; eksplicit deploy; tørkørsel; Jonas' guarded UPDATE af `dag1_klokke_aktiv` (SELECT før/efter); beviset næste hverdagsmorgen: en klokke for en virksomhed, der IKKE har fået besked, og ingen for en, der har; kortet lukket.
- **Hvem:** Claude · Jonas. **Model:** Sonnet. **Indsats:** S. **Formel:** 11,0 / 11,0 / nr. 21.

### 23. Mortens hilsen i «dagen før» — `a30-video-dagen-foer`
- **Færdig:** videoen på Bunny; de to URL'er målt uden Referer (stillbillede 200 `image/jpeg`; `/play/<lib>/<video>` 200); Jonas' guarded UPDATE med `aktiv: false`; prøve til lh@greensolar.dk (`video.status "proeve"`); tænding; beviset `taendt` i tørkørslen; **før 12/10 kl. 08:00** (en_dag til 13/10). Ellers bogføres «ikke til 13/10».
- **Hvem:** Morten (video) · Jonas · Claude (Haiku). **Indsats:** S.

### 24. Rådgiverens forside og samtaleliste som RPC'er — `g03-advisor-dashboard-skala`, `g03-samtaleliste-500`
- **Værdi:** forsiden holder til ~60 kunder (43 i dag) og sparer skønsmæssigt 1–2 s; samtalelisten mister allerede «seneste besked» for én kunde (set i fladen 3/10).
- **Færdig:** to SECURITY DEFINER-RPC'er bag rådgiver-gate (grønt lys), paritetstest mod `forsidensDom.ts` og `mark_messages_read`-reglen; migration kørt og målt FØR Update; frisk-fane-måling som rådgiver (antal kald og tid før/efter); Bastant Design viser forhåndsvisning; kortene lukket.
- **Hvem:** Claude · Jonas. **Model:** Fable. **Indsats:** L (samlet). **Dag:** efter pakke D's måling (så gevinsten kan vises).

### 25. Frafaldet før skemaet — `m28-tragten-foer-skemaet`
- **Værdi:** forretning 5 — 15 viste ansøgningssiden siden 28/9, 1 startede.
- **Færdig:** ÉT greb (anbefalet: introsiden — «50.000 kr.» og «elleve spørgsmål» før første felt), målt mod `ansoegning_visninger` over et aftalt vindue med lag 6's regel; resultatet bogført; næste greb er et nyt kort.
- **Afhænger af:** #1261 (rører `/ansoeg`). **Hvem:** Claude · Jonas (godkender teksten). **Model:** Opus. **Indsats:** M.

### 26. Mailgun-levering — `g03-mailgun-levering`
- **Færdig:** Bucket C-function med Mailguns signatur før parsing; mål først, at `webinar_mails.mailgun_id` matcher webhookens message-id ORDRET; én linje pr. session på `/webinar` (sendt · leveret · afvist · undervejs); webhook-URL'en sat i Mailgun; beviset = en leveret og en afvist testhændelse; kortet lukket. **Før 3/11.**
- **Hvem:** Claude · Jonas (Mailgun-opsætning). **Model:** Fable (offentligt endpoint). **Indsats:** M.

### 27. Restancen og indgangens døde dage — `g03-retries-opbrugt-faktura`, `a19-dag31-doedvande`, `a19-paamindelser-hverdage`, `w17`
- **Færdig:** Stripes «efter sidste forsøg» kendt (punkt 1); de fem forudsætninger i `g03-retries-opbrugt-faktura` afprøvet i test-mode; én PR + én cron-migration for dag 31 (regnestykket sommer/vinter i filen); Jonas' beslutning om dag 45 bogført; kortene lukket. **`w17` før 20/10.**
- **Hvem:** Claude · Jonas. **Model:** Fable (penge). **Indsats:** M.

### 28. Legacy-nøglerne / fase 3a — `a01-legacy-noegler`, `g03-verify-jwt-fase3a`
- **Færdig (første skive):** vault-posten `kald_edge_sb_secret` + migration `20261002290000` kørt SAMMEN med Jonas (hans ord 2/10), målt (`pg_get_functiondef(kald_edge)` nævner `apikey`), og én Bucket B-function udrullet med trin 1 svarer på en tørkørsel med nøglen. Resten (trin 2) er nyt kort med dato før «Late 2026».
- **Dato og plads (rettet v2, rådet 3/10):** **mandag 5/10 kl. 12** som egen pakke (Jonas + Fable; én vault-handling, én migration, én deploy). Ikke søndag: søndagens fire pladser og Jonas' runder er fyldt (§4.5), og skiven kræver hans hænder i vault'en. **Trin 2 (`verify_jwt = false` + «kun nøgle» i samme udrulning) får et kort med fristen 30/11-2026** — mit forslag, ikke Supabases dato: fristen er «Late 2026, TBC», og den eneste sikre læsning af en ukendt frist er at være færdig før den tidligst mulige (O2). Jonas kan flytte datoen, men skal gøre det bevidst.
- **Hvem:** Jonas + Claude. **Model:** Fable (adgang). **Indsats:** L i alt, S for første skive.

### 29. SMS til webinarpåmindelsen — U-punkt
- **Værdi:** fremmødet er 40 % (36–45 %, målt 3/10 på /webinar); SMS skal bevise, at det hæves (`docs/mailplan-14-dage-og-sms.md` §3: Wilson-sammenligning, ellers er det et forsøg).
- **Rettet v2:** v1 skrev, at GatewayAPI-recon'en ikke lå i repoet. Den ligger på grenen **`origin/docs/sms-recon`** som **`docs/sms.md`** (recon 3/10; v1's grep kørte kun på denne gren). Den anbefaler GatewayAPI med to forbehold (DPA'en og den danske kronepris er ikke læst), første skive = webinarpåmindelse 1 time før med eget kryds på en tokenside (spejl af `ring-mig-op`), spor `webinar_sms` med «én pr. (nummer, session)», lås `webinar_sms_aktiv`, holdout-måling — og har syv beslutninger til Jonas i §8 (omstød «SMS: ikke nu», erstatter `en_time`?, opbevaring 7 dage, afsendernavn, medlemmer nu?, STOP-kanal, udbyder). Læs §5 og §8 dér; skiven nedenfor er afstemt med den.
- **Færdig (skive 1):** Jonas' svar på `docs/sms.md` §8 (grenen `docs/sms-recon`) og mailplanens §5.1; et tomt samtykke-kryds + telefonfelt (på motorens tilmelding ELLER på en tokenside som `ring-mig-op` — recon'ens anbefaling) (**samme formular-ændring som #1262's Meta-kryds — designes ÉN gang**); `webinar-sms-cron` efter `webinar-mail-cron`'s mønster (ren dom, spor, lås, tørkørsel, én SMS pr. (nummer, session) som databasens dom); STOP virker; beviset = en SMS til en egen testtelefon på en intern session; kortet lukket. **Foreslås som nyt kort `g04-sms-webinar`.**
- **Afhænger af:** webinarstakken merget; Jonas' svar. **Hvem:** Claude · Jonas. **Model:** Fable (mails/SMS til rigtige mennesker). **Indsats:** M–L. **Dag:** ikke søndag.

### 30. Update-målingen af det merget — U-punkt
- **Værdi:** #1224–#1226, #1229–#1230, #1232–#1235 og #1242–#1254 står som «Update ikke målt». Livetjekket 3/10 SÅ forside v3 (Score, trofæer, «Næste i Netværket»), Netværkets faner på `/community` og «Mangler at booke» — så en del er i drift — men ingen rekursiv bundle-måling er bogført.
- **Færdig:** én måling i FRISK fane: alle chunks i manifestet hentet rekursivt (regelsættet (ee), (jj)), én markør pr. PR søgt og fundet/ikke fundet bogført i OVERLEVERING; det, der mangler, får ét Update-klik og måles igen.
- **Hvornår (rettet v2):** **søndag kl. 08, dagens første handling**, før nogen merge — så målingen er et rent udgangspunkt, og hvert senere Update-klik kan noteres mod den (§4.2, rækken «Update»).
- **Hvem:** Claude. **Model:** Haiku. **Indsats:** S. **Foreslås som nyt kort `g04-update-maaling`.**

### 31. Adressen kan ikke rettes — `g03-adresse-kan-ikke-rettes` (betaling; tilføjet v2)
- **Værdi:** 14 kunder har ingen adresse (målt 3/10), og adressen indgår i indgangsfakturaen og i aftalefelterne ved e-underskrift; feltet kan kun sættes af CVR-berigelsen/importen (rådet: risiko 2 → 3).
- **Færdig:** adresse, postnummer og by i rådgiverens `EditCompanyDialog` (rådgiver/admin), forudfyldt fra CVR med «hent fra CVR igen»; medlemmet får dem IKKE i denne PR (det kræver kolonneværnets hvidliste + `companiesKolonnevaern.guard` i samme PR); test; merge; Update; livetjek som rådgiver: én af de 14 får sin adresse (fra CVR) og den står på virksomhedssiden; antal uden adresse genmålt og bogført; kortet lukket.
- **Hvem:** Claude. **Model:** Sonnet (flade) · Fable i rådet (penge: fakturaen). **Indsats:** S. **Formel:** 10,5 / 10,5 / nr. 27. **Dag:** mandag–tirsdag (rører `EditCompanyDialog`, som ingen søndagspakke rører).

### 32. Ring-mig-op-beviset 13/10 — `g03-ring-mig-op-bevis` (+ `a20-replay-deltog`; tilføjet v2)
- **Værdi:** at `ewebinar-webhook`/`-import` skriver `ring_op_url` ved «Deltog» er ikke bevist (220 «Deltog»-hændelser, 0 med `ring_op_url` — forventet, intet webinar siden udrulningen), og den bogførte bevis-SQL fejler (sorterer på `created_at`; kolonnen hedder `sendt_at` → 42703).
- **Færdig:** (1) NU: bevis-SQL'en i OVERLEVERING rettet til `sendt_at` og prøvekørt (0 rækker er et gyldigt svar i dag); (2) **13/10 efter sessionen kl. 11:** SQL'en kørt — mindst én «Deltog i webinar» med `ring_op_url` — og én Klaviyo-profil viser egenskaben (`get_profile`); (3) Jonas' beslutning om `a20-replay-deltog` bogført (en replay-seer kan få et opkaldslink — ønsket eller ej, §3); kortet lukket 13/10.
- **Hvem:** Claude · Jonas (replay-beslutningen). **Model:** Haiku. **Indsats:** S. **Formel:** 9,0 / 9,0 / nr. 40 → **O2** (beviset kan kun tages den dag).

### 33. boardroom-2-prod: nøglerotation og nedlukning — `a30-boardroom-2-prod` (tilføjet v2)
- **Værdi:** risiko 3 — et Supabase-projekt, den lokale forbindelse ser (ikke Lovables prod), med nøgler, ingen har roteret; ikke påbegyndt i bogføringen.
- **Færdig:** guidet skridt for skridt med Jonas: hvad projektet indeholder (læst, ikke skrevet), nøglerne roteret, projektet sat på pause/lukket, og ingen secret i Lovable eller i koden peger på det (grep + Jonas' blik på secrets-listen); bogført i OVERLEVERING og regelsættet §6; kortet lukket.
- **Hvem:** Jonas (hænderne) · Claude (guiden). **Model:** Haiku. **Indsats:** S. **Formel:** 4,5 / 4,5 / nr. 114. **Dag:** når Jonas har en halv time — ikke søndag.

### 34. PR #1043 — mødelink-rettelsen (åben 13 dage; tilføjet v2)
- **Værdi:** en docs-PR («kalenderinvitationen er det eneste, der garanteret bærer mødelinket» + elleve fund), hvis gren har en anden rod end main (6.763 commits foran, aabne-opgaver §2). Indholdet er ikke sammenlignet med main, så vi ved ikke, om rettelsen allerede står der.
- **Færdig:** Claude sammenligner PR'ens ene fil med main afsnit for afsnit og bogfører: (a) allerede på main → PR'en lukkes med henvisningen; (b) mangler → genskabes på en frisk gren fra main som ny PR, og #1043 lukkes; Jonas bekræfter lukningen (en PR, ingen har bedt om at lukke, lukkes ikke af Claude alene).
- **Hvem:** Claude · Jonas (bekræfter). **Model:** Haiku. **Indsats:** S. **Dag:** søndag i pakke F, som fyld mens en pakke venter på Jonas.

---

## 3. Det, der kræver Jonas — efter frist

Hvert punkt: hvad · præcist hvad du gør eller afgør · kortet. «Grønt lys» betyder FORBIDDEN-listen eller regelsættet §3.

| Frist | Hvad | Præcist | Kort |
|---|---|---|---|
| **Lør 3/10 aften** (før søndagens pakke A) | Webinarmotorens beslutninger | Svar på B1–B9 i `docs/webinarmotor.md` §8.2 (grenen `feat/webinar-chat-bagende`): ærlighed (B1), hvor tilmeldingen bor (B2), Meta (B3), privatlivstekst (B4), vært/konsol (B5), video (B6), dato 3/11 (B7), P0-skygge 13/10 (B8), merge-go + go/no-go-datoerne (B9). **Og:** #1262 bygges om til samtykke-krydset (greb 2) — eller du ændrer beslutningen bevidst. **Og (v2):** stakkens nye rækkefølge med #1262 øverst (§4.4 punkt 1a). **Og (v2):** den interaktive pakke har nu en spec — `docs/webinarmotor.md` §9 på grenen `docs/webinar-interaktiv-spec` med beslutningerne **I1–I10** (I2, I5 og I7 kan stå som konstanter i 9a; **I3 og I6 kræver dit svar før 9b** — en offentlig bucket er bredere adgang, regelsættet §3) | stakken, `a01-capi-webinar` |
| **Lør 3/10 aften** | **Kør selv søndag? (ny i v2)** | Beslutningen i §4.5: må Claude søndag i «Kør selv» køre rent tilføjende migrationer, udrulninger og Update via Lovable-MCP (regelsættet §6a), mens du kun tager grønt lys, penge, overskrivning og beslutninger? Ja/nej — svaret afgør, om din søndag er ca. 8–10 eller 20–25 runder | — |
| **Søn 4/10 (inden 09)** | `webinar-mail-cron` søndag–6/10 (ny i v2) | Standard: IKKE udrullet fra søndag til 6/10 kl. 10:15 (`syv_dage` til 371 kl. 08:00 + nådens 2 timer). Vil du hellere have den ud søndag, skal du vælge alternativet aktivt (§4.4 punkt 2a) | stakken |
| **Søn 4/10** | Grønt lys til sikkerhedspakken | Ja/nej til (1a) REVOKE af anon på `cleanup_stale_processing_reports`, `get_all_advisor_profiles` og de rent skrivende/markerende — søndag; (1b) `has_role`/`user_company_id`/`is_legat_user` — først efter anon-røgprøven og livetjekket som anonym (§2 punkt 14); (2) `20261002280000_milestones_with_check`; (3) WITH CHECK på de 15 politikker. Hver køres først efter tørkørslen i DO-blok, og du får sandhedstabellen (hvem kan hvad før/efter) | `g03-security-definer-anon`, `a02-milestones-with-check`, `g03-with-check-15-politikker` |
| **Søn 4/10** | Ja til overskrivning af tal | Genkørslen overskriver facts. Snapshot tages først; ja/nej til hold à 10 | `m17-ai-skema-grupper`, `m17-koerelisten` |
| **Søn 4/10** | **Bunny + webinar-secrets — én dag (flyttet fra mandag i v2)** | `WEBINAR_JOIN_SECRET`, `BUNNY_WEBINAR_LIBRARY_ID`, `BUNNY_WEBINAR_TOKEN_AUTH_KEY`; biblioteket «Webinar» (EU, token-auth, referrer app.theboardroom.dk); videoen ud af eWebinar til Bunny (§8.1 trin 4 og 6). Alt i ÉN runde før kl. 15's deploy-runde, så pakke A kan vise afspilleren søndag. Kan du ikke søndag: sig det, så bevises rummet uden embed, og hele Bunny-delen flyttes samlet til én anden dag | stakken |
| **Søn 4/10** | Delingslink til Nicklas-beviset | Opret et kortlivet link på `/webinar` og giv det til Claude (pakke F) — FØR nogen udrulning af `webinar-delt` | `a01-nicklas-link` |
| **Søn 4/10** | Update-klik | Hvert klik tager ALLE merges med siden forrige (§4.2 rækken «Update»): Claude lægger listen frem før klikket. I «Kør selv» klikker Claude selv efter regelsættet §2; i «Byg med mig» — standarden — er det dig (§4.5) | — |
| **Søn 4/10** | Jonas-sessionen (Brick Works, E-skilte, TuaMea) | **Ingen ny beslutning** — kortet handler netop om de tre, og du skrev 3/10 06:15 «jeg har styr på Brick, e-skilte og Tua». Ordet bogføres; Claude måler `jonas_session_tilbudt_at`/`jonas_session_used_at` for de tre (kortet målte 2 i kundeuniverset — forskellen forklares) og lukker kortet, når de to flader er enige. Står de stadig NULL, er det eneste spørgsmål: «tilbudt eller brugt?» | `g03-jonas-session-null` |
| **Man 5/10 før 08:02Z (10:02 dansk)** | Fejlende træk TBR-0018 | Ring/skriv til medlemmet (velocity-fejl løses ofte af kunden) | `g03-to-traek-fejler` |
| **Man 5/10 kl. 12** | Fase 3a, første skive (flyttet fra «søn» i v2) | Vault-posten `kald_edge_sb_secret` + migration `20261002290000` — «sammen med mig» (2/10); Claude udruller én Bucket B-function og beviser den med en tørkørsel. Trin 2 får fristen 30/11 (§2 punkt 28) | `a01-legacy-noegler` |
| **Man 5/10** | Nyhedsagentens første udkast | Tag eller slip udkastet på `/nyheder` (intet når community uden klik) | `a30-nyhedsagent-laas` |
| **Tir 6/10 før 08:00** | De højst 3 uden invitation | Ja/nej til en invitation på anden vis (tilmeldt 4/9, 6/9, 19/9); skal «udsat/over_loft» tælle som bevis for, at personen var klar | `g03-fjorten-dage-otte-mangler` |
| **6–7/10** | Intern prøvesession | Du + 2–3 interne, fysiske telefoner MED LYD (iPhone Safari, Android Chrome) | stakken §8.1 trin 7 |
| **Ons 7/10 før 09:01Z** | Fejlende træk TBR-0014 (YKRG) | Ring/skriv; afgør sammen med YKRG's udestående juni-betaling | `g03-to-traek-fejler`, `m17-ykrg-juni` |
| **Uge 41 (ingen hård dato)** | Klaviyo-flowene | R63TqD ind i stedet for Xr6Pm9 i **Velkomst TGxxUc og Sunset XCqPKg** (eller giv Claude lov via `klaviyo-motor`). Kampagnerne #5/#6 ekskluderer allerede begge og røres ikke; Xr6Pm9 fjernes først, når forskellen liste (26)/segment (31) er målt profil for profil | `g03-klaviyo-r63tqd-erstatter` |
| **Tor 8/10** | Dine tal-målingen | Claude måler på grundmængden (`erIGrundmaengden`, `period_key`); du og Morten tager samtalen: produkt, onboarding eller forventning — og hvad var aftalen med de 10, der aldrig har uploadet? | `g03-dine-tal-brug-8-10` |
| **Fre 9/10** | Go/no-go 1 | Åbner vi tilmelding på platformen 14/10? Ellers reserve A (besluttes senest 12/10) | stakken |
| **Før 12/10** | Privatlivsteksten (B4) + persondata | Læs Claudes udkast; publicér topix.dk-teksten FØR første CAPI-hændelse; læs aftale v3 (pkt. 5.1/5.3, betalingsmodellerne, binding) og bogfør «læst» | `g03-persondata-meta`, `a18-jurist` |
| **Før 12/10 08:00** | Mortens video | Optag/upload, ellers bogfør «ikke til 13/10» | `a30-video-dagen-foer` |
| **Før 13/10 kl. 11** | Replay-seere og opkaldslinket (ny i v2) | En replay-seer bliver «Deltog i webinar» i Klaviyo og kan dermed få `ring_op_url` — ønsket eller ej? Beviset for ring-op tages 13/10 efter sessionen, så svaret skal ligge før | `a20-replay-deltog`, `g03-ring-mig-op-bevis` |
| **Før 14/10** (åbningen øger mailtrykket) | Mailtrykket (ny i v2) | P0-2..6: dine klik i Klaviyo (filtre/Smart Sending); P0-7: slås Calendlys egne påmindelser til ansøgeren fra? Og: skal et dagsloft på tværs af platform/Klaviyo/Calendly bygges (P1-11, `mailDagsloft.ts`)? | `a20-kollision-ni-mails` |
| **Man 12/10** | Webinaret 3/11 oprettes | Præcis én offentlig session, status aktiv | stakken §8.1 trin 10 |
| **Ons 14/10** | Åbning | Guarded UPDATE `webinarmotor_offentlig_aktiv` → true; widget og annoncer peger på formularen | stakken §8.1 trin 12 |
| **Før 19/10** | kontakt@-spærringen | Ingenting — men læs Claudes SELECT 19/10 (modtager kontakt@, status sent) og tjek `RAADGIVER_MAIL_TIL` i secrets | `a18-kontakt-spaerret` |
| **Før 20/10** | Dag 45-rykkeren | Skal en rådgiver rykkes 14 dage efter dag 31-fakturaen? (Stripes egne påmindelser slås op, gættes ikke) | `w17` |
| **Før 22/10 (eller 26/10)** | CARMA | Ring eller sletning; slutdato 7/9 (guarded UPDATE, dag 45 = 22/10) eller bogfør 11/9 med vilje (dag 45 = 26/10) | `a18-carma-25-9` |
| **Før 26/10** | Kunden uden for sletteordningen + 11 tomme skaller | Engangssag med eksplicit id, eller bevidst behold med begrundelse | `g03-udloebet-uden-for-sletning` |
| **Tir 27/10** | Go/no-go 2 | Afholder vi 3/11 på platformen? | stakken |
| **Ingen dato — grønt lys** | RPC'er (SECURITY DEFINER) | Rådgiverforsiden og samtalelisten som RPC'er | `g03-advisor-dashboard-skala`, `g03-samtaleliste-500` |
| | Vagtens invarianter | Ny version af vagten (SECURITY DEFINER) | `g03-vagt-invarianter`, `a02-vagt-jobnavn` |
| | FAIL kræver rådgiver | D's migration — efter genkørslen | `m17-fail-kraever-raadgiver` |
| **Ingen dato — beslutninger** | Godkendelsen af tal | PASS uden advarsler committes automatisk? WARN med kryds? FAIL kun rådgiver? (tre kort, ét svar) | `g03-pass-uden-facts`, `m17-fail-kraever-raadgiver`, `m17-brroset-ykrg` |
| | 56 manuelt rettede måneder | Slip eller behold pr. rapport (mål igen med §5 i `udkast-sidste-ukendte/README.md` først) | `m17-manuelle-rettelser` |
| | BR Roset | Tolerance i skabelonen (½ × grupper × 1.000 kr.) eller kryds | `m17-brroset-runde-tusinder` |
| | Rallysupport | Bed om saldobalance-PDF'erne, eller genkør efter skemaudvidelsen | `m17-rallysupport-to-eksporter` |
| | Svartiden | Husets løfte (fx «samme hverdag»), skal det stå for medlemmet, og skal forsiden/agenten råbe? (Claude måler først i hverdagstimer) | `g03-svartid-19-timer` |
| | Dine mål | Sætter rådgiverne målene SAMMEN med medlemmet? Tages de 30 ubekræftede op én gang? Færre skridtforslag (102 udløbet på 30 d)? | `g03-dine-maal-bruges-ikke` |
| | Akademiet | Hvad gør vi ved faldet (13 → 6 set)? Ingen polering før svaret | `g03-akademiet-falder` |
| | Netværket | Skal medlemmer skrive mere — og hvordan? Ingen medlem-til-medlem før svaret | `g03-netvaerket-laeses-ikke-skrives` |
| | e-conomic på den gamle konto | Genopliv, erstat eller bogfør i hånden — med bogholderen; og hvad er bogført for 2025–26? | `m16-economic-doed`, `m15-gamle-fakturaer` |
| | SMS | Mailplanens §5.1: erstatter SMS `en_time`? slet nummeret 7 dage efter? to felter for firma og «må vi ringe»? | U-punkt 29 |
| | Klaviyo lag 5 | Kør `20260920100000` (når lag 5 bygges), eller fjern filen og `klaviyo-hentning-cron` | aabne-opgaver §3 |
| | Opbevaring af cron-log og pg_net | Hvem ryddede `cron.job_run_details`, og hvilket loft skal et opbevaringsjob have? | `a30-cron-log-bloat` |
| | Grønt lys for `20261002243000` | Bekræft, at dit ja kom før kørslen (bogføring) | `g03-claude-md-pladsholder` |
| | **Flere rådgivere (ny i v2)** | 43 kunder, to menneskelige rådgivere, målet hundrede: hvornår kommer nr. 3, skal advisor og admin skilles (hvad må en ny rådgiver ikke), og hvordan onboardes en rådgiver? **Seneste tidspunkt:** før kunde nr. 50 — rådgiverforsiden holder til ca. 60 (`g03-advisor-dashboard-skala`). Samme svar dækker tabellen over admin-gates («huset» eller «kun Jonas») | `g03-to-raadgivere-hundrede`, `g03-advisor-admin-gates` |
| | **Rapportpåmindelsen til de tavse (ny i v2)** | Bliver den ved dag 7/15/20 måned efter måned, stopper den efter N måneder, eller afløses den af et menneske? (54 sendte til 23 modtagere i september.) Claude lægger tørkørslens liste frem først. NB: dag 20 er også Score's streak-frist | `g03-rapportpaamindelse-tavse` |
| | **Opbevaringspolitik (ny i v2)** | Hvor længe beholder vi login, chat, rapporter og filer for et aktivt medlem; bilag (fem år) mod persondata; dag 1–45 efter slutdato; forældreløse community-filer. Afgør også, om sletteløftet i ansøgningen (`a18-sletteloefte`, §2 punkt 8) skal holdes med en cron eller rettes | `g03-opbevaringspolitik` |
| | **BENCHMARK_BELOW (T6) (ny i v2)** | Har aldrig fyret (0 af 254 ugefokus-rækker): (a) slet T6 + synken + branchetabellerne, eller (b) læg om til «resultat før skat negativt» | `g03-benchmark-below-t6` |
| **Ingen dato — kun du kan se** | Livetjek | EditCompanyDialog (kun admin), Calendly for Mortens bookinger, Meta Ads Manager, DNS/DKIM for topix.dk | `g03-gamle-komponenter`, `w11`, `a22-kampagnernes-maal`, `a22-spf-topix` |
| | Restore | Find backups/PITR i Lovable → Cloud, og gendan én tabel til et testprojekt | `g03-restore-uproevet` |
| | Rundturen | Network → Timing → «Waiting for server response» på et trivielt REST-kald, to gange | `g03-region-compute-rundtur` |
| | Rådgivere uden bruger | Send invitationslinket personligt til de tre «gamle» uden bruger (rådgiverne, ingen kode) | `a01-gamle-uden-bruger` |
| | **boardroom-2-prod (ny i v2)** | En halv time med Claude som guide: nøglerne roteres, projektet lukkes ned (§2 punkt 33) | `a30-boardroom-2-prod` |
| | **PR #1043 (ny i v2)** | Bekræft lukningen, når Claude har sammenlignet den med main (§2 punkt 34) | PR #1043 |

---

## 4. Søndagsplanen (4/10)

### 4.1 Reglerne for dagen

1. **Højst 4 åbne pakker ad gangen.** En pakke er «åben» fra første commit til kortene er lukket. En ny pakke startes først, når en anden er lukket — eller udtrykkeligt parkeret med grunden skrevet i OVERLEVERING.
2. **Migrationer køres i runder: kl. 09, 12, 16 og 19** (rettet v2 — v1's «én pakke ad gangen med en migration» gav ingen tider at planlægge efter). Inden for en runde køres migrationerne én ad gangen, hver med FØR → kørsel → EFTER i ét resultatsæt, og den næste starter først, når den forrige er målt. En pakke, der misser en runde, venter på den næste. Ingen gren vælger migrationstidsstempel uden at have tjekket alle åbne PR'er (regelsættet (z)).
3. **En pakke startes kun, hvis den kan nå «færdig» samme dag.** Ellers skæres den til en skive, der kan (fx skive 1 af `g03-fjorten-dage-otte-mangler`).
4. **Én build-chat-besked pr. deploy-runde** (regelsættet §6a), kl. ca. 11, 15 og 19, så Jonas' credits og opmærksomhed ikke spredes. **Søndag udrulles hverken `webinar-mail-cron` eller `webinar-delt`** (§4.4 punkt 2a og §2 punkt 18).
5. **Ingen pakke rører en anden pakkes filer** (§4.2). Opstår et overlap, stopper den sidst startede og venter.
6. **Update er en fælles kanal** (ny i v2): et klik udgiver editorens tilstand — ALLE merges til main siden forrige klik, også en anden pakkes `src/`. Før hvert klik lægges listen frem (`git log --merges <forrige Update-commit>..origin/main`), og pr. merge noteres: rører den `src/`? står det nye bag en lås, eller er det sikkert for alle? Listen bogføres i OVERLEVERING sammen med klikket og den efterfølgende måling i frisk fane.
7. **Hver pakke ender med §4b-gennemsynet**, når den rører `src/`: begge roller, 1440×900 og 375×812, i drift.
8. **Jonas er flaskehalsen — regnet realistisk (rettet v2): 20–25 runder for ham søndag i «Byg med mig»**, ca. 8–10 i «Kør selv» (§4.5). v1's skøn på 8–12 talte kun beslutninger og grønt lys og glemte, at hver merge, migration, deploy og Update i «Byg med mig» er hans ja. Pakker, der venter på ham, holder pladsen — derfor er der kun fire.

### 4.2 Filoverlap (groft, læst i dokumenterne og PR-kroppene; #1146 og #1257/#1258 målt med `gh api …/pulls/<n>/files` 3/10)

| Pakke | Filer/områder, den ejer | Overlapper med |
|---|---|---|
| **A** Webinarstakken | `supabase/functions/webinar-*`, `ansoegning-gem`, `meta-send-cron`, `drift-agent-cron`; `_shared/webinar*`, `_shared/metaTilmelding.ts`, `_shared/driftDom.ts`, `_shared/klaviyoDato.ts`; `src/lib/webinar*`, `src/lib/webinarMotor*`, `/w/*`-ruterne, `/ansoeg` (forudfyld), `src/lib/sentryRens.ts`; migrationer `20261003*` | `g03-fjorten-dage` skive 2, vagtpakken, `m28-tragten-foer-skemaet`, SMS — derfor efter A |
| **B** Tallene | `supabase/functions/extract-financial-data/`, `_shared/omkostningsnoegler.ts` (kun læst), genkørsel gennem eksisterende flade; snapshot-SQL | ingen |
| **C** Agent + forsidefejl | `supabase/functions/run-company-agent/`; `src/lib/hjemmebane/dinMaaned.ts`, `src/components/hjemmebane/boardroom/nextStep.ts`, «Din plan»-komponenterne, `forsidePlan.guard` | **#1146 (pakke F) rører `src/components/hjemmebane/boardroom/BoardroomView.tsx`** — forsidens beholder (målt: #1146's ti filer er `EventEditor.tsx`, `BoardroomView.tsx`, `EventDetailView.tsx`, `EventsView.tsx`, `eventLokation.ts` + test/guard, `kalenderfil.ts` + test, migrationen). Regel: **#1146 merges først** (den venter kun på migrationen kl. 09); C rører ikke `BoardroomView.tsx`, før #1146 er merget, og ombaserer derefter. Rører C slet ikke filen, er der intet overlap |
| **D** Hastighed 1 | `src/hooks/useAuth.tsx`, `src/lib/authIndlaesning.ts`, `vite.config.ts` | ingen (A's ruter står i `src/App.tsx`, ikke samme fil) |
| **E** Sikkerhed | nye migrationer (REVOKE i trin 1a/1b, politikker), `supabase/SECURITY_BASELINE.md` | migrationsrunderne (regel 2); `a22-rls-initplan` hører HER, ikke i D |
| **F** Beviser | ingen ny kode: Update-målingen; deploy af tre Bucket A-functions; nicklas-beviset (et kald, ingen deploy); #1146 (`events`-migration + dens PR-filer); PR #1043 (docs) | `BoardroomView.tsx` med C (se C); `webinar-delt` — beviset FØR enhver udrulning af den |
| **Update** (ny række i v2) | Lovables «Update» = editorens tilstand = alle merges til main | **Alle pakker med `src/`** (A's #1255–#1257 når de merges, C, D, F's #1146). Hvert klik noteres med de merges, det tager med (regel 6). A's `src/` (seerfladen, `/w/*`) må kun merges, når den er sikker for alle uden lås (regelsættet §1a: main er altid Update-sikker) |

### 4.3 Pakkerne, rækkefølgen og færdig-definitionen

**Kl. 08 åbner A, B, C og F** (rettet v2: F i stedet for D — det igangsatte lukkes før nyt, O3). **Dagens første handling er F's Update-måling** i en frisk fane, før noget merges. D tager den første ledige plads (forventet, når B's eller C's skive er lukket); E (trin 1a) den næste, når Jonas har sagt ja. Lørdag aften (Opus/Sonnet/Haiku, før Fable): Haiku skriver skive 1-SQL'en til `g03-fjorten-dage-otte-mangler` og SELECT'en til pakke D (rådgivere med afventende invitation — tal), så søndagen starter med målinger i hånden.

**Dagens tider (skøn — holdes ikke på bekostning af et bevis):**

| Tid | Hvad |
|---|---|
| 08:00 | F: Update-målingen i frisk fane (udgangspunktet). A, B, C, F åbner. |
| 09:00 | **Migrationsrunde 1:** #1146's `20260929210000` (F) · A's `20261003010000` (kræver B9) · B's snapshot-tabeller (`03-snapshot-og-rollback.sql`). Hver for sig med FØR/EFTER. |
| ca. 10 | #1146 merget; A: #1255 merget (efter `010000` er målt). |
| 11:00 | **Deploy-runde 1:** F's `opgave-accepter`, `opgave-udskyd`, `maal-skriv`. |
| 12:00 | **Migrationsrunde 2:** A's `20261003030000` (skive 3) · E trin 1a (hvis grønt lys og tørkørsel er klar). |
| ca. 13 | **Update U1** (F's #1146 + hvad der ellers er merget — listen først). |
| 15:00 | **Deploy-runde 2:** A's `webinar-tilmeld`, `webinar-rum`, `webinar-puls`, `webinar-motor-cron` (§4.4 punkt 2b) · B's `extract-financial-data` · C's `run-company-agent`. Bunny-secrets SKAL være sat inden. |
| 16:00 | **Migrationsrunde 3:** E trin 1a (hvis ikke kl. 12) eller `20261002280000_milestones_with_check`. |
| ca. 17 | **Update U2** (C, D). |
| 19:00 | **Migrationsrunde 4** (E trin 1b kun efter grøn røgprøve, ellers reserve) · **deploy-runde 3** (reserve, fx C's, hvis 15 blev misset) · **Update U3** (reserve). |

| Pakke | Model | Indsats (kort) | Færdig søndag (det, der lukkes) | Jonas-runder i «Byg med mig» |
|---|---|---|---|---|
| **A — Webinarstakken, skive 1–3** | Fable (bygger + CTO i rådet) | Forudsætning: Jonas' B1–B9. (1) **Stakken omordnes, så #1262 ligger øverst** (§4.4 punkt 1a) — ombasering af #1263 på #1261 og #1262 på #1263; **#1262's `20261003070000` omdøbes i samme ombasering til et tidsstempel efter #1263's `20261003080000`** (henvisninger og værn med), og 9b's migration sorteres efter det nye navn. (2) #1262 bygges om på sin gren: migrationen (i dag `20261003070000`, omdøbt efter (1); ikke kørt — må rettes) får `webinar_tilmeldinger.meta_samtykke_at` + `meta_samtykke_tekst`; `doemTilmelding` svarer `uden_samtykke` FØRST; `_fbp`/`_fbc` kun med krydset; formularen (`/w/:slug/tilmeld` + `webinar-tilmeld`, STRIKS body) får det tomme kryds; værn. (3) Merge #1255 → #1256 → #1257 med `010000` og `030000` KØRT og målt FØR hver merge; **squash-merge af en stablet PR kræver, at den næste ombaseres på main efter hvert trin** (`git rebase --onto origin/main <forrige grens spids>`, CI grøn igen) — skøn 20–30 min pr. trin inkl. CI, dvs. **ca. 1–1,5 time for #1255–#1257 søndag og ca. 2–3 timer for hele stakken på otte PR'er** (med i tidsskønnet). (4) Deploy-runde kl. 15: `webinar-tilmeld`, `-rum`, `-puls`, `webinar-motor-cron` — **IKKE `webinar-mail-cron` og IKKE `webinar-delt`**. (5) Hvis A's skive er lukket inden ca. 15: spec'ens skive **9a–9c** kan starte som A's anden halvdel (§4.4 punkt 9) — ellers mandag. | Skive 1–2 merget, migrationerne `010000`/`030000` kørt, de fire functions udrullet; beviset `motor: "boardroom-3"` i et svar fra `webinar-rum`/`-puls` og `webinar-motor-cron`s tørkørsel; `/webinar/motor` åbner som rådgiver; en egen testtilmelding på en intern session får rum, afspiller (Bunny) og `set_procent > 0`. **Skive 3 er IKKE færdig søndag** (§4.4 punkt 2b): `webinar-mail-cron` (skive 3's `motor_mail`) og cron-migrationen `031000` venter til 6/10 efter kl. 10:15, og skive 3 lukkes dér. #1262 ombygget og godkendt af rådet (ikke merget — venter på B4). | B1–B9, 2 migrationer, Bunny + secrets (én runde), 3 merges, 1 deploy-runde |
| **B — Tallene rigtige** | Opus | Punkt 5 i top-listen. | `m17-ai-skema-grupper` og `m17-saldobalance-pdf-uden-i-alt` lukket; `m17-koerelisten` omskrevet til ANLA. Når genkørslen ikke når alle hold søndag: de resterende hold køres mandag, og kortet lukkes dér — skiven søndag er udrulning + bevis + snapshot + de første hold. | ja til overskrivning, snapshot-migration, merge, 1 deploy-runde |
| **C — Agent + forsidefejl** | Opus (agent) · Sonnet (flade) | Punkt 7 og 11. Rører ikke `BoardroomView.tsx` før #1146 er merget (§4.2). | PR'erne merget; `run-company-agent` udrullet med v8 og **bevist søndag ved et kald** (§2 punkt 7); Update U2; forsiden rettet set i drift som rådgiver i virksomhedsvisning; `g03-bank-som-i-november`, `g03-din-plan-dobbelt-overskrift`, `g03-agent-milesten-ord`, `a01-agent-bevis`, `a02-akademi-f0` lukket. | 2 merges, 1 deploy-runde, 1 Update |
| **F — Beviser** (åbner kl. 08) | Haiku · Sonnet (#1146) | Punkt 30 (Update-målingen, FØRST), 9, 18, 19, 17, 34. | Update-målingen bogført (udgangspunktet for U1–U3); `a01-bucket-a-bevis`, `a01-nicklas-link`, `g03-event-lokation`, `a29-overblik-bevis` (+ de beviskort, der kan ses) lukket; PR #1043 sammenlignet og lagt frem til Jonas. | delingslinket, 1 migration (#1146), 1 merge, 1 deploy-runde, Update U1 |
| **D — Hastighed 1** (første ledige plads) | Sonnet · Opus i rådet | Punkt 10. | PR merget, Update U2, frisk-fane-målingen bogført (før/efter), Sentry p95-top-5 bogført; `g03-ydeevne-sentry` lukket; `a22-forside-langsom` omskrevet; `g03-region-compute-rundtur` lukket, når Jonas' måling er bogført. | merge, Update, rundturs-måling |
| **E — Sikkerhed, trin 1a** (næste ledige plads, OG Jonas' ja) | Fable | Punkt 14: trin 1a (REVOKE på `cleanup_stale_processing_reports`, `get_all_advisor_profiles` og de rent skrivende/markerende) → `milestones_with_check`. Trin 1b (`has_role`/`user_company_id`/`is_legat_user`) kun efter anon-røgprøve + livetjek som anonym; ellers mandag. De 15 politikker og `a22-rls-initplan` er IKKE søndag. | Trin 1a: tørkørt, kørt, målt (`has_function_privilege('anon', …)` = false på præcis de valgte), livetjek som anonym af `/auth`, `/ansoeg`, `/aftale`, `/delt/webinar`, `/ring-mig-op` (skal virke uændret), merget. Trin 1a alene lukker ikke `g03-security-definer-anon` — kortet omskrives til «trin 1b tilbage». | grønt lys × 2, SQL editor × 2 |

**Jonas' runder søndag, talt (rettet v2):** B1–B9 og §4.5 (1–2) · Bunny + secrets (1–2) · delingslinket (1) · grønt lys E 1a og milestones (2) · ja til overskrivning (1) · rundturs-målingen og restore, hvis han når det (1–2) · Jonas-sessionen-målingen læst (1) · i «Byg med mig» desuden: 6–7 merges (#1146, #1255, #1256, #1257, B, C×2, D), 6–7 migrationer, 3 deploy-runder, 3 Update-klik. **I alt ca. 20–25 runder i «Byg med mig», ca. 8–10 i «Kør selv».**

**Ikke søndag, men i rækkefølge efter:** mandag 5/10 — fase 3a første skive kl. 12 (§2 punkt 28), `g03-fjorten-dage` skive 2 (oven på #1258), udrulningsrunden (punkt 20), E trin 1b (hvis ikke søndag); **tirsdag 6/10 efter kl. 10:15** — `webinar-mail-cron` udrullet og skive 3 lukket (`031000` allersidst), derefter #1258 → #1259 → #1261 → #1263 (nicklas-beviset er taget søndag); onsdag — vagtpakken (punkt 21), dag-1-klokken (22), restancen (27), adressen (31); 13/10 — ring-op-beviset (32); uge 42 — RPC'erne (24), tragten (25), Mailgun (26), SMS (29), den interaktive pakke 9d–9g.

### 4.4 Webinarstakken — hvad mangler for at lukke den

Målt/læst 3/10 (aabne-opgaver §2–§3, `docs/webinarmotor.md` §7–§8; PR-listen genmålt med `gh api …/pulls?state=open` til v2): **8 åbne stablede PR'er (#1255–#1263 — skive 5 har nu PR #1263** på `feat/webinar-chat-bagende`, base #1262), 7 migrationer ikke kørt, 4 låse findes ikke endnu. Stakken er **lukket**, når alt nedenfor er gjort, og grenene + de 9 worktrees er ryddet.

1. **Jonas' §8.2 (B1–B9)** — intet merges uden B9.
1a. **Ny rækkefølge: #1262 ØVERST (rettet v2, rådet 3/10).** I dag står stakken #1255 → #1256 → #1257 → #1258 → #1259 → #1261 → **#1262 → #1263**, så #1263 (skive 5) ikke kan lukkes, før #1262 kan — og #1262 venter på B4 (privatlivsteksten). Ny rækkefølge: **#1255 → #1256 → #1257 → #1258 → #1259 → #1261 → #1263 → #1262**. Det kræver to ombaseringer: #1263 på #1261 (uden #1262's commits; kun hvis #1263 ikke afhænger af #1262's kode — det tjekkes med en diff, før der flyttes; afhænger den, STOP og meld) og #1262 på #1263. Derefter kan #1261 og #1263 merges og lukkes uden B4. **Migrationens tidsstempel følger med (rådet runde 2, HØJ):** #1262's `20261003070000` sorterer i dag FØR #1263's `20261003080000`; ligger #1262 øverst, skal dens migration også køres sidst, så den **omdøbes på #1262's gren til et tidsstempel efter `20261003080000`** — og alle henvisninger (filhovedet, `docs/webinarmotor.md`, værnene, der nævner filnavnet, fx `webinarMotor.guard`) rettes i SAMME ombasering, så CI er grøn på det nye navn. Spec'ens **9b-migration** (§9.9) skal derefter have et tidsstempel, der sorterer EFTER #1262's nye navn; tjek alle åbne PR'er, før navnet vælges (regelsættet (z)). **Squash-merge af en stablet PR kræver ombasering af den næste efter hvert trin** (squash giver en ny commit på main, som den næste gren ikke kender): `rebase --onto origin/main <forrige grens gamle spids> <næste gren>`, push, CI grøn, base sat til main. Skøn 20–30 min pr. trin inkl. CI, ca. 2–3 timer for hele stakken; det står i søndagens tidsskøn (§4.3) og i de følgende dages.
2. **#1255 → #1256 → #1257:** `20261003010000` og `20261003030000` KØRT og målt FØR merge (`GET …?select=kilde_system,session_id,token_version&limit=0` → 200); `20261003031000` (cron) ALLERSIDST, efter deploy og tørkørsel.
2a. **`webinar-mail-cron` udrulles IKKE fra søndag til tirsdag 6/10 kl. 10:15 (standard; rettet v2, rådet 3/10).** #1257 ændrer den (målt: `gh api …/pulls/1257/files`), og 6/10 kl. 08:00 går `syv_dage` til 371 med nåde til 10:00 — en ny mailcron midt i det hold kan ikke gøres om. Efter 10:15 (når skive 1-SQL'en i `g03-fjorten-dage-otte-mangler` er kørt) udrulles den. **Alternativet — kun hvis Jonas vælger det aktivt:** udrul søndag, men kun hvis en tørkørsel FØR og EFTER udrulningen giver **identiske tal for eWebinar-rækkerne** (samme `planlagt`/`sendt`/`for_sent`/`sprunget_*` pr. art) og **`motor_mail.vej_motor = 0`** (ingen motor-tilmelding findes endnu); én afvigelse = rul tilbage (udrul main's kode igen) og STOP.
2b. **Skive 3 (`webinar-motor-cron` + `20261003031000`, begge i #1257) — søndag udrulles `webinar-motor-cron` med bevis, skive 3 er IKKE færdig søndag (rettet v2).** Søndag kl. 15: `webinar-motor-cron` udrulles, og beviset er en tørkørsel, der svarer med motorens markør (`motor: "boardroom-3"` — kun den nye kode har den). Cron-jobbet (`031000`) køres IKKE søndag: det skal ALLERSIDST, efter at også `webinar-mail-cron` (skive 3's `motor_mail`) er udrullet og tørkørt — dvs. tidligst 6/10 efter kl. 10:15. **Skive 3 lukkes 6/10**, når `031000` er kørt og målt (`cron.job` viser `webinar-motor`) og den første planlagte kørsel har svaret 200 med markøren.
3. **Secrets + Bunny + videoen** (§8.1 trin 4, 6).
4. **#1258** (`ti_minutter`, intern prøve ude af tallene): `20261003040000` KØRT før deploy (otte arter i CHECK'en, porten `webinar_ti_minutter_klar`); deploy `webinar-mail-cron`, `webinar-delt`, `drift-agent-cron`; beviserne `ti_minutter.port "klar"`, `interne_fraregnet`, `"drift_agent"`. **Kapaciteten pr. kørsel for `ti_minutter` er UMÅLT** og måles i lastprøven før 14/10 (§8.1 trin 13). **Forudsætning:** `a01-nicklas-link` bevist først — rettet v2: kravet kommer fra **#1257**, som ændrer `webinar-delt` (#1258 ændrer `webinar-delt` gennem tre delte filer — `webinarDashboard`, `annoncepriser`, `webinarDelingSvar` — og `drift-agent-cron` gennem `webinarMailAlarm`/`webinarMailDom`); det er den FØRSTE udrulning af `webinar-delt` efter #1257's merge, der kræver beviset, uanset hvilken PR der udløser den. Beviset tages søndag (pakke F).
5. **#1259** (værtskonsollen): `20261003050000` KØRT → Update.
6. **#1261** (ansøgningen kobles + token ud af Sentry): deploy af `ansoegning-gem` FØR Update (ellers 400); beviset `webinar_kobling` i et «opret»-svar.
7. **#1262 — bygges om til samtykke-krydset** (`a01-capi-webinar`; rådets dom 3/10): et SEPARAT, tomt kryds på tilmeldingen, gemt som `meta_samtykke_at` + tekst; dommen svarer `uden_samtykke` FØRST; `_fbp`/`_fbc` kun med krydset; privatlivsteksten (B4) publiceret FØR låsen `webinarmotor_meta_aktiv` åbnes; beviset `CompleteRegistration` i Events Manager → Test events for en testtilmelding MED kryds — og ingen hændelse for en uden. Kun da lukkes `a01-capi-webinar`.
8. **Skive 5 = PR #1263** (`feat/webinar-chat-bagende`, klokken ved et nyt spørgsmål og svaret på mail): ombaseres på #1261 (punkt 1a); `20261003080000` KØRT; låsen `webinar_svar_mail_aktiv` åbnes kun efter prøve til en egen adresse.
9. **Den interaktive pakke — går ikke på kompromis (Jonas 3/10). Rettet v2: spec'en findes nu** — `docs/webinarmotor.md` **§9** på grenen **`origin/docs/webinar-interaktiv-spec`** (3/10, kun dokumentation, skrevet til Fable søndag). v1's linjer «fremhævede spørgsmål og testimonials står ikke i dokumentet» og «spec'en ligger uden for repoet» er forældede.
   - **Grundlaget (målt i prod 3/10):** Mortens webinar 22/9 (384 tilmeldte) brugte chat (83 personer), feedback (40) og CTA (34 klik); ingen polls, quiz, testimonials eller hotspots blandt dem, der reagerede.
   - **Indhold:** et interaktionslag over videoen (§9.1), fem nye arter — `testimonial`, `billede`, `knap`, `hotspot`, `chatbesked` (§9.2) — plus poll-resultater og fremhævede spørgsmål på skærmen (anonymt), med værn og én migration (§9.9).
   - **Skiverne 9a–9g** (§9.10): 9a motoren (rene domme, ingen migration) · 9b data (migrationen, ikke kørt — Jonas kører den) · 9c serveren (`webinar-puls`, `MOTOR_VERSION` «boardroom-4») · 9d seerens flade · 9e editoren · 9f konsollen · 9g visuel hotspot-placering (kan vente til efter P1).
   - **Beslutningerne I1–I10** (§9.11, hver med en anbefaling): I1a mærket automatisk besked · I1b helt anonymt fremhævet spørgsmål · I2 kumulative poll-resultater · I3 samtykkekryds for testimonials · I4/I4b ikke nu · I5 `LINK_VAERTER` · I6 billeder i en Supabase-bucket · I7 videoens billedformat målt · I8 kortene ikke op over videoen nu · I9 ikke nu · I10 privatlivsteksten udvides før låsen `webinar_fremhaev_aktiv`.
   - **Pakken er IKKE nødvendig for 3/11** (rådet 3/10): webinaret kan afholdes med det, skive 1–5 har (CTA, poll, quiz, feedback, chat/spørgsmål, svar på mail). Den løfter oplevelsen; den bærer ikke åbningen.
   - **Hvornår:** 9a–9c kan starte søndag, model Fable. **I2, I5 og I7 kan stå som konstanter i 9a. I3 og I6 (offentlig bucket = bredere adgang, regelsættet §3) kræver Jonas' svar før 9b.** — men kun som pakke A's anden halvdel, når A's søndagsskive er lukket (de rører A's filer: `interaktioner.ts`, `webinar-puls`), ellers mandag. 9b's migration køres ikke, og 9c udrulles ikke, før stakken er merget. 9d–9g uge 42. Kortet `g04-webinar-interaktiv` foreslås stadig — nu med spec'en som grundlag.
10. **Lastprøve (~300 samtidige), P0-skygge 13/10, afmeldingsprøve, .ics i Apple Mail/Gmail/Outlook** (§8.1 trin 11, 13).
11. **Oprydning:** grenene `feat/webinar-ti-minutter`, `feat/webinarmotor-beslutninger`, `fix/webinar-intern-maal-annoncer`, de tre afløste `feat/webinarmotor-skive1/2/3` og de 9 worktrees fjernes, når stakken er merget (sletning af remote-grene virker ikke gennem proxyen — Jonas eller GitHub-UI'et).

---

### 4.5 BESLUTNING til Jonas — «Kør selv» søndag? (ny i v2; svaret gættes ikke)

**Spørgsmålet:** Må Claude søndag i «Kør selv» køre **rent tilføjende migrationer, udrulninger og Update** via Lovable-MCP (regelsættet §6a: `query_database`, `send_message` til build-chatten med den faste tekst, Update), mens Jonas kun tager **grønt lys, penge, overskrivning og beslutninger**?

**Hvorfor det skal besluttes:** standarden er «Byg med mig» (regelsættet §0), og dér er hver merge, migration, udrulning og Update Jonas' ja i samtalen. Søndagens plan har ca. 7 merges, 6–7 migrationer, 3 deploy-runder og 3 Update-klik oven i beslutningerne — derfor 20–25 runder for ham (§4.3). Regelsættet §2 tillader allerede de rent tilføjende handlinger i «Kør selv»; §3 (sletning/overskrivning, FORBIDDEN, bredere adgang, penge, mails uden for et godkendt flow, beslutningskort, det, der ikke kan rulles tilbage) gælder i BEGGE tilstande.

| Handling søndag | «Byg med mig» (standard) | «Kør selv» (hvis Jonas siger ja) |
|---|---|---|
| B1–B9, I1–I10, §4.5, de beslutningskort, der skal afgøres | Jonas | Jonas |
| Grønt lys til E (REVOKE 1a/1b, milestones, 15 politikker) — FORBIDDEN | Jonas | Jonas |
| Ja til overskrivning af tal (genkørslen, B) | Jonas | Jonas |
| Penge (Stripe-opkald, priser) | Jonas | Jonas |
| Bunny-bibliotek og secrets (hans konti, hans nøgler) | Jonas | Jonas |
| Delingslinket til nicklas-beviset | Jonas | Jonas (oprettes som rådgiver i hans navn) |
| `webinar-mail-cron` før 6/10 kl. 10:15 (alternativet i §4.4 2a) | Jonas | Jonas |
| Rent tilføjende migrationer (`010000`, `030000`, #1146's, snapshot-tabellerne) | Claude forbereder, **Jonas kører** i SQL editor (eller siger ja til, at Claude kører) | **Claude kører** via `query_database` (FØR → filens krop ordret → EFTER; hovedet vendes til KØRT) |
| E's migrationer (efter grønt lys) | Jonas kører | Claude kører — kun efter hans grønne lys pr. migration |
| Merge efter grøn CI og rådets dom | Jonas siger ja pr. merge (Claude merger) | Claude merger |
| Eksplicit deploy (build-chat, fast tekst, `get_diff` tom) | Jonas siger ja pr. runde | Claude sender, læser svaret og beviser ved kald |
| Update-klik (efter listen over merges, §4.1 regel 6) | **Jonas klikker** | Claude: Update, når commit'en er målt i Lovables spejl; måling i frisk fane (`deploy_project` er uafklaret — §6a; et klik hos Jonas er den sikre vej, og «i drift» skrives kun efter rekursiv bundle-måling) |
| Tørkørsler og beviser (`kald_edge`, SELECT) | Claude | Claude |
| Ombasering af stakken, PR'er, bogføring | Claude | Claude |
| **Jonas' runder i alt** | **ca. 20–25** | **ca. 8–10** |

**Hvad der IKKE ændres af et ja:** §3 og FORBIDDEN-listen; reglen om ét bevis pr. udrulning; at Claude stopper ved en forudsætning, der ikke holder. Svaret bogføres i OVERLEVERING med klokkeslæt; uden svar gælder «Byg med mig», og planen skæres til det, hans runder rækker til (C og F først, D og E skubbes).

## 5. Ikke nu — bevidst parkeret

| Kort | Grunden | Tages op |
|---|---|---|
| `g03-economic-integration` | Største medlemsværdi på listen (medlem 5 · forretning 5), men L og en idé; Dine tal skal først være rigtige (pakke B), og målingen 8/10 skal vise, om upload er hindringen. | **Pilot-recon (Haiku/Opus) uge 42**, efter `g03-dine-tal-brug-8-10` — Fable-pakke på én virksomhed (Floren) en uge, hvis Jonas siger ja. |
| `g03-medlem-til-medlem`, `g03-ingen-soegning`, `g03-community-video`, `g03-husets-nyheder-ugentlig`, `g03-profil-rediger-inline`, `g03-partneraftale-fremhaev` | Netværket skrives ikke (3 tråde / 2 svar fra medlemmer på 30 d); en ny skriveflade før beslutningen er polering af et sted, ingen bruger. | Efter `g03-netvaerket-laeses-ikke-skrives`. |
| `w15`, `w-brugbar`, `g03-frie-lektioner-topix`, `g03-data-drevne-omraader`, `m16-brugbar-er-kunde` | Akademiet falder; kursusbeskrivelser løser ikke et fald, ingen har forklaret. | Efter `g03-akademiet-falder`. |
| `m17-gennemgangen-af-de-8`, `g03-budgetafvigelse-linjer`, `g03-fra-budget-maalkilde`, `g03-standardmaal-doed-kode` | Dine mål bruges af 3 virksomheder. | Efter `g03-dine-maal-bruges-ikke`. |
| `g03-affiliate`, `g03-a-la-carte`, `g03-idebank`, `g03-aktivitetslog`, `g03-raadgiver-som-medlem`, `g03-exit-opsigelse-portal` | Idéer uden målt gevinst (`ansoegninger.kilde = 'anbefaling'` = 0 nogensinde; 0 exit-abonnenter). Lægges frem, bygges ikke (§4a). | Når Jonas beder om dem. |
| `g03-session-uden-spor`, `g03-blok3-emner`, `g03-mailoverblik-side`, `g03-boardroom-mcp`, `g03-brug-umaalt` | Rådgiverværktøjer, der ikke bruges i dag (sessionsnoter 0, samtalenoter 0) eller kræver et stort engangsjob. `g03-brug-umaalt` er den eneste med en reel følge (Fordele/Anbefal kan ikke vurderes) — én lille sporingsskive kan tages, når Netværket er besluttet. | Uge 43+. |
| `g03-aarsrapport-hule-udtraek` | L; ingen målt efterspørgsel ud over ni hule udtræk. | Efter pakke B. |
| `g03-mobil-hbside`, `g03-skallen-layout-route`, `g03-former-til-hjemmebane`, `g03-gamle-komponenter`, `g03-billeder-store` | Struktur og polering; ingen vandret scroll på ni ruter ved 390 px (livetjek 3/10). `g03-skallen-layout-route` er hastighed (skøn 0,3–0,6 s pr. navigation) og er **næste hastighedsskive** efter D — ikke parkeret længe. | Skallen: efter D's måling. Resten: når en flade alligevel røres. |
| `g03-community-mailnoegle` | 0 af 34 har slået «Opdateringer» fra (målt 3/10). | Når nogen gør. |
| `a01-tildeling-kolonnen`, `g03-doede-db-kolonner`, `g03-doede-mailveje`, `g03-sletteliste-rest`, `g03-oprydning-836-rester`, `g03-lektionssti-inline`, `m16-skrivevaern`, `g03-kr-kopier`, `a22-migration-dublet`, `a21-ad-id-kommentar`, `g03-grene-oprydning`, `g03-vercel-app`, `a29-statusmail-grene` | Oprydning uden brugerværdi. Ikke parkeret som «aldrig» — **fyldopgaver for Haiku/Sonnet**, når en pakke venter på Jonas, og kun hvis de ikke rører en åben pakkes filer. | Løbende. |
| `g03-mail-klik-efter-13-10` (ny i v2) | Kortet lægger selv klik efter 13/10; måling 4 (overlever afmeldingslinkets query-streng Mailguns viderestilling?) skal tages FØR noget andet og kan ikke gøres om — ikke en søndagsopgave. | 14/10: måling 4 (Haiku), derefter Jonas' fire svar A–D. |
| `g03-admin-sletteveje` (ny i v2) | Lækagen er lukket (#830), ingen kalder vejene i `src`, de kræver et admin-JWT; risikoen er en admin, der trykker forkert. Omlægningen til slettefunktionens mønster er M uden målt følge. | Med `g03-to-raadgivere-hundrede` (før en tredje person får admin). |
| `g03-ai-fanen-brug` (ny i v2) | Beslutningen kan ikke tages før 30 dages anonym log, og loggen kræver en edge-ændring + udrulning; chatten bærer værdien (brugsfaktor 1,25), så den røres ikke, mens stakken lander. | Loggen (S) uge 42; beslutningen 30 dage efter. |
| `a20-profilmodel` (ny i v2) | Hændelserne «Ansoegning paabegyndt/sendt» dækker i dag; `tb_ansoegning_trin` og aktiveringsraten giver først værdi, når lag 4/5 (agenten, retur-data) bygges. | Med Klaviyo lag 5. |
| `g03-admin-menu-navne` (ny i v2) | Ét navn på en side, kun rådgiverne ser (rådgiver 1, ingen følge). | Med `g03-to-raadgivere-hundrede` — navnet afhænger af, om advisor og admin skilles. |
| `g03-economic`-nære betalingskort uden dato: `m16e-traek-uden-kobling`, `m14-mails`, `g03-stripe-customer-id-tom`, `g03-stripe-betalingsplan-tekst`, `m17-nordic-rate-2`, `a18-virksomhed-efter-dag60`, `n14-5` | Rigtige, men uden frist og afhængige af beslutningen om e-conomic/bogføringen. | Med `m16-economic-doed`. |

---

## Bilag A — hele rangeringen (formlen før overstyringerne)

Sorteret: «Haster» først, derefter prioritet, derefter justeret værdi. M·R·F·Ri = medlem · rådgiver · forretning · risiko (Værdi 3/10-linjen). Sted fra anmeldernes dom; for de 17 fase 2-kort uden dom er stedet sektionens.

| # | Kort | Status | Sted | M·R·F·Ri | Indsats | Værdi | Justeret | Prioritet | Haster |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `g03-to-traek-fejler` | fejl | betaling | 1·3·5·4 | S | 17,5 | 17,5 | 21,88 | ja |
| 2 | `g03-klaviyo-r63tqd-erstatter` | mangler | indgang | 2·1·3·3 | S | 12,0 | 12,0 | 12,0 | ja¹ |
| 3 | `g03-fjorten-dage-otte-mangler` | fejl | indgang | 1·1·4·4 | M | 14,0 | 14,0 | 8,75 | ja |
| 4 | `g03-dine-tal-brug-8-10` | beslutning | Dine tal | 4·3·5·4 | S | 20,5 | 22,25 | 22,25 |  |
| 5 | `m17-saldobalance-pdf-uden-i-alt` | mangler | Dine tal | 4·2·3·3 | S | 15,0 | 16,5 | 16,5 |  |
| 6 | `m17-ai-skema-grupper` | mangler | Dine tal | 4·2·3·3 | S | 15,0 | 16,5 | 16,5 |  |
| 7 | `g03-restore-uproevet` | mangler | drift/bagende | 2·1·3·5 | S | 15,0 | 15,0 | 15,0 |  |
| 8 | `m17-manuelle-rettelser` | beslutning | Dine tal | 3·2·2·3 | S | 12,5 | 13,75 | 13,75 |  |
| 9 | `a18-jurist` | mangler | indgang | 2·1·3·4 | S | 13,5 | 13,5 | 13,5 |  |
| 10 | `g03-svartid-19-timer` | beslutning | Din rådgiver | 3·3·3·1 | S | 12,0 | 13,5 | 13,5 |  |
| 11 | `a01-gamle-uden-bruger` | mangler | rådgiver | 3·2·3·2 | S | 12,5 | 12,5 | 12,5 |  |
| 12 | `m17-brroset-runde-tusinder` | beslutning | Dine tal | 3·1·2·3 | S | 11,5 | 12,5 | 12,5 |  |
| 13 | `w11` | mangler | rådgiver | 2·3·2·3 | S | 12,5 | 12,5 | 12,5 |  |
| 14 | `g03-strandet-upload` | mangler | rådgiver | 2·3·2·3 | S | 12,5 | 12,5 | 12,5 |  |
| 15 | `g03-rapporteringsfejl-slags6` | mangler | rådgiver | 2·3·2·3 | S | 12,5 | 12,5 | 12,5 |  |
| 16 | `g03-persondata-meta` | fejl | indgang | 1·0·2·4 | S | 10,0 | 10,0 | 12,5 |  |
| 17 | `g03-pass-uden-facts` | beslutning | Dine tal | 3·2·2·2 | S | 11,0 | 12,25 | 12,25 |  |
| 18 | `m17-rallysupport-to-eksporter` | beslutning | Dine tal | 3·2·2·2 | S | 11,0 | 12,25 | 12,25 |  |
| 19 | `a01-agent-bevis` | mangler | rådgiver | 2·3·1·3 | S | 11,0 | 11,0 | 11,0 |  |
| 20 | `m17-fail-kraever-raadgiver` | beslutning | Dine tal | 2·2·1·3 | S | 10,0 | 11,0 | 11,0 |  |
| 21 | `g03-dag1-klokke-laas` | beslutning | rådgiver | 2·3·2·2 | S | 11,0 | 11,0 | 11,0 |  |
| 22 | `a01-bucket-a-bevis` | mangler | Dine mål | 3·1·1·4 | S | 11,5 | 10,5 | 10,5 |  |
| 23 | `a01-capi-webinar` | beslutning | marketing/webinar | 0·0·3·4 | S | 10,5 | 10,5 | 10,5 |  |
| 24 | `a18-kontakt-spaerret` | mangler | drift/bagende | 0·3·2·3 | S | 10,5 | 10,5 | 10,5 |  |
| 25 | `a19-betaling-uden-adgang` | mangler | drift/bagende | 1·2·2·3 | S | 10,5 | 10,5 | 10,5 |  |
| 26 | `a02-akademi-f0` | mangler | Akademiet | 2·2·2·3 | S | 11,5 | 10,5 | 10,5 |  |
| 27 | `g03-adresse-kan-ikke-rettes` | mangler | rådgiver | 1·2·2·3 | S | 10,5 | 10,5 | 10,5 |  |
| 28 | `m28-flows-uden-optagelse` | beslutning | marketing/webinar | 0·1·3·3 | S | 10,0 | 10,0 | 10,0 |  |
| 29 | `m17-kontrolsum-forside-snapshot` | mangler | rådgiver | 1·3·1·3 | S | 10,0 | 10,0 | 10,0 |  |
| 30 | `a29-overblik-bevis` | mangler | rådgiver | 1·3·2·2 | S | 10,0 | 10,0 | 10,0 |  |
| 31 | `g03-rapportpaamindelse-tavse` | beslutning | Dine tal | 2·1·2·2 | S | 9,0 | 9,75 | 9,75 |  |
| 32 | `a01-nicklas-link` | mangler | marketing/webinar | 0·2·3·2 | S | 9,5 | 9,5 | 9,5 |  |
| 33 | `a22-spf-topix` | mangler | drift/bagende | 0·2·2·3 | S | 9,5 | 9,5 | 9,5 |  |
| 34 | `a20-bevis-slettes-dag-45` | mangler | drift/bagende | 0·2·2·3 | S | 9,5 | 9,5 | 9,5 |  |
| 35 | `m17-ykrg-juni` | mangler | betaling | 0·2·3·2 | S | 9,5 | 9,5 | 9,5 |  |
| 36 | `g03-jonas-session-null` | beslutning | Din rådgiver | 2·2·1·2 | S | 8,5 | 9,5 | 9,5 |  |
| 37 | `a18-aftale-visning` | mangler | rådgiver | 0·3·2·2 | S | 9,0 | 9,0 | 9,0 |  |
| 38 | `w2` | mangler | indgang | 2·1·2·2 | S | 9,0 | 9,0 | 9,0 |  |
| 39 | `a19-dag31-doedvande` | mangler | betaling | 2·1·2·2 | S | 9,0 | 9,0 | 9,0 |  |
| 40 | `g03-ring-mig-op-bevis` | mangler | drift/bagende | 1·2·2·2 | S | 9,0 | 9,0 | 9,0 |  |
| 41 | `g03-bank-som-i-november` | fejl | Dine tal | 2·0·1·2 | S | 6,5 | 7,0 | 8,75 |  |
| 42 | `a18-sletteloefte` | mangler | indgang | 1·0·1·4 | S | 8,5 | 8,5 | 8,5 |  |
| 43 | `w13` | fejl | Netværket | 2·1·1·2 | S | 7,5 | 6,75 | 8,44 |  |
| 44 | `m17-koerelisten` | mangler | Dine tal | 4·2·3·3 | M | 15,0 | 16,5 | 8,25 |  |
| 45 | `m17-brroset-ykrg` | beslutning | Dine tal | 2·1·1·2 | S | 7,5 | 8,25 | 8,25 |  |
| 46 | `m17-xlsx-combined-navne` | mangler | Dine tal | 2·1·1·2 | S | 7,5 | 8,25 | 8,25 |  |
| 47 | `n14-11` | fejl | drift/bagende | 2·2·3·3 | M | 13,0 | 13,0 | 8,12 |  |
| 48 | `g03-dobbeltmail-1-1` | fejl | Dit Boardroom | 2·0·1·2 | S | 6,5 | 6,5 | 8,12 |  |
| 49 | `a18-carma-25-9` | mangler | rådgiver | 0·2·3·1 | S | 8,0 | 8,0 | 8,0 |  |
| 50 | `w17` | beslutning | betaling | 0·2·2·2 | S | 8,0 | 8,0 | 8,0 |  |
| 51 | `a02-vagt-jobnavn` | mangler | drift/bagende | 0·2·1·3 | S | 8,0 | 8,0 | 8,0 |  |
| 52 | `g03-vagt-invarianter` | mangler | drift/bagende | 1·1·1·3 | S | 8,0 | 8,0 | 8,0 |  |
| 53 | `g03-claude-md-pladsholder` | mangler | drift/bagende | 0·2·1·3 | S | 8,0 | 8,0 | 8,0 |  |
| 54 | `g03-to-raadgivere-hundrede` | beslutning | Dit Boardroom | 2·4·4·2 | M | 15,0 | 15,0 | 7,5 |  |
| 55 | `w14` | fejl | drift/bagende | 1·2·2·4 | M | 12,0 | 12,0 | 7,5 |  |
| 56 | `a30-video-dagen-foer` | mangler | marketing/webinar | 2·1·2·1 | S | 7,5 | 7,5 | 7,5 |  |
| 57 | `g03-akademiet-falder` | beslutning | Netværket | 3·1·2·1 | S | 8,5 | 7,5 | 7,5 |  |
| 58 | `g03-region-compute-rundtur` | mangler | drift/bagende | 1·2·1·2 | S | 7,5 | 7,5 | 7,5 |  |
| 59 | `a30-nyhedsagent-laas` | beslutning | rådgiver | 2·2·1·1 | S | 7,0 | 7,0 | 7,0 |  |
| 60 | `m28-pris-to-tal` | mangler | marketing/webinar | 0·1·2·2 | S | 7,0 | 7,0 | 7,0 |  |
| 61 | `g03-udloebet-uden-for-sletning` | beslutning | indgang | 0·1·1·3 | S | 7,0 | 7,0 | 7,0 |  |
| 62 | `m15-gamle-fakturaer` | mangler | betaling | 0·1·2·2 | S | 7,0 | 7,0 | 7,0 |  |
| 63 | `m17-uden-fil-og-fem-procent` | mangler | Dine tal | 1·1·1·2 | S | 6,5 | 7,0 | 7,0 |  |
| 64 | `g03-ydeevne-sentry` | mangler | drift/bagende | 2·2·1·1 | S | 7,0 | 7,0 | 7,0 |  |
| 65 | `m28-tragten-foer-skemaet` | mangler | indgang | 1·2·5·2 | M | 13,5 | 13,5 | 6,75 |  |
| 66 | `g03-mailgun-levering` | mangler | indgang | 1·3·3·3 | M | 13,0 | 13,0 | 6,5 |  |
| 67 | `m16-de-foerste-30-dage` | mangler | rådgiver | 0·2·2·1 | S | 6,5 | 6,5 | 6,5 |  |
| 68 | `w5` | mangler | indgang | 0·2·1·2 | S | 6,5 | 6,5 | 6,5 |  |
| 69 | `g03-systembeskeder-ud` | mangler | Din rådgiver | 2·2·0·1 | S | 5,5 | 6,5 | 6,5 |  |
| 70 | `a20-url-tags-vaern` | mangler | marketing/webinar | 0·2·2·1 | S | 6,5 | 6,5 | 6,5 |  |
| 71 | `m16-invitation-spaerret` | fejl | indgang | 1·1·1·1 | S | 5,0 | 5,0 | 6,25 |  |
| 72 | `n14-4` | fejl | indgang | 1·1·1·1 | S | 5,0 | 5,0 | 6,25 |  |
| 73 | `g03-retries-opbrugt-faktura` | mangler | betaling | 1·2·3·3 | M | 12,0 | 12,0 | 6,0 |  |
| 74 | `g03-dine-maal-bruges-ikke` | beslutning | Dine mål | 4·2·3·2 | M | 13,5 | 12,0 | 6,0 |  |
| 75 | `a30-pleo-eksport` | mangler | drift/bagende | 0·0·2·2 | S | 6,0 | 6,0 | 6,0 |  |
| 76 | `a22-ewebinar-ics-aaben` | mangler | marketing/webinar | 0·0·1·3 | S | 6,0 | 6,0 | 6,0 |  |
| 77 | `a22-kampagnernes-maal` | mangler | marketing/webinar | 0·0·3·1 | S | 6,0 | 6,0 | 6,0 |  |
| 78 | `g03-security-definer-anon` | beslutning | Dine mål | 0·0·1·**4** (rådet v2: 3→4) | S | **7,5** | **7,5** | **7,5** (ville stå som ~nr. 54–57) |  |
| 79 | `m17-gennemgangen-af-de-8` | mangler | rådgiver | 1·2·1·1 | S | 6,0 | 6,0 | 6,0 |  |
| 80 | `m16-fortsaet-forloeb` | mangler | Dit Boardroom | 2·1·1·1 | S | 6,0 | 6,0 | 6,0 |  |
| 81 | `g03-netvaerket-laeses-ikke-skrives` | beslutning | Netværket | 3·1·2·0 | S | 7,0 | 6,0 | 6,0 |  |
| 82 | `m17-refleksionslinjerne` | mangler | rådgiver | 1·2·1·1 | S | 6,0 | 6,0 | 6,0 |  |
| 83 | `a21-stille-klokker-27` | mangler | rådgiver | 1·2·1·1 | S | 6,0 | 6,0 | 6,0 |  |
| 84 | `g03-email-send-log-indeks-migration` | mangler | drift/bagende | 0·0·1·3 | S | 6,0 | 6,0 | 6,0 |  |
| 85 | `a20-kilde-direkte-utm` | mangler | indgang | 0·1·2·1 | S | 5,5 | 5,5 | 5,5 |  |
| 86 | `g03-stripe-betalingsplan-tekst` | mangler | betaling | 0·1·1·2 | S | 5,5 | 5,5 | 5,5 |  |
| 87 | `g03-stripe-customer-id-tom` | mangler | betaling | 0·1·1·2 | S | 5,5 | 5,5 | 5,5 |  |
| 88 | `a21-import-hentning` | mangler | marketing/webinar | 0·1·1·2 | S | 5,5 | 5,5 | 5,5 |  |
| 89 | `a20-set-procent-vaern` | mangler | marketing/webinar | 0·1·1·2 | S | 5,5 | 5,5 | 5,5 |  |
| 90 | `a20-ingen-noegle-warn` | mangler | drift/bagende | 0·1·1·2 | S | 5,5 | 5,5 | 5,5 |  |
| 91 | `m16-datacvr-vilkaar` | mangler | drift/bagende | 0·1·1·2 | S | 5,5 | 5,5 | 5,5 |  |
| 92 | `g03-financial-reports-jsonb-kald` | mangler | drift/bagende | 0·1·1·2 | S | 5,5 | 5,5 | 5,5 |  |
| 93 | `g03-session-uden-spor` | beslutning | Din rådgiver | 2·3·2·1 | M | 9,5 | 10,75 | 5,38 |  |
| 94 | `a29-vedhaeftning-slettes-ikke` | fejl | Din rådgiver | 1·0·0·2 | S | 4,0 | 4,25 | 5,31 |  |
| 95 | `g03-medlem-til-medlem` | mangler | Netværket | 4·2·3·1 | M | 12,0 | 10,5 | 5,25 |  |
| 96 | `g03-mailoverblik-side` | beslutning | rådgiver | 0·3·2·3 | M | 10,5 | 10,5 | 5,25 |  |
| 97 | `g03-ai-fanen-brug` | beslutning | Din rådgiver | 2·1·1·0 | S | 4,5 | 5,25 | 5,25 |  |
| 98 | `a20-kollision-ni-mails` | beslutning | marketing/webinar | 3·1·2·2 | M | 10,0 | 10,0 | 5,0 |  |
| 99 | `a01-design-senere` | mangler | Dit Boardroom | 2·0·1·1 | S | 5,0 | 5,0 | 5,0 |  |
| 100 | `a21-afholdt-rykker-tekst` | mangler | indgang | 0·2·1·1 | S | 5,0 | 5,0 | 5,0 |  |
| 101 | `a20-calendly-no-show` | mangler | indgang | 0·2·1·1 | S | 5,0 | 5,0 | 5,0 |  |
| 102 | `a29-morten-retter-uden-booking` | mangler | rådgiver | 1·1·1·1 | S | 5,0 | 5,0 | 5,0 |  |
| 103 | `m17-virksomhedssiden-pr1` | mangler | rådgiver | 0·2·1·1 | S | 5,0 | 5,0 | 5,0 |  |
| 104 | `w16` | mangler | drift/bagende | 0·2·0·2 | S | 5,0 | 5,0 | 5,0 |  |
| 105 | `m16-maaske-relevant` | mangler | Dit Boardroom | 2·0·1·1 | S | 5,0 | 5,0 | 5,0 |  |
| 106 | `g03-agent-budget-tomt` | fejl | Dine tal | 1·1·0·1 | S | 3,5 | 4,0 | 5,0 |  |
| 107 | `g03-samtaleliste-500` | mangler | Din rådgiver | 0·3·1·3 | M | 9,0 | 9,75 | 4,88 |  |
| 108 | `g03-with-check-15-politikker` | beslutning | Dine mål | 1·0·2·4 | M | 10,0 | 9,75 | 4,88 |  |
| 109 | `m17-virksomhedssiden-pr2` | mangler | rådgiver | 1·4·2·1 | M | 9,5 | 9,5 | 4,75 |  |
| 110 | `a20-moedelink-egne-mails` | mangler | indgang | 2·1·2·2 | M | 9,0 | 9,0 | 4,5 |  |
| 111 | `n14-5` | mangler | rådgiver | 1·2·2·2 | M | 9,0 | 9,0 | 4,5 |  |
| 112 | `a30-cron-log-bloat` | beslutning | drift/bagende | 0·0·1·2 | S | 4,5 | 4,5 | 4,5 |  |
| 113 | `a02-milestones-with-check` | beslutning | drift/bagende | 0·0·0·3 | S | 4,5 | 4,5 | 4,5 |  |
| 114 | `a30-boardroom-2-prod` | mangler | drift/bagende | 0·0·0·3 | S | 4,5 | 4,5 | 4,5 |  |
| 115 | `g03-functions-uden-config-blok` | mangler | drift/bagende | 0·0·1·2 | S | 4,5 | 4,5 | 4,5 |  |
| 116 | `g03-opbevaringspolitik` | beslutning | drift/bagende | 1·0·2·3 | M | 8,5 | 8,5 | 4,25 |  |
| 117 | `g03-ingen-soegning` | mangler | Netværket | 3·4·2·0 | M | 10,0 | 8,25 | 4,12 |  |
| 118 | `g03-mail-klik-efter-13-10` | beslutning | indgang | 0·2·2·2 | M | 8,0 | 8,0 | 4,0 |  |
| 119 | `g03-mobil-hbside` | mangler | Dit Boardroom | 3·2·1·1 | M | 8,0 | 8,0 | 4,0 |  |
| 120 | `a20-bot-klik` | mangler | marketing/webinar | 1·0·1·1 | S | 4,0 | 4,0 | 4,0 |  |
| 121 | `a18-virksomhed-efter-dag60` | beslutning | betaling | 0·1·1·1 | S | 4,0 | 4,0 | 4,0 |  |
| 122 | `g03-import-parser-fem-fejl` | mangler | indgang | 0·1·1·1 | S | 4,0 | 4,0 | 4,0 |  |
| 123 | `a19-paamindelser-hverdage` | mangler | betaling | 1·0·1·1 | S | 4,0 | 4,0 | 4,0 |  |
| 124 | `m16e-traek-uden-kobling` | beslutning | betaling | 0·1·1·1 | S | 4,0 | 4,0 | 4,0 |  |
| 125 | `m17-nordic-rate-2` | mangler | betaling | 0·1·1·1 | S | 4,0 | 4,0 | 4,0 |  |
| 126 | `m14-mails` | beslutning | betaling | 0·1·1·1 | S | 4,0 | 4,0 | 4,0 |  |
| 127 | `m16-svar-paa-besked` | mangler | Din rådgiver | 1·1·0·1 | S | 3,5 | 4,0 | 4,0 |  |
| 128 | `a22-cron-vagt-tidsjoin` | mangler | drift/bagende | 0·1·0·2 | S | 4,0 | 4,0 | 4,0 |  |
| 129 | `a20-replay-deltog` | beslutning | marketing/webinar | 0·1·1·1 | S | 4,0 | 4,0 | 4,0 |  |
| 130 | `g03-self-host-fonte` | mangler | drift/bagende | 1·0·0·2 | S | 4,0 | 4,0 | 4,0 |  |
| 131 | `g03-community-mailnoegle` | beslutning | drift/bagende | 1·0·1·1 | S | 4,0 | 4,0 | 4,0 |  |
| 132 | `m16-economic-doed` | fejl | betaling | 0·2·3·4 | L | 12,5 | 12,5 | 3,91 |  |
| 133 | `a01-legacy-noegler` | beslutning | drift/bagende | 1·2·3·5 | L | 15,0 | 15,0 | 3,75 |  |
| 134 | `a22-forside-langsom` | fejl | rådgiver | 0·3·1·1 | M | 6,0 | 6,0 | 3,75 |  |
| 135 | `w-brugbar` | mangler | Akademiet | 1·2·1·0 | S | 4,5 | 3,75 | 3,75 |  |
| 136 | `g03-event-lokation` | mangler | Netværket | 2·1·1·0 | S | 4,5 | 3,75 | 3,75 |  |
| 137 | `m28-nyhedsbrev-utm-felter` | fejl | marketing/webinar | 0·0·1·1 | S | 3,0 | 3,0 | 3,75 |  |
| 138 | `a20-afmeld-platform` | mangler | indgang | 1·0·1·3 | M | 7,0 | 7,0 | 3,5 |  |
| 139 | `g03-admin-sletteveje` | beslutning | drift/bagende | 0·1·1·3 | M | 7,0 | 7,0 | 3,5 |  |
| 140 | `m16-klokke-chat` | mangler | rådgiver | 0·2·0·1 | S | 3,5 | 3,5 | 3,5 |  |
| 141 | `g03-boardroom-mcp` | beslutning | drift/bagende | 0·2·1·0 | S | 3,5 | 3,5 | 3,5 |  |
| 142 | `g03-ugekort-to-skrivere` | mangler | drift/bagende | 1·1·0·1 | S | 3,5 | 3,5 | 3,5 |  |
| 143 | `a20-profilmodel` | beslutning | marketing/webinar | 1·1·2·1 | M | 6,5 | 6,5 | 3,25 |  |
| 144 | `g03-brug-umaalt` | mangler | rådgiver | 0·2·2·1 | M | 6,5 | 6,5 | 3,25 |  |
| 145 | `m16-auto-deploy-canary` | mangler | drift/bagende | 0·2·0·3 | M | 6,5 | 6,5 | 3,25 |  |
| 146 | `m16-brugbar-er-kunde` | fejl | rådgiver | 0·1·0·1 | S | 2,5 | 2,5 | 3,12 |  |
| 147 | `g03-vagt-roed-gentages` | fejl | drift/bagende | 0·1·0·1 | S | 2,5 | 2,5 | 3,12 |  |
| 148 | `g03-tavse-queryfn` | fejl | drift/bagende | 0·1·0·1 | S | 2,5 | 2,5 | 3,12 |  |
| 149 | `g03-adgangsdomme-paritet` | mangler | drift/bagende | 0·0·1·3 | M | 6,0 | 6,0 | 3,0 |  |
| 150 | `w15` | mangler | Akademiet | 2·0·1·0 | S | 3,5 | 3,0 | 3,0 |  |
| 151 | `g03-buckets-uden-graense` | mangler | drift/bagende | 0·0·0·2 | S | 3,0 | 3,0 | 3,0 |  |
| 152 | `g03-kr-kopier` | mangler | drift/bagende | 0·0·1·1 | S | 3,0 | 3,0 | 3,0 |  |
| 153 | `g03-agent-milesten-ord` | fejl | Dine mål | 1·0·0·1 | S | 2,5 | 2,25 | 2,81 |  |
| 154 | `g03-din-plan-dobbelt-overskrift` | fejl | Dine mål | 1·0·0·1 | S | 2,5 | 2,25 | 2,81 |  |
| 155 | `g03-aarsrapport-hule-udtraek` | beslutning | Dine tal | 2·2·2·2 | L | 10,0 | 11,0 | 2,75 |  |
| 156 | `g03-verify-jwt-fase3a` | mangler | drift/bagende | 1·1·2·4 | L | 11,0 | 11,0 | 2,75 |  |
| 157 | `a29-chat-video-huller` | mangler | Din rådgiver | 1·1·0·2 | M | 5,0 | 5,5 | 2,75 |  |
| 158 | `g03-skallen-layout-route` | mangler | Dit Boardroom | 2·2·0·1 | M | 5,5 | 5,5 | 2,75 |  |
| 159 | `g03-advisor-admin-gates` | beslutning | drift/bagende | 0·1·0·3 | M | 5,5 | 5,5 | 2,75 |  |
| 160 | `g03-benchmark-below-t6` | beslutning | Dine tal | 1·0·0·1 | S | 2,5 | 2,75 | 2,75 |  |
| 161 | `g03-economic-integration` | idé | Dine tal | 5·3·5·2 | L | 18,5 | 20,5 | 2,56 |  |
| 162 | `a21-redigerbare-mails` | mangler | rådgiver | 0·2·1·1 | M | 5,0 | 5,0 | 2,5 |  |
| 163 | `a22-rls-initplan` | mangler | drift/bagende | 1·1·0·2 | M | 5,0 | 5,0 | 2,5 |  |
| 164 | `a01-tildeling-kolonnen` | beslutning | drift/bagende | 0·1·0·1 | S | 2,5 | 2,5 | 2,5 |  |
| 165 | `n14-10` | mangler | rådgiver | 0·1·0·1 | S | 2,5 | 2,5 | 2,5 |  |
| 166 | `m15-vinduet` | mangler | drift/bagende | 1·0·0·1 | S | 2,5 | 2,5 | 2,5 |  |
| 167 | `g03-budget-indsaet-regneark` | mangler | Dine tal | 1·1·0·0 | S | 2,0 | 2,5 | 2,5 |  |
| 168 | `m16-fremdrift-hentefejl` | mangler | rådgiver | 0·1·0·1 | S | 2,5 | 2,5 | 2,5 |  |
| 169 | `m17-gamle-members-links` | mangler | rådgiver | 0·1·0·1 | S | 2,5 | 2,5 | 2,5 |  |
| 170 | `g03-lektionssti-inline` | mangler | drift/bagende | 1·0·0·1 | S | 2,5 | 2,5 | 2,5 |  |
| 171 | `a19-tekstudgaven-dobbelt-knap` | mangler | drift/bagende | 1·0·0·1 | S | 2,5 | 2,5 | 2,5 |  |
| 172 | `g03-info-notifikationer` | mangler | drift/bagende | 0·1·0·1 | S | 2,5 | 2,5 | 2,5 |  |
| 173 | `g03-baseline-tekst-koert` | mangler | drift/bagende | 0·1·0·1 | S | 2,5 | 2,5 | 2,5 |  |
| 174 | `g03-budgetafvigelse-linjer` | idé | Dine tal | 3·2·2·0 | M | 8,0 | 9,25 | 2,31 |  |
| 175 | `g03-slet-person-skift-owner` | mangler | rådgiver | 1·2·1·3 | L | 9,0 | 9,0 | 2,25 |  |
| 176 | `g03-advisor-dashboard-skala` | mangler | drift/bagende | 0·3·2·2 | L | 9,0 | 9,0 | 2,25 |  |
| 177 | `g03-husets-nyheder-ugentlig` | idé | Netværket | 2·2·1·0 | S | 5,5 | 4,5 | 2,25 |  |
| 178 | `g03-gamle-komponenter` | fejl | Dit Boardroom | 0·2·0·1 | M | 3,5 | 3,5 | 2,19 |  |
| 179 | `g03-a-la-carte` | idé | Dit Boardroom | 2·1·3·0 | M | 7,5 | 7,5 | 1,88 |  |
| 180 | `g03-frie-lektioner-topix` | beslutning | Netværket | 0·1·2·0 | M | 4,0 | 3,75 | 1,88 |  |
| 181 | `g03-standardmaal-doed-kode` | mangler | Dine tal | 0·0·0·1 | S | 1,5 | 1,5 | 1,5 |  |
| 182 | `g03-profil-rediger-inline` | mangler | Netværket | 1·1·0·0 | S | 2,0 | 1,5 | 1,5 |  |
| 183 | `a29-statusmail-grene` | mangler | drift/bagende | 0·0·0·1 | S | 1,5 | 1,5 | 1,5 |  |
| 184 | `a22-ga4-secret-skift` | mangler | marketing/webinar | 0·0·0·1 | S | 1,5 | 1,5 | 1,5 |  |
| 185 | `a22-migration-dublet` | mangler | drift/bagende | 0·0·0·1 | S | 1,5 | 1,5 | 1,5 |  |
| 186 | `a21-ad-id-kommentar` | mangler | marketing/webinar | 0·0·0·1 | S | 1,5 | 1,5 | 1,5 |  |
| 187 | `a20-cta-etiket` | mangler | marketing/webinar | 0·0·1·0 | S | 1,5 | 1,5 | 1,5 |  |
| 188 | `m16-skrivevaern` | mangler | drift/bagende | 0·0·0·1 | S | 1,5 | 1,5 | 1,5 |  |
| 189 | `g03-oprydning-836-rester` | mangler | drift/bagende | 0·0·0·1 | S | 1,5 | 1,5 | 1,5 |  |
| 190 | `g03-grene-oprydning` | mangler | drift/bagende | 0·0·0·1 | S | 1,5 | 1,5 | 1,5 |  |
| 191 | `g03-vercel-app` | mangler | drift/bagende | 0·0·0·1 | S | 1,5 | 1,5 | 1,5 |  |
| 192 | `g03-sletteliste-rest` | mangler | drift/bagende | 0·0·0·1 | S | 1,5 | 1,5 | 1,5 |  |
| 193 | `g03-doede-db-kolonner` | mangler | drift/bagende | 0·0·0·1 | S | 1,5 | 1,5 | 1,5 |  |
| 194 | `g03-rester-og-app-config` | mangler | drift/bagende | 0·0·0·1 | S | 1,5 | 1,5 | 1,5 |  |
| 195 | `g03-fra-budget-maalkilde` | idé | Dine tal | 2·1·1·0 | M | 4,5 | 5,25 | 1,31 |  |
| 196 | `a20-kampagne-spor` | idé | marketing/webinar | 0·2·2·0 | M | 5,0 | 5,0 | 1,25 |  |
| 197 | `g03-doede-mailveje` | mangler | Dit Boardroom | 0·1·0·1 | M | 2,5 | 2,5 | 1,25 |  |
| 198 | `g03-affiliate` | idé | Netværket | 2·1·4·1 | L | 10,5 | 9,75 | 1,22 |  |
| 199 | `g03-idebank` | idé | Dit Boardroom | 2·1·1·0 | M | 4,5 | 4,5 | 1,12 |  |
| 200 | `g03-partneraftale-fremhaev` | idé | Netværket | 1·0·1·0 | S | 2,5 | 2,25 | 1,12 |  |
| 201 | `g03-blok3-emner` | mangler | Din rådgiver | 0·2·1·0 | L | 3,5 | 4,0 | 1,0 |  |
| 202 | `g03-raadgiver-som-medlem` | idé | Din rådgiver | 0·2·0·1 | M | 3,5 | 4,0 | 1,0 |  |
| 203 | `g03-admin-menu-navne` | beslutning | rådgiver | 0·1·0·0 | S | 1,0 | 1,0 | 1,0 |  |
| 204 | `g03-billeder-store` | mangler | Dit Boardroom | 1·0·0·0 | S | 1,0 | 1,0 | 1,0 |  |
| 205 | `g03-community-video` | beslutning | Netværket | 2·1·1·0 | L | 4,5 | 3,75 | 0,94 |  |
| 206 | `g03-former-til-hjemmebane` | mangler | Dit Boardroom | 0·0·0·1 | M | 1,5 | 1,5 | 0,75 |  |
| 207 | `g03-aktivitetslog` | idé | Din rådgiver | 0·2·1·1 | L | 5,0 | 5,5 | 0,69 |  |
| 208 | `g03-data-drevne-omraader` | mangler | drift/bagende | 1·1·0·0 | L | 2,0 | 2,0 | 0,5 |  |
| 209 | `g03-exit-opsigelse-portal` | idé | betaling | 1·0·0·0 | S | 1,0 | 1,0 | 0,5 |  |

¹ **O1 er faldet bort for Klaviyo-kortet (v2):** kampagne #5 og #6 ekskluderer allerede både R63TqD og Xr6Pm9, så «Haster — før kampagne #5 7/10» holder ikke længere. Rækken står med sin oprindelige plads, så tallene kan genskabes; kortets tag rettes på mangellisten (ikke i denne PR).

## Bilag B — kilder og hvordan tallene genskabes

- Kortene: `docs/mangelliste.html` på main (merget i #1264) — 327 kort, 209 med `data-status` ≠ `loest` (mangler 130 · beslutning 46 · fejl 21 · idé 12), talt ved at parse kortenes `div.card` og «Værdi 3/10: medlem X · rådgiver X · forretning X · risiko X · indsats S/M/L» (alle 209 har linjen). «Haster» = et tag med ordet (tre kort).
- Brugen: fase 2-recon'en «hvad bruges platformen faktisk til» (SELECT i prod 3/10 ca. 06:30, universet 28 virksomheder / 26 personer); tallene er gengivet på kortene (`g03-dine-tal-brug-8-10`, `g03-dine-maal-bruges-ikke`, `g03-akademiet-falder`, `g03-netvaerket-laeses-ikke-skrives`, `g03-svartid-19-timer`) og i OVERLEVERING DEL 2 «3. oktober — mangellisten gennemgået».
- Hastighed og sikkerhed: fase 2-recon'erne (prod SELECT/EXPLAIN i tilbagerullet transaktion; kode på `origin/main` `2b7c6bf9`), gengivet på `a22-forside-langsom`, `a22-rls-initplan`, `g03-advisor-dashboard-skala`, `g03-security-definer-anon`, `g03-with-check-15-politikker` m.fl.
- Det igangsatte: `docs/aabne-opgaver.md` på grenen `docs/aabne-opgaver` (målt 3/10 ca. 04–05).
- Webinarmotoren: `docs/webinarmotor.md` på grenen `feat/webinar-chat-bagende` (§2, §6, §7.7–7.10, §8).
- SMS: `docs/mailplan-14-dage-og-sms.md` §3–§5 og **`docs/sms.md` på grenen `origin/docs/sms-recon`** (GatewayAPI-recon'en 3/10; v1 skrev fejlagtigt, at den ikke fandtes — grep'en kørte kun på denne gren).
- Den interaktive pakke: `docs/webinarmotor.md` §9 på grenen `origin/docs/webinar-interaktiv-spec`.
- PR-filer (v2): `gh api repos/jonastopix/topix-financial/pulls/<n>/files` for #1146, #1257 og #1258; åbne PR'er med `gh api …/pulls?state=open` (3/10).
- Reglerne: `CLAUDE.md`, `docs/claude-regelsaet.md` (§1a, §2, §3, §4a, §4b, §5, (kk), (ll), (mm), (z), (ee), (jj)).
- Formlen er regnet med et lille Python-script over de udtrukne kort (ikke i repoet): værdi, justeret og prioritet som i §1.1, brugsfaktoren som i §1.2. Genregning: parse kortene, anvend formlen, sortér (haster, prioritet, justeret).

---

## 6. Rettelser i v2 (rådets «ret først» 3/10) — hvad, og hvorfor

| # | Fundet | Hvad v1 sagde | Hvad der er rigtigt / rettet | Hvor |
|---|---|---|---|---|
| 1 | Klaviyo | R63TqD skal ind i flow, kampagner OG Sunset før 7/10; Xr6Pm9 = 25; «op til 6 medlemmer» | Kampagne #5 og #6 ekskluderer allerede begge (målt i Klaviyo-API'et). Skåret til Velkomst TGxxUc og Sunset XCqPKg (læst gennem flowet); kampagnerne beholder begge; Xr6Pm9 fjernes først, når forskellen er målt profil for profil. Xr6Pm9 = 26. «Op til 6» er ikke målt. Ikke længere O1 | §0 nr. 9, §1.3 O1, §2 punkt 3, §3 |
| 2 | `webinar-mail-cron` | Udrullet søndag kl. 15 (skive 3-udgaven) | #1257 ændrer den; udrulles IKKE fra søndag til 6/10 kl. 10:15 (`syv_dage` til 371). Alternativet med identiske tørkørsels-tal og `motor_mail.vej_motor = 0` kun ved Jonas' aktive valg | §4.4 2a, §4.3, §3 |
| 3 | Pakke E | REVOKE på alle 18 i ét trin; risiko 3 | Trin 1a (de rent skrivende/markerende + `cleanup_stale_processing_reports` + `get_all_advisor_profiles`) og trin 1b (`has_role`/`user_company_id`/`is_legat_user`) efter anon-røgprøve mod de 63 PUBLIC-politikkers tabeller og livetjek som anonym af fem stier. Risiko 3 → 4 | §2 punkt 14, §4.3, Bilag A |
| 4 | Rækkefølgen kl. 08 | A, B, C, D åbner; F tager en ledig plads | A, B, C, **F** åbner; Update-målingen er dagens første handling; D tager første ledige plads | §0, §4.3 |
| 5 | Update | Et klik pr. pakke | Update er en fælles kanal: ny række i §4.2; hvert klik noteres med de merges, det tager med. #1146's filer målt — `BoardroomView.tsx` overlapper med C's forsidearbejde; #1146 merges først | §4.1 regel 6, §4.2 |
| 6 | Migrationer | «Én pakke ad gangen med en migration» | Runder kl. 09, 12, 16, 19 | §4.1 regel 2, §4.3 |
| 7 | Jonas' belastning | 8–12 runder | 20–25 i «Byg med mig», 8–10 i «Kør selv» — og beslutningen om «Kør selv» lagt til Jonas med tabel; svaret gættes ikke | §4.1 regel 8, §4.3, §4.5, §3 |
| 8 | Nicklas-beviset | Bundet til #1258 | Bundet til #1257, som ændrer `webinar-delt` (målt); søndagens runder udruller ikke `webinar-delt`; beviset tages søndag i F | §2 punkt 18, §4.4 punkt 4 |
| 9 | Skive 3 | «Skive 1–3 merget og udrullet søndag» | `webinar-motor-cron` udrulles søndag med tørkørsels-bevis; `031000` og mailcronen 6/10 efter 10:15 — skive 3 er IKKE færdig søndag, lukkes 6/10 | §4.4 2b, §4.3 |
| 10 | Stakkens rækkefølge | #1262 før skive 5 | #1262 øverst (efter #1263), så #1261/#1263 kan lukkes uden B4; squash-merge kræver ombasering pr. trin — med i tidsskønnet (ca. 2–3 timer for stakken) | §4.4 punkt 1a, §4.3 |
| 11 | 13 beslutningskort | Manglede | Placeret: på Jonas-listen (`g03-jonas-session-null` — handler om Brick Works/E-skilte/TuaMea, Jonas' ord 3/10 06:15 bogført; `g03-to-raadgivere-hundrede` + `g03-advisor-admin-gates`; `g03-rapportpaamindelse-tavse`; `a20-kollision-ni-mails`; `a20-replay-deltog`; `g03-opbevaringspolitik`; `g03-benchmark-below-t6`) eller under «Ikke nu» med grund (`g03-mail-klik-efter-13-10`, `g03-admin-sletteveje`, `g03-ai-fanen-brug`, `a20-profilmodel`, `g03-admin-menu-navne`) | §3, §5 |
| 12 | Manglende punkter | — | `a18-sletteloefte` (i punkt 8), `g03-adresse-kan-ikke-rettes` (31), `g03-ring-mig-op-bevis` (32, O2 13/10), `a30-boardroom-2-prod` (33), PR #1043 (34) | §2, §3 |
| 13 | Fase 3a | «Søn 4/10» uden plads | Man 5/10 kl. 12; O2 for risiko 5 med hård ukendt frist; trin 2 med forslået frist 30/11; i top 10 | §0, §1.3 O2, §2 punkt 28, §3 |
| 14 | `a01-agent-bevis` | «Ingen kan se, hvilken kode der kører»; bevis ved næste godkendte rapport | `deploy_stamp` viser «v7 tjenestekonti» (senest 2/10 12:53 UTC) — det er stemplet, ikke merges bag det, der er ukendt; beviset tages søndag ved tørkørsel/manuelt kald på testvirksomheden | §2 punkt 7, §4.3 |
| 15 | Bunny-secrets | Mandag; rummet søndag uden embed | Én dag — søndag, så A kan vise afspilleren | §3, §4.3 |
| 16 | Spec'er | «Spec'en for testimonials/fremhævning ligger uden for repoet»; «GatewayAPI-recon'en er ikke i repoet» | `docs/webinarmotor.md` §9 (`origin/docs/webinar-interaktiv-spec`: 9a–9g, I1–I10; ikke nødvendig for 3/11; 9a–9c kan starte søndag med anbefalingerne som standard, Fable) og `docs/sms.md` (`origin/docs/sms-recon`). Runde 2: I2/I5/I7 som konstanter i 9a; I3/I6 kræver Jonas' svar før 9b — ingen «svarer han ikke, gælder anbefalingen» | §4.4 punkt 9, §2 punkt 29, Bilag B |
| + | Brugen | Kun som brugsfaktor | De fire fund (chat og Dine tal bærer værdien; Dine mål næsten ubrugt; Akademiet falder; Netværket læses) står synligt i §0 som beslutninger, ikke byggeopgaver | §0 |

**Lærestreg (min egen):** v1 konkluderede «findes ikke i repoet» ud fra en grep på én gren. Fravær på én gren er ikke fravær i repoet — søg i `git branch -r` (eller `git grep` over de relevante remote-grene), før «findes ikke» skrives.
