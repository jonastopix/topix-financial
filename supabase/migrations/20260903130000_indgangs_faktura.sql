-- Dag 31-fakturaens stempel på linkrækken (docs/indgangen-design.md §30).
-- Skrevet 3/9; køres MANUELT i Lovable -> SQL editor efter merge
-- (CLAUDE.md — migrationer auto-deployer aldrig). Denne fil er bogføringen.
--
-- HVORFOR: samme virksomhed må ikke få to fakturaer. Stemplet er lag 1 i
-- idempotensen i _shared/indgangsFaktura.ts og følger husets mønster
-- (betalingsmail_sendt_at, sidste_paamindelse_dag): det sættes KUN når
-- fakturaen faktisk er sendt fra Stripe. Lag 2 er et opslag hos Stripe på
-- kundens fakturaer (metadata company_id + art), som fanger den kørsel
-- hvor fakturaen kom ud, men stemplet ikke kunne skrives.
--
-- Ingen RLS-ændring: tabellen har allerede advisor FOR ALL og service_role
-- FOR ALL (migration 20260902080000), og de to kolonner læses af de samme.
--
-- Efter-verifikation:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'company_betalingslink'
--     AND column_name IN ('faktura_invoice_id', 'faktura_sendt_at');

alter table public.company_betalingslink
  add column if not exists faktura_invoice_id text,
  add column if not exists faktura_sendt_at   timestamptz;

comment on column public.company_betalingslink.faktura_invoice_id is
  'Stripe-invoice-id''et (in_…) for dag 31-fakturaen på det fulde beløb. NULL = ingen faktura sendt. Sættes KUN når fakturaen er finaliseret og sendt fra Stripe (_shared/indgangsFaktura.ts). Bærer idempotensen: er feltet sat, oprettes der ikke en ny. Fakturaen selv bærer metadata[company_id] og metadata[art]=indgang, så en betaling kan finde tilbage (docs/indgangen-design.md §30).';

comment on column public.company_betalingslink.faktura_sendt_at is
  'Hvornår dag 31-fakturaen blev sendt (Stripes finalized_at). NULL = ingen faktura sendt.';
