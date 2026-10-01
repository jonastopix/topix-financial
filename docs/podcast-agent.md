# Podcast-agenten — designpapir (udkast 1/10-2026)

Jonas 30/9 22:02: en agent, der tager Riverside-optagelserne og laver en fuldautomatisk pakke til Spotify for Creators — hele optagelsen, lyd og lys, klip, intro, hooks, beskrivelse, titel og korte klip pr. platform.

Grundlag: læst i repoet og slået op på nettet 1/10. Intet er målt i prod, og jeg har ikke set Topix' Riverside-konto. Hvilken Riverside-plan I har, er derfor IKKE MÅLT.

---

## 1. Anbefalingen på én skærm

**Sig fra over for «fuldautomatisk».** Det afgørende skridt — at noget går ud i jeres navn på Spotify, YouTube og LinkedIn — skal have et menneskes klik. Det er husets regel N1 (`docs/agentarkitektur.md` §1.3: «tekst, der går ud af huset, godkendes altid»), og her er den også tvunget af virkeligheden: Spotify har intet upload-API [S1], og Riversides udgivelse til Spotify lander som **kladde**, hvor nogen trykker *Publish/Schedule* [R5].

| | Hvad | Hvorfor |
|---|---|---|
| **Fuldautomatisk (N3)** | Hente transskriptionen; skrive udkast til titel, beskrivelse, kapitler, 3–5 hooks og 5–8 klip-forslag med tidskoder; dømme udkastet mod transskriptionen (talværn) | Det skriver ikke ud af huset. Det er bare et forslag. |
| **Ét klik (N1)** | Godkende pakken; skære klip i Riverside; trykke *Publish/Schedule* i Spotify for Creators; udgive på YouTube/LinkedIn/Instagram | Det er jeres stemme, der går ud. Spotify kræver klikket alligevel. |
| **Bygger vi IKKE selv** | Lyd (Magic Audio), redigering, rendering af klip i 16:9/9:16/1:1, undertekster, export til Spotify og YouTube | Riverside gør det allerede [R3][R6][R7][R8]. Det er netop den del, hvor vores eget system ville være svagest: tung video kan ikke køre i edge functions (husets jobs har 60 s timeout, CLAUDE.md), og `agentarkitektur.md` §3.6 kræver ffmpeg i en container *uden for* Supabase. Den container har vi ikke. |

**Om Riversides Magic Clips kan dansk, er IKKE afgjort.** (RETTET 1/10 ~02:40 af hovedsessionen: udkastet påstod «kun engelsk, tysk, spansk, fransk og portugisisk» med [R2] som kilde — men de fem sprog er hjælpecentrets sprogvalg, ikke funktionens; artiklen nævner ingen sprog for Magic Clips. Måles ved at køre Magic Clips på én dansk episode.) Transskriptionen kan dansk [R4]. Uanset udfaldet er den sikre arbejdsdeling: vores agent vælger klippene ud fra den danske transskription, og Riverside skærer og renderer dem. Om Co-Creator (Riversides AI-assistent) skriver godt på dansk, står ikke i dokumentationen [R9]. Det har jeg ikke målt.

**Lys:** Ingen af de værktøjer, jeg har slået op, retter lys i video efter optagelsen. Lyset skal løses i studiet. Det er ikke noget, en agent kan klare.

---

## 2. Flowet trin for trin

| # | Trin | Værktøj | Hvem | Kilde |
|---|---|---|---|---|
| 1 | **Optagelse** med lokal optagelse af hvert spor | Riverside studio | Jonas/Morten | Pr. deltager findes sporene `raw_audio`, `raw_video`, `aligned_video` og `compressed_audio` [R1b] |
| 2 | **Lyd**: Magic Audio på alle spor | Riverside editor | 1 klik (kan sættes som standard) | Kræver Pro, Grow, Webinar eller Business [R3] |
| 3 | **Transskription** (dansk) | Riverside | automatisk | Dansk er understøttet [R4]. Hentes som `srt`/`txt` via API'et [R1c] eller manuelt fra editoren |
| 4 | **Pakken**: titel (3 forslag), beskrivelse, kapitler med tidskoder, 3–5 hooks, 5–8 klip-forslag (start/slut + hvorfor) | Vores agent: LLM via Lovable AI Gateway, samme vej som `run-company-agent`/nyhedsagenten | N3 skriver, **N1 godkender** | `agentarkitektur.md` §1.4, CLAUDE.md «Nyhedsagenten» |
| 5 | **Talværn og godkendelse** | Husets værn (se §3), derefter et godkendelseskort | Jonas eller Morten | `nyhedAgent.ts` `talIkkeIKilden` |
| 6 | **Hele episoden**: klip intro på og fjern pauser | Riverside editor | 1 menneske, ~10 min. **IKKE MÅLT** | Riversides MCP kan «cut edits, export edits» på Grow og højere [R10] — kan senere gøres af Claude, se §4 |
| 7 | **Korte klip** ud fra agentens tidskoder: 9:16 (Reels/Shorts/TikTok), 1:1 (LinkedIn/feed) og 16:9 (Spotify/YouTube) | Riverside editor | 1 menneske pr. klip | Formaterne står hos [R7] |
| 8 | **Spotify**: Share → Spotify → kladde i Spotify for Creators → indsæt titel og beskrivelse → *Publish/Schedule* | Riverside → S4C | **Jonas klikker** | Virker på alle planer, kun i browser [R5]. Video vises i 16:9, H.264/AAC [S2] |
| 9 | **YouTube**: Share → YouTube (privat/unlisted/public, kan planlægges) | Riverside | **Jonas klikker** | Kræver Pro eller højere [R6] |
| 10 | **Instagram/TikTok/LinkedIn** | Manuel upload | Jonas | Riverside har ingen dokumenteret udgivelse dertil i integrationsoversigten [R8] |

**Hvorfor agenten ikke uploader til YouTube selv:** Et uverificeret API-projekt kan kun uploade *private* videoer, indtil Google har auditeret projektet [Y1]. Riversides YouTube-knap giver det samme med ét klik [R6].

---

## 3. Værn

1. **Ingen tal eller påstande, der ikke står i optagelsen.** Agenten må kun skrive ud fra transskriptionen. Husets værn genbruges: hvert tal i titel, beskrivelse og hooks skal stå ordret i transskriptionen, og hele tal dømmes som hele tokens («6» står ikke i «2026»). Det er nyhedsagentens `talIkkeIKilden`. Hvert hook bærer sin tidskode, og citatet skal findes i `srt`-filen. Agenten skriver ingen links; dem sætter vi selv (samme regel som nyhedsagenten). **Ekstra fare her:** dansk transskription har fejl (Whisper ~27,5 % CER, Røst ~11,6 %, `vision-uafhaengighed.md` spor 5). Et fejlhørt tal kan altså bestå værnet. Derfor er N1 ikke til forhandling for tal og navne.
2. **Gæsters samtykke.** Sæson 2 er jer to, der svarer på lytterspørgsmål. Spørgerens navn må ikke stå i titel eller beskrivelse uden et ja. Er der en gæst: skriftligt samtykke til optagelse, klip og brug på sociale medier *før* optagelsen. Et klip er en ny sammenhæng og kan tage en udtalelse ud af kontekst. Hvordan samtykket konkret skal se ud, er IKKE SLÅET OP — Jonas har tidligere besluttet uden jurist (21/9, Meta), men her er der en tredjepart.
3. **Intromusik og rettigheder.** Kun musik med en skriftlig licens til podcast *og* sociale klip. Licensen gemmes i repoet sammen med filen. Hvad Spotify for Creators kræver af musikrettigheder, har jeg IKKE SLÅET OP. AI-genereret musik vælges kun med skriftlig ret til kommerciel brug (samme regel som for illustrationer, `agentarkitektur.md` §3.5).
4. **Ingen syntetisk stemme eller dubbing.** Riverside kan oversætte og efterligne stemmer [R9]. Det bliver ikke slået til: «en syntetisk Morten er både art. 50-deepfake og brandbrud» (`agentarkitektur.md` §3.6).
5. **Tørkørsel som standard plus lås.** Hvis agenten senere får hænder (MCP eller API), følger den husets form: `dry_run` er standard, og en lås i `app_config` er `false`, indtil Jonas slår den til. Klikket for at udgive bliver altid menneskets — i praksis gør Spotify det umuligt at automatisere [S1].

---

## 4. Skiver

**Uge 1 (kan stå klar uden ny infrastruktur):**
- En prompt plus værn, der tager en indsat `srt`-fil og giver pakken: titler, beskrivelse, kapitler, hooks og klip-tidskoder med citat.
- Kørsel: Jonas eksporterer `srt` fra Riverside og giver den til Claude. Claude leverer pakken plus talværnets dom. Jonas klipper og udgiver i Riverside.
- Måling: hvor mange forslag godkendes uændret, og hvor lang tid går der fra optagelse til udgivelse? Begge er IKKE MÅLT i dag.
- Forudsætning: Magic Audio kræver Pro eller højere [R3].

**Senere (først når skive 1 har kørt 3–4 episoder):**
- **Skive 2 — Riverside-MCP (kræver Grow):** Claude søger i transskriptionen, skærer klippene ud fra de godkendte tidskoder og eksporterer dem [R10]. Det fjerner trin 6–7 som håndarbejde. Hvad MCP'en konkret kan med et dansk transskript, er IKKE MÅLT. Hvert skridt forbliver N1.
- **Skive 3 — Business-API (kun hvis den kommer gratis):** API'et kan hente optagelser, eksporter og transskriptioner [R1a][R1c], men det gives kun til «select Business accounts» gennem en customer success manager [R1]. Webhooks findes kun for webinarer, ikke for «optagelse klar» [R1d], så vi måtte polle. Det er ikke pengene værd til en podcast med ~1 episode ad gangen.
- **Auphonic** er kun relevant, hvis Magic Audio ikke er godt nok. Auphonic har et API til multitrack med per-spor støjfjernelse og ducking [A1] og automatiske shownotes/kapitler [A3]. Det dublerer ellers Riverside.

---

## 5. Omkostninger

| Post | Pris | Status |
|---|---|---|
| Riverside Pro | $24/md. årligt, $29 månedligt | Dokumenteret [R11] |
| Riverside Grow (påkrævet for MCP) | $34/md. årligt, $39 månedligt | Dokumenteret [R11] |
| Riverside Business (påkrævet for API) | Tilbud | Ikke prissat offentligt [R11] |
| Spotify for Creators-hosting | — | IKKE SLÅET OP |
| YouTube-upload via API | 1 enhed pr. upload, 100 pr. dag | Dokumenteret [Y1]. Ikke relevant, hvis Riverside udgiver |
| Auphonic | 2 timer gratis pr. md. Abonnement S–XXL | Kronebeløb IKKE LÆST [A2] |
| LLM til pakken (Lovable AI Gateway) | Pris pr. token | UMÅLT (som for nyhedsagenten) |
| Menneskelig tid pr. episode | — | IKKE MÅLT |

---

## 6. Åbne spørgsmål til Jonas

1. Hvilken Riverside-plan har I? Pro er minimum for Magic Audio og YouTube. Grow giver MCP'en.
2. Fortsætter podcasten nu? Sidste episode var 17/9-2025 (`OVERLEVERING.md` §45), og podcasten blev taget ud af platformen 15/9-2026. Agenten er kun værd at bygge, hvis der kommer episoder.
3. Hvem godkender pakken — dig, Morten eller den af jer, der ikke var vært?
4. Hvilken intromusik har I, og findes licensen på skrift?
5. Hvilke sociale kanaler skal have klip? Instagram, TikTok og LinkedIn betyder manuel upload i dag.

---

## Hvad der allerede findes i repoet (læst 1/10)

- `src/lib/hjemmebane/podcastSpotify.ts`: ét link til showet «IVÆRKSÆTTERLIVET» (`open.spotify.com/show/4T8krtMFTkRgF21bkNsQ6Q`), givet til medlemmer i `HbSidebar`. Podcasten er ude af platformen ifølge beslutning 17 (#888).
- `OVERLEVERING.md` (11/9): episodelinks under `podcasters.spotify.com/pod/show/topixdk`, dvs. hostet hos Spotify for Creators, 18 episoder. `supabase/functions/podcast-rss` findes ikke længere (`ls` 1/10).
- «PengePulsen» optræder kun som testdata for link-kort (`CommunityLinkKort.test.tsx`).
- `agentarkitektur.md` §3.6: videografen er «klip, ikke generering», dansk transskription kræver N1 i mindst 6 uger, og rendering foregår uden for edge functions. Dette papir følger det.
- Husets mønstre, der genbruges: N0–N3 (§1.3), tørkørsel + lås, talværnet fra nyhedsagenten og Lovable AI Gateway som LLM-vej.

---

## 7. Kilder (slået op 1/10-2026)

- [R1] Riverside API Quickstart: https://docs.riverside.fm/quickstart.md — «for select Business accounts only»; v1/v2 sunset 24/2-2026
- [R1a] Endpoints-indeks: https://docs.riverside.fm/llms.txt
- [R1b] File-objektet: https://docs.riverside.fm/object-reference/file.md
- [R1c] Download Transcription File: https://docs.riverside.fm/endpoints-reference/v3/download-transcription-file.md
- [R1d] Webhook-hændelser (kun webinar/registrant): https://docs.riverside.fm/webhooks/event-types.md
- [R2] About Magic Clips: https://support.riverside.com/hc/en-us/articles/12124048765981-About-Magic-Clips
- [R3] Magic Audio: https://support.riverside.com/hc/en-us/articles/15079835638301-Magic-Audio-tracks-Overview
- [R4] Transskriptionssprog: https://support.riverside.com/hc/en-us/articles/9173731506589-Which-languages-can-Riverside-transcribe
- [R5] Publish to Spotify: https://support.riverside.com/hc/en-us/articles/16677194078109-Publish-my-episode-to-Spotify
- [R6] Publish to YouTube: https://support.riverside.com/hc/en-us/articles/5260565927965-Publish-to-YouTube
- [R7] Klip-formater: https://support.riverside.com/hc/en-us/articles/8665072341789-How-do-I-create-a-clip-for-social-media
- [R8] Integrationer: https://support.riverside.com/hc/en-us/articles/13493160790685-Riverside-integrations-Overview
- [R9] Co-Creator: https://support.riverside.com/hc/en-us/articles/28827095144733-AI-Co-Creator-Overview · AI-oversigt: https://support.riverside.com/hc/en-us/articles/20173322157341-AI-at-Riverside-Everything-you-need-to-know
- [R10] Riverside MCP: https://support.riverside.com/hc/en-us/articles/37803607978141-Connect-to-Riverside-MCP
- [R11] Priser (Riversides blog 10/9-2026): https://riverside.com/blog/is-riverside-free — selve prissiden kunne ikke hentes
- [S1] Spotify Community, officielt svar 23/7-2025, intet upload-API: https://community.spotify.com/t5/Spotify-for-Developers/Request-for-Access-to-Upload-Podcasts-to-Spotify-from-External/td-p/7044523
- [S2] Videokrav, Spotify-hostet: https://support.spotify.com/td-en/creators/article/video-episodes-for-podcasts-hosted-with-spotify/
- [S3] Video for ikke-Spotify-hostede (Distribution API kun via partnerhosts): https://support.spotify.com/us/creators/article/video-episodes-for-shows-not-hosted-with-spotify/
- [Y1] YouTube videos.insert: https://developers.google.com/youtube/v3/docs/videos/insert
- [A1] Auphonic multitrack-API: https://auphonic.com/help/api/multitrack.html
- [A2] Auphonic priser: https://auphonic.com/pricing
- [A3] Auphonic talegenkendelse/shownotes: https://eu1.auphonic.com/help/algorithms/speech_recognition.html
