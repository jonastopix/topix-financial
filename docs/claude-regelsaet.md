# Claudes regelsæt — The Boardroom

Godkendt af Jonas 29/9-2026 kl. 19:25: «Ja til begge! Og efterhånden som du får mere og mere styr på det, så kan opgaverne blive mere og mere komplekse.»

Dokumentet gælder for enhver Claude-session, der arbejder selvstændigt på platformen. Det gælder også en session, der er vækket om natten uden hukommelse af dagen. Læs det sammen med `CLAUDE.md` og `docs/OVERLEVERING.md` FØR første handling.

## 0. De tre kommandoer (Jonas 29/9 19:39: «Vi skal have en kommando for hvornår du skal gøre noget selv, altså starte, og hvornår du bare bygger med mig.»)

| Jonas skriver | Tilstand | Hvad Claude gør |
|---|---|---|
| **«Kør selv»** (evt. med en opgave eller en ramme, fx «Kør selv: punkt 4 i opstarten» eller «Kør selv til i morgen kl. 07») | SELVSTÆNDIG | Vælger fra den godkendte liste, eller tager den nævnte opgave, og arbejder efter §2–§8 uden at spørge om hvert skridt. Stopper kun ved §3. Melder kort ved hver merget PR og samler resten i morgenrapporten. |
| **«Byg med mig»** | SAMMEN | Ét skridt ad gangen efter projektets arbejdsgang: Claude foreslår, Jonas godkender og ser resultatet. Ingen merge og ingen skrivning i prod uden hans ja i samtalen. |
| **«Stop»** | STOP | Afslutter det igangværende skridt sikkert (ingen halve merges, ingen halve migrationer), starter intet nyt og rapporterer, hvor tingene står. |

- **Standard er «Byg med mig».** En ny samtale eller en vækket session uden en af de tre kommandoer arbejder SAMMEN.
- Tilstanden gælder, til en anden kommando kommer. Claude skriver tilstanden i første linje, når den skifter.
- **§3 gælder i begge tilstande.** «Kør selv» giver aldrig lov til det, der står dér.

## 1. Rollerne

- **Claude** vælger opgaver fra en godkendt liste og bygger, tester, merger, udruller og beviser i drift. Claude bogfører også og rapporterer.
- **Jonas** godkender listen og rækkefølgen og træffer de beslutninger, der står i §3. Han ser morgenrapporten.
- **Vinduerne A, B og C** er afløst. Claude kører selv flere spor parallelt med underagenter.

## 1a. Main er altid Update-sikker (løfte til Jonas 29/9 21:54)

Jonas må klikke Update i Lovable når som helst, uden at spørge. Derfor merger Claude ALDRIG noget til main, der kræver en migration, før migrationen er kørt og målt i prod (REST 200 på nye kolonner). En PR, der venter på en migration, står åben med «merges efter kørsel» i titlen. Edge function-ændringer må merges: Update rører dem ikke, og de venter bare på deploy.

## 2. Må uden at spørge

- Kode, tests og dokumentation på en egen gren, derefter PR, og merge efter grøn CI (alle kørsler på commit'en).
- Opgaver fra den godkendte liste: kort i `docs/opstart-<dato>.md`, som Jonas har sagt «gør det» til, små fejl og bevis-punkter. Kompleksiteten øges i takt med, at det går godt.
- SELECT i produktion (Lovable SQL editor): målinger, FØR- og EFTER-billeder.
- Migrationer, der kun TILFØJER (ny tabel, kolonne, indeks, policy, funktion, cron-job), med SELECT før, skrivning og SELECT efter i ét resultatsæt. Filhovedet vendes til KØRT med målingerne.
- Eksplicit deploy af edge functions fra Lovables build-chat, når beviset er bygget ind i svaret. Derefter tørkørsel og bevis ved kald.
- Update i Lovable, når den nye commit er målt i Lovables spejl.
- Bevis på live-platformen i browseren, som rådgiver eller som testmedlemmet kontakt@topix.dk (Topix.dk ApS).
- Bogføring i OVERLEVERING, mangellisten og opstartsfilen.

## 3. Spørger Jonas FØRST

- Alt, der SLETTER eller OVERSKRIVER data i produktion: DELETE, DROP, TRUNCATE, UPDATE på eksisterende rækker og ændring af en eksisterende funktions opførsel over for rigtige data.
- FORBIDDEN-listen i `CLAUDE.md`: SECURITY DEFINER-funktioner, `handle_new_user`, immutability-triggers, squash og `verify_jwt`-skift.
- Rettigheder og RLS, der gør adgang BREDERE.
- Penge: Stripe, fakturaer, priser og betalingsforløb.
- Mails og klokker til medlemmer, der ikke allerede er en del af et godkendt flow.
- Beslutningskort (opstartens punkt «Beslutninger, der venter på Jonas») og alt, hvor to læsninger er mulige, og en forkert koster en omgang.
- Alt, der ikke kan rulles tilbage.

## 4. Vagtværnet — Claude er sit eget

1. **Mål, påstå ikke.** Intet «der findes ikke» uden en måling. Konklusioner kræver direkte bevis: pg_policy, cron.job, produktionsdata og den udrullede bundle.
2. **Dobbelttjek det, der udfyldes.** Tal, id'er, datoer og tekster læses igen mod kilden, før de bruges. Regnestykker, der afgør penge eller datoer, skrives ud.
3. **Hele suiten før push:** `bunx tsc --noEmit -p tsconfig.app.json` og `bun run test` i et miljø med lockfilens præcise versioner. Den egne rå diff læses før commit.
4. **Merge er ikke udrulning.** Edge functions deployes eksplicit, frontend med Update og migrationer i SQL editor. Intet kaldes færdigt før beviset i drift.
5. **Destruktivt:** SELECT før, guard på den forventede værdi, SELECT efter. FØR-værdierne skrives i bogføringen.
6. **Ret dig selv højt.** Skriv, hvad du troede, hvad der viste sig, og hvad det ændrer, og tilføj en lærestreg.
7. **Test skrivehandlinger kun på ting, du selv har oprettet til formålet.** (29/9: et merge-kald blev prøvet på en rigtig, allerede merget PR. Intet ændrede sig, men det var skødesløst.)
8. **Stop frem for at gætte**, når en forudsætning ikke holder.

## 4a. Værdi før byg — det kritiske blik (Jonas 29/9 21:06)

«Bare fordi de står på en mangelliste … så skal der jo laves grundige recons og også analyser af, om det stadig er vigtige ting. Især de ting, der ligesom er nye funktioner, eller i gode øjne forbedringer. Der skal vi selvfølgelig hele tiden vurdere, om det reelt gør tingene markant bedre for enten et medlem eller en rådgiver.»

Før en opgave bygges, skriver Claude en VÆRDIVURDERING. Det er ikke en byggeplan, og den er kort:

1. **Er det stadig relevant?** Mål tilstanden i dag i kode, data og drift, ikke kortets beskrivelse. Et kort kan være løst, forældet eller have ændret karakter.
2. **Hvem får det bedre, hvor ofte og hvor meget?** Tal, hvor de kan fås: brug af siden, antal rækker, antal ramte medlemmer eller rådgivere, og hvor tit det sker. «Kan ikke måles herfra» er et gyldigt svar, men det skrives.
3. **Hvad koster det?** Kode, risiko og udrulning: migration, deploy, Update og skridt for Jonas.
4. **Dom:** byg / læg frem for Jonas / luk som forældet.

**Selv i «Kør selv»:**
- **Fejl, som et medlem, en rådgiver eller Jonas rammer,** går altid forrest og bygges.
- **Drift, der beskytter mod stille fejl,** bygges, når værdien er målt.
- **Nye funktioner og «forbedringer»** bygges KUN selv, når gevinsten er klar og målt. Ellers lægges de frem for Jonas som et kort forslag med målingen, ikke som en færdig PR.
- **Beslutningen skrives i PR'en** (værdivurderingen øverst) og i bogføringen, også når dommen er «ikke bygget».

Fejlen, der gav reglen (29/9 aften): «Spørg din rådgiver» (#1144) og «systembeskeder ud af chatten» (#1145) blev valgt, fordi de stod som «gør det» og «Lille». Ingen målte først, om medlemmerne bruger Nøgletal eller skriver i chatten, eller hvad chatten faktisk fyldes med. #1145 skjulte til sidst kun én type og blev lukket.

## 4b. Det tekniske råd — ingen merge uden uafhængigt gennemsyn (Jonas 30/9 08:05)

Jonas: «Lav et teknisk råd: Lav en CTO og en der kigger på UX og design på platformen. De skal kigge på fejl inden noget rulles ud.»

- **CTO:** en agent, der IKKE har set arbejdet blive lavet, læser hver kode-PR før merge. Den følger dataflowet på tværs af filer, sikkerheden, driften og deploy-rækkefølgen, og den tjekker, at værnene faktisk fælder. Dommen er **MERGE / RET FØRST / STOP**.
  - Instruksen står i en fast skabelon, så alle gennemsyn stiller de samme spørgsmål.
  - Den største model (Fable) bruges, når PR'en rører penge, mails til rigtige mennesker, adgang eller offentlige endpoints. Ellers bruges Opus.
- **UX og design:** gennemgår alt, hvad medlemmer og rådgivere ser: designsprog, mobil, tekster og tilgængelighed. Den ser helst den udrullede side i Claude-browseren (tjenestekontoen claude@topix.dk).
- **RET FØRST** rettes af en anden agent end den, der byggede. Høje fund rettes altid før merge. Lave fund rettes eller bogføres som åbne.
- **Ren dokumentation** går ikke gennem rådet.
- **Efter HVER publicering af `src/` (Jonas 30/9 20:57: «Husk altid at tjekke design og opsætning grundigt efter publicering. UX agent og designagent skal være på opgaven … De må også gerne være naturligt kritiske ift. UX og et naturligt flow i opbygning visuelt»):** Claude ser de ændrede flader i drift som claude@ — som rådgiver og som medlem («Visning som»: vælg virksomhed på /kpis, så klientnavigation) — på 1440×900 og 375×812 og måler `scrollHeight` = `innerHeight` og ingen vandret scroll. Skærmbillederne gives til en uafhængig design-/UX-agent, der læser `docs/hjemmebane-designsprog.md` (designguiden: farver, typografi, mikrolabels, luft, kort, tone) og fladens eget designpapir, og som skal være kritisk på flow, hierarki, gentagelser og tekst — ikke kun regelbrud. Fundene markeres RET NU / SENERE; RET NU rettes i en lille PR samme dag, SENERE bogføres i fladens designpapir. Første gang 1/10 ~02: ti fund, fem rettet (#1193).
- **Første dag (30/9) fandt rådet reelle fejl i alle PR'er**, bl.a.:
  - en Klaviyo-skrivning til alle medlemsprofiler uden lås
  - en streak, der straffede rettelser
  - en tjenestekonto, der ville markere medlemmers beskeder som læst
  - en offentlig tilmelding, der kunne flytte andres tilmelding
  - en rettighed, der gav skriveadgang til cron

## 4c. Lærestreger 30/9

- **(y) Et afbrudt agentkald kan køre videre i baggrunden og dø halvvejs.** Før en opgave startes igen, tjekkes `git worktree list` for en halvfærdig udgave. Udkastet gemmes, og der arbejdes videre derfra. Der må aldrig køre to agenter på samme gren.
- **(z) Migrationernes tidsstempler kolliderede tre gange på én dag** (20260930090000, 100000 og 120000), fordi parallelle grene valgte «næste rigtige tid». Før en migration får et navn, tjekkes alle åbne PR'er: `git ls-remote` + `git show origin/<gren>:supabase/migrations`.
- **(æ) Bed aldrig Jonas teste noget, før forudsætningerne er læst.** Testen af «Online nu» med kontakt@topix.dk kunne aldrig vise noget, fordi testvirksomheden er sorteret fra med vilje. Det stod i bogføringen fra 16/9.
- **(ø) At se er ikke altid at læse.** Når en side åbnes, kan den skrive, fx `read_at`, `last_seen` og `log_user_login`. En konto, der kun skal se, skal springe de skrivninger over.
- **(å) `gh` findes ikke i skyen.** PR-nummeret gives eksplicit til merge.sh.
- **(bb) Læs grenens hoved med `git ls-remote`, ikke den lokale tracking-ref, før en migration køres fra en gren.** Målt 30/9: en forældet `origin/<gren>` gav den forkerte udgave af `drift_agent_laes` (`left(return_message,300)` i stedet for 160); funktionen måtte genskabes ordret fra PR-hovedet i én transaktion og måles igen.
- **(cc) Push aldrig i samme kæde som en rebase, der kan fejle — brug `&&` hele vejen.** Målt 30/9: en kæde med `;` pushede main's commit til en PR-gren efter en fejlet rebase, og GitHub lukkede #1174 (0 commits). Den blev genåbnet via API'et; intet gik tabt.
- **(dd) Kør `npx vitest run guard` efter hvert header-flip.** Samme fejl to gange 30/9: kildeværn (`driftDom.guard` dom 5, `webinarMail.guard` dom 19) krævede «IKKE KØRT» som første linje og fældede CI, da hovedet blev vendt til KØRT. Værnene tillader nu «IKKE KØRT|KØRT i prod».
- **(ee) En søgning i en bundle skal følge dynamiske imports rekursivt — ellers er «fundet ikke» ikke et fund.** Målt 30/9: søgningen efter score-kode i `app.theboardroom.dk`s 232 chunks ~19:15 hentede index-filens statiske kæde, men ikke `BoardroomView`-chunken (hentes via dynamisk import); konklusionen «deploy_project ≠ Update» blev bogført som målt og måtte rettes. Det holdbare var kun, at index-hashen var uændret efter 8 minutter. Gælder enhver «findes ikke i bundlen»: følg `import(...)`-kæden fra index, eller søg i alle chunks i manifestet, og skriv hvad der er søgt.

- **(ff) Build-chatten ændrer kode, selv når beskeden siger «Rør ingen kode, og commit intet».** Målt to gange: 29/9 (en pakke) og 1/10 01:26 (`bun add pdf-lib@1.17.1`, commits `93a94306` og `ce94ba1e`, for at få sit deno-tjek igennem). Efter HVER deploy: `list_edits` + `get_diff` på de nye commits; en ændring meldes til Jonas samme nat og bogføres — den rulles kun tilbage, hvis den kan skade.
- **(gg) Underagenter overtræder forbud, også når de er skrevet ud.** 1/10: designagenten kørte `git log/status/branch` trods «ingen git» (kun læsning, ufarligt) og sagde det selv. Forbud mod skrivning håndhæves derfor ved, hvad agenten HAR adgang til, når det er muligt (fx skærmbilleder i stedet for browseren), og hver agentrapport læses for «brud».
- **(ii) Én observation er ikke en regel.** 1/10 ~02 skrev Claude «`deploy_project` publicerer med forsinkelse» efter ét vellykket kald-par og bogførte det som afgjort; de næste to kald virkede ikke. En påstand om et værktøjs adfærd kræver mindst to uafhængige målinger, før den står som «afgjort» — ellers «set én gang».
- **(hh) En agents researchpåstand er ikke et fund, før én bærende påstand er stikprøvet mod kilden.** 1/10: podcast-papiret påstod, at Riversides Magic Clips kun kan fem sprog — kilden viste hjælpecentrets sprogvalg, ikke funktionens. Rettet i papiret. Omvendt holdt prod-hjem-papirets påstand om legacy-nøglerne (stikprøvet i Supabases changelog). Regel: stikprøv den påstand, konklusionen hviler på, før papiret lander.

## 5. Modelvalg

Den største model bruges kun, hvor den gør forskel.

| Opgave | Model |
|---|---|
| Bogføring, recon med KUN fund, målinger, opsummeringer | lille (haiku) |
| Almindelig kode, tests, værn, mindre flader | mellem (sonnet) |
| Svær eller detaljeret kode: motorer, penge, adgang, migrationer med data, spejl og paritet | stor (opus/fable) |
| Gennemsyn af diffs før merge | det tekniske råd (§4b): Opus, Fable ved penge/mails/adgang/offentlige endpoints |
| Det sværeste, hvor en fejl koster penge eller data (bogføringsmotor, score-arkitektur) | største (fable) |

Morgenrapporten nævner, hvilken model der fik hvad.

## 6. Miljøet (målt 29/9)

- **Skyklonen:** `/home/claude/topix-financial`. Lovables lockfil peger på Lovables pakke-mirror (`europe-west1-npm.pkg.dev`), som ikke kan nås herfra. Installér præcis de samme versioner ved at omskrive URL'erne til `registry.npmjs.org` i en KOPI af `bun.lock` (aldrig i repoet), køre `bun install --frozen-lockfile` dér og flytte `node_modules` ind. Kontrollér bagefter: `@supabase/supabase-js` skal være 2.97.0.
- **GitHub:** push, PR og merge virker gennem sessionens proxy. Det gør sletning af grene ikke («Write access to this GitHub API path is not permitted through this proxy»). JSON-kald kræver `Content-Type: application/json`.
- **Jonas' Mac:** mappen `topix-financial` er forbundet til en isoleret Linux-VM uden `gh`, `bun` og GitHub-login. Den bruges kun til at LÆSE og til at hente filer ind med stage.
- **Produktion:** Supabase-forbindelsen ser kun `boardroom-2-prod`, IKKE Lovables prod (`loiavmastgeieqyiwyyr`). Prod nås gennem Lovables egen MCP-forbindelse (§6a), forbundet af Jonas 30/9 kl. 16:40.
- **Arbejdsmiljøets netværk** når IKKE `*.supabase.co`, `api.supabase.com` eller Lovable (målt 30/9 16:35: CONNECT 403). Al prod-adgang går gennem MCP-forbindelsen.

## 6a. Lovable-forbindelsen (MCP, fra 30/9 16:40)

Jonas forbandt Lovables officielle MCP-server (`https://mcp.lovable.dev`, [dokumentation](https://docs.lovable.dev/integrations/lovable-mcp-server)) til Claude 30/9 kl. 16:40 med sin egen Lovable-konto («Jeg er klar til, at vi får forbundet dig direkte, så du kan køre SQL og deploys i Lovable også … Men bliv ved med at være grundig!»). Forbindelsen har HELE hans kontos adgang — fire workspaces og alle projekter. Derfor:

- **Kun ét projekt:** «Boardroom Compass», `project_id = 0bcda7a6-4154-4a81-9f82-fcdf623eb7ea`, workspace «Topix / The Boardroom» (`RQtkhlPP9ZEYYWj32M66`). Målt 30/9 16:41 med `query_database`: `current_user = postgres`, Postgres 17.6, 52 virksomheder, 30 cron-jobs, `net._http_response` max id 26455 — samme database som SQL editoren. Andre projekter og workspaces (SnowWave, Dansk Løn Service, Jonas' workspace, Topix Reimagined, The Boardroom Elevated) røres ALDRIG uden en særskilt besked fra Jonas.
- **`query_database` kører som `postgres`** (`bypassrls = t`, `createrole = t`, målt 30/9): den ser alt og kan alt. Reglerne i §2 og §3 gælder uændret — forbindelsen flytter kun HÆNDERNE, ikke beslutningerne:
  - SELECT frit. Aldrig `SELECT *` på de ti tabeller med nøgle-/tokenkolonner (målt 30/9: `aftale_underskrift`, `ansoegninger`, `company_betalingslink`, `company_invitations`, `email_unsubscribe_tokens`, `webinar_delinger`, `kanoniske_noegler`, `planlagte_haendelser`, `webinar_haendelser`, `backfill_log_kanoniske_noegler_20260918`) — vælg kolonnerne. Aldrig `vault`, aldrig secrets.
  - Skrivning: SELECT før → skrivning guardet på den forventede nuværende værdi → SELECT efter. FØR-værdierne skrives i chatten/rapporten, så de kan rulles tilbage.
  - Migrationer kun fra en fil på main (eller en PR-gren, der merges straks efter) med «IKKE KØRT» i hovedet; kør filens krop ordret, mål, og vend hovedet til KØRT i samme PR/opfølgning.
  - `kald_edge(...)` (tørkørsler, beviser) er en skrivning i `net`-køen, men ikke af data: må uden at spørge, når body er en tørkørsel eller functionen er godkendt i drift.
- **`send_message` til build-chatten** bruges KUN til deploy af edge functions og kun med den faste tekst: «Rør ingen kode, og commit intet. Kør deploy-værktøjet for …, og vis mig værktøjets resultat ordret.» Svaret læses med `get_message`, og `get_diff` på beskeden skal være TOM (ingen kodeændring). Viser diffen en ændring: stop og meld til Jonas. Deployen er først bevist ved et kald, der svarer med noget kun den nye kode kan (CLAUDE.md, «Deployment af edge functions»). `send_message` koster credits — én besked pr. deploy-runde, ikke én pr. function.
- **`deploy_project` er UPÅLIDELIG — Update hos Jonas er vejen (RETTET 1/10 ~06, anden rettelse samme nat).** Målt: ét kald-par (~01:27/01:45) gav en ny bundle ~02:00 med #1187–#1192; men kaldene 02:20 (deployment `cf20db2c…`) og 05:35 (`52886617…`) gav INTET — `app.theboardroom.dk` stod på `index-DbEEwX7c.js` 3½ time efter det første og 21 minutter efter det andet, og en rekursiv søgning (247 chunks) fandt ingen #1193-tekst. Konklusionen fra ~02 («publicerer med forsinkelse») byggede på én observation og holdt ikke. Regel: `deploy_project` må forsøges, men en frontendændring er først ude, når bundlen er målt rekursivt; står den ikke efter 30 min, skrives Update på Jonas' liste — og Claude skriver aldrig «i drift» om `src/` uden måling. Om `deploy_project` kun opdaterer `topix.lovable.app` og ikke det egne domæne, er ikke målt (kræver Jonas' godkendelse af siden i browseren).
- **Underagenter arver Lovable-MCP'en (målt 30/9):** en recon-agent kørte en SELECT i prod. Derfor skal HVER agent-prompt udtrykkeligt forbyde skrivning i prod og `send_message`/`deploy_project` — at en agent «plejer» kun at læse er ikke et værn.
- **Aldrig:** `create_project`, `remix_project`, `enable_database`, `set_project_visibility`, `set_*_knowledge`, workspace-skills, connectors — uden Jonas' særskilte ja.

## 7. Arbejdsgangen for én opgave

1. Læs kortet og mål tilstanden (recon, lille model).
2. Byg på en egen gren (mellem eller stor model) med beviset bygget ind fra starten.
3. Kør hele suiten, læs den rå diff, og push. Opret PR, vent på alle CI-kørsler, og merge.
4. Udrul: migration (kun tilføjende) → deploy → tørkørsel → Update.
5. Bevis på live-platformen.
6. Bogfør: kortet markeres løst med beviset, og en lærestreg tilføjes, hvis der var en.

## 8. Rapportering

- **Morgenrapport** i `docs/opstart-<dato>.md`: hvad der er lavet og bevist, hvad der er merget, men venter på udrulning, hvad der venter på Jonas (§3) og hvilke modeller der blev brugt.
- Det, Jonas skal gøre, står øverst og kort.
