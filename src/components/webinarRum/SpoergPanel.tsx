import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { cn } from "@/lib/utils";
import { FELT } from "./stil";

export interface EgetSpoergsmaal {
  klientId: string;
  tekst: string;
  svar: string | null;
  /** Serveren har kvitteret (udfald ok/dublet). */
  modtaget: boolean;
  /** Serveren afviste (rummet lukket, ugyldigt) — ærligt i stedet for et tavst tab. */
  afvist: boolean;
}

/**
 * «Spørg Morten» — privat, ingen offentlig chatstrøm (spec §A7). Et spørgsmål
 * lander i webinar_spoergsmaal og i rådgiverens kø; svaret rider med pulsens
 * svar og vises her. INGEN simuleret historik, intet opdigtet «Morten skriver …».
 *
 * TEKSTEN ER SAND OM I DAG: svar på mail til den, der er gået, er skive 5
 * (webinar-svar-cron) og er ikke bygget — derfor loves det ikke.
 */
export function SpoergPanel({
  vaertNavn,
  fornavn,
  spoergsmaal,
  onSend,
  kompakt = false,
}: {
  vaertNavn: string;
  fornavn: string | null;
  spoergsmaal: readonly EgetSpoergsmaal[];
  onSend: (tekst: string) => void;
  kompakt?: boolean;
}) {
  const [tekst, setTekst] = useState("");
  const felt = "spoerg-felt";
  return (
    <section aria-labelledby="spoerg-titel" className={cn("rounded-hb border border-hb-line bg-hb-surface", kompakt ? "p-4" : "p-5 md:p-6")}>
      <h2 id="spoerg-titel" className="flex items-center gap-2 font-editorial text-xl font-medium text-hb-ink">
        <MessageCircle className="h-5 w-5 text-hb-evergreen" aria-hidden="true" /> Spørg {vaertNavn}
      </h2>
      <p className="mt-1 text-sm text-hb-ink-soft">
        {fornavn ? `Hej ${fornavn} — ` : ""}skriv dit spørgsmål her. Kun {vaertNavn} ser det, og svaret kommer her i rummet.
      </p>

      {spoergsmaal.length > 0 && (
        <ul className="mt-4 space-y-3" aria-live="polite">
          {spoergsmaal.map((s) => (
            <li key={s.klientId} className="border-t border-hb-line pt-3 text-base">
              <p className="text-hb-ink">{s.tekst}</p>
              {s.svar ? (
                <p className="mt-2 rounded-hb bg-hb-sage/40 px-3 py-2 text-hb-ink">
                  <span className="block text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">{vaertNavn} svarer</span>
                  {s.svar}
                </p>
              ) : s.afvist ? (
                <p className="mt-1 text-sm text-hb-rust">Spørgsmålet kom ikke frem — rummet er lukket.</p>
              ) : (
                <p className="mt-1 text-sm text-hb-ink-soft">{s.modtaget ? `Sendt — ${vaertNavn} svarer her.` : "Sender …"}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const t = tekst.trim();
          if (!t) return;
          onSend(t);
          setTekst("");
        }}
      >
        <label htmlFor={felt} className="sr-only">
          Dit spørgsmål til {vaertNavn}
        </label>
        <textarea
          id={felt}
          className={cn(FELT, "min-h-24")}
          value={tekst}
          maxLength={2000}
          placeholder={`Hvad vil du spørge ${vaertNavn} om?`}
          onChange={(e) => setTekst(e.target.value)}
        />
        <HbButton type="submit" className="h-12 px-7 text-base" disabled={!tekst.trim()}>
          Send spørgsmål
        </HbButton>
      </form>
    </section>
  );
}
