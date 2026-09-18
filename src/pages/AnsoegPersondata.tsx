import "@/styles/hjemmebane.css";
import { Link } from "react-router-dom";
import { HB_EYEBROW, HB_H1, HB_RAMME } from "@/components/hjemmebane/hbFormKlasser";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";
import { PERSONDATA_AFSNIT, PERSONDATA_TITEL } from "@/lib/ansoegning/persondata";
import { ANSOEG_STI } from "@/lib/ansoegning/skema";

/** /ansoeg/persondata — den lange persondatatekst, som samtykkelinjen under
    «Send ansøgningen» linker til. Uguardet som /ansoeg. Teksten er UDKAST TIL
    JONAS (lib/ansoegning/persondata.ts) og skal læses af et menneske før den
    går i luften. Standalone Hb-flade uden skal, som NotFound. */
const AnsoegPersondata = () => {
  useHbDokumentGrund();
  return (
    <div className={HB_RAMME}>
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="space-y-3">
          <p className={HB_EYEBROW}>The Boardroom</p>
          <h1 className={HB_H1}>{PERSONDATA_TITEL}</h1>
        </div>
        {PERSONDATA_AFSNIT.map((a) => (
          <section key={a.titel} className="space-y-2">
            <h2 className="font-editorial text-2xl font-medium leading-tight text-hb-ink">{a.titel}</h2>
            {a.afsnit.map((tekst) => (
              <p key={tekst} className="text-[15px] leading-relaxed text-hb-ink-soft">
                {tekst}
              </p>
            ))}
          </section>
        ))}
        <p className="border-t border-hb-line pt-6 text-sm">
          <Link to={ANSOEG_STI} className="text-hb-evergreen underline-offset-4 hover:underline">
            Tilbage til ansøgningen
          </Link>
        </p>
      </div>
    </div>
  );
};

export default AnsoegPersondata;
