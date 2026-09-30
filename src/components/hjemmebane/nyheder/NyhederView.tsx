import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { HbSection } from "../HbSection";
import { HbCard } from "../HbCard";
import { HbButton } from "../HbButton";
import { CommunityComposer } from "../community/CommunityComposer";
import {
  afvisNyhedsudkast,
  hentNyhedsudkast,
  markerSomPubliceret,
  NYHEDER_QUERY_KEY,
  publicerNyhedsudkast,
  slipNyhedsudkast,
  STATUS_TEKST,
  TraadFindesFejl,
  type NyhedUdkast,
} from "@/lib/nyheder/nyhederApi";

/** /nyheder (nyhedsagenten skive 1, 30/9-2026) — rådgiverens godkendelse af
    ugens nyhedsudkast. Niveau N1: intet når community uden et klik her.
    Øverst det udkast, der venter (kladde, eller et hængende «publiceres»);
    teksten redigeres i SAMME composer som community (CommunityComposer med
    startIndhold), så det, rådgiveren ser, er det, der publiceres. Grundlaget
    (agentens vurdering pr. kilde) står under. Nederst de tidligere uger.
    Alle hooks i topblokken (React-reglen i CLAUDE.md). */
export function NyhederView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [titel, setTitel] = useState<string | null>(null);
  const [afvisGrund, setAfvisGrund] = useState("");
  /** Tråden fra et publiceringsforsøg, som serveren fandt, da «slip» blev afvist (409 traad_findes). */
  const [fundetTraad, setFundetTraad] = useState<string | null>(null);

  const udkastQuery = useQuery({ queryKey: NYHEDER_QUERY_KEY, queryFn: () => hentNyhedsudkast() });

  const opfrisk = () => queryClient.invalidateQueries({ queryKey: NYHEDER_QUERY_KEY });

  const publicerMutation = useMutation({
    mutationFn: (a: { udkast: NyhedUdkast; titel: string; indholdJson: unknown }) =>
      publicerNyhedsudkast(a.udkast.id, a.titel, a.indholdJson),
    onSuccess: (traadId) => {
      opfrisk();
      queryClient.invalidateQueries({ queryKey: ["community", "feed"] });
      toast.success("Publiceret i community");
      navigate(`/community/${traadId}`);
    },
    onError: (fejl: Error) => {
      opfrisk();
      if (fejl instanceof TraadFindesFejl) setFundetTraad(fejl.traadId);
      toast.error("Udkastet blev ikke publiceret", { description: fejl.message });
    },
  });

  const markerMutation = useMutation({
    mutationFn: (a: { udkastId: string; traadId: string }) => markerSomPubliceret(a.udkastId, a.traadId),
    onSuccess: (traadId) => {
      setFundetTraad(null);
      opfrisk();
      queryClient.invalidateQueries({ queryKey: ["community", "feed"] });
      toast.success("Markeret som publiceret");
      navigate(`/community/${traadId}`);
    },
    onError: (fejl: Error) => {
      opfrisk();
      toast.error("Udkastet kunne ikke markeres som publiceret", { description: fejl.message });
    },
  });

  const afvisMutation = useMutation({
    mutationFn: (udkastId: string) => afvisNyhedsudkast(udkastId, afvisGrund),
    onSuccess: () => {
      opfrisk();
      setAfvisGrund("");
      toast.success("Udkastet er afvist");
    },
    onError: (fejl: Error) => toast.error("Afvisningen blev ikke gemt", { description: fejl.message }),
  });

  const slipMutation = useMutation({
    mutationFn: (udkastId: string) => slipNyhedsudkast(udkastId),
    onSuccess: () => opfrisk(),
    onError: (fejl: Error) => {
      if (fejl instanceof TraadFindesFejl) {
        setFundetTraad(fejl.traadId);
        return;
      }
      toast.error("Udkastet kunne ikke frigives", { description: fejl.message });
    },
  });

  const alle = udkastQuery.data ?? [];
  const aktivt = alle.find((u) => u.status === "kladde" || u.status === "publiceres") ?? null;
  const tidligere = alle.filter((u) => u.id !== aktivt?.id);
  const optaget = publicerMutation.isPending || afvisMutation.isPending || slipMutation.isPending || markerMutation.isPending;

  return (
    <div className="space-y-10">
      <HbSection eyebrow="Nyhedsagenten" title="Ugens nyheder til community">
        <p className="max-w-2xl text-sm text-hb-ink-soft">
          Agenten læser offentlige kilder hver mandag og foreslår ét opslag med ugens vigtigste. Intet publiceres,
          før en rådgiver har læst, rettet og trykket «Publicér i community» — opslaget står med dit navn.
        </p>
      </HbSection>

      {udkastQuery.isLoading && <p className="text-sm text-hb-ink-soft">Henter udkast …</p>}
      {udkastQuery.isError && (
        <p className="text-sm text-hb-rust">Udkastene kunne ikke hentes: {(udkastQuery.error as Error).message}</p>
      )}
      {udkastQuery.isSuccess && !aktivt && (
        <HbCard>
          <p className="px-5 py-4 text-sm text-hb-ink-soft">Intet udkast venter. Næste kommer mandag morgen.</p>
        </HbCard>
      )}

      {aktivt && user && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">
              Uge {aktivt.uge.split("-W")[1]} · {STATUS_TEKST[aktivt.status]}
            </p>
            {aktivt.status === "publiceres" && (
              <HbButton type="button" variant="link" disabled={optaget} onClick={() => slipMutation.mutate(aktivt.id)}>
                Frigiv udkastet
              </HbButton>
            )}
          </div>

          {fundetTraad && aktivt.status === "publiceres" && (
            <HbCard>
              <div className="space-y-3 px-5 py-4 text-sm text-hb-ink">
                <p>
                  Opslaget blev oprettet i community, men blev ikke markeret som publiceret. Det må ikke publiceres igen —
                  så får alle en tråd til.{" "}
                  <a href={`/community/${fundetTraad}`} className="text-hb-evergreen underline underline-offset-2">
                    Se tråden
                  </a>
                </p>
                <HbButton
                  type="button"
                  disabled={optaget}
                  onClick={() => markerMutation.mutate({ udkastId: aktivt.id, traadId: fundetTraad })}
                >
                  Markér som publiceret
                </HbButton>
              </div>
            </HbCard>
          )}

          <CommunityComposer
            key={aktivt.id}
            brugerId={user.id}
            visTitel
            titel={titel ?? aktivt.titel}
            onTitelChange={setTitel}
            startIndhold={aktivt.indhold_json}
            submitLabel="Publicér i community"
            disabled={optaget || aktivt.status !== "kladde"}
            onSubmit={async (indholdJson) => {
              await publicerMutation.mutateAsync({ udkast: aktivt, titel: (titel ?? aktivt.titel).trim(), indholdJson });
            }}
          />

          <HbCard>
            <div className="flex flex-wrap items-center gap-3 px-5 py-4">
              <input
                type="text"
                value={afvisGrund}
                onChange={(e) => setAfvisGrund(e.target.value)}
                placeholder="Hvorfor afvist? (valgfrit — hjælper agenten at blive bedre)"
                maxLength={500}
                disabled={optaget || aktivt.status !== "kladde"}
                className="min-w-0 flex-1 rounded-hb border border-hb-line bg-transparent px-3 py-2 text-sm text-hb-ink placeholder:text-hb-ink-soft/60 focus:outline-none"
              />
              <HbButton
                type="button"
                variant="secondary"
                disabled={optaget || aktivt.status !== "kladde"}
                onClick={() => afvisMutation.mutate(aktivt.id)}
              >
                Afvis
              </HbButton>
            </div>
          </HbCard>

          <HbCard>
            <div className="px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Agentens grundlag</p>
              <ul className="mt-3 space-y-3">
                {aktivt.kilder.map((k) => (
                  <li key={k.emne_id} className="text-sm text-hb-ink">
                    <a href={k.url} target="_blank" rel="noopener noreferrer" className="font-medium text-hb-evergreen underline underline-offset-2">
                      {k.titel}
                    </a>
                    <span className="text-hb-ink-soft"> · score {k.score}/10</span>
                    <p className="text-hb-ink-soft">Hvem: {k.hvem}</p>
                    <p className="text-hb-ink-soft">Handling: {k.handling}</p>
                    <p className="text-hb-ink-soft">Hvorfor: {k.begrundelse}</p>
                  </li>
                ))}
              </ul>
            </div>
          </HbCard>
        </section>
      )}

      {tidligere.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Tidligere uger</p>
          <ul className="divide-y divide-hb-line">
            {tidligere.map((u) => (
              <li key={u.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span className="text-hb-ink">
                  Uge {u.uge.split("-W")[1]} · {u.titel}
                </span>
                <span className="text-hb-ink-soft">
                  {STATUS_TEKST[u.status]}
                  {u.status === "godkendt" && u.uaendret !== null && (u.uaendret ? " · uændret" : " · rettet")}
                  {u.status === "godkendt" && u.traad_id && (
                    <>
                      {" · "}
                      <a href={`/community/${u.traad_id}`} className="text-hb-evergreen underline underline-offset-2">
                        se opslaget
                      </a>
                    </>
                  )}
                  {u.status === "afvist" && u.afvist_grund ? ` · ${u.afvist_grund}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
