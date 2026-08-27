# Aktiveringsmåling — 27. august 2026

Målt på hele medlemsbasen. Afløser mangellistens tal fra 25.–27. august,
som var rigtige men for grove.

## 1. Nævneren er ikke selvvalgt

Bekymring rejst 27/8: hvis rapport-rækken først skrives efter en
vellykket parse, findes et afbrudt forsøg ingen steder, og «har aldrig
uploadet» kunne betyde «prøvede og blev afvist usynligt».

Afkræftet. `handleUpload` opretter rapport-rækken med
`status: "processing"` FØR udtrækket kaldes. Et mislykket forsøg
efterlader et spor — vi har målt både `error`- og slettede rækker i
drift.

Tolv virksomheder har nul rapporter i alt: nul fejlede, nul slettede,
nul i processing. De prøvede aldrig.

## 2. Fjorten har aldrig haft en målt måned

Ikke tretten. To virksomheder tæller i dag som «har data» uden at have
én måling:

- **remm.** — kun en årsrapport (12 estimerede rækker)
- **LineAlmegaard** — kun en baseline via AnnualBaseline-flowet
  (12 rækker, kontrakt `baseline_v1`)

Fjorten af treogtredive rigtige virksomheder står altså uden ét målt
tal. Toogfyrre procent.

De tolv uden ét forsøg: Bastant Design, Coskun Holding, Friends & Fries,
Homie Håndværkerservice, Limo Group, Regnskabsvikar, Sebastian & Amalie,
Stadio, Startkørekort, Studio Mini, TOFT Administration, TuaMea Jewelry.

## 3. Hver måned koster flere forsøg

Uploads pr. målt måned (årsrapport- og baselinerækker trukket fra).

**Udledt, ikke direkte målt.** Kolonnen «uploads» og det samlede antal
faktarækker er målt pr. virksomhed. «Målte mdr.» er beregnet ved at
trække kendte estimatrækker fra: tolv pr. årsrapport-årgang og tolv for
LineAlmegaards baseline. Fordelingen bygger på klassificeringen i
docs/aarsrapport-vejen-design.md §5. En forespørgsel der grupperer
faktarækker på `source_type` pr. virksomhed ville måle det direkte og
bør køres, før tallene citeres videre.

| virksomhed | uploads | målte mdr. | forsøg pr. måned |
|---|---|---|---|
| Capture IT | 5 | 5 | 1,0 |
| Rallysupport | 17 | 16 | 1,1 |
| Brick Works | 25 | 21 | 1,2 |
| BRILLEVÆRK | 6 | 5 | 1,2 |
| Livja | 10 | 7 | 1,4 |
| ANLA GLAS | 34 | 17 | 2,0 |
| BR Roset | 38 | 18 | 2,1 |
| Warburg VVS | 32 | 13 | 2,5 |
| YKRG | 5 | 2 | 2,5 |
| Fjeldgaardshop | 41 | 15 | 2,7 |
| CARMA STUDIO | 11 | 4 | 2,8 |
| Rezycl.com | 20 | 7 | 2,9 |
| Doggybed | 21 | 7 | 3,0 |
| Booking Innovation | 22 | 7 | 3,1 |
| PHILBERT | 10 | 3 | 3,3 |
| Alina Beauty | 13 | 3 | 4,3 |
| KJ AUTO | 10 | 2 | 5,0 |
| Floren Engros | 37 | 7 | 5,3 |

Median: **2,6**. Topix er udeladt (51 uploads, heraf 44 slettede
testkørsler — 8,5 er ikke et medlemstal).

**Hypotese, ikke konklusion:** de fire bedste kører deterministisk
template; flere af de dårligste kører AI-udtræk. Sammenhængen er ikke
målt og bør afgøres, før noget bygges på den.

## 4. De to der gav op havde de værste rater

- **KJ AUTO**: 10 uploads, 8 fejlede (80 %), 2 målte måneder.
  Sidste forsøg 15. april.
- **Fjeldgaardshop**: 41 uploads, 16 fejlede (39 %), 15 målte måneder.
  Sidste forsøg 14. april.

De faldt ikke fra af manglende interesse. De faldt fra efter
henholdsvis ti og enogfyrre forsøg.

## 5. Tre rapporter hænger i processing

To hos Alina Beauty & Skincare, én hos ANLA GLAS. Status `processing`,
aldrig færdiggjort, aldrig fejlet. De er usynlige i begge retninger:
tælles hverken som succes eller fejl, og ingen alarm findes.

Nyt fund. Årsagen er ikke undersøgt.

## 6. Konsekvens for rækkefølgen

Mangellistens lag 1 blander to opgaver med hver sin målgruppe:

**A — fjorten der aldrig kom i gang.** Ikke kode. Fem har ikke været
inde siden marts og juni; ingen forsideændring når dem. Samtaler og
onboarding-sekvens.

**B — nitten der kæmper.** Er kode. Ikke «importen er stoppet til» —
den virker, men koster median 2,6 forsøg pr. måned. Frafaldet sker i
den omkostning.

`deriveFocus` hører til A: den kender ikke forskel på «aldrig begyndt»
og «bagud», og informationen ligger allerede i motorens input.

Forsøg-pr-måned hører til B og er den måling der mangler et navn i
mangellisten.
