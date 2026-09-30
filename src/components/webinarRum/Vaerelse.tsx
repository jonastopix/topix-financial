import { useState } from "react";
import { Check, Volume2, Wifi, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { forbindelsesDom } from "@/lib/webinarRum/overlay";
import { Nedtaelling } from "./Nedtaelling";
import { BROED, EYEBROW, H1 } from "./stil";

/**
 * Venteværelset (spec §A4): rolig intro, stor nedtælling på serverens ur og en
 * tjekliste med tre tjek.
 *   1. LYDEN: en kort tone, spillet af siden selv (Web Audio — ingen fil, ingen
 *      afhængighed). Trykket er samtidig den gestus, der låser lyd op i
 *      browseren — overføres den ikke til Bunnys iframe (WebKit), tager
 *      «Tryk for lyd» over i rummet.
 *   2. FORBINDELSEN: den mindste rundtur til serveren, MÅLT (samme målinger som
 *      uret) — aldrig et gæt.
 *   3. «Hold fanen åben — webinaret starter af sig selv.» Og det gør det: den,
 *      der sidder her, når det begynder, er gået ind (fase.ts:gaarIndAfSigSelv).
 * «X venter i rummet» står kun, når serveren giver et tal (fra 10, aldrig
 * pustet op — beslutning G1).
 */
export function Vaerelse({
  titel,
  vaertNavn,
  vaertBillede,
  sekTilStart,
  rttMs,
  iRummet,
  onLydtest,
  children,
}: {
  titel: string;
  vaertNavn: string;
  vaertBillede: string | null;
  sekTilStart: number;
  rttMs: number | null;
  iRummet: number | null;
  onLydtest: () => void;
  children?: React.ReactNode;
}) {
  const [lydTestet, setLydTestet] = useState(false);
  const forbindelse = forbindelsesDom(rttMs);

  const spilTone = () => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
      osc.onended = () => void ctx.close().catch(() => undefined);
    } catch {
      // Ingen Web Audio — tjekket er stadig et tryk.
    }
    setLydTestet(true);
    onLydtest();
  };

  const punkt = "flex items-start gap-3 border-t border-hb-line py-4 first:border-t-0";
  return (
    <div className="space-y-8">
      <header className="text-center">
        <p className={EYEBROW}>Venteværelset</p>
        <h1 className={cn(H1, "mt-2")}>{titel}</h1>
        <div className="mt-4 flex items-center justify-center gap-3">
          {vaertBillede && <img src={vaertBillede} alt="" className="h-10 w-10 rounded-full object-cover" />}
          <p className={BROED}>Med {vaertNavn}</p>
        </div>
      </header>

      <Nedtaelling sek={sekTilStart} label="Starter om" />
      {iRummet !== null && <p className="text-center text-sm text-hb-ink-soft">{iRummet} venter i rummet</p>}

      <section aria-labelledby="tjek-titel" className="rounded-hb border border-hb-line bg-hb-surface px-5 md:px-6">
        <h2 id="tjek-titel" className="sr-only">
          Klar til start
        </h2>
        <ul>
          <li className={punkt}>
            {lydTestet ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-hb-evergreen" aria-hidden="true" /> : <Volume2 className="mt-0.5 h-5 w-5 shrink-0 text-hb-ink-soft" aria-hidden="true" />}
            <div className="flex-1">
              <p className="text-base font-medium text-hb-ink">Test lyden</p>
              <p className="text-sm text-hb-ink-soft">{lydTestet ? "Hørte du tonen? Så er lyden klar." : "Tryk og lyt efter en kort tone."}</p>
            </div>
            <button
              type="button"
              onClick={spilTone}
              className="inline-flex h-11 shrink-0 items-center rounded-full border border-hb-ink/25 px-5 text-sm font-medium text-hb-ink hover:bg-hb-sage/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen"
            >
              {lydTestet ? "Igen" : "Spil tone"}
            </button>
          </li>
          <li className={punkt}>
            {forbindelse.niveau === "god" || forbindelse.niveau === "ok" ? (
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-hb-evergreen" aria-hidden="true" />
            ) : (
              <Wifi className="mt-0.5 h-5 w-5 shrink-0 text-hb-ink-soft" aria-hidden="true" />
            )}
            <div>
              <p className="text-base font-medium text-hb-ink">Forbindelsen</p>
              <p className="text-sm text-hb-ink-soft">{forbindelse.tekst}</p>
            </div>
          </li>
          <li className={punkt}>
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-hb-evergreen" aria-hidden="true" />
            <div>
              <p className="text-base font-medium text-hb-ink">Hold fanen åben</p>
              <p className="text-sm text-hb-ink-soft">Webinaret starter af sig selv.</p>
            </div>
          </li>
        </ul>
      </section>

      {children}
    </div>
  );
}
