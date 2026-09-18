import { ArrowRight } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HB_EYEBROW } from "@/components/hjemmebane/hbFormKlasser";
import type { Mellemstykke } from "@/lib/ansoegning/mellemstykker";

/** Et brudstykke mellem to grupper — læses på tre sekunder, én knap videre. */
export const AnsoegMellemstykke = ({ stykke, onVidere }: { stykke: Mellemstykke; onVidere: () => void }) => (
  <div className="mx-auto max-w-xl space-y-6">
    {stykke.portraet && (
      <img src={stykke.portraet.src} alt={stykke.portraet.alt} className="h-24 w-24 rounded-full object-cover" width={96} height={96} />
    )}
    <p className={HB_EYEBROW}>{stykke.eyebrow}</p>
    {stykke.id === "citat" ? (
      /* Jonas 18/9 kl. 10:10: citatet skal læses, ikke råbes — to sætninger
         (mellemstykker.ts), mindre grad end en overskrift, luft over og under. */
      <blockquote className="space-y-4 py-6">
        <p className="font-editorial text-lg font-medium leading-relaxed text-hb-ink md:text-xl">«{stykke.tekst}»</p>
        {stykke.afsender && <footer className="text-sm text-hb-ink-soft">— {stykke.afsender}</footer>}
      </blockquote>
    ) : (
      <>
        <h2 className="font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">{stykke.titel}</h2>
        <p className="text-base leading-relaxed text-hb-ink-soft">{stykke.tekst}</p>
      </>
    )}
    <HbButton type="button" onClick={onVidere} className="w-full md:w-auto" autoFocus>
      Videre
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </HbButton>
  </div>
);
