

# Branchetilpasset AI-feedback

## Problem
AI-feedbacken kender ikke medlemmets virksomhedstype/branche, selvom data allerede findes i databasen (`companies.industry`). Det giver generisk rådgivning der ikke skelner mellem en e-commerce, et autoværksted eller en servicevirksomhed.

## Løsning
Sende virksomhedens branche og navn med til AI-funktionen, og bruge det aktivt i prompten til at skræddersy feedbacken.

## Ændringer

### 1. Frontend: `HandoutAIFeedback.tsx`
- Tilføj props for `companyName` og `industry`
- Send dem med i kaldet til edge-funktionen

### 2. Frontend: `HandoutDetail.tsx`
- Hent virksomhedens branche og navn (allerede tilgængelig via `useAuth` eller en query)
- Send dem videre til `HandoutAIFeedback`-komponenten

### 3. Edge function: `handout-ai-feedback/index.ts`
- Modtag `company_name` og `industry` fra request body
- Tilføj branchekontekst til system-prompten, f.eks.:
  ```
  Medlemmet driver en virksomhed inden for: [branche].
  Tilpas dine råd og eksempler specifikt til denne branche.
  En autoværkstedsejer har andre udfordringer end en webshop.
  Brug branchespecifikke termer og konkrete eksempler.
  ```
- Tilføj virksomhedsnavn og branche til user-konteksten

### 4. Edge function: `ai-financial-feedback/index.ts`
- Tilsvarende: sikre at `companyContext` (som allerede modtages) inkluderer `industry` i prompten

## Teknisk detalje
`companies.industry` er et nullable string-felt der allerede er udfyldt for de fleste virksomheder. Hvis det mangler, falder AI'en blot tilbage til generisk rådgivning som i dag.

## Forventet resultat
- En autoværkstedsejer får råd om værkstedsplanlægning, tilbudsopfølgning på bilreparationer, og sæsonudsving
- En e-commerce-ejer får råd om konverteringsrater, returrater, og lagerstyring
- En håndværker får råd om projektstyring, materialeindkøb, og prisberegning
- Alle får stadig den samme grundstruktur, men med branchespecifik dybde

