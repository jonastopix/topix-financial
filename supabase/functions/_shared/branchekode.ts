/**
 * supabase/functions/_shared/branchekode.ts
 *
 * Ren motor: udleder app-taksonomiens industry_code (+ label) af den
 * branchekode CVR-registret bærer. docs/indgangen-overhaling.md §6 og §9
 * trin 1. Ingen I/O, ingen Supabase, ingen React — samme input giver altid
 * samme output. Eneste import er taksonomien i ./brancher (labels slås op
 * dér, så Settings og motoren deler én kilde).
 *
 * Spejlet ordret fra src/lib/branchekode.ts — enhver ændring her SKAL
 * også laves der. Importstien (./brancher vs.
 * ./brancher.ts) er den eneste tilladte forskel, som i fornyelse.ts.
 * Pariteten håndhæves af src/lib/__tests__/branchekodeParitet.test.ts,
 * som kører hele DB25-fixturen gennem begge kopier. Aftageren er
 * byggVirksomhedsRaekke (src/lib/virksomhedsraekke.ts og Deno-spejlet),
 * §9 trin 4.
 *
 * REGISTRET ER DB25, IKKE DB07 — målt 3/9 2026. §6 taler om DB07, men CVR
 * skiftede 1/1 2025 til Dansk Branchekode 2025 (DB25, dansk underopdeling
 * af NACE rev. 2.1). Stikprøver mod cvrapi.dk 3/9: 478100 (Semler Mobility
 * Retail, «Detailhandel med motorkøretøjer»), 953190 (Bilhuset Frederiksen,
 * «Reparation og vedligeholdelse af motorkøretøjer i.a.n.»), 562200 (Meyers)
 * — koder der KUN findes i DB25 (DB07 havde bilhandel i afdeling 45, som er
 * nedlagt i DB25). Alle nye virksomheder får derfor en DB25-kode i
 * application_context.raw_cvr_data. Tabellerne her følger DB25's 87
 * afdelinger og 738 underklasser (fixture src/lib/__fixtures__/
 * db25-branchekoder.txt, hentet fra Danmarks Statistik 3/9 2026). DB07-koder
 * fra før 2025 (fx afdeling 45) er IKKE understøttet og giver null eller
 * afdelingens standard — de findes kun på virksomheder der er oprettet før
 * skiftet, og dem backfyldte migration 20260329212047 allerede.
 *
 * Opslaget går fra det mest specifikke niveau til det groveste:
 *   6 cifre (underklasse) → 4 cifre (klasse) → 3 cifre (gruppe) → 2 cifre
 *   (afdeling). Første niveau der HAR en post afgør — også når posten er
 *   null. Så kan en undtagelse både pege på en anden underkategori og
 *   fravælge afdelingens standard.
 *
 * Besluttet (Jonas 3/9): rammer mappingen ikke, er svaret null, og BEGGE
 * felter står tomme. Der sættes ALDRIG other_general som fald tilbage — en
 * grov sammenligning der ser rigtig ud, men er tilfældig, er værre end
 * ingen, fordi ingen opdager den. Tjeklisten spørger i stedet medlemmet.
 * Samme princip bag hver null-post nedenfor: en post er kun udfyldt hvor
 * underkategoriens label rammer branchen som DB25 selv beskriver den, så
 * benchmark-tallene (bruttomargin, EBITDA-margin) har en chance for at
 * ligne virksomhedens økonomi. Formidlingsklasserne, som DB25 indførte
 * (platforme der formidler andres handel/transport/ydelser mod gebyr), står
 * derfor konsekvent som null: en platform har ikke en butiks, en vognmands
 * eller en kliniks marginstruktur.
 *
 * Underkategorier motoren aldrig returnerer, fordi DB25 ikke kan skelne dem:
 * tech_startup (et stadie, ikke en branche), travel_event, other_general.
 */

import { findBranche } from "./brancher.ts";

export interface Branchekode {
  /** Nøgle i app-taksonomien = companies.industry_code = industry_benchmarks.industry_code. */
  industry_code: string;
  /** Taksonomiens label for koden — samme tekst Settings lægger i companies.industry_label. */
  industry_label: string;
}

type Mapping = Record<string, string | null>;

/**
 * Afdelingsniveau (2 cifre). ALLE 87 DB25-afdelinger står her, også dem der
 * bevidst giver null, så en glemt afdeling aldrig kan forveksles med en
 * fravalgt (testen kræver at fixture-afdelinger og nøgler her er samme sæt).
 */
export const DB25_AFDELINGER: Mapping = {
  // ── A. Landbrug, jagt, skovbrug og fiskeri ─────────────────────────────
  "01": "agriculture_general", // Plante- og husdyravl, jagt — taksonomiens «Landbrug, gartneri og natur».
  "02": "agriculture_general", // Skovbrug og skovning — primærerhverv, samme kategori.
  "03": "agriculture_general", // Fiskeri og akvakultur — primærerhverv («natur»).
  // ── B. Råstofindvinding ────────────────────────────────────────────────
  "05": null, // Kul — ingen kategori.
  "06": null, // Råolie og naturgas — ingen kategori.
  "07": null, // Metalmalme — ingen kategori.
  "08": null, // Grus, sand, sten — ingen kategori; ikke «produktion», det er udvinding.
  "09": null, // Støtte til råstofindvinding — ingen kategori.
  // ── C. Fremstillingsvirksomhed ─────────────────────────────────────────
  // DB25's hovedafdeling C hedder «Fremstillingsvirksomhed» og svarer til
  // taksonomiens gruppe «Produktion og fremstilling». Underkategorien er
  // production_industrial for alt undtagen fødevarer (10-11) og de få
  // klasser der i Danmark næsten kun er håndværksværksteder (se DB25_KLASSER).
  "10": "production_food", // Fremstilling af fødevarer.
  "11": "production_food", // Drikkevarer — bryggerier, destillerier, saft; «Fødevareproduktion» dækker føde- OG drikkevarer i DST's egen gruppering (10-12 = «Føde-, drikke- og tobaksvareindustri»).
  "12": "production_industrial", // Tobaksvarer — industriel fremstilling; ikke fødevare.
  "13": "production_industrial", // Tekstiler.
  "14": "production_industrial", // Beklædningsartikler.
  "15": "production_industrial", // Lædervarer og fodtøj.
  "16": "production_industrial", // Træ og varer af træ.
  "17": "production_industrial", // Papir og papirvarer.
  "18": "production_industrial", // Trykning — trykkerier er fremstilling i DB25, ikke reklame.
  "19": "production_industrial", // Koks og raffinerede olieprodukter.
  "20": "production_industrial", // Kemiske produkter.
  "21": "production_industrial", // Farmaceutiske råvarer og præparater.
  "22": "production_industrial", // Gummi og plast.
  "23": "production_industrial", // Glas, keramik, beton, sten — undtagen 23.41 (se klasser).
  "24": "production_industrial", // Basismetaller.
  "25": "production_industrial", // Færdige metalprodukter — maskinværksteder, smede, metalkonstruktion.
  "26": "production_industrial", // Computere, elektronik, optik.
  "27": "production_industrial", // Elektrisk udstyr.
  "28": "production_industrial", // Maskiner og udstyr.
  "29": "production_industrial", // Motorkøretøjer, påhængsvogne.
  "30": "production_industrial", // Andre transportmidler — skibe, både, cykler.
  "31": "production_industrial", // Møbler — DB25 har kun én klasse (31.00); møbelsnedker og møbelfabrik kan ikke skilles på koden, så afdelingens standard gælder.
  "32": "production_industrial", // Andre fremstillingsaktiviteter — undtagen 32.12 og 32.20 (se klasser).
  "33": "trades_other", // Reparation, vedligeholdelse og installation af maskiner — servicearbejde på andres udstyr, ikke fremstilling: «Anden håndværksservice».
  // ── D/E. Forsyning, vand, affald ───────────────────────────────────────
  "35": null, // El-, gas- og fjernvarmeforsyning — ingen kategori.
  "36": null, // Vandforsyning — ingen kategori.
  "37": null, // Spildevand — ingen kategori.
  "38": null, // Affald og genbrug — ingen kategori; ikke «rengøring».
  "39": null, // Rensning af jord — ingen kategori.
  // ── F. Bygge og anlæg ──────────────────────────────────────────────────
  "41": "construction_contractor", // Opførelse af bygninger — entreprenører (byggeprojekter for salg er flyttet til 68.12 i DB25).
  "42": "construction_contractor", // Anlægsarbejder — veje, ledningsnet, havne.
  "43": "construction_craft", // Specialiserede bygge- og anlægsaktiviteter — tømrer, murer, tag, nedrivning; el/VVS og maler/gulv har egne underkategorier (se klasser).
  // ── G. Handel ──────────────────────────────────────────────────────────
  "46": "wholesale_general", // Engroshandel — undtagen agenturhandel 46.1 (se grupper).
  "47": "retail_other", // Detailhandel — «Anden detailhandel» hvor varegruppen ikke har egen underkategori; DB25 skelner ikke længere butik/webshop, så webshops lander her efter varegruppe.
  // ── H. Transport ───────────────────────────────────────────────────────
  "49": "transport_freight", // Landtransport — vognmænd, flytning, rør; passagertransport 49.1/49.3 har egen underkategori (se grupper).
  "50": "transport_freight", // Skibsfart — gods; passagerer 50.10/50.30 (se klasser).
  "51": "transport_freight", // Luftfart — fragt; passagerer 51.10 (se klasser).
  "52": "transport_freight", // Oplagring og støtte til transport — lagerhoteller, spedition (52.26), godshåndtering: «Varetransport og spedition».
  "53": "transport_freight", // Post og kurér — pakkedistribution er varetransport.
  // ── I. Overnatning og restauration ─────────────────────────────────────
  "55": null, // Hoteller, ferieboliger, camping — ingen kategori; et hotel har ikke et rejsebureaus marginstruktur (travel_tour ville se rigtig ud, men være tilfældig).
  "56": "food_restaurant", // Restaurationsaktiviteter — restauranter, caféer, barer; takeaway og catering har egne poster (se klasser/underklasser).
  // ── J. Information og kommunikation ────────────────────────────────────
  "58": null, // Udgiveraktiviteter — bog-, avis- og bladforlag har ingen kategori; softwareudgivelse 58.2 er tech (se klasser).
  "59": "creative_photo", // Film, video, TV-produktion — «Foto og video»; lyd/musik og biografer (se klasser).
  "60": null, // Radio, TV, nyhedsbureauer, streaming-distribution — ingen kategori.
  "61": null, // Telekommunikation — ingen kategori; teleudbydere er ikke «IT-drift og support».
  "62": "tech_software", // Computerprogrammering (62.10) er standarden; konsulentbistand/drift 62.20 og 62.90 er support (se klasser).
  "63": null, // IT-infrastruktur og informationsaktiviteter — hosting (63.10) og portaler (63.91) mappes i klasser; 63.92 «andre informationsaktiviteter» er for bred.
  // ── K. Finans ──────────────────────────────────────────────────────────
  "64": "finance_general", // Finansielle tjenesteydelser — leasing, kreditformidling; holding- og investeringsselskaber 64.2/64.3 er fravalgt (se grupper).
  "65": "finance_general", // Forsikring og pension.
  "66": "finance_general", // Hjælp til finans og forsikring — mæglere, agenter, formueforvaltning.
  // ── L. Fast ejendom ────────────────────────────────────────────────────
  "68": "realestate_rental", // Udlejning og administration af fast ejendom er standarden; køb/salg og byggeprojekter → udvikling, mæglere → mægling (se klasser).
  // ── M. Liberale, videnskabelige og tekniske erhverv ────────────────────
  "69": null, // Afdelingen rummer to underkategorier — advokater (69.10) og revision/bogføring (69.20) — så kun klasserne afgør; ingen standard.
  "70": "consulting_management", // Virksomhedsrådgivning og ledelsesrådgivning; hovedsæder 70.10 er fravalgt (se klasser).
  "71": "construction_consulting", // Arkitekter og rådgivende ingeniører — «Arkitektur og rådgivning»; teknisk afprøvning 71.20 er fravalgt (se klasser).
  "72": null, // Videnskabelig forskning og udvikling — ingen kategori.
  "73": "creative_advertising", // Reklamebureauer og medieindrykning — «Reklame og design»; markedsanalyse og PR er marketing (se klasser).
  "74": null, // Andre liberale erhverv — design (74.1) og foto (74.20) mappes i grupper/klasser; oversættelse, patentbureauer og «i.a.n.» har ingen kategori.
  "75": "health_clinic", // Dyrlæger — en dyrlægeklinik er «Klinik og behandling».
  // ── N. Administrative tjenesteydelser ──────────────────────────────────
  "77": null, // Udlejning og leasing af biler, maskiner, udstyr — ingen kategori (ikke ejendomsudlejning).
  "78": "consulting_hr", // Arbejdsformidling — rekruttering; vikarbureauer 78.20 er fravalgt (se klasser).
  "79": "travel_tour", // Rejsebureauer og rejsearrangører; andre reservationstjenester 79.90 er fravalgt (se klasser).
  "80": null, // Vagt og sikkerhed — ingen kategori.
  "81": "trades_cleaning", // Rengøring og ejendomsservice — «Rengøring og facility»; landskabspleje 81.30 er håndværk (se klasser).
  "82": null, // Kontorservice, callcentre, messer, inkasso, pakkerier, «i.a.n.» — for bred; ingen kategori rammer.
  // ── O-Q. Offentlig, undervisning, sundhed, social ──────────────────────
  "84": null, // Offentlig forvaltning — ingen kategori.
  "85": "education_general", // Undervisning — skoler, kurser, køreskoler, sportsundervisning.
  "86": "health_clinic", // Sundhedsvæsen — læger, tandlæger, fysioterapeuter, psykologer, alternative behandlere: «Klinik og behandling».
  "87": null, // Institutionsophold — plejehjem, bosteder; ikke klinik.
  "88": null, // Sociale foranstaltninger uden ophold — dagpleje, hjemmehjælp; ingen kategori.
  // ── R. Kultur, forlystelser og sport ───────────────────────────────────
  "90": null, // Kunstnerisk skaben (90.1) har ingen kategori; scenekunst og eventteknik mappes i klasser/underklasser.
  "91": null, // Biblioteker, museer, zoo — ingen kategori.
  "92": null, // Lotteri og spil — ingen kategori.
  "93": null, // Sport, forlystelser og fritid — sportsanlæg, klubber og fitnesscentre mappes i klasser; forlystelser har ingen kategori.
  // ── S-U. Andre serviceydelser, husholdninger, eksterritoriale ──────────
  "94": null, // Organisationer og foreninger — ingen kategori.
  "95": "trades_other", // Reparation af varer og køretøjer — autoværksteder, skomagere, urmagere: «Anden håndværksservice»; computerreparation er IT-support (se klasser).
  "96": null, // Personlige serviceydelser — frisører, vaskerier, bedemænd har ingen kategori; skønhedspleje og dagspa mappes i klasser.
  "97": null, // Husholdninger med ansat medhjælp.
  "98": null, // Husholdningers produktion til eget brug.
  "99": null, // Eksterritoriale organisationer — også DB25's «uoplyst» 99.00.
};

/** Gruppeniveau (3 cifre) — hvor en hel gruppe afviger fra afdelingens standard. */
export const DB25_GRUPPER: Mapping = {
  "461": null, // Agenturhandel på honorar/kontrakt — handelsagenter lever af provision (bruttomargin nær 100 %), ikke af varesalg; en engros-benchmark ville se rigtig ud, men være tilfældig.
  "472": "retail_grocery", // Specialbutikker med føde-, drikke- og tobaksvarer — slagter, bager, vinhandel, fiskehandel: «Dagligvarer og fødevarer».
  "478": "retail_automotive", // Detailhandel med motorkøretøjer, reservedele og motorcykler — DB25's afløser for DB07's afdeling 45: «Biler og køretøjer».
  "479": null, // Formidlingsaktiviteter inden for detailhandel — markedspladser/platforme mod gebyr, ikke butikker.
  "491": "transport_passenger", // Passagertransport med jernbane.
  "493": "transport_passenger", // Anden landpassagertransport — busser, taxi, kørsel med chauffør.
  "642": null, // Holdingselskaber og conduits — et holdingselskab driver ingen forretning; finans-benchmarks ville være meningsløse. Meget udbredt i DK (ApS-holdings).
  "643": null, // Investeringsfonde og truster — passive investeringsenheder, ikke driftsvirksomheder.
  "741": "creative_advertising", // Specialiseret designarbejde — industrielt design, modedesign, grafisk design, indretning: «Reklame og design».
  "901": null, // Kunstnerisk skaben — forfattere, komponister, billedkunstnere; «Musik og underholdning» rammer ikke en billedkunstner.
};

/** Klasseniveau (4 cifre) — undtagelser hvor to eller tre cifre er for groft. */
export const DB25_KLASSER: Mapping = {
  // C. Håndværksproduktion: klasser der i Danmark næsten udelukkende er enkeltmandsværksteder.
  "2341": "production_craft", // Keramiske husholdningsartikler og pyntegenstande — pottemagere og keramikere.
  "3212": "production_craft", // Smykker og lignende varer — guldsmede.
  "3220": "production_craft", // Musikinstrumenter — instrumentmagere.
  // F. Installation og færdiggørelse med egen underkategori.
  "4321": "trades_electrical", // El-installation — «El, VVS og ventilation».
  "4322": "trades_electrical", // VVS, varme og klimaanlæg — «El, VVS og ventilation».
  "4333": "trades_painter", // Gulvbelægning og vægbeklædning — «Maler og gulv».
  "4360": null, // Formidling af specialiserede byggeydelser — platform, ikke håndværk.
  // G. Detailhandel efter varegruppe.
  "4711": "retail_grocery", // Ikke-specialiseret med hovedvægt på fødevarer — supermarkeder, købmænd, kiosker.
  "4740": "retail_electronics", // Informations- og kommunikationsudstyr — computere, telefoner, TV/audio.
  "4753": "retail_furniture", // Tæpper, vægbeklædning og gulvbelægning — «Møbler og interiør».
  "4754": "retail_electronics", // Elektriske husholdningsapparater — hvidevarer.
  "4755": "retail_furniture", // Møbler, belysning, køkkenudstyr, boligtekstiler — «Møbler og interiør».
  "4763": "retail_sport", // Sportsudstyr, cykler, lystbåde — «Sport og fritid».
  "4771": "retail_fashion", // Beklædning — «Tøj og accessories».
  "4772": "retail_fashion", // Fodtøj og lædervarer — accessories.
  "4773": "health_pharmacy", // Farmaceutiske produkter — apoteker.
  "4774": "health_pharmacy", // Medicinske og ortopædiske artikler — «Apotek og helse»; optikere skilles ud på 47.74.10 (se underklasser).
  "4777": "retail_fashion", // Ure og smykker — accessories.
  // H. Passagertransport til søs og i luften; formidling og rumfart fravalgt.
  "5010": "transport_passenger", // Sø- og kysttransport af passagerer — færger.
  "5030": "transport_passenger", // Passagerer ad indre vandveje.
  "5110": "transport_passenger", // Lufttransport af passagerer.
  "5122": null, // Rumfart — ingen kategori.
  "5232": null, // Formidling af passagertransport — billetplatforme.
  "5330": null, // Formidling af post og kurér — platform.
  // I. Restauration: catering og takeaway; formidling fravalgt.
  "5612": "food_takeaway", // Mobile madboder — food trucks: «Takeaway og levering».
  "5621": "food_catering", // Event catering.
  "5622": "food_catering", // Catering på kontrakt (kantiner) og andre restaurationsaktiviteter.
  "5640": null, // Formidling af restaurationsaktiviteter — bestillingsplatforme.
  // J. Software, lyd, biograf, IT-drift, hosting, portaler.
  "5821": "tech_software", // Udgivelse af videospil.
  "5829": "tech_software", // Anden udgivelse af software — SaaS-produkter registreres ofte her.
  "5914": "creative_music", // Fremvisning af film — biografer er «underholdning», ikke videoproduktion.
  "5920": "creative_music", // Lydoptagelser og musikudgivelse.
  "6220": "tech_support", // Computerkonsulentbistand OG forvaltning af computerfaciliteter — DB25 slog rådgivning og drift sammen; klassen er drift/rådgivning om systemer, ikke udvikling (det er 62.10).
  "6290": "tech_support", // Andre IT- og computerserviceaktiviteter.
  "6310": "tech_support", // IT-infrastruktur, databehandling, hosting — «IT-drift og support».
  "6391": "tech_software", // Drift af portaler til internettet — søgemaskiner, sammenligningssider: digitale produkter.
  // K. Fravalgt inden for finans.
  "6411": null, // Centralbanker.
  // L. Fast ejendom.
  "6811": "realestate_development", // Køb og salg af egen fast ejendom.
  "6812": "realestate_development", // Gennemførelse af byggeprojekter (for salg) — DB07's 41.10 flyttede hertil.
  "6831": "realestate_agency", // Ejendomsmæglere og boliganvisning.
  // M. Rådgivning.
  "6910": "consulting_legal", // Juridiske aktiviteter — advokater.
  "6920": "consulting_finance", // Bogføring, revision, skatterådgivning.
  "7010": null, // Hovedsæders aktiviteter — koncernhovedkontorer, ikke rådgivning.
  "7120": null, // Teknisk afprøvning og analyse — laboratorier og kontrol, ikke arkitekt-/ingeniørrådgivning.
  "7320": "consulting_marketing", // Markedsanalyse og meningsmåling — «Marketing og kommunikation».
  "7330": "consulting_marketing", // Public relations og kommunikation — DB07's 70.21 flyttede hertil.
  "7420": "creative_photo", // Fotografiske aktiviteter.
  // N. Administrative tjenesteydelser.
  "7820": null, // Vikarbureauer — vikarløn løber gennem omsætningen, så bruttomarginen er en helt anden end rekrutteringens.
  "7990": null, // Andre reservationstjenester — turistinformation, billetbureauer, timeshare; ikke rejsebureau.
  "8130": "trades_other", // Landskabspleje — anlægsgartnere er et håndværksfag, ikke landbrug.
  // P-Q. Fravalgt inden for undervisning og sundhed.
  "8561": null, // Formidling af kurser og undervisere — platform.
  "8692": null, // Patienttransport med ambulance — ikke klinik.
  "8697": null, // Formidling af sundhedsydelser — platform.
  // R. Scenekunst og sport.
  "9020": "creative_music", // Teater- og koncertproduktioner, udøvende scenekunstnere — «Musik og underholdning».
  "9031": "creative_music", // Drift af teater- og koncertsale, kulturhuse.
  "9311": "health_fitness", // Drift af sportsanlæg — padel-, tennis- og svømmecentre: «Træning og fitness».
  "9312": "health_fitness", // Drift af sportsklubber.
  "9313": "health_fitness", // Drift af fitnesscentre.
  // S. Personlige serviceydelser og reparation.
  "9510": "tech_support", // Reparation af computere og kommunikationsudstyr — «IT-drift og support».
  "9540": null, // Formidling af reparationsydelser — platform.
  "9622": "health_clinic", // Skønhedspleje — kosmetologer, hudpleje: behandling.
  "9623": "health_clinic", // Dagspa, sauna, wellness-massage — behandling/velvære.
};

/** Underklasseniveau (6 cifre) — hvor selv fire cifre er for groft. */
export const DB25_UNDERKLASSER: Mapping = {
  "433410": "trades_painter", // Maleraktiviteter — «Maler og gulv»; søsteren 43.34.20 (glarmestre) bliver ved afdelingens construction_craft.
  "477410": "health_optician", // Optikeraktiviteter — «Optiker og synspleje»; resten af 47.74 er «Apotek og helse».
  "561190": "food_takeaway", // Drift af øvrige spisesteder — DB25's egen note: «hovedvægten ligger på takeaway: isbarer, grillbarer, fastfood, smørrebrød».
  "649910": null, // Investering for egen regning — passiv formueplacering, ikke finansiel virksomhed.
  "903910": "transport_event", // Teknisk planlægning, levering, opsætning og betjening af udstyr til events — lyd, lys, scene: «Eventlogistik og specialtransport».
};

/**
 * Normaliserer det CVR-registret sender. cvrapi.dk leverer `industrycode`
 * som TAL (fx 682040), og hentCvrData gør det til streng — så en kode i
 * afdeling 01-09 mister sit foranstillede nul (01.11.00 → 11100). Fem cifre
 * kan derfor kun være et tabt nul og fyldes op. Punktummer (68.20.40) og
 * mellemrum fjernes. Under to cifre eller over seks er ikke en branchekode.
 */
export function normaliserBranchekode(raa: string | number | null | undefined): string | null {
  if (raa === null || raa === undefined) return null;
  const cifre = String(raa).replace(/\D/g, "");
  if (cifre.length === 5) return `0${cifre}`;
  if (cifre.length < 2 || cifre.length > 6) return null;
  return cifre;
}

/**
 * DB25-kode (2-6 cifre, med eller uden punktummer, streng eller tal) →
 * app-taksonomiens industry_code + label, eller null når intet rammer.
 */
export function udledBranchekode(raa: string | number | null | undefined): Branchekode | null {
  const kode = normaliserBranchekode(raa);
  if (!kode) return null;

  const niveauer: [number, Mapping][] = [
    [6, DB25_UNDERKLASSER],
    [4, DB25_KLASSER],
    [3, DB25_GRUPPER],
    [2, DB25_AFDELINGER],
  ];
  for (const [laengde, tabel] of niveauer) {
    if (kode.length < laengde) continue;
    const noegle = kode.slice(0, laengde);
    if (Object.prototype.hasOwnProperty.call(tabel, noegle)) {
      const industryCode = tabel[noegle];
      if (industryCode === null) return null;
      const branche = findBranche(industryCode);
      return branche ? { industry_code: branche.value, industry_label: branche.label } : null;
    }
  }
  return null;
}
