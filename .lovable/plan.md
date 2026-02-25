

# Opret virksomhed manuelt + sikr webhook fremadrettet

## 1. Opret "Din økonomiafdeling Danmark ApS" manuelt

Baseret på Excel-filen opretter vi virksomheden direkte i databasen med alle relevante felter:

| Felt | Vaerdi |
|------|--------|
| name | Din okonomiafdeling Danmark ApS |
| cvr_number | 39434369 |
| contact_person | Nicolai Marc Haagen olesen |
| contact_email | nicolai@okonomi-afdelingen.dk |
| contact_phone | 4522312301 |
| industry | Bogholderi |
| website | https://okonomi-afdelingen.dk/ |
| address | Jernbanegade 50 |
| city | Haslev |
| postal_code | 4690 |
| annual_revenue | 4500000 |
| slack_channel | din-okonomiafdeling |
| start_date | 2026-02-25 |
| end_date | 2027-02-25 |
| status | active |

Derefter oprettes en **invitation** til kontakt-emailen, saa personen kan tilmelde sig og automatisk blive knyttet til virksomheden.

## 2. Sikr webhook fremadrettet

Webhook-koden er klar og har bestaaet challenge-verifikation med Monday.com. Men column-ID-mappingen (f.eks. "tekst" -> cvr_number) er baseret paa gaet. 

**Forbedring**: Opdater webhook-koden til ogsaa at haandtere felter fra Excel-eksporten som ikke mappes i dag:
- `annual_revenue` (numerisk felt)
- `start_date` og `end_date` (dato-felter)

Naar det foerste rigtige webhook-kald kommer igennem, vil alle kolonne-IDs blive logget, saa vi kan verificere og justere mappingen.

## Tekniske trin

1. **Indsaet virksomhed** i `companies`-tabellen via insert-tool
2. **Opret invitation** i `company_invitations` for kontakt-emailen
3. **Opdater webhook** `index.ts` til at inkludere mapping for `annual_revenue`, `start_date`, `end_date` og `slack_channel` (Slack-feltet er allerede mappet)

