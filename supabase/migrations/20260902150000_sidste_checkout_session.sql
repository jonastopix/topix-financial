-- Værnet mod dobbeltbetaling: pegeren til den seneste Checkout-session.
-- KØRT MANUELT i Lovable SQL editor 2026-09-02. Denne fil er bogføringen,
-- så laget kan genskabes fra repoet.
--
-- Målt 2/9: ingen af de fire checkout-funktioner gemte session-id'et, og
-- en session lever 24 timer uanset hvad databasen siger. Stripe har ingen
-- "kun én åben session"-indstilling; dokumentationen siger at man selv
-- skal udløbe åbne sessioner via /expire. GET /v1/checkout/sessions har
-- intet metadata-filter, så id'et gemmes her frem for at søges.
--
-- Skrives af opret-indgangs-checkout (linkrækken), opret-fornyelse-checkout
-- og create-subscription-checkout (companies). Nulstilles af stripe-webhook
-- når betalingen er behandlet. 1:1-sessionerne bruger det eksisterende
-- session_bookings.stripe_session_id. Læsere: kun de samme funktioner.

alter table public.company_betalingslink
  add column if not exists sidste_checkout_session_id text;

comment on column public.company_betalingslink.sidste_checkout_session_id is
  'Seneste Checkout-session for indgangsbetalingen. Udløbes af opret-indgangs-checkout før en ny oprettes; nulstilles af stripe-webhook når betalingen er behandlet. Værnet mod dobbeltbetaling (2/9).';

alter table public.companies
  add column if not exists sidste_checkout_session_id text;

comment on column public.companies.sidste_checkout_session_id is
  'Seneste Checkout-session for fornyelse eller exit-abonnement. Udløbes af opret-fornyelse-checkout / create-subscription-checkout før en ny oprettes; nulstilles af stripe-webhook når fornyelsen er behandlet. Værnet mod dobbeltbetaling (2/9).';
