import { parseAftaleTekst, type Span } from "@/lib/aftaleMarkdown";
import { cn } from "@/lib/utils";

/** Aftalegrundlaget som læsbar struktur — overskrifter, fed, kursiv, lister — uden HTML fra data
    (aftaleMarkdown.ts; React escaper al tekst). Bruges på /aftale (det ansøgeren skriver under på) og i
    rådgiverens forhåndsvisning, så de to er det samme dokument. */
const Spans = ({ spans }: { spans: readonly Span[] }) => (
  <>
    {spans.map((s, i) => {
      if (s.fed && s.kursiv) return <strong key={i}><em>{s.tekst}</em></strong>;
      if (s.fed) return <strong key={i}>{s.tekst}</strong>;
      if (s.kursiv) return <em key={i}>{s.tekst}</em>;
      return <span key={i}>{s.tekst}</span>;
    })}
  </>
);

export const AftaleDokument = ({ tekst, className }: { tekst: string; className?: string }) => (
  <div className={cn("space-y-3 text-[15px] leading-relaxed text-hb-ink", className)} data-aftale-dokument>
    {parseAftaleTekst(tekst).map((b, i) => {
      switch (b.slags) {
        case "overskrift":
          return b.niveau === 1
            ? <h2 key={i} className="font-editorial text-2xl font-medium leading-tight text-hb-ink pt-2"><Spans spans={b.spans} /></h2>
            : b.niveau === 2
              ? <h3 key={i} className="font-editorial text-lg font-medium text-hb-ink pt-3"><Spans spans={b.spans} /></h3>
              : <h4 key={i} className="text-[15px] font-semibold text-hb-ink pt-2"><Spans spans={b.spans} /></h4>;
        case "liste":
          return (
            <ul key={i} className="list-disc space-y-1 pl-6">
              {b.punkter.map((p, j) => <li key={j}><Spans spans={p} /></li>)}
            </ul>
          );
        case "citat":
          return <blockquote key={i} className="border-l-2 border-hb-line pl-4 text-hb-ink-soft"><Spans spans={b.spans} /></blockquote>;
        case "streg":
          return <hr key={i} className="border-hb-line" />;
        default:
          return <p key={i}><Spans spans={b.spans} /></p>;
      }
    })}
  </div>
);
