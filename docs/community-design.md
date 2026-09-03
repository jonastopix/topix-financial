# Community — fra Circle til et rum hvor man ser hinanden

**DESIGNDOKUMENT MED BOGFØRING.** Oprettet 3. september 2026 eftermiddag,
mens Community flyttes fra Circle (Jonas 3/9). §1–3 er grundlaget og
målingen der gav retningen; §4–6 bogfører hvad der er bygget (#576,
#577); §7 er et fund der ændrer en plan; §8 er det åbne. Samme regel som
`docs/indgangen-design.md`: hver påstand er enten målt med kilde, eller
mærket som ikke målt/åben. Linjetal er fra `main` efter #577
(`a0a21bd8`).

Baggrundsreconerne ligger uden for repoet og skal genskabes hvis de
bruges: `~/Downloads/recon-community-notifikationer.md`,
`recon-opslagsmail.md`, `recon-forsidesektionen.md` (alle 3/9).

## 1. Hvad Community er i koden

Målt i repoet:

- **Datamodellen** (`20260811140000_community.sql`, `20260811190000`):
  `community_traade` (titel, `indhold` = ren tekst, `indhold_json` =
  Tiptap-dokument, status aktiv/skjult/slettet, fastgjort, tællere),
  `community_svar` (ét niveau), `community_reaktioner` (kun `like`, én
  pr. bruger pr. objekt), `community_visninger` (én række pr. bruger pr.
  tråd — «hvor mange har set», ikke hvor mange gange).
- **`indhold` er ren tekst ved skrivning**: skrive-RPC'erne sætter
  `indhold = community_json_til_tekst(p_indhold_json)`
  (`20260812190000:41-89`): text-noder, `@navn` for nævnelser, `#titel`
  for henvisninger; billeder og filer bidrager med intet. Det er derfor
  uddraget i mail og på forsiden kan laves uden Tiptap.
- **Adgangsdommen** er `har_aktivt_medlemskab(uid)` (`20260811160000:26-42`,
  fail-closed: mindst én ikke-legat-virksomhed med `contract_end_date`
  i fremtiden) ELLER `has_role(uid, 'advisor')`. Samme to prædikater i
  RLS, i læse-RPC'erne og i `get_community_medlemmer`
  (`20260812150000:54-71`).
- **Fladen**: `/community` er feedet (`CommunityView.tsx`, én `HbSection`
  i fuld bredde, `:147-183`), `/community/:id` er tråden
  (`CommunityTraadView.tsx`). Reaktionsknappen findes KUN i tråden
  (`:402` på tråden, `:474` på svar) — ingen kalder `saetReaktion` andre
  steder.
- **Notifikationer før 3/9**: svar → trådens forfatter (`community_svar`,
  `info`, aldrig mail); @-nævnelse → den nævnte (`community_naevnelse`,
  `important`, mail efter 15 min). Et nyt opslag udløste INTET
  (prioritering-1-september §3: «at tale ind i et rum hvor ingen får at
  vide at man talte»).

## 2. Målt i produktion 3/9 — det der gav retningen

Målt af Jonas i Lovables SQL editor 3/9 (ikke reproducerbart fra
repoet; SQL'en til at måle igen står i §9):

- **Seks tråde i alt**, alle inden for 30 dage, én i den seneste uge.
  **To svar.** Jonas har skrevet fire af de seks; Ole Holdgaard og Sarah
  Jensby Fjeldgaard har skrevet hver ét.
- **26 brugere har community-adgang, 3 rådgivere.**
- **Visningerne er tallet der betyder noget:** «Fjeldgaardshop.dk Q4» er
  set af FIRE, «Hvad arbejder du med lige nu?» af TRE — ud af 26. De tre
  rigtige opslag er 495–824 tegn: ordentlige indlæg, ikke enlinjere.
- Nodetyper i `indhold_json` på tværs af de seks: doc, paragraph, text,
  bold, italic, link, image, naevnelse. Ét af seks opslag har et billede.

**Slutningen:** folk svarer ikke, fordi de aldrig ser opslagene. Det er
ikke indholdet der mangler — det er at nogen får at vide at det findes.
Derfor to ting, i den rækkefølge: en mail når der kommer et opslag
(§4), og vægt på forsiden (§6).

## 3. Jonas' retning 3/9

«En mail hvor du kan se en del af opslaget, og gå ind og få vist mere,
samt se hvem der har slået opslaget op — den gode oplevelse, som
trigger folk til at interagere.»

Og om forsiden: sektionen var «tam — det skal lave noget mere larm, så
folk får lyst til at bruge Community».

## 4. Opslagsmailen — bygget 3/9 (#576)

Merget til main som `4701b50a`; edge functions auto-deployer fra merge,
og Jonas bogfører 3/9 at `notify-community-opslag` og
`send-notification-email` er deployet sammen. Den ene `src/`-ændring
(kaldet fra `CommunityView`) følger frontend-kanalen (Update-klik) —
ikke særskilt verificeret her.

### Udløseren

`supabase/functions/notify-community-opslag/index.ts` (Bucket A,
`verify_jwt = true` i `config.toml`). Samme form som
`notify-community-naevnelse`: authenticateUser → tråden slås op med
KALDERENS klient (RLS gater; ikke aktiv → `{ notificeret: 0 }`) →
modtagere → først derefter service-role.

- **Modtagerdommen er GENBRUGT, ikke skrevet på ny:**
  `get_community_medlemmer()` med kalderens klient. Dens WHERE er
  nøjagtig nævnelsesfunktionens to prædikater — `har_aktivt_medlemskab`
  ELLER `has_role(advisor)` (`notify-community-naevnelse:147-162` pr.
  person; `20260812150000:54-71` i ét SQL-kald over alle profiler).
- **Undtaget:** forfatteren selv, og de @-nævnte (de får nævnelsen —
  to beskeder for samme handling er støj, samme begrundelse som
  nævnelsesfunktionen giver for trådens forfatter). Rekursionen der
  finder de nævnte er en KOPI i `_shared/communityNaevnte.ts`, fordi
  nævnelsesfunktionen ikke måtte røres.
- **Notifikationen:** type `community_opslag`, `priority: "important"`
  (så den eksisterende mailkæde sender efter 15 minutter), title
  «{navn} har skrevet et nyt opslag», body = trådens titel, deep link
  `/community/{id}`, `reference_type community_traad`, `reference_id` =
  tråden. **Én `dedup_key` pr. tråd** (`community_opslag:{traadId}`),
  unik pr. (user_id, dedup_key) — kaldes funktionen igen for samme
  tråd, får ingen to beskeder.
- **Har man set opslaget imens, sendes ingen mail:** mailkæden springer
  rækker med `seen_at` over (`send-notification-email`, kriteriet
  `seen_at IS NULL`). Rådgivere får aldrig mail (eksisterende regel).
- Kaldes fra `CommunityView.tsx` lige efter `notificerNaevnelser`, via
  `notificerNytOpslag` i `communityApi.ts` — bivirkning der aldrig
  kaster og ikke kan vælte opslaget.

### Mailen bygges af TRÅDEN, ikke af title/body

`send-notification-email` har en gren for `community_opslag`: den
henter tråd (`community_traade`, kun `status = 'aktiv'`), forfatterens
profil (`full_name`, `avatar_url`) og virksomhed (`company_members` →
`companies.name`, ældste medlemskab først som `get_community_medlemmer`)
via `reference_id` — FRISKT ved afsendelse. En tråd der er blevet skjult
eller slettet i mellemtiden disposes (`email_sent_at` sættes, ingen
mail), som slettede rapporter.

Mailen (`_shared/opslagsMail.ts`, ren funktion, testet i
`src/lib/__tests__/opslagsMail.test.ts`): husets mailfamilie (520 px,
#133332-header med #27AE82-linje, Manrope), eyebrow «Nyt opslag i
Community» i rust, forfatterblok med portræt (`<img>` fra den
OFFENTLIGE avatars-bucket, ellers en initial-cirkel), navn (fallback
«Et medlem») og virksomhed, titlen, uddraget, «Der er mere i opslaget»
når der er klippet, knappen «Læs opslaget» og fodens «Administrer
notifikationer». Første mail i huset med et billede (målt 3/9: ingen
anden mail havde `<img>`). Mailen har en rigtig tekstversion — de
andre har kun emnet.

**Uddraget:** 280 tegn og højst tre sætninger. Hele sætninger tages med
så længe de passer; passer den første ikke, klippes ved sidste
mellemrum med «…» — aldrig midt i et ord. 280 fordi tekstspalten er
~456 px i 14 px ≈ 60 tegn pr. linje, altså 4–5 linjer: nok til at
fornemme emnet, kort nok til at knappen stadig har et ærinde. En
forkortelse som «kr.» tæller som sætningsgrænse — det gør kun uddraget
kortere.

## 5. Escaping-rettelsen — den vigtigste del af #576

**Skal stå selv om resten forsvinder.**

Målt 3/9: `send-notification-email` lagde `title` og `body` ind som RÅ
HTML i BEGGE render-stier — `buildEmailHtml` (`${title}`, `${body}`) og
DB-skabelonens pladsholdere (`{{body}}`, `{{title}}` via
`String.replace`). Ingen skriver i huset sender bevidst HTML (ingen `<`
i nogen title/body-streng), men flere bærer allerede brugerskrevet
tekst: trådtitlen i `community_naevnelse`, rådgiverens tekst i
`advisor_broadcast` (120 tegn), aflysningsbegrundelsen i
`event_cancelled`. Et medlem kunne sende HTML ind i alle nævntes
indbakker gennem en trådtitel.

Rettet: én escaper i `_shared/htmlEscape.ts` (`&`, `<`, `>`, `"`, `'`;
varianten med `\n` → `<br>` til body). Begge stier escaper nu title og
body; DB-skabelonens erstatning bruger funktions-replacer, så `$&` i
teksten heller ikke tolkes som replace-mønster. Emnet er en mail-header
og escapes ikke. Gælder alle ti notifikationstyper mailkæden kender
(de ni i `EMAIL_SUBJECTS` + `community_opslag`) og alle andre typer der
rammer den samme kode. Guard-test:
`src/lib/__tests__/sendNotificationEmail.escaping.guard.test.ts` læser
kilden og fejler hvis en rå indsættelse kommer tilbage.

Ikke rørt: `indgangsMail.ts` har sin egen private escaper (escapede i
forvejen); `send-monthly-digest` bærer en kopi af `buildEmailHtml` —
IKKE rettet i #576 (dens body er kodetekst, ikke brugertekst; åbent
som konsekvens, se §8).

## 6. Forsidesektionen «Fra fællesskabet» — bygget 3/9 (#577)

Merget som `a0a21bd8`; kun `src/` → kræver Update-klik (Jonas
bogfører deployet 3/9).

Før: tre ENS rammeløse rækker uden vægt. Nu (`forsideOpslag.ts` +
`FremhaevetOpslag` i `BoardroomView.tsx:180-`): det nyeste opslag får
husets hovedhistorie-form fra «Fra os til dig» — det eneste hvide kort
(`HbCard`), portræt 72 px (initial-cirkel uden avatar), titlen i
editorial, uddraget, svar og reaktioner i metalinjen, «Læs opslaget» —
og de to næste bliver rolige rækker som før (`ANTAL_RAEKKER = 2`).

**Fremhævet er det SENEST OPRETTEDE, ikke feedets øverste**
(`forsideOpslag.ts:16-22`): feedet sorterer fastgjorte først og derefter
på seneste aktivitet, så et gammelt opslag med et nyt svar ville stå
der; forsidens ærinde er at vise at der sker NOGET NYT. Rækkerne under
kortet følger feedets egen orden.

**Billede** vises når opslaget har et (`foersteBilledsti(indhold_json)`),
hentet med samme query-nøgle som trådsiden
(`["community", "billede", path]`, `BoardroomView.tsx:150`) — signeret
URL fra den private bucket, ingen ny vej.

**Ingen ny forespørgsel:** feedet (`get_community_feed`) returnerede
allerede `indhold_json` og reaktionstallene (kolonnesættet siden
`20260812090000`, kroppene i `20260812180000`). Den forældede kommentar
i `communityApi.ts` («returnerer det IKKE endnu») er rettet i #577.

**Uddraget på forsiden** er en ordret kopi af mailens motor i
`src/lib/hjemmebane/uddrag.ts` (src/lib er kanonisk, `_shared` spejlet
— husets regel), med en paritetstest der kører samme input gennem
begge. Mailen importerer endnu ikke herfra (åbent, §8).

## 7. Fund 3/9 — «Præsentér dig selv» findes allerede

Jonas ville have et tjeklistepunkt «præsentér dig for netværket» og en
præsentation som eget spor i Community. Målt: **Netværket ER
præsentationen.**

- `member_profiles` bærer «Det kan du spørge mig om» (`ask_me_about`,
  400 tegn i `Settings.tsx:1031-1037`), «Det arbejder jeg med lige nu»
  (`working_on`, 200 tegn, `:1048`, med friskhedsstempel
  `working_on_updated_at`), kompetence-tags (`expertise`), LinkedIn og
  website.
- Migrationen `20260810200000` bogfører designvalget ordret: «Et netværk
  bruges kun, hvis man ved hvem man skal SPØRGE — ikke hvem folk er.
  "Bio" beskriver identitet; de nye felter beskriver erfaring.» Et
  bio-felt fandtes og blev DROPPET bevidst 10/8 (indholdet flyttet til
  `ask_me_about`).
- Tjeklistens punkt «Din profil» (`src/lib/onboardingTjekliste.ts:185-192`)
  kræver netop billede OG `ask_me_about` («Et billede, og hvad de andre
  kan spørge dig om»).

Så funktionen findes; et nyt tjeklistepunkt ville være en dublet. Det
der mangler er at gøre præsentationen TIL STEDE i Community (§8).

## 8. Åbent

### Medlemmerne i Community — IKKE BYGGET

Jonas 3/9, ordret: «præsentation af sig selv skal ligge som en sidebar
i sig selv inde i Community, så det ikke bare larmer i et langt feed og
forsvinder — for så kan man ikke finde tilbage til hinanden.»

Målt: `/community` er ÉN kolonne — `HbSection` er fuldbredde uden
side-slot (`HbSection.tsx:19-42`: eyebrow, titel, link, children); det
eneste tokolonne-layout i Hjemmebane er skallens egen
sidebar/indhold-deling (`HbMemberShell.tsx:195-215`). Netværkets data og
kort findes: `listMemberDirectory` (`memberProfile.ts:39`) og
`ProfileCard` i `MemberDirectoryView.tsx:40` — den sidste er IKKE
eksporteret. Kræver et nyt layout i indholdskolonnen.

### Reaktionsknappen findes kun inde i tråden

`CommunityTraadView.tsx:402` (tråd) og `:474` (svar). Man kan ikke like
fra feedet eller forsiden — den letteste form for interaktion kræver at
man klikker sig ind. Observation fra reconen, ikke besluttet.

### Ingen fravalgsnøgle for Community

`profiles.notification_email_prefs` kender `action_required`,
`important`, `report_reminders`, `monthly_digest`, `pulse_reminders`.
En opslagsmail følger «Opdateringer» (`important`) sammen med alt
andet — Settings-fanens tekst («Svar fra rådgiver, rapport behandlet,
ny AI-analyse klar») nævner den ikke. Dagskvoten på 5 mails gælder.

### Følgevirkninger af #576/#577, ikke besluttet

- `send-monthly-digest` bærer sin egen kopi af `buildEmailHtml` uden
  escaping. Dens body er kodetekst i dag.
- Uddragsmotoren findes to steder (mailens `_shared/opslagsMail.ts` og
  `src/lib/hjemmebane/uddrag.ts`); paritetstesten holder dem ens, men
  mailen skal importere spejlet næste gang den åbnes.
- Beviset for opslagsmailen i drift (en rigtig mail i en rigtig
  indbakke med portræt) er ikke bogført her — næste opslag der ikke er
  Jonas' eget.

## 9. Mål det igen

```sql
-- Tråde, svar, forfattere
select count(*) filter (where status = 'aktiv') as aktive_traade,
       count(*) filter (where created_at >= now() - interval '7 days') as seneste_uge,
       count(distinct forfatter_id) as forfattere
from public.community_traade;
select count(*) as svar from public.community_svar where status = 'aktiv';

-- Hvem har adgang
select count(*) filter (where exists (select 1 from public.company_members cm where cm.user_id = p.user_id)
                          and public.har_aktivt_medlemskab(p.user_id)) as med_adgang,
       count(*) filter (where public.has_role(p.user_id, 'advisor')) as raadgivere
from public.profiles p;

-- Visninger pr. tråd — tallet der betyder noget
select t.titel, t.created_at, length(t.indhold) as tegn,
       (select count(*) from public.community_visninger v where v.traad_id = t.id) as set_af,
       t.antal_svar, (select count(*) from public.community_reaktioner r where r.traad_id = t.id) as likes
from public.community_traade t
where t.status = 'aktiv'
order by t.created_at desc;

-- Opslagsmailen: notifikationer og mails
select count(*) as notifikationer, count(distinct dedup_key) as traade,
       count(*) filter (where email_sent_at is not null) as mailet_eller_disposet,
       count(*) filter (where seen_at is not null) as set_i_appen
from public.notifications where type = 'community_opslag';
select count(*) from public.email_send_log where template_name = 'notification-community_opslag';
```

## Filer

`supabase/functions/notify-community-opslag/index.ts`,
`_shared/opslagsMail.ts`, `_shared/htmlEscape.ts`,
`_shared/communityNaevnte.ts`, `send-notification-email/index.ts`,
`supabase/config.toml`; `src/lib/hjemmebane/communityApi.ts`,
`forsideOpslag.ts`, `uddrag.ts`, `src/components/hjemmebane/community/
CommunityView.tsx`, `src/components/hjemmebane/boardroom/BoardroomView.tsx`;
tests `src/lib/__tests__/opslagsMail.test.ts`,
`sendNotificationEmail.escaping.guard.test.ts`,
`src/lib/hjemmebane/__tests__/forsideOpslag.test.ts`, `uddrag.test.ts`.
