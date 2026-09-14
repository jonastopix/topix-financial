/**
 * DelingView — overblik og fuldskærm med HENDES data (Jonas 14/9: «en
 * kreativ med prøvetekster og tomme cirkler er en demo, ikke en gave»).
 *
 * DATA — husets egen hook: useAuth giver profile.full_name,
 * profile.avatar_url og companyName (companies.name via company_members).
 * Logoet (companies.logo_url) er IKKE i useAuth — ingen hook i huset
 * henter det; IndstillingerView.tsx:177 og AppSidebar.tsx:178 slår det op
 * hver for sig. Her én lille useQuery på companyId, som AppSidebar.
 * dateLabel kommer fra delingskreativ.ts.
 *
 * RETTELSER GEMMES IKKE. Navn og virksomhed kan stå forkert (importen
 * skriver dem), så hun kan rette begge i felterne over kreativen — og det
 * ændrer KUN kreativen. Der skrives aldrig til profiles eller companies
 * herfra: det er hendes kreativ, ikke en profilredigering. Rettelserne bor
 * i komponentens state (`navnRet`, `virksomhedRet`; null = ikke rettet, så
 * profilen slår igennem når den kommer).
 *
 * BILLEDER lever i browseren. HbDropzone giver en File; useObjektUrl laver
 * en object-URL og rydder op (revoke). Har hun avatar_url/logo_url, er de
 * udgangspunktet, og en fil erstatter dem i forhåndsvisningen. Intet
 * uploades til storage i denne runde.
 *
 * TOMTILSTANDEN vises i kreativen (pladsholderen) OG siges uden for den:
 * manglendeDele() i delingskreativ.ts — hvad mangler, og hvad gør hun.
 *
 * Ren flade ellers: listen KREATIVER (kreativer.tsx) er det eneste
 * galleriet læser. Skaleringen bor i SkaleretKreativ.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { dateLabel, manglendeDele, type KreativData } from "@/lib/delingskreativ";
import { HbDropzone } from "@/components/hjemmebane/HbDropzone";
import { HB_INPUT, HB_LABEL } from "@/components/hjemmebane/hbFormKlasser";
import { KreativFuldskaerm } from "./KreativFuldskaerm";
import { SkaleretKreativ } from "./SkaleretKreativ";
import { KREATIVER, kreativMaal } from "./kreativer";
import { useObjektUrl } from "./useObjektUrl";

const erBillede = (f: File) => f.type.startsWith("image/");

export const DelingView = () => {
  const { profile, companyId, companyName } = useAuth();
  const logoQuery = useQuery({
    queryKey: ["deling", "logo", companyId],
    enabled: !!companyId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("logo_url").eq("id", companyId!).maybeSingle();
      if (error) throw error;
      return data?.logo_url || null;
    },
  });
  // Rettelser: null = ikke rettet → profilens/virksomhedens værdi bruges. Gemmes aldrig.
  const [navnRet, setNavnRet] = useState<string | null>(null);
  const [virksomhedRet, setVirksomhedRet] = useState<string | null>(null);
  const [portraetFil, setPortraetFil] = useState<File | null>(null);
  const [logoFil, setLogoFil] = useState<File | null>(null);
  const [filFejl, setFilFejl] = useState<string | null>(null);
  const [aaben, setAaben] = useState<number | null>(null);
  const portraetObjekt = useObjektUrl(portraetFil);
  const logoObjekt = useObjektUrl(logoFil);
  const dato = useMemo(() => dateLabel(new Date()), []);

  const data: KreativData = {
    memberName: navnRet ?? profile?.full_name ?? "",
    companyName: virksomhedRet ?? companyName ?? "",
    dateLabel: dato,
    portraetUrl: portraetObjekt ?? profile?.avatar_url ?? null,
    logoUrl: logoObjekt ?? logoQuery.data ?? null,
  };
  const mangler = manglendeDele(data);

  const tagFil = (saet: (f: File | null) => void) => (f: File) => {
    if (!erBillede(f)) {
      setFilFejl("Vælg en billedfil — jpg, png eller webp.");
      return;
    }
    setFilFejl(null);
    saet(f);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-hb-ink-soft">Delingskreativ</p>
        <h1 className="font-brand text-2xl font-semibold text-hb-ink">Din kreativ</h1>
        <p className="text-sm text-hb-ink-soft">Ret navn og virksomhed, og læg dit portræt og jeres logo ind. Det ændrer kun kreativen — ikke din profil.</p>
      </div>

      {/* Rettelser — kun kreativen, aldrig databasen (se filhovedet). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="deling-navn" className={HB_LABEL}>Navn</label>
          <input id="deling-navn" className={HB_INPUT} value={data.memberName} onChange={(e) => setNavnRet(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="deling-virksomhed" className={HB_LABEL}>Virksomhed</label>
          <input id="deling-virksomhed" className={HB_INPUT} value={data.companyName} onChange={(e) => setVirksomhedRet(e.target.value)} autoComplete="off" />
        </div>
        <Billedfelt
          titel="Portræt"
          url={data.portraetUrl}
          egenFil={portraetFil}
          rund
          onFile={tagFil(setPortraetFil)}
          onFjern={() => setPortraetFil(null)}
          udgangspunkt={profile?.avatar_url ? "Dit profilbillede er udgangspunktet." : null}
        />
        <Billedfelt
          titel="Logo"
          url={data.logoUrl}
          egenFil={logoFil}
          onFile={tagFil(setLogoFil)}
          onFjern={() => setLogoFil(null)}
          udgangspunkt={logoQuery.data ? "Jeres logo fra Indstillinger er udgangspunktet." : null}
        />
      </div>
      {filFejl && <p className="-mt-4 text-sm text-hb-rust" role="alert">{filFejl}</p>}

      {mangler.length > 0 && (
        <div className="rounded-hb border border-hb-line bg-hb-surface px-5 py-4" data-mangler="">
          <p className="text-sm font-medium text-hb-ink">Kreativen er ikke hel endnu</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-hb-ink-soft">
            {mangler.map((m) => (
              <li key={m.del}>{m.tekst}</li>
            ))}
          </ul>
        </div>
      )}

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Kreativer">
        {KREATIVER.map((post, i) => {
          const maal = kreativMaal(post);
          const Kreativ = post.komponent;
          return (
            <li key={post.id}>
              <button
                type="button"
                onClick={() => setAaben(i)}
                aria-label={`Vis stor: ${post.titel}`}
                className="group flex w-full flex-col gap-3 rounded-hb border border-hb-line bg-hb-surface p-3 text-left transition-shadow duration-300 hover:shadow-hb-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hb-evergreen/60"
              >
                <SkaleretKreativ bredde={maal.bredde} hoejde={maal.hoejde} className="overflow-hidden rounded-[6px]">
                  <Kreativ
                    udgave={post.udgave}
                    format={post.format}
                    memberName={data.memberName}
                    companyName={data.companyName}
                    dateLabel={data.dateLabel}
                    portraetUrl={data.portraetUrl}
                    logoUrl={data.logoUrl}
                    visTomtilstand
                  />
                </SkaleretKreativ>
                <span className="flex flex-col gap-0.5 px-1 pb-1">
                  <span className="text-sm font-medium text-hb-ink">{post.titel}</span>
                  <span className="text-xs text-hb-ink-soft">
                    {maal.bredde}×{maal.hoejde}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {aaben !== null && (
        <KreativFuldskaerm kreativer={KREATIVER} data={data} indeks={aaben} onSkift={setAaben} onLuk={() => setAaben(null)} />
      )}
    </div>
  );
};

/** Ét billedfelt: det billede kreativen bruger nu, en dropzone til at erstatte det, og «Fjern» for hendes egen fil. */
const Billedfelt = ({
  titel, url, egenFil, rund = false, onFile, onFjern, udgangspunkt,
}: {
  titel: string;
  url: string | null | undefined;
  egenFil: File | null;
  rund?: boolean;
  onFile: (f: File) => void;
  onFjern: () => void;
  udgangspunkt: string | null;
}) => (
  <div className="flex flex-col gap-2">
    <span className={HB_LABEL}>{titel}</span>
    <div className="flex items-start gap-3">
      <div
        className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden border border-hb-line bg-hb-surface ${rund ? "rounded-full" : "rounded-hb"}`}
        data-billedfelt-visning={titel.toLowerCase()}
      >
        {url ? (
          <img src={url} alt="" className={`h-full w-full ${rund ? "object-cover" : "object-contain p-1"}`} />
        ) : (
          <span className="text-[10px] text-hb-ink-soft">Tomt</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <HbDropzone
          onFile={onFile}
          accept="image/*"
          tekst={egenFil ? `Erstat ${titel.toLowerCase()}` : `Læg ${titel.toLowerCase()} ind`}
          undertekst="Træk et billede hertil, eller klik · jpg, png, webp"
        />
        <p className="text-xs text-hb-ink-soft">
          {egenFil ? (
            <>
              Bruger <span className="text-hb-ink">{egenFil.name}</span> — kun her i browseren.{" "}
              <button type="button" onClick={onFjern} className="text-hb-evergreen underline-offset-2 hover:underline">Fjern</button>
            </>
          ) : (
            udgangspunkt ?? "Intet billede endnu."
          )}
        </p>
      </div>
    </div>
  </div>
);
