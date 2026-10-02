/**
 * src/lib/hjemmebane/progressState.ts — medlemmets fremdriftsrække og dommen
 * over dens tilstand, som REN fil (16/9-2026). Flyttet ORDRET fra
 * akademiApi.ts, som importerer Supabase-klienten på modulniveau: den
 * rigtige klient starter en auto-refresh-timer der fejler i jsdom og
 * vælter suiten som «Unhandled Rejection … storage.getItem is not a
 * function» (målt 16/9: maaskeRelevant.test.ts, exit-kode 1 trods 4055
 * grønne tests). De rene motorer (maaskeRelevant, forloeb, lektionBrugbar)
 * importerer herfra; akademiApi re-eksporterer, så ingen anden kalder
 * ændres. Ingen imports i denne fil — det er formen kildeværnet låser.
 */

/** Medlemmets fremdriftsrække. De fire tilstandsfelter er NULLABLE
    kolonner, og siden 6/9-2026 udtrykker de genererede typer det som
    VALGFRIE felter (`seen_at?: string`) frem for `string | null`.
    PostgREST leverer stadig `null` for en tom kolonne, og husets
    skriveveje sender `null` for at rydde (ElementView: fortryd
    «Gennemført»), så typen skal bære begge: valgfrit OG null.
    REGLEN: et fraværende tidsstempel (undefined) betyder det samme som
    null — det er ikke sket. Dommen i itemProgressState læser felterne
    som sandhedsværdi, ikke `!== null`, så en række hentet uden en
    kolonne dømmes som en række med en tom kolonne. Samme for
    last_position_seconds: fraværende = ingen gemt position.
    brugbar/brugbar_at (migration 20260916100000, «Kunne du bruge den?»):
    samme regel — fraværende = null = ikke besvaret. Dommen for om der
    skal spørges bor i lektionBrugbar.ts; ProgressPatch bærer dem IKKE. */
export type MemberProgress = {
  id: string;
  user_id: string;
  content_item_id: string;
  seen_at?: string | null;
  acknowledged_at?: string | null;
  skipped_at?: string | null;
  last_position_seconds?: number | null;
  brugbar?: boolean | null;
  brugbar_at?: string | null;
  /** F0 (2/10-2026, migration 20261002260000): RÅDGIVERENS markering
      «gennemgået med rådgiver» — skrevet KUN af batchMarker (adminContentApi),
      aldrig af medlemmet. Fraværende (før migrationen / før Lovables
      typegenerering) = null = ingen markering. De to er ADSKILT fra
      medlemmets egne felter ovenfor; dommen om «egen» står i
      erRaadgiverensStempel. markeret_af er rådgiverens user_id (null på de
      backfillede batch-rækker fra 5/8 og 12/8 — hvem der skrev dem er umålt). */
  markeret_at?: string | null;
  markeret_af?: string | null;
  created_at: string;
  updated_at: string;
};

/** F0 — er et af medlemmets tidsstempler i virkeligheden RÅDGIVERENS stempel?
    Backfillen (migration 20261002260000) satte markeret_at = acknowledged_at
    på de rækker, fingeraftrykket (≥ 2 rækker med samme (user_id,
    acknowledged_at)) kender som batch — og rørte IKKE medlemmets felter, så
    ændringen er reversibel. En batch-række kendes derfor på, at tidsstemplet
    er PRÆCIS markeret_at (den gamle batchAcknowledge skrev seen_at og
    acknowledged_at med samme `now`-streng). Et eget stempel er aldrig lig
    markeret_at: medlemmets egne skrivninger kommer én ad gangen, og fremover
    skriver batchMarker KUN markeret_*, så et senere eget acknowledged_at får
    sin egen tid. REGNESTYKKET bag «≠» frem for «markeret_at IS NULL»: med
    «IS NULL» ville en lektion, rådgiveren har gennemgået, aldrig kunne
    blive medlemmets egen bagefter — hendes klik ville stå som rådgiverens.
    Sammenlignes som tid (Date.parse), fordi PostgREST og klienten kan
    serialisere samme øjeblik forskelligt (+00:00 / Z); er en af dem ikke en
    gyldig tid, sammenlignes strengene ordret. */
export function erRaadgiverensStempel(
  tidsstempel: string | null | undefined,
  markeretAt: string | null | undefined,
): boolean {
  if (!tidsstempel || !markeretAt) return false;
  if (tidsstempel === markeretAt) return true;
  const a = Date.parse(tidsstempel);
  const b = Date.parse(markeretAt);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

/** Medlemmets EGET tidsstempel — null når feltet er tomt eller er rådgiverens stempel. */
export function egetStempel(
  tidsstempel: string | null | undefined,
  markeretAt: string | null | undefined,
): string | null {
  if (!tidsstempel) return null;
  return erRaadgiverensStempel(tidsstempel, markeretAt) ? null : tidsstempel;
}

/** Medlemmets eget «set»-stempel (ElementView: skriv seen_at ved første
    visning, når hun ikke SELV har et — rådgiverens stempel tæller ikke, så et
    besøg på en batch-række efterlader nu et spor; akademi-grundlag §6). */
export function egetSeenAt(
  progress: Pick<MemberProgress, "seen_at" | "markeret_at"> | undefined,
): string | null {
  if (!progress) return null;
  return egetStempel(progress.seen_at, progress.markeret_at);
}

/** Rådgiverens markering — «gennemgået med rådgiver» (ProgressView). Læses
    KUN af rådgiverens flade; medlemmets flader kender ikke feltet. */
export type MarkeringsTilstand = "gennemgaaet" | "ingen";

export function markeringsTilstand(
  progress: Pick<MemberProgress, "markeret_at"> | undefined,
): MarkeringsTilstand {
  return progress?.markeret_at ? "gennemgaaet" : "ingen";
}

/** Fortryd rådgiverens markering (adminContentApi.fortrydMarkering): altid
    markeret_at/markeret_af → null. På en BACKFILLET batch-række, hvor
    acknowledged_at (og evt. seen_at) ER rådgiverens stempel, ryddes de også —
    ellers ville rækken i samme øjeblik blive medlemmets egen «gennemført»
    (acknowledged_at uden markeret_at). Medlemmets egne stempler (≠ markeret_at)
    røres aldrig. Databasens værn (20261002261000) tillader rådgiveren præcis
    denne rydning og intet andet på medlemmets felter. */
export type FortrydMarkeringPatch = { markeret_at: null; markeret_af: null; acknowledged_at?: null; seen_at?: null };

export function fortrydMarkeringPatch(
  raekke: Pick<MemberProgress, "seen_at" | "acknowledged_at" | "markeret_at">,
): FortrydMarkeringPatch {
  const patch: FortrydMarkeringPatch = { markeret_at: null, markeret_af: null };
  if (erRaadgiverensStempel(raekke.acknowledged_at, raekke.markeret_at)) patch.acknowledged_at = null;
  if (erRaadgiverensStempel(raekke.seen_at, raekke.markeret_at)) patch.seen_at = null;
  return patch;
}

/** Tilstandsprikken pr. element — afledt af de uafhængige tidsstempler.
    Accepterer et strukturelt subset, så advisor-værktøjets AdminProgressRow
    (uden id/positions-felter) kan bruge samme dom.
    Hvert tidsstempel læses som SANDHEDSVÆRDI: sat = sket; null eller
    fraværende (undefined) = ikke sket. Det er reglen fra MemberProgress
    — et manglende felt er det samme som en tom kolonne — og derfor er
    tjekkene bevidst ikke `!== null`. Rækkefølgen er dommen: gennemført
    slår sprunget over, som slår startet.
    F0 (2/10-2026): dommen er MEDLEMMETS EGEN. acknowledged_at og seen_at
    tæller kun, når de ikke er rådgiverens stempel (erRaadgiverensStempel —
    de backfillede batch-rækker har acknowledged_at = markeret_at). Alle
    medlemmets flader (Akademiet, forsidens forløbslinje, «næste for dig»,
    «måske relevant», «Kunne du bruge den?») læser herigennem og ser derfor
    kun det, hun selv har gjort; rådgiverens markering læses af
    markeringsTilstand, kun i ProgressView. Uden kolonnen (før migrationen)
    er markeret_at fraværende, og dommen er som før. */
export type ItemProgressState = "done" | "started" | "skipped" | "untouched";

export function itemProgressState(
  progress: Pick<MemberProgress, "seen_at" | "acknowledged_at" | "skipped_at" | "markeret_at"> | undefined,
): ItemProgressState {
  if (!progress) return "untouched";
  if (egetStempel(progress.acknowledged_at, progress.markeret_at)) return "done";
  if (progress.skipped_at) return "skipped";
  if (egetStempel(progress.seen_at, progress.markeret_at)) return "started";
  return "untouched";
}
