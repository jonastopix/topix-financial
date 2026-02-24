export type HandoutModule = 'overordnet' | 'bogholderi' | 'administration' | 'salg' | 'marketing';

export interface HandoutQuestion {
  key: string;
  label: string;
  type: 'textarea' | 'numbered_list';
  count?: number; // for numbered_list
}

export interface ChecklistItem {
  key: string;
  label: string;
  hasFollowUp?: string; // follow-up question label
}

export interface HandoutSection {
  title: string;
  questions: HandoutQuestion[];
  checklist?: ChecklistItem[];
}

export interface HandoutConfig {
  module: HandoutModule;
  title: string;
  subtitle: string;
  icon: string; // lucide icon name
  sections: HandoutSection[];
  leverCount: number;
}

export const handoutConfigs: Record<HandoutModule, HandoutConfig> = {
  overordnet: {
    module: 'overordnet',
    title: 'Målsætning 12 mdr.',
    subtitle: 'Dit overordnede mål for forretningen',
    icon: 'Compass',
    leverCount: 0,
    sections: [
      {
        title: 'Nuværende situation',
        questions: [
          { key: 'nuvaerende_situation', label: 'Hvad er din nuværende situation i forretningen?', type: 'textarea' },
          { key: 'arbejdstid', label: 'Hvor meget arbejder du på nuværende tidspunkt?', type: 'textarea' },
          { key: 'utilfreds', label: 'Hvad er du utilfreds over, ved din nuværende situation?', type: 'textarea' },
          { key: 'konsekvenser_liv', label: 'Hvilke konsekvenser har din nuværende situation i din forretning for dit liv?', type: 'textarea' },
          { key: 'stoerste_flaskehals', label: 'Hvad er den største flaskehals lige nu?', type: 'textarea' },
        ],
      },
      {
        title: 'Mål for din forretning',
        questions: [
          { key: 'maal_forretning', label: 'Hvad er dit mål med din forretning?', type: 'textarea' },
          { key: 'fremtidig_arbejdstid', label: 'Hvor meget vil du gerne arbejde i fremtiden?', type: 'textarea' },
          { key: 'betydning_liv', label: 'Hvad vil det betyde for dit liv?', type: 'textarea' },
          { key: 'anderledes', label: 'Hvordan er det anderledes fra din nuværende situation?', type: 'textarea' },
          { key: 'lykkedes_12mdr', label: 'Om 12 måneder er vi lykkedes, hvis…', type: 'textarea' },
          { key: 'vigtigste_indikator', label: 'Hvad er den vigtigste indikator på, at vi er på ret vej?', type: 'textarea' },
          { key: 'anderledes_hverdag', label: 'Hvad skal være anderledes i hverdagen?', type: 'textarea' },
        ],
      },
      {
        title: 'Motivationsark',
        questions: [
          { key: 'konsekvenser_forretning_liv', label: 'Hvad har min nuværende situation i forretningen af konsekvenser for mit liv?', type: 'textarea' },
          { key: 'konsekvenser_ingen_aendring', label: 'Hvad får det ultimativt af konsekvenser, hvis ikke jeg ændrer noget?', type: 'textarea' },
          { key: 'motivation_give_op', label: 'Hvad motiverer mig, næste gang jeg får lyst til at give op?', type: 'textarea' },
          { key: 'stop_med_at_goere', label: 'Hvad skal jeg stoppe med at gøre, for at nå målet?', type: 'textarea' },
        ],
      },
    ],
  },
  bogholderi: {
    module: 'bogholderi',
    title: 'Bogholderi',
    subtitle: 'Få styr på dine tal og økonomistyring',
    icon: 'Calculator',
    leverCount: 4,
    sections: [
      {
        title: 'Din nuværende situation',
        questions: [
          { key: 'nuvaerende_situation', label: 'Beskriv din nuværende situation for dit bogholderi:', type: 'textarea' },
          { key: 'hvem_bogfoerer', label: 'Hvem bogfører for dig?', type: 'textarea' },
          { key: 'betaling_regninger', label: 'Hvordan betaler du dine regninger?', type: 'textarea' },
          { key: 'bilag', label: 'Hvordan gemmer du dine bilag?', type: 'textarea' },
          { key: 'kigger_paa_tal', label: 'Hvor ofte kigger du på dine tal?', type: 'textarea' },
          { key: 'beslutninger', label: 'Hvordan træffer du beslutninger i din forretning?', type: 'textarea' },
        ],
      },
      {
        title: 'Målet med dit bogholderi',
        questions: [
          { key: 'maal_bogholderi', label: 'Hvad er dit mål for dit bogholderi?', type: 'textarea' },
        ],
        checklist: [
          { key: 'automatiseret_bilag', label: 'Jeg har automatiseret mine bilag (f.eks. med Pleo eller Kontolink)' },
          { key: 'forstaar_resultatopgoerelse', label: 'Jeg forstår min resultatopgørelse' },
          { key: 'kender_noegletal', label: 'Jeg kender mine vigtigste nøgletal', hasFollowUp: 'Hvilke?' },
          { key: 'beslutning_baseret_paa_tal', label: 'Jeg har truffet en beslutning baseret på et tal', hasFollowUp: 'Forklar:' },
          { key: 'bogfoering_outsources', label: 'Jeg har sat min bogføring op til at kunne outsources' },
          { key: 'maanedlig_rapportering', label: 'Jeg laver en månedlig rapportering til mig selv' },
        ],
      },
      {
        title: 'Løftestænger og refleksioner',
        questions: [
          { key: 'vigtigste_skridt', label: 'Det vigtigste skridt lige nu, for at jeg kan nå mit mål for mit bogholderi er:', type: 'textarea' },
          { key: 'vaner', label: 'Jeg har besluttet at ændre følgende vaner:', type: 'numbered_list', count: 2 },
        ],
      },
    ],
  },
  administration: {
    module: 'administration',
    title: 'Administration',
    subtitle: 'Optimér din drift og dine processer',
    icon: 'Settings',
    leverCount: 4,
    sections: [
      {
        title: 'Din nuværende situation',
        questions: [
          { key: 'nuvaerende_situation', label: 'Beskriv, hvordan din drift faktisk fungerer i dag:', type: 'textarea' },
          { key: 'systemer', label: 'Hvilke systemer bruger I (fx opgavesystem, CRM, lager, kalender)?', type: 'textarea' },
          { key: 'flaskehalse', label: 'Hvor opstår flaskehalse eller dobbeltarbejde?', type: 'textarea' },
          { key: 'prioritering', label: 'Hvordan prioriterer I opgaver lige nu?', type: 'textarea' },
          { key: 'opfoelgning_kpi', label: 'Hvor ofte følger I op på status og KPI\'er i driften?', type: 'textarea' },
        ],
      },
      {
        title: 'Målet med din administration',
        questions: [
          { key: 'maal_administration', label: 'Hvad er dit mål for driften i din virksomhed? Skriv kort og konkret:', type: 'textarea' },
        ],
        checklist: [
          { key: 'opgavesystem', label: 'Der findes ét primært opgavesystem til alt arbejde' },
          { key: 'sop', label: 'Processer er beskrevet i simple SOP\'er (max 1 side pr. proces)' },
          { key: 'automatiseret', label: 'Gentagne opgaver er automatiseret (fx Make/Zapier, skabeloner)', hasFollowUp: 'Hvilke?' },
          { key: 'ugentlig_rytme', label: 'Fast ugentlig driftsrytme' },
          { key: 'kpi_maales', label: 'Enkle KPI\'er måles og deles' },
          { key: 'onboarding_standard', label: 'Onboarding af kunder/ordrer er standardiseret' },
        ],
      },
      {
        title: 'Løftestænger og refleksioner',
        questions: [
          { key: 'vigtigste_skridt', label: 'Det vigtigste næste skridt for at nå mit driftsmål er:', type: 'textarea' },
          { key: 'vaner', label: 'Vaner jeg ændrer fra i dag:', type: 'numbered_list', count: 2 },
        ],
      },
    ],
  },
  salg: {
    module: 'salg',
    title: 'Salg',
    subtitle: 'Styrk din salgsproces og pipeline',
    icon: 'Handshake',
    leverCount: 4,
    sections: [
      {
        title: 'Din nuværende situation',
        questions: [
          { key: 'nuvaerende_situation', label: 'Beskriv, hvordan jeres salg faktisk foregår i dag:', type: 'textarea' },
          { key: 'hvem_hvad', label: 'Hvem sælger I til, og hvad sælger I?', type: 'textarea' },
          { key: 'kanaler', label: 'Hvilke kanaler bruger I til at skabe henvendelser/møder (fx netværk, opsøgende, annoncer, partnerskaber)?', type: 'textarea' },
          { key: 'flaskehalse', label: 'Hvor opstår flaskehalse eller manglende opfølgning?', type: 'textarea' },
          { key: 'opfoelgning_noegletal', label: 'Hvor ofte følger I op på pipeline og nøgletal (møder, tilbud, hitrate, omsætning)?', type: 'textarea' },
        ],
      },
      {
        title: 'Målet med dit salg',
        questions: [
          { key: 'maal_salg', label: 'Hvad er dit mål for salget i din virksomhed? Skriv kort og konkret:', type: 'textarea' },
        ],
        checklist: [
          { key: 'idealkunde', label: 'Én tydelig idealkunde og et skarpt tilbud (værdi og pris er klare)' },
          { key: 'salgsproces_crm', label: 'Enkel salgsproces i få trin (lead → møde → tilbud → opfølgning → afslutning) samlet i ét CRM' },
          { key: 'leadmotor', label: 'Aktiv leadmotor: 1–2 kanaler der kører stabilt', hasFollowUp: 'Hvilke?' },
          { key: 'fast_rytme', label: 'Fast rytme: daglig opfølgning og ugentlig pipeline-gennemgang' },
          { key: 'skabeloner', label: 'Standard skabeloner (outreach, mødeagenda, tilbud, opfølgning)' },
          { key: 'aktivitetsmal', label: 'Klare aktivitetsmål (fx antal henvendelser/møder pr. uge)' },
          { key: 'synlige_noegletal', label: 'Synlige nøgletal (pipeline-værdi, hitrate, gennemsnitlig ordrestørrelse)' },
          { key: 'eftersalg', label: 'Systematisk efter-salg (opfølgning, mersalg, anbefalinger)' },
        ],
      },
      {
        title: 'Løftestænger og refleksioner',
        questions: [
          { key: 'vigtigste_skridt', label: 'Det vigtigste næste skridt for at nå mit salgs-mål er:', type: 'textarea' },
          { key: 'vaner', label: 'Vaner jeg ændrer fra i dag:', type: 'numbered_list', count: 2 },
        ],
      },
    ],
  },
  marketing: {
    module: 'marketing',
    title: 'Marketing',
    subtitle: 'Skab synlighed og resultater med din marketing',
    icon: 'Megaphone',
    leverCount: 4,
    sections: [
      {
        title: 'Din nuværende situation',
        questions: [
          { key: 'nuvaerende_situation', label: 'Beskriv, hvordan jeres marketing faktisk foregår i dag:', type: 'textarea' },
          { key: 'maalgruppe', label: 'Hvem prøver I at nå, og hvad vil I have dem til at gøre?', type: 'textarea' },
          { key: 'kanaler', label: 'Hvilke kanaler bruger I i dag (fx Meta/paid social, Google/SEO/Ads, e-mail, partner, events)?', type: 'textarea' },
          { key: 'maaler_fast', label: 'Hvad måler I fast (fx leads/køb pr. uge, pris pr. lead/køb, konverteringsrate)?', type: 'textarea' },
          { key: 'flaskehalse', label: 'Hvor opstår flaskehalse (trafik, klik → besøg, besøg → lead/køb, lead → møde, fravalg i checkout)?', type: 'textarea' },
        ],
      },
      {
        title: 'Målet med din marketing',
        questions: [
          { key: 'maal_marketing', label: 'Skriv kort og konkret, hvad marketing skal levere (og hvorfor det er vigtigt):', type: 'textarea' },
        ],
        checklist: [
          { key: 'maalgruppe_tilbud', label: 'Én tydelig målgruppe og et klart tilbud (værdi, pris, næste skridt)' },
          { key: 'sporing', label: 'Fast sporing af 4–5 kernehændelser i funnel (besøg → produktside/ydelse → kurv/kontakt → checkout/booking → køb/lead)' },
          { key: 'primaere_kanaler', label: '1–2 primære kanaler valgt som "motor"', hasFollowUp: 'Hvilke?' },
          { key: 'navngivning', label: 'Fast navngivning/struktur til kampagner og rapporter (samme felter, samme navne – hver gang)' },
          { key: 'ugentlig_rapport', label: 'Ugentlig 1-side rapport: trafik, konverteringsprocenter trin for trin, pris pr. mål (lead/køb)' },
          { key: 'laering_rytme', label: 'Klar rytme for læring: test én ting ad gangen, evaluer hver uge, skrot eller skalér' },
          { key: 'samspil_salg', label: 'Samspil med salg/website: hurtig opfølgning på leads og løbende friktionsfix på sider/flows' },
          { key: 'ejer_adgang', label: 'Ejer adgang til konti og data (ingen "låste" efterladenskaber hos bureauer)' },
        ],
      },
      {
        title: 'Løftestænger og refleksioner',
        questions: [
          { key: 'vigtigste_skridt', label: 'Det vigtigste næste skridt for at nå mit marketing-mål er:', type: 'textarea' },
          { key: 'vaner', label: 'Vaner jeg ændrer fra i dag:', type: 'numbered_list', count: 2 },
        ],
      },
    ],
  },
};

export const moduleOrder: HandoutModule[] = ['overordnet', 'bogholderi', 'administration', 'salg', 'marketing'];
