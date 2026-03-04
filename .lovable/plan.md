
Problem bekræftet. Jeg har fundet den konkrete årsag i både kode og data:

1) Alle aktive rapporter har stadig `file_path` i legacy-formatet `uploads/...` (ikke en rigtig storage-sti).  
2) Der findes ingen tilsvarende filer i storage for de rapport-id’er.  
3) Upload-flowet fortsætter selv når storage-upload fejler, så rapporten bliver “processed” uden originalfil.  
4) Overwrite-flowet uploader slet ikke originalfilen.

Det er derfor “Se original fil” fortsat fejler.

Implementeringsplan

1. Gør upload af originalfil obligatorisk (fix fremadrettet)
- Fil: `src/components/FileUploadZone.tsx`
- Tilføj sanitization af filnavn til storage (ASCII-safe: æ/ø/å, mellemrum, specialtegn).
- Upload til `financial-documents/${companyId}/${reportId}/${safeFileName}`.
- Hvis storage upload fejler: stop pipeline, vis fejl-toast, og lad ikke rapporten ende som “done”.
- Opdater `financial_reports.file_path` kun med gyldig storage-sti.
- Samme upload-step tilføjes i `handleOverwrite` (mangler i dag).

2. Centraliser “åbn original fil” logik
- Ny helper: `src/lib/reportFileAccess.ts`
- Funktion tager `{ reportId, companyId, filePath, fileName }`.
- Forsøg signed URL på korrekt sti.
- Håndter kendte fejl (`InvalidKey`, manglende objekt) med tydelig brugerbesked.
- Fjern nuværende segment-encoding workaround i siderne og brug helperen.

3. Reparationsflow for eksisterende rapporter (dem der allerede er “ødelagte”)
- På rapporter med legacy-path (`file_path` starter med `uploads/`) vis knap: “Genupload original”.
- Brugeren vælger fil lokalt → uploades til korrekt/sanitized sti → `financial_reports.file_path` opdateres.
- Herefter virker “Se original fil” uden at ændre resten af rapportdata.

4. Opdater alle entry points
- `src/pages/Reports.tsx`
- `src/pages/MemberDetail.tsx`
- `src/components/AdvisorNotifications.tsx`
- Alle tre bruger samme helper og samme fejlhåndtering.

Tekniske detaljer (kort)
- Ingen schema-migration nødvendig.
- Root cause er ikke kun popup/encoding; det er primært manglende faktiske filer i storage pga upload-fejl + manglende overwrite-upload.
- Vi bevarer visningsnavn (`file_name`) men bruger sanitized navn i storage-path.

Verifikation (E2E)
1) Upload en ny fil med danske tegn i filnavn → “Se original fil” skal åbne korrekt.  
2) Kør overwrite på en eksisterende periode → “Se original fil” skal virke bagefter.  
3) Reparer én af de nuværende broken rapporter via “Genupload original” → verificér åbning fra både Reports og MemberDetail (og notifikation-link hvis relevant).
