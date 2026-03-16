
-- Phase E: Group Budget — lookup table + RPC

-- 1. Create internal lookup table
CREATE TABLE public.budget_category_group_map (
  template_key text NOT NULL,
  category_key text NOT NULL,
  group_key    text NOT NULL,
  PRIMARY KEY (template_key, category_key)
);

ALTER TABLE public.budget_category_group_map ENABLE ROW LEVEL SECURITY;
-- No RLS policies — internal table, only accessed by SECURITY DEFINER RPC

-- 2. Seed all 80 rows (7 templates)
INSERT INTO public.budget_category_group_map (template_key, category_key, group_key) VALUES
-- webshop_b2c (12)
('webshop_b2c', 'omsaetning', 'indtaegter'),
('webshop_b2c', 'vareforbrug', 'variable'),
('webshop_b2c', 'fragt_levering', 'variable'),
('webshop_b2c', 'betalingsgebyrer', 'variable'),
('webshop_b2c', 'loenninger', 'personale'),
('webshop_b2c', 'digital_marketing', 'salg_marketing'),
('webshop_b2c', 'seo_content', 'salg_marketing'),
('webshop_b2c', 'email_marketing', 'salg_marketing'),
('webshop_b2c', 'platform_tech', 'drift'),
('webshop_b2c', 'lager_logistik', 'drift'),
('webshop_b2c', 'forsikring_abonnementer', 'faste'),
('webshop_b2c', 'admin_regnskab', 'faste'),
-- webshop_b2b (12)
('webshop_b2b', 'omsaetning', 'indtaegter'),
('webshop_b2b', 'vareforbrug', 'variable'),
('webshop_b2b', 'fragt_levering', 'variable'),
('webshop_b2b', 'betalingsgebyrer', 'variable'),
('webshop_b2b', 'loenninger', 'personale'),
('webshop_b2b', 'salg_kundepleje', 'salg_marketing'),
('webshop_b2b', 'digital_marketing', 'salg_marketing'),
('webshop_b2b', 'platform_tech', 'drift'),
('webshop_b2b', 'lager_logistik', 'drift'),
('webshop_b2b', 'forsikring', 'faste'),
('webshop_b2b', 'admin_regnskab', 'faste'),
('webshop_b2b', 'rejser_repraesentant', 'salg_marketing'),
-- service_b2b (11)
('service_b2b', 'omsaetning', 'indtaegter'),
('service_b2b', 'loenninger', 'personale'),
('service_b2b', 'uddannelse', 'personale'),
('service_b2b', 'salg_netvaerk', 'salg_marketing'),
('service_b2b', 'digital_marketing', 'salg_marketing'),
('service_b2b', 'lokaler', 'faste'),
('service_b2b', 'tech_software', 'drift'),
('service_b2b', 'telefon_internet', 'drift'),
('service_b2b', 'rejser_transport', 'salg_marketing'),
('service_b2b', 'forsikring', 'faste'),
('service_b2b', 'admin_regnskab', 'faste'),
-- service_b2c (11)
('service_b2c', 'omsaetning', 'indtaegter'),
('service_b2c', 'materialer', 'variable'),
('service_b2c', 'betalingsgebyrer', 'variable'),
('service_b2c', 'loenninger', 'personale'),
('service_b2c', 'lokaler', 'faste'),
('service_b2c', 'booking_tech', 'drift'),
('service_b2c', 'lokal_marketing', 'salg_marketing'),
('service_b2c', 'digital_marketing', 'salg_marketing'),
('service_b2c', 'telefon_internet', 'drift'),
('service_b2c', 'forsikring', 'faste'),
('service_b2c', 'admin_regnskab', 'faste'),
-- detail_b2c (11)
('detail_b2c', 'omsaetning', 'indtaegter'),
('detail_b2c', 'vareforbrug', 'variable'),
('detail_b2c', 'betalingsgebyrer', 'variable'),
('detail_b2c', 'loenninger', 'personale'),
('detail_b2c', 'lokaler_husleje', 'faste'),
('detail_b2c', 'lokal_marketing', 'salg_marketing'),
('detail_b2c', 'digital_marketing', 'salg_marketing'),
('detail_b2c', 'lager_indretning', 'drift'),
('detail_b2c', 'kasse_tech', 'drift'),
('detail_b2c', 'forsikring', 'faste'),
('detail_b2c', 'admin_regnskab', 'faste'),
-- saas_b2b (12)
('saas_b2b', 'omsaetning', 'indtaegter'),
('saas_b2b', 'loenninger_dev', 'personale'),
('saas_b2b', 'loenninger_salg', 'personale'),
('saas_b2b', 'loenninger_admin', 'personale'),
('saas_b2b', 'hosting_infra', 'drift'),
('saas_b2b', 'software_licenser', 'drift'),
('saas_b2b', 'digital_marketing', 'salg_marketing'),
('saas_b2b', 'salg_crm', 'salg_marketing'),
('saas_b2b', 'lokaler', 'faste'),
('saas_b2b', 'rejser', 'salg_marketing'),
('saas_b2b', 'forsikring_juridisk', 'faste'),
('saas_b2b', 'admin_regnskab', 'faste'),
-- haandvaerk (11)
('haandvaerk', 'omsaetning', 'indtaegter'),
('haandvaerk', 'materialer', 'variable'),
('haandvaerk', 'underleverandoerer', 'variable'),
('haandvaerk', 'loenninger', 'personale'),
('haandvaerk', 'koeretoej_braendstof', 'drift'),
('haandvaerk', 'maskiner_vaerktoj', 'drift'),
('haandvaerk', 'lokaler_vaerksted', 'faste'),
('haandvaerk', 'marketing', 'salg_marketing'),
('haandvaerk', 'forsikring', 'faste'),
('haandvaerk', 'admin_regnskab', 'faste'),
('haandvaerk', 'telefon_it', 'drift');

-- 3. Create RPC
CREATE OR REPLACE FUNCTION public.get_my_group_budget_summary(p_year text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _group_id uuid;
  _caller_id uuid;
  _is_advisor boolean;
  _included jsonb := '[]'::jsonb;
  _excluded jsonb := '[]'::jsonb;
  _totals jsonb;
  _comp record;
  _template_keys text[];
  _template_key text;
  _base_categories text[];
  _unmapped text[];
  _agg record;
BEGIN
  _caller_id := auth.uid();
  IF _caller_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Block advisors
  SELECT has_role(_caller_id, 'advisor'::app_role) INTO _is_advisor;
  IF _is_advisor THEN
    RETURN jsonb_build_object('error', 'advisor_not_allowed');
  END IF;

  _group_id := user_group_id(_caller_id);
  IF _group_id IS NULL THEN
    RETURN jsonb_build_object('year', p_year, 'included', '[]'::jsonb, 'excluded', '[]'::jsonb, 'totals', '{}'::jsonb);
  END IF;

  -- Init totals: 6 groups x 12 months (all zeros)
  _totals := jsonb_build_object(
    'indtaegter', '[0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,
    'variable', '[0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,
    'personale', '[0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,
    'salg_marketing', '[0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,
    'drift', '[0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb,
    'faste', '[0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb
  );

  FOR _comp IN
    SELECT gc.company_id, c.name
    FROM group_companies gc
    JOIN companies c ON c.id = gc.company_id
    WHERE gc.group_id = _group_id
    ORDER BY gc.sort_order, c.name
  LOOP
    -- Step 1: Check template markers
    SELECT array_agg(DISTINCT period) INTO _template_keys
    FROM budget_targets
    WHERE company_id = _comp.company_id AND category = '__template__';

    IF _template_keys IS NULL OR array_length(_template_keys, 1) = 0 THEN
      _excluded := _excluded || jsonb_build_array(jsonb_build_object(
        'company_id', _comp.company_id, 'name', _comp.name, 'reason', 'no_template'
      ));
      CONTINUE;
    END IF;

    IF array_length(_template_keys, 1) > 1 THEN
      _excluded := _excluded || jsonb_build_array(jsonb_build_object(
        'company_id', _comp.company_id, 'name', _comp.name, 'reason', 'ambiguous_template'
      ));
      CONTINUE;
    END IF;

    _template_key := _template_keys[1];

    -- Step 2: Check base budget rows for year
    SELECT array_agg(DISTINCT category) INTO _base_categories
    FROM budget_targets
    WHERE company_id = _comp.company_id
      AND period LIKE p_year || '-base-%'
      AND category != '__template__'
      AND category NOT LIKE '\\_\\_%' ESCAPE '\\';

    IF _base_categories IS NULL OR array_length(_base_categories, 1) = 0 THEN
      _excluded := _excluded || jsonb_build_array(jsonb_build_object(
        'company_id', _comp.company_id, 'name', _comp.name, 'reason', 'no_budget'
      ));
      CONTINUE;
    END IF;

    -- Step 3: Check for unmapped categories
    SELECT array_agg(cat) INTO _unmapped
    FROM unnest(_base_categories) AS cat
    WHERE NOT EXISTS (
      SELECT 1 FROM budget_category_group_map m
      WHERE m.template_key = _template_key AND m.category_key = cat
    );

    IF _unmapped IS NOT NULL AND array_length(_unmapped, 1) > 0 THEN
      _excluded := _excluded || jsonb_build_array(jsonb_build_object(
        'company_id', _comp.company_id, 'name', _comp.name,
        'reason', 'unmapped_categories', 'unmapped_keys', to_jsonb(_unmapped)
      ));
      CONTINUE;
    END IF;

    -- Company is included
    _included := _included || jsonb_build_array(jsonb_build_object(
      'company_id', _comp.company_id, 'name', _comp.name, 'template_key', _template_key
    ));

    -- Aggregate budget amounts by group and month
    FOR _agg IN
      SELECT m.group_key,
             (regexp_replace(bt.period, '^.*-base-', ''))::int AS month_idx,
             SUM(bt.budget_amount) AS total
      FROM budget_targets bt
      JOIN budget_category_group_map m ON m.template_key = _template_key AND m.category_key = bt.category
      WHERE bt.company_id = _comp.company_id
        AND bt.period LIKE p_year || '-base-%'
        AND bt.category != '__template__'
      GROUP BY m.group_key, month_idx
    LOOP
      IF _agg.month_idx >= 1 AND _agg.month_idx <= 12 THEN
        _totals := jsonb_set(
          _totals,
          ARRAY[_agg.group_key, (_agg.month_idx - 1)::text],
          to_jsonb(COALESCE((_totals -> _agg.group_key -> (_agg.month_idx - 1))::numeric, 0) + _agg.total)
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'year', p_year,
    'included', _included,
    'excluded', _excluded,
    'totals', _totals
  );
END;
$$;
