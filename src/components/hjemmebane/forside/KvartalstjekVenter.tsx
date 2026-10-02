import { Link } from "react-router-dom";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import { KVARTAL_ORD } from "@/lib/hjemmebane/maalBekraeft";
import type { KvartalstjekOverblik } from "@/hooks/kvartalstjekOverblik";
import { FoldRaekke, MIKRO, Prik } from "./HoejreKolonne";

/** Forsidens «Kvartalstjek» (skive 3, 2/10-2026; Jonas 1/10: «rådgiverne skal
    have som en linje på forsiden, så vi kan følge op, hvis vi har brug for
    det»). ÉN linje — «N kvartalstjek venter hos medlemmerne» — foldbar med
    virksomhederne bag klikket (FoldRaekke, som «Mangler at booke»), hver som
    link til virksomhedens side med antallet af ventende tjek. Nul: rækken med
    «Ingen kvartalstjek venter.» og en grøn prik. Migrationen ikke kørt: én
    rolig linje «på vej». Dommen er motorens (hooks/kvartalstjekOverblik →
    maalBekraeft) — her tælles intet. Tjekket SKER hos medlemmet (Jonas:
    «Medlemmet selv») — rådgiveren følger op, klikker ikke. */
export const KVARTALSTJEK_PAA_VEJ_TEKST = "Kvartalstjekkene er på vej — vises, når opdateringen er kørt.";

export const KvartalstjekVenter = ({
  hentning,
  virksomhedsLink,
  linkKlasse,
}: {
  hentning: { isLoading: boolean; isError: boolean; error: unknown; data: KvartalstjekOverblik | undefined };
  virksomhedsLink: (companyId: string) => string;
  linkKlasse: string;
}) => (
  <div data-kvartalstjek-blok>
    <p className={MIKRO}>{KVARTAL_ORD.raadgiverMikro}</p>
    {hentning.isLoading ? (
      <div aria-hidden className="pt-2"><div className="h-3 w-2/3 animate-pulse rounded bg-hb-line/60" /></div>
    ) : hentning.isError ? (
      <p className="pt-2 text-xs">{raadgiverHentefejlTekst(hentning.error, "forsiden")}</p>
    ) : hentning.data?.tilstand === "afventer_migration" ? (
      <p className="pt-2 text-xs text-hb-ink-soft" data-kvartalstjek-afventer>{KVARTALSTJEK_PAA_VEJ_TEKST}</p>
    ) : hentning.data ? (
      <div className="mt-1" data-kvartalstjek-venter={hentning.data.antal}>
        {hentning.data.antal > 0 ? (
          <FoldRaekke
            etiket={KVARTAL_ORD.raadgiverLinje(hentning.data.antal)}
            liste={hentning.data.virksomheder.map((v) => ({ id: v.companyId, navn: v.navn, antal: v.antal }))}
            linkKlasse={linkKlasse}
            data={{ "data-antal": hentning.data.antal }}
            visNavn={(v) => (
              <>
                <Link to={virksomhedsLink(v.id)} className={linkKlasse}>{v.navn}</Link>
                <span className="text-hb-ink-soft"> · {v.antal === 1 ? "1 tjek" : `${v.antal} tjek`}</span>
              </>
            )}
          />
        ) : (
          <p className="flex items-center gap-2 py-2 text-sm" data-antal={0}>
            <Prik tone="i_orden" />
            <span className="text-hb-ink-soft">{KVARTAL_ORD.raadgiverIngen}</span>
          </p>
        )}
      </div>
    ) : null}
  </div>
);
