# Status 1. september 2026 — mangellisten fra 27/8 målt mod koden
> Skrevet 2026-09-01. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Grundlag: mangellisten af 27. august (HTML), BACKLOG.md, docs/RAEKKEFOELGE.md,
docs/hjemmebane/konvergens.md, samtlige docs/*.md, og git-historikken siden
27/8: **34 PR'er (#440–#473)** plus to direkte Lovable-commits. Hvert punkt
herunder er afgjort ved at måle mod koden eller mod bogførte driftsmålinger —
ikke ved at læse hvad der står skrevet. Hvor jeg ikke kan måle (prod-data,
manuelle SQL-kørsler), står det som uafklaret.

> **Sådan læses dette dokument.** Det afløser mangellisten af 27.
> august som statusgrundlag. Hvert punkt er afgjort ved at måle mod
> koden eller mod en bogført driftsmåling — ikke ved at læse hvad der
> står skrevet. Dagens dyreste lærdom er at fravær i repoet ikke er
> fravær i drift: tre påstande faldt på præcis den fejl. Hvor noget
> ikke kunne måles, står det som uafklaret frem for som formodning.

---

## 1. LØST siden 27/8

**Medlemmets opgaveflade** — #453 (svar på forslag: accept med datovalg B6,
udskydelse B7/B11, lukning med fire udfald) + #454 (sektionen "Dine aftaler":
alle aktive opgaver, forfaldne øverst, ÉT forslag ad gangen). Bevist i drift:
platformens første registrerede aftale 31/8 kl. 10:06 (Topix, "Afslut handout
for 'bogholderi'", frist 4/9). Mangellisten kaldte punktet "Stor" — det er
lukket.

**Udløbs-cron'en (B8)** — #469, ren SQL efter agent-runs-mønstret, med
paritetstest der læser migrationen. Bevist deployet: jobbet `opgave-udloeb`
(04:00) står i prod-cron-opslaget fra 1/9. "Rækkerne bliver liggende som
proposed for evigt" gælder ikke længere.

**Rådgiverens forslagsvej** — #455 (`foreslaa-opgave`, Bucket A, source
`advisor`, 30 dages frist jf. B10, systembesked i samtalen) + #456 (kilderang
i forslags-rækkefølgen + dublet-fix). Mangellistens "Ingen rådgiverflade kan
i dag skrive til company_actions" er lukket. Bevis: funktionen svarede 404
efter merge og blev rullet ud eksplicit 10:42 UTC — se NYT-fundet om
auto-deploy.

**Session-forberedelsen skjult af rent UI-filter** — dobbelt lukket. #457:
RLS-carve-out på messages (målt som medlemmet selv: 18 af 44 beskeder kunne
hentes før; nul session_prep efter). #463: hele session_prep-produktionen
fjernet (C3-beslutningen) — skrivevejen findes ikke mere.

**Fortegnet på omkostningsposter fra årsrapporten** — #440
(`normaliserAarsrapport`, ren fortegns- og afstemningsmotor: konvention
afgøres ved regnestykket, aldrig ved fortegnet alene) + #444 (porten koblet
på skrivevejen — verificeret: extract-annual-report importerer og kalder
motoren). Skrivevejen er rettet. De HISTORISKE rækker hos de elleve
virksomheder er ikke bogført rettet — se STÅR-listen.

**Årsrapport-dokumentproblemet (klasse B uden omsætning)** — beslutningen
"skattebilag eller supplement?" blev til spørge-mekanik: #442 (spørg om
omsætningen når dokumentet ikke bærer den, `update-annual-report-revenue`),
#443 (slet først årets gamle årsrapport når den nye er bekræftet), #444
(port: normalisér, afstem, afvis), #445 (vis afvisningsgrunden frem for
HTTP-status), #448 (høst fejlgrunden fra ai_checks og vis den). Virker kun
fremad — tre gamle årgange uden omsætning (ANLA GLAS 2024, Livja 2025,
YKRG 2024) skal spørges særskilt (bogført i planen).

**Kendt kilde uden template** — #449. Den fejlklasse der aktivt ramte
betalende medlemmer (ni uploads, seneste 23/8) er ikke længere en blindgyde.

**FAIL uden grund** — #448/#445. Planens klasse 3 ("systemet ved ikke
hvorfor") har nu en grund der høstes og vises.

**Reaktioner kunne skrives men ikke læses** — #467. Rodårsag: den oprindelige
SELECT-policy refererede group_messages og blev ædt stille af koncern-droppets
CASCADE (20260805224500). Fejlklassen (CASCADE æder policies uden varsel) er
bogført i SECURITY_BASELINE med krav om pg_policies-diff efter fremtidige
DROP CASCADE.

**Fornyelses-apparatet** — #450 (rådgiverflade til beslutninger), #451
(udløbne uden beslutning er `ophoert`), #452 (ordningen som dokument).
To af mangellistens tre beslutnings-kort er afgjort: *hvor tilbuddet vises*
(fornyelsessiden/gaten; fjortendages vindue EFTER udløb, uden platformadgang)
og *prisen* (50 % af indgangsprisen). Se ÆNDRET for hvad der består.

**Navnet** — afgjort i praksis ved #454: sektionen hedder "Dine aftaler".
("Dine skridt" blev ikke valgt.)

**Chatten (medlemsdelen) ud af gammelt design** — #462 (MemberChatPane
udskilt som ren flytning, kildeværn med syv låse), #464 (Hb-skallen,
layout="fuld"), #465 (seks delte komponenter fik `variant="hb"`), #466
(tråden i Hb: sage-bobler, stille systemlinjer, hairline-separatorer), #468
(sort dokumentgrund under Hb-fladerne rettet). Rådgiverens flade er bevidst
urørt — hører til rådgiver-epicen.

**Feedback-knappen (C13)** — lukket som beslutning i #470: genindføres ikke.
Måling: 12 stykker feedback nogensinde, 0 siden maj; knappen var i øvrigt
altid skjult på chat-ruter (FeedbackButton.tsx:12-13).

**Reflection-nudgen** — slukket for godt ved beslutning 1/9 (#473, migration
20260901110000): en maskine der skriver i rådgiverens navn er en falsk
besked; samme princip som nedlagde engagement-nudgen; P5 i email-flows
efterlyste afgørelsen. Jobbet var allerede manuelt fjernet i prod; migrationen
er værnet mod genopståen.

**Prod-cron bogført** — #473, migration 20260901112000: de tre jobs der kun
fandtes i prod (cleanup-stale-processing-reports, process-notification-emails,
intro-session-reminder) er bogført med kommandoerne kopieret tegn for tegn.
Efter deploy er alle ni prod-jobs genskabelige fra repoet — første gang.
(Selve bogførings-migrationens Lovable-kørsel udestår; driften er allerede i
den besluttede tilstand.)

**Prod-cron-migrationen er kørt** — bekræftet 1/9 kl. ca. 10:37: ni
jobs, alle aktive, og de tre bogførte har nye jobid'er (378, 379,
380). Hele cron-laget kan nu genskabes fra repoet. Reflection-nudge-
værnet er kørt og returnerede nul rækker, som det skulle.

**Dokumentationsgælden fra 27/8** — aktiveringsmålingen (#446), planen
(#447), tolv recon-noter (#458/#459), chat-designdokumentet C1-C13
(#460/#461), nudge-reconen (#471) og tilbagetrækningerne (#472) er alle i
repoet. "Intet lever kun i chatten" er indfriet for denne periode.

---

## 2. ÆNDRET — punktet står, men beskrivelsen passer ikke længere

**Agentens forslagsrum er større end godkendelseslagets** — revnen er
SKRUMPET, ikke vokset, men af den modsatte grund end forudset:
`write_session_prep` udgik med C3, så `UNDERSTOETTEDE_SKRIVEVEJE` rummer i
dag KUN `update_weekly_focus` (forslagEngine.ts:26). `write_company_action`
foreslås stadig og kan stadig kun forkastes. Det nye er at
opgave-skrivevejen nu FINDES og er bevist i drift — blokeringen er ikke
længere infrastruktur, kun beslutningen om gentagelses-semantikken (stadig
ikke truffet; den er ikke en del af B1-B11).

**De tretten der aldrig kom i gang** — tallet er nu **tolv uden ét
uploadforsøg / fjorten uden ét målt tal** (aktiveringsmålingen 27/8, #446):
remm. og LineAlmegaard tæller falsk som "har data" (kun årsrapport-estimater
hhv. baseline). Nævneren er verificeret ærlig (rapport-rækken skrives FØR
udtrækket — et afbrudt forsøg efterlader spor). Samtalerne er stadig ikke
taget; navnene står i docs/aktiveringsmaaling-27-august.md.

**Dialog og begivenheder blandes (44 %)** — målt præcist: 44,4 %
systembeskeder, og hver tredje besked var en rapportkvittering. #463 fjernede
kvitteringsskriverne (reportCommit, useFinancialAnalysis) og #466 gjorde de
tilbageværende systembeskeder til stille centrerede linjer. Den HISTORISKE
sletning af de ~354 kvitteringsrækker er en manuel SQL hos Jonas — om den er
kørt, kan jeg ikke måle herfra.

**Splittet af CompanyChatPane** — medlemsdelen er ude (#462). CompanyChatPane
består som rådgiverbord; "to produkter i samme fil" er nu to filer, men
rådgiverfilen selv er ukonverteret og hører til rådgiver-epicen. Splittets
pris, bevidst betalt ved ren flytning: 500-beskeders-vinduet findes nu i TO
filer (MemberChatPane:173/276 + CompanyChatPane:245/451), og ForfatterAvatar
findes i FIRE kopier (før tre).

**Fokuskortet fører ingen steder** — delvist lukket: handlings-punktet peger
på `#dine-aftaler` når der er en aktiv opgave (nextStep.ts:295), milestone
på /milestones. Ugefokus-punktet peger fortsat på "/" — bogført som bevidst
(visningen afgør formen).

**Indsæt fra regneark + sletbare linjer (budget)** — var allerede bygget da
listen blev skrevet: HbImportGitter (commits 23-24/8) har paste
(HbImportGitter.tsx:134/274/325) og slet pr. række (:334), og /budget har
båret Hb-fladen siden Budget-GO 6/8. Listen var forældet på budget-delen.
RAPPORT-delen af "poster kan ikke slettes" (parseren opfinder en post i
ReportReviewDialog, medlemmet kan kun rette tallet) står — ingen
linjesletning findes dér.

**Rapport-uploaden afviser og henviser til manuel indtastning** — klassen
"afvist uden forklaring" er væsentligt mindre: grunden vises nu (#445/#448),
og kendt kilde uden template er en farbar vej (#449). Selve parse-dækningen
(flere saldobalance-varianter) er ikke udvidet.

**Udløbsvarsel og afskedsmail** — omdefineret ved beslutning
(fornyelsesordningen §1): `tilbyd_ikke` og udløbne uden beslutning får
INTET — ingen mail, ingen notifikation, ikke bag et flag. "Afskedsmail" som
koncept er afskaffet. Tilbage står kun tilbuds-briefen, og den er blokeret af
fire led i rækkefølge (§5): indgangsprisen som data → vinduestilstand i
motoren → fornyelsessiden → betalingsvejen.

**Intet forlænger contract_end_date** — præciseret: manuel forlængelse via
EditCompanyDialog findes (og import-application sætter feltet ved import).
Det der mangler er den automatiske betalingsvej — `checkout.session.completed`
i payment-mode springes bevidst over i webhooken.

**Topix' egne tal på et skattebilag** — rettet i hånden 27/8 (bogført i
planen). Punktet er væk; restproblemet er de tre andre årgange uden
omsætning (se LØST/årsrapport).

**Ingen samlede tal for en periode** — `opgoerPeriode` er fortsat uden
aftager, men nu ved BESLUTNING (planen: fladen betjener virksomheder med
data, og halvdelen af basen har ingen — venter til lag 1 er lukket). Fra
mangel til bevidst parkering.

**"Chat og Book session" (gammelt design)** — halvdelen var forældet da
listen udkom: Book session blev konverteret 13/8 (PR #356-359, bogført i
BACKLOG). Chat-medlemsdelen er nu også lukket. Tilbage af kortet: intet —
men konvergens.md §1 viser stadig /book-session som GAMMEL og /chat som
GAMMEL; tabellen er ikke ført ajour med hverken 13/8 eller #464-466.

**Fejlovervågning** — mangellistens "hverken i frontend eller edge functions"
var for bred: frontend har haft Sentry siden 30/3 (main.tsx:36). Essensen
står: ingen overvågning af de 55+ edge functions, og klassen "skrivning der
lander det forkerte sted" fanges ingen steder. Periodens fund bekræfter
behovet: intro-remindernes stempel-fejl og reactions-hullet blev begge fundet
ved manuel måling.

---

## 3. TRUKKET TILBAGE — punkter der var forkerte

**"intro-reminder-cron har aldrig kørt"** — FORKERT. Den kører dagligt 09:00
og har gjort det siden 13/8, som pg_cron-jobbet `intro-session-reminder`
(jobid 249) — jobnavnet matcher ikke funktionsnavnet, og reconen ledte efter
det forkerte navn. Trukket tilbage i #472 med lærdommen: **fravær i repoet er
ikke fravær i drift; cron-tilstand måles i cron.job, ikke i
migrationshistorikken.** Sidefund ved målingen: funktionen stempler FØR
afsendelse — Floren Engros stod stemplet uden nogensinde at have fået mailen
(stemplet nulstillet manuelt 1/9). Stempel-før-afsendelse-fejlen i koden er
IKKE rettet.

**"legat-reminder-cron har aldrig kørt" — rigtig konklusion, forkert
begrundelse.** Den kører ikke, men ikke fordi "pg_cron-mønsteret mangler at
blive brugt": funktionen er ren `Deno.cron`, og Deno.cron eksekveres ALDRIG
på Supabases edge-runtime (fastslået 13/8 i intro-reminder-cron-rettelsens
filhoved). Den kan ikke komme til at køre uden ombygning.

**"Udløbsvarsel og afskedsmail — motoren er bygget og bevist"** — FORKERT
(trukket tilbage i #458 §7): det bygde og beviste er beslutningsmotoren
`fornyelse.ts`. Der findes ingen varsels- eller afskedsmail i repoet — og
afskedsmailen må nu slet ikke bygges (fornyelsesordningen §1).

**"daily-reflection-nudge er I DRIFT"** (nudge-reconens første udgave) —
FORKERT: jobbet var manuelt fjernet i prod efter 10/8, mens repoet stadig
schedulerede det. Trukket tilbage 1/9; nu slukket for godt ved værns-migration
(#473).

**"Gruppechat-laget er ubrugt (group_conversations/group_messages med
RLS)"** — var allerede forkert da listen udkom: tabellerne blev droppet
20260805224500 (koncern-fjernelsen, DROP TABLE ... CASCADE). Punktet udgår.
Ironisk nok var netop dét drop årsagen til reactions-hullet (#467).

**BACKLOG [P3] "run-weekly-agents tidsplan er oprettet direkte i prod udenom
historikken"** — hypotesen er nu målbart forkert: cron.job (ni jobs, 1/9)
indeholder INTET run-weekly-agent-job. Se NYT-fundet nedenfor — funktionen
kører formentlig slet ikke.

**"Forsidens events-kort er uden CTA"** (BACKLOG [P3] events-tilmelding) —
forældet: forsidens events-sektion (BoardroomView:1946-1985) linker til
/events/:id og bærer inline-tilmelding (EventRegisterAction). HbEventCard —
kortet uden CTA — bruges kun i det døde preview.

---

## 4. STÅR UÆNDRET — stadig sandt, stadig åbent

**deriveFocus kender ikke "aldrig begyndt"** — nextStep.ts:158-177 tester
fortsat kun om forrige måneds nøgle findes. Fjorten virksomheder ser "Upload
dine juli-tal" som var de én måned bagud. Planens punkt 4; informationen
ligger i motorens input; forgreningen mangler stadig.

**equity vs. equity_total** — extract-annual-report/index.ts:271 skriver
fortsat `metrics.equity`; factsAdapters CANONICAL_TO_DANISH kender kun
`equity_total`. Årsrapportens egenkapital er stadig usynlig i dansk-nøgle-
UI'et. (Eget spor: data-rettelse, ikke kun rename — BACKLOG.)

**Balanceposter i alle tolv måneder** — cash/equity kopieres stadig som
ultimo-tal ind i januar-november. Afventer bevidst beslutningen om
årsrapport-reduktion til én december-række.

**Årsrapport blokerer godkendelse af månedsrapporter** + "Erstat gammel data"
soft-sletter hele årsrapporten usagt — produktbeslutning udestår.

**Rådgiver-gaten (abonnenter på rådgiverflader)** — ingen ændringer.
Datalags-gaten fra 13/8 dækker medlemssiden; rådgiverens daglige flader
skelner stadig ikke.

**Månedsdigesten viser overskredne deadlines som kommende** —
send-monthly-digest:209-211: `.lte("deadline", in30Days)` uden nedre grænse.
Filen urørt. Kører den 22. hver måned (bekræftet i prod-cron-opslaget 1/9).

**Rolletjek-punktet i tre edge functions** — advisor-broadcast,
send-monthly-digest, send-slack-feedback-notification er urørte siden
maj/juni (git log). OBS: den præcise fejlbeskrivelse står KUN i mangellisten,
ikke i repoet — den bør genfindes og bogføres før en rettelse. Det synlige
kandidat-problem i alle tre: `.in("role",["advisor","admin"]).maybeSingle()`
— en bruger med begge roller giver to rækker, maybeSingle returnerer null, og
en legitim kalder afvises stille.

**Velkomstbeskeden skriver ugyldig værdi** — send-welcome-message:160 sætter
fortsat `awaiting_reply_from: "member"`; CHECK-constrainten (20260311034115)
tillader kun advisor/company/NULL. Stadig uverificeret i drift — netop fordi
edge-fejlovervågning mangler.

**Delt ulæst-markering + fantom-ulæste** — mark_messages_read (20260420223823)
filtrerer stadig kun `sender_id != caller` og rammer kun typerne
user/system/ai; fire welcome-beskeder har stået ulæste siden marts. Bevidst
samlet i rådgiver-epicen ("ret dem ikke enkeltvis").

**To virksomheder uden række i companies** — datahandling, uafklaret.

**Rallysupport/KJ AUTO (ét-ords-klassificering)** — urørt.

**Budget-tabellen brækker procenterne** — urørt.

**Hele ydeevne-sporet** — AdvisorDashboard henter stadig alt og filtrerer i
JavaScript (sidst rørt 26/8, kun estimat-gates); 500-vinduet består (nu i to
filer); ingen ydeevne-måling, bundle-arbejde eller indeks-gennemgang.

**seen_at på ugekortet er et dødt felt** — weekly_focus har fortsat kun
SELECT-policies (20260329190316) plus service-role; BoardroomViews update
(:1727) rammer 0 rækker uden fejl. Konsekvens der er værd at kende:
fokus-motorens "Ugens fokus er klar" kan aldrig kvitteres væk.

**DEPLOY_STAMP lyver igen** — run-company-agent/index.ts:9 siger stadig
"v5 agent-proposals (2026-08-25)", men funktionen blev omskrevet i #463
(31/8). Stemplet er beviseligt forældet for anden gang.

**To skrivere på ugekortet, ingen afsender-markør** — triggers_fired findes
men bærer trigger-lister, ikke skriver-identitet. Urørt.

**Fjerde kopi af ugeformlen** — AdvisorCompanyOverview.tsx:305-311 har
fortsat sin inline (korrekte) torsdags-formel uden om week.ts.

**Estimat-mærkets forklaring på mobil** — title-attribut; hører fortsat til
mobilgennemgangen, som fortsat ikke er lavet.

**Vercel-appen / gh pr checks kan melde falsk tomt** — målt i dag på
main-HEAD: vercel-check-suiten hænger stadig i `queued` ved siden af en grøn
github-actions-suite. Appen er ikke fjernet; `gh run list --branch` er
fortsat den pålidelige port.

**Ingen klokke når et nyt medlem venter** (rådgiver-siden) — uændret; og
efter dommen 1/9 genindføres medlemmets notifikations-klokke heller ikke i
Hb. To forskellige klokker, begge fraværende, begge bevidst parkeret til
hhv. rådgiver-epicen og nudge-sporet.

**Gentagelses-semantikken** — stadig ubesluttet. forslagEngine-kommentaren
siger det selv: øvrige tools "kan forkastes, men ikke godkendes, før deres
gentagelses-semantik er besluttet".

**Refleksionens udgang** — B5 besluttet, intet bygget.

**Migrering af de 102 milepæle (B9)** — ikke påbegyndt, men mekanikken den
skal bruge (forslag + accept med dato) er nu i drift. /milestones lever
stadig (App.tsx:226) med fem kendte indgående links.

**Tilstandslaget, dagslisten, indholdsmodellen gaflet** — ikke bygget.

**Godkendelsestrinnet (73 PASS-uploads der aldrig blev tal)** — planens
punkt 5, "måling før kode" — målingen er ikke lavet.

**Manglende kernefelt (kan ebt afledes?)** — planens punkt 6, urørt.

**PHILBERTs ventende uploads** — driftshandling i Review Queue, kan ikke
måles herfra; ingen bogføring af at den er taget.

**Fejlovervågning af edge functions** — udestår (se ÆNDRET for
præciseringen). Ingen struktureret logning, restore aldrig afprøvet.

**e-conomic/Dinero/Billy-integrationen** — ikke påbegyndt.

**Gammelt design tilbage**: loginsiden, Indstillinger, admin-fladerne,
rådgivermiljøet, Pulse/Guide — alle urørte. **Huller i Hjemmebane**:
kursusbeskrivelser, søgning, podcast-#-henvisning, forældreløse filer —
urørte. **Under motorhjelmen**: syv domme om medlemsadgang, RLS uden
contract_end_date, verify_jwt-arven, sekvensmotoren, døde DB-kolonner,
ubeviste handouts-skriveveje — urørte. **Idébanken** — urørt.

---

## 5. NYT siden 27/8 — fundet i arbejdet, ikke på listen

**Nye edge functions auto-deployer IKKE** (målt 31/8): `foreslaa-opgave`
svarede 404 efter merge og var først live efter eksplicit udrulning 10:42.
Ændringer i eksisterende funktioner ruller med merge; en NY funktion skal
verificeres i drift før den kaldes fra en flade. Bogført i #458 §6.

**CASCADE-fejlklassen**: koncern-droppets CASCADE åd reactions-SELECT-policien
stille — hullet stod åbent 5/8–31/8. Fejlklasse bogført i SECURITY_BASELINE:
DROP CASCADE skal efterfølges af pg_policies-diff i prod. En fejning fandt
desuden to parser-artefakter (falsk negativ/positiv) der blev manuelt
efterprøvet.

**Prod-cron kunne ikke genskabes fra repoet** (målt 1/9, første fulde
afstemning): ni jobs i cron.job, tre uden repo-modstykke, og ét repo-job
(daily-reflection-nudge) manuelt fjernet i prod. Nu bogført (#473).

**process-notification-emails er formentlig hele mail-kædens ENESTE kørende
planlægning** — et prod-only-job (*/5) som intet i repoet kunne genskabe.
Forsvandt det, holdt al post op med at komme ud. Målt: 692 mails afsendt,
elleve i dead letter. Nu bogført.

**run-weekly-agent kører formentlig aldrig** (nyt fund i DENNE recon):
(a) funktionen er ren `Deno.cron` (run-weekly-agent/index.ts:7), og Deno.cron
eksekveres aldrig på Supabases runtime (fastslået 13/8); (b) cron.job
indeholder intet job for den (ni jobs målt 1/9); (c) mandags-sporet der blev
tilskrevet den ("35 opgaver til 13 virksomheder", agent-forslag-design §3)
skrives reelt af generate-weekly-focus (ai_weekly-skrivevejen,
generate-weekly-focus:554), som ER i cron.job (mandag 06:00). Kræver én
bekræftende måling i prod (fx agent_runs/logs), men alle tre ben peger samme
vej: funktionen er død kode, og BACKLOG-P3-punktet om den bør omskrives.

**notifications.seen_at har to skrivere med hver sin betydning** —
NotificationCenter-åbning OG dispose-triggeren ved rapportsletning. Tallet er
inflateret for rapport-typer og deflateret for alt andet (klokken findes ikke
i Hb-fladerne). Visnings-måling 1/9: chat_reply 90 %, weekly_focus 22 %,
report_reminder 13 %, event_reminder 6 %. Dom 1/9: klokken genindføres ikke —
notifikations-tabellen er i praksis en mail-kø plus et rådgiverværktøj.

**Mail-målingen** (30 dage, 1/9): 138 mails til 13 virksomheder; Limo Group
alene 32; tre virksomheder fik nul (Stadio, Sebastian & Amalie,
Regnskabsvikar). email_send_log har hverken user_id eller sent_at — den
virkende opgørelses-SQL står i docs/nudge-recon.md §6.

**intro-reminderens stempel-fejl**: stemplet sættes FØR afsendelse; Floren
Engros stod stemplet uden mail. Stemplet nulstillet manuelt; KODEN er ikke
rettet — fejlen kan ramme igen.

**nudge-report-no-reflection er forældreløs** efter reflection-slukningen:
ingen kaldere tilbage; dobbelt beskyttet (verify_jwt + dry-run-default).
Kandidat til senere oprydnings-pas sammen med legat-reminder-cron,
send-pulse-reminder og run-weekly-agent — beslutning udestår.

**Chat-designet C1-C13 besluttet og bogført** (docs/chat-design.md): bl.a.
C2 (kvitteringer slettes, også historisk), C3 (session_prep fjernet), C6
(nudging afgøres platform-bredt, må ikke opfindes for chatten alene), C10
(AI-fanens placering måles først), C12 ("henvis til et tal" — eget spor),
C13 (lukket). Emnevælger-fundet: composerens emner skriver reelt ikke noget
medlemmet får glæde af — kontrollen ligner et overblik og er det ikke.

**C2's historiske sletning er gennemført** (1/9): 354
rapportkvitteringer slettet fra messages efter SELECT-før på præcis
det prædikat — 286 uden `kind` fra marts til juni, 66 report_card, 2
ai_analysis. Efter: nul tilbage, elleve emnemærkede menneskebeskeder
urørt, 699 beskeder i alt. Tråden gik fra 53,6 % til 81 % mennesker.
Fire ubehandlede `write_session_prep`-forslag sat til `expired` —
ikke `rejected`, fordi ingen sagde nej; evnen blev fjernet.

**company_review-agentens publikum strammet** (#463): weekly focus er
founder-synligt; en review-kørsel uden medlems-relevant output skal ende
ærligt rød ("rød kørsel kan betyde intet at sige" — kommenteret ved begge
gate-steder).

**Opgave-bestanden målt** (31/8): 72 proposed (14 virksomheder), 63
arve-rækker lukket som `expired` (tavshedens udfald — ikke dismissed/dropped),
10 done, 1 active. Rådgiverens tælling af ubesvarede forslag findes endnu
ikke — og rådgiveren kan ikke se hvad medlemmet svarede (bevidst til
rådgiverfladen som ét spor).

**`<html class="dark">` er hardcodet i index.html** — rodårsagen til sort
dokumentgrund under alle Hb-flader på mobil. Fixet for Hb-skallene (#468,
documentElement-effekt); mønstret er bogført. Gamle AppLayout var beskyttet
af farve-sammenfald, ikke af en højdekæde.

**Kildeværns-mønstret etableret**: tests der læser kildefiler/migrationer og
låser indhold (chat-splittets syv låse, cron-paritetstesterne, deler på
`$job$` så kommentarer ikke kan opfylde assertions). Brugt i #462, #469, #473.

---

## A. EVENTS — kalenderfunktionen

Der findes en fuld event-flade: liste (/events), detaljeside (/events/:id)
med Meet-link i tre faser og deltagerliste, tilmelding/afbud
(event_registrations, ren klient-upsert), påmindelser i to vinduer (7 dage
før til ikke-svarende, dagen før til tilmeldte — notifikation med
priority=important, som også udløser mail), aflysningsbesked, og
forside-sektion med inline-tilmelding.

**Men et medlem kan IKKE lægge et event i sin egen kalender.** Bred grep
over hele repoet på .ics, text/calendar, BEGIN:VCALENDAR, calendar.google,
webcal m.fl.: nul funktionelle hits. Ønsket er bogført som BACKLOG [P4]
"Kalenderlink til events" (13/8) — ikke bygget.

Det der mangler, målt:
- Ingen .ics-generering, intet Google/Outlook-link, ingen kalenderdel i
  nogen mail.
- Der sendes overhovedet INGEN bekræftelse ved tilmelding — hverken mail
  eller notifikation. Det sted en kalenderfil naturligt ville bo, findes ikke.
- Datamodellen kan næsten bære en ics: starts_at/ends_at er timestamptz, men
  ends_at er nullable (UI'et bruger en 90-min-visningsfallback), og der
  findes INTET lokationsfelt — "Online" udledes alene af om meet_url er sat.
  Et fysisk event kan ikke bære en adresse i dag.

## B. COMMUNITY — hvordan opdages et nyt opslag?

**Der findes præcis én push-vej: @-nævnelsen. Alt andet er pull.** Et nyt
opslag uden nævnelser udløser nul notifikationer, nul mails, nul badges, nul
realtime — vejen fra "nogen skrev noget" til "et andet medlem ser det" er at
medlemmet selv besøger forsiden eller /community.

Kanal for kanal, målt i koden:

- **Nyt opslag** → ingenting. Ingen trigger, ingen broadcast-funktion, intet
  kaldsted (CommunityView.tsx:119-126 kalder kun opretTraad +
  notificerNaevnelser).
- **Svar på eget opslag** → notifikation skrives (notify-community-svar, kun
  til trådens forfatter — har man svaret i en tråd, hører man aldrig om de
  næste svar), men priority=info mailes aldrig, OG medlemsskallen har ingen
  klokke — NotificationCenter renderes kun i gamle AppSidebar, som
  medlemsruterne ikke bruger. Notifikationen lander i en tabel ingen læser.
- **@-nævnelse** → notifikation + mail (priority=important). Mailen bruger en
  generisk fallback-skabelon (community_naevnelse findes ikke i
  template-mappet) og kan ikke redigeres i admin. I praksis er denne mail
  DEN ENESTE kanal der beviseligt når et medlem.
- **Reaktion** → ingenting.
- **Forsiden** → "Fra fællesskabet" viser tre tråde (fastgjort først,
  derefter seneste aktivitet). Ingen "nyt siden sidst"-markering.
- **Badge/ulæst** → findes ikke. Bemærkelsesværdigt fund: infrastrukturen ER
  bygget og aldrig taget i brug — tabellen community_visninger og RPC'en
  registrer_community_visning (20260811180000:218-248) har NUL kaldsteder.
  Der registreres ikke engang hvad et medlem har set.
- **Digest** → månedsdigesten indeholder nul community-indhold.
- **Realtime** → ingen subscription på community-tabellerne; en åben fane
  opdaterer sig aldrig selv.

Den lave Community-aktivitet har altså en strukturel komponent: at skrive et
opslag er at tale ind i et rum hvor ingen får at vide at man talte. Enhver
løsning skal jf. C6 afgøres i det platform-brede nudge-spor (og
klokke-dommen 1/9 udelukker den letteste vej — NotificationCenter i
medlemsskallen).

---

## 6. HVAD BLOKERER HVAD

**Kan bygges når som helst** (ingen afhængigheder):
- deriveFocus-forgreningen "aldrig begyndt" (input findes allerede i motoren)
- equity→equity_total (men det er en DATA-rettelse: skriver + historik-UPDATE)
- Månedsdigestens lte-fejl; velkomstbeskedens awaiting_reply_from;
  intro-reminderens stempel-før-afsendelse; DEPLOY_STAMP;
  ugeformel-kopien i AdvisorCompanyOverview; rapportposters sletbarhed
- Events-kalenderlink (.ics/Google) — dog: lokationsfelt mangler i
  datamodellen, og en tilmeldingsbekræftelse (som i dag slet ikke sendes) er
  den naturlige bærer
- Vercel-appens fjernelse (GitHub-indstilling, ikke kode)
- weekly_focus UPDATE-policy for seen_at (lille migration)
- De tolv samtaler og PHILBERT-køen (ikke kode overhovedet)
- Fejlovervågning af edge functions

**Beslutning før kode** (blokeret af Jonas/Morten, ikke af teknik):
- Gentagelses-semantikken → blokerer at agentens write_company_action-forslag
  kan godkendes. Skrivevejen er klar; kun semantikken mangler.
- Indgangsprisen som data (beløb vs. kohorte-felt) → blokerer HELE
  fornyelses-kæden: pris → vinduestilstand → fornyelsesside → betalingsvej,
  i den rækkefølge (fornyelsesordningen §5). Ikrafttræden 10/9 nærmer sig.
- Årsrapport-reduktionen (én december-række) → blokerer balancepost-fixet
  (som ellers ville blive overhalet) og opløser årsrapport-blokerer-måned-
  problemet som biprodukt.
- Månedsrapport-vs-årsrapport-fortrængningen → blokerer "Erstat gammel
  data"-dialogens ærlighed.
- Nudge-formerne (C6: platform-bredt, aldrig chatten alene) → blokerer
  enhver community-opdagelses-kanal og events/rapport-nudging ud over det
  eksisterende.

**Kæder** (A blokerer B):
- **Opgave-modellens rest**: B9-migreringen af de 102 milepæle kan bygges NU
  (mekanikken er i drift) → blokerer /milestones-pensioneringen (sammen med
  de fem indgående links) → som igen rydder digestens milestone-sektion og
  fokus-motorens milestone-punkt. Refleksionens udgang (B5) kan bygges nu.
- **Tilstandslaget** forudsætter opgave-modellen i drift (opfyldt siden 31/8)
  plus rådgiverens opfølgningsdata (ubesvaret-tælling findes ikke endnu).
  Tilstandslaget blokerer: dagslisten, MCP-udvidelsen, rådgiverdesignets
  prioritering og ærlig gamification. Bygges de før, bygges de to gange.
- **Rådgiver-epicen** (P0, eget spor med egen recon): samler splittets anden
  halvdel (CompanyChatPane-Hb), ulæst-begrebet (delt read_at + 500-vindue +
  fantom-ulæste — "ret dem ikke enkeltvis"), rådgiver-klokken,
  abonnent-synligheden på rådgiverflader, dashboard-ydeevnen og
  admin/medlemsliste-konverteringen. Dagslisten hører her, men venter på
  tilstandslaget — resten gør ikke.
- **Fastholdelse/gamification** venter på: opgave-modellen kan nu måle
  gjort/droppet/ikke nået (opfyldt) + tallene ind (IKKE opfyldt: fjorten
  uden ét målt tal). Tal-siden er stadig den bindende begrænsning.
- **Tallene ind** (lag 1) blokerer alt måleligt: KPI'er, rapporter,
  rådgivningsanledninger, gamification, tilstandslagets talside. Selv
  uafhængig af alt andet. Integrations-sporet (e-conomic m.fl.) fjerner
  problemet frem for at formindske det — uafhængigt af de øvrige kæder.
- **Lancerings-GO** (princip 8): hele medlemsrejsen i Hb før noget åbnes —
  chat-medlem er nu lukket; tilbage står loginsiden, Indstillinger,
  Pulse/Guide, Legat og forside-swappen (§2.3) + Akademi-synligheden (§2.8).
  Konvergens.md's fladeregnskab er i øvrigt bagud og bør ajourføres før det
  bruges som facit.
- **Deploy-gæld som tværgående blokering**: nye edge functions auto-deployer
  ikke (målt), frontend kræver Update-klik, migrationer køres manuelt.
  #473-bogføringen afventer sin Lovable-kørsel; C2's historiske sletning
  afventer Jonas' SQL; de historiske fortegns-rækker (11 virksomheder) og de
  tre årgange uden omsætning afventer datahandlinger. Intet af det blokerer
  kode — men alt af det blokerer at "løst i repoet" bliver "sandt i drift".
