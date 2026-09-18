/**
 * SamtaleAfsnit — rådgiverens side af afklaringssamtalen (udkast 18/9, rev. 2):
 * tiden, Meet-linket (fra Calendly-eventet), og «Flyt» / «Aflys» / «Book for
 * dem» med samme tidsvælger som ansøgeren (SamtaleVaelger). Slots kommer fra
 * ansoegning-handling «samtale_tider» (Calendly gennem platformens dom) —
 * klienten regner intet selv; serveren regner igen ved book. Ansøgeren får
 * mail straks; rådgiveren får ingen klokke om sin egen handling.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { SamtaleVaelger } from "@/components/ansoegning/SamtaleVaelger";
import { hentSamtaleTider, invaliderAnsoegninger, udfoerHandling } from "@/hooks/ansoegninger";
import { bekraeftOrd, samtaleOrd } from "@/lib/ansoegning/samtaleValg";
import type { Trin } from "@/lib/ansoegningTrin";

const SAMTALE_TIDER_KEY = (id: string) => ["samtale-tider", id] as const;

export const SamtaleAfsnit = ({ id, navn, trin, samtaleStart, samtaleLink }: { id: string; navn: string; trin: Trin; samtaleStart: string | null; samtaleLink: string | null }) => {
  const qc = useQueryClient();
  const [vaelger, setVaelger] = useState(false);
  const [valgt, setValgt] = useState<string | null>(null);
  const booket = trin === "booket" && !!samtaleStart;
  const slots = useQuery({ queryKey: SAMTALE_TIDER_KEY(id), queryFn: () => hentSamtaleTider(id), enabled: vaelger, staleTime: 30_000, retry: false });

  const koer = useMutation({
    mutationFn: (input: { handling: "book" | "aflys_booking"; samtaleStart?: string }) => udfoerHandling({ ansoegningId: id, handling: input.handling, samtaleStart: input.samtaleStart ?? null }),
    onSuccess: async (_svar, input) => {
      toast.success(input.handling === "aflys_booking" ? `Samtalen med ${navn} er aflyst — de har fået besked` : booket ? `Samtalen er flyttet — ${navn} har fået besked` : `Samtalen er booket — ${navn} har fået en bekræftelse`);
      setVaelger(false);
      setValgt(null);
      await invaliderAnsoegninger(qc, id);
      await qc.invalidateQueries({ queryKey: SAMTALE_TIDER_KEY(id) });
    },
    onError: async (e: Error) => {
      toast.error("Det gik ikke", { description: e.message });
      setValgt(null);
      await qc.invalidateQueries({ queryKey: SAMTALE_TIDER_KEY(id) });
    },
  });

  return (
    <div className="text-sm" data-samtale-afsnit={trin}>
      {booket ? (
        <p className="text-hb-ink"><span className="font-medium">{samtaleOrd(samtaleStart)}</span>{samtaleLink ? <> · <a href={samtaleLink} className="text-hb-evergreen underline-offset-4 hover:underline">Meet-linket</a></> : <span className="text-hb-ink-soft"> · står i Jonas' kalender</span>}</p>
      ) : (
        <p className="text-hb-ink-soft">Ikke booket endnu — ansøgeren vælger selv en tid fra sin side (Jonas' Calendly-kalender er kilden). Rykkerne kører (dag 2, 4, 7 og 11).</p>
      )}
      {!vaelger ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <HbButton variant="secondary" onClick={() => setVaelger(true)} className="h-9 px-4">{booket ? "Flyt samtalen" : "Book for dem"}</HbButton>
          {booket && (
            <HbButton variant="link" disabled={koer.isPending} onClick={() => { if (window.confirm(`Aflyse samtalen med ${navn}? Den aflyses i Calendly, de får en mail og kan vælge en ny tid.`)) koer.mutate({ handling: "aflys_booking" }); }}>Aflys</HbButton>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4" data-samtale-flyt>
          {slots.isLoading ? <p className="text-hb-ink-soft">Henter ledige tider fra kalenderen…</p>
            : slots.isError ? <p className="text-hb-rust">{slots.error.message}</p>
            : <SamtaleVaelger slots={slots.data?.slots ?? []} valgt={valgt} onVaelg={setValgt} varighedMin={slots.data?.varighedMin ?? 30} />}
          <div className="flex flex-wrap items-center gap-3">
            <HbButton disabled={!valgt || koer.isPending} onClick={() => valgt && koer.mutate({ handling: "book", samtaleStart: valgt })} className="h-9 px-4">{bekraeftOrd(booket ? "flyt" : "book", valgt)}</HbButton>
            <HbButton variant="secondary" onClick={() => { setVaelger(false); setValgt(null); }} className="h-9 px-4">Fortryd</HbButton>
          </div>
        </div>
      )}
    </div>
  );
};
