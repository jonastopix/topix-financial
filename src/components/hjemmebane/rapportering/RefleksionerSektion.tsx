/**
 * RefleksionerSektion — «Dine refleksioner» på Rapportering (udkast 28/9-2026).
 *
 * Medlemmet skriver refleksionen i PulseCheckinModal lige efter at have
 * godkendt en måneds tal — her, på /reports. Til nu så medlemmet den aldrig
 * igen. Sektionen tegner ALLE måneder, nyeste øverst: måneden i ord, de tre
 * spørgsmål med svarene, og milestone-tallet som det blev regnet.
 *
 * FLADEN REGNER IKKE SELV: rækkerne går gennem refleksionerTilVisning
 * (src/lib/hjemmebane/refleksioner.ts) — måned, tomme felter, rækkefølge og
 * ordene bor dér. Tom og fejlet er to beskeder (hentetilstand + sektionsfejlTekst).
 * KUN LÆSNING — ingen knap skriver noget.
 *
 * Hooken står i topblokken, før enhver return (React #310-reglen).
 */
import * as React from "react";
import { useRefleksioner } from "@/hooks/useRefleksioner";
import { hentetilstand, sektionsfejlTekst } from "@/lib/hjemmebane/hentefejl";
import {
  fremgangLinje, REFLEKSIONER_HENTER, REFLEKSIONER_TOM, refleksionerTilVisning, udenTekstLinje,
} from "@/lib/hjemmebane/refleksioner";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";

interface Props {
  companyId: string | null;
}

export function RefleksionerSektion({ companyId }: Props) {
  const hentning = useRefleksioner(companyId);
  const visninger = React.useMemo(() => refleksionerTilVisning(hentning.data ?? []), [hentning.data]);
  // Uden companyId er der ikke spurgt endnu (enabled: false giver hverken
  // isLoading eller isError) — så står den som «henter», aldrig som «tom».
  const tilstand = companyId ? hentetilstand(hentning, visninger.length === 0) : "henter";

  return (
    <HbSection id="dine-refleksioner" eyebrow="Dine refleksioner" hairline className="mt-14" data-tilstand={tilstand}>
      {tilstand === "henter" && <p className="text-sm text-hb-ink-soft">{REFLEKSIONER_HENTER}</p>}
      {tilstand === "fejlet" && <p className="text-sm text-hb-ink-soft">{sektionsfejlTekst("pulse_checkins")}</p>}
      {tilstand === "tom" && <p className="text-sm text-hb-ink-soft">{REFLEKSIONER_TOM}</p>}
      {tilstand === "data" && (
        <ul className="space-y-4">
          {visninger.map((v) => (
            <li key={v.periodKey}>
              <HbCard className="p-5" data-period={v.periodKey}>
                <h3 className="font-editorial text-xl font-medium leading-tight text-hb-ink">{v.maaned}</h3>
                {v.udenTekst ? (
                  <p className="mt-2 text-sm text-hb-ink-soft">{udenTekstLinje(v.maaned)}</p>
                ) : (
                  <>
                    {v.felter.length > 0 && (
                      <dl className="mt-4 space-y-4">
                        {v.felter.map((f) => (
                          <div key={f.noegle} data-felt={f.noegle}>
                            <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{f.spoergsmaal}</dt>
                            <dd className="mt-1 whitespace-pre-line break-words text-[15px] leading-relaxed text-hb-ink">{f.tekst}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {v.fremgang !== null && (
                      <p className="mt-4 text-sm text-hb-ink-soft" data-felt="milestone_progress">{fremgangLinje(v.fremgang)}</p>
                    )}
                  </>
                )}
              </HbCard>
            </li>
          ))}
        </ul>
      )}
    </HbSection>
  );
}
