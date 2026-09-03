# Emnelisten — grundlaget for emne-klassificeringen

**Skrevet 3. september 2026, sen aften.** Dette er grundlaget for
`docs/raadgiverfladen-design.md` §5: den faste liste af
rådgivningsemner som hver besked skal klassificeres mod, hvordan den
blev til, og hvad der bevidst er holdt udenfor. Listen er **udledt af
hvad der faktisk står i samtalerne** — ikke skrevet fra et skrivebord
(§5.3, trin 1). Den er ikke låst: den skal bevises ved at klassificere
hele historikken og måle, før nogen flade bygges (§5.3, trin 2–4).

---

## 1. Grundlaget — målt i prod 3/9 kl. 22:14–22:15 (Lovable SQL editor)

| måling | tal |
|---|---|
| Beskeder i alt | 708 |
| … `message_type = 'user'` (mennesker) | 588 |
| … `message_type = 'system'` | 117 |
| … `message_type = 'welcome'` | 3 |
| Menneskebeskeder fra medlemmer | 307 |
| Menneskebeskeder fra rådgivere | 281 |
| Samtaler | 30 |

Tallet 699 i `docs/status-1-september.md:430` er fra 1/9; ni beskeder
er kommet til siden. Rollen (medlem/rådgiver) er afgjort ved opslag i
`user_roles`, som triggeren `update_conversation_reply_state` gør —
`messages` bærer ingen afsenderrolle selv (`raadgiverfladen-design.md`
§5.1).

**Menneskebeskederne er balancerede**: 307 mod 281. Det er ikke én part
der taler og én der lytter.

**Længder** (de 588 menneskebeskeder):

| tegn | antal |
|---|---|
| under 40 | 69 |
| 40–149 | 178 |
| 150–499 | 202 |
| over 500 | 139 |

341 beskeder er over 150 tegn. Der er substans nok til at klassificere;
det er ikke en tråd af «ok» og «tak».

**Pr. måned:** marts 70, april 148, maj 86, juni 182, juli 26, august
70, september 6. Juni og april bærer næsten halvdelen.

---

## 2. Metoden — så den kan gentages

1. For hver af de 30 samtaler blev de **tre længste medlemsbeskeder**
   udvalgt (`message_type = 'user'`, afsender med rollen medlem,
   sorteret på længde faldende, tre pr. `conversation_id`). Det gav
   **55 beskeder**, alle over 150 tegn (nogle samtaler har færre end
   tre lange medlemsbeskeder).
2. De 55 blev læst igennem 3/9 aften, og for hver blev det noteret hvad
   medlemmet faktisk skrev om — ikke hvad man forventede de skrev om.
3. Emnerne blev samlet nedefra: først de konkrete ting (en elev der
   siger op, et revisorskift, klikpriser), derefter grupperet til ni
   navne der hver dækker en genkendelig del af en rådgivers dag.
4. To kategorier der gik igen, blev holdt UDEN FOR listen med
   begrundelse (§5).

**Rådgivernes egne 281 beskeder er IKKE læst endnu.** Medlemmernes ord
definerer emnerne; rådgivernes svar er reaktioner på dem. En senere
gennemlæsning af rådgiversiden kan afsløre emner medlemmerne ikke selv
sætter ord på (§7).

Metoden vælger de længste beskeder, fordi de bærer mest indhold pr.
besked — ikke fordi de er repræsentative for de korte. Om de korte
beskeder bærer andre emner, viser klassificeringen af alle 588 (§7).

---

## 3. Hvad læsningen viste

Fund, ikke citater — kunderne gengives ikke ordret ud over enkelte
korte vendinger.

- **Medarbejdere fylder mest.** Elever der siger op, sælgere der bliver
  syge, flexjobbere, tidsregistrering, en opsigelse der trak ud og
  truede en storkunde. Personalet er det der oftest får et medlem til at
  skrive langt.
- **Markedsføring lige efter.** Annoncering, bureauer,
  influencer-formidlere, klikpriser. Ofte som et valg der skal træffes
  nu: skal vi bruge pengene, og på hvem.
- **Bogføring og revisor fylder langt mere end forventet.**
  Revisorskift, overfakturering, bilagshåndtering, systemer der ikke kan
  levere en saldobalance pr. måned. Det var ventet som en bikategori;
  det er et hovedemne.
- **Mange beskeder er månedsstatus.** Ét indlæg rummer omsætning, en
  opsigelse, en marketingbeslutning og en ferie. Det bekræfter §5.5's
  krav om at **én besked skal kunne bære FLERE emner — det er reglen,
  ikke undtagelsen.** En klassificering der giver ét emne pr. besked,
  ville tabe det meste af det der står.
- **To kategorier hører ikke til rådgivningsemnerne** — se §5.

---

## 4. Listen — ni emner

| emne | dækker |
|---|---|
| **Likviditet** | penge der ikke kommer ind, løn der ikke kan trækkes, kreditter |
| **Priser og indtjening** | dækningsbidrag, prissætning, abonnementer, marginer |
| **Salg og kunder** | pipeline, kundekoncentration, tabte og vundne kunder |
| **Markedsføring** | annoncering, bureauer, influencers, klikpriser, webshop-trafik |
| **Medarbejdere** | ansættelse, opsigelse, sygdom, løn, trivsel |
| **Bogføring og regnskab** | revisor, bilag, systemer, rapportering |
| **Strategi og retning** | hvilken vej, hvad prioriteres, skalering |
| **Ejerskab og kapital** | partnere, andele, selskabsstruktur, investorer |
| **Drift og systemer** | produktion, lager, webshop-teknik, processer |

Ni, ikke tres. Kort nok til at kunne huskes, lang nok til at rumme det
de 55 beskeder faktisk handlede om. Grænserne mellem emnerne er
bevidst brede («Salg og kunder» rummer både pipeline og en tabt
storkunde), fordi en fin inddeling er præcis det der driver fra
hinanden (`raadgiverfladen-design.md` §5: «tres etiketter der betyder
det samme»).

---

## 5. Uden for listen — med begrundelse

### 5.1 Platform-hjælp

Spørgsmål om Boardroom selv: upload der fejler, hvorfor sundhedsscoren
faldt, hvilke tal dashboardet trækker fra. Det er **support, ikke
rådgivning**, og det ville forurene billedet af hvad der rådgives om, at
tælle det med. Holdes som **egen kategori**, ikke som emne — så det kan
tælles og læses, men ikke blandes med forretningen.

### 5.2 Ejerens overskud — bevidst fravalgt (Jonas, 3/9 sen aften)

Det fylder i samtalerne: stress, tvivl, sygdom i familien, overvejelser
om at stoppe. Men **det er en tilstand, ikke et rådgivningsemne**, og
at klassificere det gør en fortrolig bemærkning til en etiket i en
oversigt. Et medlem der skriver om at være ved at give op, skal ikke
finde sig selv som en række under «Ejerens overskud» på en
rådgiverside. Jonas' begrundelse: det personlige må ikke blive til en
etiket.

### 5.3 Konsekvensen: «intet emne» er et svar, og det tælles

Klassificeringen skal have lov til at svare **INTET EMNE**, og de svar
skal **TÆLLES**, ikke gemmes væk. En virksomhed hvor halvdelen af
beskederne står uden emne er i sig selv et signal: enten mangler
listen noget fagligt, eller også handler samtalen om noget andet end
forretning. Begge dele er værd at vide for rådgiveren, og ingen af
delene kræver at der sættes en etiket på det personlige. **Det er
alternativet til et tiende emne.**

---

## 6. Formen — listen er data

Gentaget fra `raadgiverfladen-design.md` §5.5, fordi det er dét der
afgør om listen kan ændres uden at klassifikationerne mister betydning:

- Listen er **data**: CHECK i databasen, konstant i koden, og en
  paritetstest der låser de to sammen — efter mønstret fra
  `agent_proposals.decision_category`. Ikke strenge spredt i koden.
- Emner **kan ikke bo i `messages.context_type`**: én værdi ad gangen,
  blandet betydning (otte værdier i omløb, fra `report` til
  `session_prep`). Klassifikationen er en egen tabel med besked-id,
  emne, tidspunkt og ophav, så én besked kan bære flere emner (§3).
- «Intet emne» og «platform-hjælp» skal kunne skelnes fra hinanden og
  fra de ni emner i data — de er tre forskellige svar.

---

## 7. Åbne punkter

- **Rådgivernes 281 beskeder er ikke læst.** En gennemlæsning kan
  afsløre emner medlemmerne ikke selv sætter ord på, fx det rådgiveren
  bringer op uopfordret. Listen kan vokse eller flytte grænser efter
  den.
- **Listen er ikke prøvet.** Den skal bevises ved at klassificere alle
  588 menneskebeskeder i et **idempotent engangsjob** (udfyld kun tomt;
  mønster `berig-virksomheder`, #567) og **måle** om den rammer
  (`raadgiverfladen-design.md` §5.3). Rammer den ikke, ændres listen —
  den er ikke låst. Målingen skal også vise hvor stor andelen af
  «intet emne» og «platform-hjælp» er.
- **Hvor mange emner en besked typisk bærer**, vides ikke før
  målingen. Månedsstatus-beskederne (§3) tyder på flere; de korte
  beskeder under 40 tegn (69 stk.) bærer formentlig nul.
- **Formen på virksomhedssiden** afgøres først efter målingen
  (`raadgiverfladen-design.md` §5.3). Intet i dette dokument er en
  visning.
