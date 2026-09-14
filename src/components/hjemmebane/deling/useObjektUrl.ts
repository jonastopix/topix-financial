/**
 * useObjektUrl — en object-URL for en fil hun har lagt ind, og oprydning
 * (URL.revokeObjectURL) når filen skiftes eller komponenten forsvinder.
 * Uden revoke lever blob-URL'en til fanen lukkes (Jonas 14/9: «ellers
 * lækker det»). Oprettes i en effekt, ikke i render/useMemo, så StrictModes
 * dobbelt-render ikke efterlader en URL uden revoke.
 */
import { useEffect, useState } from "react";

export function useObjektUrl(fil: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fil) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(fil);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [fil]);
  return url;
}
