import { Link } from "react-router-dom";
import { ArrowRight, Award, Lock } from "lucide-react";
import { useCertificate } from "@/hooks/useCertificate";
import { CERTIFIKAT_KORT, certifikatKort } from "@/lib/hjemmebane/certifikatKort";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";

/** «Dit certifikat» på medlemmets forside (2/10-2026 eftermiddag) — mellem
    «Din plan» og «Din rådgiver». Dommen er HUSETS (useCertificate →
    lib/certifikat/dom.ts certifikatDom; samme cache som menupunktet, ét kald);
    ordene og tilstanden i lib/hjemmebane/certifikatKort.ts. Låst: hængelås,
    nedtælling og åbningsdato. Klar: link til /certifikat. Skjult, henter
    eller fejlet: INTET (fail-closed, intet blink). */
export const ForsideCertifikatKort = () => {
  const certifikat = useCertificate();
  const kort = certifikatKort({ loading: certifikat.loading, fejl: certifikat.fejl, dom: certifikat.dom });
  if (!kort) return null;
  return (
    <HbSection eyebrow={CERTIFIKAT_KORT.eyebrow} hairline className="mt-10 md:mt-12" data-forside-certifikat={kort.tilstand}>
      {kort.tilstand === "laast" ? (
        <HbCard className="flex items-start gap-4 px-5 py-4 md:px-6">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 text-hb-ink-soft" aria-hidden>
            <Lock className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium leading-snug text-hb-ink">{kort.titel}</p>
            <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft" data-certifikat-dage={kort.dage}>{kort.linje}</p>
          </div>
        </HbCard>
      ) : (
        <HbCard className="px-5 py-4 md:px-6">
          <Link to={kort.sti} className="group flex items-center gap-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hb-line bg-hb-sage/40 text-hb-evergreen" aria-hidden>
              <Award className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium leading-snug text-hb-ink">{kort.titel}</p>
              <p className="mt-1 text-sm text-hb-evergreen underline-offset-4 group-hover:underline">{kort.link}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-hb-ink-soft transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </HbCard>
      )}
    </HbSection>
  );
};
