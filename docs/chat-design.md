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

### C2 — Systembeskeder ud af tråden

**Forslag:** kvitteringer (`context_type = 'report'`) vises ikke i
beskedstrømmen. De 354 er en logfil blandet ind i en samtale, og
teksten peger selv væk fra chatten.

Åbent: hvor de så hører hjemme. Rapportering har allerede en
leverance-fortælling. Kortet med nøgletal og "Åbn rapportfil" er
brugbart — det er placeringen der er forkert, ikke kortet.

Ikke besluttet: om de slettes historisk eller blot skjules fremad.

### C3 — Session_prep genereres ikke længere

Funktionen bruges ikke (Jonas, 31/8). 102 beskeder — 9,7 % af alt
indhold — produceres til ingen.

**Forslag:** `write_session_prep` fjernes som agent-skrivevej, og
`forslagEngine`s liste over godkendbare skriveveje reduceres
tilsvarende. Eksisterende rækker bliver stående som historik.

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

Åbent: hvad der nudges til, og i hvilken rækkefølge. Grundlaget er
§1-tabellen, men rækkefølgen er en produktbeslutning.

### C7 — Aftaler som udgang, ikke som spørgsmål

"Foreslå opgave" (#455) bliver i rådgiverens flade. Der bygges ingen
automatik der spørger efter en samtale.

Begrundelse: C2 i `docs/opgave-model-design.md` gælder — et forslag er
en anmodning, og anmodninger der stilles rutinemæssigt, ignoreres
rutinemæssigt.

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

**Forslag:** labels rettes til dansk begge steder. Om de to faner
overhovedet er den rigtige struktur, er ikke afgjort — AI-chatten over
egne tal er noget andet end sparring med et menneske, men et medlem
med nul målte måneder har intet at spørge AI'en om.

Åbent.

### C11 — Hvad der IKKE ændres

Rich text, vedhæftninger, reaktioner, redigering (15-minutters vindue
for medlemmer), sletning, pin. Alt sammen fælles kode med rådgiverens
flade, alt sammen i brug.

Ulæst-begrebet røres ikke i dette spor. Syv kodesteder afgør "ulæst" på
hver sin måde (`docs/chat-recon-2.md` §3); det er sit eget arbejde og
hører til rådgiverfladen, hvor de fleste af målerne bor.

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

1. Hvor hører rapportkvitteringerne hjemme, når de forlader tråden
   (C2)? Og skal historikken skjules eller slettes?
2. Hvad nudges der til, i hvilken rækkefølge (C6)?
3. Er to faner den rigtige struktur (C10)?
4. Skal `write_session_prep` fjernes helt, eller blot ikke køres
   (C3)?
