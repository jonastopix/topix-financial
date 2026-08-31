# Opgave-modellen og chatten — 31. august 2026

Fem PR'er (#453–#457). Kæden fra chat til forpligtelse er hel og bevist
i drift.

## 1. Hvad der virker nu

**Medlemmet kan svare på et forslag.** Fokus-kortet gav knapper i #453,
men de lå foldet sammen bag en pil, hvor et forslag aldrig bliver set.
Sektionen "Dine aftaler" (#454) står nu under fokus-kortet: alle aktive
opgaver med forfaldne øverst, og ÉT forslag.

Ét forslag, ikke ti. Ti forslag er ikke ti muligheder, det er en liste
man scroller forbi. Målingen bag: 102 milestones med 8 % fuldførelse
mod handout-løftestængernes 74 %, hvor der er ét sted det bliver til
noget.

**Rådgiveren kan foreslå fra chatten** (#455). Ny producent på den
beviste skrivevej: `source_type: 'advisor'`, tredive dages frist (B10),
`proposed_by` sat, ingen dato — B6 siger at datoen tilhører den der
forpligter sig.

**Første registrerede aftale i platformens levetid**, 31/8 10:06 UTC:
Topix, "Afslut handout for 'bogholderi'", frist 4. september. B1 og B6
lukket i drift.

## 2. Målt i drift

| tilstand | rækker | note |
|---|---|---|
| `proposed` | 72 | 24/8–31/8, 14 virksomheder |
| `expired` | 63 | arven, lukket 31/8 |
| `done` | 10 | fra før modellen |
| `active` | 1 | den første aftale |

De 63 arve-rækker (april–23. august) var `open` uden nogen vej til at
besvare dem. De blev lukket som `expired` — ikke `dismissed`, som er et
aktivt nej, og ikke `dropped`, som er et valg. Ingen har sagt noget;
de kunne ikke. `expired` er tavshedens udfald, og rækkerne forbliver
tællelige for tilstandslaget.

## 3. Rækkefølgen af forslag

Kilden afgør først, i den rang B10 allerede har fastlagt gennem
udløbsfristerne: `advisor` (30 dage) → `reflection` (21) →
`ai_weekly`/`agent` (14). Derefter prioritet, derefter ældste
`created_at` inden for samme kilde og prioritet.

Uden kilderangen stod rådgiverens forslag i kø bag et fem dage gammelt
AI-gæt. En rådgiver har brugt tid på sit forslag, og den vurdering skal
afspejles dér hvor medlemmet ser den.

## 4. Chatten — hvad målingen viste

1052 beskeder på tværs af platformen:

| | beskeder | andel |
|---|---|---|
| `user` (mennesker) | 564 | 53,6 % |
| `system · report` | 354 | 33,7 % |
| `system · session_prep` | 102 | 9,7 % |
| øvrige | 32 | 3,0 % |

Systembeskeder er **44,4 %**. Mangellistens tal holder.

**Hver tredje besked er en rapportkvittering** der peger væk fra
chatten: "Ny rapport er klar i dit dashboard". Det er en logfil blandet
ind i en samtale.

**Emnevælgeren skriver ikke til databasen.** Der findes ingen
emne-kolonne på `messages`. Composerens emner (Generelt, Rapport,
Handout, Milestone, Budget) sættes som `context_type` på rådgiverens
egne beskeder — men de er gated på `isAdvisor`, og medlemmets beskeder
får aldrig et emne. Kontrollen ligner et overblik og er det ikke.

**Fire `welcome`-beskeder kan aldrig markeres som læst**, fordi
`mark_messages_read` kun rammer `('user','system','ai')`. De har stået
ulæste siden marts og april.

## 5. Fortrolighedshullet — lukket

`session_prep` er rådgiverens forberedelse, skrevet med den
udtrykkelige forudsætning at founderen ikke ser den. Beskyttelsen var
ét klient-filter; RLS på `messages` er company-scoped, ikke rolle- eller
typescoped, så rækkerne blev hentet ned i medlemmets browser og skjult
i renderingen.

Målt som medlemmet selv, i en transaktion der blev rullet tilbage: et
medlem hos ANLA GLAS kunne hente **18 af 44 beskeder** i sin egen
samtale. Efter politikken: 26 synlige, nul session_prep.

Se `supabase/SECURITY_BASELINE.md` og migration
`20260831131200_session_prep_rls.sql`.

## 6. Nye edge functions auto-deployer IKKE

`foreslaa-opgave` blev merget i #455 og svarede **404** ved første kald.
Ændringer i eksisterende funktioner ruller med et merge; en helt ny
funktion skal rulles ud eksplicit via build-chatten.

Målt: endpointet svarede 404 indtil funktionen blev rullet ud
eksplicit 10:42 UTC. Om det gælder ENHVER ny funktion, eller om noget
andet var på spil, er ikke afgjort — men antagelsen om auto-deploy
holder ikke uprøvet for nye funktioner, og en ny funktion skal derfor
verificeres i drift før den kaldes fra en flade.

## 7. Påstande der er trukket tilbage

- «opgaveEngine har nul kaldere uden for tests» (chat-recon-2, 24/8) —
  forældet samme aften. Fire edge functions, spejl i `_shared` med
  paritetstest, og `forslagFlade.ts` findes.
- «BoardroomView læser kun `status = 'open'`» — rettet i #422 (24/8).
  Filteret medtager `proposed` og `active`.
- «Udløbsvarsel og afskedsmail er bygget og bevist» (mangellisten) —
  gælder beslutningsmotoren `fornyelse.ts`, ikke mails. Der findes
  ingen varsels- eller afskedsmail i repoet.

## 8. Åbent

**Udløbs-cron'en (B8)** findes ikke. Første portion forslag udløber
7. september. Filtreringen på læsesiden gør at medlemmet ikke ser dem,
men rækkerne bliver liggende som `proposed` for evigt, og rådgiverens
tælling af ubesvarede forslag findes heller ikke endnu.

**Rådgiveren kan ikke se hvad medlemmet svarede.** Man kan foreslå,
men ikke følge op. Tages sammen med resten af rådgiverfladen, som er
ét produkt og ikke skal bygges stykvis.

**`/milestones`** pensioneres, når de fem levende links er håndteret:
`PulseCheckinModal`, `LegatDashboard`, `Guide`, `AppLayout`,
`AppSidebar`.

**Chat-redesignet for medlemmet.** Grundlaget er målingen i §4 og en
recon af medlemsfladen fra 31/8, som ligger i `~/Downloads/` og IKKE i
repoet — den skal committes, eller dens fund skrives ind her, før nogen
bygger på den. Det samme gælder dagens øvrige recon-noter om
forslagsfladen, koblingen af årsrapport-motoren og skrivevejen.

Hovedfundet derfra, så det ikke går tabt: medlemmets og rådgiverens
chat deler hver eneste linje i `CompanyChatPane` (38 forgreninger på
`isAdvisor`), men der findes ni rent medlemsvendte steder der kan
ændres uden at røre forgreningerne eller splitte filen — ChatShells
medlemsgren og fane-labels, abonnent-muren, medlems-headeren,
medlems-tomtilstanden, «Læst»-kvitteringen, afsendernavnet i bobler,
session_prep-filteret og composer-placeholderen.
