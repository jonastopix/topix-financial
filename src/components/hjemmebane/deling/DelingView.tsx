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
 * BILLEDERNE GEMMES (14/9, Jonas' beslutning efter recon-kreativ-
 * persistens.md — «hvis jeg refresher siden, forsvinder tingene igen»):
 *   LOGOET ad vej (a): virksomhedens logo — company-logos/${company.id}/logo
 *   + companies.logo_url, ordret som Indstillinger (lib/delingsbilleder.
 *   uploadVirksomhedslogo). Fladen siger det FØR hun trykker: logoet
 *   bliver virksomhedens, ikke kun kreativens. Intet «Fjern» her — det
 *   ville fjerne profilens logo; det gøres under Indstillinger.
 *   PORTRÆTTET ad vej (b): et sted kun til kreativen — den private bucket
 *   deling-portraetter/${user.id}/portraet (migration 20260914170000),
 *   signeret ved visning. Profilbilledet under Konto røres aldrig; det er
 *   udgangspunktet, indtil hun lægger sit eget ind. Findes objektet efter
 *   refresh, vises det (hentPortraetUrl) — intet i browseren.
 *   Grænserne er avatar-uploadens (image/*, 2 MB, tjekBilledfil). Er
 *   portrættet mindre end slot'ens 310 px, SIGES det (maalBillede +
 *   oploesningsBesked) — ingen afvisning.
 *
 * TOMTILSTANDEN vises i kreativen (pladsholderen) OG siges uden for den:
 * manglendeDele() i delingskreativ.ts — hvad mangler, og hvad gør hun.
 *
 * Ren flade ellers: listen KREATIVER (kreativer.tsx) er det eneste
 * galleriet læser. Skaleringen bor i SkaleretKreativ.
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { dateLabel, manglendeDele, type KreativData } from "@/lib/delingskreativ";
import {
  TEKST as BILLED_TEKST,
  fjernPortraet,
  hentPortraetUrl,
  maalBillede,
  oploesningsBesked,
  tjekBilledfil,
  uploadPortraet,
  uploadVirksomhedslogo,
} from "@/lib/delingsbilleder";
import { HbDropzone } from "@/components/hjemmebane/HbDropzone";
import { HB_INPUT, HB_LABEL } from "@/components/hjemmebane/hbFormKlasser";
import { KreativFuldskaerm } from "./KreativFuldskaerm";
import { SkaleretKreativ } from "./SkaleretKreativ";
import { KREATIVER, kreativMaal } from "./kreativer";

type Felt = "portraet" | "logo";

export const DelingView = () => {
  const { user, profile, companyId, companyName } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
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
  // Portrættet i hendes egen mappe i deling-portraetter — null = intet gemt,
  // så profilbilledet er udgangspunktet. Signeret URL (1 time).
  const portraetQuery = useQuery({
    queryKey: ["deling", "portraet", userId],
    enabled: !!userId,
    staleTime: 10 * 60_000,
    queryFn: () => hentPortraetUrl(userId!),
  });
  // Rettelser: null = ikke rettet → profilens/virksomhedens værdi bruges. Gemmes aldrig.
  const [navnRet, setNavnRet] = useState<string | null>(null);
  const [virksomhedRet, setVirksomhedRet] = useState<string | null>(null);
  const [filFejl, setFilFejl] = useState<string | null>(null);
  /** Én linje pr. felt efter et valg: «gemt», eller oplysningen om et lille billede + «gemt». */
  const [status, setStatus] = useState<Record<Felt, string | null>>({ portraet: null, logo: null });
  const [travlt, setTravlt] = useState<Felt | null>(null);
  const [aaben, setAaben] = useState<number | null>(null);
  const dato = useMemo(() => dateLabel(new Date()), []);

  const data: KreativData = {
    memberName: navnRet ?? profile?.full_name ?? "",
    companyName: virksomhedRet ?? companyName ?? "",
    dateLabel: dato,
    portraetUrl: portraetQuery.data ?? profile?.avatar_url ?? null,
    logoUrl: logoQuery.data ?? null,
  };
  const mangler = manglendeDele(data);

  const saetStatus = (felt: Felt, tekst: string | null) => setStatus((s) => ({ ...s, [felt]: tekst }));

  // Portrættet: tjek (type, 2 MB) → mål (oplysning, ingen afvisning) → upload til
  // hendes mappe → kreativen henter den signerede URL. Profilen røres ikke.
  const tagPortraet = async (f: File) => {
    if (!userId) return;
    const dom = tjekBilledfil(f);
    if (dom.ok === false) { setFilFejl(dom.fejl); return; }
    setFilFejl(null);
    setTravlt("portraet");
    try {
      const oplysning = oploesningsBesked(await maalBillede(f));
      await uploadPortraet(userId, f);
      await queryClient.invalidateQueries({ queryKey: ["deling", "portraet", userId] });
      saetStatus("portraet", [oplysning, BILLED_TEKST.portraetGemt].filter(Boolean).join(" "));
    } catch (e) {
      setFilFejl(e instanceof Error ? e.message : BILLED_TEKST.portraetFejlUpload);
    } finally {
      setTravlt(null);
    }
  };

  const fjernPortraetHer = async () => {
    if (!userId) return;
    setTravlt("portraet");
    try {
      await fjernPortraet(userId);
      await queryClient.invalidateQueries({ queryKey: ["deling", "portraet", userId] });
      saetStatus("portraet", null);
    } catch (e) {
      setFilFejl(e instanceof Error ? e.message : BILLED_TEKST.portraetFejlFjern);
    } finally {
      setTravlt(null);
    }
  };

  // Logoet: samme tjek, så Indstillingers upload ordret — og alle der viser
  // logoet henter igen (kreativen her, sidebaren).
  const tagLogo = async (f: File) => {
    if (!companyId) return;
    const dom = tjekBilledfil(f);
    if (dom.ok === false) { setFilFejl(dom.fejl); return; }
    setFilFejl(null);
    setTravlt("logo");
    try {
      await uploadVirksomhedslogo(companyId, f);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["deling", "logo", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["sidebar-company-logo"] }),
      ]);
      saetStatus("logo", BILLED_TEKST.logoGemt);
    } catch (e) {
      setFilFejl(e instanceof Error ? e.message : BILLED_TEKST.logoFejlUpload);
    } finally {
      setTravlt(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-hb-ink-soft">Delingskreativ</p>
        <h1 className="font-brand text-2xl font-semibold text-hb-ink">Din kreativ</h1>
        <p className="text-sm text-hb-ink-soft">Ret navn og virksomhed — det ændrer kun kreativen, ikke din profil. Portrættet gemmes kun til kreativen; logoet bliver virksomhedens.</p>
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
          rund
          hjaelp={BILLED_TEKST.portraetHjaelp}
          onFile={tagPortraet}
          onFjern={portraetQuery.data ? fjernPortraetHer : undefined}
          busy={travlt === "portraet"}
          status={status.portraet ?? (portraetQuery.data ? "Dit eget portræt til kreativen." : profile?.avatar_url ? "Dit profilbillede er udgangspunktet." : "Intet billede endnu.")}
        />
        <Billedfelt
          titel="Logo"
          url={data.logoUrl}
          hjaelp={BILLED_TEKST.logoAdvarsel}
          onFile={tagLogo}
          busy={travlt === "logo"}
          status={status.logo ?? (logoQuery.data ? "Jeres logo fra Indstillinger." : "Intet logo endnu.")}
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

/** Ét billedfelt: det billede kreativen bruger nu, hjælpen FØR hun vælger (hvad
    valget betyder), en dropzone, status efter valget, og «Fjern» hvor det giver mening. */
const Billedfelt = ({
  titel, url, rund = false, hjaelp, onFile, onFjern, busy = false, status,
}: {
  titel: string;
  url: string | null | undefined;
  rund?: boolean;
  /** Står før hun trykker — fx at logoet bliver virksomhedens. */
  hjaelp: string;
  onFile: (f: File) => void;
  /** Kun når der er noget der kan fjernes uden at røre profilen. */
  onFjern?: () => void;
  busy?: boolean;
  status: string;
}) => (
  <div className="flex flex-col gap-2">
    <span className={HB_LABEL}>{titel}</span>
    <p className="text-xs text-hb-ink-soft" data-billedfelt-hjaelp={titel.toLowerCase()}>{hjaelp}</p>
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
          tekst={url ? `Erstat ${titel.toLowerCase()}` : `Læg ${titel.toLowerCase()} ind`}
          undertekst="Træk et billede hertil, eller klik · jpg, png, webp · højst 2 MB"
          busy={busy}
          busyTekst="Gemmer…"
        />
        <p className="text-xs text-hb-ink-soft" data-billedfelt-status={titel.toLowerCase()}>
          {status}
          {onFjern && (
            <>
              {" "}
              <button type="button" onClick={onFjern} disabled={busy} className="text-hb-evergreen underline-offset-2 hover:underline disabled:opacity-50">Fjern</button>
            </>
          )}
        </p>
      </div>
    </div>
  </div>
);
