import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { HbSection } from "@/components/hjemmebane/HbSection";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbField, HbInput } from "@/components/hjemmebane/admin/HbField";
import { type OprettetLink, useWebinarDelingHandling, useWebinarDelinger } from "@/hooks/webinarDelinger";
import { type DelingsLinje, MAKS_DAGE, STANDARD_DAGE } from "@/lib/webinar/deling";
import { formaterDanskTid } from "@/lib/revisionsspor";

/**
 * «Del med et privat link» — rådgiverens flade på /webinar (udkast 21/9-2026).
 * Opret (navn, udløb), listen (navn, udløb, sidst set, antal visninger),
 * forlæng, luk. Tokenet vises ÉN gang, lige efter oprettelsen — det gemmes
 * ikke nogen steder (kun aftrykket i basen), så det kan ikke vises igen.
 * Ligger uden for WebinarView (fladen henter intet selv — webinarFlade.guard).
 */

const TILSTAND_ORD: Record<DelingsLinje["tilstand"], string> = { aktiv: "aktivt", udloebet: "udløbet", lukket: "lukket" };

export const WebinarDelinger = ({ nu = new Date() }: { nu?: Date }) => {
  const liste = useWebinarDelinger(nu);
  const handling = useWebinarDelingHandling();
  const [navn, setNavn] = useState("");
  const [dage, setDage] = useState(String(STANDARD_DAGE));
  const [nyt, setNyt] = useState<OprettetLink | null>(null);
  const [kopieret, setKopieret] = useState(false);
  const [fejl, setFejl] = useState<string | null>(null);

  const dageTal = Number(dage);
  const kanOprette = navn.trim().length > 0 && Number.isInteger(dageTal) && dageTal >= 1 && dageTal <= MAKS_DAGE && !handling.isPending;

  const opret = async () => {
    setFejl(null);
    setKopieret(false);
    try {
      const svar = await handling.mutateAsync({ handling: "opret", navn: navn.trim(), dage: dageTal });
      setNyt(svar as unknown as OprettetLink);
      setNavn("");
    } catch (e) {
      setFejl(e instanceof Error ? e.message : "fejl");
    }
  };
  const forlaeng = async (id: string) => {
    setFejl(null);
    try { await handling.mutateAsync({ handling: "forlaeng", id, dage: STANDARD_DAGE }); } catch (e) { setFejl(e instanceof Error ? e.message : "fejl"); }
  };
  const luk = async (id: string) => {
    setFejl(null);
    try { await handling.mutateAsync({ handling: "luk", id }); } catch (e) { setFejl(e instanceof Error ? e.message : "fejl"); }
  };
  const kopier = async () => {
    if (!nyt) return;
    try { await navigator.clipboard.writeText(nyt.url); setKopieret(true); } catch { setKopieret(false); }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 md:px-6" data-webinar-delinger>
      <HbSection eyebrow="Del med et privat link" title="Én modtager, ét link, en udløbsdato" hairline className="mt-10 md:mt-12">
        <p className="mb-4 text-sm text-hb-ink-soft">
          Modtageren ser alt på denne side og intet andet — skrivebeskyttet, uden konto. Linket gælder {STANDARD_DAGE} dage og kan forlænges eller lukkes her. Hver åbning logges.
        </p>
        <HbCard className="p-5 md:p-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_8rem_auto] md:items-end">
            <HbField label="Hvem får linket" htmlFor="deling-navn" help="Navnet er til jer — det vises ikke for modtageren.">
              <HbInput id="deling-navn" value={navn} onChange={(e) => setNavn(e.target.value)} maxLength={80} placeholder="fx Marketingkonsulenten" disabled={handling.isPending} />
            </HbField>
            <HbField label="Gælder i dage" htmlFor="deling-dage" help={`1–${MAKS_DAGE}`}>
              <HbInput id="deling-dage" value={dage} onChange={(e) => setDage(e.target.value)} inputMode="numeric" disabled={handling.isPending} />
            </HbField>
            <HbButton variant="primary" onClick={() => void opret()} disabled={!kanOprette} data-deling-opret>
              {handling.isPending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
              Opret link
            </HbButton>
          </div>
          {nyt && (
            <div className="mt-5 rounded-hb border border-hb-evergreen/40 bg-hb-evergreen/5 p-4" data-deling-nyt={nyt.id}>
              <p className="text-sm font-medium text-hb-ink">Linket til {nyt.navn} — kopiér det NU. Det vises kun denne ene gang.</p>
              <p className="mt-2 break-all font-mono text-xs text-hb-ink">{nyt.url}</p>
              <div className="mt-3 flex items-center gap-3">
                <HbButton variant="secondary" onClick={() => void kopier()}>
                  <Copy className="h-4 w-4 shrink-0" />
                  {kopieret ? "Kopieret" : "Kopiér linket"}
                </HbButton>
                <span className="text-xs text-hb-ink-soft">Gælder til {formaterDanskTid(nyt.udloeber_at)}.</span>
              </div>
            </div>
          )}
          {fejl && <p className="mt-3 text-sm text-hb-rust" data-deling-fejl>{fejl}</p>}
        </HbCard>

        <div className="mt-6">
          {liste.isError ? (
            <p className="text-sm text-hb-rust" data-delinger="fejl">Listen kunne ikke hentes. Prøv igen om lidt.</p>
          ) : liste.isPending ? (
            <div className="h-16 animate-pulse rounded-hb bg-hb-line/60" data-delinger="henter" />
          ) : liste.data.length === 0 ? (
            <p className="text-sm text-hb-ink-soft" data-delinger="tom">Ingen links endnu.</p>
          ) : (
            <ul data-delinger={liste.data.length}>
              {liste.data.map((d) => (
                <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-hb-line py-3 last:border-b" data-deling={d.tilstand}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-hb-ink">
                      {d.navn} <span className="ml-1 text-xs font-normal uppercase tracking-[0.1em] text-hb-ink-soft">{TILSTAND_ORD[d.tilstand]}</span>
                    </p>
                    <p className="text-xs text-hb-ink-soft">
                      {d.tilstand === "lukket" && d.lukket_at ? `Lukket ${formaterDanskTid(d.lukket_at)}` : `Gælder til ${formaterDanskTid(d.udloeber_at)}`}
                      {` · ${d.visninger} ${d.visninger === 1 ? "visning" : "visninger"}`}
                      {d.sidst_set ? ` · sidst set ${formaterDanskTid(d.sidst_set)}` : " · aldrig åbnet"}
                    </p>
                  </div>
                  {d.tilstand !== "lukket" && (
                    <div className="flex gap-2">
                      <HbButton variant="secondary" onClick={() => void forlaeng(d.id)} disabled={handling.isPending} data-deling-forlaeng>
                        Forlæng {STANDARD_DAGE} dage
                      </HbButton>
                      <HbButton variant="secondary" onClick={() => void luk(d.id)} disabled={handling.isPending} data-deling-luk>
                        Luk
                      </HbButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </HbSection>
    </div>
  );
};

export default WebinarDelinger;
