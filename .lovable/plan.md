

# Opsætning af demo-virksomhed: "NordService ApS"

## Koncept
En fiktiv B2B servicevirksomhed (konsulentbureau/rådgivning) med ~2,5M DKK i arlig omsaetning. Virksomheden har vaeret igennem en realistisk rejse med ups and downs -- staerk vaekst i starten, en stille periode hen over sommeren, og en recovery i efteraaret.

**Virksomhed:** NordService ApS
**Branche:** Konsulent- og serviceydelser (B2B)
**CVR:** 12345678 (fiktivt)
**Kontaktperson:** Martin Holm
**Aarlig omsaetning:** ~2,5M DKK

---

## Data der oprettes

### 1. Virksomhed og bruger
- Oprettes via en database-migration/insert som en ny company med realistiske stamdata (branche: "Konsulent & raadgivning", website, kontaktinfo)
- Tilknyttes din eksisterende advisor-bruger saa du kan se den i raadgivervisningen

### 2. Finansielle rapporter (8 maaneder: Juli 2025 - Februar 2026)
Hver rapport faar realistisk `extracted_data` med `key_figures`:

| Maaned | Omsaetning | Loenninger | Dir. omk. | Marketing | Lokaler | Admin | Tech | Resultat |
|--------|-----------|------------|-----------|-----------|---------|-------|------|----------|
| Jul 25 | 180.000 | -95.000 | -15.000 | -12.000 | -8.000 | -5.000 | -4.000 | 41.000 |
| Aug 25 | 145.000 | -95.000 | -10.000 | -8.000 | -8.000 | -5.000 | -4.000 | 15.000 |
| Sep 25 | 195.000 | -100.000 | -18.000 | -15.000 | -8.000 | -5.000 | -4.000 | 45.000 |
| Okt 25 | 230.000 | -105.000 | -20.000 | -18.000 | -8.000 | -6.000 | -4.000 | 69.000 |
| Nov 25 | 210.000 | -105.000 | -16.000 | -14.000 | -8.000 | -6.000 | -4.000 | 57.000 |
| Dec 25 | 170.000 | -100.000 | -12.000 | -10.000 | -8.000 | -5.000 | -4.000 | 31.000 |
| Jan 26 | 220.000 | -110.000 | -19.000 | -16.000 | -8.000 | -6.000 | -5.000 | 56.000 |
| Feb 26 | 240.000 | -110.000 | -22.000 | -18.000 | -8.000 | -6.000 | -5.000 | 71.000 |

**Narrativ:** Sommer-dip i august (ferie), staerk Q4, lidt nedgang i december (jul), og god start paa 2026.

### 3. Budget (12 maaneder, 2026)
Oprettes som `budget_targets` med serviceB2B-kategorierne. Baseret paa ~210K/md gns. omsaetning med saesonudsving. Budgettet matcher den roede traad fra rapporterne.

### 4. Milestones (4-5 stk)
Realistiske milestones med varierende status:

1. **"Implementer CRM-system"** - 80% progress, deadline marts 2026
2. **"Ansaet junior konsulent"** - 40% progress, deadline april 2026  
3. **"Naa 250K maanedlig omsaetning"** - 60% progress, deadline juni 2026
4. **"Automatiser faktureringsproces"** - 100% done, arkiveret
5. **"Opbyg pipeline paa 500K"** - 20% progress, deadline maj 2026

### 5. Handouts (2-3 udfyldte)
Oprettes med realistiske svar for modulerne "overordnet" og "bogholderi" -- saa man kan se AI-feedback i aktion.

---

## Teknisk implementering

Alt data indsaettes via database insert-operationer (ikke migrationer, da det er data -- ikke skemaaeendringer):

1. **Insert company** i `companies`-tabellen
2. **Insert financial_reports** (8 raekker) med komplet `extracted_data` JSON
3. **Insert budget_targets** (~132 raekker: 11 kategorier x 12 maaneder)
4. **Insert milestones** (5 raekker)
5. **Insert handouts** (2-3 raekker med udfyldte `responses`)
6. **Insert conversation** saa chat er tilgaengelig

Da der ikke er en separat demo-bruger, oprettes virksomheden og tilknyttes via `company_members`. Vi skal bruge en bruger-ID til at tilknytte data -- enten opretter vi en demo-bruger via signup, eller vi tilknytter til en eksisterende bruger.

**Vigtig afhaengighed:** Vi skal vide hvilken bruger-ID demo-virksomheden skal tilknyttes. Jeg vil spoerge dig om dette under implementeringen, eller vi kan oprette en ny bruger til formålet.

