# Akademiet — beslutningsgrundlag til Jonas og Morten

Skrevet 1/10-2026 aften, på grundlag af Jonas' besked 1/10 kl. 22:50: «Jeg skal også, sammen med
Morten, hele vores Akademi igennem. For er heller ikke sikker på, at strukturen i den del er god
nok. Start her skal måske bruges anderledes. Vi skal have folk til at tage Mortens Fundamentet mere
seriøst, men det er vores ansvar at få dem til det, ikke medlemmernes. Quick Wins skal væk fra
Akademiet.»

**Mærkerne i dokumentet:**

- **målt 1/10:** tal målt i prod 1/10 (af Jonas/chatten, ikke i denne gren).
- **kodelæst:** står sådan i koden på `origin/main` `f6dbae57`. Det er ikke set på skærmen, og
  det er ikke målt i prod.
- **forslag:** vores bud. Intet af det er besluttet.

Kilder i koden: `src/lib/hjemmebane/adminContentApi.ts` (`AREAS`, `batchAcknowledge`),
`src/components/hjemmebane/akademi/` (`useAkademiData.ts`, `views/*`), `src/lib/hjemmebane/forloeb.ts`,
`src/lib/hjemmebane/maaskeRelevant.ts`, `src/lib/onboardingTjekliste.ts`, `src/lib/certifikat/dom.ts`,
`src/components/hjemmebane/certifikat/format.ts` og `docs/indhold-recon.md` (datamodellen, 25/8).

---

## 1. Sådan ser Akademiet ud i dag

### Strukturen

Områderne er defineret i koden (`AREAS`). Samlingerne og videoerne ligger i databasen
(`content_collections`, `content_items`) (**målt 1/10**).

| Område (nøgle) | Navn for medlemmet | Indhold | Status |
|---|---|---|---|
| `start_her` | Start her | 3 videoer. Den 3. er «Din målsætning», som er koblet til handoutet `overordnet` (**målt 1/10**) | Synlig |
| `classroom` | Fundamentet | Jonas' og Mortens egen undervisning. Samlingerne Bogholderi, Administration, Salg og Marketing svarer til handout-modulerne (**målt 1/10**) | Synlig |
| `academy` | Kurser | Eksterne eksperter, enkeltstående kurser | Synlig |
| `quick_wins` | Quick Wins | «Korte, hurtige videoer» | Skjult for medlemmer (**målt 1/10**). I koden står området stadig med `akademi: true` (**kodelæst**), så hvordan det skjules, er ikke læst ud |
| `talks` | Optagelser | Optagelser af events. Vises kun på eventet | Ikke i Akademiet |

Tal i alt: **77 videoer**, og **14 af dem bærer `handout_module`** (**målt 1/10**).

Kommentaren ved `classroom` i `AREAS` siger: «"Grundforløbet" lovede en rækkefølge, der ikke
findes — de otte samlinger er discipliner, ikke trin». Det betyder to ting:

- Fundamentet blev med vilje gjort til et sæt discipliner og ikke et forløb.
- Kommentaren nævner **otte** samlinger, mens målingen 1/10 nævner fire. Det er ikke afstemt.
  Det præcise tal kommer ud af §6, sektion 4.

### Det, et nyt medlem møder første gang (kodelæst)

1. **`/akademiet`** viser overskriften «Velkommen til Akademiet.» og teksten «Forløb, kurser og
   værktøjer — i dit tempo. Start her, så følger vi med på, hvor langt du er nået.» Der er intet
   «Fortsæt»-kort.
2. Derunder står linket **«Næste for dig: {første urørte video}»**. Det er den første video i
   områdernes rækkefølge: Start her → Fundamentet → Kurser → Quick Wins (`afgoerForloeb`).
3. Under **«Dine forløb»** står ét lige stort kort pr. område med «0 af N». Kortene har samme
   vægt, og intet af dem siger, at Fundamentet er kernen.
4. **Inde i Fundamentet** står samlingerne som kort i et gitter med to kolonner
   (`OmraadeView` → `HbKursusKort`). Kortene viser antal lektioner, samlet tid og fremdrift.
   Kortene har intet nummer, og siden siger ikke, hvor man skal begynde, eller hvornår man er
   færdig.
5. **En lektion** (`ElementView`) har:
   - videoen, med automatisk «Gennemført» ved 90 % afspilning,
   - knapperne «Gennemført» og «Spring over»,
   - et refleksionskort med linket «Åbn handoutet» til `/handouts`, hvis lektionen har
     `handout_module`,
   - linket «Næste: …» til næste lektion i samme område,
   - spørgsmålet «Kunne du bruge den?».

**Uden for Akademiet (kodelæst):**

- **Forsidens fokuskort** viser linjen «Eller start i Akademiet: {næste}». Har medlemmet allerede
  rørt en video, står der i stedet «Eller fortsæt dit forløb: {…}» (`forloebslinje`, #914).
- **«Måske relevant for dig»** viser en lektion ud fra triggeren i ugens fokus. Triggeren peges
  på et handout-modul og derfra på en lektion (`maaskeRelevant.ts`, højst 2). Grundlaget er de
  14 lektioner med modul.
- **Onboarding-tjeklisten** har intet Akademi-punkt. «Se velkomsten» er platformens velkomstvideo
  (`app_config.velkomstvideo_guid`) og ikke «Start her».
- **Certifikatet** er bundet til tid og ikke til Akademiet. Det åbner 7 dage før 12 måneder fra
  `contract_start_date` (`getCertificateStatus`, `MEMBERSHIP_MONTHS = 12`,
  `UNLOCK_DAYS_BEFORE = 7`). Medlemmet får det altså for at blive i 12 måneder, ikke for at
  gennemføre Fundamentet.
- **Rådgiverens skridt-forslag** (`foreslaa-opgave`) kan ikke henvise til en lektion eller en
  samling. Grep efter `lektion`/`content_item` i functionen gav 0 hits.
- **Chatten** har intet lektionskort. Lektionslinks bliver kun til kort i Community
  (`CommunityLinkKort`).

---

## 2. Hvad tallene siger, og hvad de ikke siger

### Det, der er målt (1/10)

| Tal | Kilde | Hvad det siger |
|---|---|---|
| 22 af 29 medlemmer har aldrig selv åbnet en video | målt 1/10 | 76 %. Wilson-interval 95 %: **58–88 %**. Selv med 29 personer er konklusionen sikker: de fleste bruger ikke Akademiet. |
| 231 af 330 progress-rækker kommer fra én rådgivers `batchAcknowledge` 12/8 | målt 1/10 | 70 % af alle rækker er en rådgivers markering, ikke medlemmets egen aktivitet. |
| 77 videoer, heraf 14 med `handout_module` | målt 1/10 | Kun 18 % af videoerne er koblet til en øvelse. |
| Certifikatet er hentet 3 gange, af 1 medlem | målt 1/10 | Det siger noget om certifikatet, ikke om Fundamentet. Certifikatet kræver intet i Akademiet (§1). |

### Det, tallene ikke siger, og hvorfor batchen skjuler den reelle brug (kodelæst)

- **«Set = kvitteret».** `batchAcknowledge` skriver `acknowledged_at = nu`. Er rækken ny, sætter
  den også `seen_at = nu`. Rækken har ingen kolonne for, hvem der har skrevet den. Medlemmets
  fremdriftsbar viser derfor «Gennemført» på lektioner, hun aldrig har set. «Næste for dig»
  springer de lektioner over, og det samme gør forsidens linje. Platformen siger altså til
  medlemmet, at hun er længere, end hun er.
- **Et besøg på en batch-række efterlader intet spor.** `ElementView` skriver kun `seen_at`, når
  den er tom, og batchen har allerede sat den. Et medlem, der åbner en batch-markeret lektion og
  ikke afspiller den, kan ikke skelnes fra et, der aldrig kom. «22 af 29» kan derfor være lidt
  for højt. Det kan ikke være for lavt på grund af batchen.
- **Én række pr. medlem pr. lektion.** Der er ingen historik, ingen visningstæller og ingen tid
  brugt (`indhold-recon.md` §6). Vi kan se, *om* et medlem har rørt en lektion, men ikke hvor
  meget eller hvor ofte.
- **Definitionen bag «22 af 29» er ikke skrevet ned.** Forespørgslen i §6 skriver den ud. Giver
  den et andet tal, ligger forskellen i definitionen.

---

## 3. Problemet set fra medlemmet

1. **Fundamentet ser ud som én hylde blandt fire.** Start her, Fundamentet, Kurser og (indtil
   nu) Quick Wins er fire lige store kort. Intet på Akademiets forside, på forsiden eller i
   tjeklisten siger: «det her er kernen, og det her forventer vi af dig».
2. **Fundamentet har hverken begyndelse eller slutning.** Samlingerne er et gitter af kort uden
   nummer. Valget «discipliner, ikke trin» (13/8) fjernede løftet om en rækkefølge, men satte
   intet andet i stedet. Der er ingen målstreg: certifikatet er bundet til tid.
3. **Start her mister sit eneste stykke handling.** «Din målsætning» flytter til Dine mål som
   «Jeres retning» (`docs/dine-maal-design.md` §7). Tilbage er 2 videoer, som desuden står ved
   siden af platformens egen velkomstvideo. Det giver medlemmet to introduktioner.
4. **Øvelsen bor et andet sted end undervisningen.** Refleksionskortet er kun et link til
   `/handouts`. Det ændrer sig med nattens punkt 2, hvor handouts flytter ind som øvelser.
5. **Rådgiveren kan ikke pege ind i Fundamentet med platformens egne værktøjer.** Der er intet
   lektionskort i chatten, og skridtene kender ingen samling (§1). Det eneste træk udefra er
   forsidens forløbslinje og «Måske relevant».
6. **Rådgiverens markering ligner medlemmets egen.** En rådgiver, der vil hjælpe, kommer til at
   fortælle medlemmet, at hun er færdig.
7. **Quick Wins trak den modsatte vej.** «Korte, hurtige videoer» i samme række som Fundamentet
   sagde, at der findes en genvej.

---

## 4. Forslag: platformen leder folk ind i Fundamentet (vores ansvar)

### Fælles regler for målingen af alle forslagene

- Vi måler **pr. medlem**, ikke pr. række.
- **Kun egen aktivitet tæller.** Definitionen står i §6.
- Hvert forslag måles mod en kohorte: medlemmer oprettet efter ændringen, eller alle aktive fra
  en given dato.
- Husets Wilson-regel: under 5 personer i nævneren står der **«for få»** i stedet for en procent.
  Overlapper intervallerne, står der «kan ikke afgøres».
- Med ca. 29 medlemmer og hold på 10–15 vil de fleste sammenligninger i månedsvis være «for få»
  eller «kan ikke afgøres». Det skal vi sige højt og ikke læse mere ud af tallene, end der er.
  Det, vi kan se, er de grove skift, fx fra 7 af 29 til 20 af 29.

| # | Forslag | Hvad der skal bygges | Størrelse | Sådan måler vi, om det virker |
|---|---|---|---|---|
| **F0** | **Rådgiverens markering skilles fra medlemmets.** `batchAcknowledge` holder op med at skrive som medlemmet. Den får sin egen kolonne (fx `markeret_af`/`markeret_at`) eller sin egen tilstand, «gennemgået med rådgiver». Medlemmets fremdrift og «næste» læser kun medlemmets egne rækker. | Migration, `adminContentApi`, `ProgressView`, `itemProgressState`/`forloeb.ts` | Lille–mellem | **Forudsætning for alle de andre målinger.** Kontrol: efter ændringen er der 0 nye batch-grupper i §6, sektion 1. |
| F1 | **Fundamentet som forløb med rækkefølge.** Samlingerne nummereres («Modul 1 af 4»). Rækkefølgen er anbefalet, ikke låst. Fundamentet står øverst og stort på Akademiets forside, og Kurser står under. | `OmraadeView`, `HbKursusKort`, `ForsideView`. `position` findes allerede. Ingen migration. | Lille | Andelen af medlemmer, der har egen aktivitet i modul 2 inden 30 dage efter at have gennemført modul 1 selv. |
| F2 | **«Næste lektion i Fundamentet» på forsiden.** Forløbslinjen findes allerede, men er en underlinje under fokuskortet. Den skærpes til sin egen plads: kun Fundamentet, med modulnavn og varighed, indtil Fundamentet er gennemført. | Ny plads i fokusmotoren, områdefilter i `afgoerForloeb`, værn | Mellem | Andelen af medlemmer med egen aktivitet i Fundamentet inden 14 dage efter oprettelse, før og efter ændringen. |
| F3 | **Rådgiverens kobling i samtalen og i Din plan.** (a) Et lektions-/samlingskort i chatten. (b) Et skridt-forslag pr. samling: «Se Bogholderi-modulet og lav øvelsen», hvor skridtet peger på samlingen. | (a) chatkort som `CommunityLinkKort`. (b) kolonne på skridtet (migration) + `foreslaa-opgave` + `opgave-accepter` | Mellem–stor | Andelen af samlings-skridt, hvor medlemmet har egen aktivitet i samlingen inden skridtets frist. |
| F4 | **Øvelsen afslutter hver samling.** Bygger på nattens punkt 2 (handouts → øvelser i Akademiet). Øvelsen står som sidste element i samlingen, og samlingen tæller først som gennemført, når øvelsen er udfyldt (spørgsmål 3). | Afhænger af punkt 2. Dommen for «samling gennemført» skal ligge ét sted. | Mellem | Blandt medlemmer, der selv har gennemført alle videoer i en samling: andelen, der også udfylder øvelsen. |
| F5 | **En målstreg for Fundamentet.** Ikke 12-måneders-certifikatet, som allerede er lovet alle 29/9. I stedet et trofæ «Fundamentet gennemført» i `trofaeer.ts` (findes fra 1/10, læser kun tidspunkter). | Ny dom i trofæerne. Bruger kun egne rækker og forudsætter F0. | Lille | Antal medlemmer med trofæet. Andelen, der går fra modul 1 til «alle moduler». |
| F6 | **Start her bliver én dør ind i Fundamentet.** Når «Din målsætning» er flyttet: én kort video, der slutter med «gå til Modul 1». Alternativt nedlægges området, og forsidens næste-lektion (F2) overtager. | Indhold, eventuelt `AREAS` | Lille | Samme mål som F2 (egen aktivitet i Fundamentet inden 14 dage). |
| F7 | **Quick Wins ud af Akademiet.** Flaget `akademi: false` (som `talks`) eller arkivering. Hver video gennemgås: flyt den ind i den samling i Fundamentet, den hører til, eller arkivér den. Slet intet. | `AREAS`. Tjek først Community-links til `/akademiet/quick_wins/…` (`communityDokument.ts` og `CommunityLinkKort.tsx` kender området). | Lille | Kontrol, ikke effekt: 0 Quick Wins-kort for medlemmer, og 0 døde links i Community. |

Rækkefølgen, vi anbefaler: **F0 → F7 → F1 → F6 → F2 → F4 → F5 → F3**. Begrundelsen:

- F0 gør tallene ærlige.
- F7, F1 og F6 er små og rydder op i strukturen.
- F2 og F4 er de store greb.
- F3 er dyrest.

---

## 5. Spørgsmål, Jonas og Morten skal afgøre sammen

1. **Er Fundamentet et forløb eller et bibliotek af discipliner?** Det rører beslutningen fra
   13/8. Anbefaling: et forløb med en anbefalet, ikke låst rækkefølge. Uden en rækkefølge kan
   platformen ikke sige «næste».
2. **Hvad skal Start her være, når «Din målsætning» er flyttet?** Anbefaling: én kort video, der
   ender i Fundamentet, Modul 1 (F6). Overlapper den platformens velkomstvideo, nedlægges
   området.
3. **Hvornår er en samling «gennemført»?** Er det, når videoerne er set, eller når videoerne er
   set og øvelsen er udfyldt? Anbefaling: begge dele. Øvelsen viser, at det er brugt, og ikke kun
   set.
4. **Må rådgiveren fortsat kvittere på medlemmets vegne?** Anbefaling: ikke som «gennemført».
   I stedet som en synlig, adskilt markering, «gennemgået med rådgiver» (F0).
5. **Skal Fundamentet have en målstreg, og hvilken?** Anbefaling: et trofæ (F5). 12-måneders-
   certifikatet skal ikke bindes til Fundamentet, for det er allerede lovet alle virksomheder
   (29/9).
6. **Hvor meget plads får Fundamentet på forsiden?** Anbefaling: en fast plads (F2), indtil
   Fundamentet er gennemført. Derefter forsvinder den.
7. **Hvad sker der med Quick Wins' videoer?** Anbefaling: Morten gennemgår dem én for én. De
   gode flyttes ind i den samling i Fundamentet, de hører til, og resten arkiveres.
8. **Skal rådgiverne kunne pege direkte på en samling i chatten og i skridtene (F3)?**
   Anbefaling: ja, men først når F0–F2 er bygget og målt. F3 er det dyreste forslag og virker
   kun, hvis forløbet findes.

---

## 6. Hvad der ikke er målt endnu, og forespørgslen, der måler det

### Det, der ikke er målt

- Egen aktivitet pr. område og pr. samling.
- Frafaldet video for video i Start her og Fundamentet.
- Det præcise antal samlinger og sporede videoer i Fundamentet (4 eller 8, jf. §1).
- Om de, der har udfyldt et handout, også har set de tilhørende videoer.
- Hvor Quick Wins' indhold står.
- Om dryp er i brug.
- Svarene på «Kunne du bruge den?» pr. område.
- Hvem de 7, der selv har åbnet en video, er, og hvor langt de nåede. Sektion 5 viser det pr.
  video, ikke pr. navn.

### Sådan kendes batch-rækker (kodelæst)

`member_progress` har **ingen kolonne for, hvem der har skrevet rækken**. Batch-rækker kan kun
kendes på deres fingeraftryk:

- `batchAcknowledge` skriver alle rækker i én upsert med **samme `acknowledged_at`** (klientens
  `now`-streng, ned til millisekunder). Er rækken ny, sætter den også `seen_at` til samme værdi.
- Medlemmets egne kvitteringer kommer én ad gangen. To egne rækker får derfor aldrig præcis
  samme `acknowledged_at`.
- **Reglen er derfor: en `(user_id, acknowledged_at)`-gruppe med ≥ 2 rækker er en batch.**

Reglen har tre grænser:

1. En batch med kun én lektion kan ikke skelnes fra et medlems eget klik.
2. Kvitterer medlemmet selv igen efter en fortrydelse, forlader rækken gruppen. Det er korrekt,
   for så er det hendes egen kvittering.
3. Et besøg uden afspilning på en batch-række efterlader intet spor (§2).

### «Egen aktivitet» på en række

Mindst ét af følgende skal gælde:

- `last_position_seconds` er sat (kun afspilleren skriver den).
- `skipped_at` er sat.
- `brugbar_at` er sat (kun medlemmet svarer).
- `acknowledged_at` er sat og er ikke en batch-række.
- `seen_at` er sat og er enten ikke en batch-række, eller er forskellig fra batchens
  `acknowledged_at`. I det sidste tilfælde blev den bevaret fra et tidligere eget besøg.

### Medlemmer i målingen

Brugere i en virksomhed med `er_kunde = true`, ikke demo og ikke slettet. Rådgivere og admins
(`user_roles`) og tjenestekonti tælles ikke med. Legatmodtagere tælles med.

### Forespørgslen

Destination: Lovable SQL editor. Kun SELECT. Det er ét resultatsæt med en sektions-kolonne,
fordi editoren kun eksporterer det sidste sæt. Forespørgslen er **ikke kørt**. Betydningen af
`a`, `b` og `c` står i hver sektions `noegle` og i oversigten nedenfor.

```sql
WITH medlemmer AS (
  SELECT DISTINCT cm.user_id
  FROM public.company_members cm
  JOIN public.companies c ON c.id = cm.company_id
  WHERE c.er_kunde = true
    AND c.is_demo IS DISTINCT FROM true
    AND c.data_slettet_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = cm.user_id AND r.role IN ('advisor', 'admin'))
    AND NOT EXISTS (SELECT 1 FROM public.tjenestekonti t WHERE t.user_id = cm.user_id)
),
batch AS (
  SELECT user_id, acknowledged_at, count(*) AS raekker
  FROM public.member_progress
  WHERE acknowledged_at IS NOT NULL
  GROUP BY user_id, acknowledged_at
  HAVING count(*) >= 2
),
v AS (
  SELECT id, area, collection_id, position, title, handout_module
  FROM public.content_items
  WHERE status = 'published' AND media_provider = 'bunny' AND coalesce(bunny_video_id, '') <> ''
),
p AS (
  SELECT mp.user_id, mp.content_item_id, i.area, i.collection_id, i.handout_module,
         mp.brugbar, mp.brugbar_at,
         (b.user_id IS NOT NULL) AS er_batch,
         (mp.acknowledged_at IS NOT NULL AND b.user_id IS NULL) AS egen_gennemfoert,
         (mp.last_position_seconds IS NOT NULL
          OR mp.skipped_at IS NOT NULL
          OR mp.brugbar_at IS NOT NULL
          OR (mp.acknowledged_at IS NOT NULL AND b.user_id IS NULL)
          OR (mp.seen_at IS NOT NULL AND (b.user_id IS NULL OR mp.seen_at <> mp.acknowledged_at))) AS egen_aktivitet,
         GREATEST(
           CASE WHEN b.user_id IS NULL THEN mp.acknowledged_at END,
           CASE WHEN b.user_id IS NULL OR mp.seen_at <> mp.acknowledged_at THEN mp.seen_at END,
           mp.skipped_at,
           mp.brugbar_at,
           CASE WHEN mp.last_position_seconds IS NOT NULL THEN mp.updated_at END) AS sidst_egen
  FROM public.member_progress mp
  JOIN medlemmer m ON m.user_id = mp.user_id
  JOIN public.content_items i ON i.id = mp.content_item_id
  LEFT JOIN batch b ON b.user_id = mp.user_id AND b.acknowledged_at = mp.acknowledged_at
)
SELECT '01 batch pr. dag' AS sektion,
       to_char((acknowledged_at AT TIME ZONE 'Europe/Copenhagen')::date, 'YYYY-MM-DD') || ' (grupper · rækker · brugere, alle brugere)' AS noegle,
       count(*)::bigint AS a, sum(raekker)::bigint AS b, count(DISTINCT user_id)::bigint AS c
FROM batch GROUP BY 2
UNION ALL
SELECT '02 kontrol', 'medlemmernes rækker · heraf batch · heraf med egen aktivitet',
       count(*)::bigint, count(*) FILTER (WHERE er_batch)::bigint, count(*) FILTER (WHERE egen_aktivitet)::bigint
FROM p
UNION ALL
SELECT '03 medlemmer', 'i alt · med egen aktivitet · med egen gennemført',
       (SELECT count(*) FROM medlemmer)::bigint,
       (SELECT count(DISTINCT user_id) FROM p WHERE egen_aktivitet)::bigint,
       (SELECT count(DISTINCT user_id) FROM p WHERE egen_gennemfoert)::bigint
UNION ALL
SELECT '03 medlemmer', 'egen aktivitet seneste 30 · 90 · 365 dage',
       count(DISTINCT user_id) FILTER (WHERE sidst_egen > now() - interval '30 days')::bigint,
       count(DISTINCT user_id) FILTER (WHERE sidst_egen > now() - interval '90 days')::bigint,
       count(DISTINCT user_id) FILTER (WHERE sidst_egen > now() - interval '365 days')::bigint
FROM p
UNION ALL
SELECT '04 område', area || ' (medl. m. egen aktivitet · medl. m. egen gennemført · batch-rækker)',
       count(DISTINCT user_id) FILTER (WHERE egen_aktivitet)::bigint,
       count(DISTINCT user_id) FILTER (WHERE egen_gennemfoert)::bigint,
       count(*) FILTER (WHERE er_batch)::bigint
FROM p GROUP BY area
UNION ALL
SELECT '05 samling',
       c.area || ' / ' || coalesce(par.title || ' › ', '') || c.title || ' (videoer · medl. m. ≥1 egen gennemført · medl. m. alle egne)',
       (SELECT count(*) FROM v WHERE v.collection_id = c.id)::bigint,
       (SELECT count(DISTINCT p.user_id) FROM p WHERE p.collection_id = c.id AND p.egen_gennemfoert)::bigint,
       (SELECT count(*) FROM (
          SELECT p.user_id FROM p JOIN v ON v.id = p.content_item_id
          WHERE v.collection_id = c.id AND p.egen_gennemfoert
          GROUP BY p.user_id
          HAVING count(*) = (SELECT count(*) FROM v v2 WHERE v2.collection_id = c.id)
        ) x)::bigint
FROM public.content_collections c
LEFT JOIN public.content_collections par ON par.id = c.parent_id
WHERE c.area IN ('start_her', 'classroom') AND c.status = 'published'
UNION ALL
SELECT '06 video',
       v.area || ' ' || lpad(coalesce(col.position, 0)::text, 2, '0') || '.' || lpad(v.position::text, 3, '0') || ' ' || v.title
         || ' (medl. m. egen aktivitet · medl. m. egen gennemført · batch-gennemført)',
       count(DISTINCT p.user_id) FILTER (WHERE p.egen_aktivitet)::bigint,
       count(DISTINCT p.user_id) FILTER (WHERE p.egen_gennemfoert)::bigint,
       count(DISTINCT p.user_id) FILTER (WHERE p.er_batch)::bigint
FROM v
LEFT JOIN public.content_collections col ON col.id = v.collection_id
LEFT JOIN p ON p.content_item_id = v.id
WHERE v.area IN ('start_her', 'classroom')
GROUP BY v.area, col.position, v.position, v.title
UNION ALL
SELECT '07 handout', h.module || ' (medl. m. udfyldt handout · medl. m. egen gennemført video i modulet · begge)',
       count(DISTINCT h.user_id) FILTER (WHERE h.status = 'completed')::bigint,
       (SELECT count(DISTINCT p.user_id) FROM p WHERE p.handout_module = h.module AND p.egen_gennemfoert)::bigint,
       count(DISTINCT h.user_id) FILTER (WHERE h.status = 'completed' AND EXISTS (
         SELECT 1 FROM p WHERE p.user_id = h.user_id AND p.handout_module = h.module AND p.egen_gennemfoert))::bigint
FROM public.handouts h
JOIN medlemmer m ON m.user_id = h.user_id
GROUP BY h.module
UNION ALL
SELECT '08 indhold pr. område', area || ' / ' || status || ' (elementer · sporede videoer · med dryp)',
       count(*)::bigint,
       count(*) FILTER (WHERE media_provider = 'bunny' AND coalesce(bunny_video_id, '') <> '')::bigint,
       count(*) FILTER (WHERE drip_after_days IS NOT NULL)::bigint
FROM public.content_items
WHERE area IN ('start_her', 'classroom', 'academy', 'quick_wins')
GROUP BY area, status
UNION ALL
SELECT '09 brugbar', area || ' (ja · nej · medlemmer der har svaret)',
       count(*) FILTER (WHERE brugbar = true)::bigint,
       count(*) FILTER (WHERE brugbar = false)::bigint,
       count(DISTINCT user_id) FILTER (WHERE brugbar_at IS NOT NULL)::bigint
FROM p GROUP BY area
ORDER BY 1, 2;
```

### Sådan læses resultatet

- **01** skal vise 12/8 med i alt ca. 231 rækker. Gør den ikke det, holder fingeraftrykket ikke,
  og vi stopper, før noget andet læses.
- **02** og **03** afstemmer de 330 rækker og «22 af 29».
- **05**, **06** og **07** er grundlaget for F1, F4 og F6. Brug Wilson-reglen: under 5 i
  nævneren står der «for få».
- **08** svarer på, hvor Quick Wins står, og på, om dryp er i brug. Dryp-tallet tæller kun dryp
  sat på selve elementet. Dryp arvet fra en samling (`content_collections.drip_after_days`)
  tælles ikke her.
