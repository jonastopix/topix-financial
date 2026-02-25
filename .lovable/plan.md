

## Virksomhedsoversigt: Fra navne til virksomheder pa /members

### Oversigt
Omstrukturerer /members-siden til at vise **virksomheder** som primaer enhed i stedet for individuelle brugernavne. Data fra Excel-filen (30 aktive virksomheder) importeres i databasen med CVR, branche, kontaktperson, e-mail, telefon, adresse, omsaetning og hjemmeside. Teammedlemmer vises nested under hver virksomhed.

---

### Trin 1: Udvid `companies`-tabellen med nye felter

Tilfoej kolonner til den eksisterende `companies`-tabel:

| Kolonne | Type | Beskrivelse |
|---------|------|-------------|
| industry | text | Branche |
| contact_person | text | Primaer kontaktperson |
| contact_email | text | E-mail |
| contact_phone | text | Telefonnummer |
| website | text | Hjemmeside URL |
| address | text | Firmaadresse |
| postal_code | text | Postnummer |
| city | text | By |
| annual_revenue | numeric | Aarlig omsaetning |
| start_date | date | Startdato for forloeb |
| end_date | date | Slutdato for forloeb |
| status | text | Status (default: 'active') |
| slack_channel | text | Slack channel name |

---

### Trin 2: Importar data fra Excel

Indsaetter de 30 aktive virksomheder via SQL INSERT/UPDATE, matchet pa CVR-nummer eller virksomhedsnavn. Data fra Excel-filen:

- Insurance Partners (CVR: 44209764), Wrizz Travel (44665573), D.A.S. GRUPPEN (20100397), Regnskabsvikar (39929058), Fortyfivefaces (44435314), CyberSikker (43894854), Friis cykler (25295366), Aqua Danmark (33773137), KJ AUTO (32368492), Box-cut.com (40760547), mitkoerekort (45163814), Rock it Rosie (38704656), Alina Beauty (36013893), Smag & Slaegt (38914685), Courier Copenhagen (28334060), Warburg VVS (38743678), Capture IT (40065997), BRILLEVAERK (42956376), Friends & Fries (44633361), Line Bakke (39930129), Studio Mini (45252264), Carma Studio (39199971), Livja (35854746), Pro-Vision (41399570), PHILBERT (13963843), doggybed (25897773), E-skilte (38367986), Rallysupport (42578584), Wesdex (45896145), TuaMea Jewelry (34483647), Olsen & Kompagni (45924009)

Strategien er:
1. Matcher eksisterende virksomheder via `cvr_number` eller `name`
2. Opdaterer med de nye felter
3. Opretter nye virksomheder for dem der ikke eksisterer endnu

---

### Trin 3: Omskriv /members-siden til virksomhedsvisning

Aendrer `Members.tsx` fra bruger-centrisk til virksomheds-centrisk:

**Ny datastruktur:**
```text
CompanyData {
  id, name, cvr_number, industry, contact_person,
  contact_email, website, city, annual_revenue,
  start_date, end_date, status, slack_channel,
  members: [{ user_id, full_name, role, avatar_url }],
  reportCount, unreadCount, conversationId
}
```

**Ny visning:**
- Primaer raekke: Virksomhedsnavn, branche, kontaktperson, by, omsaetning, status
- Expand: Teammedlemmer, rapporter, budget, chat-link
- Soeg paa virksomhedsnavn, branche eller kontaktperson
- Filtrering paa branche eller status

**Datahentning:**
- Query `companies` med alle nye felter
- Join `company_members` + `profiles` for teammedlemmer
- Aggreger rapporter, budgetter og chat per virksomhed (via `company_id`)

---

### Trin 4: Tilpas Circle.so-krydsreference (valgfrit)

Eksisterende `circle_members`-tabel har allerede `email` og `user_id`. Kan vise Circle.so-aktivitet per virksomhed ved at matche circle_members via company_members.

---

### Tekniske detaljer

**Database migration SQL (Trin 1):**
```sql
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS industry text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_person text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_email text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS website text DEFAULT '',
  ADD COLUMN IF NOT EXISTS address text DEFAULT '',
  ADD COLUMN IF NOT EXISTS postal_code text DEFAULT '',
  ADD COLUMN IF NOT EXISTS city text DEFAULT '',
  ADD COLUMN IF NOT EXISTS annual_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS slack_channel text DEFAULT '';
```

**Data seed (Trin 2):** Via INSERT-tool, en UPDATE per virksomhed matchet pa CVR.

**Members.tsx (Trin 3):** Komplet omskrivning af datamodel og UI - fra `profiles`-baseret til `companies`-baseret med nested teammedlemmer.

