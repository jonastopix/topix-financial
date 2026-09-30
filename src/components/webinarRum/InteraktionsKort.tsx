import { useState } from "react";
import { Check, Star, X } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { cn } from "@/lib/utils";
import type { SeerInteraktion } from "@/lib/webinarRum/api";
import { ansoegUrl } from "@/lib/webinarRum/links";
import { nedtaellingTekst, resterendeSek } from "@/lib/webinarRum/overlay";
import { FELT } from "./stil";

/**
 * Ét kort fra tidslinjen (skive 2, 30/9-2026). Tyndt: HVORNÅR kortet står
 * her, er overlay.ts:kortPaaSkaermen (serverens aktiveInteraktioner på
 * serverens position); HVAD et svar må være, er serverens doemSvar. Kortet
 * tegner blot og sender svaret op.
 *
 * CTA'ens nedtælling er KUN den sande (ctaVindue på serveren — en kilde, vi
 * selv ejer: rummet lukker, næste session starter, en optagsfrist). Uden en
 * sådan står der ingen nedtælling.
 */

const KILDE_TEKST: Record<string, string> = {
  session_slut: "Rummet lukker om",
  naeste_session: "Næste session starter om",
  optag_frist: "Ansøgningsfristen lukker om",
};

export interface KortProps {
  i: SeerInteraktion;
  /** Seerens eget svar (lokalt eller fra serveren) — undefined = ikke besvaret. */
  svar: unknown;
  serverNuMs: number;
  token: string;
  onSvar: (i: SeerInteraktion, svar: Record<string, unknown>) => void;
  onLuk: (id: string) => void;
  onAnsoeg: (i: SeerInteraktion) => void;
}

const tekst = (x: unknown): string => (typeof x === "string" ? x : "");
const liste = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);

export function InteraktionsKort({ i, svar, serverNuMs, token, onSvar, onLuk, onAnsoeg }: KortProps) {
  const [tekstSvar, setTekstSvar] = useState("");
  const [stjerner, setStjerner] = useState(0);
  const besvaret = svar !== undefined;
  const titelId = `kort-${i.id}`;

  return (
    <section aria-labelledby={titelId} className="relative rounded-hb border border-hb-line bg-hb-surface p-5 shadow-hb-hover md:p-6">
      <button
        type="button"
        onClick={() => onLuk(i.id)}
        className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full text-hb-ink-soft hover:bg-hb-sage/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen"
        aria-label="Luk kortet"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      {i.art === "cta" && (
        <div className="pr-8">
          <h3 id={titelId} className="font-editorial text-xl font-medium leading-snug text-hb-ink">
            {tekst(i.indhold.tekst)}
          </h3>
          {(() => {
            const n = i.cta_vindue && i.cta_vindue.nedtaelling ? i.cta_vindue.nedtaelling : null;
            const rest = n ? resterendeSek(n.udloeberMs, serverNuMs) : null;
            return n && rest !== null ? (
              <p className="mt-2 text-sm text-hb-ink-soft">
                {KILDE_TEKST[n.kilde] ?? "Udløber om"} <span className="font-medium tabular-nums text-hb-ink">{nedtaellingTekst(rest)}</span>
              </p>
            ) : null;
          })()}
          <div className="mt-4 flex flex-wrap gap-2">
            {i.indhold.maal === "ansoeg" ? (
              <a
                href={ansoegUrl(token)}
                target="_blank"
                rel="noopener"
                onClick={() => onAnsoeg(i)}
                className="inline-flex h-12 items-center justify-center rounded-full bg-hb-evergreen px-7 text-base font-medium text-white hover:bg-hb-evergreen/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen focus-visible:ring-offset-2"
              >
                {tekst(i.indhold.knap)}
              </a>
            ) : (
              <HbButton type="button" className="h-12 px-7 text-base" onClick={() => onSvar(i, { maal: i.indhold.maal })}>
                {tekst(i.indhold.knap)}
              </HbButton>
            )}
            {i.indhold.maal === "ansoeg" && (
              <HbButton type="button" variant="secondary" className="h-12" onClick={() => { onSvar(i, { maal: "ikke_klar" }); onLuk(i.id); }}>
                Ikke klar endnu
              </HbButton>
            )}
          </div>
        </div>
      )}

      {(i.art === "poll" || i.art === "quiz") && (
        <fieldset className="pr-8">
          <legend id={titelId} className="font-editorial text-xl font-medium leading-snug text-hb-ink">
            {tekst(i.indhold.spoergsmaal)}
          </legend>
          <div className="mt-4 grid gap-2">
            {liste(i.indhold.valg).map((v, n) => {
              const valgt = besvaret && (Array.isArray((svar as { valg?: unknown }).valg) ? ((svar as { valg: number[] }).valg).includes(n) : (svar as { valg?: unknown }).valg === n);
              const rigtigt = i.art === "quiz" && typeof i.indhold.rigtigt === "number" ? i.indhold.rigtigt === n : null;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={besvaret}
                  aria-pressed={valgt}
                  onClick={() => onSvar(i, i.art === "poll" ? { valg: [n] } : { valg: n })}
                  className={cn(
                    "flex min-h-12 w-full items-center justify-between gap-3 rounded-hb border px-4 py-3 text-left text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen",
                    valgt ? "border-hb-evergreen bg-hb-sage/40" : "border-hb-line bg-hb-surface hover:bg-hb-sage/20",
                    rigtigt === true && besvaret ? "border-hb-evergreen" : "",
                    besvaret ? "cursor-default" : "",
                  )}
                >
                  <span>{v}</span>
                  {besvaret && rigtigt === true && <Check className="h-5 w-5 text-hb-evergreen" aria-label="Rigtigt svar" />}
                </button>
              );
            })}
          </div>
          {besvaret && (
            <p className="mt-3 text-sm text-hb-ink-soft" role="status">
              {i.art === "quiz" && typeof i.indhold.forklaring === "string" ? i.indhold.forklaring : "Tak for dit svar."}
            </p>
          )}
        </fieldset>
      )}

      {i.art === "feedback" && (
        <div className="pr-8">
          <h3 id={titelId} className="font-editorial text-xl font-medium leading-snug text-hb-ink">
            {tekst(i.indhold.spoergsmaal)}
          </h3>
          {besvaret ? (
            <p className="mt-3 text-base text-hb-ink-soft" role="status">
              Tak — det betyder meget for os.
            </p>
          ) : (
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (stjerner < 1) return;
                onSvar(i, tekstSvar.trim() ? { stjerner, tekst: tekstSvar.trim() } : { stjerner });
              }}
            >
              <div role="radiogroup" aria-label="Antal stjerner" className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={stjerner === n}
                    aria-label={`${n} ${n === 1 ? "stjerne" : "stjerner"}`}
                    onClick={() => setStjerner(n)}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full hover:bg-hb-sage/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen"
                  >
                    <Star className={cn("h-7 w-7", n <= stjerner ? "fill-hb-evergreen text-hb-evergreen" : "text-hb-ink-soft")} aria-hidden="true" />
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-hb-ink">Hvad tager du med? (valgfrit)</span>
                <textarea className={cn(FELT, "min-h-24")} value={tekstSvar} maxLength={2000} onChange={(e) => setTekstSvar(e.target.value)} />
              </label>
              <HbButton type="submit" className="h-12 px-7 text-base" disabled={stjerner < 1}>
                Send
              </HbButton>
            </form>
          )}
        </div>
      )}

      {i.art === "spoergsmaal_prompt" && (
        <div className="pr-8">
          <h3 id={titelId} className="font-editorial text-xl font-medium leading-snug text-hb-ink">
            {tekst(i.indhold.spoergsmaal)}
          </h3>
          {besvaret ? (
            <p className="mt-3 text-base text-hb-ink-soft" role="status">
              Tak for dit svar.
            </p>
          ) : (
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (tekstSvar.trim()) onSvar(i, { tekst: tekstSvar.trim() });
              }}
            >
              <textarea aria-labelledby={titelId} className={cn(FELT, "min-h-24")} value={tekstSvar} maxLength={2000} onChange={(e) => setTekstSvar(e.target.value)} />
              <HbButton type="submit" className="h-12 px-7 text-base" disabled={!tekstSvar.trim()}>
                Send
              </HbButton>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
