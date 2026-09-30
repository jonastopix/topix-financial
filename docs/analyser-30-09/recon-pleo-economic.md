# Recon: Pleo og e-conomic gennem Claudes forbindelser (30/9-2026 aften)

KUN FUND, målt med de læsende værktøjer i Pleos og e-conomics MCP-forbindelser (Jonas koblede dem på 30/9 ca. 17:00). Intet er skrevet, bogført eller eksporteret. Ingen persondata herunder.

## Pleo (Topix.dk ApS — det eneste selskab)

- 2 aktive medarbejdere (1 OWNER, 1 MEMBER). 0 teams, 0 tags.
- 24 udgiftskategorier, heraf 5 med blankt navn; 16 har en standard-momskode, 8 ingen. 12 momskoder (bl.a. «Indgående (køb)» 25 %, EU-ydelser Rubrik A, udland, repræsentation 0,0526, omvendt betalingspligt).
- 25 leverandører (koder 99686305–99686329) — identiske med e-conomics 25 leverandører; beskrevet som importeret fra det tilknyttede regnskabssystem.
- **Udgifter 2/7–30/9 (90 dage): 146** (141 kortkøb, 4 wallet-indbetalinger, 1 Pleo-faktura). Alle 146 har `review_status` NOT_REQUIRED, `tax_code_id` = null og `vendor` = null (kun et rå `supplier`-navn).
- Hyppigste leverandører (antal): Anthropic 98 · Facebook 10 · Lovable 4 · ElevenLabs 4 · Make 3 · Google 3 · Stape 3 · Cloudflare 3 · Klaviyo 3 · eWebinar 2 · Circle 2 · Wispr, Mailgun, Punktum dk, BunnyCDN, e-conomic 1 hver.
- **Manglende info:** 3 kortkøb uden bilag (ElevenLabs, Facebook, Google Ads); 5 uden kategori (de 4 wallet-indbetalinger og Pleo-fakturaen).
- **Eksport: 12 EXPORTED, 134 NOT_EXPORTED. Seneste eksporterede udgift er fra 27/7-2026 — intet efter ca. 1/8 er eksporteret.** 0 står i kø.
- Pleos værktøjer viser hverken eksportmålet eller kontonumrene bag kategorierne.

## e-conomic

- Forbindelsen svarer gennem et mellemled i fritekst; svarene er sidevise og uden samlet antal.
- Kassekladder (9): 1 Daglig · 2 Indbetalinger · 3 Lønninger · 8 Corpay faktura · 9 Corpay betalinger · 10 Corpay kvitteringer · 11 Pleo (500.000–599.999) · 12 Revisor · 13 Efterposteringer.
- 32 momszoner, 4 betalingsbetingelser, 2 layouts, 1 kundegruppe («Diverse»), 25 leverandører, ≥ 60 kunder (side 3 kunne ikke hentes), 3 varenumre (The Boardroom · Konsulenttimer (Jonas) · Kørsel), 0 fakturakladder.
- Fakturalisten var inkonsistent (dubletter, «60 returned» men ca. 100 linjer, en faktura dateret 1/11-2026) — ikke brugbar som optælling. Fakturanumre de seneste 90 dage: 136–143.
- **Kan ikke:** læse kontoplan, posteringer, saldi, kassekladdelinjer, bilag, leverandørfakturaer, momsafregning eller regnskabsår. Alle øvrige e-conomic-værktøjer SKRIVER (create/update/book).

## Hvad det betyder for bogholder-agenten (fund, ikke vurdering)

- e-conomic-forbindelsen kan ikke være agentens læsekanal; det kræver e-conomics egen REST-API med appens tokens (designet i `bogholderi-agent-design.md`).
- Pleo-forbindelsen kan læse udgifter, bilagsstatus og eksportstatus, men ikke eksportopsætningen.
