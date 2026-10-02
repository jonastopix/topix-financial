# Forsiden v3 — byggekontrakten

**Status:** mockup v3 GODKENDT af Jonas 2/10-2026 kl. 20:41 («Super godt. Det ser godt ud. Sådan skal du bygge
forsiden. Og du skal ikke gå på kompromis.»). Denne fil er kontrakten: hvert punkt nedenfor bygges, prøves på
RIGTIGE data og krydses af med PR-nummer. Et punkt, der ikke kan bygges som skrevet, STOPPER og spørges om —
det tilpasses ikke stille (Jonas 20:05: «Og jeg accepterer slet ikke, at jeg godkender en mockup med en note, og
så følger du den ikke. Så kan jeg jo ikke stole på dig.»).

Mockuppens kilde: `src/__harness__/forside.tsx` (lokal, ikke i repoet); skærmbillederne m3-topix-1440,
m3-typisk-1440, m3-typisk-375a/b, m3-topix-375a/b. Rådet: UX-agenten (to gennemsyn) og CTO-agenten (ét) før
godkendelsen; CTO før HVER kode-merge og UX-gennemsyn i drift efter Update (`docs/claude-regelsaet.md` §4b).

## Jonas' beslutninger (ordret)

| Tid (2/10) | Ordret | Betyder |
|---|---|---|
| 20:05 | «er det med vilje man ikke lige ser sine nyeste tal i en kolonne i toppen som på den gamle?» | Tallene (Din måned) tilbage på forsiden, øverst i højre kolonne. |
| 20:09 | «kunne også være et lille badge i en kollonne der siger, hvis man har 1:1 sessions tilgode. Du skal ikke være bange for at arbejde i 2 kolonner, når det giver mening. Men jeg vil have, at forsiden er en samling af det vigtigste vide lige nu for medlemmet.» | To kolonner fra xl; «Til gode»-kortet. |
| ~20:20 | «Dumt spørgsmål. Uanset hvordan og hvorfor, hvis man har en gratis 1:1 session, uanset om det er med Morten, Jonas eller begge, så skal det fremgå.» | ÉN regel: kan medlemmet booke en gratis session, står den der. |
| ~20:20 | «+ Tilføj skridt» væk fra forsiden: «Ja» | Tilføj bor på Dine mål. |
| ~20:20 | Stedsætningen: «Kun første 30 dage» | `HbStedsSaetning` på forsiden kun de første 30 døgn. |
| ~20:20 | «Jeg vil gerne se desktop også.» | Mockuppen vist i 1440 og 375. |
| 20:41 | «Sådan skal du bygge forsiden. Og du skal ikke gå på kompromis.» | Denne fil. |

## Tjeklisten

Rækkefølgen i HTML = prioritet = mobil = skærmlæser. Ingen `order`/`display: contents` (a11y).

### 0. Rammen
- [ ] Hilsen: «God aften, {navn}.» (`getGreeting`/«Velkommen» som i dag) og under den KUN datoen («Fredag 2. oktober»).
- [ ] Stedsætningen på forsiden KUN de første 30 døgn af medlemskabet (ellers ingen).
- [ ] Pakning: grid `xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]`, `xl:grid-flow-dense`, rækker á 4 px; hvert felt måler sin højde (ResizeObserver) og spænder `ceil((h+32)/4)` rækker; kolonnen eksplicit (`xl:col-start-1/2`). Under xl: én kolonne, 32 px mellem felterne.
- [ ] DOM-rækkefølge: Vigtigst (1) → Til gode (2) → Tal og Score (2) → Din plan (1) → Din rådgiver (2) → Næste i Netværket (1).
- [ ] Sektionshoveder i husets form (rust-eyebrow + hairline + rust-link — `HbSection`).
- [ ] ÉT datoformat i alle kort: «tirs. 20. okt.» (år kun når det ikke er i år).
- [ ] Fornyelsesbåndet står hvor det står i dag (over felterne), kun når der er et tilbud.

### 1. Det vigtigste lige nu (venstre, først)
- [ ] HbCard p-6/md:p-8; mikro «Det vigtigste lige nu»; h2 serif 1.9rem; teksten; ÉN udfyldt knap.
- [ ] Det primære punkt er fokusmotorens (`deriveFocus` — uændret dom).
- [ ] Rapport-punktet siger fristen og streaken, KUN når det er sandt: «Frist tirs. 20. okt. Godkend dem til tiden, så holder din streak.» (fristen = `STREAK_FRIST_DAG` rykket til hverdag; «holder din streak» kun når streaken er i live).
- [ ] Under knappen højst 1–2 linjer, der IKKE er plan-punkter. «Kom godt i gang · N af M — næste: {punkt} · Se listen →» så længe tjeklisten ikke er færdig. Ingen linje, der gentager Din plan.
- [ ] Den svævende tjekliste-pille vises ikke over forsiden (linjen i kortet afløser den dér).
- [ ] «Måske relevant» højst én linje (som i dag).

### 2. Til gode (højre, øverst — kun når der ER noget til gode)
- [ ] Kortet: `border-hb-evergreen/30 bg-hb-sage/30`, evergreen mikro «Til gode», serif «1 gratis 1:1-session» / «2 gratis 1:1-sessioner», én række pr. rådgiver: ansigt, «1:1 med Morten», «Book →» (til `/book-session`).
- [ ] Reglen er ÉN ren dom, som er den SAMME, backenden booker efter: fuldt medlem med kontrakt i fremtiden, og retten ikke brugt — for Jonas efter tilbuddet (`jonasRetEfterTilbud`).
- [ ] Ingen sessioner til gode = intet kort, ingen plads.

### 3. Sådan har I det (højre)
- [ ] Eyebrow «Sådan har I det» + link «Se alle tal» (`/reports`).
- [ ] Det rigtige `DinMaaned`-kort med `dinMaanedDom` (uden CTA). Er tallene gamle: rust «N måneder gamle» oppe til højre i kortet.
- [ ] Score kompakt: ring med «/ 1.000»; fire søjler (navn + point; én kolonne ved xl, to fra 1500 px og på sm); streaklinjen med flammen; «N af 8 trofæer»; «Certifikatet åbner om N dage» med lås (certifikatkortet udgår af forsiden); «LØFTER MEST …» (aldrig det samme som det primære punkt); «Se hvad der tæller ⌄» + «Et helbredstal, ikke en kreditvurdering.»

### 4. Din plan (venstre)
- [ ] Rust eyebrow «Din plan» + link «Dine mål».
- [ ] Gamle mål: ÉT kort; hver målrække: chip «Uden tal endnu», frist (rust ved «frist i dag»/forfalden), serif titel, stille bar, «N af M skridt gjort · Sæt et tal på →»; til højre mikro «Skridt» og enten «✓ Alle skridt er gjort · Er I i mål?» eller skridtrækken med TEKSTKNAPPER Gjort/Udskyd.
- [ ] «Uden mål»-rækker inde i SAMME kort.
- [ ] Forslag: «Venter på jeres ja», «N forslag til mål», titlerne, «Et mål tæller først, når I har sagt ja.», «Tag stilling →»; under det rådgiverens skridtforslag «Forslag fra Morten» med Tag den / Nej tak.
- [ ] Intet «+ Tilføj skridt» på forsiden.
- [ ] Tal-mål (motorens kort) og det mørke tomme kort som i #1247, i samme sektion.

### 5. Din rådgiver (højre)
- [ ] To ansigter (fotos) + «Morten og Jonas».
- [ ] Den seneste besked FRA EN RÅDGIVER (aldrig medlemmets egen) med navn og dato; en video vises som kursiv «Sendte en video».
- [ ] Composeren «Skriv til os …» med sekundær «Send» (chattens skrivevej, `indsaetChatBesked`).

### 6. Næste i Netværket (venstre, nederst)
- [ ] Næste event: datoblok, «Næste event», titel, meta med værter, «Tilmeld · Kan ikke» (på egen linje på mobil).
- [ ] «Nyeste i Community»: ansigt, titel (truncate), «Læs».

### 7. Prøven
- [ ] Hver flade-PR prøves i harnessen på Topix' RIGTIGE tal og på «typisk» (tal fra juni, forslag, Morten til gode) i 1440 og 375 — FØR merge.
- [ ] Efter Jonas' Update: UX-agent i drift (1440/1024/375, som medlem, frisk fane) mod denne liste; «RET NU» rettes samme dag.

## Målt i prod 2/10-2026 ca. 20:50 — 1:1-reglerne var uenige

Medlemmets «til gode» skal være det, backenden faktisk lader medlemmet booke. Der var TRE regler:

1. `create-free-intro-booking` (backenden) booker kun, når kolonnen er `NULL` (atomisk `IS NULL`).
2. `afgoerBookSession` (/book-session) dømmer på `!!jonas_session_used_at` — samme som backenden.
3. `manglerAtBooke`/`jonasRetEfterTilbud` (rådgiverens forside) dømmer et TILBUD som overtrumfende en ældre «brugt».

Målt: fem virksomheder er tilbudt Jonas-sessionen 1/10 kl. 13:43–13:44 (ANLA GLAS, BR Roset, Rallysupport, remm.,
Warburg VVS) — ALLE fem har `jonas_session_used_at` ≤ tilbuddet. Rådgiverens forside siger «mangler at booke»,
men medlemmets /book-session viser det KØBTE kort, og backenden ville svare 409. Tilbuddet kunne ikke bookes.
Rettelsen (PR «Én regel for gratis 1:1»): én ren dom spejlet i `_shared`, brugt af backenden (compare-and-set på
den læste værdi i stedet for `IS NULL`), /book-session og forsidens «Til gode».

**Rettet** (PR «Én regel for den gratis 1:1»): `lib/sessionRet` ⇄ `_shared/sessionRet` er reglen; backenden,
/book-session, virksomhedssiden, `intro-reminder-cron`, EditCompanyDialog og forsidens «Til gode» dømmer med den.
CTO-rådets fund rettet i samme PR: tilbuddet låses i gaten (fund 2), dialogen skriver kun ved ændring (fund 3–4),
/book-session dømmer kontrakten som backenden — slutdagen er sidste dag med adgang (fund 5), preflight bærer
beviset (fund 6), de rå læsere er flyttet (fund 8). **Åbent:** «Mangler at booke» kræver `omfattetAfJonas`; tre
ældre medlemmer (Brick Works, E-skilte, TuaMea Jewelry) har Jonas-kolonnen NULL uden tilbud — de kan booke og står
i «Til gode», men tæller ikke hos rådgiveren. Jonas afgør, om de skal have sessionen (så: tilbyd) eller ej (så:
markér brugt).
