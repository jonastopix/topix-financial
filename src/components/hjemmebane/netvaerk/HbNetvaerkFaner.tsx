import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useViewMode } from "@/hooks/useViewMode";
import { cn } from "@/lib/utils";
import { NETVAERK_HOVED, netvaerkFaner, visNetvaerkFaner } from "@/lib/hjemmebane/netvaerkFaner";
import { HbStedsSaetning } from "../HbStedsSaetning";

/** NETVÆRKSHOVEDET (seks steder, skridt 2, 2/10-2026): ét sted, fem faner.
    Tegnes af HbMemberShell over indholdet på Netværkets fem forsider
    (/community, /events, /medlemmer, /rabataftaler, /deling — ruterne er
    uændrede; fanen er et LINK til ruten, ikke en tilstand) som
    eyebrow → h1 → stedsætningen → fanebjælken, i forslagets orden
    (ia-forslag 1/10, «4. NETVÆRKET»). Sætningen står dermed ÉN gang over
    fanerne — ikke under hver fanes h1 (de tre views, der før tegnede den
    selv, tegner nu kun en h2 under fanerne: HbNetvaerkFaneHoved).

    GATEN er sætningens (visNetvaerkFaner = visStedsSaetning): det fulde
    medlem og en rådgiver i «Se som medlem». Abonnenten (kun /rabataftaler)
    og rådgiveren på sine egne flader får intet hoved og ser siderne som før.
    Komponenten læser rollen SELV — skallen må ikke læse viewingAsMember
    (online.guard dom 6). Hooks i topblokken, før den betingede return.

    MOBIL: bjælken scroller vandret i sig selv (overflow-x-auto, nowrap) og
    bløder til kanten med skallens px-6 (-mx-6 px-6), så fem faner aldrig
    giver sidescroll på hele siden; scrollbaren er skjult, fanerne ombrydes
    ikke. Den aktive fane bærer aria-current="page" og den grønne
    understreg; <nav aria-label> er bjælkens navn for skærmlæsere. Ingen
    ARIA-tabs (role="tab"/tablist): det er fem sider, ikke fem paneler.

    RÅDETS FUND 2 (2/10): på 375 px kan den aktive fane (fx «Anbefal») stå
    uden for bjælken. Ved montering og ved hvert fanskift rulles den aktive
    fane ind med scrollIntoView({inline:"nearest", block:"nearest"}) — kun
    så lidt, som skal til, og aldrig siden lodret ud over det nærmeste. Og når
    bjælken KAN rulles videre mod højre, står en diskret kantfade i højre
    side (fra tokenet hb-paper til gennemsigtig — aldrig en hårdkodet farve,
    så fadet følger temaets papir, også hvis hjemmebanen får et mørkt
    tema; i dag er hjemmebane.css lys alene); den måles ved montering, ved rul og ved resize og forsvinder,
    når enden er nået. Fadet er pointer-events-none og aria-hidden. */
export const HbNetvaerkFaner = ({ sti }: { sti: string }) => {
  const { isAdvisor, membershipTier } = useAuth();
  const { viewingAsMember } = useViewMode();
  const faner = netvaerkFaner(sti);
  const vises = visNetvaerkFaner({ isAdvisor, viewingAsMember, membershipTier });
  const tegnes = faner !== null && vises;
  const bjaelkeRef = useRef<HTMLElement | null>(null);
  const aktivRef = useRef<HTMLAnchorElement | null>(null);
  const [kanRulleVidere, setKanRulleVidere] = useState(false);
  useEffect(() => {
    if (!tegnes) return;
    // jsdom og ældre browsere har ikke altid scrollIntoView — fail-soft.
    aktivRef.current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
    const nav = bjaelkeRef.current;
    if (!nav) return;
    // 1 px tolerance: scrollLeft kan være en brøk ved zoom.
    const maal = () => setKanRulleVidere(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1);
    maal();
    nav.addEventListener("scroll", maal, { passive: true });
    window.addEventListener("resize", maal);
    return () => {
      nav.removeEventListener("scroll", maal);
      window.removeEventListener("resize", maal);
    };
  }, [sti, tegnes]);
  if (!faner || !vises) return null;
  return (
    <section className="mb-8 md:mb-10" data-netvaerk-hoved>
      <div className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{NETVAERK_HOVED.eyebrow}</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">{NETVAERK_HOVED.rubrik}</h1>
        {/* Sætningen én gang, over fanerne — ordene i stedsSaetninger.ts; komponenten gater som vi. */}
        <HbStedsSaetning sti={sti} className="mt-3" />
      </div>
      <div className="relative -mx-6 mt-6">
        <nav aria-label="Netværket" className="overflow-x-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" ref={bjaelkeRef}>
          <ul className="flex min-w-max gap-1 border-b border-hb-line" data-netvaerk-faner={faner.length}>
            {faner.map((f) => (
              <li key={f.to} className="shrink-0">
                <Link
                  ref={f.aktiv ? aktivRef : undefined}
                  to={f.to}
                  aria-current={f.aktiv ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-block whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors",
                    f.aktiv ? "border-hb-evergreen font-medium text-hb-ink" : "border-transparent text-hb-ink-soft hover:text-hb-ink",
                  )}
                >
                  {f.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {kanRulleVidere && (
          <span aria-hidden="true" data-netvaerk-fade className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-hb-paper to-transparent" />
        )}
      </div>
    </section>
  );
};
