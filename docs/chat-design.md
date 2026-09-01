# Medlemschatten — design

**Status**: forslag. Beslutningerne C1-C11 er ikke truffet.
**Grundlag**: `docs/medlemschat-recon.md`, `docs/chat-recon-2.md`,
`docs/hjemmebane-designsprog.md`,
målingerne 31/8 og et rigtigt samtaleforløb (remm., marts–august).
**Bindinger**: `docs/hjemmebane/konvergens.md` (vedligeholdsregel),
`docs/RAEKKEFOELGE.md` tempo 5.

---

## 1. Hvad chatten er

Målt 31/8, andel af de 34 virksomheder der overhovedet har brugt en
funktion:

| funktion | bruges af |
|---|---|
| **Chat** | **88 %** |
| Rapportering | 56 % |
| Budget | 41 % |
| Refleksion | 29 % |
| KPI-mål | 15 % |
| Aftaler | 9 % |

**Chatten er den eneste funktion et flertal bruger.** For fem
virksomheder er den den eneste berøringsflade der findes:
LineAlmegaard (92 beskeder, nul målte måneder), remm. (61, nul),
Limo Group (23), TuaMea (8), Friends & Fries (3).

Medlemmerne skriver mere end rådgiverne — 52 mod 48 procent — og
længere: 759 tegn i snit mod 407. Det er ikke en udsendelseskanal med
svarmulighed.

## 2. Hvad en samtale er til for

Fastlagt af Jonas 31/8: et medlem har en udfordring, stor eller lille,
og har brug for at spille bolden op ad en rådgiver. **Sparring har
værdi i sig selv.** Det skal ikke nødvendigvis ende i noget.

Det udelukker en tragt-model (samtale → aftale → fuldførelse). En
opgave er en mulig UDGANG, ikke målet.

Konsekvens: produktet må ikke spørge «skal det være en opgave?» efter
hver samtale. Hver gang det spørges om noget der ikke skal være en
opgave, læres spørgsmålet at blive ignoreret.

Chatten skal være god til to ting: at det er let at spille bolden op,
og at svaret er let at finde igen.

## 3. Hvad tråden indeholder

1052 beskeder:

| | beskeder | andel |
|---|---|---|
| `user` — mennesker | 564 | 53,6 % |
| `system · report` — kvitteringer | 354 | 33,7 % |
| `system · session_prep` | 102 | 9,7 % |
| øvrige | 32 | 3,0 % |

**44,4 % er systembeskeder.** Kvitteringerne siger "Ny rapport er klar
i dit dashboard" — de peger væk fra chatten. Session_prep er
rådgiverens forberedelse til en funktion **der ikke bruges** (Jonas,
31/8).

## 4. Spændingen der skal løses

88 % bruger chatten. 15 % bruger KPI-mål. Chatten er dér de kan nås —
og nudging er vigtigere end alt andet (Jonas, 31/8).

Men det var netop systembeskederne der gjorde tråden til støj. En
nudge der ligner en kvittering, bliver behandlet som en kvittering.

**Nudging må ikke bo i beskedstrømmen.**

---

## 5. Beslutninger (forslag, C1-C11)

### C1 — Splittet er en forudsætning, ikke en afslutning

`RAEKKEFOELGE.md` tempo 5 placerer splittet af `CompanyChatPane` i
fase 3 sammen med rådgiverbordet. Det holder ikke: hb-tokens er scoped
til `.theme-hjemmebane`, og medlemschatten kan ikke tale Hjemmebane
inde i samme fil som rådgiverens mørke shadcn-indbakke med 38
`isAdvisor`-forgreninger.

**Forslag:** ren udskillelse FØRST — medlemsdelen ud i egen komponent
under Hb-skallen, rådgiverdelen bliver stående uændret i den gamle
verden. Ingen designændring i den PR. Derefter kan medlemschatten
designes frit, og rådgiverbordet tages samlet senere.

Det er en ændring af tempo 5's rækkefølge og skal bogføres dér.

### C2 — Rapportkvitteringerne ud af tråden

Gælder `context_type = 'report'` — de 354 kvitteringer og
AI-analyse-chippene. IKKE agent-kort eller opgave-forslag, som er
noget nogen skal forholde sig til; session_prep har sit eget punkt
(C3).

De 354 er en logfil blandet ind i en samtale, og teksten peger selv væk
fra chatten.

**Besluttet 31/8:** de slettes, også historisk. En rapport hører til i
Rapportering og KPI'er, ikke i chatten. Kortet med nøgletal og "Åbn
rapportfil" er brugbart — men det er en visning af data, ikke en
begivenhed i en samtale, og de flader ejer den allerede.

Produktionen standses samtidig: `reportCommit.ts` og
`useFinancialAnalysis.ts` skriver dem i dag fra klienten.

**Men det åbner noget andet (Jonas, 31/8):** man skal måske kunne
HENVISE til et tal i chatten. Det er ikke en kvittering vendt om — en
kvittering er systemet der fortæller, en henvisning er et menneske der
peger. Målt eksempel: remm. retyper "Nettoomsætning: 1,38 mio. kr.
(38 % over budget)" i en besked, fordi platformen ikke kan sige det for
ham.

Det er et selvstændigt spor med sin egen recon — se C12.

### C3 — Session_prep genereres ikke længere

Funktionen bruges ikke (Jonas, 31/8). 102 beskeder — 9,7 % af alt
indhold — produceres til ingen.

**Besluttet 31/8: fjernes helt.** `write_session_prep` udgår som
agent-skrivevej, og `forslagEngine`s liste over godkendbare skriveveje
reduceres tilsvarende. Ti procent af alt indhold produceret til en
funktion der ikke bruges, slukkes ikke — det fjernes.

Eksisterende rækker bliver stående som historik.

RLS-carve-out'en fra 31/8 (migration `20260831131200`) bliver stående
uanset — den koster intet.

### C4 — Ét sprog: Hjemmebane

Medlemschatten konverteres til Hb: papir-baggrund, `HbCard`,
`HbSection`, Fraunces i `font-medium` til overskrifter, hairlines,
`rounded-hb`. Evergreen til handlinger; rust får ikke en femte
betydning.

`CommunityComposer` og `CommunityTraadView` er ifølge
designsprog-reconen den nærmeste eksisterende Hb-oversættelse af "skriv
i en tråd". De er IKKE gennemgået, og det er ikke afgjort om de kan
genbruges, tilpasses eller kun tjener som forlæg. En chat-tråd og en
community-tråd er ikke nødvendigvis det samme: den ene er to parter i
et fortroligt forhold, den anden er mange i et offentligt rum.

Afgøres ved recon før C4 bygges.

### C5 — Emnevælgeren fjernes

Der findes ingen emne-kolonne på `messages`. Kontrollen sætter
`context_type` på rådgiverens egne beskeder, er gated på `isAdvisor`,
og medlemmets beskeder får aldrig et emne. Den ligner et overblik og
er det ikke.

**Forslag:** fjernes. Skal indhold kunne findes igen, er det et
selvstændigt spor med sit eget grundlag — ikke en pill-række der
skriver til lokal state.

### C6 — Nudging bor uden for beskedstrømmen

**Forslag:** et fast felt i chatfladen — ikke en besked — der viser
hvad medlemmet mangler at komme i gang med. Én ting ad gangen, samme
princip som "Dine aftaler".

Det skal kunne skelnes fra en besked ved første øjekast. En nudge der
ligner en kvittering, behandles som en kvittering.

**Ikke afgjort her, bevidst (Jonas, 31/8):** nudging skal tænkes ind i
hele platformen og i onboardingen, ikke opfindes for chatten alene. En
nudge i chatten, en anden på forsiden og en tredje i en mail er tre
mekanismer der konkurrerer om den samme opmærksomhed.

Chat-designet fastlægger derfor kun HVOR en nudge må bo (uden for
beskedstrømmen) og hvor mange ad gangen (én). Hvad der nudges til, og
hvordan det hænger sammen med onboarding-sekvensen og forsidens
fokus-kort, hører til et samlet nudge-spor.

Foreløbig observation, ikke en beslutning: rækkefølgen bør formentlig
følge afhængighed frem for tal — uden målte måneder er et budget
meningsløst, og uden budget er KPI-mål tomme.

### C7 — Aftaler som udgang, ikke som spørgsmål

"Foreslå opgave" (#455) bliver i rådgiverens flade. Der bygges ingen
automatik der spørger efter en samtale.

Begrundelse: B6-indvendingen i `docs/opgave-model-design.md` gælder
også her — hver ekstra handling har historisk kostet næsten al
adoption i denne platform. Et forslag er en anmodning, og anmodninger
der stilles rutinemæssigt, ignoreres rutinemæssigt.

Målt eksempel på hvorfor knappen alligevel er rigtig: remm.,
22. juni — likviditetsbudgettet erkendes som manglende, opskrift gives
23. juni, og 20. juli står det stadig ("syntes sgu likviditetsbudgetter
er sværre"). To måneder i en virksomhed hvor 1,23 mio. af omsætningen
ligger i november-december.

### C8 — Overblik hentes, ikke vises

MCP skal op at køre, så en rådgiver kan spørge Claude og få det fulde
billede af en virksomhed (Jonas, 31/8).

**Forslag:** chatten forsøger derfor IKKE at være et dashboard. Ingen
emnefiltre, ingen AI-tematisering, ingen sammenfatninger i tråden.
Overblikket bor i MCP; chatten er samtalen.

Det er en afvisning af "AI der tematiserer chattens indhold" som
selvstændig funktion.

### C9 — Welcome-beskeder rettes

Fire beskeder med `message_type = 'welcome'` kan aldrig markeres som
læst, fordi `mark_messages_read` kun rammer `('user','system','ai')`.
De har stået ulæste siden marts og april.

**Forslag:** producenterne skriver `system` i stedet. Eksisterende
rækker rettes med en migration med før/efter-tal.

Samme fejl rammer `reflection-nudge` og `legat-momentum-reminder`.

### C10 — De to faner

`ChatShell` giver medlemmet "Advisor" (engelsk label på desktop,
"Rådgiver" på mobil) og "Finansiel AI".

**Forslag:** labels rettes til dansk begge steder.

**Retningen er tiltrådt 31/8:** AI-fanen hører formentlig ikke ved
rådgiverchatten. Et medlem med nul målte måneder har intet at spørge
den om, og for dem der har tal, hører den nærmere ved tallene end ved
mennesket.

Men beslutningen kræver grundlag der ikke findes: ingen har målt
hvordan AI-fanen bruges — hvor mange, hvor ofte, hvad der spørges om,
og om spørgsmålene kunne besvares af KPI-fladen. Det skal måles før
fanen flyttes.

### C11 — Hvad der IKKE ændres

Rich text, vedhæftninger, reaktioner, redigering (15-minutters vindue
for medlemmer), sletning, pin. Alt sammen fælles kode med rådgiverens
flade, alt sammen i brug.

Ulæst-begrebet røres ikke i dette spor. Syv kodesteder afgør "ulæst" på
hver sin måde (`docs/chat-recon-2.md` §3); det er sit eget arbejde og
hører til rådgiverfladen, hvor de fleste af målerne bor.

### C12 — Henvis til et tal i chatten

Rejst af Jonas 31/8 som konsekvens af C2.

I dag retyper medlemmer tal platformen allerede kender. remm. skriver
"Nettoomsætning: 1,38 mio. kr. (38 % over budget)" i en besked;
Booking Innovation, BR Roset og Fjeldgaardshop gør det samme i deres
statusopdateringer. Samtalen og tallene lever ved siden af hinanden i
stedet for sammen.

En henvisning er ikke en kvittering. Kvitteringen er systemet der
fortæller noget skete; henvisningen er et menneske der peger på noget
bestemt. Den ene er støj i en samtale, den anden er samtalens indhold.

Ikke afgjort: hvordan man peger (indsætter man et tal, en periode, en
KPI, en graf?), hvad der vises i beskeden, og om henvisningen er
levende (viser tallet som det er nu) eller frosset (som det var da
beskeden blev skrevet). Det sidste er ikke en detalje — et tal der
ændrer sig efter at nogen har kommenteret på det, gør samtalen
uforståelig.

Eget spor med egen recon. Forudsætter at rapporteringen virker for
flere end de 56 % der bruger den i dag.

### C13 — Feedback-knappen genindføres IKKE

**Afgjort 1/9. Præmissen var forkert, og målingen ændrer dommen.**

C13 påstod oprindeligt at chatten mistede feedback-knappen ved
flytningen til Hb-skallen. Det passer ikke: `FeedbackButton.tsx:12-13`
har altid haft `if (isChatRoute) return null`. Knappen har aldrig været
synlig i chatten, og undtagelsen var formentlig bevidst — en flydende
FAB oven på en composer er støj.

Det reelle tab var større og skete tidligere: da forsiden, KPI,
Rapportering, Budget og Handouts GO'ede over i HbMemberShell i august,
forsvandt knappen fra alle medlemmets kerne-flader. I dag ses den kun
på rest-siderne: /milestones, /pulse, /settings, /guide, /legat.

**Men målingen 1/9 vælter genindførelsen:**

| måned | stykker |
|---|---|
| marts 2026 | 10 |
| april 2026 | 1 |
| maj 2026 | 1 |
| juni–august | 0 |

Tolv stykker i alt, intet siden maj. Knappen holdt op med at blive
brugt tre måneder FØR GO'erne fjernede den. GO'erne var ikke årsagen —
de fjernede en knap ingen længere trykkede på.

Til sammenligning: 564 menneskebeskeder i chatten. Feedback-fladen er
ikke en manglende knap, den er en kanal der har tabt til en bedre.

En flydende knap der ikke er brugt i fire måneder, bliver ikke brugt
igen af at flytte til en ny skal. At genindføre den ville være arbejde
der ser ud som fremskridt.

**Hvis I vil høre mere fra medlemmerne**, er svaret ikke en knap. Det
er at spørge i et øjeblik hvor nogen lige har gjort noget — ét tryk,
valgfrit, i fuldførelsesøjeblikket. Det hører til nudge-sporet (C6),
ikke her.

Kæden bag knappen er i øvrigt hel og fungerer: klient-insert i
`feedback`, Slack-notifikation, admin-kø på `/admin/feedback`. Den
skal ikke rives ned — de gamle rest-sider bærer den fortsat, og
modtagerfladen læser stadig.

**Dertil to mindre fra flytningen, bogført så de ikke opdages som
fejl:** rådgiverens exit-banner fra "Se som medlem" mangler på /chat
(hører i rådgiver-epicen); loading-grenen ligger fortsat i AppLayout og
deles mellem roller, så medlemmet ser et kort glimt af den gamle skal
under indlæsning; og abonnent-muren får main'ens py-10/14 oven i sin
egen py-12, indtil dens udtryk konverteres.

---

## 6. Konvergens (påkrævet af konvergens.md)

**(a) Hvad findes i forvejen på fladen?**
`/chat` → `ChatShell` → `CompanyChatPane` (2141 linjer) for både
medlem og rådgiver, plus `FinancialAIChat` på medlemmets anden fane.
Fladeregnskabet fører `/chat` som GAMMEL med skæbnen
"Konverteres-før-lancering".

**(b) Hvordan bygges der sammen med det?**
Ved udskillelse (C1), ikke ved omskrivning. Rådgiverdelen bliver i den
gamle verden indtil rådgiverfladen tages samlet. `CommunityComposer`
og `CommunityTraadView` genbruges som Hb-forlæg for tråd og composer.

**(c) Hvilken dobbelthed afvikles — eller skabes?**
Afvikles: medlemschatten forlader det gamle designsprog.
Skabes midlertidigt: to chatkomponenter i to sprog, indtil
rådgiverfladen konverteres. Afviklingen bogføres i `konvergens.md` §2
sammen med resten af rådgiverfladen.

**(d) Hvad er admin-modstykket?**
Intet. Chatten har ingen redaktionel administration — der er intet
indhold at kuratere, ingen skabeloner at vedligeholde. Rådgiverens
indbakke er ikke et admin-spejl, men en arbejdsflade, og den hører i
rådgiver-epicen.

---

## 7. Åbne spørgsmål

1. Hvordan peger man på et tal i chatten, og er henvisningen levende
   eller frosset (C12)?
2. Hvordan bruges AI-fanen i dag, og hvor hører den hjemme (C10)?
3. Hvad nudges der til på tværs af platform, forside, chat og
   onboarding (C6) — eget spor.

Besvaret 31/8: kvitteringerne slettes (C2), session_prep fjernes
helt (C3). Afgjort 1/9: feedback-knappen genindføres ikke (C13).
