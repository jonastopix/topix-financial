import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { HbSection } from "../HbSection";
import { HbCard } from "../HbCard";
import { HbButton } from "../HbButton";
import { fortrydRinget, hentAnmodninger, markerRinget, OPKALD_QUERY_KEY } from "@/lib/opkald/api";
import { erAaben, OPBEVARING_DAGE, slettesAt, visTelefon, type Anmodning } from "@/lib/opkald/dom";
import { formaterDanskTid } from "@/lib/revisionsspor";

/** /opkald (2/10-2026) — rådgivernes kø af løfter: dem, der selv bad om et
    opkald efter webinaret. ÉN liste, nyeste øverst, åbne først; ét klik
    «Markér som ringet». Intet menupunkt — siden nås fra klokken
    «opkald_anmodet» (klokke.ts: reference_type opkald → /opkald) og
    morgenmailen. Det er IKKE en liste over leads: rækken forsvinder 90 dage
    efter samtykket (cron-jobbet opkald-opbevaring), og nummeret står KUN her.
    Alle hooks i topblokken (React-reglen i CLAUDE.md). */
export function OpkaldView() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: OPKALD_QUERY_KEY, queryFn: () => hentAnmodninger() });
  const opfrisk = () => queryClient.invalidateQueries({ queryKey: OPKALD_QUERY_KEY });

  const ringetMutation = useMutation({
    mutationFn: (id: string) => markerRinget(id, user!.id),
    onSuccess: () => {
      opfrisk();
      toast.success("Markeret som ringet");
    },
    onError: (fejl: Error) => {
      opfrisk();
      toast.error("Kunne ikke markeres", { description: fejl.message });
    },
  });
  const fortrydMutation = useMutation({
    mutationFn: (id: string) => fortrydRinget(id),
    onSuccess: () => opfrisk(),
    onError: (fejl: Error) => toast.error("Kunne ikke fortrydes", { description: fejl.message }),
  });

  const liste = query.data ?? [];
  const aabne = liste.filter(erAaben);
  const ringede = liste.filter((a) => !erAaben(a));
  const optaget = ringetMutation.isPending || fortrydMutation.isPending;

  return (
    <div className="space-y-10" data-opkald>
      <HbSection eyebrow="Må vi ringe til dig?" title="Dem, der bad om et opkald">
        <p className="max-w-2xl text-sm text-hb-ink-soft">
          Efter webinaret kan en deltager bede om, at Morten eller Jonas ringer — én gang, om The Boardroom. De beder selv;
          der er ingen liste at ringe igennem. Nummeret står kun her og slettes {OPBEVARING_DAGE} dage efter samtykket.
        </p>
      </HbSection>

      {query.isLoading && <p className="text-sm text-hb-ink-soft">Henter …</p>}
      {query.isError && <p className="text-sm text-hb-rust">Anmodningerne kunne ikke hentes: {(query.error as Error).message}</p>}
      {query.isSuccess && aabne.length === 0 && (
        <HbCard>
          <p className="px-5 py-4 text-sm text-hb-ink-soft">Ingen venter på et opkald.</p>
        </HbCard>
      )}

      {aabne.length > 0 && (
        <section className="space-y-3" data-opkald-aabne>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
            {aabne.length === 1 ? "1 venter" : `${aabne.length} venter`}
          </p>
          {aabne.map((a) => (
            <AnmodningKort key={a.id} a={a} optaget={optaget || !user} onRinget={() => ringetMutation.mutate(a.id)} />
          ))}
        </section>
      )}

      {ringede.length > 0 && (
        <section className="space-y-3" data-opkald-ringede>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Ringet</p>
          {ringede.map((a) => (
            <AnmodningKort key={a.id} a={a} optaget={optaget} onFortryd={() => fortrydMutation.mutate(a.id)} />
          ))}
        </section>
      )}
    </div>
  );
}

function AnmodningKort({ a, optaget, onRinget, onFortryd }: { a: Anmodning; optaget: boolean; onRinget?: () => void; onFortryd?: () => void }) {
  const aaben = erAaben(a);
  return (
    <HbCard className={aaben ? "" : "opacity-70"}>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-hb-ink">{a.navn}</p>
          <p className="text-sm text-hb-ink">
            <a href={`tel:${a.telefon}`} className="inline-flex items-center gap-1.5 text-hb-evergreen hover:underline">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {visTelefon(a.telefon)}
            </a>
          </p>
          <p className="text-xs text-hb-ink-soft">
            Bad om det {formaterDanskTid(a.samtykke_at)}
            {a.session_tid ? ` · så webinaret ${formaterDanskTid(a.session_tid)}` : ""}
            {aaben ? ` · slettes ${formaterDanskTid(slettesAt(a.samtykke_at))}` : a.ringet_at ? ` · ringet ${formaterDanskTid(a.ringet_at)}` : ""}
          </p>
        </div>
        {aaben && onRinget && (
          <HbButton type="button" variant="primary" disabled={optaget} onClick={onRinget} className="shrink-0">
            Markér som ringet
          </HbButton>
        )}
        {!aaben && onFortryd && (
          <HbButton type="button" variant="link" disabled={optaget} onClick={onFortryd} className="shrink-0">
            Fortryd
          </HbButton>
        )}
      </div>
    </HbCard>
  );
}
