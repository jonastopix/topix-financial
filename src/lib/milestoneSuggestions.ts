import type { MilestoneCategory } from "./milestoneCategories";

export interface MilestoneSuggestion {
  title: string;
  description: string;
  baselineHint?: string;
}

export const MILESTONE_SUGGESTIONS: Record<MilestoneCategory, MilestoneSuggestion[]> = {
  vaekst: [
    { title: "Nå 2M kr. i årlig omsætning", description: "Opnå en samlet årsomsætning på mindst 2.000.000 kr. målt på tværs af alle indtægtskilder.", baselineHint: "Indtast nuværende årsomsætning" },
    { title: "Opnå 15% omsætningsvækst MoM", description: "Fasthold en gennemsnitlig månedlig vækstrate på 15% i omsætning over mindst 3 sammenhængende måneder.", baselineHint: "Indtast nuværende månedlig vækstrate" },
    { title: "Fordoble kundebase inden Q4", description: "Gå fra nuværende antal aktive kunder til det dobbelte inden udgangen af Q4.", baselineHint: "Indtast nuværende antal aktive kunder" },
    { title: "Øg gennemsnitlig ordreværdi med 25%", description: "Hæv den gennemsnitlige ordreværdi fra nuværende niveau med mindst 25% via mersalg og bundling.", baselineHint: "Indtast nuværende gennemsnitlig ordreværdi" },
  ],
  profit: [
    { title: "Opnå positiv bundlinje", description: "Nå et positivt resultat efter skat i mindst 2 sammenhængende måneder.", baselineHint: "Indtast nuværende månedligt resultat" },
    { title: "Nå 10% overskudsgrad", description: "Opnå en overskudsgrad (resultat/omsætning) på minimum 10% på månedsbasis.", baselineHint: "Indtast nuværende overskudsgrad" },
    { title: "Reducér driftsomkostninger med 20%", description: "Skær 20% af de samlede driftsomkostninger sammenlignet med gennemsnittet af de seneste 3 måneder.", baselineHint: "Indtast nuværende månedlige driftsomkostninger" },
    { title: "Forbedre EBITDA-margin til 15%", description: "Øg EBITDA-marginen til minimum 15% gennem optimering af drift og omkostninger.", baselineHint: "Indtast nuværende EBITDA-margin" },
  ],
  salg: [
    { title: "Luk 50 nye aftaler i kvartalet", description: "Underskrive minimum 50 nye kundeaftaler i løbet af det aktuelle kvartal.", baselineHint: "Indtast antal lukkede aftaler sidste kvartal" },
    { title: "Opnå ordrestørrelse på 25.000 kr.", description: "Hæv den gennemsnitlige ordrestørrelse til mindst 25.000 kr. per ordre.", baselineHint: "Indtast nuværende gennemsnitlig ordrestørrelse" },
    { title: "Reducer salgscyklus til under 30 dage", description: "Bring den gennemsnitlige tid fra første kontakt til lukket aftale ned under 30 dage.", baselineHint: "Indtast nuværende gennemsnitlig salgscyklus i dage" },
    { title: "Opnå 30% win-rate på tilbud", description: "Øg andelen af afgivne tilbud der konverterer til ordrer til mindst 30%.", baselineHint: "Indtast nuværende win-rate" },
  ],
  kunder: [
    { title: "Nå 100 aktive kunder", description: "Opnå en base på mindst 100 aktive, betalende kunder.", baselineHint: "Indtast nuværende antal aktive kunder" },
    { title: "Opnå NPS over 50", description: "Gennemfør NPS-måling og opnå en score på minimum 50.", baselineHint: "Indtast nuværende NPS-score (eller 'Ikke målt endnu')" },
    { title: "Reducer churn til under 5%", description: "Bring den månedlige kundeafgang ned under 5% af den samlede kundebase.", baselineHint: "Indtast nuværende churn-rate" },
    { title: "Øg customer lifetime value med 30%", description: "Forlæng den gennemsnitlige kundelevitid og øg CLV med mindst 30%.", baselineHint: "Indtast nuværende CLV" },
  ],
  produkt: [
    { title: "Launch MVP af ny produktlinje", description: "Få en funktionel MVP af den nye produktlinje klar til markedet med de 3 vigtigste features.", baselineHint: "Beskriv nuværende produktstatus" },
    { title: "Implementér 3 nøglefunktioner fra feedback", description: "Prioritér og implementér de 3 mest efterspurgte funktioner baseret på kundefeedback.", baselineHint: "Antal implementerede funktioner pt." },
    { title: "Reducér fejlrate med 50%", description: "Halver antallet af rapporterede fejl/bugs sammenlignet med forrige kvartal.", baselineHint: "Indtast antal fejl/bugs sidste kvartal" },
    { title: "Opnå 95% uptime", description: "Sikre at produktet/tjenesten har en tilgængelighed på mindst 95% målt over en måned.", baselineHint: "Indtast nuværende uptime-procent" },
  ],
  marketing: [
    { title: "Nå 10.000 månedlige website-besøg", description: "Opnå mindst 10.000 unikke besøgende per måned på virksomhedens website.", baselineHint: "Indtast nuværende månedlige besøgstal" },
    { title: "Opnå CAC under 500 kr.", description: "Bring den gennemsnitlige kundeanskaffelsesomkostning ned under 500 kr.", baselineHint: "Indtast nuværende CAC" },
    { title: "Kør 3 kampagner med positivt ROAS", description: "Gennemfør minimum 3 marketingkampagner der hver opnår et positivt return on ad spend.", baselineHint: "Antal kampagner kørt hidtil" },
    { title: "Opbyg email-liste på 2.000 subscribers", description: "Voks email-listen til mindst 2.000 aktive subscribers via lead magnets og content.", baselineHint: "Indtast nuværende antal subscribers" },
  ],
  medarbejdere: [
    { title: "Ansæt 2 nye medarbejdere", description: "Gennemfør rekrutteringsproces og onboard 2 nye medarbejdere i nøgleroller.", baselineHint: "Indtast nuværende antal medarbejdere" },
    { title: "Gennemfør MUS med alle inden juni", description: "Afhold individuelle medarbejderudviklingssamtaler med alle ansatte inden udgangen af juni.", baselineHint: "Antal gennemførte MUS-samtaler pt." },
    { title: "Opnå medarbejdertilfredshed over 8/10", description: "Gennemfør anonym tilfredshedsmåling og opnå en gennemsnitlig score på mindst 8 ud af 10.", baselineHint: "Indtast nuværende tilfredshedsscore (eller 'Ikke målt')" },
    { title: "Reducer medarbejderomsætning til under 10%", description: "Bring den årlige medarbejderomsætningshastighed ned under 10% via fastholdelsesinitiativer.", baselineHint: "Indtast nuværende medarbejderomsætning i %" },
  ],
  timer: [
    { title: "Opnå 75% faktureringsgrad", description: "Sikre at mindst 75% af alle registrerede timer er fakturerbare.", baselineHint: "Indtast nuværende faktureringsgrad" },
    { title: "Reducér spildtid med 20%", description: "Identificér og eliminér tidsspilde så ikke-fakturerbare timer falder med 20%.", baselineHint: "Indtast nuværende antal ikke-fakturerbare timer/måned" },
    { title: "Log 1.500 fakturerbare timer i kvartalet", description: "Registrér minimum 1.500 fakturerbare timer samlet i løbet af kvartalet.", baselineHint: "Indtast fakturerbare timer sidste kvartal" },
  ],
  db: [
    { title: "Opnå DB1 over 60%", description: "Hæv dækningsbidrag 1 (omsætning minus vareforbrug) til mindst 60% af omsætningen.", baselineHint: "Indtast nuværende DB1 i %" },
    { title: "Forbedre DB2 med 10 procentpoint", description: "Øg dækningsbidrag 2 med 10 procentpoint gennem effektivisering af direkte omkostninger.", baselineHint: "Indtast nuværende DB2 i %" },
    { title: "Nå 500.000 kr. i månedligt DB", description: "Opnå et månedligt dækningsbidrag på minimum 500.000 kr.", baselineHint: "Indtast nuværende månedligt dækningsbidrag" },
  ],
  juridisk: [
    { title: "Få GDPR-compliance på plads", description: "Gennemfør fuld GDPR-gennemgang og implementér nødvendige tiltag for overholdelse.", baselineHint: "Beskriv nuværende compliance-status" },
    { title: "Opdater alle kontrakter", description: "Gennemgå og opdater alle kunde- og leverandørkontrakter så de er juridisk up-to-date.", baselineHint: "Antal kontrakter der skal opdateres" },
    { title: "Gennemfør årlig compliance-review", description: "Afslut den årlige gennemgang af alle juridiske og regulatoriske krav.", baselineHint: "Dato for seneste compliance-review" },
  ],
  funding: [
    { title: "Rejse pre-seed runde på 2M kr.", description: "Gennemfør en pre-seed fundraising og luk runden med minimum 2.000.000 kr.", baselineHint: "Indtast rejst kapital hidtil" },
    { title: "Udarbejde pitch deck", description: "Skab et investorklar pitch deck med financials, traction og markedsanalyse.", baselineHint: "Beskriv nuværende status på materialer" },
    { title: "Nå break-even inden næste runde", description: "Opnå break-even på månedsbasis inden næste planlagte kapitalrejsning.", baselineHint: "Indtast nuværende månedligt burn rate" },
  ],
  regnskab: [
    { title: "Afslut årsregnskab til tiden", description: "Færdiggør og indsend årsregnskabet inden deadline.", baselineHint: "Seneste regnskabsperiode afsluttet" },
    { title: "Implementer månedlig bogføring", description: "Sørg for at bogføring sker løbende hver måned.", baselineHint: "Nuværende bogføringsfrekvens" },
    { title: "Reducér bogføringsefterslæb", description: "Bring bogføringen ajour så den altid er maks 2 uger bagud.", baselineHint: "Nuværende forsinkelse i bogføring" },
  ],
  administration: [
    { title: "Opret og vedligehold forsikringsoverblik", description: "Saml alle virksomhedens forsikringer ét sted og gennemgå dækning årligt.", baselineHint: "Antal forsikringer registreret pt." },
    { title: "Implementer digital dokumenthåndtering", description: "Indfør et system til digital arkivering af kontrakter, kvitteringer og dokumenter.", baselineHint: "Nuværende dokumenthåndtering" },
    { title: "Gennemfør årlig leverandørvurdering", description: "Evaluér alle faste leverandører på pris, kvalitet og leveringstid.", baselineHint: "Antal faste leverandører" },
  ],
  other: [
    { title: "Etabler advisory board", description: "Saml et advisory board med 3-5 relevante rådgivere fra branchen.", baselineHint: "Antal rådgivere pt." },
    { title: "Implementer nyt ERP-system", description: "Vælg, implementér og migrer til et nyt ERP-system der understøtter væksten.", baselineHint: "Beskriv nuværende systemopsætning" },
    { title: "Certificering eller kvalitetsstempel", description: "Opnå relevant branchecertificering eller kvalitetsstempel (ISO, B Corp, etc.).", baselineHint: "Nuværende certificeringsstatus" },
  ],
};
