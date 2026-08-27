# Skrivninger og rådgiverfladen — fund 27. august 2026

Fund fra tre recons undervejs i årsrapport-sporet. Ingen af dem hører
til den vej, men alle blev målt samme dag.

## 1. Rådgiveren kan ikke godkende en rapport

`MemberDetail.tsx:1587-1594` viser «Godkend rapport →» på hvert
ucommitteret rapportkort. Det er et `<a href="/admin/review-queue">`
stylet som primærknap. Ingen handler, ingen skrivning, ingen fejl.
Destinationen er en ren læseflade uden godkendelseskontrol.

`commit_report_facts` er SECURITY DEFINER og tillader udtrykkeligt
rådgiver-kald. Den eneste flade der kalder den er medlemmets egen
Hjemmebane-rapportering. Rådgiveren har altså rettigheden, men ingen
knap.

Konsekvens målt: PHILBERTs tre PASS-rapporter lå fra 29. april til
27. august. De blev committed ved at bruge «Se som member» og
medlemmets egen flade.

## 2. «Se som member» skifter flade, ikke session

`useAuth.tsx:89-97`: `overrideCompanyId` er ren UI-tilstand.
`auth.uid()` forbliver rådgiverens. Query-filtre peger på medlemmets
selskab; RLS-prædikater evaluerer mod rådgiveren. Det virker, fordi
rådgiver-politikkerne er permissive — ikke fordi identiteten skifter.

## 3. Fjorten klient-skrivninger uden resultat-tjek

`RapporteringView.handleDelete` (962-977) destrukturerer ikke engang
`{ error }`. supabase-js kaster ikke ved fejl, så catch-grenen kan kun
ramme netværksexceptions. Både en RLS-afvisning og et nul-række-udfald
er usynlige, og UI'et opdaterer som ved succes.

Samme mønster i mindst tretten andre skrivninger mod
`financial_reports` og `financial_report_facts`, herunder
fortrydUpload, papirkurv-gendan, permanent delete, upload-oprydning,
Ret data-gem, og CompanyChatPanes reviewed_at-flag.

## 4. financial_report_facts har ingen UPDATE-politik

Målt i pg_policy: tabellen har SELECT- og DELETE-politikker og ingen
UPDATE-politik. INSERT er ikke afgjort af den måling — forespørgslen
listede `polqual`, og INSERT-politikker bærer i stedet `polwithcheck`.
Alle kendte skrivninger går via SECURITY DEFINER-RPC'er.

`Members.tsx:782` flytter faktarækker mellem selskaber med en
klient-UPDATE. Den rammer nul rækker for alle roller, altid, tavst.
Merge-flowet har aldrig flyttet et tal.

## 5. CVR sammenholdes aldrig med virksomheden

`financial_reports.cvr_number` udtrækkes fra dokumentet og
sammenlignes ingen steder med selskabets eget CVR. Målt på tværs af
platformen:

| virksomhed | eget CVR | i rapporterne |
|---|---|---|
| Booking Innovation | 33257554 | 32075479 på alle elleve |
| Warburg VVS | 38743678 | 38283431, 38283438, 39977699, `None`, `null`, `Unavailable` |
| BR Roset | 34541507 | `;`, `00000000`, `Ukendt`, `Unknown`, `Ikke oplyst` — 2 af 38 rigtige |
| ANLA GLAS | 31575974 | `00000000`, `12345678`, `ANONYMIZED` |
| YKRG | 44891917 | 44891719 (cifre byttet) |
| Topix.dk | 45281736 | `4S281736` (OCR) |

Booking Innovation er den alvorlige: elleve af elleve bærer et fremmed
CVR, og afvigelsen ligner ikke en tastefejl. 32075479 tilhører ingen
anden virksomhed på platformen, så det er ikke krydskontaminering
mellem to medlemmer.

To forklaringer er lige åbne og kan ikke skelnes uden opslag i
CVR-registret: selskabets eget CVR-felt i platformen er forkert, eller
bogføringen føres under en anden juridisk enhed end den registrerede.
Ingen af delene er verificeret.

`ANONYMIZED` og `12345678` i produktionsdata er sit eget spørgsmål.

## 6. Review Queue kan ikke bruges til at finde et medlems rapporter

175 rapporter kræver opmærksomhed. Kolonnen «Virksomhed» viser
`company_name` — navnet udtrukket fra dokumentet — ikke selskabet.
Derfor står der `Philbert Design`, `Camilla Risager`,
`Sample Company A/S`, `IKKE SPECIFICERET`, `Unknown`,
`Saldo: marts saldo 2026`, og `–` på snesevis af rækker.

Der er filtre på status, metode, validering og AI. Ingen på virksomhed.
Siden har ingen godkendelseskontrol.

## 7. De betingede normaliseringsregler eksekveres aldrig

`normalizationProfiles.ts` deklarerer `contra_cost_check` og
`cross_validate_profit_direction`. `canonicalEngine.ts:870` anvender
kun fallback-aktionen og evaluerer aldrig checket. Testene formtjekker
alene at override'et findes.

Den ægte contra-cost-logik lever kun i legacy-sporet (205-222).
Syvende tilfælde af det amputerede mønster.

## 8. user_roles dækker under halvdelen

Femten rækker til fireogtredive virksomheder. De fleste medlemmer har
ingen rollerække. Konsekvensen er ikke undersøgt.
