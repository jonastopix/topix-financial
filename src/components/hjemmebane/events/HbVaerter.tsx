import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getAssetPreviewUrl } from "@/lib/hjemmebane/adminContentApi";
import { GAESTEVAERT_MAERKE, vaerterTekst, type VaertVisning } from "@/lib/hjemmebane/vaerter";
import { HbAvatar } from "../HbAvatar";
import { HbTag } from "../HbTag";

/** Gæsteværtens foto: stien i content-assets signeres (samme 1-times URL og
    50-minutters fornyelse som covers/community-billeder); uden sti eller ved
    fejl → initialen (HbAvatar — aldrig et tomt billede). */
const GaestAvatar = ({ vaert, stoerrelse }: { vaert: VaertVisning; stoerrelse: "sm" | "md" }) => {
  const q = useQuery({
    queryKey: ["content-asset", vaert.fotoPath],
    queryFn: () => getAssetPreviewUrl(vaert.fotoPath as string),
    staleTime: 50 * 60_000,
    gcTime: 60 * 60_000,
    refetchInterval: 50 * 60_000,
    refetchIntervalInBackground: false,
    enabled: !!vaert.fotoPath,
  });
  return <HbAvatar navn={vaert.navn} avatarUrl={q.data ?? null} stoerrelse={stoerrelse} title={`${vaert.navn} · ${GAESTEVAERT_MAERKE}`} />;
};

export const VaertAvatar = ({ vaert, stoerrelse = "sm" }: { vaert: VaertVisning; stoerrelse?: "sm" | "md" }) =>
  vaert.gaest ? <GaestAvatar vaert={vaert} stoerrelse={stoerrelse} /> : <HbAvatar navn={vaert.navn} avatarUrl={vaert.avatarUrl} stoerrelse={stoerrelse} />;

/** Værterne (PR 4b): kompakt = overlappende små portrætter + «Morten og
    Jonas» / «Morten, Jonas og gæstevært Mette Hansen» (forsidens «Kommende»);
    fuld = én linje pr. vært med portræt, navn og «Gæstevært · titel»
    (eventsiden). Dommen (rækkefølge, opslag, tekst) er lib/hjemmebane/vaerter.
    Intet renderes uden værter. */
export const HbVaerter = ({ vaerter, kompakt = false, className }: { vaerter: readonly VaertVisning[]; kompakt?: boolean; className?: string }) => {
  if (vaerter.length === 0) return null;
  if (kompakt) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)} data-vaerter={vaerter.length}>
        <ul className="flex -space-x-2">
          {vaerter.map((v) => (
            <li key={v.key} className="rounded-full ring-2 ring-hb-paper" data-vaert={v.gaest ? "gaest" : "raadgiver"}>
              <VaertAvatar vaert={v} stoerrelse="sm" />
            </li>
          ))}
        </ul>
        <p className="text-sm text-hb-ink-soft">{vaerterTekst(vaerter)}</p>
      </div>
    );
  }
  return (
    <div className={className} data-vaerter={vaerter.length}>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{vaerter.length === 1 ? "Vært" : "Værter"}</p>
      <ul className="mt-3 space-y-3">
        {vaerter.map((v) => (
          <li key={v.key} className="flex items-center gap-3" data-vaert={v.gaest ? "gaest" : "raadgiver"}>
            <VaertAvatar vaert={v} stoerrelse="md" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-hb-ink">{v.navn}</p>
              {v.gaest ? (
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-hb-ink-soft">
                  <HbTag className="px-2 py-0.5 text-[11px]">{GAESTEVAERT_MAERKE}</HbTag>
                  {v.titel && <span>{v.titel}</span>}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-hb-ink-soft">Rådgiver</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
