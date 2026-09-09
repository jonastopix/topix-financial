/**
 * src/lib/hjemmebane/netvaerksprofil.ts
 *
 * Netværksprofilen forfra (Jonas 9/9): «Hvad arbejder du med nu — det er
 * et dumt spørgsmål. Lad os gennemtænke hvad der REELT skal være på en
 * profil, for at det giver værdi for netværket.» Rene funktioner — ingen
 * React, ingen Supabase. Testet i __tests__/netvaerksprofil.test.ts.
 *
 * BESLUTTET 9/9:
 *   FAKTALINJEN uden tal — branche · by · stiftet · medlem siden. «Vi skal
 *   IKKE vise tal mellem medlemmer, som de ikke selv har valgt at skrive.»
 *   Ingen omsætning, ingen størrelse, ingen intervaller. Faktalinjen står
 *   ALTID (den er automatisk), så en profil aldrig er tom.
 *
 *   TRE FELTER, alle valgfri, hver med sin kolonne:
 *     1. «Det laver vi»                 companies.description     160 tegn
 *     2. «Det har jeg været igennem»    member_profiles.ask_me_about  300 tegn
 *     3. «Det leder jeg efter»          member_profiles.working_on    200 tegn
 *   Kolonnerne beholdes (RPC'er, sortering, tjekliste og fokuskort læser
 *   dem); etiketterne og betydningen skifter. «Det kan du spørge mig om»
 *   bad om selvros — hjælpeteksten fra 10/8 («det du har prøvet, ikke det du
 *   tilbyder») var det rigtige, etiketten forrådte den. «Det arbejder jeg
 *   med lige nu» forældes og blev ikke svaret på; «Det leder jeg efter»
 *   forældes ved at blive LØST, og et løst behov er en historie til felt 2.
 *
 * ÉN DOM OM «UDFYLDT» bor stadig i profilUdfyldt.ts (ask_me_about — det
 * bærende felt). Denne fil dømmer ikke om profilen er udfyldt; den siger
 * hvad hvert felt hedder, hvor langt det må være, hvordan faktalinjen
 * sættes sammen, og hvad der mangler på EGEN profil (alle tre, hver for
 * sig). Andres tomme felter er tavse (MemberProfileView).
 *
 * TEGNGRÆNSERNE håndhæves ved indtastning (klip) og i hjælpeteksten — ikke
 * i databasen; en gammel, længere tekst vises som den er.
 */

export type ProfilFeltNoegle = "det_laver_vi" | "vaeret_igennem" | "leder_efter";

export interface ProfilFelt {
  noegle: ProfilFeltNoegle;
  /** Etiketten over feltet — og overskriften på profilsiden. */
  label: string;
  /** Hjælpeteksten under etiketten. */
  hjaelp: string;
  /** Eksemplet i feltet (placeholder). */
  eksempel: string;
  graense: number;
  /** «Du har ikke skrevet …» på egen profil. */
  mangler: string;
}

export const PROFIL_FELTER: readonly ProfilFelt[] = [
  {
    noegle: "det_laver_vi",
    label: "Det laver vi",
    hjaelp: "Én sætning om hvad I sælger, og til hvem. Ikke jeres mission — det I får penge for.",
    eksempel: "Fx: Vi designer og producerer møbler til hoteller og restauranter i Norden.",
    graense: 160,
    mangler: "hvad I laver",
  },
  {
    noegle: "vaeret_igennem",
    label: "Det har jeg været igennem",
    hjaelp:
      "Det andre kan spørge dig om, fordi du har prøvet det — ikke det du er god til. Et generationsskifte, en fyringsrunde, fra fem til tyve ansatte, den største kunde der forsvandt, et system I skiftede.",
    eksempel:
      "Fx: Flyttede webshoppen fra 2 til 12 mio. på tre år og tog alle de dyre fejl med lager og retur undervejs.",
    graense: 300,
    mangler: "hvad du har været igennem",
  },
  {
    noegle: "leder_efter",
    label: "Det leder jeg efter",
    hjaelp: "Én ting du gerne vil høre fra en der har prøvet det. Det er lettere at bede om end at prale — og det er det andre kan hjælpe med.",
    eksempel: "Fx: Nogen der har ansat sin første sælger og fortrudt — eller ikke fortrudt.",
    graense: 200,
    mangler: "hvad du leder efter",
  },
];

export const PROFIL_GRAENSE: Readonly<Record<ProfilFeltNoegle, number>> = {
  det_laver_vi: 160,
  vaeret_igennem: 300,
  leder_efter: 200,
};

export function profilFelt(noegle: ProfilFeltNoegle): ProfilFelt {
  return PROFIL_FELTER.find((f) => f.noegle === noegle)!;
}

/** Klipper til feltets grænse ved indtastning. Ingen trim her — man skal kunne skrive et mellemrum. */
export function klipTilGraense(tekst: string, noegle: ProfilFeltNoegle): string {
  return tekst.slice(0, PROFIL_GRAENSE[noegle]);
}

/** Gemmeværdien: trimmet, tom → null (en tom streng ser udfyldt ud i databasen). */
export function tilGemmevaerdi(tekst: string | null | undefined): string | null {
  const t = (tekst ?? "").trim();
  return t === "" ? null : t;
}

/** Det profilsiden og kortet læser af en MemberProfile — et snit, så testene kan bygge rækker uden hele typen. */
export interface ProfilTekster {
  company_description: string | null | undefined;
  ask_me_about: string | null | undefined;
  working_on: string | null | undefined;
}

export interface ProfilDele {
  det_laver_vi: string | null;
  vaeret_igennem: string | null;
  leder_efter: string | null;
}

/** De tre tekster, trimmet; tom → null. */
export function profilensDele(p: ProfilTekster): ProfilDele {
  return {
    det_laver_vi: tilGemmevaerdi(p.company_description),
    vaeret_igennem: tilGemmevaerdi(p.ask_me_about),
    leder_efter: tilGemmevaerdi(p.working_on),
  };
}

/** Hvad der mangler på EGEN profil — i fast rækkefølge, som «du har ikke skrevet …»-tekster. Tom liste når alt er skrevet. */
export function profilMangler(p: ProfilTekster): string[] {
  const dele = profilensDele(p);
  return PROFIL_FELTER.filter((f) => dele[f.noegle] === null).map((f) => f.mangler);
}

/** «Du har ikke skrevet hvad I laver, hvad du har været igennem og hvad du leder efter.» — null når intet mangler. */
export function manglerSaetning(p: ProfilTekster): string | null {
  const m = profilMangler(p);
  if (m.length === 0) return null;
  const liste = m.length === 1 ? m[0] : `${m.slice(0, -1).join(", ")} og ${m[m.length - 1]}`;
  return `Du har ikke skrevet ${liste}.`;
}

/** Faktalinjens kilder — alle automatiske (companies + company_members). */
export interface FaktaInput {
  industry_label: string | null | undefined;
  city: string | null | undefined;
  /** EXTRACT(year FROM companies.start_date) — CVR-stiftelsesdatoen. */
  stiftet_aar: number | null | undefined;
  /** MIN(company_members.created_at) som ISO. */
  member_since: string | null | undefined;
}

const MAANEDER = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
] as const;

/** «marts 2026» af en ISO-dato — lokal tid, som resten af Hjemmebane. Ugyldig → null. */
export function maanedAar(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MAANEDER[d.getMonth()]} ${d.getFullYear()}`;
}

/** Faktalinjens led i fast rækkefølge: branche · by · stiftet YYYY · medlem siden {måned år}. Kun det der findes. */
export function faktalinjeLed(f: FaktaInput): string[] {
  const led: string[] = [];
  const branche = tilGemmevaerdi(f.industry_label);
  const by = tilGemmevaerdi(f.city);
  if (branche) led.push(branche);
  if (by) led.push(by);
  if (typeof f.stiftet_aar === "number" && Number.isFinite(f.stiftet_aar) && f.stiftet_aar > 0) led.push(`stiftet ${f.stiftet_aar}`);
  const siden = maanedAar(f.member_since);
  if (siden) led.push(`medlem siden ${siden}`);
  return led;
}

/** Faktalinjen som én streng med « · » — null når intet led findes (en rådgiver uden virksomhed). */
export function faktalinje(f: FaktaInput): string | null {
  const led = faktalinjeLed(f);
  return led.length === 0 ? null : led.join(" · ");
}

/** Kortets korte linje på /medlemmer: virksomhed · branche · by — uden årstal, kortet har én linje. */
export function kortLinje(f: { company_name: string | null | undefined } & Pick<FaktaInput, "industry_label" | "city">): string | null {
  const led = [f.company_name, f.industry_label, f.city].map(tilGemmevaerdi).filter((x): x is string => x !== null);
  return led.length === 0 ? null : led.join(" · ");
}

/** Opfordringen på egen tomme profil (profilsiden og Community-kortet). */
export const PROFIL_OPFORDRING_TEKST = "Fortæl de andre hvad du har været igennem";
export const PROFIL_OPFORDRING_LINKTEKST = "skriv din profil";
