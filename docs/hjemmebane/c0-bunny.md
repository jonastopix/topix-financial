# C0 — Bunny Stream-opsætningsguide (leverance 3)

> **Formål:** Oprette Bunny Stream-kontoen korrekt fra dag ét: EU-region, privat afspilning
> via signerede embed-URL'er, og nøglerne gemt de rigtige steder. Guiden er en klikvejledning
> — der skrives INGEN credentials i denne fil eller i git, nogensinde.
>
> **Tidsforbrug:** ~20 min + ventetid på video-encoding i testen.
>
> *Labels i Bunnys dashboard kan afvige let fra nedenstående (UI'et opdateres løbende) —
> funktionerne findes, led efter det tilsvarende navn.*

---

## 1. Kontooprettelse

1. Gå til **bunny.net** → **Sign up**. Brug `jonas@topix.dk` (eller en fælles konto-mail,
   hvis andre skal kunne logge ind — beslut før oprettelse; ejerskifte er bøvlet bagefter).
2. Bekræft e-mailen.
3. **Aktivér 2FA med det samme:** Dashboard → konto-menuen (øverst til højre) →
   **Account Settings** → **Security** → Two-Factor Authentication → følg guiden.
   Kontoen kommer til at bære alt medlemsvideo-indhold — 2FA er ikke valgfrit.
4. **Betaling:** Bunny er forudbetalt (credit-baseret). Dashboard → **Billing** →
   tank op med det mindste beløb (typisk $10) eller start på deres trial. Slå
   **auto-recharge** til med et lavt loft, så videoerne ikke dør den dag kreditten løber
   tør — det er en driftsrisiko med hård deadline-effekt (afspilning stopper).

## 2. Opret Video Library (EU)

1. I venstremenuen: **Stream** → **Add Video Library**.
2. **Navn:** `boardroom-hjemmebane`.
3. **Region/replication:** vælg KUN europæiske regioner (fx Falkenstein/Tyskland som
   primær + evt. London/Stockholm som replikering). **Vælg ingen US/APAC-regioner** —
   GDPR-hensynet er hele pointen, og primærregionen kan ikke ændres bagefter.

   > ⚠️ **Fund fra den faktiske opsætning (2026-08-04):** Bunny FORHÅNDSVÆLGER
   > replikeringsregioner uden for EU (Los Angeles, New York, Singapore) — de SKAL
   > fravælges manuelt FØR library'et oprettes. Primærregionen hedder
   > **"Frankfurt (DE)"** i UI'et — guidens "Falkenstein" dækker samme valg.
4. Klik **Add/Create**.
5. Notér **Library ID** (tallet i URL'en/oversigten — bruges i embed-URL'er og API-kald).

## 3. Sikkerhedsopsætning på library'et (det vigtigste afsnit)

Åbn library'et → **Security** (eller "Player & Security"):

1. **Embed View Token Authentication: TIL.** Dette er kernen — uden token kan
   embed-URL'en ikke afspilles, heller ikke hvis nogen deler linket. Når den slås til,
   vises en **Token Authentication Key** — den skal gemmes som secret i trin 4, og den
   må ALDRIG ende i frontend-kode eller git.

   > ⚠️ **Forvekslingsfælde (fund 2026-08-04 — kostede et fejlsøgningsloop):** I
   > Bunnys nuværende UI bærer det maskerede felt nederst på **Security → General**
   > labelen **"API key"** — men det ER Token Authentication Key (den, der signerer
   > embed-URL'er og skal i `BUNNY_STREAM_TOKEN_AUTH_KEY`). Den må IKKE forveksles
   > med library'ets rigtige API Key under **API-fanen** (som skal i
   > `BUNNY_STREAM_API_KEY`). Forvekslingsrisikoen er reel.
2. **"Enable direct play" (Security → General): FRA.** Fund fra den faktiske opsætning
   (2026-08-04): Bunny har den **TIL som default**, og den omgår token-kravet —
   Bunnys egen tekst: "anyone with the URL or video ID" kan afspille. Token-
   beskyttelsen er reelt slået fra, indtil denne toggle slås FRA.
3. **Block Direct URL File Access: TIL** (hvis den findes som separat toggle) — blokerer
   direkte hentning af videofiler uden om playeren.
4. **MP4 Fallback: FRA** — genererer direkte-downloadbare filer, som underminerer
   token-beskyttelsen. Fund fra opsætningen: togglen bor under **Encoding-fanen**
   (ikke Security); den stod FRA som default.
5. **"Early-Play" (Encoding): FRA** — eksponerer originalfiler offentligt under
   encoding og skal stå fra.
6. **"Keep original files" (Encoding): TIL — bevidst.** Re-encode-forsikring
   (originalen kan re-processeres ved codec-/kvalitetsskift). Originalerne er
   utilgængelige udefra, når punkt 2 + 5 er FRA og direct file access er blokeret.
7. **Allowed Referrers:** tilføj `app.theboardroom.dk`. Det er et ekstra lag oven på
   tokens (ikke en erstatning). Lad være med at tilføje `*`. Bemærk konsekvensen for
   testmetoden i afsnit 6: en nøgen browser-åbning uden referrer viser 403 uanset
   gyldigt token.
8. Under library'ets **API**-fane: notér **API Key** (library-scoped AccessKey — bruges
   til upload/administration via API senere i migreringssprintet).

## 4. Nøgler → Lovable secrets (navngivning følger husets stil)

Lovable → projektet → backend/Cloud-indstillinger → **Secrets** (samme sted som
`STRIPE_SECRET_KEY` m.fl. ligger). Opret:

| Secret-navn | Værdi fra Bunny | Bruges til |
|---|---|---|
| `BUNNY_STREAM_LIBRARY_ID` | Library ID (tal) | embed-URL'er + API-kald |
| `BUNNY_STREAM_API_KEY` | Library'ets API Key (AccessKey) | video-upload/administration fra edge functions |
| `BUNNY_STREAM_TOKEN_AUTH_KEY` | Token Authentication Key fra Security-fanen | signering af embed-URL'er (server-side, ALDRIG frontend) |

Regler:
- **Ingen af dem må ligge i git, i `VITE_*`-variabler eller i frontend-koden.** Signering
  af embed-URL'er sker i en edge function (Bucket A — `authenticateUser` først), som
  bygges i et senere sprint. Frontend modtager kun den færdige, tidsbegrænsede URL.
- Library ID er ikke hemmeligt i sig selv, men gemmes som secret alligevel, så al
  Bunny-konfiguration bor ét sted.
- Hvis en nøgle nogensinde lækker: Bunny-dashboardet kan regenerere både API Key og
  Token Authentication Key — regenerér, opdatér secret, færdig.

## 5. Sådan ser en signeret embed-URL ud (til reference for edge function-sprintet)

```
https://iframe.mediadelivery.net/embed/{LIBRARY_ID}/{VIDEO_GUID}?token={TOKEN}&expires={EXPIRES}
```

- `EXPIRES` = unix-tid (sekunder) for udløb, fx nu + 3600.
- `TOKEN` = SHA256-hex af strengen `TOKEN_AUTH_KEY + VIDEO_GUID + EXPIRES` (ren
  sammenkædning, ingen separatorer).

## 6. Verifikations-test (skal gennemføres før C0 lukkes)

> **Metodenote — sådan aflæses testen (fund 2026-08-04):** Embed-endpointet svarer
> **HTTP 200 på ALT** — statuskoden er ubrugelig som dommer. Dommeren er `<title>` i
> svar-kroppen: en 403-fejlside (`<title>403</title>`) vs. en player-side (markører:
> `hls.min.js` / Plyr). "Allowed domains"-låsen (afsnit 3.7) betyder desuden, at en
> nøgen browser-åbning UDEN referrer viser 403 uanset gyldigt token — den negative
> browsertest i b) er derfor fortsat gyldig, men positivt bevis køres med curl og
> referrer:
>
> ```sh
> curl -s -e "https://app.theboardroom.dk/" "$URL" | tr -d '\n' | grep -o '<title>[^<]*</title>'
> ```
>
> 403-titel = afvist; ingen 403-titel + hls-markør i kroppen = player leveret.
> Alternativt: afspilning i appen (/akademiet), som er det endelige bevis.

**a. Upload testvideo:** Stream → `boardroom-hjemmebane` → **Upload** → vælg en lille
video (30 sek. er fint). Vent til status er **Finished** (encoding). Klik videoen og
notér dens **Video GUID**.

**b. Negativ test (beviser at beskyttelsen virker):** Åbn i inkognito-vindue:
```
https://iframe.mediadelivery.net/embed/<LIBRARY_ID>/<VIDEO_GUID>
```
**Forventet: afspilning NÆGTES** (403 / "authentication required"). Hvis videoen spiller,
er Embed View Token Authentication ikke slået til — tilbage til trin 3.1.

**c. Positiv test (signeret URL):** Kør i Terminal — nøglen indtastes skjult ved runtime
og gemmes ingen steder. **Fremgangsmåden er zsh-kompatibel** (macOS' default-shell er
zsh, hvor bash-formen `read -s -p "…"` fejler med `read: -p: no coprocess` — og en
fejlet read giver en TOM nøgle, så tokenet signeres med tom streng og testen fejler
uforklarligt). Tre trin:

**Trin 1 — variabler uden hemmeligheder:**

```sh
VIDEO_GUID="<GUID>"
LIBRARY_ID="<ID>"
EXPIRES=$(( $(date +%s) + 3600 ))
```

**Trin 2 — nøglen, i præcis denne rækkefølge:** Kør `read -s BUNNY_KEY` **ALENE** og
lad markøren vente. Hent FØRST DEREFTER nøglen i Bunny (Security → General,
kopiér-ikonet) og indsæt + Enter. Rækkefølgen er afgørende: **kopieres nøglen FØR
read venter, overskrives udklipsholderen af kommandoteksten**, og du indsætter
kommandoen i stedet for nøglen.

```sh
read -s BUNNY_KEY
```

**Trin 3 — signér, udskriv, ryd op:**

```sh
TOKEN=$(printf '%s%s%s' "$BUNNY_KEY" "$VIDEO_GUID" "$EXPIRES" | shasum -a 256 | cut -d' ' -f1)
echo "https://iframe.mediadelivery.net/embed/${LIBRARY_ID}/${VIDEO_GUID}?token=${TOKEN}&expires=${EXPIRES}"
unset BUNNY_KEY
```

Verificér URL'en med curl-metoden fra metodenoten (referrer påkrævet — nøgen
inkognito-åbning viser 403 pga. Allowed domains). **Forventet: player-side leveres /
videoen afspiller i appen.**

**d. Udløbs-test (valgfri men hurtig):** Kør snippet'en igen med `EXPIRES=$(( $(date +%s) - 60 ))`
(udløbet for et minut siden) — URL'en skal nægtes.

**e. Ryd op:** Udgår — testvideoen viste sig at være reelt produktionsindhold og
beholdes med sit rigtige navn (se noten i afsnit 7). `_canary`-omdøbningen fra den
oprindelige guide er dermed bortfaldet; videoen fungerer alligevel som permanent
kanarie til fremtidige signeringstests.

**Testen er bestået når b) nægter, c) spiller og d) nægter.** Skriv resultatet + dato i
denne fil under afsnit 7.

## 7. Testresultat (gennemført af Jonas)

| Trin | Resultat | Dato |
|---|---|---|
| b) Usigneret embed nægtes | BESTÅET — 403 i browser + `<title>403</title>` via curl | 2026-08-04 |
| c) Signeret embed spiller | BESTÅET — player-side m. `hls.min.js`/Plyr via curl m. referrer; visuelt bevist i `/akademiet` | 2026-08-04 |
| d) Udløbet token nægtes | BESTÅET — `<title>403</title>` via curl m. referrer | 2026-08-04 |
| Secrets oprettet i Lovable (alle 3) | JA | 2026-08-04 |
| 2FA aktiveret | JA | 2026-08-04 |
| Auto-recharge slået til | JA | 2026-08-04 |

> **Note om testvideoen:** Testen blev kørt mod reelt produktionsindhold —
> **"0. Admin - Introduktion.mp4"**, GUID `5c6191a2-c148-470a-b5d2-e9740a25fac7`,
> Library ID `720547` — og videoen beholdes som den er. Den fungerer samtidig som
> **permanent kanarie** til fremtidige signeringstests (fx efter nøgle-rotation
> eller ændringer i `get-video-embed`); §6e's `_canary`-omdøbning er udgået.
> (GUID og Library ID er ikke hemmeligheder — de indgår i klartekst i enhver
> embed-URL; nøglerne bor fortsat KUN i Bunny-dashboardet og Lovable secrets.)

---

## 8. Hvad guiden bevidst IKKE dækker (senere sprints)

- **Upload-pipeline** (Circle/originaler → Bunny via API) — migreringssprintet.
- **Signerings-edge-function** (Bucket A) der udsteder embed-URL'er til frontend.
- **Player-integration** i Hb-komponenterne (`content_items.bunny_video_id` fra datamodellen).
- **Prisovervågning:** Stream afregnes pr. GB lagring + levering; se aktuel pris på
  bunny.net/stream — ved vores volumen (≈40 lektioner + talks) er det småbeløb, men
  auto-recharge-loftet (trin 1.4) er sikkerhedsnettet.

---

*C0-leverance 3 · Projekt Hjemmebane · 2026-08-04 · Ingen credentials i denne fil — nøgler bor kun i Bunny-dashboardet og Lovable secrets.*
