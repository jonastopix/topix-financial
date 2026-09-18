import { ArrowRight } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HB_EYEBROW } from "@/components/hjemmebane/hbFormKlasser";
import { foersteToSaetninger, type Mellemstykke } from "@/lib/ansoegning/mellemstykker";

/** Et brudstykke mellem to grupper — læses på tre sekunder, én knap videre. */
export const AnsoegMellemstykke = ({ stykke, onVidere }: { stykke: Mellemstykke; onVidere: () => void }) => (
  <div className="mx-auto max-w-xl space-y-6">
    {stykke.portraet && (
      <img src={stykke.portraet.src} alt={stykke.portraet.alt} className="h-24 w-24 rounded-full object-cover" width={96} height={96} />
    )}
    <p className={HB_EYEBROW}>{stykke.eyebrow}</p>
    {stykke.id === "citat" ? (
      <blockquote className="space-y-3">
        {/* Mobil: de to første sætninger, ordret (Jonas 18/9); fra md: hele citatet. Samme ord, aldrig en anden tekst. */}
        <p className="font-editorial text-2xl font-medium leading-snug text-hb-ink md:hidden">«{foersteToSaetninger(stykke.tekst ?? "")}»</p>
        <p className="hidden font-editorial text-2xl font-medium leading-snug text-hb-ink md:block md:text-3xl">«{stykke.tekst}»</p>
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
