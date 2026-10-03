# Åbne opgaver — hvad er ikke færdigt, hvor, og hvem tager det

Dokumentet holdes ajour af Claude ved hver afsluttet opgave; antal åbne kort står i mangellisten.

**Målt 3/10-2026** (ca. kl. 04–05 dansk) mod `origin/main` = `2b7c6bf9` (#1260). Kun recon: ingen kode ændret, intet skrevet i prod; databasen er kun læst med SELECT (Lovable `query_database`, som `postgres`). Hvad der er MÅLT i prod og hvad der er LÆST i repoet/dokumenterne er skilt ad i hver linje. «Ikke målt» betyder, at det ikke er målt her. Efter målingen: #1264 merget 3/10 (kun dokumentation; ingen migration eller function berørt). Mangellisten har nu 209 åbne kort.

Format pr. linje: **hvad** · hvor (gren/PR/fil) · status (målt/læst) · ejer · næste skridt · siden.

Metodenoter (ellers kan tallene misforstås):
- `git log` i dette repo er **podet** (root-commit `c5ff87c9`, 29/9, indeholder 2.173 filer). Alt, der ser ud til at være ændret 29/9 «Chatvideo …», er rodens dato, ikke en rigtig ændring. Datoer før 29/9 kan derfor ikke læses ud af git.
- Squash-merge er afgjort på **PR-nummer + head-sha** (alle 1.251 lukkede PR'er hentet gennem API'et), ikke på commit-ancestry: en gren er «merget», når en merget PR har samme head-sha som grenens spids.
- `supabase_migrations.schema_migrations` er ikke brugt (nyeste række `20260423063420`; SQL editoren skriver ikke dertil).

## Optælling

| Sektion | Optælling |
|---|---|
| 1. Remote-grene (183 refs; 181 med arbejde ud over main) | 152 merget (151 via squash-PR med samme head-sha + 1 ancestor) · **29 ikke merget**: 10 med åben PR, 3 stablet under de åbne PR'er uden egen PR, 3 gamle webinarmotor-grene (PR lukket, afløst af v2), 0 uden PR, 1 merget på titel (`fix/scroll-sr-only`), 3 lukket uden merge (nyere), 6 lukket uden merge (3.–8/9), 3 `lovable-sync*` |
| 1. Lokale worktrees (77 inkl. hovedcheckout) | 65 merget (50 via PR, 15 ancestor) · 10 på ikke-merget remote-gren (webinar-stakken) · 2 med commits uden remote-gren af samme navn · **12 med UCOMMITTEDE ændringer** (alle fundet forældede/stale index undtagen to, se 1c) |
| 2. Åbne PR'er | **10** (8 webinarmotor-PR'er #1255–#1263 fra 3/10, heraf 7 stablede oven på en anden PR; #1146 fra 29/9; #1043 fra 20/9) |
| 3. Migrationer fra 20260915 | 110 på main + 8 på PR-grene = 118. På main: 107 kørt (alle objekter målt til stede) · **3 IKKE kørt** (`20260920100000`, `20261002280000`, `20261002290000`). På PR-grene: **8 ikke kørt** (7 webinarmotor + `20260929210000` events) |
| 4. Låse i `app_config` | 11 låse/flag læst; **7 åbne (`true`)**, 1 lukket (`dag1_klokke_aktiv`), 1 `null` (`webinar_en_dag_video`), 2 konstanter (`ansoegning_cvr_dagsloft` = 20, `velkomstvideo_guid`) |
| 5. Edge functions (116 på main) | 10 med EGEN kode ændret efter sidst bogførte udrulning · 12 uden nogen bogført udrulning og ændret siden 15/9 · 54 kun via delt fil (`_shared`) ændret efter bogført udrulning · resten ændret før eller samme dag som bogført udrulning |
| 6. Bogførte åbne punkter i OVERLEVERING fra 25/9 | 23 linjer her (de seneste, ikke markeret løst) — se §6 |

## De 10 vigtigste fund

1. **Hele webinarmotoren er ude af main og ude af prod.** 8 åbne PR'er (#1255 → #1263, heraf 7 stablede), 7 migrationer ikke kørt (målt: 10 tabeller, ~20 kolonner, cron-job `webinar-motor`, 4 låse mangler); skive 5 (`feat/webinar-chat-bagende`) har siden 3/10 05:38Z PR #1263. Kritisk sti i PR #1258: go/no-go 9/10, tilmelding 14/10, første offentlige session 3/11 kl. 11. Alle PR'er er «Merges ikke uden Jonas' go».
2. **`20261002280000_milestones_with_check` er IKKE kørt** (målt: de to UPDATE-politikker på `milestones` har `with_check = false`; kun INSERT-politikkerne har den). SECURITY_BASELINE fund 6 står åbent siden 2/10. Kræver Jonas' grønne lys.
3. **Fase 3a (`20261002290000_kald_edge_apikey`) er IKKE kørt** (målt: `kald_edge` indeholder hverken `kald_edge_sb_secret` eller `apikey`; vault-posten `kald_edge_sb_secret` findes ikke, 0 rækker). Legacy-nøglerne forsvinder «late 2026, TBC»; Jonas: «i morgen, sammen med mig» (2/10).
4. **Klaviyo lag 5 (`20260920100000_klaviyo_mailhaendelser`) er aldrig kørt** (målt: tabellerne `klaviyo_hentning`, `klaviyo_mailhaendelser` og cron-jobbet `klaviyo-hentning` findes ikke), men edge functionen `klaviyo-hentning-cron` ligger på main og læser `klaviyo_hentning`. Kode uden tabel; ufarlig, så længe den ikke har et job, men en fælde.
5. **Låsene** (målt): ÅBNE `driftsagent_aktiv`, `nyhedsagent_aktiv`, `klaviyo_medlem_aktiv`, `klaviyo_afmeld_aktiv`, `meta_send_aktiv`, `ga_send_aktiv`, `webinar_mail_aktiv`. LUKKET: `dag1_klokke_aktiv` (siden 2/10 18:43, trin 6 står hos Jonas). `webinar_en_dag_video` = `null` (Mortens hilsen ikke sat op).
6. **Update er ikke målt rekursivt** for PR'erne på den samlede liste i §6 (#1224–#1254; OVERLEVERING «Ikke afgjort af målingen»; livetjek 3/10 så dog forside v3, Netværkets faner og «Mangler at booke» i drift): forsidens v3, seks steder, certifikat/rådgiverkort, trofæer, Dine mål-fladen m.fl. kan være merget uden at være i drift. Måles kun rekursivt i en FRISK fane.
7. **Edge functions, hvis kode på main måske ikke kører:** 10 functions har EGEN kode ændret efter sidst bogførte udrulning (bl.a. `stripe-webhook`, `calendly-webhook`, `manage-advisor`, `send-report-reminder`, `webinar-delt`, `import-application`, `berig-virksomheder`, `intro-reminder-cron`, `create-free-intro-booking`, `monday-webhook` samme dag); 12 har ingen bogført udrulning overhovedet (bl.a. `opgave-accepter`, `opgave-udskyd`, `skridt-tilfoej`, `notify-chat-reply`, `send-welcome-message`, `extract-annual-report`). Sikkerhedsfixene fra #1156 (30/9: ejertjek, rådgivergate, konstant-tids signaturer) er i `stripe-webhook`, `calendly-webhook`, `manage-advisor`, `extract-annual-report`, `update-annual-report-revenue`, `notify-chat-reply`, `create-stripe-checkout`, `generate-budget-scenarios` — ikke bogført udrullet.
8. **PR #1146 (events får en lokation)** har ligget åben i 4 dage og venter på, at migrationen `20260929210000` køres og måles først (målt: `events.lokation` findes ikke).
9. **12 worktrees med uncommittede ændringer**; de fleste er stale indeks (sletter filer, der findes på branchen) eller tidlige kladder af arbejde, der siden landede på main. Reelt unikt: 5 untracked webinarmotor-filer i `agent-a17832027d40bd57e` (tidlig kladde, motoren ligger nu i PR'erne) og 1 untracked `docs/marketing-motoren-nicklas.md` i `wt-bogh` (se 1c). Ingen er committet eller pushet.
10. **Oprydning:** 152 remote-grene er merget og kan slettes; ~50 worktrees er merget og kan fjernes; `feat/statusmail-cron`, `feat/systembeskeder-ud-af-chatten`, `feat/varme-leads-forlod` og 9 ældre PR'er er lukket uden merge. Intet er slettet her. Secrets `MONDAY_SIGNING_SECRET`, `MONDAY_WEBHOOK_SECRET`, `MONDAY_API_TOKEN` kan slettes af Jonas (OVERLEVERING 2/10 nat).

---

## 1. Grene med arbejde, der ikke er på main

### 1a. Remote-grene — IKKE merget (29)

**Åben PR (10):**

| hvad | hvor | status | ejer | næste skridt | siden |
|---|---|---|---|---|---|
| Webinarmotor skive 1 (motoren, ingen flade), migrationen omdøbt til `20261003010000` | #1255 `feat/webinarmotor-skive1-v2` → main · 3 commits | åben, 34 filer +5.391; migrationen IKKE kørt (målt); CI grøn 2/10 (PR-body) | Jonas (go) / Claude | Jonas' go; kør migrationen og mål FØR merge (§3, §7.3 i `docs/webinarmotor.md`) | 3/10 |
| Webinarmotor skive 2 (seerens flade), ingen migration | #1256 `feat/webinarmotor-skive2-v2` → skive1-v2 | åben, stablet, 62 filer | Jonas / Claude | merges efter #1255 | 3/10 |
| Webinarmotor skive 3 (intern prøvesession), migrationerne `…030000` + `…031000` | #1257 `feat/webinarmotor-skive3-v2` → skive2-v2 | åben, stablet; 2 migrationer IKKE kørt (målt: bl.a. `webinar_motor_log`, cron `webinar-motor`) | Jonas / Claude | efter #1256 | 3/10 |
| Vejen til november (§8), intern prøve ude af alle tal, mailen `ti_minutter`, migration `…040000` | #1258 `fix/ti-minutter-raad` → skive3-v2 | åben; CTO-råd GODKENDT; migration IKKE kørt; udrulning: `webinar-mail-cron`, `webinar-delt`, `drift-agent-cron` | Jonas / Claude | efter #1257; migration FØR deploy | 3/10 |
| Minimal værtskonsol, migration `…050000` | #1259 `feat/webinar-vaertskonsol` → #1258 | åben; migration IKKE kørt; ingen function ændret | Jonas / Claude | efter #1258; `…010000` skal være kørt først | 3/10 |
| Ansøgningen kobles til tilmeldingen + tokenet ud af Sentry | #1261 `feat/webinar-ansoegning-kobling` → #1259 | åben; ingen ny migration; kræver deploy af `ansoegning-gem` FØR Update (ellers 400) | Jonas / Claude | efter #1259 | 3/10 |
| `CompleteRegistration` til Meta bag egen lås `webinarmotor_meta_aktiv`, migration `…070000` | #1262 `feat/webinar-tilmelding-capi` → #1261 | åben, `mergeable_state` clean; migration IKKE kørt; privatlivsteksten (B4) skal publiceres FØR låsen åbnes | Jonas (tekst + lås) / Claude | efter #1261; privatlivstekst først | 3/10 |
| Webinarmotor skive 5: klokke ved nyt spørgsmål + svar på mail til den, der er gået, migration `…080000` | #1263 `feat/webinar-chat-bagende` → #1262 | åben (oprettet 3/10 05:38Z); migration IKKE kørt (målt: `advisor_notifications_webinar_spoergsmaal_ulaest_uidx` mangler) | Jonas / Claude | efter #1262 | 3/10 |
| Events får en lokation (kolonne, editor, visning, kalenderfil) | #1146 `feat/event-lokation` → main · 1 commit | åben, migration `20260929210000` IKKE kørt (målt: kolonnen findes ikke) | Jonas | kør migrationen, mål `GET /rest/v1/events?select=lokation&limit=0` → 200, MERGE, Update | 29/9 |
| «Rådet var forkert: kalenderinvitationen er det eneste, der garanteret bærer mødelinket» + elleve fund | #1043 `docs/moedelink-rettelse` → main · kun docs, 1 fil | åben, 13 dage; grenen har en anden rod end main (6.763 commits foran) — indholdet ikke sammenlignet med main | Claude | afgør: merge, genskab på friskt grundlag eller luk | 20/9 |

**Uden egen PR, stablet under de åbne PR'er (3):** `feat/webinar-ti-minutter` (16), `feat/webinarmotor-beslutninger` (12), `fix/webinar-intern-maal-annoncer` (13) — alle er ancestors af `feat/webinar-tilmelding-capi` (#1262), dvs. indholdet kommer med stakken. Ejer: Claude. Næste: slet grenene, når stakken er merget. Siden 2–3/10.

**Afløst, PR lukket uden merge (3):** `feat/webinarmotor-skive1` (#1158), `-skive2` (#1161), `-skive3` (#1173) — afløst af v2-grenene (#1255–#1257; «Afløser #1158/#1161/#1173»); også ancestors af stakken. Næste: slet. Siden 29/9–2/10.

**Lukket uden merge, nyere (3):**
- `feat/systembeskeder-ud-af-chatten` (#1145, 1 commit, 29/9): indholdet er IKKE på main (ingen `systembesked`-ændring fundet på main ved titelsøgning). Ejer: Jonas beslutter. Næste: genåbn eller slet. Siden 29/9.
- `feat/varme-leads-forlod` (#1221, 1/10): varme leads er fjernet bevidst (Jonas 1/10 20:13) — forældet. Næste: slet. Siden 1/10.
- `feat/statusmail-cron` (#1127, 29/9): PAUSE; «må ikke merges»; `statusmail*` findes ikke på main; OVERLEVERING: «døde grene … slettes». Ejer: Claude. Næste: slet; statusmail v2 er kort `a29-statusmail-v2`. Siden 29/9.

**Lukket uden merge, 3.–8/9 (6, forældede, anden rod end main):** `fix/rls-demo-policies-restrictive` (#590), `refactor/dashboard-signaler` (#596), `feat/virksomhedssiden-etape1` (#606), `docs/bogfoering-formiddag` (#617), `chore/slet-memberdetail` (#628), `fix/pinning-tilbage` (#729). Indholdet er ikke sammenlignet; RLS-hullet fra 3/9 er ifølge OVERLEVERING lukket (anden vej). Næste: slet.

**Ingen PR, forældet (3):** `lovable-sync`, `lovable-sync-1790698810`, `lovable-sync-1790699919` (Lovables synkroniseringsgrene 29/9, anden rod). Næste: slet.

**Merget på titel, men anden grenhoved (1):** `fix/scroll-sr-only` (1 commit, 30/9) — samme titel som #1187 på main («Scroll: indholdskolonnen og sidebaren er positionerede …»); grenens indhold afviger fra main i dag, fordi main har udviklet sig videre. Næste: slet.

### 1b. Remote-grene — merget (152)
151 grene har en merget PR med samme head-sha som grenens spids (squash); 1 er ancestor af main. Eksempler: alle `docs/*`, `feat/forside-v3` (#1253), `feat/ring-mig-op` (#1238), `feat/dag1-klokke` (#1248), `feat/akademi-f0` (#1237), `feat/community-spoergsmaal` (#1236), `feat/trigger-og-gaest`, `feat/seks-steder`/`kom-godt-i-gang-seks`/`netvaerket-faner` (#1232/#1234/#1235). Ejer: Claude (oprydning). Næste: slet fjerngrenene (intet er slettet her).

### 1c. Lokale worktrees (77)

Ikke merget / uafklaret:
| hvad | hvor | status | ejer | næste | siden |
|---|---|---|---|---|---|
| Score kompakt i forsiden (1 commit `7055f085`) | worktree `agent-a42bc89692af98789`, gren `feat/forside-v3-score` — INGEN remote-gren | commit kun lokalt; indholdet ser ud til at være overtaget af #1253 (`scoreKort.ts` og `forsideDato.ts` findes på main) — ikke afgjort linje for linje | Claude | bekræft og slet | 2/10 |
| Monday væk (2 commits) | lokal gren `chore/monday-vaek` (ikke worktree) — ingen remote | indholdet er på main som #1229 (monday-webhook svarer 410 — læst i kilden); grenen er kun lokal | Claude | slet | 2/10 |
| 9 worktrees står på ikke-merget webinar-gren | `agent-a21bab…` (vaertskonsol), `a3bb77…` (chat-bagende), `a4c41b…` (tilmelding-capi), `a51f23…` (skive3-v2), `a52d65…` (ti-minutter-raad), `a66f58…` (skive2), `a81b64…` (intern-maal), `aa9e8f…` (ansoegning-kobling), `aaf2cb…` (ti-minutter) + `/home/claude/wt-wm4` (beslutninger) | commits findes på remote (ingen lokale-only), se 1a | Claude | fjernes, når stakken er merget | 2–3/10 |
| `/tmp/cto-chat` (detached) | `6c43b7e9` = spidsen af `feat/webinar-chat-bagende` | intet unikt | Claude | fjern | 3/10 |

**UCOMMITTEDE ændringer (12 worktrees):**
| worktree (gren) | ændringer | vurdering (målt: sammenlignet fil for fil med origin/main) | næste |
|---|---|---|---|
| `agent-a00d3fd98f32dfff7` (`feat/boardroom-score`) | 80 stagede (CLAUDE.md, OVERLEVERING, slettede docs) | stale indeks mod en gammel base; 0 af 80 ligner main; ikke unik kode — Score-motoren er merget (#1171) | kassér |
| `agent-a66f58af6005d0f6a` (`feat/webinarmotor-skive2`) | 38 stagede, bl.a. sletter `webinarRum/*` | stale indeks; 27 af 38 er slettelser af filer, der ikke findes på main; resten afviger | kassér (v2-grenene bærer indholdet) |
| `agent-a17832027d40bd57e` (`feat/webinarmotor-fase1`) | 5 untracked: `src/lib/webinarMotor/{motor,kalender}.ts`, `_shared/webinarMotor*.ts` | tidlig kladde af motoren; findes ikke på main; motoren ligger nu i #1255 | sammenlign med #1255, kassér |
| `agent-aaf2cb8df2e902045` (`feat/webinar-ti-minutter`) | 12 modificerede (CLAUDE.md, webinarMail-tests …) | afviger fra main; remote-grenen findes (ancestor af stakken) | kassér eller tjek diff mod #1258 |
| `agent-a332026f49c366923` (`fix/mangelliste-fejl-30-09`), `agent-abb9cfec2a65d9922` (`fix/signupfejl-aarsag`), `agent-a9801f73532c57cda` (`feat/invitationslink-raadgiver`) | 4–7 filer hver (signupFejl, medFrist, Auth, invitationer) | gamle kladder; funktionerne findes på main under senere PR'er (#1150, #1160, …) og filerne afviger | kassér |
| `agent-a604429866569f7ef` (`feat/svartids-uret`), `agent-a9bda401de183f866` (`feat/trofaeer-og-maanedens-sparring`), `agent-ad17531684ebffa3d` (`fix/tjekliste-erfarne-medlemmer`), `agent-aeb01312d84ef3162` (`fix/dine-maal-hoved`) | 6–14 filer hver | grenen er merget (ancestor); ændringerne afviger fra main, som er gået videre | kassér |
| `/home/claude/wt-bogh` (`docs-bogholderi-morten`) | 1 untracked: `docs/marketing-motoren-nicklas.md` | fil findes på main under samme navn (`docs/marketing-motoren-nicklas.md` er i main-træet); ikke sammenlignet indholdsmæssigt | tjek, kassér |

Ejer for alle: Claude (oprydning); intet er rørt her. Siden: 1–3/10.

**Optælling worktrees:** 77 i alt · 50 merget via PR · 15 merget (ancestor) · 10 på ikke-merget remote-gren · 2 med lokale-only commits (se tabellen) · 12 med uncommittede ændringer (overlap med de andre kategorier).

## 2. Åbne PR'er

| # | titel | base ← head | alder | blokerer |
|---|---|---|---|---|
| 1263 | Webinarmotoren skive 5: klokke ved nyt spørgsmål + svar på mail | `feat/webinar-tilmelding-capi` ← `feat/webinar-chat-bagende` | 3/10 (05:38Z) | Stablet på #1262; migration `080000` IKKE kørt; Jonas' go |
| 1262 | Webinarmotoren: CompleteRegistration til Meta bag egen lås | `feat/webinar-ansoegning-kobling` ← `feat/webinar-tilmelding-capi` | 3/10 (timer) | Stablet på #1261; migration `070000` IKKE kørt; privatlivsteksten (B4) FØR låsen; pixlens `eventID` (B3); Jonas' go |
| 1261 | Webinarmotoren skive 4: ansøgningen kobles + token renses i Sentry | `feat/webinar-vaertskonsol` ← `feat/webinar-ansoegning-kobling` | 3/10 | Stablet på #1259; deploy `ansoegning-gem` før Update; Jonas' go |
| 1259 | Webinarmotoren: minimal værtskonsol | `fix/ti-minutter-raad` ← `feat/webinar-vaertskonsol` | 3/10 | Stablet på #1258; migration `050000` IKKE kørt; kræver `010000` kørt |
| 1258 | Webinarmotoren: vejen til november (§8), intern prøve ude af tal, `ti_minutter` | `feat/webinarmotor-skive3-v2` ← `fix/ti-minutter-raad` | 3/10 | Stablet på #1257; migration `040000` IKKE kørt; deploy `webinar-mail-cron`, `webinar-delt`, `drift-agent-cron` |
| 1257 | Webinarmotoren skive 3 (v2): intern prøvesession | `feat/webinarmotor-skive2-v2` ← `feat/webinarmotor-skive3-v2` | 3/10 | Stablet på #1256; migrationerne `030000`, `031000` IKKE kørt |
| 1256 | Webinarmotoren skive 2 (v2): seerens flade | `feat/webinarmotor-skive1-v2` ← `feat/webinarmotor-skive2-v2` | 3/10 | Stablet på #1255; ingen migration |
| 1255 | Webinarmotoren skive 1 (v2): motoren | `main` ← `feat/webinarmotor-skive1-v2` | 3/10 | Rodens PR: Jonas' go (§8.2 B9); migration `010000` køres og måles FØR merge |
| 1146 | Events får en lokation | `main` ← `feat/event-lokation` | 29/9 (4 dage) | Migration `20260929210000` skal køres og måles FØR merge |
| 1043 | docs/moedelink rettelse | `main` ← `docs/moedelink-rettelse` | 20/9 (13 dage) | Ingen krop ud over to overskrifter; anden grenrod; ikke afgjort |

Rækkefølgen for stakken (PR-kroppe): #1255 → #1256 → #1257 → #1258 → #1259 → #1261 → #1262 → #1263. `mergeable_state` målt: #1262 `clean`; de øvrige `unknown` (ikke målt). Antal målt 3/10 mod GitHub: 10 åbne PR'er, 7 af dem stablet på en anden PR (#1255 har `main` som base).

## 3. Migrationer fra 20260915 og frem — kørt i prod?

Metode: for hver fil er de oprettede objekter udtrukket (tabel · kolonne · funktion · trigger · indeks · cron-job · `app_config`-nøgle · politik · constraint — 470 unikke) og målt i prod i ét resultatsæt. Falske «manglende» er sorteret fra: politikker på `storage.objects`/`realtime.messages` (min nøgle brugte forkert tabelnavn), en politik der er droppet og genskabt (`kontrakter`) og `cvr_opslag_cache` (tastefejl i min egen liste; tabellen findes — målt, 1 tabel med `cvr` i navnet).

**IKKE kørt — på main (3):**
| fil | status målt | ejer | næste | siden |
|---|---|---|---|---|
| `20260920100000_klaviyo_mailhaendelser.sql` | `klaviyo_hentning`, `klaviyo_mailhaendelser` og cron `klaviyo-hentning` findes ikke; filhoved «IKKE KØRT»; lag 5 «skitseret» | Jonas | beslut: kør (når lag 5 bygges) eller fjern filen og `klaviyo-hentning-cron` | 20/9 |
| `20261002280000_milestones_with_check.sql` | de to UPDATE-politikker (`Users can update own milestones`, `Company members can update company milestones`) har `with_check = false`; INSERT-politikkerne har den | Jonas (grønt lys; FORBIDDEN-listen) | FØR-SELECT (fund 6: `user_company_id` LIMIT 1) → kør → mål | 2/10 |
| `20261002290000_kald_edge_apikey.sql` (3a) | `kald_edge` har ikke `kald_edge_sb_secret`/`apikey`; vault-posten findes ikke (0 rækker) | Jonas + Claude (sammen) | vault-post først, så migrationen; derefter deploy pr. function | 2/10 |

**Kørt, men filhoved/dokument kunne stå som «ikke kørt» (målt kørt):** `20260930151000_driftsagent_rettigheder` (`drift_agent_laes` er `prosecdef = true`, `search_path = public, pg_temp`) — OVERLEVERING har den som «ikke afgjort», nu målt **kørt**. `20260918110000_app_role_partner` (enum-værdi `partner` findes), `20260922015000` (0 debug-rækker tilbage), `20260929195000_certifikat_alle` (default `true`, 0 rækker med `false`).

**IKKE kørt — på åbne PR-grene (8):**
| fil | gren/PR | målt manglende objekter (eksempler) | ejer | siden |
|---|---|---|---|---|
| `20260929210000_event_lokation.sql` | #1146 | `events.lokation` | Jonas | 29/9 |
| `20261003010000_webinarmotor_skive1.sql` | #1255 (i stakken) | 25 af 44 objekter: `webinarer`, `webinar_sessioner`, `webinar_deltagelser`, `webinar_pulser`, `webinar_interaktioner`, `webinar_spoergsmaal`, `webinar_svar`, `webinar_reaktioner`, `webinar_gentagelser`, `webinar_motor_log`; kolonner på `webinar_tilmeldinger` (`session_id`, `token_version`, `ip_dagshash`, …) og `ansoegninger.webinar_tilmelding_id`; låsene `webinarmotor_offentlig_aktiv`, `webinar_ti_minutter_klar`, `webinar_svar_mail_aktiv` | Jonas + Claude | 3/10 |
| `20261003030000_webinarmotor_skive3.sql` | #1257 | `webinar_sessioner.intern`, `webinar_session_laast`, `webinar_tidslinje_frem` … | Jonas + Claude | 3/10 |
| `20261003031000_webinar_motor_cron.sql` | #1257 | cron-job `webinar-motor` | Jonas (ALLERSIDST) | 3/10 |
| `20261003040000_webinar_mails_ti_minutter.sql` | #1258 | CHECK `webinar_mails_art_check` udvides til `ti_minutter` (ikke målt direkte); låsen `webinar_ti_minutter_klar` mangler | Jonas | 3/10 |
| `20261003050000_webinar_vaertskonsol.sql` | #1259 | `webinar_server_nu`, `webinar_spoergsmaal_vaert_kolonnevaern` | Jonas | 3/10 |
| `20261003070000_meta_haendelser_tilmelding.sql` | #1262 | `meta_haendelser.tilmelding_id`, `meta_haendelser_ejer_xor`, `…_art_ejer`, `…_event_id_form`, låsen `webinarmotor_meta_aktiv` | Jonas | 3/10 |
| `20261003080000_webinar_chat_bagende.sql` | #1263 `feat/webinar-chat-bagende` | indekset `advisor_notifications_webinar_spoergsmaal_ulaest_uidx` | Jonas | 3/10 |

Alle øvrige 107 filer på main fra 20260915 er målt kørt (hver fils objekter findes i prod). To undtagelser, der ikke kan måles via objekter: filer der kun ændrer funktionskroppe (fx de to community-læse-RPC'er i `20261002242000`/`…243000`) er målt via deres tilhørende nye objekter (`kan_laese_community`, `spoergsmaal_markeret_at`, `marker_community_spoergsmaal`) — kroppene selv er ikke sammenlignet.

## 4. Låse i `app_config` (målt 3/10)

| nøgle | værdi nu | sidst opdateret | bemærkning | ejer / næste |
|---|---|---|---|---|
| `dag1_klokke_aktiv` | **false** | 2/10 16:43Z | lukket; kode og migration i drift 2/10 18:43–18:45 | Jonas: trin 6 (åbn med guardet UPDATE) |
| `driftsagent_aktiv` | **true** | 1/10 06:07Z | åben | — |
| `nyhedsagent_aktiv` | **true** | 1/10 06:07Z | åben (N1: intet når community uden et rådgiverklik) | — |
| `klaviyo_medlem_aktiv` | **true** | 1/10 06:06Z | åben | — |
| `klaviyo_afmeld_aktiv` | **true** | 22/9 11:56Z | åben | — |
| `meta_send_aktiv` | **true** | 21/9 21:30Z | åben | — |
| `ga_send_aktiv` | **true** | 21/9 19:02Z | åben | — |
| `webinar_mail_aktiv` | **true** | 22/9 17:03Z | åben | — |
| `webinar_en_dag_video` | `null` | 30/9 16:07Z | Mortens hilsen ikke sat op (tændes med guarded UPDATE efter prøve) | Jonas / Morten |
| `ansoegning_cvr_dagsloft` | 20 | 19/9 | konstant | — |
| `velkomstvideo_guid` | `ee29bc22-…` | 14/9 | konstant | — |
| øvrige nøgler | `branding`, `extraction_v2_rollout`, `notification_v2_rollout`, `session_timeout_minutes` | — | ikke låse | — |

Der er 15 nøgler i alt. De nye webinarmotor-låse (`webinarmotor_offentlig_aktiv`, `webinar_ti_minutter_klar`, `webinar_svar_mail_aktiv`, `webinarmotor_meta_aktiv`) findes ikke endnu (migrationerne ikke kørt). Cron-jobs (målt): 33 jobs, alle aktive; `drift-agent` (575), `nyhed-agent` (576), `opkald-opbevaring` (577), `certifikat-klokke` (574), `webinar-mail` (573) findes; `klaviyo-hentning` og `webinar-motor` findes ikke.

## 5. Edge functions, hvis kode på main måske ikke kører

Metode (LÆST, ikke målt): for hver function er den transitive importmængde fra `index.ts` regnet; seneste rigtige commit på main (rodcommit `c5ff87c9` sprunget over) sammenlignet med seneste dato i OVERLEVERING/CLAUDE.md på en linje, der nævner functionens navn og et udrulningsord. Datoer er dag-præcise og regex-fundet — «ukendt» betyder, at det ikke kan afgøres af dokumenterne. **Intet er målt ved at kalde functions.** Bevis kræver en kørsel, der svarer med noget, kun den nye kode kan svare (CLAUDE.md «Beviset»).

**Ændret efter udrulning: ja — egen kode (10):**
| function | sidst bogført udrullet | sidst ændret på main | ændring |
|---|---|---|---|
| `stripe-webhook` | 22/9 | 30/9 (`49d5218e`, #1156) | konstant-tids signatur m.m. |
| `calendly-webhook` | 20/9 | 30/9 (`49d5218e`) | sikkerhedsrettelse |
| `manage-advisor` | 14/9 | 30/9 (`26494b09`, Lovable «Changes») | — |
| `send-report-reminder` | 16/9 | 30/9 (`7798a556`) | ingen stille lofter |
| `webinar-delt` | 1/10 | 1/10 (`db869de9`) — samme dag, «ukendt» | målstreger |
| `import-application` | 22/9 | 2/10 (`69c2b366`, #1229) | Monday væk |
| `berig-virksomheder` | 26/9 | 2/10 (`69c2b366`) | Monday væk |
| `monday-webhook` | 2/10 (bevist 410, kald 28882) | 2/10 — samme dag | OK efter bevis |
| `create-free-intro-booking` | 2/10 | 2/10 (`e650194e`, #1252) — samme dag, «ukendt» | én regel for 1:1 |
| `intro-reminder-cron` | 2/10 | 2/10 (`e650194e`) — samme dag, «ukendt» | én regel for 1:1 |

**Ændret efter udrulning: ukendt — ingen bogført udrulning fundet, egen kode ændret siden 15/9 (12):** `chat-video` (29/9 `50f9c851`; OVERLEVERING siger dog udrullet 29/9 18:38 — min regex fandt ingen d/m-dato), `create-stripe-checkout`, `extract-annual-report`, `generate-budget-scenarios`, `notify-chat-reply`, `update-annual-report-revenue` (alle #1156/Lovable 30/9), `opgave-accepter`, `opgave-udskyd` (1/10 `577cd8c3`), `skridt-tilfoej` (1/10; udrullet 1/10 14:3x ifølge OVERLEVERING — regex fandt «skridt-tilfoej» uden dato), `saet-indgangs-prisniveau`, `send-indgangs-betalingsmail` (2/10 Monday væk), `send-welcome-message` (30/9 tjenestekonto).

**Kun delt fil ændret efter bogført udrulning (54):** Fase 3a trin 1 (`c69be02f`, 1/10, `_shared/edgeFunctionAuth.ts`/`serviceNoegle.ts`) og «Må vi ringe til dig?» (#1238, 2/10), Monday-væk (#1229) og `opgave-luk`/`foreslaa-opgave`-fristen (#1216) har rørt delte filer. CLAUDE.md: trin 1 «ruller ud pr. function med dens næste eksplicitte deploy» — legacy-nøglen virker uændret, så det haster ikke. Berørte (udtræk): `advisor-broadcast`, `aftale-underskrift`, `agent-forslag-afgoer`, `ansoegning-cvr`, `ansoegning-handling`, `ansoegning-rykker-cron`, `ansoegning-samtale`, `attach-user-to-company`, `cancel-event`, `detect-financial-alerts`, `event-reminders`, `ewebinar-proeve`, `flyt-event`, `fornyelsesvarsel-cron`, `get-advisor-alerts`, `hent-fornyelsestilbud`, `klaviyo-motor`, `meta-annoncer-cron`, `opgave-luk`, `publish-event`, `report-review-cron`, `send-til-underskrift`, `venteliste-handling`, `webinar-deling` m.fl.

**Kendt og bogført åbent (OVERLEVERING):** `run-company-agent` læser stadig råt `acknowledged_at` (`index.ts:454`), så de 199 backfillede F0-rækker ser ud som medlemmets «gennemført» — kræver rettelse og udrulning (Claude + Jonas). `onboarding-rytme`/`intro-reminder-cron` skulle udrulles i samme vindue som Update 2/10 11:00 — bogført udrullet 2/10, men «samme dag» som ændringen (ukendt rækkefølge).

**Functions på PR-grene (ikke på main, ingen af dem udrullet):** webinarmotor-stakken indfører nye functions (`webinar-tilmeld`, `webinar-rum`, værtskonsol m.fl.) samt ændringer i `webinar-mail-cron`, `webinar-delt`, `drift-agent-cron`, `meta-send-cron`, `ansoegning-gem`. Se PR-kroppene #1258, #1261, #1262.

## 6. Bogførte åbne punkter i `docs/OVERLEVERING.md` fra 25/9, ikke markeret løst

Metode: søgt «ÅBENT», «åbent punkt», «IKKE KØRT», «afventer», «mangler» i DEL 2-afsnittene fra 28/9 og frem (23.–27/9 har ingen egne afsnit) samt DEL 3; linjer med ✅/LØST/~~ udeladt. Rettet mod målingerne i denne fil, hvor jeg har dem. Linjenummer i parentes.

| hvad | hvor | status | ejer | næste | siden |
|---|---|---|---|---|---|
| Webinarmailens to tal (`m28-pris-to-tal`) — åbent. ~~Aftaleskabelonen er en PLADSHOLDER~~ **LØST**: målt 3/10 er `aftale_skabelon` v3 aktiv siden 18/9 kl. 14:11Z (8.948 tegn) | (10866) | pladsholderen: målt løst; `m28-pris-to-tal`: ikke målt her | Jonas / Claude | kun `m28-pris-to-tal` står åbent | 28/9 |
| `Wq3MkG` «Deltog»-flow: mail 1+3 skrevet, afventer indsættelse; 4+5 slukket; sunset `XCqPKg` efter 13/10 | (10885) | Klaviyo, ikke målt | Jonas | indsæt mails | 28/9 |
| Preview af flowmailen med tidspunktet (`a21-webinar-tidspunkt`) i `WFzxH9`/`UiECQS` + kampagner til 13/10 | (10738) | ikke målt | Jonas | lav Preview, luk kortet | 22/9 |
| Mailgun business verification: tjek banneret; loft 1.000/time er Jonas' tal, ikke Mailguns | (10984) | ikke målt | Jonas | tjek bannerets status | 29/9 |
| Webinaralarmen/«Update ikke bekræftet 29/9»; drift-beviser efter Update (#-henvisninger, rabataftalens adresse, videoknap, «Mangler at booke» N og M) | (10951, 11083) | ikke målt | Jonas | Update-måling i frisk fane | 29/9 |
| Chatvideo — A's forbedringer (poll 2 s, 0-bytes-tjek, «Prøv igen») ikke merget; saldo $7,55 og genopfyldning umålt; testupload med tidtagning mangler | (11214–11224) | ikke afgjort | Jonas / Claude | afgør | 29/9 |
| Vedhæftninger slettes ikke med beskeden (`a29-vedhaeftning-slettes-ikke`); Mortens 12 retter uden booking, årsag ikke målt (`a29-morten-retter-uden-booking`) | DEL 3 | ikke målt | Claude | recon | 29/9 |
| Statusmail: draft #1127 lukket uden merge; skal laves om til samme sprog som «Mangler at booke» (`a29-statusmail-v2`) | (11085) | PR lukket (målt) | Claude | v2 eller drop | 29/9 |
| Fund 6 i #1157 (`user_company_id` LIMIT 1 gør en WITH CHECK-verifikation umulig fra koden) — FØR-SELECT måler | (11289) | åbent | Claude | mål FØR kørsel af `…280000` | 30/9 |
| Et medlem (Green Solar) skrev 30/9 kl. 15:30 i chatten: «Afventer dit svar» kl. 02 | (11472) | ikke målt om besvaret | Jonas | tjek | 30/9 |
| Marketinganalytikeren — «LÆG FREM» (3 sessioner, tragt, kilder) | (11385) | ikke afgjort | Jonas / Nicklas | gennemgang | 30/9 |
| Kald-bevis mangler: #1206 (`skridt-tilfoej`, den nye 400 nås kun af et medlem) og #1209 (`koblinger_talt` i `webinar-delt`, venter på delingslink til Nicklas) | (11698, 11700) | ikke afgjort | Jonas | send delingslink; bevis | 1/10 |
| Bogførte men uden kode: B3 (`maal-skriv` «rediger» har ingen kalder), K4 (race mellem opslag og skrivning) | (11763–11764) | åbent | Claude | beslut | 1/10 |
| Vagten/driftsagenten skal gemme jobnavnet, når et svar ikke er 200 (`a02-vagt-jobnavn`; timeout 1/10 17:00 kan ikke tilskrives) | (11643) | åbent | Claude | byg | 2/10 |
| `20261002280000_milestones_with_check` — afventer grønt lys | (11647) | **IKKE kørt, målt 3/10** | Jonas | se fund 2 | 2/10 |
| Fase 3a (`20261002290000`) | (11632, 11701) | **IKKE kørt, målt 3/10** | Jonas + Claude | se fund 3 | 2/10 |
| Update afventer — samlet liste under tabellen | (11514–11600, 11607) | ikke målt rekursivt 3/10 | Jonas | Update + frisk-fane-måling | 2/10 |
| Gæstens grænse (aftenlistens «(b)»): tre valg, `kan_laese_community` er bygget og kørt | (11647ff) | målt: funktionen findes; ingen gæst findes | Jonas | afgør, om (b)'s skriveadgang er ønsket | 2/10 |
| Akademi F0 åbent: `run-company-agent` læser rå `acknowledged_at`; rådgiverkvitteringer før 2/10 kan ikke skelnes (loft 131); `markeret_af` null på backfill | (11794–11797) | åbent | Claude | ret + udrul | 2/10 |
| Klaviyo «Ring mig op»-knappen i «Deltog»-flowets mail 1: kan ikke rettes via skabelon-API (PATCH → 404); kræver `klaviyo-motor` med indlogget rådgiver | (11558) | åbent | Jonas / Claude | via motoren | 2/10 |
| «Må vi ringe til dig?» åbent: spørgsmål i webinarrummet («senere»), profilegenskaben målt på en rigtig profil, Hovedlisten-krav, persondatateksten (Jonas godkender), «Træk tilbage», `types.ts` | (11991) | åbent | Jonas / Claude | afhænger af webinarmotoren | 2/10 |
| Seks steder/Netværket: kortets link «Gå til Netværket» står stadig for en uden Netværk | (11929) | åbent, ikke bestilt | Claude | afgør | 2/10 |
| Dag-1-klokken: låsen lukket, trin 6 hos Jonas; en klokke skrevet 04:30 mailes 07:04 selv om en rådgiver har skrevet i mellemtiden | DEL 3 | lås `false` målt | Jonas | åbn låsen, når klar | 2/10 |

**Samlet liste: PR'er, der rører `src/` og mangler rekursiv Update-måling (#1224–#1254; læst fra `git log origin/main`, ikke målt i drift).** #1224, #1225, #1226, #1229, #1230, #1232, #1233, #1234, #1235, #1236, #1237, #1238, #1239, #1241, #1242, #1243, #1245, #1246, #1247, #1248, #1250, #1252, #1253, #1254. Uden bundle-relevant `src/`-ændring og derfor ikke på listen: #1227, #1228, #1231, #1244, #1251 (kun docs) samt #1240 og #1249 (kun guard-tests under `src/`). Filtypefiltreringen er kun gennemgået på stikprøve (#1239, #1248, #1229, #1240, #1249); de øvrige står på, fordi de rører filer under `src/`.

**Livetjek 3/10:** forside v3 (inkl. trofæknappen, #1254), Netværkets faner og «Mangler at booke» blev set i drift. Det er et øjebliksbillede af fladerne, **ikke** en rekursiv bundle-måling af alle PR'erne på listen, og kan derfor ikke lukke punktet for dem alle.

---
*Genereret 3/10-2026 af recon-sessionen på grenen `docs/aabne-opgaver`; ingen PR (bevidst). Alle «målt»-linjer kan genkøres: katalog-SELECT'en mod `pg_tables`/`information_schema.columns`/`pg_proc`/`pg_trigger`/`pg_indexes`/`cron.job`/`app_config`/`pg_policies`/`pg_constraint`, `pg_get_functiondef(kald_edge)`, `pg_policies` for `milestones`, og PR-listen fra GitHub.*
