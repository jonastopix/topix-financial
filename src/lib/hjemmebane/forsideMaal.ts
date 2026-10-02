/**
 * Forsidens «Din plan» — hvilken af de tre tilstande, et medlem står i, og
 * ordene (2/10-2026 aften; Jonas' ja kl. 17:19 til mockuppen «Din plan i tre
 * tilstande»: «Ja den er fin»).
 *
 *   «maal»    — mindst ét AKTIVT, BEKRÆFTET mål: målkortene i Dine mål-sproget
 *               (statuschip, det store tal, banen med stregen, næste skridt).
 *               Ubekræftede forslag står som ÉN linje over kortene.
 *   «forslag» — ingen bekræftede, men mål, der venter på medlemmets ja: ÉT
 *               roligt kort med titlerne og «Tag stilling» → /milestones.
 *               Behold/Slip bor på Dine mål — forsiden er ikke en
 *               administrationsliste (Jonas 2/10: «Den ser godt nok trist ud»).
 *   «tom»     — hverken bekræftede eller ventende mål: det mørke kort, der
 *               inviterer til det første mål (guiden åbnes på /milestones).
 *
 * REN: ingen React, ingen hentning. Kalderen giver tallene fra de domme, der
 * allerede findes (forsidePlanDom → maal.length; delBekraeftelser → forslag +
 * gamle; ventendeKvartalstjekAlle → længden). Intet regnes om her.
 */

export type ForsideMaalTilstand = "maal" | "forslag" | "tom";

export interface ForsideMaalInput {
  /** Aktive, bekræftede mål, forsiden viser (forsidePlanDom.maal.length). */
  bekraeftedeViste: number;
  /** Aktive mål, der venter på medlemmets ja (delBekraeftelser: forslag + gamle). */
  ubekraeftede: number;
}

export function forsideMaalTilstand(i: ForsideMaalInput): ForsideMaalTilstand {
  if (i.bekraeftedeViste > 0) return "maal";
  if (i.ubekraeftede > 0) return "forslag";
  return "tom";
}

/** Højst så mange titler i forslagskortet — resten er «og N mere». */
export const FORSLAG_TITLER_MAKS = 3;

export interface ForslagListe {
  titler: string[];
  flere: number;
}

/** Titlerne i forslagskortet: ældste først (som delBekraeftelser leverer dem), højst FORSLAG_TITLER_MAKS. */
export function forslagListe(maal: readonly { title: string }[]): ForslagListe {
  const titler = maal.slice(0, FORSLAG_TITLER_MAKS).map((m) => m.title.trim()).filter((t) => t !== "");
  return { titler, flere: Math.max(0, maal.length - FORSLAG_TITLER_MAKS) };
}

/** Søgeparameteren, der får /milestones til at åbne guiden «Sæt et mål» med det samme. */
export const SAET_MAAL_PARAM = "saet";
export const SAET_MAAL_VAERDI = "maal";
export const SAET_MAAL_STI = `/milestones?${SAET_MAAL_PARAM}=${SAET_MAAL_VAERDI}`;
/** Søgeparameteren, der åbner guiden «Gør målet skarpt» for ét gammelt mål på /milestones. */
export const SKARPT_PARAM = "skarpt";
export const skarptSti = (maalId: string): string => `/milestones?${SKARPT_PARAM}=${encodeURIComponent(maalId)}`;

export const FORSIDE_MAAL_ORD = {
  /** Forslagskortet. */
  forslagOverskrift: (n: number) => (n === 1 ? "1 forslag til et mål venter på jer" : `${n} forslag til mål venter på jer`),
  forslagTekst: "Et mål tæller først, når I har sagt ja. Behold dem, der er jeres — slip resten.",
  forslagFlere: (n: number) => `og ${n} mere`,
  tagStilling: "Tag stilling",
  /** Linjen over kortene, når der OGSÅ er bekræftede mål. */
  forslagLinje: (n: number) => (n === 1 ? "1 forslag til et mål venter på jeres ja" : `${n} forslag til mål venter på jeres ja`),
  kvartalstjekLinje: (n: number) => (n === 1 ? "1 kvartalstjek venter" : `${n} kvartalstjek venter`),
  /** Det mørke kort. */
  tomEyebrow: "Jeres retning",
  tomOverskrift: "Hvor skal I være om 12 måneder?",
  ingenAktiveOverskrift: "Ingen aktive mål lige nu",
  saetFoersteMaal: "Sæt jeres første mål",
  saetNytMaal: "Sæt et nyt mål",
  seParkerede: "Se de parkerede",
  /** Under kortene. */
  flereMaal: (n: number) => (n === 1 ? "+1 aktivt mål mere på Dine mål" : `+${n} aktive mål mere på Dine mål`),
  flereSkridt: (n: number) => (n === 1 ? "+1 skridt mere" : `+${n} skridt mere`),
  gammeltMaalLink: "Gør målet skarpt",
  /** Et gammelt mål (art null) på forsiden — 2/10 aften, efter Jonas' skærm 19:29. */
  udenTal: "Uden tal endnu",
  saetTalTekst: "Sæt et tal og en frist på, så viser vi hver måned, om I er på sporet.",
  saetTalPaa: "Sæt et tal på",
  alleGjort: "Alle skridt er gjort.",
  markerNaaet: "Er I i mål? Markér det på Dine mål",
  foersteSkridt: "Hvad er det første, I gør?",
  jeresSkridt: "Jeres skridt",
  /** Forside v3 (mockup v3): mikro-overskriften over et måls skridt, og spørgsmålet, når alle er gjort. */
  skridt: "Skridt",
  /** «Din plan»s link (mockup v3, UX-rådet 2/10: før «Se hele planen»). */
  dineMaalLink: "Dine mål",
  erIMaal: "Er I i mål?",
  alleGjortKort: "Alle skridt er gjort",
  tilfoejPaaDineMaal: "Tilføj det på Dine mål",
  /** Forslagskortet på forsiden (mockup v3): «2 forslag til mål» + «Et mål tæller først, når I har sagt ja.» */
  forslagKort: (n: number) => (n === 1 ? "1 forslag til et mål" : `${n} forslag til mål`),
  forslagTaeller: "Et mål tæller først, når I har sagt ja.",
} as const;

/**
 * Et fokuspunkt, der også står i «Din plan» (skridt og mål-punkter: company-action, maal:skridt/foerste/frist).
 * «Dit næste skridt» (kompakt) viser dem ikke som stille linjer — kun som det primære punkt (2/10 aften).
 */
export function erPlanPunkt(punkt: { kind: string }): boolean {
  return punkt.kind === "company-action" || punkt.kind === "maal";
}
