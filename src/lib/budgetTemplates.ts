import {
  TrendingUp, Megaphone, Users, Building2, Truck, Package, Globe, Monitor,
  ShoppingCart, Wrench, CreditCard, Phone, Wifi, Shield, FileText, Fuel,
  Warehouse, HeartHandshake, GraduationCap, Briefcase, UtensilsCrossed,
} from "lucide-react";

export interface BudgetCategory {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  group: "indtaegter" | "variable" | "personale" | "faste" | "salg_marketing" | "drift";
  hint?: string; // Tooltip/hjælpetekst
}

export interface BudgetTemplate {
  key: string;
  label: string;
  description: string;
  segment?: "B2C" | "B2B" | "B2C/B2B";
  icon: React.ComponentType<{ className?: string }>;
  categories: BudgetCategory[];
}

// ─── Webshop (B2C) ───
const webshopB2C: BudgetTemplate = {
  key: "webshop_b2c",
  label: "Webshop (B2C)",
  description: "Online salg direkte til forbrugere — fokus på vareforbrug, fragt og digital marketing",
  segment: "B2C",
  icon: ShoppingCart,
  categories: [
    { key: "omsaetning", label: "Omsætning", icon: TrendingUp, group: "indtaegter", hint: "Samlet nettoomsætning fra webshoppen" },
    { key: "vareforbrug", label: "Vareforbrug / COGS", icon: Package, group: "variable", hint: "Indkøbspris på solgte varer" },
    { key: "fragt_levering", label: "Fragt & levering", icon: Truck, group: "variable", hint: "Forsendelse, emballage, returhåndtering" },
    { key: "betalingsgebyrer", label: "Betalingsgebyrer", icon: CreditCard, group: "variable", hint: "Stripe, MobilePay, kortgebyrer (typisk 1,5–3%)" },
    { key: "loenninger", label: "Lønninger", icon: Users, group: "personale", hint: "Fast personale + freelancere" },
    { key: "digital_marketing", label: "Digital marketing", icon: Megaphone, group: "salg_marketing", hint: "Meta Ads, Google Ads, influencer, SoMe" },
    { key: "seo_content", label: "SEO & content", icon: Globe, group: "salg_marketing", hint: "Content-produktion, SEO-værktøjer, blogging" },
    { key: "email_marketing", label: "E-mail marketing", icon: FileText, group: "salg_marketing", hint: "Klaviyo, Mailchimp, nyhedsbreve" },
    { key: "platform_tech", label: "Platform & tech", icon: Monitor, group: "drift", hint: "Shopify, WooCommerce, apps, hosting" },
    { key: "lager_logistik", label: "Lager & logistik", icon: Warehouse, group: "drift", hint: "Lagerleje, 3PL, pakkeri" },
    { key: "forsikring_abonnementer", label: "Forsikring & abonnementer", icon: Shield, group: "faste", hint: "Erhvervsforsikring, SaaS-abonnementer" },
    { key: "admin_regnskab", label: "Admin & regnskab", icon: Building2, group: "faste", hint: "Revisor, bogføring, kontorhold" },
  ],
};

// ─── Webshop (B2B) ───
const webshopB2B: BudgetTemplate = {
  key: "webshop_b2b",
  label: "Webshop (B2B)",
  description: "Engros/B2B e-commerce — længere salgscyklusser, højere ordreværdier, kundeservice",
  segment: "B2B",
  icon: ShoppingCart,
  categories: [
    { key: "omsaetning", label: "Omsætning", icon: TrendingUp, group: "indtaegter", hint: "Nettoomsætning ekskl. moms" },
    { key: "vareforbrug", label: "Vareforbrug / COGS", icon: Package, group: "variable", hint: "Indkøb, engros-rabatter, toldafgifter" },
    { key: "fragt_levering", label: "Fragt & distribution", icon: Truck, group: "variable", hint: "Pallefragt, kurér, bulkforsendelser" },
    { key: "betalingsgebyrer", label: "Betalingsgebyrer", icon: CreditCard, group: "variable", hint: "Faktureringsgebyrer, kreditforsikring" },
    { key: "loenninger", label: "Lønninger", icon: Users, group: "personale", hint: "Salg, kundeservice, lager, admin" },
    { key: "salg_kundepleje", label: "Salg & kundepleje", icon: HeartHandshake, group: "salg_marketing", hint: "CRM, salgspersonale, messer, prøver" },
    { key: "digital_marketing", label: "Digital marketing", icon: Megaphone, group: "salg_marketing", hint: "LinkedIn Ads, Google Ads, content" },
    { key: "platform_tech", label: "Platform & tech", icon: Monitor, group: "drift", hint: "E-commerce platform, ERP-integration" },
    { key: "lager_logistik", label: "Lager & logistik", icon: Warehouse, group: "drift", hint: "Lagerleje, plukning, 3PL" },
    { key: "forsikring", label: "Forsikring & kredit", icon: Shield, group: "faste", hint: "Kreditforsikring, erhvervsforsikring" },
    { key: "admin_regnskab", label: "Admin & regnskab", icon: Building2, group: "faste", hint: "Revisor, bogføring, juridisk" },
    { key: "rejser_repraesentant", label: "Rejser & repræsentation", icon: Fuel, group: "salg_marketing", hint: "Kundebesøg, messer, rejseomkostninger" },
  ],
};

// ─── Servicevirksomhed (B2B) ───
const serviceB2B: BudgetTemplate = {
  key: "service_b2b",
  label: "Serviceydelser (B2B)",
  description: "Konsulentvirksomhed, bureau, rådgivning — høj lønandel, lav vareforbrug",
  segment: "B2B",
  icon: Briefcase,
  categories: [
    { key: "omsaetning", label: "Omsætning / honorar", icon: TrendingUp, group: "indtaegter", hint: "Fakturerede timer, projekter, retainers" },
    { key: "loenninger", label: "Lønninger & freelance", icon: Users, group: "personale", hint: "Fastansatte + underleverandører/freelancere" },
    { key: "uddannelse", label: "Uddannelse & kurser", icon: GraduationCap, group: "personale", hint: "Kompetenceudvikling, certificeringer, konferencer" },
    { key: "salg_netvaerk", label: "Salg & netværk", icon: HeartHandshake, group: "salg_marketing", hint: "Netværksarrangementer, pitchmøder, CRM" },
    { key: "digital_marketing", label: "Marketing & brand", icon: Megaphone, group: "salg_marketing", hint: "Website, SoMe, LinkedIn, content marketing" },
    { key: "lokaler", label: "Kontor & lokaler", icon: Building2, group: "faste", hint: "Husleje, kontorhotel, coworking" },
    { key: "tech_software", label: "Tech & software", icon: Monitor, group: "drift", hint: "Projektværktøjer, licenser, cloud, SaaS" },
    { key: "telefon_internet", label: "Telefon & internet", icon: Wifi, group: "drift", hint: "Mobilabonnementer, internet, VoIP" },
    { key: "rejser_transport", label: "Rejser & transport", icon: Fuel, group: "salg_marketing", hint: "Kundemøder, transport, hotel" },
    { key: "forsikring", label: "Forsikring", icon: Shield, group: "faste", hint: "Professionel ansvarsforsikring, erhvervsforsikring" },
    { key: "admin_regnskab", label: "Admin & regnskab", icon: FileText, group: "faste", hint: "Revisor, bogføring, juridisk rådgivning" },
  ],
};

// ─── Servicevirksomhed (B2C) ───
const serviceB2C: BudgetTemplate = {
  key: "service_b2c",
  label: "Serviceydelser (B2C)",
  description: "Personlige ydelser — frisør, terapi, fitness, rengøring, håndværk til private",
  segment: "B2C",
  icon: HeartHandshake,
  categories: [
    { key: "omsaetning", label: "Omsætning", icon: TrendingUp, group: "indtaegter", hint: "Behandlinger, abonnementer, klippekort" },
    { key: "materialer", label: "Materialer & forbrugsvarer", icon: Package, group: "variable", hint: "Produkter brugt til ydelsen" },
    { key: "betalingsgebyrer", label: "Betalingsgebyrer", icon: CreditCard, group: "variable", hint: "Kortterminaler, MobilePay" },
    { key: "loenninger", label: "Lønninger", icon: Users, group: "personale", hint: "Ansatte, vikarer, freelancere" },
    { key: "lokaler", label: "Lokaler", icon: Building2, group: "faste", hint: "Husleje, el, vand, varme" },
    { key: "booking_tech", label: "Booking & tech", icon: Monitor, group: "drift", hint: "Bookingsystem, website, POS" },
    { key: "lokal_marketing", label: "Lokal marketing", icon: Megaphone, group: "salg_marketing", hint: "Google My Business, lokal SoMe, flyers, events" },
    { key: "digital_marketing", label: "Digital marketing", icon: Globe, group: "salg_marketing", hint: "Instagram, Facebook Ads, Google Ads" },
    { key: "telefon_internet", label: "Telefon & internet", icon: Phone, group: "drift", hint: "Mobilabonnement, internet" },
    { key: "forsikring", label: "Forsikring", icon: Shield, group: "faste", hint: "Erhvervs- og ansvarsforsikring" },
    { key: "admin_regnskab", label: "Admin & regnskab", icon: FileText, group: "faste", hint: "Revisor, bogføring" },
  ],
};

// ─── Detailhandel / Butik (B2C) ───
const detailB2C: BudgetTemplate = {
  key: "detail_b2c",
  label: "Detailhandel / Butik",
  description: "Fysisk butik med varesalg — fokus på varelager, husleje og lokalt salg",
  segment: "B2C",
  icon: ShoppingCart,
  categories: [
    { key: "omsaetning", label: "Omsætning", icon: TrendingUp, group: "indtaegter", hint: "Butikssalg + evt. online" },
    { key: "vareforbrug", label: "Vareforbrug / indkøb", icon: Package, group: "variable", hint: "Indkøbspriser, svind, lagerregulering" },
    { key: "betalingsgebyrer", label: "Betalingsgebyrer", icon: CreditCard, group: "variable", hint: "Kortterminal, MobilePay" },
    { key: "loenninger", label: "Lønninger & vikarer", icon: Users, group: "personale", hint: "Butiksansatte, weekendhjælp" },
    { key: "lokaler_husleje", label: "Husleje & drift af lokale", icon: Building2, group: "faste", hint: "Husleje, el, varme, vedligeholdelse, indretning" },
    { key: "lokal_marketing", label: "Lokal marketing", icon: Megaphone, group: "salg_marketing", hint: "Skilte, events, lokale annoncer, samarbejder" },
    { key: "digital_marketing", label: "Digital tilstedeværelse", icon: Globe, group: "salg_marketing", hint: "SoMe, Google, evt. webshop" },
    { key: "lager_indretning", label: "Lager & inventar", icon: Warehouse, group: "drift", hint: "Reoler, mannequiner, lagerstyring" },
    { key: "kasse_tech", label: "Kassesystem & tech", icon: Monitor, group: "drift", hint: "POS, lagerstyring, website" },
    { key: "forsikring", label: "Forsikring", icon: Shield, group: "faste", hint: "Butiksforsikring, tyveri, ansvar" },
    { key: "admin_regnskab", label: "Admin & regnskab", icon: FileText, group: "faste", hint: "Revisor, bogføring" },
  ],
};

// ─── SaaS / Software (B2B) ───
const saasB2B: BudgetTemplate = {
  key: "saas_b2b",
  label: "SaaS / Software (B2B)",
  description: "Abonnementsbaseret software — høje development-omkostninger, lave variable",
  segment: "B2B",
  icon: Monitor,
  categories: [
    { key: "omsaetning", label: "MRR / omsætning", icon: TrendingUp, group: "indtaegter", hint: "Monthly Recurring Revenue, onboarding-fees" },
    { key: "loenninger_dev", label: "Lønninger (udvikling)", icon: Users, group: "personale", hint: "Udviklere, designere, QA" },
    { key: "loenninger_salg", label: "Lønninger (salg & CS)", icon: Users, group: "personale", hint: "Sælgere, customer success, support" },
    { key: "loenninger_admin", label: "Lønninger (ledelse & admin)", icon: Users, group: "personale", hint: "CEO, CFO, HR, admin" },
    { key: "hosting_infra", label: "Hosting & infrastruktur", icon: Wifi, group: "drift", hint: "AWS/GCP/Azure, CDN, overvågning" },
    { key: "software_licenser", label: "Software & licenser", icon: Monitor, group: "drift", hint: "Dev tools, Figma, Slack, analytics" },
    { key: "digital_marketing", label: "Marketing & growth", icon: Megaphone, group: "salg_marketing", hint: "Paid ads, content, SEO, events" },
    { key: "salg_crm", label: "Salg & CRM", icon: HeartHandshake, group: "salg_marketing", hint: "HubSpot, Salesforce, demoer, pilots" },
    { key: "lokaler", label: "Kontor", icon: Building2, group: "faste", hint: "Kontorleje, coworking, møderum" },
    { key: "rejser", label: "Rejser & events", icon: Fuel, group: "salg_marketing", hint: "Konferencer, kundemøder, teambuilding" },
    { key: "forsikring_juridisk", label: "Forsikring & juridisk", icon: Shield, group: "faste", hint: "GDPR, IP, erhvervsforsikring" },
    { key: "admin_regnskab", label: "Admin & regnskab", icon: FileText, group: "faste", hint: "Revisor, bogføring" },
  ],
};

// ─── Håndværk / Produktion ───
const haandvaerk: BudgetTemplate = {
  key: "haandvaerk",
  label: "Håndværk & produktion",
  description: "Fysisk produktion eller håndværksydelser — materialer, maskiner, køretøjer",
  segment: "B2C/B2B",
  icon: Wrench,
  categories: [
    { key: "omsaetning", label: "Omsætning", icon: TrendingUp, group: "indtaegter", hint: "Faktureret arbejde, projekter, entrepriser" },
    { key: "materialer", label: "Materialer & råvarer", icon: Package, group: "variable", hint: "Byggematerialer, råvarer, komponenter" },
    { key: "underleverandoerer", label: "Underleverandører", icon: Wrench, group: "variable", hint: "Specialister, underentreprenører" },
    { key: "loenninger", label: "Lønninger", icon: Users, group: "personale", hint: "Svende, lærlinge, kontor, ledelse" },
    { key: "koeretoej_braendstof", label: "Køretøjer & brændstof", icon: Fuel, group: "drift", hint: "Leasing, brændstof, forsikring, vedligeholdelse" },
    { key: "maskiner_vaerktoj", label: "Maskiner & værktøj", icon: Wrench, group: "drift", hint: "Leasing, køb, reparation, kalibrering" },
    { key: "lokaler_vaerksted", label: "Lokaler & værksted", icon: Building2, group: "faste", hint: "Husleje, el, vand, varme, affald" },
    { key: "marketing", label: "Marketing & salg", icon: Megaphone, group: "salg_marketing", hint: "Hjemmeside, Google, lokale annoncer, firmabil-reklame" },
    { key: "forsikring", label: "Forsikringer", icon: Shield, group: "faste", hint: "Arbejdsskadeforsikring, ansvar, all-risk" },
    { key: "admin_regnskab", label: "Admin & regnskab", icon: FileText, group: "faste", hint: "Revisor, bogføring, HMS, certificeringer" },
    { key: "telefon_it", label: "Telefon & IT", icon: Phone, group: "drift", hint: "Mobil, tidsregistrering, projektstyring" },
  ],
};

// ─── Restaurant & café (B2C) ───
const restaurantCafe: BudgetTemplate = {
  key: "restaurant_cafe",
  label: "Restaurant & café",
  description: "Serveringssted med mad og drikke — fokus på råvarer, personale og husleje",
  segment: "B2C",
  icon: UtensilsCrossed,
  categories: [
    { key: "omsaetning", label: "Omsætning", icon: TrendingUp, group: "indtaegter",
      hint: "Mad, drikke, takeaway, events, catering" },
    { key: "raavarerfood", label: "Råvarer & food cost", icon: Package, group: "variable",
      hint: "Indkøb af mad og drikke — typisk 28–35% af omsætning" },
    { key: "betalingsgebyrer", label: "Betalingsgebyrer", icon: CreditCard, group: "variable",
      hint: "Kortterminaler, MobilePay, online bestilling" },
    { key: "loenninger", label: "Lønninger", icon: Users, group: "personale",
      hint: "Tjenere, køkken, opvask, administration" },
    { key: "lokaler", label: "Husleje & lokaler", icon: Building2, group: "faste",
      hint: "Husleje, el, vand, varme, renovation" },
    { key: "udstyr_inventar", label: "Udstyr & inventar", icon: Wrench, group: "drift",
      hint: "Køkkenudstyr, møbler, service, vedligeholdelse" },
    { key: "lokal_marketing", label: "Marketing & events", icon: Megaphone, group: "salg_marketing",
      hint: "SoMe, Google, annoncer, særarrangementer, tilbud" },
    { key: "booking_tech", label: "Booking & kassesystem", icon: Monitor, group: "drift",
      hint: "POS, bordbooking, online bestilling (Wolt, Just Eat)" },
    { key: "musik_rettigheder", label: "Musik & underholdning", icon: FileText, group: "faste",
      hint: "KODA/Gramex-licens, live musik, underholdning" },
    { key: "forsikring", label: "Forsikring", icon: Shield, group: "faste",
      hint: "Ansvarsforsikring, inventarforsikring, arbejdsskade" },
    { key: "admin_regnskab", label: "Admin & regnskab", icon: FileText, group: "faste",
      hint: "Revisor, bogføring, vagtplan, HR" },
    { key: "telefon_internet", label: "Telefon & internet", icon: Wifi, group: "drift",
      hint: "Wifi til gæster, mobil, fastnet" },
  ],
};

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  webshopB2C,
  webshopB2B,
  serviceB2B,
  serviceB2C,
  detailB2C,
  restaurantCafe,
  saasB2B,
  haandvaerk,
];

export const GROUP_LABELS: Record<string, string> = {
  indtaegter: "Indtægter",
  variable: "Variable omkostninger",
  personale: "Personaleomkostninger",
  salg_marketing: "Salg & marketing",
  drift: "Driftsomkostninger",
  faste: "Faste omkostninger",
};

export const GROUP_ORDER = ["indtaegter", "variable", "personale", "salg_marketing", "drift", "faste"];
