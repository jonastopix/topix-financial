/**
 * webinarDelingSvar — det FÆRDIGE dashboard som svar til en ekstern (udkast
 * webinar-deling 21/9-2026). Ren, Deno-fri: regner med de SPEJLEDE domme
 * (webinarDashboard.ts, annoncepriser.ts) på de rækker, functionen webinar-delt
 * har hentet med service role — og svarer KUN med det færdige: tal, andele,
 * annonce-/kampagnenavne, tekster. Ingen rå række forlader serveren.
 *
 * KILDEVÆRNET I DRIFT: findForbudteNoegler går svaret igennem, og functionen
 * nægter at svare (500 svar_afvist), hvis en af tilmeldingens personfelter
 * (email, by, land, enhed, fbclid, origin, referrer, …) er nøgle et sted i
 * objektet. Prøven på det faktiske svar-objekt står i
 * src/lib/__tests__/webinarDeling.test.ts.
 */
import { type AnsoegerMail, type Tilmelding, udenRaekker, type WebinarDashboardSvar, webinarDashboard } from "./webinarDashboard.ts";
import { type Annoncenavn, annoncepriser, type Annoncepriser, type Forbrugsdag, type Forbrugstilstand, type HentningStatus, type VindueValg } from "./annoncepriser.ts";

/** Tilmeldingens personfelter — må ALDRIG være nøgle i svaret (kolonnerne i hooks/webinar.ts TILMELDING_KOLONNER + annoncesporet). */
export const FORBUDTE_NOEGLER = [
  "email", "ewebinar_id", "by", "land", "enhed", "fbclid", "origin", "first_origin", "referrer", "first_referrer",
  "widget_source", "tidszone", "registreret_at", "raekker",
  // De tre personlige links (22/9-2026): et join-link ER adgangen til sessionen
  // for netop den person. De hører i en mail til personen selv — aldrig i et
  // svar til en ekstern, uanset hvor dybt i objektet de måtte ligge.
  "join_link", "kalender_link", "replay_link",
] as const;

export interface DeltInput {
  tilmeldinger: readonly Tilmelding[];
  ansoegninger: readonly AnsoegerMail[];
  sporKolonnerFindes: boolean;
  dage: readonly Forbrugsdag[];
  annoncer: readonly Annoncenavn[];
  tilstand: Forbrugstilstand;
  hentning: HentningStatus | null;
  valg: VindueValg;
}

export interface DeltSvar {
  dashboard: WebinarDashboardSvar;
  priser: Annoncepriser;
  hentning: HentningStatus | null;
  valg: VindueValg;
}

/** Ét kald, ét svar — samme domme som fladen, uden rækkerne. */
export function bygDeltSvar(ind: DeltInput, nu: Date): DeltSvar {
  const dashboard = udenRaekker(webinarDashboard({ tilmeldinger: ind.tilmeldinger, ansoegninger: ind.ansoegninger, sporKolonnerFindes: ind.sporKolonnerFindes }, nu));
  const priser = annoncepriser(
    { tilmeldinger: ind.tilmeldinger, ansoegninger: ind.ansoegninger, dage: ind.dage, annoncer: ind.annoncer, tilstand: ind.tilstand, valg: ind.valg, hentetTil: ind.hentning?.hentet_til ?? null },
    nu,
  );
  return { dashboard, priser, hentning: ind.hentning, valg: ind.valg };
}

/** Stierne (a.b[0].c) til enhver forbudt nøgle i objektet — tom liste = rent. Går hele træet, også arrays. */
export function findForbudteNoegler(obj: unknown, sti = ""): string[] {
  if (obj === null || typeof obj !== "object") return [];
  const ud: string[] = [];
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => ud.push(...findForbudteNoegler(v, `${sti}[${i}]`)));
    return ud;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const her = sti ? `${sti}.${k}` : k;
    if ((FORBUDTE_NOEGLER as readonly string[]).includes(k)) ud.push(her);
    ud.push(...findForbudteNoegler(v, her));
  }
  return ud;
}
