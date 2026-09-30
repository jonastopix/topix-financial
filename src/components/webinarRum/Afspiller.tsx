import { type MutableRefObject, type ReactNode, useEffect, useRef, useState } from "react";
import playerjs from "player.js";
import { Maximize, Pause, Radio, Volume2, VolumeX } from "lucide-react";
import { spoleDom } from "@/lib/webinarMotor/spolning";
import { AUTOPLAY_VENT_MS, afspillerTilstand, autoplayDom, overlayDom } from "@/lib/webinarRum/overlay";
import type { StraksHaendelse } from "@/lib/webinarRum/pulsplan";

/**
 * Det, pulsen skal vide om afspilleren — skrevet her, læst af rummets puls.
 * En ref, ikke state: timeupdate kommer ~4 gange i sekundet, og intet skal
 * tegnes om for det.
 */
export interface AfspillerSpejl {
  posSek: number;
  sidsteHaendelse: "play" | "pause" | "ended" | null;
  sidsteTidMs: number | null;
  muted: boolean | null;
  /** Spoledommen har hoppet siden sidste puls (pulsen nulstiller). */
  korrigeret: boolean;
  /** Afspilleren viser hovedvideoen (ikke introen) — kun den tæller i set_procent. */
  iHovedvideo: boolean;
}

export const tomtSpejl = (): AfspillerSpejl => ({ posSek: 0, sidsteHaendelse: null, sidsteTidMs: null, muted: null, korrigeret: false, iHovedvideo: false });

/**
 * Bunnys afspiller, holdt på serverens ur (skive 2, 30/9-2026 — spec §A5).
 *
 *   SPOLING FREM: spoleDom (webinarMotor/spolning.ts) ved hver timeupdate —
 *     tolerance 3 s, højst én korrektion pr. 8 s, aldrig under buffering.
 *     Et gennemsigtigt lag dækker kontrolbjælken, så søgebjælken ikke kan
 *     trækkes; vores egne knapper (pause, lyd, fuld skærm) står under videoen.
 *   PAUSE er tilladt: «Webinaret kører videre · Tilbage til webinaret».
 *   IPHONE (plan A): iframen indlæses efter seerens tryk med autoplay og lyd;
 *     står den stadig på pause efter 1,5 s, nægtede browseren lyd — så spilles
 *     der uden, og «Tryk for lyd» vises (autoplayDom). playsinline står i
 *     embed-URL'en (ur.ts:embedParametre).
 * Fejler player.js-koblingen, spiller videoen stadig; kun spolespærren og
 * pulsens position degraderer — ærligt: pulsen sender da position 0 og giver
 * ingen kredit.
 */
export function Afspiller({
  embedUrl,
  iHovedvideo,
  forventetPos,
  spejl,
  onHaendelse,
  titel,
  children,
}: {
  embedUrl: string;
  iHovedvideo: boolean;
  forventetPos: () => number;
  spejl: MutableRefObject<AfspillerSpejl>;
  onHaendelse: (h: StraksHaendelse) => void;
  titel: string;
  children?: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const boksRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<InstanceType<typeof playerjs.Player> | null>(null);
  const sidsteKorrektion = useRef<number | null>(null);
  const cb = useRef({ forventetPos, onHaendelse });
  cb.current = { forventetPos, onHaendelse };
  const [klar, setKlar] = useState(false);
  const [muted, setMuted] = useState<boolean | null>(null);
  const [haendelse, setHaendelse] = useState<"play" | "pause" | "ended" | null>(null);

  useEffect(() => {
    spejl.current.iHovedvideo = iHovedvideo;
  }, [iHovedvideo, spejl]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let aktiv = true;
    let vent: number | undefined;
    setKlar(false);
    setMuted(null);
    setHaendelse(null);
    const s = spejl.current;
    s.sidsteHaendelse = null;
    s.sidsteTidMs = null;
    s.posSek = 0;
    try {
      const player = new playerjs.Player(iframe);
      playerRef.current = player;
      player.on("ready", () => {
        if (!aktiv) return;
        setKlar(true);
        const saet = (h: "play" | "pause" | "ended", ud: StraksHaendelse) => {
          s.sidsteHaendelse = h;
          s.sidsteTidMs = Date.now();
          setHaendelse(h);
          cb.current.onHaendelse(ud);
        };
        player.on("play", () => saet("play", "play"));
        player.on("pause", () => saet("pause", "pause"));
        player.on("ended", () => saet("ended", "ended"));
        player.on("error", () => cb.current.onHaendelse("fejl"));
        player.on("timeupdate", ({ seconds }) => {
          const nu = Date.now();
          s.posSek = seconds;
          const tilstand = afspillerTilstand(s.sidsteHaendelse, s.sidsteTidMs, nu);
          s.sidsteTidMs = nu;
          // Efter et hul i timeupdate (buffer) venter dommen én hændelse; den næste er «spiller» og retter.
          const dom = spoleDom(cb.current.forventetPos(), seconds, tilstand, sidsteKorrektion.current, nu);
          if (dom.art === "hop") {
            player.setCurrentTime(dom.til);
            sidsteKorrektion.current = nu;
            s.korrigeret = true;
          }
        });
        vent = window.setTimeout(() => {
          player.getPaused((pauset) => {
            player.getMuted((m) => {
              if (!aktiv) return;
              const dom = autoplayDom(pauset, m);
              if (dom === "spil_uden_lyd") {
                player.mute();
                player.setCurrentTime(cb.current.forventetPos());
                player.play();
                setMuted(true);
                s.muted = true;
              } else {
                setMuted(m);
                s.muted = m;
              }
            });
          });
        }, AUTOPLAY_VENT_MS);
      });
    } catch {
      // Afspilningen virker; spolespærren og positionen degraderer (se filhovedet).
    }
    return () => {
      aktiv = false;
      if (vent) window.clearTimeout(vent);
      playerRef.current = null;
    };
  }, [embedUrl, spejl]);

  const tilstand = haendelse === "pause" ? "pause" : haendelse === "ended" ? "slut" : "spiller";
  const o = overlayDom({ visning: "live", afspiller: tilstand, muted, klar });

  const tilbageTilLive = () => {
    const p = playerRef.current;
    if (!p) return;
    p.setCurrentTime(cb.current.forventetPos());
    sidsteKorrektion.current = Date.now();
    p.play();
  };
  const slaaLyd = (til: boolean) => {
    const p = playerRef.current;
    if (!p) return;
    if (til) {
      p.unmute();
      p.play();
    } else p.mute();
    setMuted(!til);
    spejl.current.muted = !til;
  };
  const fuldSkaerm = typeof document !== "undefined" && document.fullscreenEnabled;

  const kontrol =
    "inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium text-hb-ink hover:bg-hb-sage/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen disabled:opacity-50";

  return (
    <div>
      <div ref={boksRef} className="relative aspect-video w-full overflow-hidden rounded-hb bg-black">
        <iframe
          // Ny video (intro → hovedvideo) = nyt element: den gamle player.js-kobling kan ikke tale med det nye vindue.
          key={embedUrl}
          ref={iframeRef}
          src={embedUrl}
          title={titel}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin"
        />
        {o.daekKontroller && <div className="absolute inset-x-0 bottom-0 z-10 h-14" aria-hidden="true" data-spolespaerre />}
        {o.visTrykForLyd && (
          <button
            type="button"
            onClick={() => slaaLyd(true)}
            className="absolute left-1/2 top-1/2 z-20 inline-flex h-14 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-hb-evergreen px-7 text-base font-medium text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Volume2 className="h-5 w-5" aria-hidden="true" /> Tryk for lyd
          </button>
        )}
        {o.visTilbageTilLive && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/60 px-6 text-center text-white" role="status">
            <p className="text-base">Webinaret kører videre.</p>
            <button
              type="button"
              onClick={tilbageTilLive}
              className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-base font-medium text-hb-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              <Radio className="h-5 w-5 text-hb-evergreen" aria-hidden="true" /> Tilbage til webinaret
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {haendelse === "pause" ? (
            <button type="button" className={kontrol} onClick={tilbageTilLive} disabled={!klar}>
              <Radio className="h-4 w-4 text-hb-evergreen" aria-hidden="true" /> Tilbage til webinaret
            </button>
          ) : (
            <button type="button" className={kontrol} onClick={() => playerRef.current?.pause()} disabled={!klar}>
              <Pause className="h-4 w-4" aria-hidden="true" /> Pause
            </button>
          )}
          <button type="button" className={kontrol} onClick={() => slaaLyd(muted !== false)} disabled={!klar} aria-pressed={muted === false}>
            {muted === false ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
            {muted === false ? "Lyd til" : "Lyd fra"}
          </button>
          {fuldSkaerm && (
            <button type="button" className={kontrol} onClick={() => void boksRef.current?.requestFullscreen?.().catch(() => undefined)} aria-label="Fuld skærm">
              <Maximize className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
