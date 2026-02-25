import type { MilestoneCategory } from "./milestoneCategories";

export interface MilestoneSuggestion {
  title: string;
  description: string;
}

export const MILESTONE_SUGGESTIONS: Record<MilestoneCategory, MilestoneSuggestion[]> = {
  vaekst: [
    { title: "Nå 2M kr. i årlig omsætning", description: "Opnå en samlet årsomsætning på mindst 2.000.000 kr. målt på tværs af alle indtægtskilder." },
    { title: "Opnå 15% omsætningsvækst MoM", description: "Fasthold en gennemsnitlig månedlig vækstrate på 15% i omsætning over mindst 3 sammenhængende måneder." },
    { title: "Fordoble kundebase inden Q4", description: "Gå fra nuværende antal aktive kunder til det dobbelte inden udgangen af Q4." },
    { title: "Øg gennemsnitlig ordreværdi med 25%", description: "Hæv den gennemsnitlige ordreværdi fra nuværende niveau med mindst 25% via mersalg og bundling." },
  ],
  profit: [
    { title: "Opnå positiv bundlinje", description: "Nå et positivt resultat efter skat i mindst 2 sammenhængende måneder." },
    { title: "Nå 10% overskudsgrad", description: "Opnå en overskudsgrad (resultat/omsætning) på minimum 10% på månedsbasis." },
    { title: "Reducér driftsomkostninger med 20%", description: "Skær 20% af de samlede driftsomkostninger sammenlignet med gennemsnittet af de seneste 3 måneder." },
    { title: "Forbedre EBITDA-margin til 15%", description: "Øg EBITDA-marginen til minimum 15% gennem optimering af drift og omkostninger." },
  ],
  salg: [
    { title: "Luk 50 nye aftaler i kvartalet", description: "Underskrive minimum 50 nye kundeaftaler i løbet af det aktuelle kvartal." },
    { title: "Opnå ordrestørrelse på 25.000 kr.", description: "Hæv den gennemsnitlige ordrestørrelse til mindst 25.000 kr. per ordre." },
    { title: "Reducer salgscyklus til under 30 dage", description: "Bring den gennemsnitlige tid fra første kontakt til lukket aftale ned under 30 dage." },
    { title: "Opnå 30% win-rate på tilbud", description: "Øg andelen af afgivne tilbud der konverterer til ordrer til mindst 30%." },
  ],
  kunder: [
    { title: "Nå 100 aktive kunder", description: "Opnå en base på mindst 100 aktive, betalende kunder." },
    { title: "Opnå NPS over 50", description: "Gennemfør NPS-måling og opnå en score på minimum 50." },
    { title: "Reducer churn til under 5%", description: "Bring den månedlige kundeafgang ned under 5% af den samlede kundebase." },
    { title: "Øg customer lifetime value med 30%", description: "Forlæng den gennemsnitlige kundelevitid og øg CLV med mindst 30%." },
  ],
  produkt: [
    { title: "Launch MVP af ny produktlinje", description: "Få en funktionel MVP af den nye produktlinje klar til markedet med de 3 vigtigste features." },
    { title: "Implementér 3 nøglefunktioner fra feedback", description: "Prioritér og implementér de 3 mest efterspurgte funktioner baseret på kundefeedback." },
    { title: "Reducér fejlrate med 50%", description: "Halver antallet af rapporterede fejl/bugs sammenlignet med forrige kvartal." },
    { title: "Opnå 95% uptime", description: "Sikre at produktet/tjenesten har en tilgængelighed på mindst 95% målt over en måned." },
  ],
  marketing: [
    { title: "Nå 10.000 månedlige website-besøg", description: "Opnå mindst 10.000 unikke besøgende per måned på virksomhedens website." },
    { title: "Opnå CAC under 500 kr.", description: "Bring den gennemsnitlige kundeanskaffelsesomkostning ned under 500 kr." },
    { title: "Kør 3 kampagner med positivt ROAS", description: "Gennemfør minimum 3 marketingkampagner der hver opnår et positivt return on ad spend." },
    { title: "Opbyg email-liste på 2.000 subscribers", description: "Voks email-listen til mindst 2.000 aktive subscribers via lead magnets og content." },
  ],
  medarbejdere: [
    { title: "Ansæt 2 nye medarbejdere", description: "Gennemfør rekrutteringsproces og onboard 2 nye medarbejdere i nøgleroller." },
    { title: "Gennemfør MUS med alle inden juni", description: "Afhold individuelle medarbejderudviklingssamtaler med alle ansatte inden udgangen af juni." },
    { title: "Opnå medarbejdertilfredshed over 8/10", description: "Gennemfør anonym tilfredshedsmåling og opnå en gennemsnitlig score på mindst 8 ud af 10." },
    { title: "Reducer medarbejderomsætning til under 10%", description: "Bring den årlige medarbejderomsætningshastighed ned under 10% via fastholdelsesinitiativer." },
  ],
  timer: [
    { title: "Opnå 75% faktureringsgrad", description: "Sikre at mindst 75% af alle registrerede timer er fakturerbare." },
    { title: "Reducér spildtid med 20%", description: "Identificér og eliminér tidsspilde så ikke-fakturerbare timer falder med 20%." },
    { title: "Log 1.500 fakturerbare timer i kvartalet", description: "Registrér minimum 1.500 fakturerbare timer samlet i løbet af kvartalet." },
  ],
  db: [
    { title: "Opnå DB1 over 60%", description: "Hæv dækningsbidrag 1 (omsætning minus vareforbrug) til mindst 60% af omsætningen." },
    { title: "Forbedre DB2 med 10 procentpoint", description: "Øg dækningsbidrag 2 med 10 procentpoint gennem effektivisering af direkte omkostninger." },
    { title: "Nå 500.000 kr. i månedligt DB", description: "Opnå et månedligt dækningsbidrag på minimum 500.000 kr." },
  ],
  juridisk: [
    { title: "Få GDPR-compliance på plads", description: "Gennemfør fuld GDPR-gennemgang og implementér nødvendige tiltag for overholdelse." },
    { title: "Opdater alle kontrakter", description: "Gennemgå og opdater alle kunde- og leverandørkontrakter så de er juridisk up-to-date." },
    { title: "Gennemfør årlig compliance-review", description: "Afslut den årlige gennemgang af alle juridiske og regulatoriske krav." },
  ],
  funding: [
    { title: "Rejse pre-seed runde på 2M kr.", description: "Gennemfør en pre-seed fundraising og luk runden med minimum 2.000.000 kr." },
    { title: "Udarbejde pitch deck", description: "Skab et investorklar pitch deck med financials, traction og markedsanalyse." },
    { title: "Nå break-even inden næste runde", description: "Opnå break-even på månedsbasis inden næste planlagte kapitalrejsning." },
  ],
  other: [
    { title: "Etabler advisory board", description: "Saml et advisory board med 3-5 relevante rådgivere fra branchen." },
    { title: "Implementer nyt ERP-system", description: "Vælg, implementér og migrer til et nyt ERP-system der understøtter væksten." },
    { title: "Certificering eller kvalitetsstempel", description: "Opnå relevant branchecertificering eller kvalitetsstempel (ISO, B Corp, etc.)." },
  ],
};
