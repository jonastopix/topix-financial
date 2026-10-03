import { useEffect, useRef } from "react";
import { forudfyld } from "@/lib/webinarRum/api";
import { laesWt } from "@/lib/webinarRum/links";

/**
 * Ansøgningen fra webinarrummets knap (skive 2, 30/9-2026 — spec §A9: «der
 * hvor 11 af 17 forsvandt»). Knappen åbner /ansoeg?kilde=webinar#wt=<token>.
 * Tokenet står i FRAGMENTET: det sendes aldrig til en server, heller ikke i en
 * Referer, og intet persondata står i URL'en. Her læses det én gang ved mount,
 * fjernes fra adresselinjen, og navn og mail hentes fra webinar-rum
 * «forudfyld» (kun til den, der har tokenet — personen selv).
 *
 * FAIL-SOFT: et ukendt token eller et net, der hakker, giver blot en tom
 * formular — aldrig en fejl på skærmen og aldrig en stoppet ansøgning.
 * Kilden (?kilde=webinar) afgøres som altid af afgoerKilde; tokenet rører den
 * ikke. Koblingen på id (ansoegninger.webinar_tilmelding_id) er IKKE bygget
 * endnu — den kræver ansoegning-gem «fra_webinar» (spec §A9, skive 4).
 */
export function useWebinarForudfyld(anvend: (f: { navn: string; email: string }) => void): void {
  const cb = useRef(anvend);
  cb.current = anvend;
  useEffect(() => {
    const wt = laesWt(typeof window !== "undefined" ? window.location.hash : null);
    if (!wt) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    let aktiv = true;
    forudfyld(wt)
      .then((f) => {
        if (aktiv) cb.current(f);
      })
      .catch(() => undefined);
    return () => {
      aktiv = false;
    };
  }, []);
}
