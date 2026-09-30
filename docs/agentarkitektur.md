# Agentarkitekturen — Topix.dk ApS / The Boardroom

Skrevet 30/9-2026 af Claude som chefarkitekt, på Jonas' bestilling («Store ambitioner for Økonomiagenten. Kæmpe ambitioner for marketingsagenten … Vi accepterer ikke middelmådighed»). **Status: forslag.** Intet er bygget eller besluttet. Repoet er kun læst (HEAD med `run-company-agent v6`, 113 edge functions); prod er ikke målt i denne session.

Læseregel: **MÅLT** = står i repoet eller i en recon med kilde · **SLÅET OP** = læst på nettet i dag (URL ved påstanden) · **UMÅLT** = ikke set · **VURDERING** = min dom.

Grundlag: `bogholderi-agent-design.md` (29/9), `recon-boardroom-2-prod.md` (30/9), `meta-automatisering-30-09.md`, `klaviyo-gennemgang-30-09.md`, `mail-worstcase.md`, `topix-financial-webinarmotor-spec.md`, `analyse-medlemsrejse.md`, `gamification-analyse-30-09.md`, og i repoet `CLAUDE.md`, `docs/marketingmotoren.md`, `docs/claude-regelsaet.md`, `docs/vision-uafhaengighed.md`.

---

## 0. Konklusionen i tolv linjer

1. **Der findes allerede én agent i drift** (`run-company-agent`, Lovable AI Gateway, `gemini-2.5-flash`, tørkørsel som standard, `agent_runs` + `agent_proposals`, `SKRIVE_TOOLS`-snit, `maaKoereLive`-port — MÅLT). Den er skabelonen for alle medlemsvendte agenter; den skal ikke bygges om, den skal generaliseres.
2. **boardroom-2-prod døde af ni ting, og alle ni er arkitektur, ikke uheld** (§1.1). Det nye fundament er formuleret som ni regler, hver med en mekanisme, der gør fejlen umulig — ikke usandsynlig.
3. **To hjem, én bro.** Agenternes *hjerner* (økonomi, marketingens produktion, indberetning, drift) bor i et nyt Supabase-projekt `topix-agenter` i Jonas' egen organisation (fuld CLI). Platformen beholder sine *hænder* (motorerne med låse: `klaviyo-motor`, `meta-send-cron`, `webinar-mail-cron`, Meta-skrivevejen) og de agenter, der SKAL læse medlemsrækker (adfærd, måned, onboarding, churn, nyhed). Over broen går kun **aggregerede tal og godkendte handlinger** — aldrig en medlemsrække (§1.5).
4. **Fire niveauer af menneske i løkken** (N0 tør · N1 godkend · N2 automatisk-men-gennemses · N3 automatisk), pr. *handlingsart*, ikke pr. agent, og et niveau rykkes kun op på **målt** træfsikkerhed (§1.3). Ned rykkes øjeblikkeligt på én alvorlig fejl.
5. **Økonomiagenten** bygger videre på 29/9-designet med tre rettelser: Pleo udfases til **e-conomic Firmakort** (SLÅET OP: lanceret 1/10-2025, Visa-debetkort udstedt af Mynt, kvitteringsbillede bedes om i appen straks efter køb, uden merpris i Smart/Advanced — §2.2), kortkøb er dermed en *tredje kilde* ved siden af bank og Stripe, og boardroom-2's dublet-fejl gøres umulig med idempotens mod `/booked-entries`, ikke kun mod egen tabel. CFO-modulerne (13-ugers likviditet, MRR, prisforslag, abonnementskontrol, moms, rapport, revisorpakke, lån, alarmer) står i §2.3 med niveau og data.
6. **Marketingagenten** er otte roller i ét system (§3), hvor kun tre kan køre automatisk inden for 12 uger (analytiker, økonom inden for lofter, distributør af godkendt indhold). Copywriter, fotograf og videograf leverer **udkast** til redaktøren; redaktøren er en deterministisk dom (brand + lov + fakta) + ét menneske. Kreativ retning og «hvilken vinkel» er menneskelig i hele perioden — det står ærligt i §3.7.
7. **AI-billeder af mennesker bygges ikke.** EU AI Act art. 50 gælder fra **2/8-2026** (SLÅET OP — altså allerede nu): deep fakes skal mærkes, syntetisk indhold skal bære maskinlæsbar markering fra udbyderen, og Meta mærker automatisk AI-redigerede annoncer («AI info», 7/7-2026). Husets linje: rigtige fotos af Morten og Jonas i et bibliotek; AI kun til illustration/abstraktion, altid mærket i vores egen `medie`-tabel (§3.5).
8. **Video er klip af rigtigt materiale** (webinar, «Iværksætterlivet»), ikke generering. Flaskehalsen er dansk transskription (Whisper ~27,5 % CER, Røst ~11,6 % — MÅLT i `vision-uafhaengighed.md` spor 5), så undertekster er N1 (menneske godkender) i mindst 6 uger (§3.6).
9. **Statistikken er tynd, og det ændrer ingen ambition.** 28 medlemmer, 14 ansøgninger med kilde, 0,56 forventet ansøger pr. annonce pr. webinar (MÅLT). Marketingagenten optimerer derfor på tilmelding/fremmøde og *kalibrerer* på ansøgning/medlem; lag 6's Wilson-dom er porten foran ethvert forslag. En agent, der «vinder» på medlemmer, er en agent, der gætter.
10. **Driftsagenten bygges først** (§4.1), fordi den er det, boardroom-2 manglede: den, der opdager, at en anden agent er holdt op med at køre. Uden den er alt andet et løfte.
11. **Køreplan (§5):** uge 40–41 fundament + driftsagent + økonomi skive 1 (bank ind, bilag ind, faste abonnementer autobogført) · uge 42–45 økonomi skive 2–3 + marketingens analytiker/redaktør/copywriter N1 · uge 46–51 marketingens fotograf/videograf/distributør + måned/adfærd/churn på platformen · Q1 2027 N2→N3-forfremmelser på målt træfsikkerhed. Alt bygget af parallelle agenter; den reelle flaskehals er Jonas' udrulningsrunder i Lovable og hans godkendelser (§5.3).
12. **Det, Jonas skal give** (§5.4): 9 adgange (ingen i chat), 11 beslutninger. De fire, der blokerer alt: e-conomic-pakke + app-grant, Nordea via Enable Banking, Anthropic-nøgle med månedsloft, og «hvem godkender, når du er væk».

---

## DEL A — Fælles fundament for ALLE agenter

### 1.1 Hvorfor boardroom-2 døde — og reglen, der gør det umuligt

Alt herunder er MÅLT i `recon-boardroom-2-prod.md` §6–7.

| # | Det, der skete | Reglen nu | Mekanismen (ikke en hensigt) |
|---|---|---|---|
| 1 | Workeren kørte uden for Supabase; sidste kørsel 24/6, ingen opdagede det | **Ingen agent uden for huset.** Al planlægning er `pg_cron` + `kald_edge` (findes i platformen) i det projekt, agenten bor i | Driftsagenten (§4.1) læser `agent_puls` og alarmerer, når en planlagt kørsel mangler — en manglende række ER alarmen |
| 2 | Banken var aldrig kilde; agenten gættede på, hvad bogholderen ikke havde nået, og lavede 19 dubletter i det rigtige regnskab | **Sandheden er den eksterne kilde, aldrig en kopi.** Idempotens måles mod målsystemet (`/booked-entries`, Klaviyos flow, Metas `effective_status`) FØR hver skrivning | `agent_spor` har FØR (læst fra målsystemet), sendt, EFTER (læst igen). Uden FØR-læsning afvises skrivningen af koden |
| 3 | Én DR/KR-linje pr. postering; løn blokerede en kladde i en uge | **Handlingens datamodel skal kunne udtrykke hele domænet fra dag 1** (`linjer jsonb[]`) | Testen: en lønpostering med seks konti bogføres i prøveregnskabet, før skive 1 kaldes færdig |
| 4 | `total_cost_cents = 0` overalt; 1,9 mio. tokens uden pris | **Ingen kørsel uden pris.** Token-tal × prisliste i kode → `agent_koersel.omkostning_oere` | `agent_budget` (dagsloft pr. agent) læses FØR kaldet; over loft → `over_budget`, ikke et kald |
| 5 | 181 af 185 forslag auto-godkendt af mønstre; 93 godkendt men aldrig posteret; mennesket var væk | **Menneskeløkken må aldrig sove stille.** En N1-kø, der er ældre end 5 hverdage, er en alarm; et niveau kan ikke være N3 uden målt træfsikkerhed | Rykkertrappe til Jonas som ansøgningsmotorens (`planlagte_haendelser`-mønstret): «et signal, kun en browser kan vise, er ikke et signal» |
| 6 | Læring med dato i nøglen; 1 rettelse på to måneder | **Regler er rækker med nøgle, aldrig tekst** (`konteringsregel`, `annoncegraense`) | `n_ens`/`n_afvigelser` pr. regel; kildeværn fælder en regel uden nøgle |
| 7 | 28 SECURITY DEFINER-funktioner kaldbare af anon; nøgler i klartekst i en tabel | **Ingen RPC-flade til agenter. Nøgler i secrets/Vault.** Alle agenttabeller service-role-only | CI-værnet `check-edge-function-auth.ts` kopieres til det nye projekt; en advisor-kørsel («Public Can Execute») i CI blokerer merge |
| 8 | Værktøjskald fejlede på form («critiques.map is not a function»); ét udkast hænger i `running` siden 4/5 | **Struktureret output valideres af skema, og en kørsel har en timeout og et sluttilstand** | `agent_koersel.status ∈ {planlagt, koerer, ok, fejl, timeout, over_budget}`; en `koerer` ældre end sin timeout sættes til `timeout` af driftsagenten |
| 9 | Marketing: director-planer genereret hver søndag; ingen godkendte efter uge 19 | **En agent, der ikke får svar, holder op med at foreslå** — den eskalerer i stedet | Efter 2 ubesvarede runder: ingen ny plan, én mail «jeg venter på dig», og niveau låses |

**De tre principper fra CLAUDE.md gælder oveni:** et signal, kun en browser kan vise, er ikke et signal · et felt, vi ikke selv sætter, er en observation, aldrig en nøgle · merge lægger kilden, den udruller ikke.

### 1.2 Én agent-runtime (`_shared/agentrum/`), spejlet i begge projekter

Bygget som ren kode med tests (paritet mellem `topix-agenter` og platformen, som `omkostningsnoegler.ts`). Ingen ny framework; det er husets egne mønstre samlet.

**Tabeller (alle service-role-only, append-only hvor markeret):**

```
agent            (navn PK, hjem ∈ {platform, topix}, formaal, aktiv bool, niveau_standard)
agent_handling   (agent, art PK sammen, niveau ∈ {N0,N1,N2,N3}, kraever_laas text,
                  dagsloft_antal, dagsloft_oere, forfremmet_at, degraderet_at, grund)
agent_koe        (id, agent, art, noegle UNIQUE, planlagt_at, prioritet, payload jsonb,
                  status, forsoeg, naeste_forsoeg_at, laast_af, laast_til)       -- kø med lås pr. række
agent_koersel    (id, agent, koe_id, model, input_tokens, output_tokens, omkostning_oere,
                  startet_at, sluttet_at, status, stop_grund, deploy_stamp)        -- som agent_runs
agent_forslag    (id, agent, art, maal_ref, foer jsonb, forslag jsonb, begrundelse,
                  dom jsonb, niveau, status ∈ {foreslaaet, godkendt, afvist, udfoert, fejlet,
                  udloebet}, afgjort_af, afgjort_at, udloeber_at)
agent_spor       (id, forslag_id, koersel_id, trin, foer jsonb, sendt jsonb, svar jsonb,
                  efter jsonb, afveg jsonb, http, at)                              -- append-only, som klaviyo_spor
agent_puls       (agent, art, forventet_at, set_at, status)                        -- hjertet
agent_budget     (agent, dato, brugt_oere, loft_oere, kald)
agent_eval       (id, agent, art, input_hash, forventet jsonb, faktisk jsonb, score, model, at)
app_config       (<agent>_aktiv = false, <agent>_skriv_aktiv = false, agent_noedstop = false)
```

**Kørslens form (ens for alle):**
1. `pg_cron` → `kald_edge('<agent>-cron')` (Bucket B, `authenticateServiceRole` FØRST).
2. Læs `app_config.agent_noedstop` (globalt) og `<agent>_aktiv`. Falsk → skriv `agent_puls` og stop. **Tørkørsel er standard**; rigtig skrivning kræver `dry_run:false` OG låsen.
3. Læs `agent_budget` for i dag. Over loft → `over_budget`, stop.
4. Tag én række fra `agent_koe` med `FOR UPDATE SKIP LOCKED`, sæt `laast_til = now()+timeout`.
5. **FØR-læsning fra målsystemet** (det eneste, der må kaldes sandhed).
6. Deterministisk dom → evt. LLM-kald (struktureret output, skema-valideret, `agent_koersel` med tokens og pris) → deterministisk dom igen. **LLM'en skriver aldrig udad; dens output er et felt, koden dømmer.**
7. Niveau: N0/N1 → `agent_forslag`; N2/N3 → udfør med `agent_spor` FØR/sendt/EFTER og afvigelsesdom (`doemAfvigelse`-mønstret fra lag 3).
8. Skriv `agent_puls`. Svaret bærer `deploy_stamp` + et felt, kun den nye kode kan svare (CLAUDE.md-beviset).

**Nødstop, tre lag:** (1) signeret stop-link i hver mail fra en agent → `agent_noedstop = true` (SHA-256-aftryk af tokenet i basen, som `/aftale?token=`); (2) `app_config` direkte; (3) tilbagekald af nøglen hos tredjeparten. Genstart kræver Jonas i dashboardet, bevidst besværligt. Automatiske stop pr. agent står i den enkelte agents afsnit.

**Idempotens** er to ting og skal være begge: nøglen i `agent_koe.noegle` (vi gør det ikke to gange) OG FØR-læsningen (målsystemet har det ikke allerede). boardroom-2 havde kun den første.

### 1.3 Menneske i løkken — fire niveauer pr. handlingsart

| Niveau | Hvad sker | Hvem ser | Eksempel |
|---|---|---|---|
| **N0 tør** | Alt regnes og logges; intet skrives udad; forslaget står i `agent_forslag` som `toerkoersel` | Kun sporet | Enhver ny handlingsart de første 14 dage |
| **N1 godkend** | Forslag med FØR/EFTER + begrundelse → Jonas (eller stedfortræder) godkender pr. forslag; udløber efter 14 dage | Mail med 2–3 signerede svarknapper + flade | Ny annoncetekst, budgetflytning, ny konteringsregel, prisforslag |
| **N2 automatisk, gennemses** | Udføres straks; står i ugens gennemse-liste; kan rulles tilbage med ét klik (modpostering, pause ophæves, mail-flow slukkes) | Ugentlig liste + morgenrapport | Bogføring af ny dansk leverandør ≤ 3.000 kr.; pause af annonce med statistisk bund |
| **N3 automatisk** | Udføres; kun sporet og månedsrapporten | Kun afvigelser | Faste abonnementer (regel `auto`), Stripe-skabelonen, dagligt bevis |

**Kriterier for at rykke ET NIVEAU op (alle tre skal holde, målt i `agent_forslag`/`agent_eval`, ikke skønnet):**
1. **Træfsikkerhed:** ≥ 95 % af de seneste ≥ 30 forslag i arten er godkendt *uændret* (N1→N2), eller ≥ 98 % af de seneste ≥ 60 udførte er *ikke* rullet tilbage (N2→N3), over mindst 4 kalenderuger.
2. **Nul alvorlige fejl** i perioden (definition pr. agent: penge i forkert konto, mail til afmeldt, annonce uden `url_tags`, medlemsdata over broen).
3. **Reversibilitet dokumenteret:** der findes en testet tilbagerulning for arten (modpostering, `effective_status` tilbage, flow slukket). Uden tilbagerulning kan en art aldrig blive N2.

**Ned:** én alvorlig fejl → straks ét niveau ned + alarm; accept < 90 % over de seneste 20 → ét niveau ned. Forfremmelse skrives i `agent_handling` med grund og målingen; den er Jonas' klik, aldrig agentens.

**Aldrig over N1, uanset træfsikkerhed:** budgetforhøjelse samlet, ny kampagne, ny mail-serie til en ny målgruppe, prisændring, alt der sletter, alt der rører samtykke (afmelding er den ene undtagelse: den udføres altid, aldrig automatisk *tilmelding*). Regelsættets §3 gælder også for agenter.

### 1.4 Modelvalg og omkostning

| Opgave | Model | Hvorfor | Pris-orden (VURDERING) |
|---|---|---|---|
| Klassifikation, udtræk fra PDF/mail, normalisering, opsummering til spor | Haiku (Anthropic API) | billig, hurtig, struktureret output | 0,05–0,20 kr. pr. bilag |
| Tekstudkast (mail, annonce, community-opslag), analyse-kommentar, referat | Sonnet | kvalitet på dansk til pris | 0,3–1,5 kr. pr. udkast |
| Månedsrapportens CFO-kommentar, prisforslag, strategens kvartalsplan, bestyrelsespakken | Opus/Fable | få kald, høj indsats, dyre fejl | 3–15 kr. pr. kørsel |
| Medlemsagenten (`run-company-agent`) | uændret Lovable AI Gateway (`gemini-2.5-flash`) | i drift; skiftes kun efter eval | (Lovables pris) |
| Transskription (dansk) | måles: Røst vs. Whisper vs. leverandør-API (Deepgram ~0,26 $/time, AssemblyAI ~0,30 $/time — SLÅET OP: [gladia.io](https://www.gladia.io/blog/cutting-transcription-cost-per-audio-hour-for-meeting-assistants); dansk kvalitet UMÅLT dér) | dansk CER afgør, ikke prisen | < 5 kr. pr. time lyd |
| Billedgenerering (kun illustration) | Imagen/Flux/gpt-image, 0,02–0,21 $ pr. billede (SLÅET OP: [invideo.io](https://invideo.io/blog/ai-image-model-pricing/)) | se §3.5 | 0,2–1,5 kr. pr. billede |
| Videogenerering | 0,03–0,13 $ pr. sekund (SLÅET OP: [atlascloud.ai](https://www.atlascloud.ai/blog/cheapest-ai-video-generation-api-2026)) | **ikke i planen** (§3.6) | — |

Prislisten bor i `agentrum/modelpriser.ts` med dato; en kørsel uden prisopslag fældes af et kildeværn. **Dagslofter (forslag, Jonas' tal):** økonomi 50 kr./dag, marketing 150 kr./dag, øvrige 20 kr./dag; månedsloft på Anthropic-nøglen i consolen som ydre bremse. Med de tal er hele agentflåden < 6.000 kr./md. i modelkald — VURDERING, måles i `agent_budget` fra dag 1.

### 1.5 Hvor agenterne bor — og broen

| Agent | Hjem | Begrundelse |
|---|---|---|
| **Drift** | begge (én function pr. projekt, samme kode) | den skal se pulsen dér, hvor kørslerne er; Topix-delen kan læse platformens `agent_puls` over broen |
| **Økonomi** | `topix-agenter` | bank-, e-conomic- og Stripe-læsenøgler må ikke ligge ved siden af medlemsdata (29/9-designet §1.1); fuld CLI |
| **Marketing — hjerne og produktion** (strateg, analytiker, økonom, copywriter, fotograf, videograf, redaktør) | `topix-agenter` | tunge LLM/medie-kørsler, hurtig iteration, ingen medlemsrækker nødvendige — kun tal |
| **Marketing — hænder** (Klaviyo-motor, Meta-skrivevej, webinar-mail-cron, CAPI, GA) | platformen | de findes dér med låse og spor (lag 2/3, `meta-send-cron`); Metas skrivevej bygges dér, fordi læsning og CAPI allerede er dér |
| **Måned (bestyrelsespakke), Adfærd, Onboarding, Churn, Nyhed** | platformen | de læser medlemsrækker under RLS og skriver medlemsvendte ting (klokker, chat, community); `run-company-agent` er skabelonen |
| **Indberetning** | `topix-agenter` | selskabets moms/regnskab; ingen medlemsdata |

**Broen (`agent-bro`, én function i hvert projekt, Bucket B med egen secret `AGENT_BRO_NOEGLE` + HMAC over body + tidsstempel ≤ 5 min):**
- Platform → Topix: **kun aggregater** (MRR, antal fornyelser næste 30/60/90 dage, tragtens tal pr. annonce/kampagne over samme vindue, lag 6's dom som tekst+tal, fremmøde-andele, kø-størrelser, `agent_puls`). Svaret går gennem `findForbudteNoegler` + en hvidliste af felter; et «@», et navn, et CVR eller et uuid fra `companies` i svaret = afvist i drift (samme værn som `webinar-delt`).
- Topix → Platform: **kun godkendte handlinger** som `agent_forslag` med status `godkendt` (fx «opret annonce PAUSET med denne kreativ», «læg denne mail i kladde i Klaviyo-flow X»), som platformens motor udfører inden for SIN lås. Topix kan aldrig kalde Klaviyo/Meta direkte.
- Ingen deling af service-role-nøgler mellem projekterne. Nogensinde.

**Konsekvens for udrulning:** `topix-agenter` udrulles med `supabase functions deploy` og `db push` (CI). Platformens del følger CLAUDE.md (SQL editor → build-chat-deploy → bevis → Update). Marketingens hurtige iteration ligger derfor bevidst i Topix.

### 1.6 Evaluering — hvordan vi ved, at en agent er god

1. **Guldsæt pr. handlingsart** i `agent_eval` (input_hash → forventet). Økonomi: 3 måneders historik fra e-conomic (bogholderens kontering er facit). Marketing: de seks mails fra 19/9 (alle forkerte) og de godkendte fra 28/9 som modprøve — `udkastVaern` gør det allerede. Referat: tre optagelser med menneskeligt referat.
2. **Skyggekørsel** før N1: agenten kører N0 mod virkeligheden i ≥ 14 dage, og træfprocenten skrives i morgenrapporten.
3. **Løbende:** accept-rate pr. art (N1), tilbagerulnings-rate (N2), tid-til-afgørelse for Jonas, omkostning pr. udført handling, antal alarmer pr. uge, og **én forretningsmåling pr. agent** (økonomi: dage til månedslukning + kø < 10/md.; marketing: pris pr. tilmelding og fremmøde-andel med Wilson; churn: fornyelsesrate pr. kohorte når N ≥ 5).
4. **Modelskift kun mod guldsættet:** samme input, to modeller, score; aldrig «den nye er nok bedre».
5. **Regelsættets §4a** gælder hver agent-art: en art, der ikke kan vise, hvem der får det bedre og hvor ofte, bygges ikke.

---

## DEL B — Økonomiagenten: selskabets CFO

### 2.1 Grundlaget står — og tre ting rettes

29/9-designet (`bogholderi-agent-design.md`) er grundlaget: Enable Banking som bankkilde, OpenAPI Journals, dedikeret agent-kladde, markør `AGT-…` som idempotens, bilag med SHA-256, tillidsdom A/B/C, dagligt bevis bank = konto, modpostering, procedurebeskrivelse (bilag A), lån (bilag B). Det ændres ikke. Tre rettelser efter recon og Pleo-beslutningen:

1. **Idempotens mod målsystemet, ikke kun egen tabel** (boardroom-2 fejl 2): før hver kladdelinje søges `/booked-entries` og alle kladder på (dato ± 3 dage, beløb, modpartsnøgle) — ikke kun på markøren. Et match uden markør = «bogført af en anden» → `booked_elsewhere`, aldrig en ny postering. **Det er reglen, der havde reddet de 19 dubletter.**
2. **Flerlinjede posteringer fra dag 1** (`linjer jsonb[]`, boardroom-2 fejl 3): løn, erhvervelsesmoms-par og periodisering skal kunne udtrykkes, selv om løn er niveau C.
3. **Kortkøb som egen kilde** (§2.2).

### 2.2 Pleo → e-conomic Firmakort

**SLÅET OP** ([Ritzau, e-conomic pressemeddelelse](https://via.ritzau.dk/pressemeddelelse/14604552/e-conomic-lancerer-firmakort-koblet-direkte-til-regnskabet?publisherId=13559184&lang=da); [e-conomic support: Firmakort betalingsmetoder](https://www.e-conomic.dk/support/artikler/firmakort-betalingsmetoder)): e-conomic Firmakort er lanceret 1/10-2025, et Visa-debetkort (fysisk og virtuelt, Apple/Google Pay, Click to Pay) udstedt af **Mynt** (svensk, FI-godkendt, delvist Visa-ejet). Kortet er koblet direkte til regnskabet: «når medarbejderen betaler, beder e-conomic straks om et billede af kvitteringen». **Uden merpris i Smart og Advanced.** Aktivering kræver MitID.

**UMÅLT og skal måles i prøveregnskabet, før designet låses:** (a) om korttransaktioner kan læses gennem API'et (hvilket endepunkt, hvilke felter, hvilket kort-id); (b) om e-conomic selv bogfører kortkøbet (og på hvilken konto/kladde), eller kun lægger det klar; (c) hvordan et onlinekøb uden fysisk kvittering (Lovable, Anthropic, Meta) får sit bilag — Smart Inbox på `bilag@` er reserven; (d) om Firmakortets konto er en bankkonto i kontoplanen (som Pleos 5830) eller en mellemregning.

**Konsekvenser for designet:**
- **Pakke:** 29/9-designet sagde «Smart er ikke nødvendig». Det er vendt: **Smart (eller Advanced) er nødvendig for kortet**, og Smart Inbox kommer med. Prisen slås op på e-conomic.dk/priser (ikke målt i dag).
- **Tre kilder, tre beviser:** Nordea (Enable Banking) · Stripe (balance transactions) · **Firmakort (e-conomic)**. `bevis-dagligt` udvides: kortkontoens saldo i e-conomic = Σ kortposter − Σ optankninger fra Nordea. Går det ikke op, er en optankning eller et køb ubogført.
- **Match-arten `kort`:** et kortkøb, som e-conomic selv har lagt klar med kvittering, konteres af agenten (regel/LLM) men **oprettes ikke igen** — agenten arbejder på e-conomics egen række. Hvis API'et ikke tillader det (UMÅLT), er kortkøb «bogholder/e-conomic bogfører», og agenten kontrollerer kun (dublet, konto, moms) — præcis den rolle, den skulle have haft over for Pleo.
- **Udfasning af Pleo:** parallel én måned (oktober): begge kort aktive, agenten måler pr. leverandør, hvor bilaget faktisk kommer fra. Pleo opsiges, når alle faste leverandører (Lovable, Anthropic, Meta, Google, Klaviyo, Circle, Mailgun, Calendly, Bunny, eWebinar til opsigelse) er flyttet til Firmakortet, og Pleos konto 5830 er 0 og afstemt. Pleos e-conomic-integration slås fra FØR første Firmakort-køb bogføres, ellers to skrivere.
- **Mola Invest/relateret part, løn, skat:** uændret niveau C.

### 2.3 CFO-modulerne

Alt regnes af rene funktioner over egne tabeller + e-conomic `totals`/`booked-entries` + Stripe (læsenøgle) + aggregater fra platformen over broen. LLM skriver kun kommentaren.

| Modul | Data | Output | Niveau | Regnestykket (skrevet ud) |
|---|---|---|---|---|
| **Likviditet 13 uger** | `bank_saldo` i dag · faste træk fra `konteringsregel` (leverandør, beløb, dag i måneden, `n_ens ≥ 3`) · moms til betaling (§3.7 i designet) · løn/skat fra sidste 3 måneders posteringer · **indtægter fra platformen over broen**: fornyelser med `contract_end_date` i vinduet × historisk fornyelsesrate (Wilson-nedre grænse, ikke punkt), indgangsbetalinger med `faktura_sendt_at` og ubetalt, rater (`company_perioder`) · Stripe `balance` + payouts-rytme | Ugetabel: start, ind, ud, slut, laveste punkt, «måneders løbetid» = slutsaldo / gennemsnitligt netto-udtræk 3 mdr. | N3 (rapport) · alarm N/A | `uge_n_slut = uge_n_start + Σind_n − Σud_n`; ind fra fornyelser = `Σ beloeb × p_nedre` hvor `p_nedre` = Wilson-nedre 95 % af de seneste 12 mdr. fornyelser; ved N < 10 bruges 50 % og det står i rapporten som «gæt» |
| **MRR og fornyelser** | Stripe subscriptions/invoices (21) + e-conomic-fakturaer (7) ⇒ MRR pr. medlem = årsbeløb / 12; kohorter pr. `contract_start_date`-måned (over broen som tal, ikke navne) | MRR, netto-tilgang, fornyelsesrate pr. kohorte (kun N ≥ 5), «forventet MRR om 90 dage» | N3 | `MRR = Σ(aarsbeloeb_i / 12)` · `fornyelsesrate_k = fornyet_k / udloebet_k`, «for få» erstatter procenten under 5 |
| **Prisforslag** | tilmelding→ansøgning→medlem pr. kilde (lag 6), betalingsform-fordeling (4.167 fuld / 4.375 rater), afslag med grund `pris`, fornyelser | Højst ét forslag pr. kvartal med tre scenarier og følsomhed | **N1, aldrig højere** | «hvad hvis +10 %»: `MRR_ny = MRR × 1,10 × (1 − Δfrafald)`, Δfrafald er et skøn og står som interval, ikke tal; med 28 medlemmer er hele modulet en kvalificeret samtale, ikke en beregning — det står i forslaget |
| **Leverandørabonnementer** | `konteringsregel` med fast rytme · «brugssignal» pr. leverandør: Bunny (API-kald sidste 30 dage), eWebinar (sessioner efter opsigelse), Pleo (køb efter udfasning), Circle, Monday, Klaviyo (profiler/plan — kan ikke læses via API, MÅLT), Calendly (bookinger), Google Workspace (brugere) | Månedlig liste «betaler vi for noget, vi ikke bruger»: beløb/md., sidste brugssignal, forslag (opsig / nedgradér / behold) | N1 | «ubrugt» = betaling de sidste 60 dage ∧ intet brugssignal de sidste 60 dage; uden målbart signal står «UMÅLT», aldrig «ubrugt» |
| **Momsklargøring** | designets §3.7 | «Momsen er klar: X kr.» eller listen af mangler, 10 dage før fristen | N3 (afstemning) · indberetningen er et klik af Jonas (API ikke fundet) | uændret |
| **Månedsrapport** (3. hverdag) | designets §2.8 + modulerne ovenfor | Én mail til Jonas + Morten (valg) + PDF i Drive | N3 | sendes kun efter periodelås |
| **Revisorpakke** | designets §2.9 | knap i Topix-dashboard; zip med saldobalance, afstemninger, bilagsliste, regeltabel, kø-historik, lån | N1 (Jonas trykker) | — |
| **Lån/mellemregning** | designets §4.4 + §3.10 | rente pr. måned, alarm ved debet-mellemregning | rente N2 (regel efter Jonas' sats) · alarm straks | `rente_oere = hovedstol × sats × dage / 365` |
| **Alarmer** | alle moduler | rødt bevis · 3 fejlede `book` · fremmed linje i agent-kladde · postering i låst periode · kortkonto ≠ · laveste likviditetspunkt < 1 måneds udtræk · ejer-mellemregning i debet · faktura ubetalt > 30 dage · Enable Banking-samtykke < 14 dage | mail til `driftModtager()` + stop-link; automatiske stop som i designets §3.9 | — |

### 2.4 Faser i dage (parallelle agenter; dag 0 = adgange i §5.4 er på plads)

| Dage | Leverance | Bevis |
|---|---|---|
| **1–2** | `topix-agenter`-projekt + agentrum (§1.2) + driftsagent · e-conomic-klient (læs): kontoplan, momskoder, 24 mdr. `booked-entries` → regelsæt sået · Enable Banking restricted → Nordea 12 mdr. · Gmail-indtag `bilag@` · **prøveregnskab med Firmakort: mål (a)–(d) i §2.2** | `agent_puls` for fire cron-jobs; regelsæt-liste til Jonas; UMÅLT-listen i §2.2 lukket |
| **3–4** | Match + regelmotor + tillidsdom; **tørkørsel over 3 historiske måneder** mod bogholderen, træfprocent pr. leverandør · bogføringsklient mod prøveregnskab inkl. en 6-linjers lønpostering og en modpostering | ≥ 95 % identisk kontering (kriteriet fra designet §5) |
| **5–7** | **SKIVE 1 I DRIFT:** niveau A (regler med ≥ 3 ens forekomster — de faste abonnementer) bogføres i det rigtige regnskab; dagligt bevis; nødstop; kø-mail | 7 dage: ingen modpostering, bevis grønt |
| **8–14** | Stripe-skabelonen (salg/gebyr/udbetaling) · niveau B · Firmakort-kilden (efter målingen) · rykker for manglende bilag · likviditet 13 uger v1 · MRR v1 | første likviditetsrapport med tal, der stemmer med Stripe-dashboardet |
| **~14** | Opsigelseskriteriet for bogholderen (designets §5) måles; Pleo-udfasning startes | — |
| **15–25** | Moms, periodelås, ejer-værn, lån, revisorpakke, leverandørkontrol, prisforslag-skabelon (N1) · **oktober lukkes 4/11 af agent og bogholder parallelt** | forskelle linje for linje |
| **26–40** | Månedsrapport v2 med alle moduler · N2-forfremmelser efter §1.3 · Pleo opsagt | november lukket 3/12 uden bogholder |

**Første skive er den samme som i designet** — bank ind, bilag ind, match, autobogføring af faste abonnementer — plus driftsagenten. Den kører inden for 7 dage fra dag 0.

**Værn ud over designets §3:** dagsloft i `agent_budget`; LLM kaldes aldrig for en transaktion med en regel; en LLM-kontering går aldrig direkte til A; kortkøb bogføres aldrig af to skrivere (Pleo-integration FRA før Firmakort TIL); ingen skrivning i e-conomic uden FØR-læsning af hele agent-kladden og `/booked-entries`.

---

## DEL C — Marketingagenten: otte roller, ét system

### 3.1 Princippet

Marketingmotoren har seks lag (`docs/marketingmotoren.md`), og lag 4 (agenten) er «IKKE BYGGET, ikke skitseret». Dette er skitsen. **Lag 4 er ikke én agent; det er otte roller med hver sin handlingsart og hvert sit niveau**, koblet gennem `agent_forslag` og med **redaktøren som port foran alt, der kan ses af et menneske uden for huset**. Ingen rolle kalder Klaviyo eller Meta selv; de leverer forslag, som platformens hænder udfører inden for lås (§1.5).

```
STRATEG ──▶ kalender/mål/budget (N1) ─┐
ANALYTIKER ─▶ tragt + dom (lag 6) ────┼─▶ ØKONOM ──▶ budgetflytning inden for lofter (N1→N2)
                                       │
COPYWRITER ─▶ udkast (grundlag+værn) ──┤
FOTOGRAF ───▶ billede fra bibliotek/illustration ─┼─▶ REDAKTØR ──▶ DISTRIBUTØR ──▶ platformens hænder (lås)
VIDEOGRAF ──▶ klip + undertekster ────┘      (brand · lov · fakta)      (Meta · Klaviyo · LinkedIn · community)
```

### 3.2 Rollerne

| Rolle | Formål | Data den bygger på | Output | Niveau (start → 12 uger) |
|---|---|---|---|---|
| **Strateg** | kvartalsmål, budgetramme, kalender (webinardatoer, kampagnevinduer, frys-vinduer 48 t før/24 t efter webinar), én hypotese pr. runde | webinar-sessioner, lag 6's dom, økonomiens MRR/likviditet over broen, `annoncegraenser`, Jonas' mål i `app_config`/Drive | kvartalsplan + ugeplan som `agent_forslag` (art `plan`) | N1 → N1 (aldrig højere; boardroom-2 fejl 9: en plan uden svar stopper agenten) |
| **Analytiker** | tragten annonce → tilmelding → fremmøde ≥ 75 % → ansøgning → kvalificeret → medlem, pr. annonce/adsæt/kampagne/kanal over SAMME vindue; attribution første-parts (utm_content → e-mail → ansøgning → betaling); Wilson-dom | `meta_annonce_dag` (+ `actions`, adsæt-budgetter — mangler, fase 0 i Meta-planen), `webinar_tilmeldinger`, `ansoegninger`, `company_perioder`, lag 5 retur-data fra Klaviyo (SKITSERET, ikke bygget) | daglig rapport, klassifikation `for_tidligt · i_orden · svag · udmattet`, alarmer (url_tags mangler, forbrug uden tilmeldinger, frekvens, sporing brudt) | N3 fra dag 1 (den skriver ikke udad) |
| **Økonom** | CAC pr. led, LTV (= årsbeløb × forventet fornyelser, Wilson-nedre), budgetflytning mellem adsæt inden for kampagnens total, «stop-loss» pr. annonce | analytikerens tal, økonomiagentens MRR/fornyelsesrate, `annoncegraenser` | forslag «flyt X kr. fra adsæt A til B» (≤ 20 % pr. skridt, ≥ 3 dage, < 4 ændringer/time — Meta-planen §3.3) | N1 (uge 6–10) → N2 (efter to webinarer uden fejl) · budgetforhøjelse aldrig > N1 |
| **Copywriter** | mails (flows, kampagner, «Morten skriver»), annoncetekster (3 varianter pr. hypotese), landingssider (topix.dk-tekst som PR-forslag), community-opslag | `grundlag.ts` (lag 1) + `udkastVaern.ts` R-regler + `KENDTE_TAL`/`FORBUD` + de godkendte tekster som stil-eksempler + lag 6's «hvad virkede» | udkast med spor: hvilke fakta fra grundlaget hver sætning bygger på | N1 → N1 (tekst, der går ud af huset, godkendes altid; N2 kun for *varianter* af en godkendt tekst, hvor kun ét felt er ændret) |
| **Fotograf** | vælge/beskære billede fra **biblioteket** (rigtige fotos af Morten, Jonas, kontoret, webinar-stills), foreslå illustration; brandregler (farver, typografi, ingen stock-følelse) | `medie`-tabel (§3.5), brandregler i `grundlag.ts` (udvides: `VISUEL`), Metas politik (ingen før/efter, ingen falske personer) | 1–3 billedforslag pr. annonce i 1:1/4:5/9:16 med tekstoverlay som separat lag | N1 → N2 for beskæring/format af godkendt foto; AI-illustration N1 altid |
| **Videograf** | klip fra webinaroptagelse og «Iværksætterlivet» (30–90 s), undertekster på dansk, formater 9:16/1:1/16:9, hook-tekst de første 3 s | Bunny (video-info, heatmap fra webinarmotoren når den kører), transskription, faldkurven («hvor de går» — spec'en B5) | klipforslag: tidskoder + transskript + undertekst-fil + rendering | N1 (uge 6–12) — undertekster kræver menneske pga. dansk CER |
| **Distributør** | lægge godkendt indhold det rigtige sted: Meta (annonce PAUSET, `url_tags` sat), Klaviyo (kladde-flow/-kampagne via `klaviyo-motor`), LinkedIn (kladde — API-adgang UMÅLT), community (opslag som rådgiver) | `agent_forslag` med `godkendt`, platformens hænder over broen | udført med `agent_spor` FØR/sendt/EFTER og verifikation (`effective_status`, flow-status) | N2 for «opret PAUSET/kladde» · N3 aldrig for «aktivér» |
| **Redaktør** | brand (stemme, `FORBUD`), lovlighed, fakta | deterministisk: `kontrollerUdkast` + politikfilter + `KENDTE_TAL` · ét menneske (Jonas eller Morten) | `godkendt / afvist med sætning` — én afvisning peger på den sætning | dommen N3 (den skriver ikke), godkendelsen menneskelig |

### 3.3 Redaktørens tre porte (alle deterministiske, testede, før mennesket)

1. **Brand:** `udkastVaern` R1–R5 (grundlag, `MANGLER`, forbudte ord, kendte links — optagelsen er ude), tone-tjek mod de godkendte eksempler, længde pr. kanal, prisen altid med begge tal (4.167/4.375).
2. **Lov:**
   - **Markedsføringsloven § 10** (SLÅET OP: [Forbrugerombudsmandens vejledning om spamforbuddet](https://forbrugerombudsmanden.dk/media/bjajzdv1/vejledning-om-spamforbuddet-2021-a.pdf)): markedsføring pr. e-mail kræver forudgående, aktivt, informeret, specifikt samtykke; gælder også B2B («nogen»); afmelding let og gratis i samme kanal; servicebeskeder uden produktreklame kræver ikke samtykke. **Konsekvens:** en mail er «markedsføring» eller «service», aldrig begge; distributøren nægter en markedsføringsmail til et segment uden `SUBSCRIBED`-krav (de 2.064 `NEVER_SUBSCRIBED` er et åbent punkt, klaviyo-gennemgangen §3 — agenten løser det ikke, den nægter at sende forbi det). Platformens før-webinar-mails er service og må ikke få produktreklame ind (værnet fælder «ansøg nu» i en `syv_dage`).
   - **§ 3 vildledning:** ingen nedtælling uden en sand frist (`ctaVindue`-princippet fra webinarspec'en), ingen «X ser med» uden tal, ingen udtalelse uden en person, der har sagt den (`TESTIMONIALS`-reglen).
   - **Metas annoncepolitik:** finansielle løfter, personlige attributter, før/efter — filtreret som ord-/mønsterliste, opdateret pr. version.
   - **EU AI Act art. 50** (SLÅET OP: [Cooley](https://www.cooley.com/news/insight/2026/2026-08-03-eu-ai-act-transparency-obligations-take-effect-2-august-2026), [Mishcon](https://www.mishcon.com/news/ai-act-transparency-obligations-code-of-practice-and-draft-guidelines)): i kraft **2/8-2026**; deep fakes (realistiske personer/steder/hændelser) skal oplyses af os som deployer; udbydere skal give maskinlæsbar markering af syntetisk lyd/billede/video/tekst (frist 2/12-2026 for eksisterende systemer); tekst til offentligheden er undtaget, når et menneske har redaktionelt ansvar; Kommissionens retningslinjer 20/7-2026, frivillig Code of Practice. **Meta mærker desuden selv** annoncer skabt/redigeret med AI, egne værktøjer eller tredjeparts via C2PA-detektion (SLÅET OP: [Social Media Today, 7/7-2026](https://socialmediatoday.com/news/meta-adds-updated-disclosure-tags-for-ai-generated-ads/824658)). **Konsekvens:** ingen syntetiske mennesker; AI-illustration mærkes i vores `medie`-tabel (`ai_genereret`, model, prompt-hash) og i annoncens egen note; tekst går altid gennem et menneske (redaktøren), så undtagelsen for redaktionelt ansvar holder.
   - **Privatlivsløftet på topix.dk** («Selve din tilmelding deler vi ikke med Meta», `docs/tracking.md:187`): ingen kundelister/lookalikes; distributøren har ingen kode-sti til Custom Audiences.
3. **Fakta:** hvert tal i et udkast skal findes i `KENDTE_TAL` eller i analytikerens dom med vindue; et tal uden kilde = afvist. «Ingen opfundne tal» er en test, ikke en instruks.

### 3.4 Hvordan lagene samarbejder — en runde

1. Strategen har én hypotese («vinklen 'de fem spørgsmål' mod 'tid'») og et frys-vindue. N1: Jonas siger ja.
2. Copywriter skriver 3 tekster; fotograf foreslår 2 fotos fra biblioteket pr. tekst; videograf evt. 1 klip. Alt gennem redaktørens tre porte; det, der overlever, samles i ét godkendelseskort (N1) med FØR (nuværende annoncer), forslag, forventet forbrug og hvad der måles.
3. Distributøren opretter det godkendte i Meta som **PAUSET** med kanoniske `url_tags`; Jonas trykker aktiver i Ads Manager (N2 for oprettelse, aktivering menneskelig).
4. Analytikeren måler over samme vindue; lag 6 dømmer; økonomen foreslår flytning (N1 → N2); «for få» erstatter procenten.
5. Mindet (lag 6, `erProevetFoer`) sikrer, at strategen ikke stiller samme hypotese igen.
6. **Én ændring pr. runde.** Ventetiden er aritmetik (tre webinarer siden sidste ændring). En agent, der vil ændre to ting, får nej af `maaForeslaas`.

### 3.5 Fotografen: bibliotek først, generering sidst

- **Biblioteket (`medie`-tabel + privat Bunny/Storage):** ét fotoshoot af Morten og Jonas (kontor, webinar, tavle, portræt — 60–100 billeder i tre formater), webinar-stills, kontorets rum, produktskærmbilleder. Felter: `kilde ∈ {foto, still, screenshot, ai_illustration}`, `personer[]`, `samtykke_ref`, `ai_genereret`, `model`, `prompt_hash`, `brugt_i[]`. **Uden et rigtigt shoot er fotografen en beskæringsmaskine** — shootet er Jonas' første beslutning i §5.4.
- **AI-illustration** (abstrakt, diagrammer, «tal på en tavle», ikke mennesker): pris 0,02–0,21 $ pr. billede (SLÅET OP: [invideo.io, aug. 2026](https://invideo.io/blog/ai-image-model-pricing/) — Imagen 4 0,02–0,06 $, Flux 2 0,03–0,07 $/MP, gpt-image ~0,005–0,21 $). **Rettigheder:** udbydernes vilkår om kommerciel brug og C2PA/SynthID-mærkning er UMÅLT i dag og læses pr. udbyder før første brug; ingen udbyder vælges uden skriftlig ret til kommerciel brug og uden maskinlæsbar markering (art. 50).
- **Brandregler i kode** (`grundlag.ts` udvides med `VISUEL`): palet, typografi, «ingen stock-følelse», altid rigtige mennesker når der er mennesker, tekstoverlay som separat lag (Meta-tekst-i-billede måles ikke længere, men læsbarheden gør).

### 3.6 Videografen: klip, ikke generering

- **Kilder:** webinaroptagelsen (Bunny, `varighed_sek` fra `video-info`, heatmap når webinarmotoren kører), «Iværksætterlivet» (sæson 1 interviews, sæson 2 lytterspørgsmål), live sessions (Meet — kun med deltagernes information, spor 5 i visionen).
- **Pipeline:** transskription (dansk — mål Røst mod Whisper mod to leverandør-API'er på tre rigtige optagelser FØR valg; CER-tallene fra visionen gør menneskelig korrektur nødvendig) → LLM finder 5–10 kandidat-klip (hook, pointe, afslutning, 30–90 s) → rendering (ffmpeg i en container uden for edge functions: 9:16/1:1/16:9, undertekster, hook-tekst, logo) → redaktør → N1.
- **Formater og kanaler:** Meta Reels/Stories 9:16, feed 1:1/4:5, LinkedIn 16:9/1:1, community 16:9.
- **Ikke i planen:** genereret video (Veo/Kling/Sora, 0,03–0,13 $/s SLÅET OP). Grunden er ikke prisen; det er, at huset sælger to rigtige rådgivere, og en syntetisk Morten er både art. 50-deepfake og brandbrud. B-roll uden mennesker kan overvejes efter 12 uger, mærket.
- **Meta-upload** (SLÅET OP for `asset_feed_spec`: [Meta Marketing API — Asset Feed Spec](https://developers.facebook.com/docs/marketing-api/ad-creative/asset-feed-spec/)): billeder uploades til annoncekontoen og refereres med `image_hash`, videoer med `video_id`; dynamic creative bruger `asset_feed_spec` med flere billeder/videoer/tekster/titler og `AUTOMATIC_FORMAT` ved blandet format, og formatet kan ikke ændres bagefter. Endepunkterne `adimages`/`advideos` (chunked upload) og `object_story_spec` er KENDT, men Metas referenceside blev ikke læst i dag — måles i v26.0 før bygning. Advantage+-felter (creative enhancements) er UMÅLT for vores konto.

### 3.7 Ærligt: hvad der kræver menneskelig kreativitet — og hvad der realistisk kører hvornår

**Menneskeligt i hele perioden:** vinklen og løftet (hvad får en dansk SMV-ejer til at tilmelde sig — det er Morten og Jonas' viden fra afklaringssamtalerne), rækkefølgen af budskaber, hvornår et eksperiment droppes, kontakten til Meta-support, fotoshoot og optagelser, «godkend» på alt, der forlader huset. Med 0,56 ansøger pr. annonce pr. webinar lærer ingen maskine vinklen af tallene; den lærer kun, hvilken af to menneskelige vinkler der giver flere tilmeldinger.

| Om | Kører automatisk (N2/N3) | Kører med godkendelse (N1) | Kører ikke endnu |
|---|---|---|---|
| **2 uger** | analytikerens daglige rapport + alarmer (kræver Meta fase 0: `actions`, adsæt-budgetter, historik); redaktørens tre porte som test | copywriter: 3 annoncetekster + 1 mail pr. hypotese; distributør: kladde i Klaviyo via `klaviyo-motor` | Meta-skrivevej (token findes ikke), fotograf (intet bibliotek), videograf, økonom |
| **6 uger** | analytiker + lag 5 retur-data; distributør: annonce PAUSET i Meta med `url_tags`; fotograf: beskæring/format af godkendt foto | strateg (kvartalsplan), økonom (budgetflytning), fotograf (valg), videograf (første klip fra 13/10-webinaret med korrigerede undertekster) | pause af annoncer automatisk (kræver to webinarer med data — 13/10 og næste) |
| **12 uger** | økonom: pause og budgetflytning inden for lofter (hvis to webinarer uden fejl); distributør N2 for alt «opret som kladde/pauset»; videograf: rendering + undertekster N2 hvis korrektur-rate < 5 % | strateg, copywriter (alt nyt), fotograf (AI-illustration), alt der aktiverer | budgetforhøjelse, nye kampagner, audiences, LinkedIn-skrivning (API UMÅLT), genereret video |

**Konsulenten (Nicklas/Sentury):** motoren overtager det operative (rapport, hygiejne, pauser, flytning); opsigelse efter fase 2 har kørt to webinarer uden en forkert beslutning (Meta-planen §4). Det er stadig mit kriterium.

---

## DEL D — De øvrige godkendte agenter

Alle på platformen (undtagen indberetning og driftens Topix-del), alle i agentrummets form, alle med `run-company-agent`-skabelonen (tørkørsel, `SKRIVE_TOOLS`, `agent_proposals`, `maaKoereLive`). **§4a gælder: hver bygges først, når målingen viser hvem der får det bedre.**

### 4.1 Driftsagenten — bygges FØRST
- **Formål:** opdage, at en anden agent, et cron-job eller en integration er holdt op — og at den kører, men forkert.
- **Data:** `agent_puls` (begge projekter over broen), `cron.job_run_details`, `net._http_response`, `agent_budget`, `webinar_mails`/`klaviyo_haendelser`/`meta_haendelser`-fejlrater, Mailgun-events, Stripe-webhook-alder, Enable Banking-samtykkets udløb, secrets' alder (60-dages Meta-token), `agent_forslag` ældre end 5 hverdage, `agent_koersel` i `koerer` over timeout.
- **Output:** ét driftskort (Jonas' morgenside i visionen §3) + alarm via `klokke-mail`-mønstret (én pr. dansk time pr. art) + stop-link. Den skriver aldrig andet end `agent_puls`-status og `timeout` på hængende kørsler.
- **Niveau:** N3 fra dag 1 (den handler ikke, den råber).
- **Første skive (dag 1–2):** «forventet kørsel manglede» + «kø ældre end 5 hverdage» + «budget over loft» — de tre ting, der havde fanget boardroom-2 24/6, 12/5 og fra dag 1.

### 4.2 Nyhedsagenten
- **Formål:** community-opslag om nyt i regler og teknologi for SMV'er (moms, bogføringslov, AI Act, skat, tilskud), skrevet i husets stemme, med kilde.
- **Data:** kuraterede kilder (Erhvervsstyrelsen, SKAT, Folketinget, EU, udvalgte medier) hentet ugentligt; `grundlag.ts`; medlemmernes brancher (aggregeret) til relevansdom.
- **Output:** 1–2 udkast/uge som `agent_forslag` → redaktør → rådgiver godkender → opslag med rådgiverens navn (aldrig «AI skrev»; art. 50-undtagelsen for redaktionelt ansvar).
- **Niveau:** N1 permanent (det er rådgiverens stemme). **Første skive:** ét udkast om ugen fra tre kilder, i 4 uger; måling: læsninger (`community_visninger`) og svar pr. opslag mod husets egne opslag.

### 4.3 Adfærdsagenten
- **Formål:** se, hvad medlemmet gør og ikke gør (login-dage, rapporter, skridt, chat, events, Akademi) og foreslå ÉN handling til medlemmet eller rådgiveren.
- **Data:** tabellerne i `gamification-analyse.md` §1.1 (alle findes; `user_login_log` kun som distinkte dage; `forside_sidst_set` har ingen historik, og **RETTET 30/9 aften (målt): den har kun 3 rækker, alle rådgiveres — den er ikke et medlemssignal og må ikke bruges som grundlag her** — en `adfaerd_dag`-snapshot pr. virksomhed pr. dag skal bygges først, ren SQL-cron).
- **Output:** rådgiver-klokke («X har ikke logget ind i 21 dage, og september mangler») og fokuskort-forslag (mulighed 7 i medlemsrejsen).
- **Niveau:** N2 for rådgiver-klokker (samme som stille-klokkerne), N1 for alt medlemsvendt. **Første skive:** snapshot-tabellen + én dom («tavs i 21 dage») som klokke; måling: hvor mange klokker fører til en rådgiverhandling inden 5 dage.
- **DOM 30/9 aften (værdivurdering): LÆG FREM — IKKE BYGGET.** Målt: 26 kundevirksomheder og 28 medlemsbrugere. `user_login_log` har 5.068 rækker, men højst 0–4 virksomheder er «regelmæssige» (≥ 6 af 8 uger) i nogen uge — 2 i september. Reglen «regelmæssig → tre uger væk» ville give **5 fund på 26 uger**. Rapportering: 102 målte måneder i 2026, median godkendelse **93 dage** efter periodens udløb, **7 %** godkendt inden d. 10, **0 af 15** virksomheder med rettidig normal. Stille-klokkerne har sendt 22 klokker på 10 dage. **Genvurderes,** når e-conomic/Dinero-trækket kører, eller når ≥ 10 virksomheder har en ugentlig login-normal — den, der indtræffer først.


### 4.4 Månedsagenten — bestyrelsespakken
- **Formål:** visionens §3: en færdig pakke pr. medlem pr. måned, redigeret af rådgiveren på 10 minutter.
- **Data:** `financial_report_facts` (godkendte tal), BvA, `kpi_targets`, `company_actions`, `milestones`, `kpi_chart_comments`, sessionsnoter (ingen flade i dag), refleksioner, Akademi-fremdrift, community-deltagelse.
- **Output:** PDF/side «Din måned» med tallene, afvigelser, «det sagde vi», «det skal ske», én introduktion (spor 7, når piloten har vist, at medlemmer vil tale sammen). Udvider `run-company-agent`, erstatter den ikke.
- **Niveau:** N1 (rådgiveren godkender pakken) → N2 for tal-delen efter 3 måneder uden rettelser. **Første skive:** 3 pilotmedlemmer, tal + afvigelser + kommentar (det, `generate-financial-commentary` allerede laver, samlet på én scene — medlemsrejsens mulighed 1). Måling: læsning og «gjort»-skridt inden 30 dage.
- **Forudsætning:** tallene kommer ind (medlemsrejsens mulighed 2 — e-conomic/Dinero-træk; 14 af 33 har aldrig haft en målt måned). En pakke uden tal er en tom side.

### 4.5 Indberetningsagenten
- **Formål:** frister og grundlag for selskabets egne indberetninger: moms (økonomiagentens `moms-klar`), lønindberetning/eIndkomst (fra lønsystemet — UMÅLT hvilket), årsrapport (revisorpakken), evt. Erhvervsstyrelsens reelle ejere/ændringer.
- **Data:** e-conomic `periods`, SKATs frister (kalender i kode, ikke hentet), lønsystemets eksport, revisorens frister.
- **Output:** kalender + «klar/ikke klar»-mail 10 dage før + grundlaget som fil. Indberetningen selv er et klik af Jonas (ingen indberetnings-API fundet, designets §3.7).
- **Niveau:** N3 for kalender og klargøring, aldrig for selve indberetningen. **Første skive:** momsfristerne + klargøringen (findes i økonomiagenten) + én fristliste til Jonas.

### 4.6 Onboardingagenten
- **Formål:** de første 30 dage: tjeklisten (findes), rytmemails dag 0/10/14–20 (findes), «Dag 1»-hilsen (findes). Agentens tilføjelse: at se, hvor et nyt medlem går i stå, og foreslå rådgiveren den ene handling.
- **Data:** `onboardingTjekliste`, `profiles.onboarded_at`, `onboardingRytme`, chat, første rapport.
- **Output:** rådgiver-klokke ved stilstand (> 5 hverdage på samme trin), forslag til besked (udkast i chatten, rådgiveren sender).
- **Niveau:** N2 klokke, N1 besked. **Første skive:** stilstands-dommen + klokken. Måling: dage fra betaling til første godkendte måned, før og efter.

### 4.7 Churn-agenten
- **Formål:** forudse og handle på frafald før fornyelsen.
- **Data:** adfærdsagentens snapshot, `contract_end_date`, rapporteringsrytme, chat-tavshed, events, årsbrevet (medlemsrejsens mulighed 5).
- **Output:** 90/60/30 dage før udløb: risikodom (tre niveauer, dømt af regler — med 28 medlemmer er en model et gæt), forslag til rådgiver (samtale, årsbrev, tilbud), og til økonomiagenten: forventet fornyelse som interval.
- **Niveau:** N1 for alt medlemsvendt, N3 for dommen til rådgiver-forsiden. **Første skive:** «udløber om 90 dage og har < 3 målte måneder de sidste 6» som kort på rådgiverforsiden. Måling: fornyelsesrate pr. risikoniveau, når N ≥ 5.

---

## DEL E — Køreplan, afhængigheder, beslutninger

### 5.1 Rækkefølge

| Uge | Spor A (Topix-projekt) | Spor B (platform) | Afhænger af |
|---|---|---|---|
| **40** (nu) | `topix-agenter` + agentrum + driftsagent + økonomi dag 1–4 (læs, så, tørkør) + prøveregnskab med Firmakort | Meta fase 0 (`actions`, adsæt, historik, `META_ADS_TOKEN`) · Sunset rettet før 14/10 (Jonas' ja) · lag 5 retur-data | adgange §5.4 pkt. 1–4, 6 |
| **41** | økonomi skive 1 i drift (dag 5–7) · analytiker N3 · redaktørens porte som test | webinar 13/10 · `annoncemotor_forslag`-tabel + Meta-skrivevej (læs+PAUSET-oprettelse, lås) | Meta fase 0 færdig |
| **42–43** | økonomi dag 8–14 (Stripe, niveau B, Firmakort-kilde, likviditet v1, MRR v1) · copywriter N1 · distributør → Klaviyo-kladde · bogholder-opsigelseskriterium målt | adfærd-snapshot (SQL) · svartidskort (findes, #1164) · e-conomic/Dinero-træk for medlemmer (mulighed 2) startes | broen (aggregater) |
| **44–45** | oktober lukkes parallelt (4/11) · moms, periodelås, lån, revisorpakke · strateg N1 · fotoshoot → bibliotek · transskriptionsmåling (3 optagelser) | onboarding- og churn-domme som rådgiverkort · nyhedsagent 4-ugers prøve | Jonas' godkendelser |
| **46–49** | leverandørkontrol, prisforslag-skabelon · fotograf N1, videograf N1 (klip fra 13/10) · økonom N1 · Pleo opsagt | månedsagent: 3 pilotmedlemmer · webinarmotorens første skyggesession (spec'en) | 2 webinarer med data |
| **50–52** | november lukket 3/12 uden bogholder · N2-forfremmelser på målt træfsikkerhed · marketingens 12-ugers-tilstand (§3.7) | churn 90/60/30 · adfærd N2 klokker | målinger i §1.6 |
| **Q1 2027** | N3 hvor kriterierne holder · konsulent opsagt (hvis fase 2 holdt) · LinkedIn og audiences besluttes (ikke bygges) på tal | bestyrelsespakken til alle med tal · webinarmotoren i drift | — |

**Kritisk vej:** adgange → agentrum + driftsagent → økonomi skive 1 → (parallelt) Meta fase 0 → analytiker → copywriter/redaktør → distributør. Marketingens fotograf/videograf er uafhængige af økonomi, men afhængige af shoot og transskriptionsmåling.

### 5.2 Omfang (bygget af parallelle agenter — VURDERING, ikke måling)

Agentrum + driftsagent 4–5 agentdage · økonomi til dag 25 ≈ 20–25 · marketing lag 4 (8 roller) til 12-ugers-tilstanden ≈ 30–35 · platformens fem agenter (første skiver) ≈ 15–20 · broen 2–3. **I alt ca. 70–90 agentdage; med 3–4 agenter parallelt 5–7 ugers kalendertid til «alt i første skive»**, plus de målinger, der ikke kan skyndes på (to webinarer, en måneds parallel bogføring, 14 dages skygge før N1). Jeg overestimerer ikke bevidst; jeg siger, at *tiden* er sat af beviserne, ikke af koden.

### 5.3 Risici (rangeret)

1. **Udrulningsrunder i Lovable** (manuelt, én ad gangen) — platformens spor B er langsommere end spor A uanset agentkraft. Afbødning: alt, der kan bo i Topix, bor der.
2. **Jonas som eneste godkender** — N1-køen sover, som boardroom-2's gjorde. Afbødning: stedfortræder (Morten) pr. agent + rykkertrappe + «agenten holder op med at foreslå efter 2 ubesvarede runder».
3. **e-conomic Firmakort i API'et er UMÅLT** — kan ende som «kontrol, ikke bogføring» for kortkøb. Afbødning: måling i prøveregnskab dag 1–2 før noget låses.
4. **Tynd statistik** — marketingagenten vil se ud til at gøre lidt. Det er rigtigt, og det er dommen, der gør det. Afbødning: optimér på tilmelding/fremmøde, kalibrér på medlem, sig «for få» højt.
5. **Dansk transskription** — undertekster kan blive pinlige. Afbødning: N1 + måling før valg.
6. **Art. 50 og Metas mærkning** — en «AI info»-mærket annonce for et rådgivningshus kan koste tillid. Afbødning: rigtige fotos, AI kun til illustration, mærket.
7. **Broen bliver til en genvej** — nogen sender en medlemsrække «bare denne gang». Afbødning: `findForbudteNoegler` + hvidliste i drift + kildeværn + ingen delte nøgler.
8. **Modelomkostning uden loft** — afbødning: `agent_budget` + consolens månedsloft; driftsagenten alarmerer ved 80 %.

### 5.4 Det, Jonas skal give (ingen nøgler i chat; ind i secrets)

**Adgange:**
1. `topix-agenter` Supabase-projekt i egen organisation (EU, Pro) + CLI-token (designets §6.1).
2. e-conomic: pakke **Smart** (kortet kræver det — vendt fra 29/9), udvikleraftale, app «Topix-agenter» med rollen Bookkeeping, prøveregnskab, grant til det rigtige regnskab (§6.2). **Plus: bestil Firmakortet** (MitID) og slå Pleos e-conomic-integration fra, når Firmakortets første køb skal bogføres.
3. Nordea via Enable Banking (restricted mode → kontrakt) (§6.3). Kalender: samtykke udløber efter 180 dage.
4. `bilag@topix.dk` + Gmail API (§6.4); billing-mail hos alle leverandører dertil.
5. Stripe restricted key, kun læs (§6.5).
6. Anthropic API-nøgle med **månedligt forbrugsloft** i consolen (§6.6).
7. Meta: system user + `META_ADS_TOKEN` (`ads_read`, 60 dage) nu; `META_ADS_WRITE_TOKEN` (`ads_management`) først i uge 41; `spend_cap` på kontoen; skærmbillede af app-adgangsniveau (Meta-planen §5).
8. Bunny: eget bibliotek «Marketing» til medie-biblioteket + rendering-output (som webinarspec'ens «Webinar»).
9. Drive-mappe til rapporter/revisorpakke (Workspace-konto til agenten, ikke Jonas' egen).

**Beslutninger:**
1. **Hvem godkender, når du er væk** (stedfortræder pr. agent; Morten?).
2. Startlofter: økonomi 25.000/3.000/100.000 kr. (designet), modelbudget pr. agent (§1.4), annoncelofter (Meta-planen §3.4).
3. Hvilke selskaber økonomiagenten fører (Topix.dk ApS alene først?).
4. Bogholderens opsigelsesvarsel (tjek kontrakten i dag) og revisorsamtalen (designets §6.8).
5. Pleo-udfasning i oktober parallelt — ja/nej, og hvem flytter kortet hos leverandørerne.
6. **Fotoshoot** af Morten og Jonas (uden det er fotografen tom).
7. Optagelser: må «Iværksætterlivet» og webinaret klippes til annoncer (rettigheder hos Morten/gæster)?
8. AI-illustration ja/nej — og linjen «aldrig syntetiske mennesker» bekræftet.
9. De 2.064 uden samtykke (klaviyo-gennemgangen §0 pkt. 2) — agenten nægter at sende forbi det, så beslutningen kan ikke udskydes.
10. Månedsagentens 3 pilotmedlemmer og hvilke tal-kilder (e-conomic/Dinero-træk) de har.
11. Rangeringer i gamification (visionen §5 pkt. 1) — adfærds- og churn-agenten skal vide, om «anonymt mod huset» er tilladt.

---

## Bilag — det, der er UMÅLT i dag (samlet)

- e-conomic Firmakort i API'et: endepunkt, felter, kontering, bilagsflow; Smart-pakkens pris i dag.
- Metas `adimages`/`advideos`/`object_story_spec` i v26.0 og Advantage+-kreativfelter for vores konto; v21.0's udløb (CAPI).
- Billed-udbydernes kommercielle vilkår og C2PA/SynthID; LinkedIn Marketing API-adgang.
- Dansk transskriptionskvalitet pr. leverandør på vores optagelser.
- Lønsystem og lønindberetningens kilde.
- Klaviyos plan/pris (kan ikke læses via API).
- Hvor mange medlemmer bruger e-conomic/Dinero (`sourceFingerprint`).
- Alle prod-tal citeret her er fra dokumenterne (datoer 19/9–29/9), ikke målt i dag.
