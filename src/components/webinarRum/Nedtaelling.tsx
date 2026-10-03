import { useEffect, useState } from "react";
import { annoncering, nedtaellingDele, nedtaellingTekst } from "@/lib/webinarRum/overlay";

/**
 * Den store nedtælling. Tallet på skærmen er aria-hidden (det skifter hvert
 * sekund, og en aria-live, der læser hvert sekund op, gør siden ubrugelig for
 * en skærmlæser); i stedet får skærmlæseren en rolig sætning ved faste
 * milepæle (annoncering) og altid en label med den fulde tid.
 */
export function Nedtaelling({ sek, label }: { sek: number; label: string }) {
  const [besked, setBesked] = useState("");
  const tekst = annoncering(sek);
  useEffect(() => {
    if (tekst) setBesked(tekst);
  }, [tekst]);

  const d = nedtaellingDele(sek);
  const fuld = d.dage > 0 ? nedtaellingTekst(sek) : `${d.timer > 0 ? `${d.timer} timer, ` : ""}${d.minutter} minutter og ${d.sekunder} sekunder`;
  return (
    <div className="text-center" role="timer" aria-label={`${label}: ${fuld}`}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{label}</p>
      <p aria-hidden="true" className="mt-2 font-editorial text-6xl font-medium tabular-nums leading-none text-hb-ink md:text-7xl">
        {nedtaellingTekst(sek)}
      </p>
      <p className="sr-only" aria-live="polite">
        {besked}
      </p>
    </div>
  );
}
