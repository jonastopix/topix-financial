/**
 * src/lib/hjemmebane/akademiFremdrift.ts — dommen bag /engagement-kolonnen
 * «Akademiet» (3/10-2026, Jonas 20:38: «vi rådgivere bør kunne se under
 * /engagement hvor meget af akademiet et medlem har set»). REN fil: ingen
 * Supabase, ingen React. Hentningen bor i hooks/trofaeer.ts (hentEngagement).
 *
 * ENHEDEN er VIRKSOMHEDEN, fordi /engagement er én række pr. kundevirksomhed
 * (hentEngagement, iEngagementUniverset). En lektion tæller som set, når
 * ÉT af virksomhedens medlemmer selv har set den (foreningsmængden) — ikke
 * summen over medlemmer: to medlemmer, der ser samme video, har stadig set
 * 1 af M, og tallet kan aldrig overstige M. Målt 3/10: universet er 29
 * virksomheder; 26 af dem har medlemmer (28 medlemmer, rådgivere og
 * tjenestekonti fraregnet), 3 har ingen. Forskellen på «pr. medlem» og
 * «pr. virksomhed» er i dag lille; reglen er valgt, så den holder, når den
 * ikke er det. Det enkelte medlems tal står i ProgressView (Akademi-admin).
 *
 * KATALOGET (M) er det, et fuldt medlem KAN nå i Akademiet:
 *   publiceret (listPublishedItems henter kun status = 'published')
 *   · sporet video (erSporetVideo: bunny + video-id — Model B1-video)
 *   · i et område med akademi = true (Start her · Fundamentet · Kurser).
 * Optagelser (talks), Quick Wins (skjult 1/10) og forsidens gamle indslag
 * (ugens_video, push, evergreen …) er IKKE i M. Dryp tæller ikke: rådgiveren
 * ser råt set/M som i ProgressView. Målt i prod 3/10 (content_items,
 * status = 'published', bunny + video-id, pr. område): start_her 3 +
 * classroom 47 + academy 27 = 77. Uden for M: talks 2, ugens_video 1
 * (quick_wins har 0 publicerede). BEMÆRK: ProgressView's «N af M» tæller
 * ALLE sporede videoer minus de skjulte områder = 77 + 2 + 1 = 80 — et
 * ÅBENT punkt (docs/OVERLEVERING.md «3. oktober aften»), ikke rørt her.
 * Kataloget er filtreret på akademi = true; quickWinsSkjult.guard dom 1
 * holder, at et medlems-skjult område aldrig har akademi = true, og dom 7
 * kender denne læser (src/hooks/trofaeer.ts).
 *
 * RLS (målt i pg_policy 3/10): «Advisors can view all progress» (PERMISSIVE
 * SELECT, has_role(auth.uid(),'advisor') — admin arver) lader rådgiveren
 * læse alle medlemmers member_progress; ingen RESTRICTIVE-politik.
 *
 * DOMMEN pr. lektion er itemProgressState (progressState.ts) — ALDRIG en egen
 * læsning af seen_at/acknowledged_at:
 *   «set»       = state "done" hos mindst ét medlem,
 *   «påbegyndt» = ingen har "done", men mindst ét har "started" (åbnet
 *                 selv, ikke færdig),
 *   «sprunget over» = ingen har "done" eller "started", men mindst ét har
 *                 "skipped" — et aktivt fravalg er IKKE «påbegyndt» (rådets
 *                 fund 3/10: den første version talte dem sammen),
 *   «gennemgået med rådgiver» = markeringsTilstand "gennemgaaet" hos mindst
 *                 ét medlem — rådgiverens stempel, VIST FOR SIG, tæller
 *                 ALDRIG som set (F0, akademi-grundlag §8).
 * SENESTE AKTIVITET = medlemmetsSenesteStempel (kun EGNE stempler; aldrig
 * updated_at, som rådgiverens markering bumper) over alle rækker i
 * kataloget, som ISO-streng.
 *
 * PROCENTEN: round(100 · set / M). Med M = 0 er procenten null (intet katalog
 * at måle mod), aldrig 0 eller NaN.
 */
import { erSporetVideo } from "./forloeb";
import { itemProgressState, markeringsTilstand, medlemmetsSenesteStempel, type MemberProgress } from "./progressState";

/** Det katalogdommen læser af et content item. ContentItem opfylder den. */
export interface AkademiKatalogLektion {
  id: string;
  area: string;
  media_provider: string | null;
  bunny_video_id: string | null;
}

/** Et område, som AREAS beskriver det (kun nøgle og akademi-flag). */
export interface AkademiOmraade {
  key: string;
  akademi: boolean;
}

/** Kolonnerne, hentningen (hooks/trofaeer.ts) beder om — ÉT sted, så
    hentningen aldrig nævner et tidsstempelfelt ved navn
    (akademiEngagement.guard dom 1, akademiF0.guard dom 7,
    lektionBrugbar.guard dom 3). brugbar_at er med, fordi
    medlemmetsSenesteStempel læser den som et eget stempel. */
export const AKADEMI_FREMDRIFT_KOLONNER =
  "user_id, content_item_id, seen_at, acknowledged_at, skipped_at, brugbar_at, markeret_at";

/** Det fremdriftsdommen læser af en member_progress-række. */
export type AkademiFremdriftRaekke = Pick<
  MemberProgress,
  "user_id" | "content_item_id" | "seen_at" | "acknowledged_at" | "skipped_at" | "brugbar_at" | "markeret_at"
>;

export interface AkademiFremdrift {
  /** Lektioner i kataloget, mindst ét medlem selv har set (itemProgressState "done"). */
  set: number;
  /** Lektioner, nogen har åbnet selv ("started"), men ingen har set færdig. */
  paabegyndt: number;
  /** Lektioner, nogen har sprunget over, og ingen har åbnet eller set færdig. */
  sprunget: number;
  /** Lektioner, en rådgiver har markeret «gennemgået med rådgiver» — tæller ikke i `set`. */
  gennemgaaetMedRaadgiver: number;
  /** M — kataloget. */
  ialt: number;
  /** round(100 · set / ialt); null når ialt = 0. */
  procent: number | null;
  /** Medlemmernes seneste EGNE stempel i kataloget (ISO); null uden. */
  senesteAktivitet: string | null;
}

/** Katalogets lektions-id'er (se filhovedet). */
export function akademiKatalog(
  lektioner: readonly AkademiKatalogLektion[],
  omraader: readonly AkademiOmraade[],
): Set<string> {
  const akademiOmraader = new Set(omraader.filter((o) => o.akademi).map((o) => o.key));
  return new Set(lektioner.filter((l) => akademiOmraader.has(l.area) && erSporetVideo(l)).map((l) => l.id));
}

/** Fremdriften for ÉN virksomhed: rækkerne er allerede afgrænset til dens medlemmer. */
export function akademiFremdrift(
  raekker: readonly AkademiFremdriftRaekke[],
  katalog: ReadonlySet<string>,
): AkademiFremdrift {
  const set = new Set<string>();
  const startet = new Set<string>();
  const sprunget = new Set<string>();
  const gennemgaaet = new Set<string>();
  let senest: number | null = null;
  for (const r of raekker) {
    if (!katalog.has(r.content_item_id)) continue;
    const tilstand = itemProgressState(r);
    if (tilstand === "done") set.add(r.content_item_id);
    else if (tilstand === "started") startet.add(r.content_item_id);
    else if (tilstand === "skipped") sprunget.add(r.content_item_id);
    if (markeringsTilstand(r) === "gennemgaaet") gennemgaaet.add(r.content_item_id);
    const t = medlemmetsSenesteStempel(r);
    if (t !== null && (senest === null || t > senest)) senest = t;
  }
  // Rækkefølgen er dommen pr. lektion over medlemmerne: set > påbegyndt > sprunget over.
  let paabegyndt = 0;
  for (const id of startet) if (!set.has(id)) paabegyndt++;
  let sprungetOver = 0;
  for (const id of sprunget) if (!set.has(id) && !startet.has(id)) sprungetOver++;
  const ialt = katalog.size;
  return {
    set: set.size,
    paabegyndt,
    sprunget: sprungetOver,
    gennemgaaetMedRaadgiver: gennemgaaet.size,
    ialt,
    procent: ialt === 0 ? null : Math.round((100 * set.size) / ialt),
    senesteAktivitet: senest === null ? null : new Date(senest).toISOString(),
  };
}

/** Pr. virksomhed. `medlemmerPr` er virksomhed → dens medlemmers user_id;
    `ikkeMedlemmer` (rådgivere og tjenestekonti — rådgivere er ikke
    medlemmer, heller ikke når de står i company_members) trækkes fra her,
    så kaldet ikke kan glemme det. Et medlem af to virksomheder tæller i
    begge (hver virksomheds egen række). Virksomheder uden rækker får
    nul-dommen. */
export function akademiFremdriftPrVirksomhed(
  raekker: readonly AkademiFremdriftRaekke[],
  medlemmerPr: ReadonlyMap<string, readonly string[]>,
  ikkeMedlemmer: ReadonlySet<string>,
  virksomhedIds: readonly string[],
  katalog: ReadonlySet<string>,
): Map<string, AkademiFremdrift> {
  const prBruger = new Map<string, AkademiFremdriftRaekke[]>();
  for (const r of raekker) {
    const liste = prBruger.get(r.user_id);
    if (liste) liste.push(r);
    else prBruger.set(r.user_id, [r]);
  }
  return new Map(
    virksomhedIds.map((id) => {
      const brugere = (medlemmerPr.get(id) ?? []).filter((u) => !ikkeMedlemmer.has(u));
      return [id, akademiFremdrift(brugere.flatMap((u) => prBruger.get(u) ?? []), katalog)];
    }),
  );
}

/** Kolonnens tekst: «N af M set»; «—» når fremdriften ikke kunne hentes. */
export function akademiTekst(f: AkademiFremdrift | null): string {
  if (!f) return "—";
  return `${f.set} af ${f.ialt} set`;
}

/** Den lille linje under tallet: påbegyndt, sprunget over og rådgiverens markering, kun når de findes. */
export function akademiSporTekst(f: AkademiFremdrift | null): string | null {
  if (!f) return null;
  const dele: string[] = [];
  if (f.paabegyndt > 0) dele.push(`${f.paabegyndt} påbegyndt`);
  if (f.sprunget > 0) dele.push(`${f.sprunget} sprunget over`);
  if (f.gennemgaaetMedRaadgiver > 0) dele.push(`${f.gennemgaaetMedRaadgiver} gennemgået med rådgiver`);
  return dele.length > 0 ? dele.join(" · ") : null;
}

/** Sorteringsnøglen: antal set (M er det samme katalog for alle rækker, så
    antallet ordner som andelen — uden procentens afrunding); null (ikke
    hentet) = −1, nederst ved faldende. */
export function akademiSorteringsnoegle(f: AkademiFremdrift | null): number {
  return f ? f.set : -1;
}

export const AKADEMI_HENTEFEJL_TEKST = "Akademiets fremdrift kunne ikke hentes — kolonnen står med «—».";
