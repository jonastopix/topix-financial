# Scenarier — optimistisk og pessimistisk

**Besluttet**: 2026-08-24
**Status**: Form besluttet på fire målinger mod prod. Implementering ikke påbegyndt.
**Grundlag**: `docs/scenarie-recon.md`, `docs/gruppevalg-recon.md` §5-§8.

---

## 1. Problemet

`generate-budget-scenarios` skalerer på gruppe alene: indtægter ±10-25 %, variable ∓5-15 %, faste fastholdt, personale ±2-5 %. Prompten kræver (regel 8) at **alle** værdier afviger fra base.

Gruppen er for grov. Under Drift ligger både Shopify-abonnementet (ændrer sig aldrig) og bogholderi (stiger med aktivitet). Under Variable ligger både vareforbrug (proportionalt med salg) og B2B-provision (kun med B2B-salg).

Men målingerne viser at det egentlige problem ligger et andet sted.

---

## 2. Målt mod prod 2026-08-24

161 budgetlinjer med 12 måneder i base-scenariet, på tværs af alle virksomheder:

| Form | Linjer | Virksomheder |
|---|---|---|
| Helt fast (ét distinkt beløb, ingen nulmåneder) | 74 | 8 |
| Næsten fast (≤3 distinkte beløb) | 13 | 7 |
| Sporadisk (≥6 nulmåneder) | 46 | 5 |
| Varierende | 23 | 4 |
| Med udsving (max > 3× gennemsnit) | 5 | 3 |

De 46 sporadiske blev brudt ned videre:

- **34 er HELT TOMME** — nul måneder, nul beløb, nul distinkte værdier. Skabelon-linjer fra medlemmets branchevalg som aldrig blev udfyldt: `email_marketing`, `vareforbrug`, `loenninger`, `betalingsgebyrer`, `admin_regnskab` m.fl.
- **12 er ægte delvist udfyldte** — Webudvikling hjælp (1 måned), B2B salg (2), Foto & Videoproduktion (5), Corpay og Pleo Essential (fra juli og året ud).

Mønstret "tom indtil en måned, derefter fast" blev undersøgt separat: **4 linjer, 1 virksomhed**. Det er Remms Corpay og Pleo, som starter i juli fordi softwaren blev købt der — ikke et generelt mønster. **Ingen egen behandling.**

### Den samlede fordeling

| Kategori | Linjer | Andel |
|---|---|---|
| Faste (helt + næsten) | 87 | 54 % |
| Tomme skabelon-rester | 34 | 21 % |
| Varierende (inkl. udsving) | 28 | 17 % |
| Delvist udfyldte | 12 | 7 % |

**121 af 161 linjer bør ikke røres i et scenarie.** Prompten kræver i dag at alle 161 ændres.

---

## 3. Beslutninger

### S1 — Tomme linjer sendes ikke til modellen

34 linjer (21 %) har ingen værdier overhovedet. De sendes i dag med i payloaden, og modellen digter tolv tal til hver.

De udelades fra scenarie-genereringen helt. De forbliver i budgettet (medlemmet kan udfylde dem), men et scenarie opfinder ikke tal til en linje der ikke findes.

### S2 — Faste linjer sendes som kontekst, men ændres ikke

87 linjer (54 %) har samme beløb hver måned. En fast omkostning er fast — det er hele pointen med at kalde den fast.

De medsendes så modellen kan se det samlede billede (en scenariedom kræver at man kender omkostningsbasen), men de er markeret som uændrede og modellen må ikke returnere værdier for dem.

### S3 — Modellen må lade en linje stå

Prompten siger i dag ordret at ingen værdi må være lig base (regel 8). Reglen findes for at fange stille base-kopier, men den tvinger modellen til at ændre ting der ikke skal ændres.

Erstattes af: modellen returnerer kun de linjer den mener skal ændres, og skal begrunde hvert enkelt. Validering mod stille base-kopi flyttes til at kræve at **mindst én** returneret linje afviger — ikke alle.

### S4 — Formen udelukker, etiketten afgør

Formen på de tolv måneder kan afgøre hvad der **ikke** skal skaleres (en helt fast linje følger ikke omsætningen), men ikke hvad en varierende linje afhænger af.

En linje på 1.500 kr. hver måned kan være bogholderi (fast) eller et abonnement pr. medarbejder (trinvist). Formen ser ens ud.

Derfor: formen filtrerer (S1, S2), etiketten og de tolv værdier giver modellen grundlaget for de resterende 28, og medlemmet bekræfter.

### S5 — Forslaget skrives ikke før medlemmet har set det

I dag kalder `generateAIScenario` `replaceScenarioValues` **før** UI'et opdateres (`budgetEngine.ts:~695-745`). Forslaget er skrevet til databasen når medlemmet ser det. Der findes ingen fortryd.

Det bryder mønstret fra importen, hvor intet skrives før godkendelse (P1-familien). Rettes: forslaget vises, medlemmet godkender, derefter skrives.

### S6 — Ingen ny adfærdstype i datamodellen

Overvejet og fravalgt: et felt pr. linje der siger hvad den afhænger af (omsætning / tid / beslutning).

Årsag: formen dækker allerede de 121 der ikke skal røres, og de resterende 28 kan modellen bedømme ud fra etiket og værdier. Et nyt felt ville kræve at medlemmet klassificerer 161 linjer for at forbedre 28.

Beslutningen genåbnes hvis scenarierne efter S1-S5 stadig rammer forkert på de varierende linjer.

---

## 4. Åbne spørgsmål

**4.1 Overlap med sim-events.**
`HbBudgetSimulator` modellerer allerede beslutninger ("Ansæt én medarbejder", "Fordobl marketing") som `__sim_event__`-markørrækker, adskilt fra scenarierne. Et scenarie kan ikke indeholde en beslutning, og et event kan ikke ændre et scenarie. De to systemer bør på sigt mødes — ikke i dette spor.

**4.2 De 34 tomme linjer bør ryddes op.**
De forurener også sammenligningen mod regnskabet (tælles som nul), gør listen længere end budgettet, og medlemmet scroller forbi dem. Sletning kræver en beslutning om hvorvidt en tom skabelon-linje er "endnu ikke udfyldt" eller "ikke relevant". Uden for dette spor.

**4.3 Historikken kan ikke bære adfærden.**
Målt: 21 virksomheder har rapporttal, gennemsnitligt **3,5 af 6** gruppefelter udfyldt. Kun to har alle seks. Ideen om at aflæse hver gruppes adfærd af virksomhedens egne realiserede tal falder på dækningen. Genåbnes hvis rapportkvaliteten stiger.

**4.4 Ingen logging af kald.**
`generate-budget-scenarios` skriver kun til `console.log`. Der findes ingen tabel der registrerer invokationer, så vi kan ikke måle om funktionen bruges, eller hvor ofte forslag forkastes.
