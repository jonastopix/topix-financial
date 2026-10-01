import { HbSection } from "@/components/hjemmebane/HbSection";
import { cn } from "@/lib/utils";
import {
  VARME_EYEBROW,
  VARME_FORKLARING,
  VARME_TITEL,
  VARME_TOM_TEKST,
  type VarmtLead,
} from "@/lib/webinar/varmeLeads";

/**
 * VARME LEADS — KUN rådgiverens /webinar (udkast 1/10-2026).
 *
 * Nicklas: «Jonas ringer til alle, der har set mindst 75 % og omsætter over 2
 * mio., inden for 24 timer.» Listen er dommens (`varmeLeads` i
 * lib/webinar/varmeLeads.ts) — fladen tegner den, nyeste først, og regner intet:
 * tiden («så webinaret for …» / «webinaret begyndte for …») og flagets ord er
 * dommens (`sidenOrd`, `flagOrd`), valgt efter `tidKilde`.
 *
 * PERSONDATA: navn og mail. Komponenten monteres KUN af WebinarView
 * (rådgiveren) gennem WebinarVisnings `varme`-prop; DeltWebinar giver den aldrig
 * ind, og webinar-delt kender ikke dommen (kildeværn: varmeLeads.test.ts).
 *
 * Ingen «ringet»-markering: den kræver en tabel og er næste skridt.
 */
export const VarmeLeadsAfsnit = ({ leads }: { leads: readonly VarmtLead[] }) => (
  <HbSection eyebrow={VARME_EYEBROW} title={VARME_TITEL} hairline className="mt-10 md:mt-12">
    <p className="mb-4 text-sm text-hb-ink-soft">{VARME_FORKLARING}</p>
    {leads.length === 0 ? (
      <p className="text-sm text-hb-ink-soft" data-varme-leads="tom">{VARME_TOM_TEKST}</p>
    ) : (
      <ul data-varme-leads={leads.length}>
        {leads.map((l) => (
          <li key={l.email} className="border-t border-hb-line py-3 last:border-b" data-varmt-lead={l.inden24Timer ? "inden-24" : "senere"} data-tid-kilde={l.tidKilde}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="min-w-0 text-sm">
                <span className="font-medium text-hb-ink">{l.navn ?? "uden navn"}</span>
                <a className="ml-2 break-all text-hb-evergreen underline-offset-2 hover:underline" href={`mailto:${l.email}`}>{l.email}</a>
              </p>
              <span
                className={cn(
                  "rounded-full border px-1.5 text-[10px]",
                  l.inden24Timer ? "border-hb-rust/40 text-hb-rust" : "border-hb-line text-hb-ink-soft",
                )}
              >
                {l.flagOrd}
              </span>
            </div>
            <p className="mt-1 text-xs text-hb-ink-soft">
              {l.dato ? `Webinaret ${l.dato}` : "Webinaret"}
              {l.titel ? ` · ${l.titel}` : ""}
              {l.procent !== null ? ` · ${l.procent} % set` : " · set færdigt"}
              {` · ${l.sidenOrd}`}
            </p>
          </li>
        ))}
      </ul>
    )}
  </HbSection>
);

export default VarmeLeadsAfsnit;
