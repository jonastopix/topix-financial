/**
 * AnsoegningView — /ansoegninger/:id (18/9): én ansøgnings egen side. Alle
 * svar, CVR-opslaget, anbefalingen med grundlaget, sporet (hvem gjorde
 * hvad hvornår — ansoegning_beslutninger, rådgivernavne fra
 * get_all_advisor_profiles), og rykkerkøen (planlagte med dato, sendte,
 * annullerede — planlagte_haendelser). Knapperne er de samme som på listen.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { kraevRaekker } from "@/lib/kraevRaekker";
import { ANSOEGNING_KEY, gemNoteOgPris, hentAnsoegning, hentVentepladserForAnsoegning, invaliderAnsoegninger, VENTEPLADSER_KEY } from "@/hooks/ansoegninger";
import { fjernFraVenteliste } from "@/lib/hjemmebane/ventelisteApi";
import { koeTekstTilRaadgiver } from "@/lib/afslagsTilbud";
import { raadgiverHentefejlTekst } from "@/lib/raadgiverHentefejl";
import { HbSection } from "@/components/hjemmebane/HbSection";
import { hbControlClasses } from "@/components/hjemmebane/admin/HbField";
import { cn } from "@/lib/utils";
import { grundlagSomTekst, OMSAETNINGSINTERVALLER_KR } from "@/lib/ansoegningAnbefaling";
import { danskTidspunkt, LUKKEAARSAG_ORD, TRIN_ORD, ventetid, virksomhedsnavnAf } from "@/lib/ansoegninger/ansoegningVisning";
import { koelinjer, sporlinjer } from "@/lib/ansoegninger/ansoegningSpor";
import { AnsoegningHandlinger } from "./AnsoegningHandlinger";
import { SamtaleAfsnit } from "./SamtaleAfsnit";
import { SendTilUnderskrift } from "../virksomhed/SendTilUnderskrift";

const Linje = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-1 gap-x-4 py-1.5 text-sm sm:grid-cols-[11rem_1fr]">
    <span className="text-hb-ink-soft">{label}</span>
    <span className="min-w-0 whitespace-pre-wrap break-words text-hb-ink">{children ?? "—"}</span>
  </div>
);

const RAADGIVERE_KEY = ["ansoegning-raadgivere"] as const;
/* eslint-disable @typescript-eslint/no-explicit-any */
async function hentRaadgivere(): Promise<Map<string, string>> {
  const res = await (supabase.rpc("get_all_advisor_profiles" as any) as any);
  const rows = kraevRaekker(res, "get_all_advisor_profiles") as { user_id: string; full_name: string | null }[];
  return new Map(rows.map((r) => [r.user_id, r.full_name ?? ""]));
}

const KILDE_ORD: Record<string, string> = { webinar: "webinaret", anbefaling: "anbefaling", linkedin: "LinkedIn", direkte: "direkte", andet: "andet" };
const START_ORD: Record<string, string> = { hurtigst_muligt: "hurtigst muligt", inden_1_maaned: "inden for en måned", inden_3_maaneder: "inden for tre måneder", senere: "senere (udgået svar)" };

export const AnsoegningView = ({ id }: { id: string | undefined }) => {
  const { user, isAdvisor } = useAuth();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: [...ANSOEGNING_KEY(id ?? "")], queryFn: () => hentAnsoegning(id!), enabled: !!id && !!user && !!isAdvisor });
  const raadgivere = useQuery({ queryKey: [...RAADGIVERE_KEY], queryFn: hentRaadgivere, enabled: !!user && !!isAdvisor, staleTime: 10 * 60_000 });
  const [note, setNote] = useState<string | null>(null);
  const ventepladser = useQuery({ queryKey: [...VENTEPLADSER_KEY(id ?? "")], queryFn: () => hentVentepladserForAnsoegning(id!), enabled: !!id && !!user && !!isAdvisor });
  const fjern = useMutation({
    mutationFn: async (ventepladsId: string) => { await fjernFraVenteliste(ventepladsId); await invaliderAnsoegninger(queryClient, id); },
    onSuccess: () => toast.success("Fjernet fra køen"),
    onError: (e: Error) => toast.error("Kunne ikke fjerne fra køen", { description: e.message }),
  });
  const gem = useMutation({
    mutationFn: async () => { await gemNoteOgPris(id!, { note: (note ?? "").trim() || null }); await invaliderAnsoegninger(queryClient, id); },
    onSuccess: () => { setNote(null); toast.success("Noten er gemt"); },
    onError: (e: Error) => toast.error("Noten blev ikke gemt", { description: e.message }),
  });

  if (!id) return <p className="text-sm text-hb-rust">Ingen ansøgning valgt.</p>;
  if (q.isLoading) return <p className="text-sm text-hb-ink-soft">Henter ansøgningen…</p>;
  if (q.isError) return <p className="text-sm text-hb-rust">{raadgiverHentefejlTekst(q.error, "ansoegningen")}</p>;
  if (!q.data) return null;

  const { ansoegning: a, beslutninger, haendelser } = q.data;
  const navn = virksomhedsnavnAf(a);
  const nu = new Date();
  const opslag = (a.cvr_opslag ?? {}) as Record<string, unknown>;
  const navnAf = (uid: string) => raadgivere.data?.get(uid) || null;
  const spor = sporlinjer(beslutninger, navnAf);
  const koe = koelinjer(haendelser);
  const interval = a.omsaetningsinterval ? OMSAETNINGSINTERVALLER_KR[a.omsaetningsinterval]?.label ?? a.omsaetningsinterval : null;

  return (
    <div className="pb-16">
      <p className="text-sm"><Link to="/ansoegninger" className="text-hb-evergreen underline-offset-4 hover:underline">← Alle ansøgninger</Link></p>
      <section className="mt-4 max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-hb-rust">{TRIN_ORD[a.trin]}</p>
        <h1 className="mt-3 font-editorial text-4xl font-medium leading-[1.1] tracking-tight text-hb-ink md:text-5xl">{navn}</h1>
        <p className="mt-2 text-sm text-hb-ink-soft">
          {[a.navn, a.email, a.telefon].filter(Boolean).join(" · ")} · indsendt {danskTidspunkt(a.indsendt_at)} · {ventetid(a.trin_sat_at, nu)} på dette trin
          {a.paa_pause_til ? ` · på pause til ${a.paa_pause_til}` : ""}{a.lukkeaarsag ? ` · ${LUKKEAARSAG_ORD[a.lukkeaarsag]}` : ""}
          {a.company_id ? <> · <Link to={`/virksomhed/${a.company_id}`} className="text-hb-evergreen underline-offset-4 hover:underline">virksomheden</Link></> : null}
        </p>
        <AnsoegningHandlinger id={a.id} navn={navn} trin={a.trin} paaPause={a.paa_pause_til !== null} lukketFraTrin={a.lukket_fra_trin} />
        {/* E-underskriften fra ansøgningen (generalprøvens brist 1, 18/9): samme komponent som
            virksomhedssiden, med ansoegning_id. Kun efter samtalen («afholdt») og ved gensendelse
            («aftalegrundlag_sendt»), aldrig på pause — samme vilkår som functionen selv stiller.
            «Send aftalegrundlag» ovenfor (indtastet link) står stadig til papir/PDF. */}
        {(a.trin === "afholdt" || a.trin === "aftalegrundlag_sendt") && a.paa_pause_til === null && (
          <div className="mt-3 rounded-hb border border-hb-line bg-hb-surface px-4 py-3" data-underskrift-fra-ansoegning>
            <SendTilUnderskrift ansoegningId={a.id} onOpdateret={() => invaliderAnsoegninger(queryClient, id)} />
          </div>
        )}
      </section>

      {(a.trin === "indkaldt" || a.trin === "booket") && !a.paa_pause_til && (
        <HbSection eyebrow="Samtalen" hairline className="mt-12">
          <SamtaleAfsnit id={a.id} navn={navn} trin={a.trin} samtaleStart={a.samtale_start} samtaleLink={a.samtale_link} />
        </HbSection>
      )}

      {(a.trin === "lukket" || (ventepladser.data?.length ?? 0) > 0) && (
        <HbSection eyebrow="Ventelisten" hairline className="mt-12">
          {ventepladser.isError ? (
            <p className="text-sm text-hb-rust">{raadgiverHentefejlTekst(ventepladser.error, "ansoegningen")}</p>
          ) : (ventepladser.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-hb-ink-soft">
              {a.afslagsgrund === "niche" ? "Grunden var nichen — men de står ikke i nogen kø. Sæt dem på ventelisten fra virksomhedssiden, eller afvis igen med en virksomhed." : "Står ikke i kø."}
            </p>
          ) : (
            <ul className="divide-y divide-hb-line text-sm" data-ventepladser={ventepladser.data!.length}>
              {ventepladser.data!.map((p) => (
                <li key={p.id} className="flex items-baseline gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-hb-ink">{p.nummer !== null ? koeTekstTilRaadgiver({ virksomhed: p.virksomhed, nummer: p.nummer, hvorfor: p.hvorfor }) : `i kø hos ${p.virksomhed} (${p.status})`}</span>
                    <span className="text-hb-ink-soft"> · sat {danskTidspunkt(p.sat_at)}{p.hvorfor ? ` · ${p.hvorfor}` : ""}</span>
                    {" "}<Link to={`/virksomhed/${p.company_id}`} className="text-hb-evergreen underline-offset-4 hover:underline">virksomheden</Link>
                  </span>
                  <button type="button" disabled={fjern.isPending} onClick={() => fjern.mutate(p.id)} className="shrink-0 text-xs text-hb-rust underline-offset-4 hover:underline disabled:opacity-50">Fjern</button>
                </li>
              ))}
            </ul>
          )}
        </HbSection>
      )}

      <HbSection eyebrow="Anbefalingen" hairline className="mt-12">
        {a.anbefaling ? (
          <div className="text-sm" data-anbefaling={a.anbefaling.udfald}>
            <p className="text-hb-ink"><span className="font-medium">{a.anbefaling.udfald === "tal_med_dem" ? "Tal med dem" : a.anbefaling.udfald === "afvis" ? "Afvis" : "Tvivl"}</span> · {grundlagSomTekst(a.anbefaling)}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div><p className="text-[11px] uppercase tracking-[0.14em] text-hb-ink-soft">Taler for</p><ul className="mt-1 list-disc pl-5 text-hb-ink">{a.anbefaling.for.map((f) => <li key={f}>{f}</li>)}{a.anbefaling.for.length === 0 && <li className="list-none text-hb-ink-soft">—</li>}</ul></div>
              <div><p className="text-[11px] uppercase tracking-[0.14em] text-hb-ink-soft">Taler imod</p><ul className="mt-1 list-disc pl-5 text-hb-ink">{a.anbefaling.imod.map((f) => <li key={f}>{f}</li>)}{a.anbefaling.imod.length === 0 && <li className="list-none text-hb-ink-soft">—</li>}</ul></div>
            </div>
            <p className="mt-2 text-xs text-hb-ink-soft">Et forslag, ikke en beslutning — beslutningen er jeres. Version {a.anbefaling.version}.</p>
          </div>
        ) : <p className="text-sm text-hb-ink-soft">Ingen anbefaling endnu.</p>}
      </HbSection>

      <HbSection eyebrow="Svarene" hairline className="mt-12">
        <div className="divide-y divide-hb-line">
          <Linje label="Største udfordring">{a.udfordring}</Linje>
          <Linje label="Har selv prøvet">{a.proevet}</Linje>
          <Linje label="Om tolv måneder">{a.om_tolv_maaneder}</Linje>
          <Linje label="Omsætning">{interval}</Linje>
          <Linje label="Ansatte">{a.antal_ansatte ?? null}</Linje>
          <Linje label="Hjemmeside">{a.hjemmeside === "" ? "har ingen" : a.hjemmeside}</Linje>
          <Linje label="Kan starte">{a.start_tidspunkt ? START_ORD[a.start_tidspunkt] ?? a.start_tidspunkt : null}</Linje>
          <Linje label="Set webinaret">{a.set_webinar === "ja" ? "ja" : a.set_webinar === "nej" ? "nej" : null}</Linje>
          <Linje label="Kilde">{`${KILDE_ORD[a.kilde] ?? a.kilde}${a.kilde_raa ? ` (${a.kilde_raa})` : ""}`}</Linje>
        </div>
      </HbSection>

      <HbSection eyebrow="CVR-opslaget" hairline className="mt-12">
        {a.cvr ? (
          <div className="divide-y divide-hb-line">
            <Linje label="CVR">{a.cvr}{a.cvr_bekraeftet ? " · bekræftet af ansøgeren" : ""}</Linje>
            <Linje label="Navn i registret">{typeof opslag.navn === "string" ? opslag.navn : null}</Linje>
            <Linje label="Stiftet">{typeof opslag.stiftet_aar === "number" ? String(opslag.stiftet_aar) : null}</Linje>
            <Linje label="Ansatte (register)">{typeof opslag.antal_ansatte === "string" ? opslag.antal_ansatte : null}</Linje>
            <Linje label="Selskabsform">{typeof opslag.selskabsform === "string" ? opslag.selskabsform : null}</Linje>
            <Linje label="Branche">{typeof opslag.branche === "string" ? opslag.branche : null}</Linje>
            <Linje label="Status">{typeof opslag.status === "string" ? opslag.status : null}</Linje>
          </div>
        ) : <p className="text-sm text-hb-ink-soft">Intet CVR-nummer.</p>}
      </HbSection>

      <HbSection eyebrow="Sporet" hairline className="mt-12">
        {spor.length === 0 ? <p className="text-sm text-hb-ink-soft">Ingen beslutninger endnu.</p> : (
          <ul className="divide-y divide-hb-line text-sm" data-spor={spor.length}>
            {spor.map((l) => (
              <li key={l.tidspunkt + l.hvad} className="py-2">
                <span className="text-hb-ink-soft">{l.naar}</span> · <span className="font-medium text-hb-ink">{l.hvem}</span> {l.hvad}
                {l.detalje && <span className="block text-hb-ink-soft">{l.detalje}</span>}
              </li>
            ))}
          </ul>
        )}
      </HbSection>

      <HbSection eyebrow="Rykkerkøen" hairline className="mt-12">
        {koe.length === 0 ? <p className="text-sm text-hb-ink-soft">Intet planlagt.</p> : (
          <ul className="divide-y divide-hb-line text-sm" data-koe={koe.length}>
            {koe.map((l, i) => (
              <li key={i} className={cn("py-2", l.status === "annulleret" || l.status === "fejlet" ? "text-hb-ink-soft" : "text-hb-ink")}>
                <span className={cn("mr-2 inline-block rounded-full px-2 py-0.5 text-[11px] uppercase tracking-[0.1em]", l.status === "planlagt" ? "bg-hb-sage/30" : l.status === "sendt" || l.status === "udfoert" ? "bg-hb-evergreen/10 text-hb-evergreen" : l.status === "fejlet" ? "bg-hb-rust/10 text-hb-rust" : "bg-hb-paper")}>{l.status}</span>
                {l.hvad} · {l.hvornaar}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-hb-ink-soft">Rykkere sendt på dette trin: {a.rykkere_sendt}.{a.aftale_url ? <> Aftalegrundlag: <a href={a.aftale_url} target="_blank" rel="noopener noreferrer" className="text-hb-evergreen underline-offset-4 hover:underline">link</a>.</> : null}</p>
      </HbSection>

      <HbSection eyebrow="Jeres note" hairline className="mt-12">
        <textarea value={note ?? a.note ?? ""} onChange={(e) => setNote(e.target.value)} rows={4} className={cn(hbControlClasses, "w-full")} placeholder="Det I vil huske om dem — kun for rådgivere." />
        <div className="mt-2">
          <button type="button" disabled={note === null || gem.isPending} onClick={() => gem.mutate()} className="rounded-full bg-hb-evergreen px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{gem.isPending ? "Gemmer…" : "Gem noten"}</button>
        </div>
      </HbSection>
    </div>
  );
};
