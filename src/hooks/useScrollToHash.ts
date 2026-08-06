import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const POLL_INTERVAL_MS = 150;
const MAX_WAIT_MS = 6000;

/**
 * Scroller til elementet med id = URL-hash (#goals m.fl. — Guide-kontrakt).
 * Straksforsøg ved mount/hash-skift (indlæste sider scroller med det samme),
 * derefter polling hvert 150 ms i op til 6 s — så ankre der først renderes
 * efter datahentning (kold load) også rammes. Stopper ved fund, loft,
 * unmount eller hash-skift.
 *
 * @param _delay Ignoreret — bevaret for kald-kompatibilitet (tidligere
 *               fast ét-skuds-delay).
 */
export function useScrollToHash(_delay?: number) {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = hash.replace("#", "");

    const tryScroll = () => {
      const el = document.getElementById(id);
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return true;
    };

    if (tryScroll()) return;

    let waited = 0;
    const interval = setInterval(() => {
      waited += POLL_INTERVAL_MS;
      if (tryScroll() || waited >= MAX_WAIT_MS) {
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [hash]);
}
