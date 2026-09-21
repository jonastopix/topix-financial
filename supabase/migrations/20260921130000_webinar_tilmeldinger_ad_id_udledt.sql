-- KØRT i prod — 21/9-2026 kl. 08:39 (Jonas, Lovable SQL editor), FØR merge. Målt 08:39: kolonnen
-- ad_id_udledt text, delindekset WHERE (ad_id_udledt IS NOT NULL), kommentaren, 0 udfyldt.
-- FØR Update-klik måles kolonnen udefra:
--   GET /rest/v1/webinar_tilmeldinger?select=ad_id_udledt&limit=0  →  200 (42703 = mangler).
--
-- MÅLT FØR 08:38: 182 navne-rækker i 13 kombinationer · meta_annonce 371 rækker = 371 ad_id ·
-- 180 (98,9 %) entydige på tre navne · 0 entydige på navn alene · 2 (1,1 %) flertydige på navn:
-- kampagnenavnet «Webinar | Adv  | OM» med to mellemrum, hvor kampagnen hedder «Webinar | Adv+ | OM».
-- Plusset er sandsynligvis afkodet som mellemrum; hvor, er ikke målt.
--
-- OVERSAT 08:40 — engangs-SQL som én DO-blok, fail-closed (stopper uden at skrive, hvis trin 1 ≠ 180,
-- trin 2 ≠ 0 eller kontrollen ≠ 0): oversat 180 · stadig_navn 2 · fejl_id_raekke_oversat 0 ·
-- tre_navne_afviger 0. Den kørte SQL står ordret i OVERLEVERING (dagens bogføring).
-- Rollback: update public.webinar_tilmeldinger set ad_id_udledt = null where ad_id_udledt is not null;
--
-- Hentningen overskrev navnene første gang 21/9 kl. 05:33 dansk, FØR målingen. Et navn, der blev omdøbt
-- den nat, kan ikke skelnes fra et, der blev omdøbt tidligere.
--
-- HVORFOR (20/9-2026, recon-meta-annoncer §11.3): 182 tilmeldinger bærer annoncens NAVN i utm_content
-- (de gamle links satte {{ad.name}}; skiftet til {{ad.id}} skete 20/9). Et navn er ikke en nøgle — flere
-- annoncer deler navn, og navne omdøbes. Oversættelsen navn → ad_id er et JOIN mod meta_annonce
-- (kampagne_navn, adsaet_navn, navn), og den skal ske ÉN gang, snart: meta-annoncer-cron overskriver
-- navnene hver nat kl. 03:33 UTC (05:33 dansk), så et omdøbt navn matcher aldrig mere.
--
-- REGLEN: råværdien røres ikke. utm_content er det, Meta sendte, den dag der blev klikket. Resultatet
-- af oversættelsen står i sin EGEN kolonne, ad_id_udledt, som annoncepriser læser FØR utm_content:
-- coalesce(ad_id_udledt, utm_content). null = ikke oversat (id-rækker behøver det ikke; navne-rækker uden
-- entydigt match forbliver navne-koblede og tælles som før i brud.kobletPaaNavn).
--
-- Fyldes af sql/01-oversaet.sql (engangs-SQL, kun ENTYDIGE match), aldrig af webhooken eller importen:
-- begge upsert'er KUN de kolonner, de kender (ON CONFLICT … DO UPDATE SET <listede kolonner>), så
-- kolonnen overlever hver ny hændelse om samme tilmelding.

alter table public.webinar_tilmeldinger
  add column if not exists ad_id_udledt text;

comment on column public.webinar_tilmeldinger.ad_id_udledt is
  'Metas ad_id UDLEDT af navnet i utm_content ved et entydigt match mod meta_annonce (kampagne_navn, adsaet_navn, navn) — sql/01-oversaet.sql, 20/9-2026. Råværdien i utm_content røres aldrig. null = ikke oversat. Læses af annoncepriser som coalesce(ad_id_udledt, utm_content).';

create index if not exists webinar_tilmeldinger_ad_id_udledt_idx
  on public.webinar_tilmeldinger (ad_id_udledt) where ad_id_udledt is not null;
