/**
 * «Mulig webinartilmelding» på rådgiverens ansøgning (udkast 1/10-2026 —
 * Jonas 1/10 08:25, «forslag + klik»).
 *
 * Fladen tegner kun: forslaget er lib/webinar/kobling.ts's dom
 * (`foreslaaWebinarKobling` + `koblingsVisning`), I/O er hooks/webinarKobling.ts.
 * Et forslag tæller ALDRIG — først klikket skriver en række i
 * `ansoegning_webinar_kobling`, og først den række tæller i tragten på /webinar.
 *
 * Tilstandene (dommens): koblet → «Koblet til webinaret 22/9 af …» + «Fjern
 * koblingen» · mail_match / intet → ingenting (mailen tæller i forvejen, eller
 * der er intet at foreslå) · forslag → op til tre kandidater med navn, dato,
 * session, status og grunden i ord + «Kobl til webinaret». Manglende tabel
 * (migrationen ikke kørt) → ingenting.
 *
 * Hooks i TOPBLOKKEN før enhver betinget return (React #310-lærdommen).
 * Rådgivernavnet slås op pr. id gennem `navnAf` fra AnsoegningView — ingen ny
 * hentning af rådgiverlisten her.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { fjernWebinarKobling, hentWebinarKobling, KANDIDAT_LOFT, koblTilWebinar, WEBINAR_KOBLING_KEY } from "@/hooks/webinarKobling";
import { WEBINAR_DASHBOARD_KEY } from "@/hooks/webinarDashboard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import {
  foreslaaWebinarKobling,
  KOBLING_FJERN_KNAP,
  KOBLING_FORSLAG_FORKLARING,
  KOBLING_FORSLAG_MAKS,
  KOBLING_FORSLAG_TITEL,
  KOBLING_KNAP,
  koblingLinje,
  loftTekst,
  koblingsVisning,
} from "@/lib/webinar/kobling";
import { datoKort, tilmeldingTekst } from "@/lib/webinarDom";
import { danskTidspunkt } from "@/lib/ansoegninger/ansoegningVisning";

export const WebinarKoblingAfsnit = ({ ansoegningId, navnAf }: { ansoegningId: string; navnAf: (uid: string) => string | null }) => {
  const { user, isAdvisor } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: [...WEBINAR_KOBLING_KEY(ansoegningId)],
    queryFn: () => hentWebinarKobling(ansoegningId),
    enabled: !!user && !!isAdvisor,
    staleTime: 60_000,
  });
  const opdater = async () => {
    await queryClient.invalidateQueries({ queryKey: [...WEBINAR_KOBLING_KEY(ansoegningId)] });
    await queryClient.invalidateQueries({ queryKey: [...WEBINAR_DASHBOARD_KEY] });
  };
  const kobl = useMutation({
    mutationFn: async (v: { tilmeldingId: string; grund: string }) => { await koblTilWebinar(ansoegningId, v.tilmeldingId, v.grund); await opdater(); },
    onSuccess: () => toast.success("Koblet til webinaret — ansøgningen tæller nu med i tragten"),
    onError: (e: Error) => toast.error("Koblingen blev ikke gemt", { description: e.message }),
  });
  const fjern = useMutation({
    mutationFn: async () => { await fjernWebinarKobling(ansoegningId); await opdater(); },
    onSuccess: () => toast.success("Koblingen er fjernet"),
    onError: (e: Error) => toast.error("Koblingen blev ikke fjernet", { description: e.message }),
  });

  if (q.isError) return <p className="mt-3 text-sm text-hb-rust">Webinarkoblingen kunne ikke hentes.</p>;
  if (q.isLoading || !q.data || !q.data.tabelFindes) return null;

  const d = q.data;
  const nu = new Date();
  // De optagne (koblet til en ANDEN ansøgning) foreslås aldrig — dommen udelukker dem (M2).
  const forslag = foreslaaWebinarKobling(d.ansoegning, d.kandidater, d.optagne).slice(0, KOBLING_FORSLAG_MAKS);
  const visning = koblingsVisning(d.kobling !== null, d.mailMatcher, forslag);

  if (visning.art === "koblet" && d.kobling) {
    return (
      <div className="mt-3 rounded-hb border border-hb-line bg-hb-surface px-4 py-3 text-sm" data-webinar-kobling="koblet">
        <p className="text-hb-ink">
          <span className="font-medium">{koblingLinje(datoKort(d.koblet?.session_tid ?? null), navnAf(d.kobling.koblet_af))}</span>
          <span className="text-hb-ink-soft"> · {danskTidspunkt(d.kobling.koblet_at)}</span>
        </p>
        {d.koblet && (
          <p className="mt-1 text-hb-ink-soft">{[d.koblet.navn, d.koblet.email, tilmeldingTekst(d.koblet, nu)].filter(Boolean).join(" · ")}</p>
        )}
        {d.kobling.grund && <p className="mt-1 text-xs text-hb-ink-soft">{d.kobling.grund}</p>}
        <button type="button" disabled={fjern.isPending} onClick={() => fjern.mutate()} className="mt-2 text-xs text-hb-rust underline-offset-4 hover:underline disabled:opacity-50">
          {fjern.isPending ? "Fjerner…" : KOBLING_FJERN_KNAP}
        </button>
      </div>
    );
  }
  if (visning.art === "intet" && d.kandidaterAfkortet) {
    // Intet forslag, men loftet er ramt: et ældre match kan mangle — det skal stå (L5).
    return <p className="mt-3 text-xs text-hb-ink-soft" data-webinar-kobling-loft>{loftTekst(KANDIDAT_LOFT)}</p>;
  }
  if (visning.art !== "forslag") return null;

  return (
    <div className="mt-3 rounded-hb border border-hb-line bg-hb-surface px-4 py-3 text-sm" data-webinar-kobling="forslag" data-forslag={visning.forslag.length}>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{KOBLING_FORSLAG_TITEL}</p>
      <p className="mt-1 text-hb-ink-soft">{KOBLING_FORSLAG_FORKLARING}</p>
      <ul className="mt-2 divide-y divide-hb-line">
        {visning.forslag.map((f) => (
          <li key={f.tilmelding.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
            <span className="min-w-0 flex-1">
              <span className="font-medium text-hb-ink">{f.tilmelding.navn ?? "uden navn"}</span>
              <span className="text-hb-ink-soft">
                {" · "}{f.tilmelding.email}
                {" · tilmeldt "}{danskTidspunkt(f.tilmelding.registreret_at ?? f.tilmelding.created_at)}
                {f.tilmelding.webinar_titel ? ` · ${f.tilmelding.webinar_titel}` : ""}
                {" · "}{tilmeldingTekst(f.tilmelding, nu)}
              </span>
              <span className="block text-xs text-hb-ink-soft">{f.grund}</span>
            </span>
            <HbButton type="button" variant="secondary" className="h-8 shrink-0 px-3 text-xs" disabled={kobl.isPending}
              onClick={() => kobl.mutate({ tilmeldingId: f.tilmelding.id, grund: f.grund })}>
              {kobl.isPending && kobl.variables?.tilmeldingId === f.tilmelding.id ? "Kobler…" : KOBLING_KNAP}
            </HbButton>
          </li>
        ))}
      </ul>
      {d.kandidaterAfkortet && <p className="mt-2 text-xs text-hb-ink-soft" data-webinar-kobling-loft>{loftTekst(KANDIDAT_LOFT)}</p>}
    </div>
  );
};
