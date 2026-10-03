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
 * objektet — og findMailVaerdier (1/10) afviser ethvert svar, hvor en
 * STRENGVÆRDI ligner en mail. Prøven på det faktiske svar-objekt står i
 * src/lib/__tests__/webinarDeling.test.ts.
 */
import { antalInterneTilmeldinger, type AnsoegerMail, type Tilmelding, udenRaekker, type WebinarDashboardSvar, webinarDashboard } from "./webinarDashboard.ts";
import { type Annoncenavn, annoncepriser, type Annoncepriser, type Forbrugsdag, type Forbrugstilstand, type HentningStatus, type VindueValg } from "./annoncepriser.ts";
import { maalstreger, type Maalstreger } from "./webinarMaalstreger.ts";

/** Tilmeldingens personfelter — må ALDRIG være nøgle i svaret (kolonnerne i hooks/webinar.ts TILMELDING_KOLONNER + annoncesporet). */
export const FORBUDTE_NOEGLER = [
  "email", "ewebinar_id", "by", "land", "enhed", "fbclid", "origin", "first_origin", "referrer", "first_referrer",
  "widget_source", "tidszone", "registreret_at", "raekker",
  // De tre personlige links (22/9-2026): et join-link ER adgangen til sessionen
  // for netop den person. De hører i en mail til personen selv — aldrig i et
  // svar til en ekstern, uanset hvor dybt i objektet de måtte ligge.
  "join_link", "kalender_link", "replay_link",
  // Varme leads (1/10-2026): navn + mail på dem, der så færdigt og ikke har
  // ansøgt. Listen er FJERNET fra platformen (Jonas 1/10 kl. 20:13 — vi ringer
  // ikke; segmentering hører til i Klaviyo). Nøglen står som forsvar: dukker
  // den nogensinde op i et delt-svar, afvises svaret.
  "varmeLeads",
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
  /**
   * WEBINARKOBLINGEN (1/10-2026, rådets fund M3): antallet af rådgiverbekræftede
   * koblinger (`ansoegning_webinar_kobling`), der indgik i dommen — ET TAL, aldrig
   * en mail. Feltet er BEVISET for udrulningen af webinar-delt: kun den nye kode
   * svarer med det (0 er et gyldigt svar — også før migrationen er kørt).
   */
  koblinger_talt: number;
  /**
   * VORES MÅLSTREGER (udkast 1/10-2026, `webinarMaalstreger.ts`): fire linjer
   * med tal, ord og bar-positioner — aldrig en række, aldrig en mail. Regnet over
   * «Hele perioden» uanset `valg`. Feltet er BEVISET for udrulningen af
   * webinar-delt: kun den nye kode svarer med det. Rettelsen 1/10 kl. 20:13
   * bevises af fjerde linjes `maalOrd` «under 7.500 kr.» og et svar UDEN `kilde`.
   */
  maalstreger: Maalstreger;
  /**
   * DEN INTERNE PRØVESESSION (3/10-2026, CTO-rådets fund 2): antallet af
   * tilmeldinger med prøvemærket (`raa.intern = true`), som dashboardet,
   * målstregerne og annoncepriserne har regnet FRA — ET TAL, aldrig en mail
   * eller et navn (findForbudteNoegler og findMailVaerdier går stadig svaret
   * igennem). Regnet af den spejlede dom `antalInterneTilmeldinger`
   * (webinarDashboard.ts ⇄ src/lib/webinar/dashboard.ts). Feltet er BEVISET for
   * udrulningen af webinar-delt med filtret i _shared/annoncepriser.ts og
   * _shared/webinarMaalstreger.ts: kun den nye kode svarer med det.
   */
  interne_fraregnet: number;
}

/** Ansøgningerne, der bærer en bekræftet kobling (en ikke-tom `webinar_email`) — kun antallet. */
export function koblingerTalt(ansoegninger: readonly AnsoegerMail[]): number {
  return ansoegninger.filter((a) => typeof a.webinar_email === "string" && a.webinar_email.trim() !== "").length;
}

/** Ét kald, ét svar — samme domme som fladen, uden rækkerne. */
export function bygDeltSvar(ind: DeltInput, nu: Date): DeltSvar {
  const dashboard = udenRaekker(webinarDashboard({ tilmeldinger: ind.tilmeldinger, ansoegninger: ind.ansoegninger, sporKolonnerFindes: ind.sporKolonnerFindes }, nu));
  const priser = annoncepriser(
    { tilmeldinger: ind.tilmeldinger, ansoegninger: ind.ansoegninger, dage: ind.dage, annoncer: ind.annoncer, tilstand: ind.tilstand, valg: ind.valg, hentetTil: ind.hentning?.hentet_til ?? null },
    nu,
  );
  const maal = maalstreger(
    { tilmeldinger: ind.tilmeldinger, ansoegninger: ind.ansoegninger, forbrug: { dage: ind.dage, annoncer: ind.annoncer, tilstand: ind.tilstand, hentetTil: ind.hentning?.hentet_til ?? null } },
    nu,
  );
  return {
    dashboard, priser, hentning: ind.hentning, valg: ind.valg, koblinger_talt: koblingerTalt(ind.ansoegninger), maalstreger: maal,
    interne_fraregnet: antalInterneTilmeldinger(ind.tilmeldinger),
  };
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

/**
 * VÆRN NR. 2 (rådets B5, 1/10-2026): nøgle-værnet ovenfor ser kun NAVNENE. En
 * mail kan stå som VÆRDI under et uskyldigt navn — en titel, et annoncenavn,
 * en ny liste, nogen tilføjer. Derfor går hele svaret også igennem her: enhver
 * STRENGVÆRDI, også dybt i arrays og objekter, der matcher MAIL_MOENSTER, gør svaret ulovligt, og
 * webinar-delt svarer 500 svar_afvist. Stierne returneres — ALDRIG værdien, så
 * loggen ikke selv bliver lækken.
 *
 * Mønstret er bevidst bredt (noget@noget.noget uden mellemrum): hellere et
 * afvist svar end en mail ude. En falsk alarm ses i loggen med stien.
 */
export const MAIL_MOENSTER = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/** Stierne (a.b[0].c) til enhver strengværdi, der ligner en mail — tom liste = rent. */
export function findMailVaerdier(obj: unknown, sti = ""): string[] {
  if (typeof obj === "string") return MAIL_MOENSTER.test(obj) ? [sti || "(rod)"] : [];
  if (obj === null || typeof obj !== "object") return [];
  const ud: string[] = [];
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => ud.push(...findMailVaerdier(v, `${sti}[${i}]`)));
    return ud;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    ud.push(...findMailVaerdier(v, sti ? `${sti}.${k}` : k));
  }
  return ud;
}
