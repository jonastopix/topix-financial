

## Oprydning: April 2026 facts (igangværende måned)

### Hvad vi fandt
Én virksomhed har en committed facts-row for `2026-04` (April 2026), som er den igangværende måned:

| Virksomhed | period_key | source | Underliggende rapport |
|---|---|---|---|
| Rezycl.com | 2026-04 | manual | `Resultat rezycl 2026 marts.csv` (rapporten selv peger nu på 2026-03) |

Rapporten har efterfølgende fået sit `manual_report_period_key` rettet til `2026-03`, men den oprindelige facts-row for `2026-04` blev aldrig fjernet. Resultatet er en "spøgelses-commit" for en måned, der ikke er afsluttet — præcis det vi netop har gjort umuligt fremadrettet.

### Plan

**1. Slet den ene facts-row for 2026-04**

Brug insert-tool (DELETE):
```sql
DELETE FROM financial_report_facts
WHERE id = '590a3bee-ebd0-4b25-86ae-d8433ee79828'
  AND period_key = '2026-04';
```

**2. Log oprydningen i `_facts_backfill_log`** for sporbarhed:
```sql
INSERT INTO _facts_backfill_log (company_id, report_id, period_key, source_type, result, detail)
VALUES (
  '183f082e-5090-41e1-995b-371e72318d73',
  '49ef768e-b9df-4ad3-ad0a-11f3840b4da4',
  '2026-04',
  'manual',
  'cleanup_current_month',
  'Slettet facts-row for igangværende måned (April 2026). Underliggende rapport peger nu på 2026-03.'
);
```

**3. Bekræft oprydning** med en kontrol-query der viser at ingen virksomheder har committed facts for nogen fremtidig eller igangværende måned (>= 2026-04).

### Hvad vi IKKE rører
- Selve `financial_reports`-rækken (`49ef768e…`) bevares — den er gyldigt mappet til marts 2026 via `manual_report_period_key`.
- Ingen andre virksomheder berøres (kun Rezycl.com har april-data).
- Ingen schema-ændringer — guarden mod commits til igangværende/fremtidige måneder er allerede på plads.

### Effekt for brugeren
- Rezycl.coms leveringsoverblik vil ikke længere fejlagtigt vise april som "leveret".
- KPI-grafer/trends opdateres automatisk når facts-cachen invalideres.
- Marts 2026 commit'en for Rezycl.com forbliver intakt.

