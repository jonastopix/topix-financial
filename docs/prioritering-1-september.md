# Prioritering — 1. september 2026

Truffet af Jonas 1/9 på grundlag af `docs/status-1-september.md`.
Afløser rækkefølgen i mangellisten af 27. august.

Dette er et argument for en rækkefølge, ikke en liste. Hvert punkt
står der fordi noget andet afhænger af det, har en dato, eller bløder
nu. Er begrundelsen forkert, skal rækkefølgen ændres.

---

## Det vigtigste fund er ikke teknisk

**De to største blokeringer er beslutninger der koster nul
udviklingstid.**

**Indgangsprisen som data.** Blokerer hele fornyelseskæden: pris →
vinduestilstand → fornyelsesside → betalingsvej. Fire led i den
rækkefølge; intet kan bygges før beslutningen. Ordningen træder i
kraft 10. september.

**Nudge-formen.** Blokerer Community-opdagelse, events-påmindelser og
onboarding-sekvensen. C6 i `docs/chat-design.md` siger udtrykkeligt at
den ikke må opfindes for én flade ad gangen — så alle tre står stille
til formen er afgjort.

Hver dag de ikke er truffet, står syv spor stille. Det er billigere at
træffe dem forkert og rette end at vente.

---

## Rækkefølgen

### 1 · Fornyelseskæden

Har en dato og er omsætning. Tre virksomheder udløber 1., 5. og 7.
september; kun LineAlmegaard har en beslutning registreret. PHILBERT
(29/9) og Doggybed (13/10) skal afgøres inden ordningens ikrafttræden
10/9.

Rækkefølgen inden for sporet er fastlagt i
`docs/fornyelsesordningen.md` §5: indgangsprisen som data →
fjortendagesvinduet som tilstand i motoren → fornyelsessiden →
betalingsvejen. Kun det første er en beslutning; resten er kode der
venter på den.

Husk den bærende regel (§1): kommunikation kun ved «tilbyd». Alt andet
er tavshed indtil udløb.

### 2 · Nudge-formen som designdokument

Ikke kode. Ét dokument der afgør hvor en nudge må bo, hvor mange ad
gangen, og hvordan de fire eksisterende mekanismer afstemmes.

Grundlaget er `docs/nudge-recon.md`. Det centrale fund: et medlem uden
refleksion kunne før få fire udtryk for samme ting, og ingen mekanisme
kender de andres eksistens — tre afsendere med hver sin kvote og
dedup. Og ingen måler virkningen: der findes intet der kobler «en
påmindelse sendt» til «det den bad om, gjort».

To domme er allerede truffet og skal stå: klokken genindføres ikke
(1/9), og feedback-knappen genindføres ikke (C13). Begge af samme
grund: en kanal der kun virker når brugeren allerede er på vej, er
ikke en nudge.

Og mere post er ikke svaret. Målt: 138 mails til tretten virksomheder
der aldrig har uploadet. Limo Group alene har fået 32 siden juni og
skriver flittigt i chatten uden at rapportere.

### 3 · Community-opdagelse — LØST 3/9 (#576, #577)

**LØST 3/9 eftermiddag, uden om nudge-formen (punkt 2):** et nyt
opslag udløser nu en notifikation til alle med adgang (`important`, så
den eksisterende mailkæde sender efter 15 min med portræt, navn,
virksomhed og uddrag), og forsidens «Fra fællesskabet» giver det nyeste
opslag hovedhistorie-vægt. Målingen der gav retningen (seks tråde, det
mest sete opslag set af fire ud af 26) og det åbne (medlemmerne som
sidebar, reaktionsknappen, fravalgsnøgle) står i
`docs/community-design.md`. Teksten nedenfor er tilstanden 1/9.

Billigst værdi på hele listen. Fladen findes, indholdet findes.

Målt: der findes præcis én push-vej, @-nævnelsen. Et nyt opslag
udløser ingenting — ingen notifikation, ingen mail, intet badge, ingen
realtime. Og infrastrukturen til at måle hvad et medlem har set er
bygget og har nul kaldesteder: `community_visninger` og
`registrer_community_visning`.

At skrive et opslag er i dag at tale ind i et rum hvor ingen får at
vide at man talte.

Blokeret af punkt 2.

### 4 · Events: bekræftelse, kalender, lokation

I den rækkefølge.

Bekræftelsen først, fordi der i dag slet ikke sendes noget ved
tilmelding — hverken mail eller notifikation. Det er stedet en
kalenderfil hører hjemme, og det er mærkeligt at tilmelde sig noget og
ikke høre fra nogen.

Derefter `.ics` og kalenderlink. Og lokationsfeltet, som mangler helt:
et fysisk event kan i dag ikke bære en adresse — «Online» udledes
alene af om `meet_url` er sat.

### 5 · Milepælene ud

B9-migreringen kan bygges nu; mekanikken den skal bruge — forslag med
accept og dato — har været i drift siden 31/8.

Derefter kan `/milestones` pensioneres, når de fem indgående links er
håndteret: `PulseCheckinModal`, `LegatDashboard`, `Guide`,
`AppLayout`, `AppSidebar`. Det rydder samtidig digestens
milestone-sektion og fokus-motorens milestone-punkt.

De 102 milepæle migreres ikke som data. De præsenteres som forslag —
modellens første anvendelse, ikke en migration. Tager nogen ikke
stilling til deres egne gamle mål, er det svaret (B9).

### 6 · Rådgiverfladen som ét epic

Stor, gæld, og eget spor med egen recon. Samler: splittets anden
halvdel (CompanyChatPane til Hb), ulæst-begrebet (delt `read_at`,
500-vinduet, fantom-ulæste — ret dem ikke enkeltvis), rådgiver-klokken
når et nyt medlem venter, abonnent-synligheden på rådgiverflader,
dashboard-ydeevnen og admin/medlemsliste-konverteringen.

Dagslisten hører her, men venter på tilstandslaget. Resten gør ikke.

---

## Fire små ting undervejs

Bløder dagligt, blokerer intet:

**Intro-påmindelsens stempel** sættes før afsendelse. Floren Engros
stod som mindet uden at have fået noget (rettet manuelt 1/9; koden er
uændret).

**`weekly_focus.seen_at`** er et dødt felt — ingen UPDATE-politik, så
BoardroomViews opdatering rammer nul rækker uden at fejle. «Ugens
fokus er klar» kan aldrig kvitteres væk og står på forsiden for evigt.

**`deriveFocus` kender ikke «aldrig begyndt».** Fjorten virksomheder
får at vide at de er én måned bagud. Informationen ligger allerede i
motorens input; forgreningen mangler.

**`DEPLOY_STAMP` lyver igen** — anden gang. Stemplet findes netop for
at kunne se hvad der kører.

---

## Hvad der er fravalgt, og hvorfor

**Den lange hale.** Ugeformel-kopien i AdvisorCompanyOverview,
budget-tabellens procenter, estimat-mærket på mobil. Reelle, men de
blokerer intet og koster ingen noget.

**Aktiveringen som kodeopgave.** Fjorten uden ét målt tal er stadig
den bindende begrænsning for alt måleligt — KPI'er, rapporter,
rådgivningsanledninger, gamification, tilstandslagets talside.

Men halvdelen af løsningen er ikke kode: det er tolv samtaler, og fem
af dem har ikke været inde siden foråret, så ingen forsideændring når
dem. Den anden halvdel er e-conomic-integrationen, som fjerner
handlingen frem for at minde om den. Ingen af delene er en PR.

**Tilstandslaget.** Forudsætter opgave-modellen i drift (opfyldt) plus
rådgiverens opfølgningsdata (findes ikke endnu). Blokerer dagslisten,
MCP-udvidelsen, rådgiverdesignets prioritering og ærlig gamification.
Bygges de før, bygges de to gange — men tilstandslaget selv haster
ikke før rådgiver-epicen.
