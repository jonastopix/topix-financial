import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { antalOpnaaet, TROFAE_FORKLARING, trofaeDato, type TrofaeDom } from "@/lib/gamification/trofaeer";
import { HbCard } from "../HbCard";

/** «Dine trofæer» på medlemmets forside, lige under Boardroom Score (1/10-2026,
    docs/boardroom-score.md «Trofæer»). TEGNER KUN: dommen kommer færdig fra
    lib/gamification/trofaeer gennem hooks/trofaeer (kun egne data).

    Trofæer er MILEPÆLE (opnået én gang, for altid) — ikke et tal. Linjen
    TROFAE_FORKLARING skiller dem fra scoren.

    KOMPAKT: små fliser, 2 kolonner på mobil (375 px uden vandret scroll —
    min-w-0 + break-words), 4 på desktop. Opnåede i farve med dato; resten
    dæmpet med «sådan får du den».

    FAIL-SOFT: henter → intet (kortet springer ikke i højden for en sekundær
    flade); fejl → intet kort (rådets fund M2, 1/10). */
export function TrofaeKort({ trofaeer, isError }: { trofaeer: TrofaeDom[] | undefined; isError: boolean }) {
  // Fejl → intet kort (rådets fund M2, 1/10): en fejlet hentning må ikke ligne «du har ingen trofæer».
  if (isError || !trofaeer) return null;
  const liste = trofaeer;
  return (
    <HbCard className="p-5 md:p-6" data-trofaeer="klar">
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
        <ul className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
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
                  <div className={cn("break-words text-sm font-medium leading-snug", opnaaet ? "text-hb-ink" : "text-hb-ink-soft")}>{t.titel}</div>
                  <div className="break-words text-xs leading-snug text-hb-ink-soft">
                    {opnaaet ? trofaeDato(t.opnaaetAt as string) : t.saadan}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </HbCard>
  );
}
