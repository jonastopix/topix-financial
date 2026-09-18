/**
 * src/lib/ansoegning/mellemstykker.ts
 *
 * De små brudstykker MELLEM spørgsmålene, der fortæller hvad The Boardroom
 * er — vises efter en gruppe er færdig, aldrig midt i én. Tre stykker:
 * Mortens ansigt (efter virksomheden), sådan hjælper vi dig — sparring på
 * skrift i chatten, ikke møder (efter kontakt; Jonas 18/9), et medlemscitat
 * (efter de tre).
 *
 * INDHOLDET ER UDKAST TIL JONAS' GODKENDELSE (README §7). Teksten om
 * rådgiverne er theboardroom.dk's egen hero-tekst (læst 18/9), let
 * forkortet. Mødeteksten er et FORSLAG — jeg kender ikke mødeformen.
 * Citatet er JONAS' GODKENDTE (18/9, ordret): Daniel Sand, Founder & Ejer
 * af remm.dk. JONAS 18/9 kl. 10:10 (set på skærm): hele citatet blev en mur
 * i overskriftsstørrelse — nu kun de to første sætninger, som er dem der
 * sælger, i en mindre grad (AnsoegMellemstykke). Resten står som kommentar
 * ved CITAT_DANIEL_SAND, så det kan hentes frem et andet sted. Et
 * null-citat renderes ikke — stykket springes over.
 *
 * Portrættet er den statiske fil public/morten-larsen.jpg (1035×830),
 * som HbRaadgiverPortraetter allerede bruger på /auth — serveres uden login.
 * Citatets portræt (public/daniel-sand-remm.jpg, 200×200) følger samme mønster
 * og vises lille og rundt ved navnet (AnsoegMellemstykke), ikke over teksten.
 */

export interface Mellemstykke {
  id: "morten" | "moedet" | "citat";
  /** Vises efter denne skærm (indeks i SKAERME) er gemt. */
  efterSkaerm: number;
  eyebrow: string;
  titel: string;
  tekst: string | null;
  portraet?: { src: string; alt: string };
  /** Kun for citatet: hvem sagde det. null = intet citat endnu. */
  afsender?: string | null;
  /**
   * «Sådan hjælper vi dig» som PUNKTER med ikon (Jonas 18/9, prøven pkt. 3: stykket skal være
   * mere visuelt). Teksten er Jonas' godkendte to afsnit, ét pr. punkt, ordret; kun de korte
   * overskrifter er nye (UDKAST til Jonas' godkendelse). Sat → renderes som to plader med ikon
   * i stedet for én tekst; `tekst` er stadig samme ord (til alt/tekst-fald).
   */
  punkter?: ReadonlyArray<{ ikon: "chat" | "tal"; overskrift: string; tekst: string }>;
}

/**
 * Daniel Sands citat — de to første sætninger, ordret (Jonas 18/9 kl. 10:10).
 * HELE citatet, godkendt ordret 18/9, til brug et andet sted:
 *   «The Boardroom har givet mig ro i maven, når jeg skal træffe større
 *   økonomiske beslutninger for remm. I mine tidligere virksomheder har jeg
 *   altid haft en økonomiansvarlig med, så da jeg for første gang selv skulle
 *   stå for administration og økonomi, følte jeg mig virkelig på dybt vand.
 *   Allerede efter tre måneder i forløbet har jeg fået en struktur på plads,
 *   der gør, at jeg forstår virksomhedens økonomi, budgetter og likviditet
 *   bedre, end jeg nogensinde har gjort før. Jeg kan varmt anbefale The
 *   Boardroom til andre soloiværksættere, som står samme sted som mig.»
 *   — Daniel Sand, Founder & Ejer af remm.dk
 */
export const CITAT_DANIEL_SAND =
  "The Boardroom har givet mig ro i maven, når jeg skal træffe større økonomiske beslutninger for remm. I mine tidligere virksomheder har jeg altid haft en økonomiansvarlig med, så da jeg for første gang selv skulle stå for administration og økonomi, følte jeg mig virkelig på dybt vand.";

export const MELLEMSTYKKER: readonly Mellemstykke[] = [
  {
    id: "morten",
    efterSkaerm: 3,
    eyebrow: "Hvem du taler med",
    titel: "Morten Larsen",
    tekst:
      "Rådgiver i The Boardroom sammen med Jonas Herlev. To rådgivere, der har bygget, drevet og solgt virksomheder — og som har dine tal ved hånden, fordi du uploader dem hver måned.",
    portraet: { src: "/morten-larsen.jpg", alt: "Morten Larsen" },
  },
  {
    // Jonas 18/9 (godkendt ordret): rådgivningen er ikke møder — det er sparring
    // på skrift i medlemmets personlige chat med Morten og Jonas. Sessionerne
    // nævnes IKKE her. «der selv har bygget, drevet og solgt virksomheder» er
    // med vilje udeladt: det står allerede i Morten-stykket og må ikke gentages.
    id: "moedet",
    efterSkaerm: 5,
    eyebrow: "Sådan hjælper vi dig",
    titel: "",
    tekst:
      "En pris, en ansættelse, et tilbud du er i tvivl om. Du skriver til Morten og Jonas, når det opstår — ikke når kalenderen siger, det er tid.\nDe har dine tal ved hånden, fordi du uploader dem hver måned. Så begynder ingen samtale forfra.",
    // Prøven 18/9, pkt. 3: de to afsnit som to plader med ikon — chatten (du skriver, når det
    // opstår) og tallene (de ligger klar). Overskrifterne er UDKAST; afsnittene er ordret Jonas'.
    punkter: [
      { ikon: "chat", overskrift: "Du skriver, når det opstår", tekst: "En pris, en ansættelse, et tilbud du er i tvivl om. Du skriver til Morten og Jonas, når det opstår — ikke når kalenderen siger, det er tid." },
      { ikon: "tal", overskrift: "Dine tal ligger klar", tekst: "De har dine tal ved hånden, fordi du uploader dem hver måned. Så begynder ingen samtale forfra." },
    ],
  },
  {
    id: "citat",
    efterSkaerm: 8,
    eyebrow: "Et medlem siger",
    titel: "",
    tekst: CITAT_DANIEL_SAND,
    afsender: "Daniel Sand, Founder & Ejer af remm.dk",
    // Jonas 18/9: billede på citatet for troværdighed — et tillidsmærke ved navnet,
    // ikke et billede man ser på. Statisk fil i public/ som Mortens (200×200, 7 kB, ikke skaleret).
    portraet: { src: "/daniel-sand-remm.jpg", alt: "Daniel Sand, Founder & Ejer af remm.dk" },
  },
];

/** Stykket der skal vises efter en gemt skærm — eller null. Tomme citater vises ikke. */
export function mellemstykkeEfter(skaerm: number): Mellemstykke | null {
  const m = MELLEMSTYKKER.find((s) => s.efterSkaerm === skaerm);
  if (!m) return null;
  if (m.id === "citat" && !m.tekst) return null;
  return m;
}
