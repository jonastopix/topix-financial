import { HB_EYEBROW } from "@/components/hjemmebane/hbFormKlasser";
import { ALLEREDE, KVITTERING } from "@/lib/ansoegning/spoergsmaal";
import type { KvitteringsUdfald } from "@/lib/ansoegning/api";

/** «sendt» = den normale kvittering; «allerede» = 409 fra indsend (mailen har allerede en åben ansøgning). */
export const AnsoegKvittering = ({ udgave = "sendt", mail = "sendt" }: { udgave?: "sendt" | "allerede"; mail?: KvitteringsUdfald }) => {
  const t = udgave === "allerede" ? ALLEREDE : KVITTERING;
  // Kvitteringen sendes STRAKS ved indsendelse (Jonas 18/9) — «om et øjeblik». Kun når afsendelsen fejlede
  // og køen tog den som reserve, siger skærmen «den er på vej» (næste kørsel i vinduet 07–16).
  const tekst = udgave === "allerede" ? ALLEREDE.tekst : KVITTERING.tekst(mail === "sendt");
  return (
  <div className="mx-auto max-w-xl space-y-5 text-center">
    <p className={HB_EYEBROW}>{t.eyebrow}</p>
    <h1 className="font-editorial text-4xl font-medium leading-tight text-hb-ink md:text-5xl">{t.titel}</h1>
    <p className="text-base leading-relaxed text-hb-ink-soft" data-kvittering-tekst>{tekst}</p>
    <p className="pt-2 text-sm text-hb-ink-soft">
      <a href="https://theboardroom.dk" className="text-hb-evergreen underline-offset-4 hover:underline">
        Tilbage til theboardroom.dk
      </a>
    </p>
  </div>
  );
};
