import { CalendarPlus } from "lucide-react";
import { kalenderLinks } from "@/lib/webinarRum/links";

/**
 * «Læg i kalender» — Google, Outlook og husets egen .ics fra motoren
 * (webinar-rum GET, handling=ics: stabil UID, så en flyttet session opdaterer
 * samme aftale). Linkene bærer rummets link, som bærer tokenet: det lander i
 * seerens EGEN kalender — samme sted, som mailens link lander.
 */
export function Kalenderknapper({ titel, starterAt, token, rumSti }: { titel: string; starterAt: string; token: string; rumSti: string }) {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
  const rumUrl = `${window.location.origin}${rumSti}`;
  const l = kalenderLinks({ titel, starterAt, rumUrl, supabaseUrl, token });
  const knap =
    "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-hb-ink/25 px-5 text-sm font-medium text-hb-ink hover:bg-hb-sage/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen focus-visible:ring-offset-2";
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-hb-ink">
        <CalendarPlus className="h-4 w-4 text-hb-evergreen" aria-hidden="true" /> Læg det i din kalender
      </p>
      <div className="flex flex-wrap gap-2">
        {l.google && (
          <a className={knap} href={l.google} target="_blank" rel="noopener noreferrer">
            Google
          </a>
        )}
        {l.outlook && (
          <a className={knap} href={l.outlook} target="_blank" rel="noopener noreferrer">
            Outlook
          </a>
        )}
        {supabaseUrl && (
          <a className={knap} href={l.ics} rel="noreferrer">
            Apple / andet (.ics)
          </a>
        )}
      </div>
    </div>
  );
}
