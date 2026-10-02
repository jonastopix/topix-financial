import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DinMaanedDom } from "@/lib/hjemmebane/dinMaaned";
import { RAADGIVER_NAVN, TIL_GODE_ORD } from "@/lib/hjemmebane/tilGode";
import type { SessionRaadgiver } from "@/lib/sessionRet";
import type { RaadgiverProfil } from "@/lib/hjemmebane/ansigter";
import { HbAvatar } from "../HbAvatar";
import { HbCard } from "../HbCard";
import { HbSection } from "../HbSection";
import { DinMaaned } from "./DinMaaned";

/* FORSIDE V3 (2/10-2026 aften — docs/forside-v3.md, mockup v3 godkendt af Jonas kl. 20:41: «Sådan skal du
   bygge forsiden. Og du skal ikke gå på kompromis.»). Byggestenene, der ikke allerede havde et hjem:
   pakningen i to kolonner, «Til gode» og «Sådan har I det». TEGNER KUN — dommene bor i lib/hjemmebane. */

/* ── PAKNINGEN (§0) ────────────────────────────────────────────────────────────
   CSS-grid med rækker á RAEKKE_PX; hvert felt måler sin højde (ResizeObserver) og spænder
     span = ceil((højde + MELLEM_PX) / RAEKKE_PX)
   rækker. Eksempel: et kort på 412 px → ceil((412 + 32) / 4) = 111 rækker = 444 px = kortet + 32 px luft.
   Kolonnen er eksplicit (xl:col-start-1/2) og `grid-flow-dense` lukker hullerne; DOM-rækkefølgen er urørt
   — mobil og skærmlæser læser i prioritetsorden (ingen order/contents, a11y). Under xl: én kolonne med
   gap-8 (32 px), og --span bruges ikke. */
export const RAEKKE_PX = 4;
export const MELLEM_PX = 32;

export const Felt = ({ kol, children, ...data }: { kol: 1 | 2; children: React.ReactNode } & Record<`data-${string}`, string | number | undefined>) => {
  const ref = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = ref.current?.firstElementChild as HTMLElement | null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const maal = () => setSpan(Math.ceil((el.getBoundingClientRect().height + MELLEM_PX) / RAEKKE_PX));
    maal();
    const ro = new ResizeObserver(maal);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={cn("min-w-0", kol === 1 ? "xl:col-start-1" : "xl:col-start-2")}
      style={span ? ({ ["--span" as string]: `span ${span}` } as React.CSSProperties) : undefined}
      {...data}
    >
      {children}
    </div>
  );
};

export const Pakning = ({ children }: { children: React.ReactNode }) => (
  <div
    className="mt-8 grid grid-cols-1 gap-8 xl:grid-flow-dense xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:gap-x-8 xl:gap-y-0 xl:[grid-auto-rows:4px] xl:[&>div]:[grid-row-end:var(--span)]"
    data-forside-pakning
  >
    {children}
  </div>
);

/* ── TIL GODE (§2) ─────────────────────────────────────────────────────────────
   Jonas 2/10: «Uanset hvordan og hvorfor, hvis man har en gratis 1:1 session, uanset om det er med Morten,
   Jonas eller begge, så skal det fremgå.» Listen er dommen sessionerTilGode (samme regel som backenden);
   ansigtet er rådgiverens profil slået op på fornavnet i den synlige rådgiverliste — uden match står
   initialen (HbAvatar). Tom liste → kalderen tegner intet. */
export const TilGodeKort = ({ sessioner, raadgivere }: { sessioner: readonly SessionRaadgiver[]; raadgivere: readonly RaadgiverProfil[] }) => {
  if (sessioner.length === 0) return null;
  const profil = (r: SessionRaadgiver) =>
    raadgivere.find((p) => (p.full_name ?? "").trim().split(/\s+/)[0]?.toLowerCase() === RAADGIVER_NAVN[r].toLowerCase()) ?? null;
  return (
    <HbCard className="border-hb-evergreen/30 bg-hb-sage/30 p-5" data-forside-til-gode={sessioner.join(",")}>
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-hb-evergreen">{TIL_GODE_ORD.eyebrow}</p>
      <p className="mt-1.5 font-editorial text-xl font-medium text-hb-ink">{TIL_GODE_ORD.overskrift(sessioner.length)}</p>
      <ul className="mt-3 space-y-2">
        {sessioner.map((r) => {
          const p = profil(r);
          return (
            <li key={r}>
              <Link to={TIL_GODE_ORD.sti} className="group flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen" data-til-gode={r}>
                <HbAvatar navn={p?.full_name ?? RAADGIVER_NAVN[r]} avatarUrl={p?.avatar_url ?? null} />
                <span className="flex-1 text-sm text-hb-ink">{TIL_GODE_ORD.raekke(r)}</span>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-hb-evergreen group-hover:underline">
                  {TIL_GODE_ORD.book} <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </HbCard>
  );
};

/* ── SÅDAN HAR I DET (§3) ──────────────────────────────────────────────────────
   Jonas 20:05: «er det med vilje man ikke lige ser sine nyeste tal i en kolonne i toppen som på den
   gamle?» — det rigtige DinMaaned-kort (samme dom som /reports) og under det Score-kortet (kalderen giver
   det). Er tallene bagud efter husets frist (talAlderTekst), står alderen i rust øverst til højre. */
export const SAADAN_HAR_I_DET = { eyebrow: "Sådan har I det", link: "Se alle tal", sti: "/reports" } as const;

export const TalOgScore = ({ dinMaaned, alder, children }: { dinMaaned: DinMaanedDom; alder: string | null; children: React.ReactNode }) => (
  <HbSection eyebrow={SAADAN_HAR_I_DET.eyebrow} linkLabel={SAADAN_HAR_I_DET.link} linkTo={SAADAN_HAR_I_DET.sti} hairline data-forside-tal-og-score>
    <div className="space-y-4">
      <div className={cn("relative", alder && "[&_[data-din-maaned]>p:first-child]:pr-36")} data-tal-alder={alder ?? "frisk"}>
        <DinMaaned dom={dinMaaned} udenCta />
        {alder && <span className="absolute right-6 top-6 text-sm font-medium text-hb-rust">{alder}</span>}
      </div>
      {children}
    </div>
  </HbSection>
);
