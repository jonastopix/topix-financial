import { type KeyboardEvent, useId } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HB_EYEBROW, HB_INPUT } from "@/components/hjemmebane/hbFormKlasser";
import { cn } from "@/lib/utils";
import { fokusUdenScroll } from "@/lib/fokusUdenScroll";
import {
  type AnsoegningsSvar,
  type CvrVisning,
  type FeltId,
  HJEMMESIDE_INGEN,
  OMSAETNINGSINTERVALLER,
  SKAERME,
  START_TIDSPUNKTER,
  TEKST_MIN,
  WEBINAR_SVAR,
} from "@/lib/ansoegning/skema";
import {
  CVR_FINDES_IKKE,
  CVR_FORTSAET_ALLIGEVEL,
  CVR_IKKE_AKTIV,
  CVR_JA,
  CVR_NAVN_FEJL,
  CVR_NAVN_SPOERGSMAAL,
  CVR_NEJ,
  CVR_RIGTIGT,
  CVR_UTILGAENGELIG,
  HJEMMESIDE_INGEN_KNAP,
  PERSONDATA_STI,
  SAMTYKKE_LINJE,
  SAMTYKKE_LINK,
  skaermTekst,
} from "@/lib/ansoegning/spoergsmaal";

/** Det CVR-skærmen kan stå i, udover «tast nummeret». */
export type CvrTilstand =
  | { slags: "tom" }
  | { slags: "slaar_op" }
  | { slags: "fundet"; visning: CvrVisning; saetning: string; aktiv: boolean }
  | { slags: "findes_ikke" }
  | { slags: "utilgaengelig" };

export interface AnsoegSkaermProps {
  skaerm: number;
  /** Kladden — det der står i felterne lige nu (strenge, som brugeren tastede). */
  kladde: Partial<Record<FeltId, string>>;
  fejl: Partial<Record<FeltId, string>>;
  onKladde: (felt: FeltId, vaerdi: string) => void;
  onNaeste: () => void;
  onTilbage: () => void;
  /** «Vi har ingen hjemmeside». */
  onIngenHjemmeside: () => void;
  gemmer: boolean;
  gemt: boolean;
  cvr: CvrTilstand;
  onCvrJa: () => void;
  onCvrNej: () => void;
  onCvrFortsaet: () => void;
  /** Hvad CVR sagde om ansatte — vises som hint på ansatte-skærmen. */
  cvrAnsatteHint: string | null;
  svar: AnsoegningsSvar;
  /** Honningfeltet «firma» (Jonas 18/9, punkt 6): et menneske ser det ikke, en bot udfylder det. Sendes med «opret». */
  honning: string;
  onHonning: (vaerdi: string) => void;
  /** Fallback (18/9): virksomhedsnavnet tastet af ansøgeren, når CVR ikke kunne slås op. */
  virksomhedsnavn: string;
  onVirksomhedsnavn: (vaerdi: string) => void;
  virksomhedsnavnFejl: string | null;
}

/** Ude af flow, ude af skærmen, ude af tab-rækkefølgen og ude af oplæsning — men i DOM'en, så en bot finder det. */
const HONNING_STIL = { position: "absolute", left: "-10000px", top: "auto", width: "1px", height: "1px", overflow: "hidden" } as const;

const VALG_KNAP =
  "flex w-full items-center justify-between rounded-hb border px-4 py-3.5 text-left text-[15px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60";

function Valg({ valgt, label, onClick }: { valgt: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={valgt}
      className={cn(VALG_KNAP, valgt ? "border-hb-evergreen bg-hb-sage/40 text-hb-ink" : "border-hb-line bg-hb-surface text-hb-ink hover:bg-hb-sage/20")}
    >
      <span>{label}</span>
      {valgt && <Check className="h-4 w-4 text-hb-evergreen" aria-hidden="true" />}
    </button>
  );
}

/**
 * Én skærm: eyebrow, spørgsmålet i Fraunces, ét (eller to) felter, fejlen
 * under feltet, «Tilbage» som tekst og «Næste» som den ene fyldte knap.
 * Enter går videre i enlinjefelter; i tekstfelter er det Ctrl/Cmd+Enter,
 * så et linjeskift ikke sender. Mobil først: fuld bredde, store tapflader.
 */
export const AnsoegSkaerm = (p: AnsoegSkaermProps) => {
  const def = SKAERME[p.skaerm];
  const tekst = skaermTekst(def.id);
  const idBase = useId();
  const sidste = p.skaerm === SKAERME.length - 1;
  const knapTekst = tekst.knap ?? "Næste";

  const enter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      p.onNaeste();
    }
  };
  const enterTekst = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      p.onNaeste();
    }
  };

  const felt = (id: FeltId, props: { type?: string; inputMode?: "numeric" | "email" | "tel" | "url" | "text"; autoComplete?: string; label?: string }) => {
    const fejl = p.fejl[id];
    const htmlId = `${idBase}-${id}`;
    return (
      <div key={id} className="space-y-1.5">
        {props.label && (
          <label htmlFor={htmlId} className="block text-xs font-medium text-hb-ink-soft">
            {props.label}
          </label>
        )}
        <input
          id={htmlId}
          type={props.type ?? "text"}
          inputMode={props.inputMode}
          autoComplete={props.autoComplete}
          value={p.kladde[id] ?? ""}
          onChange={(e) => p.onKladde(id, e.target.value)}
          onKeyDown={enter}
          placeholder={tekst.placeholder?.[id]}
          aria-invalid={fejl ? true : undefined}
          aria-describedby={fejl ? `${htmlId}-fejl` : undefined}
          className={cn(HB_INPUT, "text-lg", fejl && "border-hb-rust")}
          ref={def.felter[0] === id ? fokusUdenScroll : undefined}
        />
        {fejl && (
          <p id={`${htmlId}-fejl`} className="text-sm text-hb-rust" role="alert">
            {fejl}
          </p>
        )}
      </div>
    );
  };

  const langtekst = (id: FeltId) => {
    const fejl = p.fejl[id];
    const htmlId = `${idBase}-${id}`;
    const laengde = (p.kladde[id] ?? "").trim().length;
    return (
      <div className="space-y-1.5">
        <textarea
          id={htmlId}
          rows={6}
          value={p.kladde[id] ?? ""}
          onChange={(e) => p.onKladde(id, e.target.value)}
          onKeyDown={enterTekst}
          placeholder={tekst.placeholder?.[id]}
          aria-invalid={fejl ? true : undefined}
          aria-describedby={fejl ? `${htmlId}-fejl` : undefined}
          className={cn(HB_INPUT, "resize-y text-base leading-relaxed", fejl && "border-hb-rust")}
          ref={fokusUdenScroll}
        />
        <div className="flex items-baseline justify-between gap-3">
          {fejl ? (
            <p id={`${htmlId}-fejl`} className="text-sm text-hb-rust" role="alert">
              {fejl}
            </p>
          ) : (
            <span />
          )}
          <span className={cn("shrink-0 text-xs", laengde < TEKST_MIN ? "text-hb-ink-soft" : "text-hb-evergreen")} aria-live="polite">
            {laengde < TEKST_MIN ? `${laengde} af mindst ${TEKST_MIN} tegn` : "Godt — skriv gerne mere"}
          </span>
        </div>
      </div>
    );
  };

  const valgListe = (id: FeltId, valg: readonly { noegle: string; label: string }[]) => (
    <div className="space-y-2" role="group" aria-label={tekst.spoergsmaal}>
      {valg.map((v) => (
        <Valg key={v.noegle} valgt={p.kladde[id] === v.noegle} label={v.label} onClick={() => p.onKladde(id, v.noegle)} />
      ))}
      {p.fejl[id] && (
        <p className="text-sm text-hb-rust" role="alert">
          {p.fejl[id]}
        </p>
      )}
    </div>
  );

  let krop: JSX.Element;
  switch (def.id) {
    case "cvr":
      krop = (
        <div className="space-y-4">
          {felt("cvr", { inputMode: "numeric", autoComplete: "off" })}
          <div aria-hidden="true" style={HONNING_STIL}>
            <label htmlFor={`${idBase}-firma`}>Firma</label>
            <input id={`${idBase}-firma`} name="firma" type="text" tabIndex={-1} autoComplete="off" value={p.honning} onChange={(e) => p.onHonning(e.target.value)} />
          </div>
          {p.cvr.slags === "fundet" && (
            <div className="rounded-hb border border-hb-evergreen/30 bg-hb-sage/30 p-4">
              <p className="font-editorial text-xl font-medium leading-snug text-hb-ink">
                {p.cvr.saetning} <span className="text-hb-ink-soft">{CVR_RIGTIGT}</span>
              </p>
              {p.cvr.visning.selskabsform && (
                <p className="mt-1 text-sm text-hb-ink-soft">
                  {p.cvr.visning.selskabsform}
                  {p.cvr.visning.branche ? ` · ${p.cvr.visning.branche}` : ""}
                </p>
              )}
              {!p.cvr.aktiv && <p className="mt-2 text-sm text-hb-rust">{CVR_IKKE_AKTIV}</p>}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <HbButton type="button" onClick={p.onCvrJa} disabled={p.gemmer} ref={fokusUdenScroll}>
                  {CVR_JA}
                </HbButton>
                <HbButton type="button" variant="secondary" onClick={p.onCvrNej} disabled={p.gemmer}>
                  {CVR_NEJ}
                </HbButton>
              </div>
            </div>
          )}
          {(p.cvr.slags === "findes_ikke" || p.cvr.slags === "utilgaengelig") && (
            <div className="rounded-hb border border-hb-line bg-hb-surface p-4" data-cvr-fallback>
              <p className="text-sm leading-relaxed text-hb-ink">{p.cvr.slags === "findes_ikke" ? CVR_FINDES_IKKE : CVR_UTILGAENGELIG}</p>
              {/* Fallback (Jonas 18/9): navnet tastes selv, så mails og rådgiversiden aldrig siger «{navn}s virksomhed». */}
              <label htmlFor={`${idBase}-virksomhedsnavn`} className="mt-4 block text-xs font-medium text-hb-ink-soft">
                {CVR_NAVN_SPOERGSMAAL}
              </label>
              <input
                id={`${idBase}-virksomhedsnavn`}
                type="text"
                autoComplete="organization"
                value={p.virksomhedsnavn}
                onChange={(e) => p.onVirksomhedsnavn(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    p.onCvrFortsaet();
                  }
                }}
                aria-invalid={p.virksomhedsnavnFejl ? true : undefined}
                className={cn(HB_INPUT, "mt-1.5", p.virksomhedsnavnFejl && "border-hb-rust")}
                ref={fokusUdenScroll}
              />
              {p.virksomhedsnavnFejl && (
                <p className="mt-1.5 text-sm text-hb-rust" role="alert">
                  {p.virksomhedsnavnFejl}
                </p>
              )}
              <HbButton type="button" onClick={p.onCvrFortsaet} disabled={p.gemmer} className="mt-3">
                {CVR_FORTSAET_ALLIGEVEL}
              </HbButton>
            </div>
          )}
        </div>
      );
      break;
    case "hjemmeside":
      krop = (
        <div className="space-y-3">
          {felt("hjemmeside", { inputMode: "url", autoComplete: "url" })}
          <button
            type="button"
            onClick={p.onIngenHjemmeside}
            className={cn("text-sm font-medium underline-offset-4 hover:underline", p.kladde.hjemmeside === HJEMMESIDE_INGEN && p.svar.hjemmeside === HJEMMESIDE_INGEN ? "text-hb-ink" : "text-hb-evergreen")}
          >
            {HJEMMESIDE_INGEN_KNAP}
          </button>
        </div>
      );
      break;
    case "omsaetning":
      krop = valgListe("omsaetningsinterval", OMSAETNINGSINTERVALLER);
      break;
    case "ansatte":
      krop = (
        <div className="space-y-2">
          {felt("antal_ansatte", { inputMode: "numeric", autoComplete: "off" })}
          {p.cvrAnsatteHint && <p className="text-sm text-hb-ink-soft">CVR siger {p.cvrAnsatteHint}.</p>}
        </div>
      );
      break;
    case "navn":
      krop = felt("navn", { autoComplete: "name" });
      break;
    case "kontakt":
      krop = (
        <div className="space-y-4">
          {felt("email", { type: "email", inputMode: "email", autoComplete: "email", label: "E-mail" })}
          {felt("telefon", { type: "tel", inputMode: "tel", autoComplete: "tel", label: "Telefon" })}
        </div>
      );
      break;
    case "udfordring":
    case "proevet":
    case "om_tolv_maaneder":
      krop = langtekst(def.felter[0]);
      break;
    case "start":
      krop = valgListe("start_tidspunkt", START_TIDSPUNKTER);
      break;
    case "webinar":
      krop = valgListe("set_webinar", WEBINAR_SVAR);
      break;
  }

  const cvrVenter = def.id === "cvr" && (p.cvr.slags === "fundet" || p.cvr.slags === "slaar_op");

  return (
    <div className="mx-auto max-w-xl">
      <p className={HB_EYEBROW}>{tekst.eyebrow}</p>
      <h1 className="mt-3 font-editorial text-3xl font-medium leading-tight text-hb-ink md:text-4xl">{tekst.spoergsmaal}</h1>
      {tekst.hjaelp && <p className="mt-2 text-base leading-relaxed text-hb-ink-soft">{tekst.hjaelp}</p>}

      <div className="mt-7">{krop}</div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <button type="button" onClick={p.onTilbage} className="inline-flex items-center gap-1.5 text-sm font-medium text-hb-ink-soft hover:text-hb-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Tilbage
        </button>
        <div className="flex items-center gap-3">
          <span className={cn("text-xs text-hb-ink-soft transition-opacity", p.gemt && !p.gemmer ? "opacity-100" : "opacity-0")} aria-live="polite">
            Gemt
          </span>
          {!cvrVenter && (
            <HbButton type="button" onClick={p.onNaeste} disabled={p.gemmer}>
              {p.gemmer ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {knapTekst}
              {!sidste && !p.gemmer && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </HbButton>
          )}
        </div>
      </div>
      {def.felter.length === 1 && ["udfordring", "proevet", "om_tolv_maaneder"].includes(def.id) && (
        <p className="mt-3 text-right text-xs text-hb-ink-soft">Ctrl + Enter går videre</p>
      )}
      {sidste && (
        <p className="mt-5 text-xs leading-relaxed text-hb-ink-soft">
          {SAMTYKKE_LINJE}{" "}
          <Link to={PERSONDATA_STI} target="_blank" rel="noopener" className="text-hb-evergreen underline-offset-4 hover:underline">
            {SAMTYKKE_LINK}
          </Link>
        </p>
      )}
    </div>
  );
};
