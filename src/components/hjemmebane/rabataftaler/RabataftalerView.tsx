import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { hasRichTextContent } from "@/lib/hjemmebane/richtext";
import { getAssetPreviewUrl } from "@/lib/hjemmebane/adminContentApi";
import { listMedlemsPartnere, type MedlemsPartner } from "@/lib/hjemmebane/akademiApi";
import { hbButtonVariants } from "../HbButton";

/** Rabataftaler-miljøet (13-08-2026). Datamodellen og admin-fladen fandtes
    allerede (partners-tabellen, 20260804120000:82-108 + PartnersView/
    PartnerEditor); det eneste der manglede var medlemsfladen.
    Indløsning har tre former, håndhævet af CHECK'en
    partners_redemption_matches_type: 'kode' (redemption_code),
    'link' (redemption_url), 'kontakt' (redemption_contact).
    partners.indhold er rig tekst (PR #372/#373) og renderes som
    content_items.body — prose-hb, hvor ul/ol allerede er stylet.
    Kun logo, ingen billedgalleri: produktbeslutning 13-08-2026 (Jonas) —
    et logo bærer leverandørens identitet og gør listen skanbar;
    markedsføringsbilleder er materiale vi hverken ejer eller vedligeholder.
    Skal en enkelt aftale have et billede, kan rigtekst-feltet bære det.
    RLS: "Members can view published partners" er KUN published-gated —
    abonnenter må bevidst gerne se rabataftaler (Jonas, 13-08-2026). */

/** Udløbet aftale = valid_until er passeret. Aftalen gælder TIL OG MED
    dagen (kolonnen er DATE), så grænsen lægges ved døgnets udgang —
    udløbne aftaler vises slet ikke (filtreres fra i afledningen). */
const erUdloebet = (validUntil: string | null): boolean =>
  !!validUntil && new Date(`${validUntil}T23:59:59`) < new Date();

const fmtDato = (iso: string): string =>
  new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });

/** Logo på lys flade med object-contain, så fremmede logoer ikke
    kolliderer med papir-baggrunden. Signeret URL (privat bucket) —
    staleTime under signaturens TTL på 1 time. Rammen renderes ALTID når
    aftalen har logo_path — pladsen er reserveret, så rækken ikke hopper
    når den signerede URL lander. Intet logo_path → intet element
    (kalderen betinger), rækken står uden hul. h-20: logoet bærer
    leverandørens identitet og skal kunne ses, ikke blot markere. */
const PartnerLogo = ({ path, navn }: { path: string; navn: string }) => {
  const url = useQuery({
    queryKey: ["rabataftaler", "logo", path],
    queryFn: () => getAssetPreviewUrl(path),
    staleTime: 30 * 60_000,
    retry: 1,
  });
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-hb border border-hb-line bg-hb-surface p-3">
      {url.data && (
        <img src={url.data} alt={`${navn} logo`} className="max-h-full max-w-full object-contain" />
      )}
    </div>
  );
};

/** Koden i en markérbar flade + kopiér-knap med kortvarig kvittering.
    navigator.clipboard kan være blokeret (permissions/usikker kontekst) —
    fejler den, står koden stadig synlig og kan markeres (select-all). */
const KopierKode = ({ kode }: { kode: string }) => {
  const [kopieret, setKopieret] = useState(false);
  const kopier = async () => {
    try {
      await navigator.clipboard.writeText(kode);
      setKopieret(true);
      setTimeout(() => setKopieret(false), 2000);
    } catch {
      // Udklipsholderen er blokeret — koden står synlig og kan markeres.
    }
  };
  return (
    <div className="flex items-center gap-3">
      <code className="select-all rounded-hb border border-hb-line bg-hb-paper px-4 py-2 font-mono text-base font-medium text-hb-ink">
        {kode}
      </code>
      <button
        type="button"
        onClick={kopier}
        className="text-sm text-hb-evergreen underline-offset-4 hover:underline"
      >
        {kopieret ? "Kopieret" : "Kopiér"}
      </button>
    </div>
  );
};

/** Indløsningen forgrenet på redemption_type — CHECK'en garanterer at det
    matchende felt er sat, men grenene tåler null defensivt. Link-knappen
    er et ANKER stylet med hbButtonVariants (EventDetailView-præcedensen:
    HbButton renderer et <button>, og en knap i et anker er ugyldig HTML). */
const Indloesning = ({ aftale }: { aftale: MedlemsPartner }) => {
  if (aftale.redemption_type === "kode" && aftale.redemption_code) {
    return <KopierKode kode={aftale.redemption_code} />;
  }
  if (aftale.redemption_type === "link" && aftale.redemption_url) {
    return (
      <a
        href={aftale.redemption_url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(hbButtonVariants({ variant: "primary" }))}
      >
        Gå til aftalen
      </a>
    );
  }
  if (aftale.redemption_type === "kontakt" && aftale.redemption_contact) {
    return (
      <p className="text-base text-hb-ink">
        {aftale.redemption_contact}
        <span className="mt-1 block text-sm text-hb-ink-soft">
          Sig at du er medlem af The Boardroom.
        </span>
      </p>
    );
  }
  return null;
};

export const RabataftalerView = () => {
  const aftalerQuery = useQuery({
    queryKey: ["rabataftaler", "liste"],
    queryFn: listMedlemsPartnere,
    staleTime: 5 * 60_000,
  });

  // Udløbne aftaler vises slet ikke — en aftale der er gældende til en
  // passeret dato er ikke en aftale, og en "udløbet"-markering ville
  // bare være støj i en kurateret liste.
  const aftaler = (aftalerQuery.data ?? []).filter((aftale) => !erUdloebet(aftale.valid_until));

  return (
    <div>
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
          Medlemsfordele
        </p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">
          Rabataftaler
        </h1>
        <p className="mt-3 text-sm text-hb-ink-soft">
          Aftaler forhandlet hjem til medlemmer af The Boardroom.
        </p>
      </section>

      <section className="mt-10 max-w-4xl md:mt-12">
        {aftalerQuery.isLoading ? (
          <p className="text-sm text-hb-ink-soft">Henter rabataftaler…</p>
        ) : aftaler.length === 0 ? (
          <p className="text-sm text-hb-ink-soft">Der er ingen aftaler at vise lige nu.</p>
        ) : (
          <div className="border-b border-hb-line">
            {aftaler.map((aftale) => (
              <article key={aftale.id} className="border-t border-hb-line py-8">
                <div className="flex items-start gap-6">
                  {aftale.logo_path && <PartnerLogo path={aftale.logo_path} navn={aftale.name} />}
                  <div className="min-w-0 flex-1">
                    <h2 className="font-editorial text-2xl font-medium leading-tight text-hb-ink">
                      {aftale.name}
                    </h2>
                    <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-hb-ink-soft">
                      {aftale.category}
                    </p>

                    {/* Aftalens løfte læses FØRST — i Circle-forbilledet
                        druknede rabatten i produktteksten. */}
                    <p className="mt-4 text-lg font-medium leading-snug text-hb-ink">
                      {aftale.discount_text}
                    </p>

                    {hasRichTextContent(aftale.indhold) && (
                      <div
                        className="prose-hb mt-3 text-[15px] leading-relaxed text-hb-ink [&_a]:text-hb-rust [&_a]:underline [&_h2]:mt-8 [&_h2]:font-editorial [&_h2]:text-2xl [&_h2]:font-medium [&_h3]:mt-6 [&_h3]:font-editorial [&_h3]:text-xl [&_h3]:font-medium [&_li]:my-0 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:text-sm [&_ol]:leading-snug [&_p]:my-3 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-sm [&_ul]:leading-snug"
                        dangerouslySetInnerHTML={{ __html: aftale.indhold as string }}
                      />
                    )}

                    {aftale.description && (
                      <p className="mt-4 max-w-prose text-[13px] leading-relaxed text-hb-ink-soft">
                        {aftale.description}
                      </p>
                    )}

                    {/* Mere luft OVER indløsningen end mellem de øvrige
                        elementer — den er kortets afslutning og handling. */}
                    <div className="mt-8">
                      <Indloesning aftale={aftale} />
                    </div>

                    {(aftale.valid_until || aftale.website_url) && (
                      <p className="mt-4 text-xs text-hb-ink-soft">
                        {aftale.valid_until && <>Gælder til {fmtDato(aftale.valid_until)}</>}
                        {aftale.valid_until && aftale.website_url && " · "}
                        {aftale.website_url && (
                          <a
                            href={aftale.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-hb-evergreen underline-offset-4 hover:underline"
                          >
                            Leverandørens side
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
