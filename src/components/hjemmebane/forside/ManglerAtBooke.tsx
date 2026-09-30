import { Link } from "react-router-dom";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import { ALLE_HAR_BOOKET, ETIKET, manglerAtBookeLinjer, MANGLER_OVERSKRIFT } from "@/lib/hjemmebane/manglerAtBookeBlok";
import type { OverbliksRaekke } from "@/lib/medlemsOverblik";
import { FoldRaekke, MIKRO, Prik } from "./HoejreKolonne";

/** Forsidens «Mangler at booke» (29/9-2026; lib/hjemmebane/manglerAtBookeBlok).
    Hentningen er forsidens (useMedlemsOverblik i topblokken, egen nøgle), så
    en fejl her lader resten af forsiden stå — og siges med husets
    rådgiver-linje.

    OPSÆTNINGEN (30/9, Jonas' godkendte redesign af højre kolonne): før stod
    de 19 + 3 navne i én lang kommasætning. Nu to foldbare rækker —
    «Morten-session · 19» og «Jonas-session · 3» — hvor tallet står i et
    mærke, og navnene først vises ved klik: én pr. linje som link til
    virksomhedens side, fem ad gangen + «Vis alle N» (FoldRaekke). Nul →
    ingen knap, bare rækken med «Alle har booket.» og en grøn prik. Tallene
    og navnene er stadig manglerAtBookeLinjers — her tælles intet. */
export const ManglerAtBooke = ({
  hentning,
  virksomhedsLink,
  linkKlasse,
}: {
  hentning: { isLoading: boolean; isError: boolean; error: unknown; data: Map<string, OverbliksRaekke> | undefined };
  virksomhedsLink: (companyId: string) => string;
  linkKlasse: string;
}) => (
  <div data-mangler-blok>
    <p className={MIKRO}>{MANGLER_OVERSKRIFT}</p>
    {hentning.isLoading ? (
      <div aria-hidden className="pt-2"><div className="h-3 w-2/3 animate-pulse rounded bg-hb-line/60" /></div>
    ) : hentning.isError ? (
      <p className="pt-2 text-xs">{raadgiverHentefejlTekst(hentning.error, "forsiden")}</p>
    ) : hentning.data ? (
      <div className="mt-1 divide-y divide-hb-line/70" data-mangler-at-booke>
        {manglerAtBookeLinjer(hentning.data.values()).map((l) => (
          l.virksomheder.length > 0 ? (
            <FoldRaekke
              key={l.raadgiver}
              etiket={ETIKET[l.raadgiver]}
              liste={l.virksomheder}
              linkKlasse={linkKlasse}
              data={{ "data-mangler": l.raadgiver, "data-antal": l.virksomheder.length }}
              visNavn={(v) => <Link to={virksomhedsLink(v.id)} className={linkKlasse}>{v.navn}</Link>}
            />
          ) : (
            <p key={l.raadgiver} className="flex items-center gap-2 py-2 text-sm" data-mangler={l.raadgiver} data-antal={0}>
              <Prik tone="i_orden" />
              <span className="font-medium text-hb-ink">{ETIKET[l.raadgiver]}</span>
              <span className="text-hb-ink-soft">{ALLE_HAR_BOOKET}</span>
            </p>
          )
        ))}
      </div>
    ) : null}
  </div>
);
