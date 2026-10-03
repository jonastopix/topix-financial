import "@/styles/hjemmebane.css";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useHbDokumentGrund } from "@/hooks/useHbDokumentGrund";
import { SLUG_FORM } from "@/lib/webinarMotor/tilmelding";
import { gemToken, glemToken, laesGemtToken } from "@/lib/webinarRum/lager";
import { gyldigtToken, icsUrl, TOKEN_PARAM, udenToken, vaelgToken } from "@/lib/webinarRum/links";
import { WebinarRum } from "@/components/webinarRum/WebinarRum";
import { WebinarTilmelding } from "@/components/webinarRum/WebinarTilmelding";
import { BROED, H1, INDHOLD, RAMME } from "@/components/webinarRum/stil";

/**
 * Seerens flade (skive 2, 30/9-2026) — OFFENTLIGE ruter uden login, uden skal,
 * i INGEN menu (spec §D5). Uguardet som /aftale og /delt/webinar: alle kald
 * går gennem motorens functions, og tokenet er legitimationen.
 *
 *   /w/:slug            med token (URL'en eller fanens sessionStorage) → rummet;
 *                       uden → tilmeldingen
 *   /w/:slug/tilmeld    altid tilmeldingen (spec §D5's reserveformular)
 *   /w/:slug/kalender   ?t=… → husets .ics fra webinar-rum (til mails, hvor en
 *                       Apple/Outlook-klient vil have et link, ikke en fil)
 *
 * TOKENET flyttes fra adresselinjen til sessionStorage og fjernes fra URL'en
 * (history.replaceState), og siden sætter referrer-politikken «no-referrer»,
 * mens den er åben (spec §C6) — så linket aldrig står i en historik, en
 * skærmdeling eller en Referer. INGEN tredjeparts-tracking her: ingen pixel,
 * intet GTM, intet GA.
 *
 * REACT #310: alle hooks i topblokken, før den første betingede return.
 */
export default function WebinarSide({ visning = "rum" }: { visning?: "rum" | "tilmeld" | "kalender" }) {
  const { slug = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fraUrl = searchParams.get(TOKEN_PARAM);
  const [token, setToken] = useState<string | null>(() => (visning === "rum" ? vaelgToken(fraUrl, laesGemtToken(slug)) : null));
  useHbDokumentGrund();

  // Referrer-politikken, mens siden er åben — lagt tilbage bagefter.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  // Tokenet: gemt i fanen og fjernet fra adresselinjen.
  useEffect(() => {
    if (visning === "kalender") return;
    if (token) gemToken(slug, token);
    if (fraUrl !== null) window.history.replaceState(window.history.state, "", udenToken(window.location.href));
  }, [token, slug, fraUrl, visning]);

  // /kalender: videre til filen, straks.
  const kalenderToken = visning === "kalender" && gyldigtToken(fraUrl) ? fraUrl : null;
  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (kalenderToken && url) window.location.replace(icsUrl(url, kalenderToken));
  }, [kalenderToken]);

  if (!SLUG_FORM.test(slug)) {
    return (
      <div className={RAMME}>
        <div className={`${INDHOLD} text-center`}>
          <h1 className={H1}>Siden findes ikke</h1>
        </div>
      </div>
    );
  }

  if (visning === "kalender") {
    return (
      <div className={RAMME}>
        <div className={`${INDHOLD} text-center`} role="status">
          <p className={BROED}>{kalenderToken ? "Henter kalenderfilen …" : "Linket er ikke gyldigt. Tjek at hele linket fra mailen kom med."}</p>
        </div>
      </div>
    );
  }

  const tilRummet = (t: string) => {
    gemToken(slug, t);
    if (visning === "tilmeld") navigate(`/w/${encodeURIComponent(slug)}`, { replace: false });
    setToken(t);
  };

  return (
    <div className={RAMME} data-webinar-side>
      {token && visning === "rum" ? (
        <WebinarRum
          key={token}
          slug={slug}
          token={token}
          onNytToken={(t) => {
            gemToken(slug, t);
            setToken(t);
          }}
          onGlemToken={() => {
            glemToken(slug);
            setToken(null);
          }}
        />
      ) : (
        <WebinarTilmelding slug={slug} onGaaTilRummet={tilRummet} />
      )}
    </div>
  );
}
