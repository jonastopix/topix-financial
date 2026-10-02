import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BEKRAEFT_ORD,
  forslagOverskrift,
  KVARTAL_ORD,
  skrevetAfTekst,
  type BekraeftelsesDeling,
  type KvartalValg,
  type VentendeKvartalstjek,
} from "@/lib/hjemmebane/maalBekraeft";
import { danskDato } from "@/lib/hjemmebane/skridtForslag";
import { HbCard } from "../HbCard";
import { HbButton } from "../HbButton";

/**
 * «Dine mål», skive 3 (Jonas' svar 1/10-2026 kl. 22:04–22:09) — de tre kort,
 * der kræver medlemmets klik, FØR et mål tæller eller fortsætter:
 *   1. FORSLAG («Ja, ét klik»): ét kort pr. nyt, ubekræftet mål — «Din
 *      rådgiver foreslår et mål» · «Det er vores mål» (bekræft) · «Ikke nu»
 *      (parkér). Øverst, før alt andet.
 *   2. GAMLE MÅL («Bekræft eller slip ved næste login»): ÉT samlet kort «Er
 *      det stadig jeres mål?» med hvert gammelt mål og «Behold» / «Slip».
 *   4. KVARTALSTJEK («Medlemmet selv»): ét kort pr. ventende tjek — «Måned 6:
 *      Er målet stadig det rigtige?» med Behold · Justér tal og dato · Parkér ·
 *      Nået (nået KUN ved klik, som altid).
 *
 * TEGNER KUN: dommene er motorens (maalBekraeft.delBekraeftelser,
 * ventendeKvartalstjekAlle); skrivningerne er kalderens (dineMaalGrundlag:
 * bekraeft/slip/markerNaaet/registrerKvartalstjek — medlemmets klientvej,
 * samme RLS). Samme komponent på /milestones og på forsidens «Din plan», så
 * de to flader aldrig siger noget forskelligt. «Justér» åbner redigeringen
 * hos kalderen (onJuster); uden den (forsiden) er knappen et link til /milestones.
 *
 * Rådgiveren LÆSER kortene og kan intet klikke (kanKlikke false — RLS giver
 * rådgiveren kun SELECT på milestones; bekræftelsen er medlemmets): knapperne
 * er deaktiverede med BEKRAEFT_ORD.kunMedlemmet som title.
 *
 * Pladsen (rådets fund 2/10, migration 20261002241000): under «kun_bekraeftede»
 * afviser triggeren en bekræftelse, når der allerede er 3 bekræftede aktive —
 * så «Det er vores mål»/«Behold» står deaktiverede med grunden
 * (`bekraeftSpaerret`, dømt af maalPladsdom.bekraeftelseSpaerret hos kalderen).
 *
 * Dobbeltklik: ét mål ad gangen (`arbejder` = målets id) — knapperne på det
 * mål er låst, mens skrivningen løber; de andre kort er stadig klikbare.
 */

/** Ankeret «venter på jeres ja» (rådets fund 2/10): andre flader peger på `#venter` — ét kort pr. side (/milestones eller forsiden). */
export const BEKRAEFT_ANKER = "venter";

const mikro = "text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft";

export type BekraeftHandling = "bekraeft" | "slip";
export type KvartalHandling = { valg: KvartalValg; maalId: string; kvartal: VentendeKvartalstjek["kvartal"] };

type Props = {
  bekraeftelser: BekraeftelsesDeling;
  kvartalstjek: readonly VentendeKvartalstjek[];
  /** Medlemmet (ikke rådgiveren, heller ikke i «Se som medlem»). */
  kanKlikke: boolean;
  /** Grunden, «Det er vores mål»/«Behold» ikke kan trykkes (maalPladsdom.bekraeftelseSpaerret: under
      «kun_bekraeftede» afviser triggeren 20261002241000 en fjerde bekræftet aktiv). null/udeladt = mulig.
      «Ikke nu»/«Slip» og kvartalstjekket er aldrig spærret — de frigør eller rører ikke pladsen. */
  bekraeftSpaerret?: string | null;
  /** Svarer med fejlteksten eller null ved ja. */
  onBekraeft: (maalId: string, handling: BekraeftHandling) => Promise<string | null>;
  /** Kvartalstjekkets behold/parkeret/naaet. «justeret» registreres af kalderen EFTER redigeringen er gemt. */
  onKvartal: (h: KvartalHandling) => Promise<string | null>;
  /** Åbner redigeringen (Dine mål). Udeladt (forsiden): «Justér» er et link til /milestones. */
  onJuster?: (maalId: string, kvartal: VentendeKvartalstjek["kvartal"]) => void;
  className?: string;
};

export const BekraeftMaalKort = ({ bekraeftelser, kvartalstjek, kanKlikke, bekraeftSpaerret = null, onBekraeft, onKvartal, onJuster, className }: Props) => {
  const [arbejder, setArbejder] = useState<string | null>(null);
  const [fejl, setFejl] = useState<{ maalId: string; tekst: string } | null>(null);
  const { forslag, gamle } = bekraeftelser;
  if (forslag.length === 0 && gamle.length === 0 && kvartalstjek.length === 0) return null;

  const koer = async (maalId: string, f: () => Promise<string | null>) => {
    if (!kanKlikke || arbejder) return;
    setArbejder(maalId);
    setFejl(null);
    try {
      const grund = await f();
      if (grund) setFejl({ maalId, tekst: grund });
    } catch (e) {
      setFejl({ maalId, tekst: e instanceof Error ? e.message : String(e) });
    } finally {
      setArbejder(null);
    }
  };
  const laast = (maalId: string) => !kanKlikke || arbejder === maalId;
  const titel = kanKlikke ? undefined : BEKRAEFT_ORD.kunMedlemmet;
  // Bekræftelsen (ikke slip): spærret med grunden, når databasen ville afvise den.
  const bekraeftLaast = (maalId: string) => laast(maalId) || bekraeftSpaerret !== null;
  const bekraeftTitel = titel ?? bekraeftSpaerret ?? undefined;
  const spaerretGrund = kanKlikke && bekraeftSpaerret ? (
    <p className="mt-2 text-sm text-hb-ink-soft" data-bekraeft-spaerret>{bekraeftSpaerret}</p>
  ) : null;
  const fejlFor = (maalId: string) =>
    fejl?.maalId === maalId ? <p role="alert" className="mt-2 text-sm text-hb-rust" data-bekraeft-fejl>{fejl.tekst}</p> : null;

  return (
    <div id={BEKRAEFT_ANKER} className={cn("scroll-mt-24 space-y-4", className)} data-bekraeft-kort data-forslag={forslag.length} data-gamle={gamle.length} data-kvartalstjek={kvartalstjek.length}>
      {/* ── 1. Nye forslag — ét kort pr. mål ── */}
      {forslag.map((m) => (
        <HbCard key={m.id} className="border-hb-evergreen/30 p-5 md:p-6" data-maal-forslag={m.id}>
          <p className={cn(mikro, "text-hb-rust")}>{forslagOverskrift(m.source)}</p>
          <p className="mt-2 font-editorial text-xl font-medium leading-snug text-hb-ink">{m.title}</p>
          <p className="mt-2 max-w-2xl text-sm text-hb-ink-soft">{BEKRAEFT_ORD.forslagTekst}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <HbButton className="h-10 gap-1.5 px-5 text-sm" disabled={bekraeftLaast(m.id)} title={bekraeftTitel} onClick={() => void koer(m.id, () => onBekraeft(m.id, "bekraeft"))} data-handling="bekraeft">
              <Check className="h-4 w-4" aria-hidden />
              {BEKRAEFT_ORD.detErVoresMaal}
            </HbButton>
            <HbButton variant="secondary" className="h-10 px-5 text-sm" disabled={laast(m.id)} title={titel} onClick={() => void koer(m.id, () => onBekraeft(m.id, "slip"))} data-handling="slip">
              {BEKRAEFT_ORD.ikkeNu}
            </HbButton>
          </div>
          {spaerretGrund}
          {fejlFor(m.id)}
        </HbCard>
      ))}

      {/* ── 2. Gamle mål — ÉT samlet kort ── */}
      {gamle.length > 0 && (
        <HbCard className="p-5 md:p-6" data-gamle-maal-kort>
          <p className={cn(mikro, "text-hb-rust")}>{BEKRAEFT_ORD.gamleOverskrift}</p>
          <p className="mt-2 max-w-2xl text-sm text-hb-ink-soft">{BEKRAEFT_ORD.gamleTekst(gamle.length)}</p>
          {spaerretGrund}
          <ul className="mt-3 divide-y divide-hb-line">
            {gamle.map((m) => {
              const af = skrevetAfTekst(m.source);
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3" data-gammelt-maal={m.id}>
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="text-[15px] font-medium leading-snug text-hb-ink">{m.title}</p>
                    {af && <p className="mt-0.5 text-xs text-hb-ink-soft">{af}</p>}
                    {fejlFor(m.id)}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <HbButton className="h-9 gap-1.5 px-4 text-sm" disabled={bekraeftLaast(m.id)} title={bekraeftTitel} onClick={() => void koer(m.id, () => onBekraeft(m.id, "bekraeft"))} data-handling="behold">
                      <Check className="h-4 w-4" aria-hidden />
                      {BEKRAEFT_ORD.behold}
                    </HbButton>
                    <HbButton variant="secondary" className="h-9 gap-1.5 px-4 text-sm" disabled={laast(m.id)} title={titel} onClick={() => void koer(m.id, () => onBekraeft(m.id, "slip"))} data-handling="slip">
                      <Pause className="h-4 w-4" aria-hidden />
                      {BEKRAEFT_ORD.slip}
                    </HbButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </HbCard>
      )}

      {/* ── 4. Kvartalstjek — ét kort pr. ventende tjek ── */}
      {kvartalstjek.map((t) => (
        <HbCard key={`${t.maalId}:${t.kvartal}`} id={kvartalstjek[0] === t ? "kvartalstjek" : undefined} className="scroll-mt-24 p-5 md:p-6" data-kvartalstjek-kort={t.maalId} data-kvartal={t.kvartal}>
          <p className={cn(mikro, "text-hb-rust")}>{KVARTAL_ORD.eyebrow} · {danskDato(t.dato)}</p>
          <p className="mt-2 font-editorial text-xl font-medium leading-snug text-hb-ink">{KVARTAL_ORD.overskrift(t.maaned)}</p>
          <p className="mt-1 text-[15px] text-hb-ink">{t.maalTitel}</p>
          <p className="mt-2 max-w-2xl text-sm text-hb-ink-soft">{KVARTAL_ORD.tekst}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <HbButton className="h-10 gap-1.5 px-5 text-sm" disabled={laast(t.maalId)} title={titel} onClick={() => void koer(t.maalId, () => onKvartal({ valg: "behold", maalId: t.maalId, kvartal: t.kvartal }))} data-handling="kvartal-behold">
              <Check className="h-4 w-4" aria-hidden />
              {KVARTAL_ORD.behold}
            </HbButton>
            {onJuster ? (
              <HbButton variant="secondary" className="h-10 px-5 text-sm" disabled={laast(t.maalId)} title={titel} onClick={() => onJuster(t.maalId, t.kvartal)} data-handling="kvartal-juster">
                {KVARTAL_ORD.juster}
              </HbButton>
            ) : (
              <Link to="/milestones#kvartalstjek" className="inline-flex h-10 items-center rounded-full border border-hb-ink/25 px-5 text-sm font-medium text-hb-ink hover:bg-hb-sage/50" data-handling="kvartal-juster-link">
                {KVARTAL_ORD.juster}
              </Link>
            )}
            <HbButton variant="secondary" className="h-10 px-5 text-sm" disabled={laast(t.maalId)} title={titel} onClick={() => void koer(t.maalId, () => onKvartal({ valg: "parkeret", maalId: t.maalId, kvartal: t.kvartal }))} data-handling="kvartal-parker">
              {KVARTAL_ORD.parker}
            </HbButton>
            <HbButton variant="secondary" className="h-10 px-5 text-sm" disabled={laast(t.maalId)} title={titel} onClick={() => void koer(t.maalId, () => onKvartal({ valg: "naaet", maalId: t.maalId, kvartal: t.kvartal }))} data-handling="kvartal-naaet">
              {KVARTAL_ORD.naaet}
            </HbButton>
          </div>
          {fejlFor(t.maalId)}
        </HbCard>
      ))}
    </div>
  );
};
