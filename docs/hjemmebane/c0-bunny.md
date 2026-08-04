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
4. Klik **Add/Create**.
5. Notér **Library ID** (tallet i URL'en/oversigten — bruges i embed-URL'er og API-kald).

## 3. Sikkerhedsopsætning på library'et (det vigtigste afsnit)

Åbn library'et → **Security** (eller "Player & Security"):

1. **Embed View Token Authentication: TIL.** Dette er kernen — uden token kan
   embed-URL'en ikke afspilles, heller ikke hvis nogen deler linket. Når den slås til,
   vises en **Token Authentication Key** (kan hedde "Security Key") — den skal gemmes
   som secret i trin 4, og den må ALDRIG ende i frontend-kode eller git.
2. **Block Direct URL File Access: TIL** (hvis den findes som separat toggle) — blokerer
   direkte hentning af videofiler uden om playeren.
3. **MP4 Fallback: FRA** (medmindre vi konkret får brug for den) — MP4-fallback
   genererer direkte-downloadbare filer, som underminerer token-beskyttelsen.
4. **Allowed Referrers:** tilføj `app.theboardroom.dk`. Det er et ekstra lag oven på
   tokens (ikke en erstatning). Lad være med at tilføje `*`.
5. Under library'ets **API**-fane: notér **API Key** (library-scoped AccessKey — bruges
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
og gemmes ingen steder:

```sh
read -s -p "Token Auth Key: " BUNNY_KEY; echo
read -p "Video GUID: " VIDEO_GUID
read -p "Library ID: " LIBRARY_ID
EXPIRES=$(( $(date +%s) + 3600 ))
TOKEN=$(printf '%s%s%s' "$BUNNY_KEY" "$VIDEO_GUID" "$EXPIRES" | shasum -a 256 | cut -d' ' -f1)
echo "https://iframe.mediadelivery.net/embed/${LIBRARY_ID}/${VIDEO_GUID}?token=${TOKEN}&expires=${EXPIRES}"
unset BUNNY_KEY
```

Åbn den udskrevne URL i inkognito. **Forventet: videoen afspiller.**

**d. Udløbs-test (valgfri men hurtig):** Kør snippet'en igen med `EXPIRES=$(( $(date +%s) - 60 ))`
(udløbet for et minut siden) — URL'en skal nægtes.

**e. Ryd op:** Slet testvideoen, eller behold den som permanent "kanarievideo" til at
teste signerings-edge-functionen i senere sprints (anbefalet — omdøb den til `_canary`).

**Testen er bestået når b) nægter, c) spiller og d) nægter.** Skriv resultatet + dato i
denne fil under afsnit 7.

## 7. Testresultat (udfyldes af Jonas)

| Trin | Resultat | Dato |
|---|---|---|
| b) Usigneret embed nægtes | | |
| c) Signeret embed spiller | | |
| d) Udløbet token nægtes | | |
| Secrets oprettet i Lovable (alle 3) | | |
| 2FA aktiveret | | |
| Auto-recharge slået til | | |

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
