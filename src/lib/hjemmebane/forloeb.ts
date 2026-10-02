/**
 * src/lib/hjemmebane/forloeb.ts
 *
 * Forløbslinjen — ÉN dom for «hvor er medlemmet i Akademiet», delt af
 * Akademiets forside (ForsideView: kortet «Fortsæt hvor du slap» og linket
 * «Næste for dig») og forsidens fokuskort (BoardroomView: linjen under «Dit
 * næste skridt»). Ren motor: ingen React, ingen Supabase, ingen runtime-
 * imports ud over lektionsSti (lektionerForModul.ts) og medlemmetsSenesteStempel
 * (progressState.ts) — begge selv uden imports —
 * plus typen ItemProgressState. Testet i __tests__/forloeb.test.ts;
 * kildeværn i __tests__/forloeb.guard.test.ts.
 *
 * HVORFOR (fund 5, 16/9): en ny konto uden én eneste progress-række fik på
 * forsiden «Eller fortsæt dit forløb: Introduktion til Classroom» — «fortsæt»
 * om noget der aldrig var begyndt. Årsagen var TO domme for det samme:
 * BoardroomView havde sin egen forenklede udgave (første ikke-gennemførte i
 * rækkefølgen, teksten «fortsæt» hardkodet) under kommentaren «samme dom som
 * Akademi-forsiden», mens ForsideView havde to dommer (continueEntry =
 * senest rørte, nextEntry = første urørte) og valgte overskriften efter om
 * noget var begyndt. Nu bor dommen her, ordret flyttet fra ForsideView
 * (16/9), og teksten følger tilstanden.
 *
 * DATAGRUNDLAG (useAkademiData.ts):
 *   - orderedByArea: Map<område, entries[]> i forløbsrækkefølgen — løse
 *     elementer, så samlinger (kursus → moduler), elementer efter position,
 *     så created_at (useAkademiData.ts:63-98). Kun publicerede.
 *   - progressRows: medlemmets member_content_progress-rækker, ALLE områder.
 *     Sorteres på medlemmets EGNE stempler (medlemmetsSenesteStempel), IKKE
 *     updated_at: den bumpes også af rådgiverens markering (fund 2/10). content_item_id kan pege på et
 *     item der ikke længere er i kataloget — så findes det ikke i byId og
 *     springes over.
 *   - areas: AREAS (adminContentApi) — kun key og akademi læses. Parameter,
 *     ikke import: adminContentApi trækker supabase-klienten ind, og testen
 *     skal kunne bygge ikke-Akademi-områder selv.
 *   - drip.unlocked og state er allerede afgjort pr. entry (dripState,
 *     itemProgressState) — dommen genberegner hverken dryp eller tilstand.
 *
 * DOMMEN (ordret som ForsideView.tsx:82-109 før 16/9):
 *   - continueEntry: nyeste EGNE aktivitet (medlemmetsSenesteStempel faldende;
 *     før 2/10: updated_at) blandt
 *     sporede videoer i et Akademi-område, ulåst, state !== "done" og (F0,
 *     2/10) state !== "untouched" — en række med kun rådgiverens markering
 *     er ikke noget, hun har begyndt. SKIPPED
 *     TÆLLER MED — det er dagens adfærd (en sprunget lektion har state
 *     "skipped", ikke "done"), ikke en beslutning truffet her; testen låser
 *     det under det navn.
 *   - nextEntry: første sporede, ulåste, URØRTE (state === "untouched") video
 *     i områdernes rækkefølge, som ikke er continueEntry.
 *   - started = Boolean(continueEntry) — ForsideViews overskrift.
 *   - harBegyndt (kun til linjen, 16/9-rettelsen): findes der mindst ét
 *     sporet entry i et Akademi-område med state !== "untouched" (done,
 *     started eller skipped; dryp tæller ikke)? started er falsk for et
 *     medlem der har GENNEMFØRT lektioner og ikke er midt i nogen — hun har
 *     begyndt alligevel, og skal ikke få «start i Akademiet».
 *   - inAkademi er nødvendig for continue (progressRows dækker alle områder:
 *     et push-item med bunny-medie må aldrig blive «fortsæt» — dets
 *     element-side findes ikke i Akademiet) og overflødig for next (områderne
 *     er allerede filtreret) — den står kun på continue, som i ForsideView.
 *
 * SPORET VIDEO (Model B1-video, BACKLOG-beslutningsnote 2026-08-04): fremdrift
 * spores KUN på video-items med bunny-provider OG et faktisk video-id.
 * Reglen bor her (erSporetVideo); useAkademiData.isTrackedItem/isTrackedEntry
 * delegerer hertil, så der er ét prædikat (paritetstest på de fire
 * kombinationer).
 *
 * LINJEN (forloebslinje, fokuskortet): continueEntry findes → «Eller fortsæt
 * dit forløb: {continue}»; ellers nextEntry findes → harBegyndt ? «Eller
 * fortsæt dit forløb: {next}» : «Eller start i Akademiet: {next}»; ellers
 * null (intet vises). «Start» siges KUN til den der aldrig har rørt en
 * Akademi-video.
 *
 * Returnerer de SAMME objekter som kom ind (generisk T) — ForsideView læser
 * progress.last_position_seconds, collection.title og item.* af dem.
 */

import type { ItemProgressState } from "./akademiApi";
import { lektionsSti } from "./lektionerForModul";
import { medlemmetsSenesteStempel, type EgneStemplerKilde } from "./progressState";

/** Det dommen læser af et item. ContentItem opfylder den strukturelt. */
export interface ForloebLektion {
  id: string;
  area: string;
  slug: string;
  title: string;
  media_provider: string | null;
  bunny_video_id: string | null;
}

/** Det dommen læser af et entry. AkademiItem opfylder den strukturelt. */
export interface ForloebEntry {
  item: ForloebLektion;
  drip: { unlocked: boolean };
  state: ItemProgressState;
}

/**
 * Det «Fortsæt hvor du slap» sorterer på (rådets fund 2/10): medlemmets EGNE
 * stempler, dømt i progressState.medlemmetsSenesteStempel (ét sted for «eget»;
 * F0-værnet holder rådgiverens felter ude af denne fil). updated_at læses
 * ALDRIG: rådgiverens markering bumper den, og så ville hendes klik i
 * ProgressView flytte medlemmets sted. Bevidst pris: en gemt afspilnings-
 * position (last_position_seconds) har intet eget stempel og flytter derfor
 * ikke stedet — lektionen, hun senest åbnede, gennemførte, sprang over eller
 * svarede «Kunne du bruge den?» på, gør.
 */
export type ForloebProgressRaekke = { content_item_id: string } & EgneStemplerKilde;

export interface ForloebOmraade {
  key: string;
  akademi: boolean;
}

export interface ForloebInput<T extends ForloebEntry> {
  /** useAkademiData.orderedByArea — forløbsrækkefølgen pr. område. */
  orderedByArea: ReadonlyMap<string, readonly T[]>;
  /** useAkademiData.progressRows — content_item_id og MEDLEMMETS EGNE stempler læses (aldrig updated_at). */
  progressRows: readonly ForloebProgressRaekke[];
  /** AREAS — kun key og akademi læses. */
  areas: readonly ForloebOmraade[];
}

export interface Forloeb<T> {
  /** Senest rørte, ikke-gennemførte video i Akademiet — «Fortsæt hvor du slap». */
  continueEntry: T | undefined;
  /** Første urørte video i forløbsrækkefølgen, ≠ continueEntry — «Næste for dig». */
  nextEntry: T | undefined;
  /** Boolean(continueEntry) — ForsideViews overskrift («Fortsæt hvor du slap»). */
  started: boolean;
  /** Mindst én sporet Akademi-video med state !== "untouched" (dryp tæller ikke) — linjens «fortsæt» mod «start». */
  harBegyndt: boolean;
}

/** Sporet video: bunny-provider OG et faktisk video-id. Ét prædikat. */
export function erSporetVideo(item: Pick<ForloebLektion, "media_provider" | "bunny_video_id">): boolean {
  return item.media_provider === "bunny" && Boolean(item.bunny_video_id);
}

export function afgoerForloeb<T extends ForloebEntry>(input: ForloebInput<T>): Forloeb<T> {
  const { orderedByArea, progressRows, areas } = input;
  const akademiOmraader = areas.filter((area) => area.akademi);
  const inAkademi = (entry: T) => areas.find((a) => a.key === entry.item.area)?.akademi === true;

  // byId af orderedByArea — samme opbygning som useAkademiData.ts:101-102.
  const byId = new Map<string, T>();
  for (const entries of orderedByArea.values()) for (const entry of entries) byId.set(entry.item.id, entry);

  // Seneste påbegyndte video (nyeste progress-aktivitet, ulåst, ikke gennemført).
  // F0 (2/10-2026): heller ikke URØRT — en række kan findes uden egen aktivitet
  // (rådgiverens markering, markeret_at, giver state "untouched", og
  // backfillen efterlod 199 sådanne rækker). «Fortsæt hvor du slap» må kun
  // pege på noget, hun selv har begyndt (started/skipped).
  // Sorteret på medlemmets EGNE stempler, nyeste først (rådets fund 2/10) —
  // aldrig updated_at, som rådgiverens markering bumper. Uden eget stempel sidst.
  const continueEntry = [...progressRows]
    .map((row) => ({ row, t: medlemmetsSenesteStempel(row) }))
    .sort((a, b) => (b.t ?? -Infinity) - (a.t ?? -Infinity))
    .map(({ row }) => row)
    .map((row) => byId.get(row.content_item_id))
    .find(
      (entry): entry is T =>
        entry !== undefined &&
        erSporetVideo(entry.item) &&
        inAkademi(entry) &&
        entry.drip.unlocked &&
        entry.state !== "done" &&
        entry.state !== "untouched",
    );

  // Første urørte video i forløbsrækkefølgen (områdernes rækkefølge).
  const nextEntry = akademiOmraader
    .flatMap((area) => orderedByArea.get(area.key) ?? [])
    .find(
      (entry) =>
        erSporetVideo(entry.item) &&
        entry.drip.unlocked &&
        entry.state === "untouched" &&
        entry.item.id !== continueEntry?.item.id,
    );

  // Har hun rørt noget i Akademiet overhovedet? done/started/skipped tæller,
  // låst eller ej — «start» må kun siges til den der aldrig har begyndt.
  const harBegyndt = akademiOmraader
    .flatMap((area) => orderedByArea.get(area.key) ?? [])
    .some((entry) => erSporetVideo(entry.item) && entry.state !== "untouched");

  return { continueEntry, nextEntry, started: Boolean(continueEntry), harBegyndt };
}

/** Fokuskortets linje. continue vinder over next; på next siges «fortsæt»
    når harBegyndt, ellers «start»; null når begge mangler (alt gennemført,
    alt låst eller tomt katalog) — så vises linjen ikke. */
export interface Forloebslinje<T> {
  entry: T;
  tekst: string;
  sti: string;
}

export const FORTSAET_PRAEFIKS = "Eller fortsæt dit forløb: ";
export const START_PRAEFIKS = "Eller start i Akademiet: ";

export function forloebslinje<T extends ForloebEntry>(forloeb: Forloeb<T>): Forloebslinje<T> | null {
  if (forloeb.continueEntry) {
    const entry = forloeb.continueEntry;
    return { entry, tekst: `${FORTSAET_PRAEFIKS}${entry.item.title}`, sti: lektionsSti(entry.item) };
  }
  if (forloeb.nextEntry) {
    const entry = forloeb.nextEntry;
    const praefiks = forloeb.harBegyndt ? FORTSAET_PRAEFIKS : START_PRAEFIKS;
    return { entry, tekst: `${praefiks}${entry.item.title}`, sti: lektionsSti(entry.item) };
  }
  return null;
}
