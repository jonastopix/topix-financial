

## Kategori-specifikke milestone-forslag

Når brugeren vælger en kategori i "Opret milestone"-dialogen, vises en liste af foreslåede milestones med realistiske, detaljerede titler og beskrivelser, som kan sammenholdes med de data der kommer ind via regnskaber og KPI'er.

### Hvad der ændres

**1. Ny fil: `src/lib/milestoneSuggestions.ts`**
En samling af 3-5 forslag per kategori med titel, beskrivelse og eventuelt en foreslået deadline-horisont. Eksempler:

- **Vaekst**: "Nå 2M kr. i årlig omsætning", "Opnå 15% omsætningsvækst MoM", "Fordoble kundebase inden Q4"
- **Profit**: "Opnå positiv bundlinje", "Nå 10% overskudsgrad", "Reducér driftsomkostninger med 20%"
- **Salg**: "Luk 50 nye aftaler i Q2", "Opnå gennemsnitlig ordrestørrelse på 25.000 kr.", "Reducer salgscyklus til under 30 dage"
- **Kunder**: "Nå 100 aktive kunder", "Opnå NPS over 50", "Reducer churn til under 5%"
- **Produkt**: "Launch MVP af ny produktlinje", "Implementér 3 nøglefunktioner fra kundefeedback", "Reducér fejlrate med 50%"
- **Marketing**: "Nå 10.000 månedlige website-besøg", "Opnå CAC under 500 kr.", "Kør 3 kampagner med positivt ROAS"
- **Medarbejdere**: "Ansæt 2 nye medarbejdere", "Gennemfør MUS med alle inden juni", "Opnå medarbejdertilfredshed over 8/10"
- **Timer**: "Opnå 75% faktureringsgrad", "Reducér spildtid med 20%", "Log 1.500 fakturerbare timer i Q2"
- **DB (Dækningsbidrag)**: "Opnå DB1 over 60%", "Forbedre DB2 med 10 procentpoint", "Nå 500.000 kr. i månedligt dækningsbidrag"
- **Juridisk**: "Få GDPR-compliance på plads", "Opdater alle kontrakter", "Gennemfør årlig compliance-review"
- **Funding**: "Rejse pre-seed runde på 2M kr.", "Udarbejde pitch deck", "Nå break-even inden næste runde"
- **Andet**: "Etabler advisory board", "Implementer nyt ERP-system"

**2. Ændring i `src/pages/Milestones.tsx` - Opret-dialogen**
- Når brugeren vælger en kategori, vises relevante forslag som klikbare chips/knapper under kategori-feltet
- Klik på et forslag udfylder automatisk titel og beskrivelse (brugeren kan stadig redigere frit)
- Forslagene vises kun når titel-feltet er tomt, så de ikke forstyrrer brugere der allerede skriver

### Teknisk tilgang

- Ingen database-ændringer nødvendige -- forslagene er rene frontend-templates
- Forslagene er statiske men designet til at matche de KPI-nøgler og budget-kategorier der allerede bruges i systemet (omsætning, dækningsbidrag, overskudsgrad osv.)
- Simpel UX: vælg kategori --> se forslag --> klik for at udfylde --> tilpas og opret

