# Agenten som rådgivernes rådgiver

**Besluttet**: 2026-08-25
**Status**: Form besluttet. Implementering ikke påbegyndt.
**Grundlag**: `docs/agent-forslag-recon.md`, `docs/indhold-recon.md`, `docs/chat-recon-2.md`.

---

## 1. Beslutningen

Agenten skriver ikke længere til medlemmer. Den **foreslår til rådgiveren**, som godkender, redigerer eller forkaster.

Jonas' formulering 2026-08-25: *"Det er bedre vi er de menneskelige filtre til en start. Og så kan vi slippe agenten løs, når den er blevet klogere. Den skal hele tiden udvikle sig i takt med vi godkender dens inputs, redigerer dens svar osv."*

Målet på sigt er en agent der kan rådgive selvstændigt, og som kender forskel på brancher — rådgivning til e-handel er ikke rådgivning til produktion.

---

## 2. Hvad recon'en fandt

### 2.1 Agenten skriver allerede til medlemmer fra rådgiverfladen

"Kør agent"-knappen (`MemberDetail.tsx:1655-1700`) kører den rigtige skrivevej. `POOL_BLOCKLIST` for `report_committed` blokerer `write_chat_message` og `notify_advisor` — men **ikke** `update_weekly_focus`, `write_company_action`, `create_milestone` eller `update_milestone_progress`.

En rådgiver der trykker "Kør agent" for at se hvad den siger, kan altså lægge et opgaveforslag på medlemmets forside og oprette aktive milepæle. Der findes ingen `dry_run`-parameter (`rca:923-924`).

### 2.2 Ræsonnementet gemmes aldrig

Hele `messages`-arrayet — overvejelser, værktøjskald, tool-resultater, fravalg — lever kun i hukommelsen (`rca:1073-1182`). `finish`-opsummeringen ender i et toolResult og forsvinder. Tekst uden værktøjskald afslutter loopet og gemmes ingen steder.

Der findes ingen `agent_runs`-tabel. Det eneste der persisteres er de skrevne rækker.

**Det er blokeringen for hele læringssløjfen.** Uden ræsonnementet kan en rådgiver forkaste et forslag, men ingen kan se hvad agenten tænkte — og så er der intet at rette.

### 2.3 Stedet til grunde findes og bruges ikke

`AdvisorAlertsPanel` skriver til tre tabeller med frit `note`-felt. Den almindelige håndtering gemmer rådgiverens tekst (`:139-146`).

Men "Afvis"-knappen skriver en **hårdkodet** note: `"Afvist — ingen handling nødvendig"` + 365 dages snooze (`:166-172`).

Og Ja/Nej på agentbeskeder skriver `context_meta.feedback = 'up'|'down'` uden grund (`CompanyChatPane.tsx:1558-1584`).

Præcis den læring vi vil have, kastes væk af én linje kode.

### 2.4 Der findes et godkendelsesmønster at genbruge

Rapport-godkendelsen: `/admin/review-queue` → `ReportReviewDialog` → RPC `get_report_commit_preview` viser præcis hvad der committes → mennesket godkender → RPC `commit_report_facts` skriver. Preview og skrivning er adskilt, og previewet er sandheden.

### 2.5 Agenten kender ikke indholdet

Ti læse-værktøjer: tal, puls, milepæle, handout-moduler, KPI'er, budget, tidligere beskeder, benchmark, alarmer, ansøgningskontekst. **Nul om Akademiet.**

Ordene "akademi", "video" og "content" findes ikke i funktionen. Den ved ikke at videoerne eksisterer, og ikke hvad medlemmet har set.

`get_handout_levers` nævner desuden et `"Likviditetsstyring"`-modul i sin egen beskrivelse (`rca:140`) — **det modul findes ikke**. De fem er overordnet, bogholderi, administration, salg, marketing.

---

## 3. Rytmen — hændelser frem for kalender

Jonas 2026-08-25: *"God rådgivning sker på baggrund af virkeligheden i stedet for et fast tidspunkt."*

I dag kører `run-weekly-agent` hver mandag for alle aktive virksomheder. Målt: 35 opgaver til 13 virksomheder mandag 2026-08-24 — uanset om der var sket noget hos dem.

**A1 — agenten udløses af hændelser, ikke af kalenderen.**

Kandidat-hændelser (skal verificeres mod hvad der faktisk kan observeres):
- rapport committet
- budget importeret eller ændret væsentligt
- opgave accepteret, udskudt anden gang, lukket eller udløbet
- handout gennemført
- refleksion indsendt
- medlem har set en video der hører til en åben udfordring

**A2 — tavshed er også en hændelse.**

En rent hændelsesdrevet model taber præcis den virksomhed man helst vil fange: den der ikke rapporterer, ikke ser noget og ikke svarer. Derfor et gulv: har en virksomhed ingen hændelse i N uger, udløses agenten på dét.

N er ikke besluttet. Kandidat: 3-4 uger, målt mod hvad der i dag udløser "Ikke hørt fra længe" på rådgiverdashboardet.

**A3 — loft pr. virksomhed.** Uanset hændelser må der ikke produceres forslag oftere end en fastsat kadence. Grænsen er ikke besluttet.

---

## 4. Hvad der bygges

### 4.1 Tør-kørsel

`run-company-agent` får en tilstand hvor læse-værktøjerne kører normalt, men skrive-kaldene **opsnappes og registreres som forslag** frem for at blive udført.

Snittet er `executeTool` (`rca:1146`): skrive-værktøjerne kaldes allerede igennem ét sted. Opsnapningen sker der, og modellen får et resultat der lader den fortsætte som normalt.

Det løser samtidig 2.1: "Kør agent"-knappen bliver ufarlig.

### 4.2 Kørselstabel

En tabel der bærer én agentkørsel: virksomhed, trigger, tidspunkt, model, iterationer, stopårsag — og **ræsonnementet**: hele værktøjs- og svarsekvensen.

Uden den er der intet at lære af. Med den kan en rådgiver se hvorfor agenten foreslog som den gjorde, og vi kan senere se hvad der blev forkastet og hvorfor.

Persistering af hele `messages`-arrayet indeholder virksomhedens tal. Opbevaringstid og adgang skal besluttes sammen med RLS.

### 4.3 Rådgiverflade

Forslagene med agentens begrundelse, og tre valg:

- **Godkend** — udfører skrivningen som den er
- **Redigér og godkend** — rådgiverens tekst er det medlemmet får
- **Forkast** — kræver en grund

Mønstret følger rapport-godkendelsen (2.4): forslaget er previewet, godkendelsen er skrivningen.

### 4.4 Grunde fra dag ét

**A4 — en forkastelse uden grund er tabt læring.**

Fire-fem faste grunde plus fritekst. Kandidater (ikke besluttet):
- *Ikke relevant for denne virksomhed*
- *Forkert tolkning af tallene*
- *Allerede talt om det*
- *Timingen er forkert*
- *Andet* (fritekst)

Grunden skal være ét klik, ikke et essay. Fritekst er tilvalg, ikke krav.

Samtidig rettes 2.3: `AdvisorAlertsPanel`s hårdkodede afvisningsnote erstattes af en rigtig grund.

### 4.5 Indholdskoblingen

Agenten skal kunne pege på jeres eget indhold når det svarer på det den ser.

Målt (`docs/indhold-recon.md`): 85 indholdselementer. **14 har en beskrivelse**; af de 47 lektioner i Fundamentet har syv, og af de 27 i Kurser har ingen.

Men titlerne bærer betydningen: *"Spil dit marketingbureau god: Forstå og stil spørgsmål uden at være ekspert"*, *"Outsource klogt"*, *"Spredning af risiko"*, *"Kostprisberegning"*. Sammen med samlingens navn (Bogholderi, Marketing, Salg, Kundeservice, Tracking, Email-marketing, Affiliate Marketing, Skat og moms) er det rigeligt for en sprogmodel.

**A5 — ingen indholdstaksonomi bygges.** Agenten får listen som fri tekst. 85 rækker er trivielt at læse. Beskrivelser ville forbedre det, men er ikke en forudsætning.

To nye læse-værktøjer: indholdslisten, og hvad medlemmet har set. Plus rettelse af den opfundne modulbeskrivelse i `get_handout_levers`.

---

## 5. Læringen

Det er dét der afgør om agenten bliver klogere eller bare mere forsigtig.

**A6 — begge slags rettelser opsamles, og de lærer forskellige ting.**

En **redigeret tekst** lærer stil: tonefald, længde, hvornår man er direkte.

Et **forkastet forslag med grund** lærer dømmekraft: at faldende omsætning i december ikke er et problem for en webshop, at marketingomkostninger der stiger med omsætningen ikke er alarmerende, at en produktionsvirksomhed med lagerbinding har et andet problem end en e-handel med samme tal.

**A7 — hvordan læringen bruges, besluttes efter måling, ikke nu.**

Kør forslagslaget i nogle uger. Se hvad der faktisk forkastes og hvorfor. Så ved vi om det skal blive til:
- eksempler i prompten
- regler et menneske kan læse og rette
- brancheviden

Det sidste er jeres viden og skal ud af hovedet på jer først — det kan ikke udledes af afvisninger alene.

---

## 6. Åbne spørgsmål

**6.1 Hvad udløser præcist?** §3's hændelsesliste er kandidater. Skal verificeres mod hvad der faktisk kan observeres i dag.

**6.2 Tavshedsgulvet.** Hvor længe, og målt hvordan? Rådgiverdashboardets "Ikke hørt fra længe" har allerede en dom — er den den rigtige?

**6.3 Opbevaring af ræsonnementet.** Hele `messages`-arrayet indeholder virksomhedens tal. Hvor længe gemmes det, og hvem kan læse det?

**6.4 Hvad sker der med de forslag ingen rører?** Udløber de som opgave-modellens forslag (B8), eller bliver de liggende? Dertil (25/8, jf. §7.6): et forslag om en given periodes tal er stadig bundet til den periode, uanset hvornår det godkendes. Hvor gammelt må et forslag være før det ikke længere bør kunne godkendes? Ikke besluttet.

**6.5 Brancheviden.** `industry_label` findes, og `get_industry_benchmark` sammenligner med jævnaldrende. Men systemet ved ikke hvad der er *normalt* i en branche. Kan læres af afvisninger over tid — eller skrives ned.

**6.6 Rytmen mod opgave-modellen.** Opgaveforslag udløber efter 14 dage (B10, ai_weekly). Ændres kadencen, skal udløbsvinduet følge med.

---

## 7. Godkendelseslaget

**Besluttet 2026-08-25.** Datamodellen er `agent_proposals` (migration `20260825200000`): én række pr. forslag, skrevet af `run-company-agent` umiddelbart efter kørselsrækken. Fire beslutninger bærer formen:

**7.1 Beslutningen er per forslag, ikke per kørsel.**

En kørsel producerer typisk 3-5 forslag af forskellig art (session-forberedelse, opgave, milepæl, ugens fokus). Rådgiveren skal kunne godkende ét og forkaste et andet — en samlet dom over kørslen ville tvinge alt-eller-intet og gøre læringen (§5, A6) ulæselig: det er *forslaget* der forkastes med en grund, ikke kørslen. Recon'en (agent-godkendelse-recon §3/§6) viste desuden at `agent_runs.proposals`-arrayet ingen stabil identitet har — elementerne renderes efter index, og et jsonb-array kan ikke bære beslutningskolonner. Derfor egen tabel med `(run_id, position)` som identitet; `position` er arrayets rækkefølge fra kørslen, og backfillen giver historiske kørsler samme form.

**7.2 Fire statusser: proposed → approved / rejected / expired.**

`proposed` er hviletilstanden. `approved`/`rejected` er rådgiverens afgørelse (fladen kommer i en senere PR). `expired` er reserveret til tavshedens udfald — §6.4 spurgte "hvad sker der med de forslag ingen rører?", og opgave-modellen har allerede svaret for medlems-forslag (B8: cron-udløb). Statussen findes fra dag ét, så udløbs-dommen kan tilføjes uden migration; selve cron'en er bevidst ikke bygget, for vinduet er ikke besluttet (§6.6-koblingen).

**7.3 Grunden er en CHECK-constraint, ikke en UI-regel.**

A4: en forkastelse uden grund er tabt læring — og recon'en viste præcis hvordan det går tabt i praksis: AdvisorAlertsPanels "Afvis"-knap skriver en hardcodet note ("Afvist — ingen handling nødvendig"), fordi grunden kun var en UI-konvention. `forkast_kraever_grund` håndhæver kravet i databasen: `status='rejected'` uden ikke-tom `decision_reason` afvises af Postgres, uanset hvilken flade eller funktion der skriver. Søster-constrainten `afgjort_kraever_afgoerer` sikrer at enhver afgørelse bærer `decided_by` + `decided_at` — en afgørelse uden afsender er ikke en afgørelse. `edited_args` holder rådgiverens redigerede version adskilt fra agentens original (`args`), så "Redigér og godkend" (§4.3) kan læres af som diff, ikke som overskrivning.

**7.4 Skrivning kun via edge function.**

RLS er advisor-SELECT + service-role-ALL — ingen klient-skrivepolicies, heller ikke for rådgivere. Grunden er den samme som i opgave-modellens skriveveje (opgave-accepter/-udskyd/-luk): en afgørelse er en TILSTANDSOVERGANG med regler (kun fra 'proposed'; godkend udfører skrivningen; forkast kræver grund), og overgange skal dømmes ét sted, server-side, med optimistisk lås — ikke spredt over klient-policies der kun kan udtrykke "hvem", aldrig "hvornår og hvordan". Klienten læser; edge-funktionen `agent-forslag-afgoer` skriver (motoren er `_shared/forslagEngine.ts`, skrivevejene deles med run-company-agent via `_shared/agentSkriveveje.ts`).

**7.5 Godkendt ugekort overskriver uden forhåndsvisning.**

**Beslutning Jonas 25/8:** godkendelse af et `update_weekly_focus`-forslag skriver direkte til medlemmets ugekort — upsert på `(company_id, week_key)` — uden forhåndsvisning af hvad der står der i forvejen.

Rationalet: agentens forslag er per definition nyere. Kortet er en syntese af virksomhedens aktuelle tilstand, og rådgiveren har netop læst og godkendt (eller redigeret) den nye syntese — at vise den gamle først ville bede rådgiveren om at dømme mellem to versioner, hvor den ene altid er forældet.

Den kendte konsekvens: `weekly_focus` har `seen_at`. Et kort medlemmet allerede har læst, kan altså skifte indhold under dem — `seen_at` består, og der sendes ingen ny notifikation. **Det er accepteret, ikke overset**: alternativet (skriv kun til ulæste kort) ville lade et forældet kort stå netop fordi medlemmet så det tidligt på ugen.

**7.6 Uge-nøglen beregnes ved skrivetidspunktet.**

Uge-nøglen beregnes ved skrivetidspunktet, ikke ved forslagstidspunktet. Godkendes et forslag i en senere uge end det blev stillet, lander kortet i godkendelsens uge. Begrundelse: et kort skrevet til en forgangen uge ville lande et sted medlemmet aldrig ser det. **Beslutning: Claude som arkitekt, 25/8.**

Uge-nøglen er **ægte ISO-8601 fra én delt kilde**: `supabase/functions/_shared/isoUge.ts` (torsdags-ankeret; frontendens modstykke er `src/lib/hjemmebane/week.ts`). Efterskrift 25/8: beslutningen ovenfor blev truffet FØR det var kendt, at agentens skrivevej regnede med et mandags-anker og lå én uge bagud (hændelsen i BACKLOG.md, 42 rækker over fire måneder). I den periode gjorde fejlen §7.6 til det modsatte af sin egen hensigt: "skriv til den uge medlemmet ser" landede konsekvent i en uge medlemmet ALDRIG ser — og overskrev den forrige uges kort. Princippet var rigtigt; formlen var det ikke. Deraf kravet om én delt kilde med testværn.
