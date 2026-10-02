# Recon: boardroom-2-prod (Supabase `tmhjionsbtgrwuzwjbgb`)

Udført 30/9-2026. **Kun læsning**: SELECT'er, lister og advisors. Intet skrevet, intet deployet, intet klonet.
Læseregel: **MÅLT** = set i databasen i dag. **UMÅLT** = ikke set (typisk fordi koden ikke ligger i projektet).

---

## 0. Konklusion i ti linjer

1. **Projektet har NUL edge functions og INGEN pg_cron** (MÅLT: `list_edge_functions` = `[]`; `pg_cron`/`pg_net` ikke installeret). Al logik har kørt i en ekstern «worker» (tabelkommentarerne siger «worker-only writes», «worker state-machine helpers»). Koden ligger sandsynligvis i repoet **`jonastopix/theboardroom-2`** (privat, sidst pushet 6/7-2026). Den er IKKE læst — alt om kode herunder er udledt af data, funktioner i databasen og kommentarer.
2. **Det har kørt mod det rigtige regnskab**: Topix.dk ApS' e-conomic med levende nøgler. 37 posteringer blev bogført (`posted_booked`), alle Stripe (salg, gebyrer, udbetalinger), 27/4 → 9/5-2026. 23 + 7 `book_journal*`-kald lykkedes.
3. **Det døde i tre trin:** (a) 8/5 blev 19 af agentens kladdeposter slettet i hånden i e-conomic «som dublet» — agenten havde posteret Pleo-køb, som bogholderen allerede havde bogført; (b) fra 12/5 blev 93 forslag godkendt, men aldrig posteret (`posting_enabled = false`); (c) 24/6 stoppede den daglige kørsel (sidste `auto_run_logs`), og 6/7 kom migrationen `emergency_stop_all` + et sidste manuelt forsøg. Siden: ingen aktivitet.
4. **Arkitekturfejlen, der forklarer det meste:** banken var aldrig en kilde. «Transaktioner» var e-conomics egne bogførte poster (546 `booked_elsewhere`) + Stripe. Agenten kunne derfor kun gætte på, hvad bogholderen ikke havde nået — og gættede forkert (dubletterne).
5. **Posteringsformatet kunne kun én debet og én kredit** (målt i agentens egen begrundelse 24/6: «Tool-format tillader kun én DR/KR-linje»). Løn, moms-splits og periodiseringer kan ikke udtrykkes; en løn-postering blokerede kladde 3 i en uge og blev aldrig løst.
6. **Sikkerhed — skal handles uanset om projektet genbruges:** 28 SECURITY DEFINER-funktioner kan kaldes af `anon`, og 11 af dem har INGEN adgangskontrol (fx `upsert_collected_transactions`, `mark_proposals_booked`, `upsert_review_proposals`). Levende nøgler (Stripe `livemode=true`, e-conomic AppSecret + AgreementGrant, Klaviyo privat nøgle) ligger **i klartekst** i `integrations.credentials` og kan læses af den indloggede bruger via REST.
7. **Marketing kom aldrig ud over prototypen:** 33 udkast (8 fejlede, 16 afvist), 9 mailudsendelser eksekveret gennem godkendelseskøen 30/4–4/5, 2 flows aldrig udrullet, 9 ugeplaner — kun uge 19 godkendt. Ingen Meta-kode overhovedet (kun Klaviyo).
8. **Genbrugeligt:** begreberne (godkendelseskø med risiko-gate, mønster → auto efter N bekræftelser med degradering, nødstop i ét kald, tool-audit-log), e-conomic-fejlkataloget, og regeldata (Stripe-kontering, leverandørmønstre, kontoplanfakta). **Koden** er ikke vurderet (ikke læst).
9. **Kasseres:** datamodellen for bogføring (én linje, ingen bank, ingen bilagshash, tekst-nøgler med dato i), multi-tenant-laget, personaerne, den ukontrollerede RPC-flade, credentials i tabel.
10. **Vigtigste nye faktum til bogholder-designet:** meget af forbruget går gennem **Pleo** (konto 5830), ikke direkte over Nordea. Designet nævner ikke Pleo.

---

## 1. Projekt og kode

| | MÅLT |
|---|---|
| Projekt | `boardroom-2-prod`, eu-west-1, Postgres 17, oprettet 23/4-2026, ACTIVE_HEALTHY |
| Edge functions | **0** |
| Extensions | `vector`, `pgcrypto`, `uuid-ossp`, `citext`, `pg_stat_statements`, `supabase_vault` (vault ubrugt til nøgler). **Ikke** `pg_cron`, `pg_net` |
| Migrationer | 75, 23/4 → 6/7-2026 (sidste fire: `emergency_stop_all`, `emergency_stop_all_revoke_anon`, `bertha_persona`, `record_integration_sync`) |
| Brugere | 1 i `auth.users`, sidste login 7/5-2026 |
| Workspace | 1: «Topix.dk ApS» (type `owned`) |
| Storage | `stripe-bilag` (privat, 48 PDF'er, seneste 23/6), `bilag-uploads` (privat, 2), `brand-assets` (**public**, 6) |

**GitHub-repos på kontoen** (kun navne, intet klonet): `jonastopix/topix-financial` (platformen), `jonastopix/theboardroom-2` (privat, pushet 6/7-2026 — matcher projektets sidste migration 6/7; sandsynligvis worker + web), `jonastopix/theboardroom-topix` (privat, 28/9), `jonastopix/topix-reimagined` (privat, 28/9). Ingen repo med «agent», «bogholder» eller «marketing» i navnet.

**Konsekvens:** Svar på «hvad gør koden præcist» (e-conomic-klienten, Stripe-hentning, promptene, scheduleren) kræver læsning af `theboardroom-2`. Det har jeg ikke gjort.

---

## 2. Agenterne (fra `agent_personas`, `agent_runs`)

| Agent (navn) | Hold | Rolle | Kørsler (MÅLT) |
|---|---|---|---|
| `bookkeeping.collector` «Maria» | økonomi | Henter transaktioner (e-conomic, Stripe; Pleo/bank nævnt i kommentar, aldrig set i data) | 81, 27/4 → 24/6 |
| `bookkeeping.bookkeeper` «Søren» | økonomi | Foreslår kontering DR/KR + momskode + periodisering | 92 (2 fejlede 27/4: `ON CONFLICT`-constraint manglede) |
| `bookkeeping.bilag_ingestor` «Bertha» | økonomi | Læser PDF-bilag (pass 1 + critic-pass) | 2 (10/5 og 6/7) |
| `marketing.copywriter` «Marie», `marketing.critic` «Karl», `marketing.klaviyo` «Emil», `marketing.director` | marketing | Brief → 3 varianter → kritik → Klaviyo → ugeplan | Ikke i `agent_runs`; spores i `marketing_*`-tabellerne |

Tokenforbrug i alt: 1,90 mio. input / 63 k output; `total_cost_cents` = 0 overalt (omkostning aldrig registreret).

---

## 3. Tabeller, rækker og seneste aktivitet (MÅLT)

**Bogholderi**

| Tabel | Rækker | Første → seneste |
|---|---|---|
| `collected_transactions` | 669 (economic 548, stripe 119, bilag_upload 2) | poster fra 1/4; senest hentet 6/7 |
| `journal_entry_proposals` | 185 | 27/4 → 6/7 |
| `tool_invocations` (audit af eksterne kald) | 157 | 26/4 → 24/6 |
| `auto_run_logs` | 77 (april 19, maj 34, juni 24) | 27/4 → 24/6 |
| `booking_patterns` | 5 (alle Stripe) | 26/4 → 30/4 |
| `match_decisions` | 21 | alle 27/4 (én session) |
| `stripe_documents` | 48 | 27/4 → 23/6 |
| `bilag_uploads` / `bilag_extraction_evals` | 2 / 2 | 10/5, 6/7 |
| `memory_facts` | 122 | 23/4 → 9/5 |
| `workspace_auto_run_config` | 1: `enabled=false, dry_run=true, auto_book=false`, tærskel 0,99, kl. 8, kladder 9, 8, 10, 1, 11, 3 | opdateret 6/7 (nødstoppet) |

**Marketing**

| Tabel | Rækker | Seneste |
|---|---|---|
| `marketing_drafts` | 33 (completed 4, sent_to_klaviyo 4, failed 8, dismissed 16, running 1 — hængende) | 4/5 |
| `campaigns` | 10 (archived 7, drafting 2, planning 1) | 4/5 |
| `marketing_email_tasks` | 37 (pending 27, drafted 9, in_production 1) | 4/5 |
| `marketing_approval_queue` | 9 — alle `email_broadcast`, alle `executed` 30/4–4/5 | 4/5 |
| `marketing_flows` | 2, begge `planning`/`drafting`, ingen `klaviyo_flow_id` | 4/5 |
| `marketing_director_plans` | 9 (uge 19–27): uge 19 `executing`, 20–27 `draft` aldrig godkendt | 5/7 |
| `marketing_flow_steps`, `flow_outcomes`, `workspace_marketing_policy` | 0 | — |
| `memory_playbooks` | 13 (12 copywriting-principper, 1 discovery); `success_count`/`failure_count` = 0 alle | aldrig brugt |

Tomme: `agent_messages`, `memory_episodes`, `workspace_members`, `provider_requests`.

---

## 4. Cron-jobs

- **Ingen i databasen** (`pg_cron` er ikke installeret). Planlægningen lå i workeren: `auto_run_logs.trigger_source='cron'` 65 gange, altid kl. 06:00 UTC (`run_at_hour_local = 8`).
- Den sidste kørsel 24/6 06:00 er `completed` uden fejl. Der er ingen række 25/6 → derfor stoppede **værten/workeren**, ikke koden. Hvor workeren kørte (Railway, Fly, en Mac …): UMÅLT.
- Kørslerne i juni var tomme i praksis: seneste summary 24/6 har `proposalsTotal 1`, `totalProposalsBooked 0`, og kladde 3 blokeret af en uløst løn-review (`review_flag_unresolved`) 19/6–24/6.

---

## 5. Secrets / nøgler (navne, ikke værdier)

Ingen edge functions → ingen Supabase-secrets i brug. Nøglerne ligger **i tabellen `integrations.credentials` i klartekst** (tabelkommentaren: «credentials is plaintext JSONB in Phase 1 — migrate to Vault for Phase 2»):

| Provider | Felter i `credentials` | `config` | Status |
|---|---|---|---|
| e-conomic | `appSecretToken`, `agreementGrantToken` | `agreementNumber`, `companyName`, `companyVatNumber`, `economic.posting_enabled = false` | connected |
| Stripe | `apiKey` | `livemode = true`, `currencies` | connected |
| Klaviyo | `publicApiKey`, `privateApiKey` | afsender, tidszone, valuta | connected |

Workerens egne hemmeligheder (Anthropic-nøgle, service role m.m.) står i workerens miljø — UMÅLT.

---

## 6. Hvorfor det aldrig blev godt i drift — beviserne

1. **Ingen bank, ingen sandhed.** Kilderne var kun `economic` og `stripe` (+2 uploads). `economic`-rækkerne er bogholderens allerede bogførte poster (546 `booked_elsewhere`). Agenten konterede altså oven i et regnskab, som et menneske førte samtidig, uden en uafhængig kilde at afstemme mod.
2. **Dubletter i det rigtige regnskab.** 19 forslag `deleted_externally`, alle slettet 8/5 21:36–21:37, note: «Slettet i e-conomic 2026-05-08+ som dublet. Dækket af ekstern voucher.» Eksempler: D3606/K5830, D3607/K5830 (Pleo-køb), D3642/K6800. Idempotensen fandtes kun inden for agentens egen tabel, ikke mod det, der allerede stod i e-conomic.
3. **Kladdens tilstand blev ikke læst før handling.** 7× `post_voucher_to_kladde` 26/4 fik HTTP 201 men intet `voucherNumber` («left in posting state for manual reconciliation»); 2× `delete_voucher_from_kladde` 404; 6× `bookWithDateInterval` 400 «Ingen posteringer i det valgte datointerval»; 1× «Ikke alle posteringer er godkendt»; 1× `E00500`. `bookWithDateInterval` bogfører alt i kladden i intervallet — også menneskers poster (summary-feltet hedder endda `otherDraftsBooked`).
4. **Bilag kunne ikke vedhæftes i starten.** 7× HTTP 405 på `/journals/1/vouchers/{år-nr}/attachment` 27/4. Af de 37 bogførte har 19 bilag (`attached`), 18 har `no_bilag`.
5. **Én DR/KR-linje pr. postering.** Agentens egen tekst 24/6: «Tool-format tillader kun én DR/KR-linje». Løn, erhvervelsesmoms-par og periodisering over flere konti kan ikke bogføres; resultatet var en permanent blokering af kladde 3.
6. **Menneskeløkken sov.** 181 af 185 forslag har `decided_by = null` (auto-godkendt af mønstre); 15 står `pending` siden 10/5; 93 er `approved` men `not_posted` (12/5 → 24/6), fordi posting-samtykket var slået fra. 84 transaktioner (2/4 → 30/6) står som `not_in_bookkeeping`/`needs_review`.
7. **Læringen generaliserede ikke.** `booking_patterns` har kun 5 Stripe-mønstre; `memory_facts` indeholder samme mapping mange gange med dato i nøglen («Billing - Usage Fee (2026-04-16)», «(2026-04-18)» …, alle `valid_to IS NULL`). Tekst med dato som nøgle rammer aldrig næste måned. Kun 1 `correction`-fakta på to måneder.
8. **Ingen alarm, intet bevis.** Ingen daglig afstemning (bank = konto), ingen mail ved stop. Workeren stoppede 24/6, og intet i systemet opdagede det.
9. **Driftsplatform uden for huset.** Worker uden for Supabase, ingen cron i databasen, ingen deploy-sti man kan se — det, der stoppede, kunne ikke ses fra databasen.
10. **Marketing:** 8 af 33 udkast fejlede på værktøjskaldets form («Karl returnerede 0 kritikker via submit_critique-tool» ×5, «input.critiques.map is not a function», «Cannot read properties of undefined (reading 'trim')»); ét udkast hænger i `running` siden 4/5. Flows blev aldrig udrullet til Klaviyo. Ugeplaner genereret hver søndag til 5/7, ingen godkendt efter uge 19 — genereringen kørte, mennesket var væk.
11. **Sikkerheden blev aldrig lukket** (§7). `emergency_stop_all_revoke_anon` fjernede kun anon fra nødstoppet selv, ikke fra resten.

---

## 7. Sikkerhedsfund (MÅLT) — uafhængigt af genbrug

- **Supabase-advisor:** 28 × «Public Can Execute SECURITY DEFINER Function» (anon), 29 × authenticated, 1 × mutable search_path (`set_updated_at`), leaked password protection slået fra.
- **Uden nogen adgangskontrol og kaldbare af anon via `/rest/v1/rpc/…`** (ingen `auth.uid()`, ingen `has_workspace_access`, intet rolletjek): `upsert_collected_transactions`, `upsert_review_proposals`, `claim_proposal_for_posting`, `claim_proposals_for_booking`, `mark_proposal_posted`, `mark_proposal_posting_failed`, `mark_proposal_unposted`, `mark_proposals_booked`, `mark_proposals_booking_failed`, `demote_pattern_for_proposal`, `resolve_review_proposal`. Med anon-nøglen kan enhver indsætte «transaktioner» og ændre forslags status. Havde auto-run været tændt, kunne det ende i e-conomic.
- **Levende nøgler i klartekst** i `integrations` (§5); RLS-policyen `integrations_select` = `has_workspace_access(workspace_id)` → den indloggede bruger kan læse Stripe-live-nøglen og e-conomic-tokens fra browseren.
- **Anbefaling (ikke udført):** tilbagekald e-conomic-grantet til appen, rul Stripe-nøglen og Klaviyo-privatnøglen, og enten slet projektet eller revoke EXECUTE fra anon/authenticated på alle SECURITY DEFINER-funktioner. Kontrollér først, om platformen eller andet bruger de samme nøgler.

---

## 8. Genbrug

### 8.1 Til bogholder-agenten (`/home/claude/bogholderi-agent-design.md`)

**Genbrug som begreb eller data (bevist i drift):**

| Hvad | Hvorfra | Hvorfor |
|---|---|---|
| **Fejlkatalog for e-conomic**, målt i det rigtige regnskab | `tool_invocations` (§6 punkt 3–4) | Det er de præcise fejl, den nye klient skal tåle: 201 uden voucherNumber, 405 ved vedhæftning, `bookWithDateInterval` bogfører også andres poster, E00500. Det bekræfter designets valg (egen agent-kladde, læs hele kladden før `book`, markør som idempotens mod `/booked-entries`, og OpenAPI Journals i stedet for REST `/journals/{n}/vouchers`). |
| **Stripe-konteringen**, bevist 37 gange | `booking_patterns` + bogførte forslag | Salg D5840/K1011, gebyrer D1340/K5840, udbetaling D5820/K5840. Kontonumrene er Topix' egne. Frø til `konteringsregel` — men lad revisor bekræfte momsbehandlingen: salget er bogført som én linje uden separat momslinje (om kontoen 1011 selv bærer momskoden i e-conomic: UMÅLT). |
| **Leverandørmønstre fra bogholderens historik** | `memory_facts` kind `supplier_pattern` (16), `account_mapping` (29), `chart_of_accounts` (15), `vat_insight` (6), `payment_channel` (6) | Fx Lovable/Anthropic → 3607 via Pleo 5830; Google Workspace → 3606 med erhvervelsesmoms 6906; Meta Ads → 2801; Klaviyo → 2805; Sentury ApS → 2807; Floor1 I/S og Mola Invest → 3410 via 6800. Bruges som **kontrolliste** mod designets «24 måneders `/booked-entries`»-såning — ikke som kilde (LLM-skrevne tekster, ikke målt mod e-conomic). |
| **Periodiseringsregel** | `memory_facts` `booking_rule` | «Medlemskab købt up-front periodiseres over 12 måneder; rater indtægtsføres …» — skal med i regelsættet og forbi revisor. |
| Mønsterforfremmelse med degradering | `booking_patterns` (`confirmations`, `auto_apply_threshold`, `unpost_events`, `rejection_events`, `last_demoted_at`) + `demote_*`-funktioner | Samme idé som designets `n_ens ≥ 3 ∧ n_afvigelser = 0`. Designet er bedre (leverandør-nøgle, ikke tekst). |
| Nødstop i ét kald | `emergency_stop_all` | Mønstret (tre låse i ét kald, returnerer hvad der blev slået fra) — men i designet skal det være et signeret stop-link, ikke en RPC. |
| Bilagslæsning med critic-pass og eval-tabel | `bilag_extraction_evals` (pass1 + verifier_flags + critic + final + tokens/varighed) | God datamodel til måling af `bilag-laes`-kvalitet. Kun 2 kørsler — ingen evidens for kvalitet. |
| Stripe-bilag i egen privat bucket | `stripe_documents` + `stripe-bilag` (48 PDF'er) | Viser at Stripe-PDF'er kan hentes; i designet skal de have SHA-256 og vedhæftes i e-conomic. |

**Kasseres:**
- `journal_entry_proposals` (én DR/KR, ingen linjer-array, ingen markør, ingen bilagshash, tre status-akser der modsiger hinanden).
- `collected_transactions` med e-conomic som kilde — designets `bank_transaktion` fra Enable Banking er det rigtige; e-conomic er modtager, ikke kilde.
- `memory_facts` som regelmotor (tekst, dato i nøglen, dubletter). Regler skal være rækker i `konteringsregel`.
- Multi-tenant-laget (`organizations`, `members`, `workspaces`, `provider_catalog`, `provider_role_support`, `provider_capabilities`, `workspace_declared_stack`) — ét selskab (eller få) har ikke brug for det.
- Personaerne og `agent_runs` uden omkostning.
- Hele RPC-fladen (§7) og credentials i tabel.

**Nye fakta, designet bør tage stilling til:**
1. **Pleo (konto 5830)** er betalingskanalen for SaaS/annoncer (Lovable, Anthropic/OpenAI, Meta Ads, Circle, Google, Klaviyo). Nordea ser kun Pleo-optankningen. Pleo har egne kvitteringer og en e-conomic-integration → «bank = konto»-beviset og matchet skal have Pleo som egen kilde eller eksplicit som «bogholder/Pleo bogfører». UMÅLT om Pleo stadig bruges.
2. **Kladder i brug:** 1, 3, 8, 9, 10, 11 (år 2026). Designets «dedikeret agent-kladde» er nødvendig — det gamle system brugte menneskernes kladder.
3. **Løn** konteres i én samlet multi-linje-postering (2210, 5820, 2223, 6920, 6921, 6930 set i agentens begrundelse). Løn bør være niveau C/eget flow fra lønsystemet.
4. **Relateret part:** Mola Invest ApS (husleje + managementfee). Hører under designets ejer-/relateret-part-værn.

### 8.2 Til marketingmotoren (`/home/claude/meta-automatisering-30-09.md`)

**Genbrug som begreb:**
- `marketing_approval_queue` (handling, payload, `risk_facts`, `gate_evaluation`, udløb, `execution_result`) + `workspace_marketing_policy` + «pathToAuto»-idéen = forslagstabellen i planens §3.1 (`annoncemotor_forslag`). Planens version med FØR/sendt/EFTER-spor er stærkere.
- `marketing_anna_overview_cache` — cache pr. vindue mod Klaviyos rate limit (2/min på values-reports). Relevant for Klaviyo-læsning, ikke Meta.
- `flow_outcomes` (24t/7d/30d-vinduer, én gang pr. vindue via UNIQUE) — samme princip som «tæller og nævner over samme vindue». Tabellen er tom; ikke bevist.
- `marketing_flows`-kolonnerne `last_gdpr_critique*`, `last_pre_deploy_critique_artifact_hash` — idéen om at binde en kritik til en hash af det, der udrulles. God til kreativ-godkendelse (fase 4).
- `memory_facts` kind `voice` (10), `brand_principle` (8), `brand_visual_identity` (8), `icp` (2), `product_catalog` (9) — kandidatmateriale til `grundlag.ts`, men LLM-skrevet og ikke kontrolleret mod `KENDTE_TAL`/`FORBUD`.

**Kasseres:** hele Marie/Karl/Emil/Director-kæden. Den fejlede på værktøjskaldets form, har ingen statistik (ingen Wilson, ingen «kan ikke afgøres»), director-planerne blev genereret uden at nogen godkendte dem, og der er **ingen Meta-kode** — kun Klaviyo. Platformens lag 1/2/3/6 er længere fremme.

**Et faktum til marketingplanen:** `memory_facts` bekræfter, at **Sentury ApS er marketingkonsulenten**, bogført på konto 2807 med månedlige fakturaer (jan 12.300, feb 13.875, mar 17.700 kr. — LLM-læst fra e-conomic, ikke målt mod bilag). Det besvarer delvist planens §1.3 «UMÅLT: om Nicklas og Sentury er samme aktør» — at Sentury er konsulentfirmaet, ikke hvem der står bag.

---

## 9. Hvad jeg ikke har målt

- Koden i `jonastopix/theboardroom-2` (worker, prompts, e-conomic-klient, scheduler, web-UI).
- Hvor workeren kørte, og hvorfor den stoppede 24/6.
- Om e-conomic-grantet, Stripe-nøglen og Klaviyo-nøglen stadig er gyldige, og om platformen deler dem.
- Om e-conomic-kontiene 1011/1340/5840 bærer momskoder, der gør én-linje-bogføringen korrekt.
- Om de 9 udsendelser fra godkendelseskøen faktisk blev sendt fra Klaviyo (kun `executed` i tabellen er set).
