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
 * 1 af M, og tallet kan aldrig overstige M. Målt 3/10: 28 medlemmer i 29
 * virksomheder, så forskellen på «pr. medlem» og «pr. virksomhed» er i dag
 * næsten ingen; reglen er valgt, så den holder, når den ikke er det.
 *
 * KATALOGET (M) er det, et fuldt medlem KAN nå i Akademiet:
 *   publiceret (listPublishedItems henter kun status = 'published')
 *   · sporet video (erSporetVideo: bunny + video-id — Model B1-video)
 *   · i et område med akademi = true (Start her · Fundamentet · Kurser).
 * Optagelser (talks), Quick Wins (skjult 1/10) og forsidens gamle indslag
 * (ugens_video, push, evergreen …) er IKKE i M. Dryp tæller ikke: rådgiveren
 * ser råt set/M som i ProgressView. Målt i prod 3/10: 3 + 47 + 27 = 77.
 *
 * DOMMEN pr. lektion er itemProgressState (progressState.ts) — ALDRIG en egen
 * læsning af seen_at/acknowledged_at:
 *   «set»       = state "done" hos mindst ét medlem,
 *   «påbegyndt» = ingen har "done", men mindst ét har "started" eller
 *                 "skipped" (egen aktivitet uden at være færdig),
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

/** Det fremdriftsdommen læser af en member_progress-række. */
export type AkademiFremdriftRaekke = Pick<
  MemberProgress,
  "user_id" | "content_item_id" | "seen_at" | "acknowledged_at" | "skipped_at" | "brugbar_at" | "markeret_at"
>;

export interface AkademiFremdrift {
  /** Lektioner i kataloget, mindst ét medlem selv har set (itemProgressState "done"). */
  set: number;
  /** Lektioner, nogen har rørt selv, men ingen har set færdig. */
  paabegyndt: number;
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
  const roert = new Set<string>();
  const gennemgaaet = new Set<string>();
  let senest: number | null = null;
  for (const r of raekker) {
    if (!katalog.has(r.content_item_id)) continue;
    const tilstand = itemProgressState(r);
    if (tilstand === "done") set.add(r.content_item_id);
    else if (tilstand === "started" || tilstand === "skipped") roert.add(r.content_item_id);
    if (markeringsTilstand(r) === "gennemgaaet") gennemgaaet.add(r.content_item_id);
    const t = medlemmetsSenesteStempel(r);
    if (t !== null && (senest === null || t > senest)) senest = t;
  }
  let paabegyndt = 0;
  for (const id of roert) if (!set.has(id)) paabegyndt++;
  const ialt = katalog.size;
  return {
    set: set.size,
    paabegyndt,
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

/** Den lille linje under tallet: påbegyndt og rådgiverens markering, kun når de findes. */
export function akademiSporTekst(f: AkademiFremdrift | null): string | null {
  if (!f) return null;
  const dele: string[] = [];
  if (f.paabegyndt > 0) dele.push(`${f.paabegyndt} påbegyndt`);
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
