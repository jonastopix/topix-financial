import * as React from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, ChevronRight, ChevronUp, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tjekliste, TjeklistePunkt } from "@/lib/onboardingTjekliste";
import { HbButton } from "./HbButton";
import { HbProgressBar } from "./akademi/HbProgressBar";
import {
  laesFlag,
  skrivFlag,
  TJEKLISTE_FAERDIG_SET_KEY,
  VELKOMST_UDSAT_KEY,
} from "@/hooks/useTjeklisteLukket";

/**
 * Onboarding-tjeklisten — en følgesvend, ikke en port. Ligger på alle
 * Hb-sider (monteret i HbMemberShell), krydser af AF SIG SELV efterhånden
 * som medlemmet gør tingene (motoren i src/lib/onboardingTjekliste.ts —
 * fladen regner intet), kan lukkes med et kryds og hentes frem igen fra
 * sidebarens «Kom godt i gang».
 *
 * PLACERING (målt 2/9): HbMemberShell scroller INDHOLDSKOLONNEN på lg, ikke
 * vinduet — men position:fixed positioneres i forhold til viewport uanset,
 * præcis som HbSidebarDrawer og AddToHomescreenPrompt. Desktop: nederste
 * højre hjørne. Under lg (1024 px): fuld bredde i bunden. z-40 — UNDER
 * HbSidebarDrawers z-50, så mobilmenuen altid ligger øverst.
 *
 * IKKE EN RADIX-DIALOG. Radix portalerer til <body>, uden for
 * .theme-hjemmebane-scopet, og ville arve appens mørke tokens (HbSidebar.tsx:
 * 168-170 «bevidst IKKE shadcn Sheet»). Både boksen og video-overlejringen
 * ligger i skallens eget DOM-træ.
 *
 * LUKKET TILSTAND gemmes i localStorage (`tbr.tjekliste-lukket`,
 * src/hooks/useTjeklisteLukket.ts), som AddToHomescreenPrompt gør med
 * `a2hs-dismissed-v1`. Det er PR. ENHED og bevidst: det er en
 * visningspræference, ikke data — hvad medlemmet HAR gjort ligger i
 * databasen og krydses af på alle enheder.
 *
 * SETTINGS ER IKKE MED: profil og virksomhed redigeres på /settings, som
 * stadig er en AppLayout-side (gammelt design, ligesom Milestones og
 * PulseCheckin). Boksen følger ikke med derhen. Accepteret 2/9 —
 * rådgiverfladens og settings' konvertering er sit eget spor. Punkterne
 * fører derhen med en almindelig navigation, og listen er opdateret når
 * medlemmet kommer tilbage til en Hb-side.
 */

// Lager-nøglerne og lukket-hooken bor i src/hooks/useTjeklisteLukket.ts,
// så denne fil kun eksporterer komponenten (react-refresh).

// ── Velkomst-overlejringen ────────────────────────────────────────────

/**
 * Pladsen til velkomstvideoen — videoen optages senere. Bygget som
 * HbSidebarDrawer: fixed inset-0, egen overlay, i DOM-træet.
 *
 * SÅDAN SÆTTES VIDEOEN IND når den findes: den skal ligge i Bunny
 * Stream-library'et (upload via admin-fladens HbBunnyPicker eller GUID i
 * hånden) og have en content_items-række med media_provider = 'bunny',
 * bunny_video_id = <guid>, status = 'published' (adminContentApi
 * createItem — UgensVideoView/ItemEditor er editorerne). Embed slår op på
 * item-id'et og signeres server-side af get-video-embed (TTL 1 time), så
 * pladsholderen nedenfor erstattes af det kald BoardroomView:415 bruger i dag:
 *
 *   <HbVideoEmbed itemId={video.id} resumeAt={null} onPosition={() => {}} onCompleted={() => {}} />
 *
 * (import { HbVideoEmbed } from "./akademi/HbVideoEmbed"). onCompleted kan
 * så kalde onKomIGang i stedet for knappen, hvis «set» skal betyde afspillet.
 */
const VelkomstOverlejring = ({
  fornavn,
  onKomIGang,
  onSeSenere,
  gemmer,
  fejl,
}: {
  fornavn: string | null;
  onKomIGang: () => void;
  onSeSenere: () => void;
  gemmer: boolean;
  /** Skrivningen fejlede: overlejringen bliver stående og siger det. */
  fejl: string | null;
}) => (
  <div className="fixed inset-0 z-40 flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Velkommen">
    <div className="absolute inset-0 bg-hb-ink/40" onClick={onSeSenere} />
    <div className="relative w-full max-w-xl rounded-t-hb border border-hb-line bg-hb-surface p-6 shadow-hb-hover sm:rounded-hb sm:p-8">
      <button
        type="button"
        onClick={onSeSenere}
        aria-label="Se senere"
        className="absolute right-4 top-4 rounded-full p-1.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
      >
        <X className="h-5 w-5" />
      </button>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Velkommen</p>
      <h2 className="mt-2 font-editorial text-2xl font-medium text-hb-ink md:text-3xl">
        {fornavn ? `Velkommen i The Boardroom, ${fornavn}` : "Velkommen i The Boardroom"}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-hb-ink-soft">
        Her er en kort gennemgang af, hvordan du får mest ud af platformen. Tjeklisten nederst på siden følger med dig, indtil alt er på plads.
      </p>
      {/* Pladsholderen — erstattes af HbVideoEmbed, se kommentaren ovenfor. */}
      <div className="mt-5 flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-hb border border-dashed border-hb-line bg-hb-sage/30">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-hb-surface text-hb-evergreen shadow-hb-hover">
          <Play className="ml-0.5 h-6 w-6" />
        </span>
        <p className="text-sm text-hb-ink-soft">Velkomstvideoen kommer snart</p>
      </div>
      {fejl && (
        <p className="mt-4 text-sm leading-relaxed text-hb-ink" role="alert">
          {fejl}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <HbButton variant="secondary" onClick={onSeSenere} disabled={gemmer}>
          Se senere
        </HbButton>
        <HbButton onClick={onKomIGang} disabled={gemmer}>
          {gemmer ? "Et øjeblik…" : fejl ? "Prøv igen" : "Kom i gang"}
        </HbButton>
      </div>
    </div>
  </div>
);

// ── Boksen ───────────────────────────────────────────────────────────

const PunktRaekke = ({ punkt, onClick }: { punkt: TjeklistePunkt; onClick: () => void }) => {
  if (punkt.gjort) {
    return (
      <li className="flex items-start gap-3 px-1 py-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-hb-evergreen text-white">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
        <span className="text-sm text-hb-ink-soft line-through decoration-hb-line">{punkt.titel}</span>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-3 rounded-hb px-1 py-2 text-left transition-colors hover:bg-hb-sage/30"
      >
        <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-hb-ink/25" />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-hb-ink">{punkt.titel}</span>
          <span className="block text-xs leading-relaxed text-hb-ink-soft">{punkt.beskrivelse}</span>
          {/* En oplysning, ikke en fejl: ink-soft. Rust er forbeholdt eyebrows og accenter. */}
          {punkt.mangler && punkt.mangler.length > 0 && (
            <span className="mt-0.5 block text-xs text-hb-ink-soft">Mangler: {punkt.mangler.join(", ")}</span>
          )}
        </span>
        {/* Punkter der fører til en side får en dæmpet chevron (Betal.tsx-
            mønstret); velkomsten (sti "") åbner overlejringen og får ingen. */}
        {punkt.sti !== "" && <ChevronRight className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-hb-ink-soft" />}
      </button>
    </li>
  );
};

export interface HbOnboardingTjeklisteProps {
  tjekliste: Tjekliste | null;
  velkomstvideoSetAt: string | null;
  fornavn: string | null;
  lukket: boolean;
  setLukket: (v: boolean) => void;
  /** Tæller der bumpes af sidebarens «Kom godt i gang» — åbner boksen udfoldet. */
  genaabnTick: number;
  markerVelkomstSet: () => Promise<void>;
  /** Skallen får besked når boksen er ÅBEN, så indholdskolonnen kan få
      bund-margin og man kan scrolle forbi den. Sammenfoldet dækker intet. */
  onUdfoldetChange?: (udfoldet: boolean) => void;
}

export const HbOnboardingTjekliste = ({
  tjekliste,
  velkomstvideoSetAt,
  fornavn,
  lukket,
  setLukket,
  genaabnTick,
  markerVelkomstSet,
  onUdfoldetChange,
}: HbOnboardingTjeklisteProps) => {
  const navigate = useNavigate();
  const [udfoldet, setUdfoldet] = useState(false);
  const [videoAaben, setVideoAaben] = useState(false);
  const [stempelFejl, setStempelFejl] = useState<string | null>(null);
  const [videoUdsat, setVideoUdsat] = useState<boolean>(() =>
    typeof window === "undefined" ? false : laesFlag(window.sessionStorage, VELKOMST_UDSAT_KEY),
  );
  const [gemmer, setGemmer] = useState(false);
  const [faerdigSet, setFaerdigSet] = useState<boolean>(() =>
    typeof window === "undefined" ? false : laesFlag(window.localStorage, TJEKLISTE_FAERDIG_SET_KEY),
  );

  // Menuen hentede boksen frem: udfold den. Hooks i topblokken, før
  // enhver betinget return (React #310-lærdommen).
  useEffect(() => {
    if (genaabnTick > 0) {
      setUdfoldet(true);
      setFaerdigSet(false);
    }
  }, [genaabnTick]);

  // Boksen er «åben» for skallen når den er udfoldet, ikke lukket, ikke
  // færdig-og-væk. Lykønskningen er lille og regnes ikke med.
  const synligOgUdfoldet = Boolean(tjekliste) && !lukket && udfoldet && !tjekliste?.faerdig;
  useEffect(() => {
    onUdfoldetChange?.(synligOgUdfoldet);
  }, [synligOgUdfoldet, onUdfoldetChange]);

  if (!tjekliste || lukket) return null;

  // Velkomsten popper op FØRSTE gang: stemplet er null, boksen er ikke
  // lukket, og «Se senere» er ikke trykket i denne session.
  const visVelkomstAutomatisk = velkomstvideoSetAt === null && !videoUdsat;

  const luk = () => {
    setLukket(true);
    setUdfoldet(false);
  };

  const komIGang = async () => {
    setGemmer(true);
    setStempelFejl(null);
    try {
      await markerVelkomstSet();
      // KUN ved succes lukkes der. Rettet 2/9: før lukkede overlejringen i
      // finally uanset udfald og satte «udsat» — en fejlet skrivning så ud
      // som om den virkede, og velkomsten poppede op igen ved næste
      // session, mens punktet aldrig blev krydset af.
      setVideoAaben(false);
      skrivFlag(window.sessionStorage, VELKOMST_UDSAT_KEY, true);
      setVideoUdsat(true);
    } catch (err) {
      console.error("[HbOnboardingTjekliste] velkomstvideo_set_at kunne ikke sættes:", err);
      setStempelFejl("Vi kunne ikke gemme, at du har set velkomsten. Prøv igen — eller tryk «Se senere», så spørger vi igen næste gang.");
    } finally {
      setGemmer(false);
    }
  };

  const seSenere = () => {
    setStempelFejl(null);
    skrivFlag(window.sessionStorage, VELKOMST_UDSAT_KEY, true);
    setVideoUdsat(true);
    setVideoAaben(false);
  };

  const gaaTil = (punkt: TjeklistePunkt) => {
    if (punkt.id === "velkomst" || punkt.sti === "") {
      setVideoAaben(true);
      return;
    }
    navigate(punkt.sti);
  };

  const overlejring =
    visVelkomstAutomatisk || videoAaben ? (
      <VelkomstOverlejring fornavn={fornavn} onKomIGang={komIGang} onSeSenere={seSenere} gemmer={gemmer} fejl={stempelFejl} />
    ) : null;

  // ALT ER GJORT: én kort lykønskning, derefter væk. Menuen (genaabnTick)
  // nulstiller faerdigSet, så listen kan ses igen med alle flueben.
  if (tjekliste.faerdig) {
    if (faerdigSet && genaabnTick === 0) return overlejring;
    return (
      <>
        {overlejring}
        <div className={cn(boksKlasser, "p-5")}>
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hb-evergreen text-white">
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-editorial text-lg font-medium text-hb-ink">Alt er på plads</p>
              <p className="mt-1 text-sm leading-relaxed text-hb-ink-soft">
                Du er godt i gang. Tjeklisten trækker sig tilbage nu — den ligger i menuen, hvis du vil se den igen.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                skrivFlag(window.localStorage, TJEKLISTE_FAERDIG_SET_KEY, true);
                setFaerdigSet(true);
                setLukket(true);
              }}
              aria-label="Luk"
              className="rounded-full p-1.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {genaabnTick > 0 && (
            <ul className="mt-4 divide-y divide-hb-line/60">
              {tjekliste.punkter.map((p) => (
                <PunktRaekke key={p.id} punkt={p} onClick={() => gaaTil(p)} />
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  const tekst = `Kom godt i gang · ${tjekliste.antal_gjort} af ${tjekliste.antal_i_alt}`;

  if (!udfoldet) {
    return (
      <>
        {overlejring}
        <div className={cn(boksKlasser, "lg:w-auto")}>
          <button
            type="button"
            onClick={() => setUdfoldet(true)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left"
            aria-expanded={false}
          >
            <span className="text-sm font-medium text-hb-ink">{tekst}</span>
            <span className="ml-auto flex items-center gap-3">
              <span className="hidden h-[3px] w-20 overflow-hidden rounded-full bg-hb-line sm:block">
                <span
                  className="block h-full rounded-full bg-hb-evergreen/70"
                  style={{ width: `${Math.round((tjekliste.antal_gjort / tjekliste.antal_i_alt) * 100)}%` }}
                />
              </span>
              <ChevronUp className="h-4 w-4 text-hb-ink-soft" />
            </span>
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {overlejring}
      <div className={cn(boksKlasser, "max-h-[70vh] overflow-y-auto")}>
        <div className="flex items-center gap-2 px-5 pt-4">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">Kom godt i gang</p>
          <button
            type="button"
            onClick={() => setUdfoldet(false)}
            aria-label="Fold sammen"
            className="ml-auto rounded-full p-1.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={luk}
            aria-label="Luk tjeklisten"
            title="Luk — du finder den igen i menuen"
            className="rounded-full p-1.5 text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pt-2">
          <HbProgressBar done={tjekliste.antal_gjort} total={tjekliste.antal_i_alt} />
        </div>
        <ul className="mt-2 divide-y divide-hb-line/60 px-4 pb-4">
          {tjekliste.punkter.map((p) => (
            <PunktRaekke key={p.id} punkt={p} onClick={() => gaaTil(p)} />
          ))}
        </ul>
      </div>
    </>
  );
};

/** Fast i nederste højre hjørne på lg, fuld bredde i bunden under lg. z-40 < drawerens z-50. */
const boksKlasser =
  "fixed inset-x-0 bottom-0 z-40 rounded-t-hb border border-hb-line bg-hb-surface shadow-hb-hover " +
  "lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-[360px] lg:rounded-hb";
