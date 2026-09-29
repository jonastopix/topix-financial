import { Fragment } from "react";
import { Link } from "react-router-dom";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import { manglerAtBookeLinjer, MANGLER_OVERSKRIFT } from "@/lib/hjemmebane/manglerAtBookeBlok";
import type { OverbliksRaekke } from "@/lib/medlemsOverblik";

/** Forsidens «Mangler at booke» (29/9-2026; lib/hjemmebane/manglerAtBookeBlok).
    Hentningen er forsidens (useMedlemsOverblik i topblokken, egen nøgle), så
    en fejl her lader resten af forsiden stå — og siges med husets
    rådgiver-linje. Samme form som «I dag»s andre blokke: lille overskrift,
    skelet, fejllinje, og navnene som links til virksomhedens side. */
export const ManglerAtBooke = ({
  hentning,
  virksomhedsLink,
  linkKlasse,
}: {
  hentning: { isLoading: boolean; isError: boolean; error: unknown; data: Map<string, OverbliksRaekke> | undefined };
  virksomhedsLink: (companyId: string) => string;
  linkKlasse: string;
}) => (
  <>
    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{MANGLER_OVERSKRIFT}</p>
    {hentning.isLoading ? (
      <div aria-hidden className="pb-4"><div className="h-3 w-2/3 animate-pulse rounded bg-hb-line/60" /></div>
    ) : hentning.isError ? (
      <p className="pb-4 text-xs">{raadgiverHentefejlTekst(hentning.error, "forsiden")}</p>
    ) : hentning.data ? (
      <div className="space-y-1 pb-4" data-mangler-at-booke>
        {manglerAtBookeLinjer(hentning.data.values()).map((l) => (
          <div key={l.raadgiver} data-mangler={l.raadgiver} data-antal={l.virksomheder.length}>
            <p>{l.tekst}</p>
            {l.virksomheder.length > 0 && (
              <p>
                {l.virksomheder.map((v, i) => (
                  <Fragment key={v.id}>
                    {i > 0 && ", "}
                    <Link to={virksomhedsLink(v.id)} className={linkKlasse}>{v.navn}</Link>
                  </Fragment>
                ))}
              </p>
            )}
          </div>
        ))}
      </div>
    ) : null}
  </>
);
