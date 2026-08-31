# Forslagsflade-recon — kan et medlem se og besvare et 'proposed'-forslag? (2026-08-31)
> Skrevet 2026-08-31. Øjebliksmåling — linjenumre og tal gælder den dag, ikke i dag.

Grundlag: main pr. a032f9a8, docs/opgave-model-design.md (B1-B11),
docs/opgave-skrivevej-recon.md (committet i cc51099e, 2026-08-25 09:42),
BACKLOG.md [P1] "Agentens forslagsrum" (:43-58), prod-tal oplyst 31/8
(70 proposed/ai_weekly hos 14 virksomheder 24/8-31/8, 3 proposed/agent 27/8,
59 open-rækker stopper 17/8).

## SVARET FØRST

**Se: JA — siden PR #422 (24/8 23:17).** Medlemmets forside (BoardroomView)
læser `.in("status", ["open", "proposed", "active"])` og viser forslagene som
fokus-punkter.

**Besvare: NEJ.** De tre skriveveje (opgave-accepter/-udskyd/-luk) findes,
er deployet og korrekt sikret — men **ingen kode i src/ kalder dem**. Grep
efter `functions.invoke` kombineret med "opgave" giver nul hits i hele src/.
Der findes ingen accept-knap, ingen datovælger, ingen udskyd/luk-kontrol
nogen steder i medlemsfladen. Forslagets fokus-punkt har CTA `ctaHref: "/"`
— forsiden selv — og som primærpunkt renderes derfor ingen knap overhovedet
(opgave-skrivevej-recon §1: "peger på '/' og får derfor ingen knap").

**De 70 ligger altså ubesvarede fordi medlemmet ikke KAN svare — ikke fordi
noget spærrer.** Backend-vejen er komplet og venter; det manglende led er
rent UI. BACKLOG bogfører det selv i [P1]-punktet fra 25/8: "motor + tre
edge functions findes, PR #423, **men medlemmet har ingen knapper**."
RAEKKEFOELGE.md:54 og plan-fra-27-august.md §4 nævner begge "Medlemmets
opgaveflade" som det åbne fase 1-punkt.

---

## 1. Hvad læser company_actions i dag

### src/ — læsere

| Sted | Filter | Læser 'proposed'? |
|---|---|---|
| BoardroomView.tsx:1369-1370 | `.eq("company_id", …).in("status", ["open", "proposed", "active"]).order("created_at", desc).limit(10)` | **JA** |
| DashboardActionCenter.tsx:195-196 | `.eq("status", "open")` | Nej — men **død kode** (nul imports; kun kommentar-referencer i AppLayout.tsx:16 m.fl.) |

BoardroomView er den ENESTE levende medlemsflade der viser company_actions
(kommentaren :1362 fastslår det selv; grep bekræfter). Bemærk to ting ved
læsningen:

- **`status` smides væk i mappingen**: :1494 mapper til
  `{ id, title, priority, context }` — status læses ikke videre. nextStep.ts
  slot (f) (:222-236) behandler alt som `kind: "company-action"` med
  beskrivelses-fallback "Åben handling fra din handlingsplan." (:231).
  Et forslag og en arve-'open'-række præsenteres identisk.
- **Ingen filtrering på `expires_at`**: kolonnen er hverken i selecten eller
  filteret. Se §4 for konsekvensen.

Ingen rådgiverflade læser company_actions (AdvisorDashboard: nul
forekomster; MemberDetail: nul — panelet dér læser `agent_proposals`, en
anden tabel, se §3).

### supabase/functions/ — læsere og skrivere

| Function | Sted | Hvad |
|---|---|---|
| opgave-accepter | index.ts:58-62 opslag, :90-100 write | Opslag **pr. id** med kalderens klient (RLS-gated), intet statusfilter — motoren dømmer overgangen. Optimistisk lås `.eq("status", opgave.status)` (:98) |
| opgave-udskyd | index.ts:56, :88 | Samme mønster (lås på status + deferral_count) |
| opgave-luk | index.ts:56, :89 | Samme mønster |
| generate-weekly-focus | index.ts:561 | **Skriver** `status='proposed'` + expires_at (14 dage) — kilden til de 70 |
| run-company-agent | index.ts:759-769 | **Skriver** nu OGSÅ ny form: `status: "proposed"`, `expires_at: beregnUdloeb("agent", …)` — chat-recon-2's "gammel form, status open" er forældet (rettet i PR #422). Kilden til de 3 'agent'-forslag fra 27/8 |
| _shared/companyHardDelete.ts:67 | | DELETE pr. company_id, status-agnostisk |

Ingen edge function læser 'proposed' i bulk (ingen digest, ingen tæller,
ingen cron).

---

## 2. forslagFlade.ts — hvad, hvem, renderes den?

**Vigtig afgrænsning: forslagFlade.ts handler IKKE om company_actions.**
Den er fladens spejl af `_shared/forslagEngine.ts` — motoren bag
**agent-forslag-afgoer**, som afgør rækker i `agent_proposals` (agentens
tør-kørsels-forslag om fx update_weekly_focus/write_session_prep).
Den eksporterer to konstanter (forslagFlade.ts:15-32):

- `UNDERSTOETTEDE_SKRIVEVEJE_FLADE` — kun `update_weekly_focus` og
  `write_session_prep` kan godkendes; øvrige tools får ingen godkend-knap.
- `FORKAST_KATEGORI_LABELS` / `FORKAST_KATEGORIER_FLADE` — de fem
  forkast-kategorier med danske labels.

**Kæden til JSX** (og den ER koblet på en renderet flade):
forslagFlade.ts → import i `AgentForslagPanel.tsx:22` →
`<AgentForslagPanel companyId={memberCompanyId} />` mountes i
**MemberDetail.tsx:1499** — rådgiverens virksomhedsside (/members/:id).
Panelet kalder `supabase.functions.invoke("agent-forslag-afgoer", …)`
(AgentForslagPanel.tsx:158). Det er en **rådgiverflade** for agent-forslag —
det giver ikke medlemmet noget, og det rører ikke company_actions.

Paritetsværnet `forslagFlade.paritet.test.ts` holder spejlet i sync med
Deno-motoren (samme mønster som opgaveEngineSpejl.paritet.test.ts).

---

## 3. De fire edge functions — hvem kalder dem?

Alle fire står i config.toml med `verify_jwt = true` (:118-125 for de tre
opgave-functions, :7 for agent-forslag-afgoer) og er Bucket A
(`authenticateUser` først, kalderens klient til RLS-opslag, ejerskabs-tjek
`user_id === callerId`, motoren dømmer, service-role skriver med optimistisk
lås). Edge functions auto-deployer fra merge, så de ER live.

| Function | Kaldesteder | Bevis |
|---|---|---|
| **opgave-accepter** | **INGEN** | Grep i hele src/ efter navnet: eneste hit er en KOMMENTAR i BoardroomView.tsx:1362. Grep `functions.invoke` + "opgave": nul hits |
| **opgave-udskyd** | **INGEN** | Samme greps, nul hits |
| **opgave-luk** | **INGEN** | Samme greps, nul hits |
| **agent-forslag-afgoer** | ÉT: AgentForslagPanel.tsx:158 (`supabase.functions.invoke("agent-forslag-afgoer", …)`) | Rådgiverflade i MemberDetail.tsx:1499 — afgør agent_proposals, ikke company_actions |

**Der findes ingen knapper i medlemsfladen der rammer opgave-accepter,
opgave-udskyd eller opgave-luk.** De tre functions har stået ukaldte siden
de blev bygget i PR #423 (24/8 23:48).

---

## 4. opgaveUdloeb.ts og udløbs-cron'en

`_shared/opgaveUdloeb.ts` er **kun B10-fristberegningen** (UDLOEBSDAGE:
advisor 30 / reflection 21 / ai_weekly 14 / agent 14, fallback 14;
`beregnUdloeb` :29-33). Den bruges af skriverne (generate-weekly-focus,
run-company-agent) til at sætte `expires_at` ved INSERT. Den lukker intet.

**Udløbs-cron'en findes ikke.** Bevis:

- Grep efter "opgave"/"udloeb"/"expired" i supabase/migrations/: kun
  20260822220000 (kolonner) og 20260822224100 (RLS). Ingen cron-migration.
- Eneste `cron.schedule` siden 22/8 er 20260825233000_agent_runs_opbevaring.sql:91
  — opbevaring af agent_runs, ikke opgaver.
- opgave-luk/index.ts:2-4 bekræfter designet: "'expired' er BEVIDST ikke et
  klientvalg: det er tavshedens udfald og hører til udløbs-cron'en (B8)" —
  en cron der altså ikke er bygget. Indekset idx_company_actions_expiry står
  klar (migration 20260822220000).

**Konsekvens pr. 7/9** (første portion ai_weekly fra 24/8 + 14 dage):
ingenting sker. Ingen cron flytter dem til 'expired', OG BoardroomViews
læsning filtrerer ikke på expires_at (§1) — så B8's "forslaget forsvinder
fra medlemmets liste når expires_at passerer" er ikke implementeret i
NOGEN ende. Fra 7/9 viser forsiden udløbne forslag som var de aktuelle,
og de bliver ved med at ligge som 'proposed' i data.

(Mønstret til cron'en er dokumenteret i opgave-skrivevej-recon §7: pg_cron →
net.http_post med vault-nøgle → Bucket B-function; inkl. advarslen om at
vault kun indeholder `email_queue_service_role_key`, og at Deno.cron-sporet
er dødt.)

---

## 5. Git-historik siden 24/8 der forklarer det byggede

Opgave-modellens spor:

| Commit | PR | Tid | Besked |
|---|---|---|---|
| be218dc1 | #422 | 24/8 23:17 | fix: opgave-forslag var usynlige — medlemsfladen kendte kun 'open'. (Tilføjede 'proposed' til BoardroomView-filteret OG flyttede run-company-agents write_company_action til proposed-formen, jf. opgave-skrivevej-recon §6F) |
| 2a7f7209 | #423 | 24/8 23:48 | feat: opgave-modellens skrivevej — accept, udskyd og luk via edge functions. (De tre functions, _shared-spejlene opgaveEngine/opgaveRad/opgaveUdloeb, paritetstests, 'active' i BoardroomView-filteret) |
| cc51099e | (#424-serien) | 25/8 09:42 | feat: tør-kørsel og kørselstabel for run-company-agent. (Indeholder også docs/opgave-skrivevej-recon.md) |

Agent-forslags-sporet (forklarer forslagFlade/forslagEngine og panelet):

| Commit | PR | Tid | Besked |
|---|---|---|---|
| 4e413444 | #425 | 25/8 10:18 | feat: indholdskoblingen i run-company-agent |
| c480b575 | #426 | 25/8 11:17 | feat: agentens tør-kørsel flyttet til virksomhedsniveau (company_review) |
| 42efd92d | #427 | 25/8 11:45 | feat: agent_proposals — ét forslag pr. række til godkendelseslaget |
| dd1d7e85 | #428 | 25/8 12:19 | feat: agent-forslag-afgoer — afgørelsesvejen for agent-forslag |
| d44a01c0 | #429 | 25/8 12:54 | fix: uge-nøglen er ægte ISO-8601 fra én delt kilde |
| 411cd32d | #430 | 25/8 13:15 | feat: agent_proposals.decision_category — forkastelsens tællelige dom |
| 9a6ffd43 | #431 | 25/8 13:34 | feat: agent-forslag-fladen — rådgiverens afgørelse pr. forslag (AgentForslagPanel) |
| 1be6bcf7 | #432 | 25/8 13:57 | feat: agent_runs-opbevaring — §6.3 lukket med ren SQL-cron |
| 1af5b2ac | #433 | 25/8 14:31 | feat: tør er default i run-company-agent — live kræver dry_run: false |
| d3b6bec3 | — | 25/8 14:50 | docs: bogfør driftmålinger 25/8 — forslagsrum-revnen [P1] og DEPLOY_STAMP [P2] |

Siden 26/8 har arbejdet ligget på estimat/data_basis-sporet (#434-#438),
årsrapport-vejen (#439-#445) og fornyelsesordningen (#448-#452) — intet af
det rører opgave-modellen. Fladen har altså stået urørt siden 25/8.

---

## 6. Hvad mangler præcist, led for led

Backend spærrer IKKE — kæden knækker udelukkende i fladen:

1. **Accept-UI'et findes ikke.** Ingen komponent viser et 'proposed'-forslag
   SOM forslag (status smides væk i BoardroomView.tsx:1494), ingen ja-knap,
   ingen datovælger. B6 kræver at accept er "sig ja + vælg hvornår" —
   opgave-accepter kræver `{ opgaveId, dato }` (index.ts:48-55), så UI'et
   skal bære en datovælger.
2. **Ingen kalder opgave-accepter.** Nul invoke-steder (§3). Selve kaldet +
   invalidering af `["boardroom", "company-actions", companyId]`-query'en
   mangler.
3. **Udskyd/luk-UI'et findes ikke.** opgave-udskyd og opgave-luk lige så
   ukaldte. B7's "drop den som ligeværdigt valg" har ingen flade.
4. **Fokus-punktets CTA fører ingen steder.** `ctaHref: "/"`
   (nextStep.ts:233) er forsiden selv; som primærpunkt renderes ingen knap.
   "Handlings-visningen ejes af fokus-laget" er endnu ikke sket (kommentaren
   :220-221 siger det selv: "indtil").
5. **Udløbs-cron'en (B8) findes ikke** — og læsevejen filtrerer heller ikke
   på expires_at, så udløb er i dag uden virkning i begge ender (§4).
   Første portion rammer 7/9.
6. **Efter accept-fixet er 'active' synlig men udømt**: filteret medtager
   'active' (så en accepteret opgave ikke forsvinder, :1361-1364), men
   nextStep skelner ikke — forfald (B2, `erForfalden` i motoren) har ingen
   flade og ingen cron.
7. **Frontend-deploy-leddet**: når UI'et bygges, er det src/-kode — kræver
   "Update"-klik i Lovable efter merge (edge-delen auto-deployer allerede).

Til sammenligning er disse led PÅ PLADS: motor + spejl med paritetstests,
RLS (klient-write lukket, service-role-only), de tre edge functions
(Bucket A, deployet, verify_jwt=true), begge producenter skriver korrekt
proposed-form med expires_at, og medlemmets forside VISER forslagene.
Det er præcis ét lag — medlemmets opgaveflade (RAEKKEFOELGE:54) — der
mangler mellem 70 ubesvarede forslag og de svar, systemet er bygget til
at modtage.
