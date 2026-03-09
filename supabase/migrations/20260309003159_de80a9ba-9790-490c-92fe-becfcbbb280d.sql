-- Tilføj nye kolonner til financial_reports tabel for parser-data

-- raw_extracted_data: Gemmer rå data fra parseren
ALTER TABLE financial_reports
ADD COLUMN IF NOT EXISTS raw_extracted_data jsonb;

-- normalized_data: Gemmer normaliserede data efter fortegnsregler
ALTER TABLE financial_reports
ADD COLUMN IF NOT EXISTS normalized_data jsonb;

-- validation_status: Status for validering (PASS/FAIL)
ALTER TABLE financial_reports
ADD COLUMN IF NOT EXISTS validation_status text;

-- validation_errors: Array af valideringsfejl
ALTER TABLE financial_reports
ADD COLUMN IF NOT EXISTS validation_errors text[];

-- extraction_method: Hvilken metode blev brugt til udtræk (deterministic/ai)
ALTER TABLE financial_reports
ADD COLUMN IF NOT EXISTS extraction_method text;

COMMENT ON COLUMN financial_reports.raw_extracted_data IS 'Rå data fra parseren før normalisering';
COMMENT ON COLUMN financial_reports.normalized_data IS 'Normaliserede data efter fortegnsregler';
COMMENT ON COLUMN financial_reports.validation_status IS 'Validering status: PASS eller FAIL';
COMMENT ON COLUMN financial_reports.validation_errors IS 'Liste af valideringsfejl hvis status = FAIL';
COMMENT ON COLUMN financial_reports.extraction_method IS 'Udtræksmetode: deterministic, ai eller fallback';