# Recon: «Online nu» viser aldrig nogen (30/9-2026) — KUN FUND

Læst fra `origin/main` = `bddf563` (#1159) i worktree `/home/claude/wt-online`. Ingen ændringer. Prod er IKKE målt herfra — målingerne nedenfor er Jonas'.

## 0. Hvad teksten «Ingen medlemmer online lige nu.» faktisk beviser

`RaadgiverForsideView.tsx:761-782`: teksten vises kun når `online.status === "live"` (ellers fejltekst eller skelet). Så **rådgiverens join lykkedes** (SUBSCRIBED). Men den samme tekst vises i TO forskellige tilfælde, som fladen ikke skelner:
- (i) presence-state er tom (`online.ids.length === 0`), og
- (ii) presence bar id'er, men dommen `onlineMedlemmer` sorterede dem alle fra (`:780` `const liste = … onlineMedlemmer(…)`; `:781` `if (liste.length === 0) … INGEN_ONLINE_TEKST`).

## Årsag 1 (mest sandsynlig for DENNE test): testmedlemmet sorteres bevidst fra af dommen

- `src/lib/hjemmebane/online.ts:103`: `const kunder = egne.filter(erKunde); if (egne.length > 0 && kunder.length === 0) continue; // kun ikke-kunder: vores egen virksomhed`
- `src/lib/raadgiverensKunder.ts:23-25`: `erKunde = c.er_kunde !== false`.
- `docs/OVERLEVERING.md:8609` og `:8715` (§32), 16/9 18:45 målt: «Jonas Herlev · kontakt@topix.dk … roller=(ingen) | virksomheder=Topix.dk ApS [er_kunde=false, legat=false]» — «Test 18:45 med kontakt@topix.dk: ingen vist — Topix.dk ApS er er_kunde=false og sorteres bevidst fra».
- `docs/OVERLEVERING.md:11564` (fælden, ordret): «Din testkonto» er ikke et medlem: Topix.dk ApS er `er_kunde=false` og filtreres bevidst fra i «Online nu» … testen med kontakt@topix.dk kunne aldrig vise noget. Et bevis for en medlemsgren kræver et KUNDEMEDLEM … tjek `companies.er_kunde` FØR testen.»
- Er `er_kunde` stadig false i dag, er testen 30/9 06:39 den samme som 16/9 18:45 og kan ikke vise nogen — uanset om Realtime virker.

## Årsag 2 (mest sandsynlig for at den ALDRIG har vist nogen): medlemmet har kun INSERT og kan ikke joine den private kanal

- Migrationen `supabase/migrations/20260917100000_online_presence.sql:86-93` giver medlemmer KUN `for insert`; SELECT (`:96-104`) kræver `has_role(…,'advisor')`.
- Migrationen erkender det selv, `:39-43`: «UBEVIST ANTAGELSE (bevisplan (a) …): at en klient med KUN INSERT-ret kan joine en privat presence-kanal («To join a Broadcast Channel, a user must have at least one read or write permission» — for presence står det ikke ordret).» Ingen senere bogføring i `docs/` af at (a) er bevist (grep «antagelse (a)» → kun «BEVIS UDESTÅR»-linjer 8754, 8774, 8796, 11310).
- Dokumentationen:
  - https://supabase.com/docs/guides/realtime/authorization : «To join a Broadcast Channel, a user must have at least one read or write permission on the Channel topic.» — gælder ordret kun Broadcast.
  - https://supabase.com/blog/supabase-realtime-broadcast-and-presence-authorization : «The checks are done by running SELECT and INSERT queries on the new `realtime.messages` table which are then rolled backed» og afvisningen ved join: «You do not have permissions to read from this Topic» — join-afvisningen formuleres som manglende LÆSE-ret.
  - https://supabase.com/docs/guides/troubleshooting/realtime-messages-not-arriving.md : «You'll need RLS policies on `realtime.messages` scoped to `extension = 'presence'` for the connecting role: a `select` policy to receive presence updates and an `insert` policy for `channel.track()`.» og «On a private channel, you need an RLS policy that allows the join for your role.»
  - Dokumenternes eget presence-eksempel (authorization-siden) har BÅDE en `for select`- og en `for insert`-politik til samme rolle.
- Hvis join afvises, er fejlen tavs: `src/hooks/onlineTracking.ts:45-49` håndterer kun `SUBSCRIBED`; `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` ignoreres, og filhovedet `:31-33` siger det er bevidst («logges ikke til medlemmet»). Der er altså intet sted i appen, hvor et afvist medlems-join bliver synligt.
- Ikke afgjort af dokumentationen: om Realtime-serveren (Lovables version) kræver read ved join for presence. Serverens kildekode kunne ikke hentes herfra (curl 403 via proxy; WebFetch afviste github-URL'en).

## Årsag 3 (lavere): «Allow public access» — dokumentationen modsiger husets antagelse

- https://supabase.com/docs/guides/realtime/authorization (som hentet 30/9): «To enforce private channels you need to disable the 'Allow public access' setting in Realtime Settings».
- Migrationen `:29-31` og OVERLEVERING §29 antager det modsatte («private kanaler håndhæver politikkerne uanset»).
- Retning: hvis private kanaler IKKE håndhæves mens «Allow public access» er slået til, skulle medlemmet kunne joine frit — det forklarer altså ikke tomheden, men betyder at hverken årsag 2 eller politikkerne er målt i den tilstand, projektet faktisk kører i. Indstillingen er ikke målt.

## Tjekket og IKKE årsagen (fund)

- **supabase-js/realtime-js-version:** `bun.lock:438,442` → `@supabase/realtime-js@2.97.0`, `@supabase/supabase-js@2.97.0`. setAuth: `node_modules/@supabase/supabase-js/dist/index.cjs:362-367` `_handleTokenChanged` kalder `this.realtime.setAuth(token)` ved auth-hændelser; `RealtimeChannel.js:140-141` lægger `access_token` i join-payloaden når `socket.accessTokenValue` findes. Manuelt `setAuth()` er ikke nødvendigt i denne version (målt i kildekoden, ikke i drift).
- **presence enabled:** `RealtimeChannel.js:130-132`: `presence_enabled = (presence-bindings > 0) || config.presence.enabled === true`. Rådgiverens kanal (`onlineMedlemmer.ts:115-121`) har tre `.on('presence')` → enabled. Medlemmets (`onlineTracking.ts:43`) har `enabled: true`. Ok.
- **extension/topic:** `'presence'` er dokumentationens værdi («For Presence messages, the value of `realtime.messages.extension` is `presence`»); `realtime.topic()` bruges som i dokumentationens eksempel `(select realtime.topic())`. Politikkerne målt i prod 16/9 18:42 (OVERLEVERING §32) svarer ordret til migrationen.
- **HbMemberShell monteres for medlemmet på «/»:** `src/pages/Index.tsx:17-22` (begge grene renderes i HbMemberShell); `HbMemberShell.tsx:78` `useOnlineTracking(!!user && !isAdvisor, user?.id)`. kontakt@ har `roller=(ingen)` (16/9) → `isAdvisor` = false (`useAuth.tsx:247-249`: kun `advisor`/`admin`).
- **To kanaler med samme topic i én klient:** `RealtimeClient.js:277-286` — `channel(topic)` returnerer den EKSISTERENDE kanal med samme topic. Normalt ikke aktuelt (medlem tracker, rådgiver lytter — forskellige browsere). Men rådgiverens forside ER i HbMemberShell; hvis `user` sættes før `isAdvisor` er hentet og skallen renderer i det vindue, ville rådgiveren kortvarigt tracke på samme kanalobjekt, som lytteren derefter får udleveret, og trackerens cleanup (`removeChannel`) ville fjerne lytterens kanal. Ikke målt; observationen («live» + tom tekst) peger ikke på det, fordi en fjernet kanal giver `CLOSED` → fejlteksten.

## Målinger der afgør det

**M1 — Lovable SQL editor (ét resultatsæt; afgør årsag 1 og viser om rigtige kunder har været inde):**

```sql
select '1 politik paa realtime.messages' as sektion,
       concat(policyname, ' | ', cmd, ' | ', array_to_string(roles, ',')) as noegle,
       concat('qual=', coalesce(qual, '-'), ' | check=', coalesce(with_check, '-')) as vaerdi
  from pg_policies where schemaname = 'realtime' and tablename = 'messages'
union all
select '2 testmedlem', concat(u.email, ' | ', u.id),
       concat('roller=', coalesce((select string_agg(r.role::text, ',') from public.user_roles r where r.user_id = u.id), '(ingen)'),
              ' | virksomheder=', coalesce((select string_agg(concat(c.name, ' [er_kunde=', coalesce(c.er_kunde::text, 'null'), ', legat=', coalesce(c.is_legat::text, 'null'), ']'), '; ')
                                             from public.company_members m join public.companies c on c.id = m.company_id where m.user_id = u.id), '(ingen)'))
  from auth.users u where lower(u.email) = 'kontakt@topix.dk'
union all
select '3 kundemedlemmer logget ind sidste 7 dage', concat(u.email, ' | ', c.name),
       to_char(max(l.logged_in_at) at time zone 'Europe/Copenhagen', 'YYYY-MM-DD HH24:MI')
  from public.user_login_log l
  join auth.users u on u.id = l.user_id
  join public.company_members m on m.user_id = l.user_id
  join public.companies c on c.id = m.company_id
 where l.logged_in_at > now() - interval '7 days'
   and c.er_kunde is distinct from false
   and not exists (select 1 from public.user_roles r where r.user_id = l.user_id and r.role in ('advisor','admin'))
 group by u.email, c.name
order by 1, 2;
```

Facit: sektion 2 med `er_kunde=false` → årsag 1 holder for testen. Sektion 3 med kunder, mens Jonas har haft forsiden åben og set tomt → årsag 2 bliver sandsynlig (antagelse (a) falder, jf. OVERLEVERING:8754).

**M2 — browser, afgør årsag 1 vs. 2 med den nuværende testkonto (rådgiverens normale vindue, forsiden åben, medlemmet logget ind i privat vindue):**
DevTools → Network → **Fetch/XHR** → filter `full_name`. Står der en request `profiles?select=user_id%2Cfull_name%2Cavatar_url&user_id=in.(…)` med kontakt@'s id, NÅEDE presence frem, og dommen sorterede fra (årsag 1). Kommer der ingen sådan request, er presence-state tom (årsag 2/3).

**M3 — browser, bevis for årsag 2 direkte (medlemmets PRIVATE vindue):**
DevTools → Network → **WS** → klik forbindelsen `…/realtime/v1/websocket…` → Messages → søg `online-medlemmer`. Se svaret på `phx_join` (`"event":"phx_reply"`): `"status":"ok"` = join lykkedes; `"status":"error"` med ordene `permissions to read` eller `Unauthorized` = årsag 2 bevist. Ved `"ok"`: søg efter `"event":"presence"` (track) og serverens svar. På rådgiverens side: søg `presence_state` / `presence_diff` og medlemmets uuid.

**M4 — Supabase/Lovable Realtime Settings (årsag 3):** læs værdien af «Allow public access» (skal ikke ændres, kun aflæses).
