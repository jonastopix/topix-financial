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
  created_at: string;
  updated_at: string;
};

/** Tilstandsprikken pr. element — afledt af de uafhængige tidsstempler.
    Accepterer et strukturelt subset, så advisor-værktøjets AdminProgressRow
    (uden id/positions-felter) kan bruge samme dom.
    Hvert tidsstempel læses som SANDHEDSVÆRDI: sat = sket; null eller
    fraværende (undefined) = ikke sket. Det er reglen fra MemberProgress
    — et manglende felt er det samme som en tom kolonne — og derfor er
    tjekkene bevidst ikke `!== null`. Rækkefølgen er dommen: gennemført
    slår sprunget over, som slår startet. */
export type ItemProgressState = "done" | "started" | "skipped" | "untouched";

export function itemProgressState(
  progress: Pick<MemberProgress, "seen_at" | "acknowledged_at" | "skipped_at"> | undefined,
): ItemProgressState {
  if (!progress) return "untouched";
  if (progress.acknowledged_at) return "done";
  if (progress.skipped_at) return "skipped";
  if (progress.seen_at) return "started";
  return "untouched";
}
