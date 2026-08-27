# Planen fra 27. august 2026

Bygget på aktiveringsmålingen samme dag. Rækkefølgen er sorteret efter
hvem der bløder lige nu, ikke efter hvad der er størst.

## Hvad 235 mislykkede uploads består af

Uploads der aldrig blev til tal, på tværs af platformens levetid,
Topix' testkonto undtaget:

| gruppe | antal |
|---|---|
| Bestod valideringen, blev aldrig til tal | 73 |
| Fejlede valideringen | 114 |
| Ingen validering overhovedet | 48 |

Valideringsfejlene fordelt på klasse (en upload kan tælle i flere):

| klasse | uploads |
|---|---|
| Manglende kernefelt (`ebt`, `revenue`) | 46 |
| Periodegrundlag kan ikke afgøres | 22 |
| ÅTD står som 0 | 12 |
| FAIL uden nogen fejlbesked | 9 (heraf 7 aktive) |
| Kendt kilde uden template (AI-fallback forbudt) | 9 |
| Balancen går ikke op | 9 |
| Umulig margin / bruttoresultat stemmer ikke | 16 |
| Filtype, parse, kernetotaler, øvrigt | 9 |

**Tidspunkterne ændrer billedet.** De 46 manglende kernefelter er
næsten alle fra marts og april. De fejl der sker nu er to andre
klasser: kendt kilde uden template (seneste 23. august) og FAIL uden
fejlbesked (seneste 23. august).

## Rækkefølgen

### 1 · De tolv samtaler — ikke kode

Fjorten virksomheder har aldrig haft ét målt tal. Fem af dem har ikke
været inde siden marts og juni; ingen ændring i produktet når dem.
Kan begynde uden en PR og blokerer intet andet.

### 2 · Kendt kilde uden template

Ni uploads, seneste 23. august. Dinero og e-conomic genkendes, men
ingen template matcher, og AI-fallback er bevidst forbudt for kendte
kilder — medlemmet får en blindgyde. Det er den eneste fejlklasse der
aktivt rammer betalende medlemmer der forsøger.

### 3 · FAIL uden grund

Syv uploads med tom `validation_errors` og `validation_status = FAIL`,
seks virksomheder, seneste 23. august — plus to ældre fra april.
Medlemmet får at vide at det fejlede; systemet ved ikke hvorfor.
Blokerer al videre fejlsøgning.

### 4 · deriveFocus

`deriveFocus` tester kun om forrige måned findes, aldrig om der findes
noget som helst. Fjorten virksomheder ser «Upload dine juli-tal» som om
de var én måned bagud. Informationen ligger allerede i motorens input.

### 5 · Godkendelsestrinnet

73 uploads bestod valideringen og blev aldrig til tal; 72 blev senere
soft-slettet, hvilket sker når medlemmet uploader samme periode igen.

Hypotese: PASS er ikke enden på flowet — medlemmet skal derefter
godkende, og sker det ikke, ser det ud som om intet skete, så de
uploader igen. PHILBERT viste mekanismen: tre PASS-rapporter lå fra
29. april til 27. august. Måling før kode.

### 6 · Manglende kernefelt

46 fejl, overvejende historiske. Spørgsmålet er om `ebt` kan afledes
frem for at afvise. Canonical-motoren har allerede afledningslogik.

### 7 · Dagens tekniske fund

Se `docs/skrivninger-og-raadgiverflade-recon.md` og
`docs/aarsrapport-vejen-design.md`.

## Det der IKKE er i planen, og hvorfor

**Periodetotal-fladen.** Motoren `opgoerPeriode` er bygget og testet
uden aftager. Den betjener virksomheder der har data — og halvdelen af
basen har ingen. Den venter til lag 1 er lukket.

**Resten af klasse C.** Floren Engros 2024 og 2025. To årgange hos én
virksomhed der har syv rigtige 2026-måneder. Porten forhindrer
gentagelse; oprydningen haster ikke.

**De tre årgange uden omsætning.** ANLA GLAS 2024, Livja 2025 og
YKRG 2024. Topix 2025 var den fjerde og blev rettet i hånden 27/8.
Spørge-mekanikken virker kun fremad; de tre skal spørges særskilt.
