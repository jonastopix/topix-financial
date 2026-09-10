/**
 * HbKlokke — klokken i Hjemmebanes sidebar, medlem og rådgiver (10/9-2026).
 * De rene dele: lib/hjemmebane/klokke.ts. Data: useNotifications (medlem,
 * RPC mark_notifications_seen) og useAdvisorNotifications (rådgiver).
 *
 * HVOR: en række i sidebaren over menuen — samme udtryk som «Kom godt i
 * gang»-knappen (ikon + label), med mærke-mønstrets pille (sage/evergreen,
 * prik, aldrig rust, aldrig blinkende) når der er et tal. Ingen pille når
 * tallet er 0. Sidebarens indhold deles af desktop-kolonnen og mobil-
 * draweren, så klokken findes begge steder uden ekstra kode.
 *
 * VED KLIK (afgjort): en UDFOLDNING lige under rækken — ikke en side, ikke
 * en popover. Sidebaren er sin egen scroll-kolonne, udfoldningen virker ens
 * i kolonnen og i draweren, og den portalerer ikke (HbOverlejring rettes af
 * det andet vindue i dag). De nyeste ti linjer; en ny linje har prik og
 * mørk tekst, en læst er dæmpet; klik på en linje markerer læst og følger
 * dens vej. «Intet nyt.» når listen er tom.
 *
 * SET I APPEN BLIVER SANDT: åbner MEDLEMMET udfoldningen, kaldes
 * markAllSeen → RPC mark_notifications_seen → notifications.seen_at = now().
 * Det er præcis den kolonne send-notification-email filtrerer på
 * (.is("seen_at", null), index.ts:180), så en notifikation medlemmet har
 * set i klokken, mailes ikke. Pillen forsvinder i samme øjeblik (unseenCount
 * læser seen_at); linjen bliver ved med at være «ny» til den er læst
 * (read_at) — set er ikke læst.
 *
 * RÅDGIVEREN har ingen seen_at (advisor_notifications): pillen tæller
 * ulæste, og «Markér alle som læst» står i udfoldningen som i den gamle
 * klokke. Drift står i samme liste, mærket «Drift» (lib, filhovedet).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Bell, ChevronDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { da } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { useAdvisorNotifications } from "@/hooks/useAdvisorNotifications";
import {
  KLOKKE_LABEL,
  KLOKKE_TOM,
  medlemsLinje,
  nyesteFoerst,
  pilleTekst,
  raadgiverLinje,
  taelUlaeste,
  taelUsete,
  type KlokkeLinje,
} from "@/lib/hjemmebane/klokke";

const tidOrd = (iso: string): string => {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: da });
  } catch {
    return "";
  }
};

/** Rækken + udfoldningen — rollefri; data kommer fra kalderen. */
const KlokkeSkal = ({
  antal, linjer, onAabn, onLinje, alleLaest,
}: {
  antal: number;
  linjer: KlokkeLinje[];
  /** Kaldes når udfoldningen ÅBNES (medlem: markAllSeen). */
  onAabn?: () => void;
  onLinje: (l: KlokkeLinje) => void;
  /** «Markér alle som læst» — kun rådgiveren har den. */
  alleLaest?: () => void;
}) => {
  const [aaben, setAaben] = useState(false);
  const pille = pilleTekst(antal);
  const toggle = () => {
    const naeste = !aaben;
    setAaben(naeste);
    if (naeste) onAabn?.();
  };
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={aaben}
        className="flex h-10 w-full items-center gap-2 rounded-full px-4 text-left text-[15px] text-hb-ink-soft transition-colors hover:bg-hb-sage/30 hover:text-hb-ink"
      >
        <Bell className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{KLOKKE_LABEL}</span>
        {pille && (
          <span
            aria-label={`${antal} nye`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-hb-sage px-2.5 py-1 text-[11px] font-medium text-hb-evergreen"
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-hb-evergreen" />
            {pille}
          </span>
        )}
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", aaben && "rotate-180")} />
      </button>
      {aaben && (
        <div className="ml-4 mt-1 border-l border-hb-ink/15 pl-4">
          {linjer.length === 0 ? (
            <p className="py-2 text-sm text-hb-ink-soft">{KLOKKE_TOM}</p>
          ) : (
            <ul className="divide-y divide-hb-line">
              {linjer.map((l) => {
                const indhold = (
                  <>
                    <span className="flex items-start gap-2">
                      <span aria-hidden className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", l.ny ? "bg-hb-evergreen" : "bg-transparent")} />
                      <span className="min-w-0">
                        <span className={cn("block text-sm leading-snug", l.ny ? "font-medium text-hb-ink" : "text-hb-ink-soft")}>{l.titel}</span>
                        {l.tekst && <span className="mt-0.5 line-clamp-2 block text-xs text-hb-ink-soft">{l.tekst}</span>}
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-hb-ink-soft">
                          <span>{tidOrd(l.tid)}</span>
                          {l.maerke && <span className="rounded-full bg-hb-sage px-2 py-0.5 font-medium text-hb-evergreen">{l.maerke}</span>}
                        </span>
                      </span>
                    </span>
                  </>
                );
                const klasse = "block w-full py-2 text-left transition-colors hover:text-hb-ink";
                return (
                  <li key={l.id}>
                    {l.til ? (
                      <Link to={l.til} onClick={() => onLinje(l)} className={klasse}>{indhold}</Link>
                    ) : (
                      <button type="button" onClick={() => onLinje(l)} className={klasse}>{indhold}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {alleLaest && antal > 0 && (
            <button type="button" onClick={alleLaest} className="mt-2 text-xs text-hb-evergreen underline-offset-4 hover:underline">
              Markér alle som læst
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const HbKlokkeMedlem = () => {
  const { notifications, unseenCount, markAllSeen, markRead } = useNotifications();
  const linjer = nyesteFoerst(notifications).map(medlemsLinje);
  // unseenCount er hookens egen; taelUsete er samme regel som ren funktion (låst af test).
  const antal = unseenCount || taelUsete(notifications);
  return (
    <KlokkeSkal
      antal={antal}
      linjer={linjer}
      onAabn={() => void markAllSeen()}
      onLinje={(l) => { if (l.ny) void markRead(l.id); }}
    />
  );
};

const HbKlokkeRaadgiver = () => {
  const { notifications, markAsRead, markAllRead } = useAdvisorNotifications();
  const linjer = nyesteFoerst(notifications).map(raadgiverLinje);
  return (
    <KlokkeSkal
      antal={taelUlaeste(notifications)}
      linjer={linjer}
      onLinje={(l) => { if (l.ny) void markAsRead(l.id); }}
      alleLaest={() => void markAllRead()}
    />
  );
};

/** Vælger klokken efter rollen. Hooks bor i hver sin komponent, så ingen hook er betinget. */
export const HbKlokke = () => {
  const { user, isAdvisor } = useAuth();
  if (!user) return null;
  return isAdvisor ? <HbKlokkeRaadgiver /> : <HbKlokkeMedlem />;
};
