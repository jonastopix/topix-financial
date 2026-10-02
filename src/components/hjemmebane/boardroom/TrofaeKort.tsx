import type { ReactNode } from "react";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { antalOpnaaet, TROFAE_FORKLARING, trofaeDato, type TrofaeDom } from "@/lib/gamification/trofaeer";
import { HbCard } from "../HbCard";

/** «Dine trofæer» (1/10-2026, docs/boardroom-score.md «Trofæer»). TEGNER KUN: dommen kommer færdig fra
    lib/gamification/trofaeer gennem hooks/trofaeer (kun egne data).

    Trofæer er MILEPÆLE (noget medlemmet har nået) — ikke et tal. Linjen
    TROFAE_FORKLARING skiller dem fra scoren.

    KOMPAKT: små fliser, 1 kolonne under sm (375 px: to kolonner gav ~100 px
    tekstbredde, og `break-words` (overflow-wrap: break-word) brækker så et ord,
    der ikke er plads til, midt i — «Budgette|t»), 2 fra sm, 4 fra md.
    `hyphens-auto` (html lang="da") deler ellers ordet ved en orddeling. Opnåede i farve med dato; resten
    dæmpet med «sådan får du den».

    FAIL-SOFT: henter → intet (kortet springer ikke i højden for en sekundær
    flade); fejl → intet kort (rådets fund M2, 1/10).

    PLACERINGEN (2/10-2026 eftermiddag, designgennemsynet i drift): trofæerne
    stod som egen sektion under Score-kortet og fyldte en hel mobilskærm (otte
    fliser) over «Din plan». Den godkendte mockup: «Dine trofæer som egen
    sektion → ind bag ‹Se hvad der tæller›». Derfor tegnes de nu KUN inde i
    ScoreKortets udfoldelige detaljer (`indlejret`: uden kortets egen ramme —
    ScoreKortet ER rammen, så HbCard her gav dobbeltramme), og på det lukkede
    kort står højst én linje, TrofaeAntal («3 af 8 trofæer»). */
export function TrofaeKort({ trofaeer, isError, indlejret = false }: { trofaeer: TrofaeDom[] | undefined; isError: boolean; indlejret?: boolean }) {
  // Fejl → intet kort (rådets fund M2, 1/10): en fejlet hentning må ikke ligne «du har ingen trofæer».
  if (isError || !trofaeer) return null;
  const liste = trofaeer;
  const Ramme = indlejret ? IndlejretRamme : KortRamme;
  return (
    <Ramme>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-hb-ink">Dine trofæer</h3>
        {liste.length > 0 && (
          <span className="text-sm tabular-nums text-hb-ink-soft">
            {antalOpnaaet(liste)} af {liste.length}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-hb-ink-soft">{TROFAE_FORKLARING}</p>
      {liste.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
          {liste.map((t) => {
            const opnaaet = t.opnaaetAt !== null;
            return (
              <li
                key={t.id}
                data-trofae={t.id}
                data-opnaaet={opnaaet ? "ja" : "nej"}
                className={cn("flex min-w-0 items-start gap-2 rounded-md border border-hb-line p-2.5", !opnaaet && "opacity-60")}
              >
                <Trophy aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", opnaaet ? "text-hb-evergreen" : "text-hb-line")} />
                <div className="min-w-0">
                  <div className={cn("break-words text-sm font-medium leading-snug hyphens-auto", opnaaet ? "text-hb-ink" : "text-hb-ink-soft")}>{t.titel}</div>
                  <div className="break-words text-xs leading-snug text-hb-ink-soft hyphens-auto">
                    {opnaaet ? trofaeDato(t.opnaaetAt as string) : t.saadan}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Ramme>
  );
}

function KortRamme({ children }: { children: ReactNode }) {
  return <HbCard className="p-5 md:p-6" data-trofaeer="klar">{children}</HbCard>;
}

/** Inde i ScoreKortets detaljer: en hårlinje i stedet for en ny ramme. */
function IndlejretRamme({ children }: { children: ReactNode }) {
  return <div className="mt-6 border-t border-hb-line pt-4" data-trofaeer="klar" data-trofaeer-indlejret>{children}</div>;
}

/** Den ene linje på det LUKKEDE Score-kort: «3 af 8 trofæer». Fejl/henter/ingen → intet (fail-soft som kortet). */
export function TrofaeAntal({ trofaeer, isError }: { trofaeer: TrofaeDom[] | undefined; isError: boolean }) {
  if (isError || !trofaeer || trofaeer.length === 0) return null;
  return (
    <p className="flex items-center gap-2 text-xs tabular-nums text-hb-ink-soft" data-score-trofaeer-antal>
      <Trophy aria-hidden className="h-3.5 w-3.5 shrink-0 text-hb-evergreen" />
      {antalOpnaaet(trofaeer)} af {trofaeer.length} trofæer
    </p>
  );
}
