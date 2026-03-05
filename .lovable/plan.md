

## Fix: Rapport-tæller viser 0 for alle virksomheder

### Root cause

**Linje 194** i `src/pages/Members.tsx` henter rapporter med:
```
select("company_id, id, extracted_data")
```

Men `report_period` er **ikke inkluderet** i SELECT. Senere (linje 292) tjekker koden `if (r.report_period)` for at tælle unikke perioder — det er altid `undefined`, så `periodsByCompany` forbliver tom, og alle virksomheder får `reportCount: 0`.

DB'en bekræfter at Floren Engros har 6 rapporter med gyldige perioder (Juli 2025 – Januar 2026).

### Fix

**Fil:** `src/pages/Members.tsx`, linje 194

Tilføj `report_period` til SELECT:
```
select("company_id, id, extracted_data, report_period")
```

Det er en ét-ords fix.

### Visuelt blik — vurdering

Tabellen er grundlæggende fornuftigt sat op. Kolonnerne viser det vigtigste for en advisor:
- Virksomhed (med invitationsstatus)
- Branche, Kontaktperson, By, Omsætning
- **Perioder** (antal unikke rapportperioder) — dette er mere meningsfuldt end "antal filer"
- **Chat** (antal ulæste beskeder)

"CHAT"-kolonnen viser `unreadCount` (ulæste beskeder), ikke totalt antal. Det giver mening som handlings-indikator — man ser hurtigt hvem der har ubesvarede beskeder. Kolonneoverskriften "Chat" er dog lidt vag. Den kunne hedde "Ulæste" for klarhed, men det er en mindre kosmetisk ting.

Ingen strukturelle ændringer nødvendige udover bugfixet.

### Filer der ændres
1. `src/pages/Members.tsx` — tilføj `report_period` til financial_reports SELECT (linje 194)

