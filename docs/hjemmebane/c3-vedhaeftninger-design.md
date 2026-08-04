# C3-forberedelse — Vedhæftninger på lektioner (design-blok)

> **Status: GODKENDT af Jonas 2026-08-04** (linjelæst; §9's konstraint-bevis
> rettet til deterministisk IN-form efter Jonas' review). **Afsnit 8-SQL'en er
> identisk med den committede migration
> `supabase/migrations/20260804210000_content_item_attachments.sql`** —
> migrationsfilen er den, der køres; dette dokument er design + deploy-guide.
> Migrationen køres manuelt af Jonas i Lovable SQL editor (afsnit 9), aldrig af
> Claude. Baggrund: model-recon 2026-08-04 (én medie-plads pr. item, ingen
> attachments-relation); arkitektbeslutning: ny tabel `content_item_attachments`.

---

## 1. Hvad dette løser

En Circle-lektion er video + vedhæftede filer + links + tekst i ÉT opslag.
I dag optager videoen items medie-plads, og filer/links har intet hjem.
`content_item_attachments` giver hvert item en ordnet liste af materialer
(fil eller link, hver med label), så lektionsformen kan migreres 1:1 —
uanset hvad items primære medie er.

## 2. DDL (som besluttet i opgaven, husets konventioner)

Kolonner jf. arkitektbeslutningen; CHECK spejler medie-mønstret fra
`content_items_media_matches_provider`; indeks på `item_id` med `position` som
sekundær kolonne (listen læses altid ordnet — samme mønster som
`idx_content_items_collection`). `update_updated_at_column()`-trigger som alle
øvrige tabeller.

Se den fulde SQL i afsnit 8 — fremlagt i FULD længde, intet udeladt.

## 3. RLS — husets platform-global content-mønster, med én begrundet afvigelse

**Forlægget** — de eksisterende `content_items`-policies, citeret ordret fra
`supabase/migrations/20260804120000_hjemmebane_content_layer.sql` linje 196-224
(deployet og verificeret i prod):

```sql
CREATE POLICY "Members can view published content items"
  ON public.content_items FOR SELECT
  TO authenticated
  USING (status = 'published');

CREATE POLICY "Advisors can view all content items"
  ON public.content_items FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can insert content items"
  ON public.content_items FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can update content items"
  ON public.content_items FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can delete content items"
  ON public.content_items FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage content items"
  ON public.content_items FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

**Spejlingen:** advisor-SELECT/INSERT/UPDATE/DELETE og service-role-ALL
overtages 1:1 (kun navne udskiftet).

**Den ene afvigelse — medlems-SELECT — og begrundelsen:** vedhæftninger har
bevidst INGEN egen `status`-kolonne (et bilag er aldrig selvstændigt publiceret
— det følger sin lektion). Medlems-gaten kan derfor ikke være `status =
'published'` på egen række; den formuleres som et EXISTS-tjek på
FORÆLDER-itemets status:

```sql
USING (
  EXISTS (
    SELECT 1 FROM public.content_items i
    WHERE i.id = content_item_attachments.item_id
      AND i.status = 'published'
  )
)
```

Dette lækker ingen kladde-bilag: er itemet draft/arkiveret, matcher EXISTS
ikke, og medlemmet ser 0 rækker. Dobbelt bund: subquery'en kører som den
kaldende bruger, så `content_items`' egen RLS gælder OGSÅ inde i EXISTS — for
et medlem er ikke-published items usynlige dér i forvejen. Det eksplicitte
`status = 'published'`-prædikat beholdes alligevel (læsbarhed + robusthed,
hvis items-policies nogensinde ændres).

## 4. Storage (ingen nye buckets, ingen nye policies)

Filer bor i det eksisterende private `content-assets`-bucket og bruger de
allerede-deployede storage-policies (advisor-skrivning, authenticated-SELECT
til `createSignedUrl` — baseline §9). Path-konventionen udvides med ét prefix:

```
attachments/<item-uuid>/<filnavn>
```

- Upload: `buildAssetPath("attachments", itemId, file.name)` + `uploadAsset()`
  — `buildAssetPath`s kind-union udvides med `"attachments"` (ren typeudvidelse).
- Download/preview: `getAssetPreviewUrl()` (signeret, 60 min) — præcis som
  ItemEditor/ElementView bruger i dag.
- Sletning af et bilag fjerner RÆKKEN; filen i storage forbliver (oprydning af
  forældreløse filer er bevidst uden for scope — noteres ikke som gæld, det er
  samme semantik som cover-/skabelonfiler har i dag ved item-sletning).

## 5. Admin-UI: "Materialer"-sektionen i ItemEditor

Placeres under Medie-feltet, synlig for ALLE items uanset `media_provider`
(pointen er netop video + bilag). Hb-identiteten: én rolig liste, ingen modals.

- **Liste:** hver række = ikon (fil/link) + label-inputfelt + diskret
  omplacér (⌥↑/⌥↓-venlige pil-knapper, samme optimistiske
  `persistOrder`-mønster som items — `persistOrder`s tabel-union udvides) +
  slet (lille inline-bekræftelse i rækken, ingen portal).
- **Tilføj fil:** HbUploadZone-mønstret → upload til `attachments/<item-id>/…`
  → rækken oprettes med `kind='storage'`, label forudfyldt med filnavnet
  (redigérbar).
- **Tilføj link:** label + https://-URL (samme inline-validering som
  medie-vælgerens eksterne spor) → række med `kind='link'`.
- **Persistering:** bilag er RÆKKER, ikke item-kolonner — operationer
  persisterer straks (opret/slet/omplacér optimistisk; label gemmes på
  blur/Enter). Det afviger bevidst fra items ⌘S-draftmodel og matcher i stedet
  upload-adfærden, der allerede er umiddelbar i dag. Editorens dirty-markør
  påvirkes ikke af materialer.
- **Kladde-venlig:** itemet eksisterer altid (create-on-demand-modellen), så
  materialer kan tilføjes før publicering — de er RLS-usynlige for medlemmer
  indtil itemet publiceres (afsnit 3).

Datalag: `adminContentApi` udvides med `listAttachments(itemId)`,
`createAttachment`, `updateAttachment`, `deleteAttachment` + `persistOrder`-
udvidelsen. React Query-nøgle `["admin-content","attachments",itemId]`.

## 6. Medlemsvisning: "Materialer" i ElementView

Under medie + body, over handlingsrækken. Kun når der ER materialer (ellers
renderes intet). Én rolig sektion:

```
MATERIALER                          ← eyebrow-stil (rust, uppercase, som øvrige)
⤓  Budgetskabelonen (Excel)        ← storage: signeret download via getAssetPreviewUrl
↗  Skats momsguide                 ← link: ekstern, noopener
```

- Storage-bilag: klik → `getAssetPreviewUrl(storage_path)` → åbn (samme flow
  som skabelon-items i dag). Links: `<a target="_blank" rel="noopener">`.
- INGEN fremdriftssporing på bilag (B1-video-modellen er urørt — bilag er
  bibliotek).
- Datalag: `akademiApi.listItemAttachments(itemId)` (RLS gater); hentes kun på
  element-siden.

Typer: `content_item_attachments` hånd-tilføjes i `types.ts` i eksakt
genereret format m. konvergens-kommentar (samme D1-mønster som de seks første
tabeller — Lovables regenerering er sandheden og har allerede én gang bekræftet
konvergensen).

## 7. Docs i samme PR

1. **BACKLOG.md** — ny note "Data-drevne områder — bevidst udskudt": recon'ens
   2e-skøn medtages som opskrift (content_areas-tabel + FK-erstatning af de to
   CHECKs + AREAS→query + lille område-panel; én migration + ~6 filers
   letvægts-refactor), og det noteres at område-LABELS er ren frontend
   (bevist i PR #166) og kan ændres på anmodning uden migration.
2. **docs/hjemmebane/c0-inventar.md** — alarm-listen (afsnit 3) får rækken:
   "Affiliate Marketing + Content produktion: downloades og gemmes lokalt af
   Jonas, BEVIDST UDELADT af migreringen, kan genoptages senere." Og
   videoinventaret pr. 2026-08-04 noteres: **~106-108 videoer** (40 grundforløb
   fordelt på 6 moduler; 10-12 ekstra Morten; 11 Emailmarketing; 39 PR &
   Kommunikation fordelt på 9 moduler; 2 Skat, moms og regnskab; 4 Tracking —
   Circle-hostede originaler, download i gang).
3. **c0-datamodel.md** — kort tillæg (nyt afsnit 8): attachments-tabellen med
   henvisning til migrationen og til dette designs afsnit 3-begrundelse.
4. **SECURITY_BASELINE.md** (doc-disciplin — baseline-relevant ændring i samme
   PR): §5's platform-global-mønster udvides med den forælder-gatede
   medlems-SELECT (EXISTS-formen), og §9's path-konvention får
   `attachments/<item-uuid>/…`.

## 8. Migrations-SQL — FULD LÆNGDE (køres IKKE af Claude)

Migrationsfil (committet, identisk med denne blok):
`supabase/migrations/20260804210000_content_item_attachments.sql`

```sql
-- Migration: content_item_attachments
-- C3-forberedelse (Projekt Hjemmebane) — vedhæftninger/materialer på items,
-- så Circle-lektionens form (video + filer + links + tekst) kan migreres 1:1.
-- Jf. designbeslutning 2026-08-04: ny relation; hverken metadata-JSONB eller
-- søster-items. RLS: platform-global content-mønster; medlems-SELECT gater på
-- FORÆLDER-itemets published-status via EXISTS (bilag har bevidst ingen egen
-- status — de følger deres lektion). Ingen kladde-bilag lækker.
-- Filer bor i eksisterende privat bucket 'content-assets' under
-- attachments/<item-uuid>/... — ingen nye storage-policies.
-- DEPLOY: køres manuelt i Lovable -> SQL editor efter merge (migrationer
-- auto-deployer aldrig). Verifikations-query FØR og bevis-query EFTER står i
-- deploy-guiden: docs/hjemmebane/c3-vedhaeftninger-design.md, afsnit 9.

CREATE TABLE public.content_item_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('storage', 'link')),
  label TEXT NOT NULL,
  storage_path TEXT,
  external_url TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- referencen skal matche typen (spejler content_items_media_matches_provider)
  CONSTRAINT content_item_attachments_ref_matches_kind CHECK (
    (kind = 'storage' AND storage_path IS NOT NULL)
    OR (kind = 'link' AND external_url IS NOT NULL)
  )
);

ALTER TABLE public.content_item_attachments ENABLE ROW LEVEL SECURITY;

-- Medlemslæsning: KUN bilag på published items — forælder-gated EXISTS
-- (bilag har ingen egen status; content_items' egen RLS gælder desuden
-- inde i subquery'en som dobbelt bund).
CREATE POLICY "Members can view attachments of published items"
  ON public.content_item_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.content_items i
      WHERE i.id = content_item_attachments.item_id
        AND i.status = 'published'
    )
  );

CREATE POLICY "Advisors can view all attachments"
  ON public.content_item_attachments FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can insert attachments"
  ON public.content_item_attachments FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can update attachments"
  ON public.content_item_attachments FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Advisors can delete attachments"
  ON public.content_item_attachments FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'));

CREATE POLICY "Service role can manage attachments"
  ON public.content_item_attachments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_content_item_attachments_item
  ON public.content_item_attachments(item_id, position);

CREATE TRIGGER set_content_item_attachments_updated_at
  BEFORE UPDATE ON public.content_item_attachments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

## 9. Deploy-guide til Jonas (efter merge — Lovable SQL editor)

**FØR (verifikations-query) — facit: 0 rækker** (tabellen findes ikke endnu;
kører den 6 rækker retur, er migrationen allerede kørt — STOP og sig til):

```sql
SELECT c.relname, p.polname
FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname = 'content_item_attachments';
```

**KØR:** migrationens SQL-body (afsnit 8), Run.

**EFTER (bevis-query) — facit: præcis 6 rækker,** navnene fra afsnit 8
(1× Members…, 4× Advisors…, 1× Service role…), alle med `polpermissive = true`:

```sql
SELECT c.relname, p.polname, p.polpermissive
FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname = 'content_item_attachments'
ORDER BY p.polname;
```

Plus konstraint-bevis — deterministisk form (et LIKE-mønster ville også matche
`_pkey`, den auto-navngivne `_kind_check` og på nyere PG NOT NULL-constraints
og dermed give et falsk STOP). **Facit: præcis 2 rækker —
`content_item_attachments_item_id_fkey` (contype `f`) og
`content_item_attachments_ref_matches_kind` (contype `c`):**

```sql
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'public.content_item_attachments'::regclass
  AND conname IN ('content_item_attachments_ref_matches_kind',
                  'content_item_attachments_item_id_fkey')
ORDER BY conname;
```

## 10. Rækkefølge efter godkendelse (uændrede gates)

1. Migrationsfil + docs (afsnit 7) committes → diff → STOP → PR → merge →
   Jonas kører migrationen guidet (afsnit 9).
2. Efter verificeret migration: admin ("Materialer" i ItemEditor) +
   medlemsvisning (ElementView) + types/D1 → test + tsc + build → diff → STOP.

---

*C3-forberedelse · Projekt Hjemmebane · 2026-08-04 · Design godkendt; migrationen
committes med dette dokument og køres manuelt af Jonas (afsnit 9). UI-byggeriet
(afsnit 10, trin 2) afventer verificeret migration.*
