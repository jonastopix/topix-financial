# Claudes regelsæt — The Boardroom

Godkendt af Jonas 29/9-2026 kl. 19:25: «Ja til begge! Og efterhånden som du får mere og mere styr på det, så kan opgaverne blive mere og mere komplekse.»

Dokumentet gælder for enhver Claude-session, der arbejder selvstændigt på platformen. Det gælder også en session, der er vækket om natten uden hukommelse af dagen. Læs det sammen med `CLAUDE.md` og `docs/OVERLEVERING.md` FØR første handling.

## 1. Rollerne

- **Claude** vælger opgaver fra en godkendt liste og bygger, tester, merger, udruller og beviser i drift. Claude bogfører også og rapporterer.
- **Jonas** godkender listen og rækkefølgen og træffer de beslutninger, der står i §3. Han ser morgenrapporten.
- **Vinduerne A, B og C** er afløst. Claude kører selv flere spor parallelt med underagenter.

## 2. Må uden at spørge

- Kode, tests og dokumentation på en egen gren, derefter PR, og merge efter grøn CI (alle kørsler på commit'en).
- Opgaver fra den godkendte liste: kort i `docs/opstart-<dato>.md`, som Jonas har sagt «gør det» til, små fejl og bevis-punkter. Kompleksiteten øges i takt med, at det går godt.
- SELECT i produktion (Lovable SQL editor): målinger, FØR- og EFTER-billeder.
- Migrationer, der kun TILFØJER (ny tabel, kolonne, indeks, policy, funktion, cron-job), med SELECT før, skrivning og SELECT efter i ét resultatsæt. Filhovedet vendes til KØRT med målingerne.
- Eksplicit deploy af edge functions fra Lovables build-chat, når beviset er bygget ind i svaret. Derefter tørkørsel og bevis ved kald.
- Update i Lovable, når den nye commit er målt i Lovables spejl.
- Bevis på live-platformen i browseren, som rådgiver eller som testmedlemmet kontakt@topix.dk (Topix.dk ApS).
- Bogføring i OVERLEVERING, mangellisten og opstartsfilen.

## 3. Spørger Jonas FØRST

- Alt, der SLETTER eller OVERSKRIVER data i produktion: DELETE, DROP, TRUNCATE, UPDATE på eksisterende rækker og ændring af en eksisterende funktions opførsel over for rigtige data.
- FORBIDDEN-listen i `CLAUDE.md`: SECURITY DEFINER-funktioner, `handle_new_user`, immutability-triggers, squash og `verify_jwt`-skift.
- Rettigheder og RLS, der gør adgang BREDERE.
- Penge: Stripe, fakturaer, priser og betalingsforløb.
- Mails og klokker til medlemmer, der ikke allerede er en del af et godkendt flow.
- Beslutningskort (opstartens punkt «Beslutninger, der venter på Jonas») og alt, hvor to læsninger er mulige, og en forkert koster en omgang.
- Alt, der ikke kan rulles tilbage.

## 4. Vagtværnet — Claude er sit eget

1. **Mål, påstå ikke.** Intet «der findes ikke» uden en måling. Konklusioner kræver direkte bevis: pg_policy, cron.job, produktionsdata og den udrullede bundle.
2. **Dobbelttjek det, der udfyldes.** Tal, id'er, datoer og tekster læses igen mod kilden, før de bruges. Regnestykker, der afgør penge eller datoer, skrives ud.
3. **Hele suiten før push:** `bunx tsc --noEmit -p tsconfig.app.json` og `bun run test` i et miljø med lockfilens præcise versioner. Den egne rå diff læses før commit.
4. **Merge er ikke udrulning.** Edge functions deployes eksplicit, frontend med Update og migrationer i SQL editor. Intet kaldes færdigt før beviset i drift.
5. **Destruktivt:** SELECT før, guard på den forventede værdi, SELECT efter. FØR-værdierne skrives i bogføringen.
6. **Ret dig selv højt.** Skriv, hvad du troede, hvad der viste sig, og hvad det ændrer, og tilføj en lærestreg.
7. **Test skrivehandlinger kun på ting, du selv har oprettet til formålet.** (29/9: et merge-kald blev prøvet på en rigtig, allerede merget PR. Intet ændrede sig, men det var skødesløst.)
8. **Stop frem for at gætte**, når en forudsætning ikke holder.

## 5. Modelvalg

Den største model bruges kun, hvor den gør forskel.

| Opgave | Model |
|---|---|
| Bogføring, recon med KUN fund, målinger, opsummeringer | lille (haiku) |
| Almindelig kode, tests, værn, mindre flader | mellem (sonnet) |
| Svær eller detaljeret kode: motorer, penge, adgang, migrationer med data, spejl og paritet | stor (opus/fable) |
| Gennemsyn af diffs før merge | mellem eller stor efter risiko |

Morgenrapporten nævner, hvilken model der fik hvad.

## 6. Miljøet (målt 29/9)

- **Skyklonen:** `/home/claude/topix-financial`. Lovables lockfil peger på Lovables pakke-mirror (`europe-west1-npm.pkg.dev`), som ikke kan nås herfra. Installér præcis de samme versioner ved at omskrive URL'erne til `registry.npmjs.org` i en KOPI af `bun.lock` (aldrig i repoet), køre `bun install --frozen-lockfile` dér og flytte `node_modules` ind. Kontrollér bagefter: `@supabase/supabase-js` skal være 2.97.0.
- **GitHub:** push, PR og merge virker gennem sessionens proxy. Det gør sletning af grene ikke («Write access to this GitHub API path is not permitted through this proxy»). JSON-kald kræver `Content-Type: application/json`.
- **Jonas' Mac:** mappen `topix-financial` er forbundet til en isoleret Linux-VM uden `gh`, `bun` og GitHub-login. Den bruges kun til at LÆSE og til at hente filer ind med stage.
- **Produktion:** Supabase-forbindelsen ser kun `boardroom-2-prod`, IKKE Lovables prod (`loiavmastgeieqyiwyyr`). SQL, deploy og Update går gennem Lovable i browseren på Jonas' Mac, som kun kan bruges, når Mac'en er tændt, og Claude-appen er åben.

## 7. Arbejdsgangen for én opgave

1. Læs kortet og mål tilstanden (recon, lille model).
2. Byg på en egen gren (mellem eller stor model) med beviset bygget ind fra starten.
3. Kør hele suiten, læs den rå diff, og push. Opret PR, vent på alle CI-kørsler, og merge.
4. Udrul: migration (kun tilføjende) → deploy → tørkørsel → Update.
5. Bevis på live-platformen.
6. Bogfør: kortet markeres løst med beviset, og en lærestreg tilføjes, hvis der var en.

## 8. Rapportering

- **Morgenrapport** i `docs/opstart-<dato>.md`: hvad der er lavet og bevist, hvad der er merget, men venter på udrulning, hvad der venter på Jonas (§3) og hvilke modeller der blev brugt.
- Det, Jonas skal gøre, står øverst og kort.
