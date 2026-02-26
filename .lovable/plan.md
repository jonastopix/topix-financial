

## Tilfoej "Se original fil"-knap paa MemberDetail-siden

### Problem
Knappen "Se original fil" blev kun tilfoejet til `Reports.tsx` (medlemmets egen rapportside), men **ikke** til `MemberDetail.tsx` — som er den side advisors bruger til at se et specifikt medlems data. Saa som advisor kan du ikke tilgaa den originale fil fra medlemsvisningen.

### Loesning

**Fil: `src/pages/MemberDetail.tsx`**

1. Tilfoej `file_path` til `Report`-interfacet (linje 53-62), saa vi har stien til den uploadede fil.

2. Tilfoej en `handleViewOriginalFile`-funktion (samme moenster som i Reports.tsx) der:
   - Henter signed URL fra `financial-documents` bucket
   - Aabner filen i et nyt vindue

3. Tilfoej en "Se original fil"-knap i det udvidede rapportkort (i expanded-sektionen ved linje 456-522), placeret lige foer kommentar-sektionen. Knappen vises kun hvis `report.file_path` eksisterer.

4. Importér `ExternalLink`-ikonet fra lucide-react (allerede importeret i Reports.tsx som reference).

### Resultat
Advisors vil kunne klikke paa en rapport i medlemsvisningen, udvide den, og se en "Se original fil"-knap der aabner dokumentet i et nyt vindue via en sikker signed URL (gyldig i 1 time).
