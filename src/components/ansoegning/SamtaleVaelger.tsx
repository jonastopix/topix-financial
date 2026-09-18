/**
 * SamtaleVaelger — tidsvælgeren (udkast 18/9): dage som piller, tider som
 * knapper, dansk tid. Bruges af ansøgerens side (AnsoegStatusView) og af
 * rådgiverens «Samtalen» (AnsoegningView) — samme komponent, samme ord.
 * Slots kommer altid fra en dom (serverens ansoegning-samtale «tider» eller
 * rådgiverens spejlede ledigeSlots) — komponenten regner intet selv.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { dageMedTider, startDag } from "@/lib/ansoegning/samtaleValg";

export const SamtaleVaelger = ({ slots, valgt, onVaelg, varighedMin }: { slots: readonly string[]; valgt: string | null; onVaelg: (iso: string) => void; varighedMin: number }) => {
  const dage = dageMedTider(slots);
  const [dag, setDag] = useState<string | null>(() => startDag(dage, valgt));
  useEffect(() => {
    if (!dag || !dage.some((d) => d.dato === dag)) setDag(startDag(dage, valgt));
  }, [slots.length, dag, dage, valgt]);
  if (dage.length === 0) return <p className="text-sm text-hb-ink-soft" data-samtale-ingen-tider>Der er ingen ledige tider lige nu. Prøv igen om lidt — eller svar på mailen, så finder vi en tid sammen.</p>;
  const aktiv = dage.find((d) => d.dato === dag) ?? dage[0];
  return (
    <div data-samtale-vaelger>
      <p className="text-xs text-hb-ink-soft">{varighedMin} minutter, online. Tiderne er dansk tid.</p>
      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Dage">
        {dage.map((d) => (
          <button key={d.dato} type="button" role="tab" aria-selected={d.dato === aktiv.dato} onClick={() => setDag(d.dato)}
            className={cn("rounded-full border px-3 py-1.5 text-sm", d.dato === aktiv.dato ? "border-hb-ink bg-hb-ink text-hb-paper" : "border-hb-line text-hb-ink hover:border-hb-ink/50")}>
            {d.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="listbox" aria-label={`Tider ${aktiv.label}`}>
        {aktiv.tider.map((t) => (
          <button key={t.iso} type="button" role="option" aria-selected={t.iso === valgt} onClick={() => onVaelg(t.iso)}
            className={cn("min-w-[4.5rem] rounded-hb border px-3 py-2 text-sm tabular-nums", t.iso === valgt ? "border-hb-evergreen bg-hb-evergreen text-white" : "border-hb-line bg-hb-surface text-hb-ink hover:border-hb-evergreen")}>
            {t.tid}
          </button>
        ))}
      </div>
    </div>
  );
};
