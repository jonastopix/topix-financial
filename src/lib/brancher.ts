/**
 * src/lib/brancher.ts
 *
 * App-taksonomien for branche: 17 grupper med 48 underkategorier. Flyttet
 * ordret fra src/pages/Settings.tsx (der stod den som lokal konstant, ikke
 * eksporteret) — Settings importerer den herfra nu. Én kilde til labels for
 * Settings' branche-select, motoren i src/lib/branchekode.ts og (fremover)
 * benchmark-seedet: docs/indgangen-overhaling.md §9 trin 2.
 *
 * `value` på underkategorierne er nøglen i companies.industry_code og i
 * industry_benchmarks.industry_code (seedet i migration 20260329190316 og
 * 20260329211955). `label` er den tekst der lægges i companies.industry_label
 * når koden vælges i Settings (Settings.tsx, branche-select'ens onValueChange).
 *
 * Filen har nul imports, så den kan spejles til supabase/functions/_shared/
 * uden ændringer når motoren får en Deno-aftager.
 */

export interface BrancheUnderkategori {
  label: string;
  value: string;
}

export interface BrancheGruppe {
  label: string;
  value: string;
  sub: BrancheUnderkategori[];
}

export const INDUSTRY_OPTIONS: BrancheGruppe[] = [
  { label: "Detailhandel", value: "retail", sub: [
    { label: "Dagligvarer og fødevarer", value: "retail_grocery" },
    { label: "Tøj og accessories", value: "retail_fashion" },
    { label: "Møbler og interiør", value: "retail_furniture" },
    { label: "Elektronik og IT-udstyr", value: "retail_electronics" },
    { label: "Sport og fritid", value: "retail_sport" },
    { label: "Biler og køretøjer", value: "retail_automotive" },
    { label: "Anden detailhandel", value: "retail_other" },
  ]},
  { label: "Engroshandel og import/eksport", value: "wholesale", sub: [
    { label: "Engroshandel og import/eksport", value: "wholesale_general" },
  ]},
  { label: "Produktion og fremstilling", value: "production", sub: [
    { label: "Fødevareproduktion", value: "production_food" },
    { label: "Industriel produktion", value: "production_industrial" },
    { label: "Håndværksproduktion", value: "production_craft" },
  ]},
  { label: "Bygge og anlæg", value: "construction", sub: [
    { label: "Entreprenør og anlæg", value: "construction_contractor" },
    { label: "Håndværk og installation", value: "construction_craft" },
    { label: "Arkitektur og rådgivning", value: "construction_consulting" },
  ]},
  { label: "Transport og logistik", value: "transport", sub: [
    { label: "Varetransport og spedition", value: "transport_freight" },
    { label: "Personbefordring", value: "transport_passenger" },
    { label: "Eventlogistik og specialtransport", value: "transport_event" },
  ]},
  { label: "Rejse og turisme", value: "travel", sub: [
    { label: "Rejsebureau og turoperatør", value: "travel_tour" },
    { label: "Eventrejser og specialture", value: "travel_event" },
  ]},
  { label: "IT og teknologi", value: "tech", sub: [
    { label: "Softwareudvikling", value: "tech_software" },
    { label: "IT-drift og support", value: "tech_support" },
    { label: "Tech-startup", value: "tech_startup" },
  ]},
  { label: "Rådgivning og konsulentydelser", value: "consulting", sub: [
    { label: "Økonomi og regnskab", value: "consulting_finance" },
    { label: "Juridisk rådgivning", value: "consulting_legal" },
    { label: "Management og strategi", value: "consulting_management" },
    { label: "HR og rekruttering", value: "consulting_hr" },
    { label: "Marketing og kommunikation", value: "consulting_marketing" },
  ]},
  { label: "Sundhed og velvære", value: "health", sub: [
    { label: "Klinik og behandling", value: "health_clinic" },
    { label: "Træning og fitness", value: "health_fitness" },
    { label: "Apotek og helse", value: "health_pharmacy" },
    { label: "Optiker og synspleje", value: "health_optician" },
  ]},
  { label: "Fødevarer og restauration", value: "food", sub: [
    { label: "Restaurant og café", value: "food_restaurant" },
    { label: "Catering og events", value: "food_catering" },
    { label: "Takeaway og levering", value: "food_takeaway" },
  ]},
  { label: "Håndværk og serviceerhverv", value: "trades", sub: [
    { label: "El, VVS og ventilation", value: "trades_electrical" },
    { label: "Maler og gulv", value: "trades_painter" },
    { label: "Rengøring og facility", value: "trades_cleaning" },
    { label: "Anden håndværksservice", value: "trades_other" },
  ]},
  { label: "Ejendom og bolig", value: "realestate", sub: [
    { label: "Ejendomsmægling", value: "realestate_agency" },
    { label: "Udlejning og administration", value: "realestate_rental" },
    { label: "Ejendomsudvikling", value: "realestate_development" },
  ]},
  { label: "Medier, kultur og kreative erhverv", value: "creative", sub: [
    { label: "Reklame og design", value: "creative_advertising" },
    { label: "Foto og video", value: "creative_photo" },
    { label: "Musik og underholdning", value: "creative_music" },
  ]},
  { label: "Uddannelse og undervisning", value: "education", sub: [
    { label: "Uddannelse og undervisning", value: "education_general" },
  ]},
  { label: "Landbrug, gartneri og natur", value: "agriculture", sub: [
    { label: "Landbrug, gartneri og natur", value: "agriculture_general" },
  ]},
  { label: "Finans og forsikring", value: "finance", sub: [
    { label: "Finans og forsikring", value: "finance_general" },
  ]},
  { label: "Andet", value: "other", sub: [
    { label: "Andet", value: "other_general" },
  ]},
];

/** Alle 48 underkategorier fladt — den liste Settings' select og motoren slår op i. */
export const ALLE_BRANCHER: BrancheUnderkategori[] = INDUSTRY_OPTIONS.flatMap(g => g.sub);

/** Underkategorien bag en industry_code, eller null når koden ikke er i taksonomien. */
export function findBranche(value: string): BrancheUnderkategori | null {
  return ALLE_BRANCHER.find(s => s.value === value) ?? null;
}
