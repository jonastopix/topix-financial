/**
 * pnlPdfBrillevaerkSyntetisk.ts — SYNTETISK e-conomic resultatopgørelse-PDF i BRILLEVÆRK-FORMEN (17/9-2026).
 *
 * INGEN kundedata. Gruppenavnene er de målte (prod 17/9 21:59, raw_lines ordret): «Omsætning Glas & Briller
 * i alt · Vareforbrug Glas og Briller i alt · Vareforbrug Linser i alt · Omsætning i alt · Vareforbrug øvrigt i
 * alt · Dækningsbidrag i alt · Løn, gager og honorarer i alt · Pensioner i alt · Sociale bidrag og personale-
 * omkostninger i alt · Personaleomkostninger i alt · Salgsomkostninger i alt · Leasing i alt · Lokaleomkostninger
 * i alt · Administrationsomkostninger i alt · Afskrivninger i alt · Finansieringsomkostninger i alt». Tallene er
 * fiktive og valgt så kontrolsummen lukker; kreditformat (omsætning og overskud negative). Strukturel payload
 * (slot 0 = Perioden), som browseren laver den.
 */
import type { PdfStructuralPayload, PdfStructuralRow, PdfStructuralToken } from "../_shared/pdfStructuralTypes.ts";

export type Raekke = { label: string; periode?: number | null; subtotal?: boolean; konto?: string };

export const dkTal = (v: number): string => {
  const s = Math.abs(v).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return v < 0 ? `-${s}` : s;
};

export function bygStrukturel(raekker: readonly Raekke[]): PdfStructuralPayload {
  const rows: PdfStructuralRow[] = raekker.map((r, i) => {
    const tokens: PdfStructuralToken[] = [];
    let x = 20;
    if (r.konto) { tokens.push({ text: r.konto, x, y: 800 - i * 12, width: 30, page: 1, column_slot: null, column_slot_confidence: "HIGH" }); x += 40; }
    tokens.push({ text: r.label, x, y: 800 - i * 12, width: 150, page: 1, column_slot: null, column_slot_confidence: "HIGH" });
    if (r.periode != null) tokens.push({ text: dkTal(r.periode), x: 300, y: 800 - i * 12, width: 60, page: 1, column_slot: 0, column_slot_confidence: "HIGH" });
    return { row_index: i, row_group_id: `p1_r${i}`, y_position: 800 - i * 12, page: 1, tokens, is_header: false, is_subtotal: r.subtotal === true };
  });
  return {
    version: "1.0",
    pages: [{ page_number: 1, rows }],
    column_profile: { slot_count: 1, slot_labels: ["Perioden"], slot_x_ranges: [{ min: 280, max: 340 }], detection_method: "header_anchor", confidence: "HIGH" },
    metadata: { page_count: 1, total_token_count: rows.reduce((n, r) => n + r.tokens.length, 0), total_row_count: rows.length, content_hash: "0".repeat(64), source_file_name: "syntetisk.pdf", extraction_timestamp: "2026-09-18T00:00:00.000Z" },
  };
}

/** BRILLEVÆRK-formen. `medSocialeLinje` = filens form (søskende «Sociale bidrag … i alt» FØR beholderen);
    false = kun beholderen «Personaleomkostninger i alt» efter løn og pension (så trækkes de fra igen). */
export function brillevaerkFormen(medSocialeLinje = true): Raekke[] {
  const r: Raekke[] = [
    { label: "Syntetisk Optik ApS (CVR-nr. 12345678)" },
    { label: "Resultatopgørelse 01/01-2026 - 31/01-2026" },
    { label: "RESULTATOPGØRELSE" },
    { label: "Omsætning" },
    { label: "Omsætning Glas & Briller" },
    { label: "Salg af briller", konto: "1010", periode: -200_000 },
    { label: "Omsætning Glas & Briller i alt", periode: -200_000, subtotal: true },
    { label: "Vareforbrug Glas og Briller" },
    { label: "Køb af glas", konto: "1310", periode: 60_000 },
    { label: "Vareforbrug Glas og Briller i alt", periode: 60_000, subtotal: true },
    { label: "Vareforbrug Linser" },
    { label: "Køb af linser", konto: "1320", periode: 20_000 },
    { label: "Vareforbrug Linser i alt", periode: 20_000, subtotal: true },
    { label: "Omsætning i alt", periode: -120_000, subtotal: true },
    { label: "Vareforbrug øvrigt" },
    { label: "Øvrigt vareforbrug", konto: "1390", periode: 35_000 },
    { label: "Vareforbrug øvrigt i alt", periode: 35_000, subtotal: true },
    { label: "Dækningsbidrag i alt", periode: -85_000, subtotal: true },
    { label: "Personaleomkostninger" },
    { label: "Løn, gager og honorarer" },
    { label: "Lønninger", konto: "2210", periode: 20_000 },
    { label: "Løn, gager og honorarer i alt", periode: 20_000, subtotal: true },
    { label: "Pensioner" },
    { label: "Pension", konto: "2230", periode: 1_500 },
    { label: "Pensioner i alt", periode: 1_500, subtotal: true },
  ];
  if (medSocialeLinje) {
    r.push({ label: "Sociale bidrag og personaleomkostninger" }, { label: "ATP", konto: "2250", periode: 1_200 }, { label: "Sociale bidrag og personaleomkostninger i alt", periode: 1_200, subtotal: true });
  } else {
    r.push({ label: "ATP", konto: "2250", periode: 1_200 });
  }
  r.push(
    { label: "Personaleomkostninger i alt", periode: 22_700, subtotal: true },
    { label: "Salgsomkostninger" },
    { label: "Annoncer", konto: "2810", periode: 15_000 },
    { label: "Salgsomkostninger i alt", periode: 15_000, subtotal: true },
    { label: "Leasing" },
    { label: "Leasing af udstyr", konto: "3210", periode: 8_000 },
    { label: "Leasing i alt", periode: 8_000, subtotal: true },
    { label: "Lokaleomkostninger" },
    { label: "Husleje", konto: "3410", periode: 12_000 },
    { label: "Lokaleomkostninger i alt", periode: 12_000, subtotal: true },
    { label: "Administrationsomkostninger" },
    { label: "Kontorartikler", konto: "3610", periode: 10_000 },
    { label: "Administrationsomkostninger i alt", periode: 10_000, subtotal: true },
    { label: "Afskrivninger" },
    { label: "Afskrivning inventar", konto: "3910", periode: 4_000 },
    { label: "Afskrivninger i alt", periode: 4_000, subtotal: true },
    { label: "Resultat før renter", periode: -13_300, subtotal: true },
    { label: "Finansieringsomkostninger" },
    { label: "Renter bank", konto: "4410", periode: 1_300 },
    { label: "Finansieringsomkostninger i alt", periode: 1_300, subtotal: true },
    { label: "Resultat før skat", periode: -12_000, subtotal: true },
    { label: "PERIODENS RESULTAT", periode: -12_000, subtotal: true },
  );
  return r;
}

/** 120.000 − 35.000 − 20.000 − 1.500 − 1.200 − 15.000 − 8.000 (leasing → øvrige) − 12.000 − 10.000 − 4.000 − 1.300 = 12.000. */
export const BRILLEVAERK_FORM_FORVENTET = {
  revenue: 120_000, cogs: 35_000, gross_profit: 85_000,
  payroll: 20_000, payroll_related: 1_500, other_staff_costs: 1_200, sales_costs: 15_000, other_costs: 8_000,
  facility_costs: 12_000, admin_costs: 10_000, depreciation: 4_000, financial_costs: 1_300, ebit: 13_300, ebt: 12_000, net_result: 12_000,
};
