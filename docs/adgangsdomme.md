# Adgangsdommene — hvem afgør adgang, hvad de læser, og hvor de er uenige

**Skrevet 3. september 2026, aften.** Tværgående dokument: det hører
hverken til indgangen (`docs/indgangen-design.md`) eller fornyelsen
(`docs/fornyelseskaeden-1-september.md`), fordi dommene nedenfor bærer
begge — og community, indhold, events og storage oven i. Derfor får det
sit eget sted. Reconen bag det hele ligger uden for repoet
(`~/Downloads/recon-restance.md`, 3/9 aften) og skal genskabes hvis den
bruges; hver påstand her bærer sti og linje fra den.

Anledningen var restancepolitikken (`docs/indgangen-design.md` §31,
`docs/fornyelseskaeden-1-september.md` §9): før den kunne bygges, skulle
vi vide præcis hvad der i dag afgør et medlems adgang, og hvor
abonnementets tilstand indgår. Svaret var mere spredt end
`docs/OVERLEVERING.md` hidtil har sagt, og det er grunden til at
politikken blev udskudt (§5).

---

## 1. De fem domme

OVERLEVERING har hidtil sagt «`computeMembershipTier` i tre spejle plus
fornyelsesmotoren». Målt i repoet 3/9 aften er det **fem domme**, og de
to sidste er ikke dækket af nogen paritetstest.

| # | dom | hvor | læser | udfald | fail-… | dækket af paritetstest |
|---|---|---|---|---|---|---|
| 1 | `computeMembershipTier` | `src/lib/membershipTier.ts:21–35` (kanonisk) | `contract_end_date`, `subscription_status`, `subscription_current_period_end` | `no_date` · `full` · `subscriber` · `expired` | — | ja (frontend-cases) |
| 2 | `computeMembershipTier` | `supabase/functions/_shared/membershipTier.ts:21–35` | samme | samme | — | ja, men kun fem inputs |
| 3 | `is_membership_active(uuid)` | migration `20260810150000_directory_aktive_medlemmer.sql:37–58` | samme tre felter | `boolean` | **open**: ukendt virksomhed eller NULL giver `true` | nej |
| 4 | `har_aktivt_medlemskab(uuid)` | migration `20260811160000_community_adgang.sql:26–41` | KUN `contract_end_date` (+ `is_legat`) | `boolean` | closed | nej |
| 5 | `har_aktivt_abonnement(uuid)` | migration `20260813100000_abonnent_gate_indhold.sql:37–53` | KUN `subscription_status = 'active'` + fremtidig `subscription_current_period_end` (+ `is_legat`) | `boolean` | closed | nej |

**Dom 1 og 2** er ordret identiske i kroppen. `diff` mellem de to filer
giver præcis to forskelle, begge i filhovedet (stien, og hvem der spejler
hvem). Pariteten håndhæves af `src/lib/__tests__/membershipTier.test.ts`,
som kører i CI (`.github/workflows/test.yml:57`). Men paritetsblokken
(linje 116–132) kører kun **fem** inputs gennem begge kopier: alle null,
fremtidig kontrakt, udløbet kontrakt med aktivt abonnement, udløbet uden
abonnement, og kontrakten præcis nu. `past_due` er ikke blandt dem — den
findes kun som frontend-case (linje 70–74: `past_due` med fremtidig
period_end giver `expired`).

**Dom 3** er migrationens egen «kopi nr. 3» (kommentaren linje 21–26
lister de tre steder og siger «Ændringer i tier-logikken SKAL spejles
alle tre steder»). Samme sandhedstabel som dom 1, men returneret som
boolean: `no_date`, `full` og `subscriber` bliver alle `true`, kun
`expired` bliver `false` — og en NULL eller ukendt virksomhed bliver
`true` (linje 56: «fail-open»). Den kaldes af `get_member_directory`,
`get_event_participants` og `get_event_non_responders`, altså
Netværket, deltagerlister og event-påmindelser. Ingen RLS-policy kalder
den; ingen kode kalder den direkte.

**Dom 4** vurderer bevidst IKKE abonnementsfelterne. Funktionens egen
kommentar: «selvbetjeningsabonnenter har ikke community-adgang. NULL
slutdato giver ikke adgang (modsat is_membership_active, som er
fail-open til directory-brug), og legat-virksomheder er udelukket.» Den
bærer RLS på `community_traade`, `community_svar`,
`community_reaktioner`, `community_visninger`, `content_items`,
`content_collections`, `content_item_attachments`, `events`,
`event_registrations` og `storage.objects` (bucket `content-assets`),
og den står som eget adgangstjek i omkring 25 community-RPC'er
(`IF NOT (har_aktivt_medlemskab(auth.uid()) OR has_role(auth.uid(),
'advisor')) THEN RETURN;`), i billed- og fil-adgangsdommene, og i
`get_community_medlemmer`, som opslagsmailen og nævnelserne bygger på.

**Dom 5** er modstykket: KUN abonnementet, aldrig datoen. Funktionens
kommentar: «De to svarer paa HVER SIT spoergsmaal og maa aldrig slaas
sammen: datoen afgoer fuldt medlemskab, abonnementet afgoer
exit-adgang.» Den bruges i tre content-policies, altid som
`OR (har_aktivt_abonnement(auth.uid()) AND area = 'talks')` — abonnenten
på «Dine tal» ser Podcast & Talks og intet andet indhold.

**Fornyelsesmotoren** `afgoerFornyelsestilstand` (`src/lib/fornyelse.ts`
og spejlet `supabase/functions/_shared/fornyelse.ts`) har ingen egen
abonnementsdom: den kalder `computeMembershipTier` (linje 106–113) og
forgrener på tier (`expired` → ophoert/udloebet_*, `subscriber` →
selvbetjener). Filhovedet siger det selv: «En lokal kopi af
udløbslogikken her ville være kopi nr. 4». Spejlet adskiller sig kun i
importstien og filhovedet; pariteten låses af
`fornyelseParitet.test.ts`.

### Pointen

En ændring i tier-logikken der rettes i dom 1, 2 og 3 — de tre
OVERLEVERING kendte — efterlader dom 5 med den gamle dom. Og dom 5
styrer indhold. Dom 4 rammes ikke af en abonnementsændring (den læser
ikke feltet), men rammes af enhver ændring i hvad «kontrakten løber»
betyder. Ingen af de to har en test der binder dem til de tre andre.

---

## 2. Den eneste dom på feltet

Hele repoet sammenligner `companies.subscription_status` med præcis
strengen `active` og intet andet. Målt 3/9 med grep over `src/`,
`supabase/functions/` og `supabase/migrations/`:

| sti:linje | sammenligning |
|---|---|
| `src/lib/membershipTier.ts:28` | `input.subscription_status === "active" &&` |
| `supabase/functions/_shared/membershipTier.ts:28` | `input.subscription_status === "active" &&` |
| `20260810150000_directory_aktive_medlemmer.sql:49` | `WHEN c.subscription_status = 'active'` |
| `20260813100000_abonnent_gate_indhold.sql:49` | `AND c.subscription_status = 'active'` |

`past_due`, `unpaid`, `canceled`, `cancelled` og NULL falder alle i
samme gren: `expired` hos dom 1–2 (når kontrakten er udløbet), `false`
hos dom 3 og 5. De eneste træffere på `past_due`/`unpaid` uden for tests
er en `<option>` i `src/components/members/EditCompanyDialog.tsx:196`,
kolonnekommentaren i migration `20260421192257` («active, cancelled,
past_due, or NULL for contract members») og en kommentar i
`20260903150000_company_traek.sql:6`. Ingen af dem er en betingelse.

Feltet **skrives** fire steder: `stripe-webhook/index.ts:491` skriver
`sub.status` råt (hvad end Stripe sender) for det art-løse
selvbetjeningsabonnement; `stripe-webhook/index.ts:521` skriver
`"cancelled"` ved sletning — med to l, som ikke er Stripes værdi
(`canceled`); rådgiveren kan sætte det manuelt i `EditCompanyDialog`
(linje 96, valgmulighederne `active`/`cancelled`/`past_due`); og
migrationen opretter kolonnen med `DEFAULT NULL`. Efter hvidlisten fra
#563 skriver medlemskabsabonnementer med en `art` (indgang, fornyelse,
migreret) aldrig i feltet.

---

## 3. Målt i prod 3. september 2026 kl. 20:32 (Lovable SQL editor)

- **Alle 38 rækker i `companies` har `subscription_status = NULL`.** Ingen
  andre værdier findes.
- **Ingen virksomhed har udløbet kontrakt OG en status forskellig fra
  `active`** — sektionen kom tom tilbage. Ingen er lukket ude af
  abonnementsdommen i dag.
- **`is_membership_active`, `har_aktivt_medlemskab` og
  `har_aktivt_abonnement` i prod matcher migrationsfilerne**
  (`pg_get_functiondef`, alle tre `true`).
- **`company_traek`: 0 rækker.** Første træk falder 13/9.

Adgang afgøres i dag altså af `contract_end_date` alene, for alle 38.
`useAuth` remapper oven i det `no_date` og «ingen række» til `full`
(`src/hooks/useAuth.tsx:128–130`), og ruteværnene i `src/App.tsx:80, 89`
redirecter kun `expired`.

---

## 4. Målt i Stripe 3. september 2026, aften (MCP, livemode)

**Ny konto `acct_1U6mzp3CvBmCx5Pt`:** tre abonnementer i alt. Kun
doggybed er aktivt (`sub_1UB6wE3CvBmCx5Ptq3hHp2vt`, `art = migreret`,
`cancel_at` 13/10 2026). De to andre er annullerede testabonnementer fra
2/9 på `company_id 1196c02a-3670-4b4e-a456-84dc70cfda73`. Nul i
`past_due`, nul i `unpaid`.

**Gammel konto `acct_1QP3Js4DoYItGRbI`:** ét abonnement i `past_due`
(`sub_1TRWKT4DoYItGRbIMpzVvibR`, kunde `cus_UQN4yeWvSiDOJe` «YKRG APS»,
`delinquent true`), nul i `unpaid`.

**YKRG's fakturaer** — restance er ikke en sammenhængende tilstand:

| faktura | periode | status | beløb | forsøg | næste forsøg |
|---|---|---|---|---|---|
| UVXL7LPI-0003 | 29/6–29/7 | åben | 5.468,75 kr. | ni | intet |
| UVXL7LPI-0004 | 29/7–29/8 | betalt 10/8 | | | |
| UVXL7LPI-0005 | 29/8–29/9 | åben | 5.468,75 kr. | tre | 4/9 kl. 19:32 dansk tid |

Udestående 10.937,50 kr. Der er huller i restancen — en betalt faktura
mellem to åbne — og abonnementets status alene kan ikke se forskel på
«ét træk fejlede i går» og «en faktura har stået åben i to måneder».
Det er præcis den forskel `company_traek` (#572) er bygget til at bære:
ét spor pr. faktura, ikke én status pr. abonnement.

YKRG's abonnement bærer metadata fra Topix-paywallen
(`checkout_attempt_id`, `paywall_id`, `paywall_price_ids`, `paywall_url`,
`source`) og hverken `company_id` eller `art`.

---

## 5. Rettelse, bogført som fejl (Claude i chatten, 3/9 aften)

Claude påstod at YKRG's næste fejlede forsøg kunne flytte abonnementet
til `unpaid` og dermed lukke adgangen efter den besluttede politik. Det
er forkert ad tre veje:

- **(a)** Abonnementet bærer ingen `company_id`, og webhookens skrivning
  står bag `if (companyId)` i `stripe-webhook` (målt 3/9 aften: linje 487
  og 517 i den nuværende fil), så der skrives intet.
- **(b)** Flyttes det til den nye konto, får det `art = migreret` og
  rammer hvidlisten fra #563 — springes over.
- **(c)** YKRG's adgang kommer af `contract_end_date`, ikke af
  abonnementet.

Restancen er reel som inddrivelsessag, men kan ikke røre adgang.
**Lærdommen:** en tilstand i Stripe er kun en tilstand hos os, hvis der
findes en vej fra eventet til en skrivning — og den vej skal måles, ikke
antages.

---

## 6. Besluttet 3. september 2026, aften: restancepolitikken udskydes

Politikken (`past_due` = åben adgang, `unpaid` = lukket) blev besluttet
tidligere (`docs/fornyelseskaeden-1-september.md` §9,
`docs/indgangen-design.md` §31) og er ikke bygget. Den bygges ikke nu, af
tre grunde:

1. **Den rammer nul rækker.** Feltet er NULL på alle 38 virksomheder (§3),
   og efter hvidlisten fra #563 kan kun det art-løse
   selvbetjeningsabonnement nogensinde sætte det. Der findes ingen af dem
   i dag (§4).
2. **Den ville ændre fem domme, hvoraf to ikke er paritetstestede** og
   bærer community, indhold, events og storage (§1). Hele nedsiden, ingen
   opside.
3. **Formen er forkert for den gruppe der faktisk har restance.** For
   rateabonnementer (indgang, fornyelse, migreret) er en fejlet rate en
   INDDRIVELSESsag, ikke en adgangssag — kontrakten er betalt ved
   underskrift, og en fejlet rate 5 ophæver den ikke. Det spor er
   allerede åbnet med `company_traek` (#572) og badgen på /members
   (#574). Politikken hører kun til selvbetjeningsabonnementet «Dine
   tal», hvor abonnementet ER adgangen.

**Den bygges den dag det første selvbetjeningsabonnement oprettes.**
Formen er da: motor før flade, og en paritetstest der dækker `past_due`
og `unpaid` i ALLE fem domme — ikke kun de to TypeScript-kopier.

**Åbent punkt — forudsætning, ikke detalje:** der findes i dag NUL tests
af de tre SQL-domme. Grep 3/9 aften over `src/`, `mcp/` og
`supabase/` fandt ingen testfil der nævner `is_membership_active`,
`har_aktivt_medlemskab` eller `har_aktivt_abonnement`; de eneste
Deno-tests i repoet er `_shared/*_test.ts`, som kører i hånden og ikke
rører databasen. En rigtig paritet mellem TypeScript og SQL kræver derfor
testinfrastruktur som ikke findes i repoet endnu — en måde at køre
SQL-funktionerne mod en database med kendte rækker og sammenligne
udfaldet med `computeMembershipTier` på samme input. Uden den vil
«paritetstest på alle fem domme» læses som noget der bare kan skrives.
Det er den første opgave, den dag politikken bygges.

Bogført i `docs/OVERLEVERING.md` DEL 3 (rækken «UDSKUDT 3/9 aften») og
DEL 4 (fælden om de fem domme).
