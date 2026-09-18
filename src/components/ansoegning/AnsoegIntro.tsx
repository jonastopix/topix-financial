import { ArrowRight } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HB_EYEBROW } from "@/components/hjemmebane/hbFormKlasser";
import { INTRO } from "@/lib/ansoegning/spoergsmaal";
import { MEDLEMSKAB_PRIS_KR_AAR } from "@/lib/ansoegning/skema";

/**
 * Over formularen: hvad der sker bagefter, og prisen — FØR første
 * spørgsmål, så ingen bruger syv minutter på noget de ikke vil. Mere
 * åben og salgsagtig end fladerne indeni (Jonas 18/9), men Hb-sproget:
 * Fraunces i font-medium, rust-eyebrow, evergreen-handling, papir.
 * Portrættet er den samme fil som /auth bruger (serveres uden login).
 */
export const AnsoegIntro = ({ onStart, genoptager }: { onStart: () => void; genoptager: boolean }) => (
  <div className="mx-auto max-w-3xl">
    <div className="grid items-start gap-10 md:grid-cols-[1fr_auto] md:gap-14">
      <div className="space-y-6">
        <p className={HB_EYEBROW}>{INTRO.eyebrow}</p>
        <h1 className="font-editorial text-4xl font-medium leading-[1.05] tracking-tight text-hb-ink md:text-5xl">{INTRO.titel}</h1>
        <p className="text-base leading-relaxed text-hb-ink-soft md:text-lg">{INTRO.manchet}</p>
      </div>
      <img
        src="/morten-larsen.jpg"
        alt="Morten Larsen"
        className="hidden h-40 w-40 rounded-hb object-cover md:block"
        width={160}
        height={160}
      />
    </div>

    <ol className="mt-10 grid gap-4 md:grid-cols-3">
      {INTRO.trin.map((t, i) => (
        <li key={t.titel} className="rounded-hb border border-hb-line bg-hb-surface p-5">
          <p className="font-editorial text-2xl font-medium leading-none text-hb-rust">{i + 1}</p>
          <p className="mt-3 text-[15px] font-medium leading-snug text-hb-ink">{t.titel}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-hb-ink-soft">{t.tekst}</p>
        </li>
      ))}
    </ol>

    <div className="mt-8 border-t border-hb-line pt-6">
      <p className="text-[15px] font-medium text-hb-ink">
        Medlemskabet koster {MEDLEMSKAB_PRIS_KR_AAR.toLocaleString("da-DK")} kr. om året ekskl. moms.
      </p>
      <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft">{INTRO.prisNote}</p>
    </div>

    <div className="mt-8 flex flex-col items-start gap-3">
      <HbButton type="button" onClick={onStart} className="w-full md:w-auto" autoFocus={!genoptager}>
        {INTRO.knap}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </HbButton>
      <p className="text-xs text-hb-ink-soft">{INTRO.varighed}</p>
    </div>
  </div>
);
