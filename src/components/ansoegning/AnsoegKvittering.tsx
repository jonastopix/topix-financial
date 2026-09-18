import { HB_EYEBROW } from "@/components/hjemmebane/hbFormKlasser";
import { ALLEREDE, KVITTERING } from "@/lib/ansoegning/spoergsmaal";

/** «sendt» = den normale kvittering; «allerede» = 409 fra indsend (mailen har allerede en åben ansøgning). */
export const AnsoegKvittering = ({ udgave = "sendt" }: { udgave?: "sendt" | "allerede" }) => {
  const t = udgave === "allerede" ? ALLEREDE : KVITTERING;
  return (
  <div className="mx-auto max-w-xl space-y-5 text-center">
    <p className={HB_EYEBROW}>{t.eyebrow}</p>
    <h1 className="font-editorial text-4xl font-medium leading-tight text-hb-ink md:text-5xl">{t.titel}</h1>
    <p className="text-base leading-relaxed text-hb-ink-soft">{t.tekst}</p>
    <p className="pt-2 text-sm text-hb-ink-soft">
      <a href="https://theboardroom.dk" className="text-hb-evergreen underline-offset-4 hover:underline">
        Tilbage til theboardroom.dk
      </a>
    </p>
  </div>
  );
};
