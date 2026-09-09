/**
 * src/lib/hjemmebane/forsideLinks.ts
 *
 * Hvor forsidens samlede linjer peger hen — rene funktioner, testet i
 * __tests__/forsideLinks.test.ts. Ingen React, ingen supabase.
 *
 * MORTENS FEJL 1 (8/9): «Hvis man klikker på linjen med de 12 selskaber,
 * så kommer jeg ind på en liste med MANGE flere selskaber.» Dommen bar de
 * tolv med (Tilstandslinje.virksomheder, forsidensDom.ts), men linket
 * kastede dem væk: /virksomheder uden parameter, og listen læste ingen.
 *
 * VEJEN (afgjort 8/9): URL'en bærer SLAGSEN (?grund=tavshed), IKKE de
 * tolv id'er — tolv uuid'er i en URL brækker ved tyve. Men listen regner
 * IKKE tavshed selv: forsidens og listens universer er ikke ens (dommen
 * har ingen status-betingelse og trækker virksomheder med egen linje fra;
 * listen kræver status active/null og kender ikke «egen linje»), så en
 * egen udregning ville give elleve eller tretten. Listen spørger i stedet
 * DOMMEN — samme hentning (hentAdvisorDashboard), samme cache-nøgle
 * (ADVISOR_DASHBOARD_QUERY_KEY), samme funktion (afgoerForsidensDom) — og
 * tager præcis de virksomheder tilstandslinjen bærer. Så er tallet det
 * samme af konstruktion, ikke af held. virksomhederForGrund herunder er
 * det opslag.
 *
 * `grund` er samme parameter som virksomhedssidens ?grund=<slags> (#637):
 * én parameter, én betydning — «den grund du kom for».
 *
 * DÆKNING: alle slags der kan fylde en samlet linje. FORM siger hvilke:
 * tilstande er fornyelse, indgang og tavshed; puklen er agentforslag.
 * Hændelser (venter_i_samtalen, stikker_ud, opgave_naer_deadline …)
 * bliver aldrig en samlet linje — de får egen virksomhedslinje eller
 * tælles som «andre virksomheder» uden slags, og har derfor ingen vej her.
 */
import { FORM, type Forsidensdom, type OpgaveSlags, type Pukkellinje, type Tilstandslinje } from "@/lib/forsidensDom";
import { PULS_NOEGLER, SVAR_VINDUE_DAGE, fornyelserTekst, tavseTekst, type PulsNoegle, type Pulsen } from "@/lib/pulsen";

export const GRUND_PARAM = "grund";
export const VIRKSOMHEDER_STI = "/virksomheder";

/** Ét selskab: direkte til virksomhedssiden med grunden (som grundLink i
    RaadgiverForsideView). */
export function virksomhedsLink(companyId: string, slags: OpgaveSlags): string {
  return `/virksomhed/${companyId}?${GRUND_PARAM}=${slags}`;
}

/** Listen filtreret på slagsen. */
export function listeLink(slags: OpgaveSlags): string {
  return `${VIRKSOMHEDER_STI}?${GRUND_PARAM}=${slags}`;
}

/** En samlet linje (tilstand eller pukkel): ét selskab → direkte til det;
    flere → listen MED filtret. Nul (bør ikke ske — en linje uden
    virksomheder laves ikke af dommen) → listen uden filter, som før. */
export function samletLinjeLink(l: Pick<Tilstandslinje | Pukkellinje, "slags" | "virksomheder">): string {
  if (l.virksomheder.length === 1) return virksomhedsLink(l.virksomheder[0].companyId, l.slags);
  if (l.virksomheder.length === 0) return VIRKSOMHEDER_STI;
  return listeLink(l.slags);
}

/** ?grund=<slags> er kun gyldig når den er en af dommens slags OG en der
    kan blive en samlet linje. Alt andet → null (parameteren ignoreres). */
export function laesGrundParam(vaerdi: string | null | undefined): OpgaveSlags | null {
  if (!vaerdi) return null;
  const form = (FORM as Record<string, string | undefined>)[vaerdi];
  if (form !== "tilstand" && form !== "pukkel") return null;
  return vaerdi as OpgaveSlags;
}

/** De virksomheder dommen samlede under slagsen — over ELLER under stregen
    (en tilstand kan stå begge steder, alt efter alvorsporten). null når
    dommen ingen samlet linje har for slagsen lige nu. */
export function virksomhederForGrund(
  dom: Pick<Forsidensdom, "linjer" | "underStregen">,
  slags: OpgaveSlags,
): { ids: string[]; antalIDommen: number } | null {
  const kandidater: Array<Tilstandslinje | Pukkellinje> = [
    ...dom.linjer.filter((l): l is Tilstandslinje | Pukkellinje => l.linje !== "virksomhed"),
    ...dom.underStregen.tilstande,
    ...dom.underStregen.pukler,
  ];
  const linje = kandidater.find((l) => l.slags === slags);
  if (!linje) return null;
  const ids = linje.virksomheder.map((v) => v.companyId);
  return { ids, antalIDommen: ids.length };
}

function flertal(n: number, ental: string, flertalsform: string): string {
  return `${n} ${n === 1 ? ental : flertalsform}`;
}

/** Overskriften på den filtrerede liste — siger hvad den viser, med
    forsidens ord (tilstandstekst i forsidensDom). `vist` er antallet af
    rækker listen faktisk viser; afviger det fra dommens tal (listens
    univers er smallere: kun status active/null), siges det, så et tal
    aldrig står alene og forkert. */
export function filterOverskrift(slags: OpgaveSlags, vist: number, antalIDommen: number): string {
  const v = flertal(vist, "virksomhed", "virksomheder");
  let tekst: string;
  switch (slags) {
    case "tavshed":
      tekst = `${v} du ikke har hørt fra længe`;
      break;
    case "fornyelse":
      tekst = `${v} med en fornyelse der venter på dig`;
      break;
    case "indgang":
      tekst = `${v} med en indgang der ikke er betalt`;
      break;
    case "agentforslag":
      tekst = `${v} med agentforslag der venter på din afgørelse`;
      break;
    default:
      tekst = `${v} med ${slags}`;
  }
  return vist === antalIDommen ? tekst : `${tekst} (forsiden talte ${antalIDommen})`;
}

// ── Pulsens tal → listen (9/9) ───────────────────────────────────────────
// Pulsen måler porteføljen (27), dommen fordeler fladen (23 minus egne
// linjer og lukninger). Klikker man et pulstal, skal listen vise PULSENS
// virksomheder — ikke dommens tilstandslinje, som giver 12 for et tal der
// sagde 14. Derfor sin egen parameter (?puls=tavse) og sit eget opslag
// (data.pulsen.<tal>.companyIds), samme cache som forsiden.

/** ?puls=<nøgle> er kun gyldig når den er en af pulsens fire. */
export function laesPulsParam(vaerdi: string | null | undefined): PulsNoegle | null {
  if (!vaerdi) return null;
  return (PULS_NOEGLER as readonly string[]).includes(vaerdi) ? (vaerdi as PulsNoegle) : null;
}

/** De virksomheder pulsen talte under nøglen; null når tallet er nul. */
export function virksomhederForPuls(
  pulsen: Pick<Pulsen, PulsNoegle>,
  noegle: PulsNoegle,
): { ids: string[]; antalIPulsen: number } | null {
  const ids = pulsen[noegle].companyIds;
  if (ids.length === 0) return null;
  return { ids: [...ids], antalIPulsen: ids.length };
}

/** Overskriften på listen filtreret fra pulsen — pulsens egne ord, med det
    VISTE tal; afviger det fra pulsens (listens univers er det samme, så det
    bør det ikke — men siges hvis det sker). */
export function pulsOverskrift(
  noegle: PulsNoegle,
  vist: number,
  antalIPulsen: number,
  puls: Pick<Pulsen, "iAlt" | "maanedNavn">,
): string {
  let tekst: string;
  switch (noegle) {
    case "rapporterer":
      tekst = `${vist} af ${puls.iAlt} har rapporteret ${puls.maanedNavn}`;
      break;
    case "svarer":
      tekst = `${vist} af ${puls.iAlt} har svaret på et forslag de seneste ${SVAR_VINDUE_DAGE} dage`;
      break;
    case "tavse":
      tekst = `${tavseTekst(vist)} — ikke hørt fra længe`;
      break;
    case "fornyelser":
      tekst = fornyelserTekst(vist);
      break;
  }
  return vist === antalIPulsen ? tekst : `${tekst} (pulsen talte ${antalIPulsen})`;
}
