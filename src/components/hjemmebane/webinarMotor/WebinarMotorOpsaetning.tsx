import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { HbSection } from "@/components/hjemmebane/HbSection";
import { HbCard } from "@/components/hjemmebane/HbCard";
import { HbButton } from "@/components/hjemmebane/HbButton";
import { HbField, HbInput, HbSelect, HbTextarea } from "@/components/hjemmebane/admin/HbField";
import { useAuth } from "@/hooks/useAuth";
import { type MotorHandling, type MotorInteraktion, type MotorSession, type MotorWebinar, useMotorData, useMotorHandling } from "@/hooks/webinarMotorAdmin";
import {
  ART_NAVN,
  CTA_MAAL_NAVN,
  EDITOR_ARTER,
  EDITOR_CTA_MAAL,
  type Fejl,
  type InteraktionForm,
  kanUdgive,
  laesInteraktionForm,
  laesSessionForm,
  laesWebinarForm,
  type SessionForm,
  slugFraTitel,
  STATUS_OVERGANGE,
  tidskode,
  versioner,
  type WebinarForm,
} from "@/lib/webinarMotorAdmin/opsaetning";
import { APP_URL, tilmeldSti } from "@/lib/webinarMotor/token";
import { sessionTekst } from "@/lib/webinarRum/links";

/**
 * /webinar/motor — rådgiverens opsætning af webinarmotoren (skive 3, 30/9-2026).
 * Bag rådgiver-login (AdvisorRoute), i INGEN menu endnu. Opret webinaret
 * (titel, Bunny-GUID, varighed, CTA-tid og mål), sessioner (dansk tid, intern
 * ja/nej) og tidslinjens interaktioner (tidskode, type, tekst) i en KLADDE,
 * der udgives som én version. Formularerne dømmes i
 * lib/webinarMotorAdmin/opsaetning.ts; skrivningerne går gennem RLS
 * (hooks/webinarMotorAdmin.ts). En INTERN session får et prøvelink til
 * reserveformularen — kun husets egne adresser kan tilmelde sig (D2.7).
 */

const TOM_WEBINAR: WebinarForm = { titel: "", slug: "", bunnyGuid: "", varighed: "", vaertNavn: "Morten Larsen", lobbyMin: "15", exitrumMin: "15", ctaTid: "", ctaMaal: "ansoeg", ctaTekst: "", ctaKnap: "" };
const TOM_SESSION: SessionForm = { dato: "", tid: "11:00", intern: true, kapacitet: "" };
const TOM_INTERAKTION: InteraktionForm = { art: "cta", fra: "", til: "", placering: "overlay", tekst: "", knap: "", maal: "ansoeg", valg: "", rigtigt: "" };

const STATUS_ORD: Record<string, string> = { kladde: "kladde", aktiv: "aktiv", arkiveret: "arkiveret", planlagt: "planlagt", aaben: "åben", afholdt: "afholdt", aflyst: "aflyst" };
const PLACERING_ORD: Record<string, string> = { overlay: "Over videoen", sidepanel: "I siden", exitrum: "I exitrummet" };

function indholdKort(i: MotorInteraktion): string {
  const x = i.indhold as Record<string, unknown>;
  const t = (x.tekst ?? x.spoergsmaal ?? x.titel ?? "") as string;
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}

export const WebinarMotorOpsaetning = () => {
  const { user } = useAuth();
  const data = useMotorData();
  const handling = useMotorHandling();
  const [valgtId, setValgtId] = useState<string | null>(null);
  const [wForm, setWForm] = useState<WebinarForm>(TOM_WEBINAR);
  const [wFejl, setWFejl] = useState<Fejl>({});
  const [sForm, setSForm] = useState<SessionForm>(TOM_SESSION);
  const [sFejl, setSFejl] = useState<Fejl>({});
  const [iForm, setIForm] = useState<InteraktionForm>(TOM_INTERAKTION);
  const [iFejl, setIFejl] = useState<Fejl>({});
  const [besked, setBesked] = useState<string | null>(null);
  const [kopieret, setKopieret] = useState<string | null>(null);

  const koer = async (h: MotorHandling, efter?: () => void): Promise<void> => {
    setBesked(null);
    try {
      await handling.mutateAsync(h);
      efter?.();
    } catch (e) {
      setBesked(e instanceof Error ? e.message : "Det gik ikke.");
    }
  };

  const opretWebinar = () => {
    const dom = laesWebinarForm(wForm);
    if (dom.ok === false) { setWFejl(dom.fejl); return; }
    setWFejl({});
    void koer({ art: "opret_webinar", webinar: dom.vaerdi.webinar, cta: dom.vaerdi.cta, brugerId: user?.id ?? null }, () => setWForm(TOM_WEBINAR));
  };

  const kopier = async (tekst: string, noegle: string) => {
    try { await navigator.clipboard.writeText(tekst); setKopieret(noegle); } catch { setKopieret(null); }
  };

  const webinarer = data.data?.webinarer ?? [];
  const valgt: MotorWebinar | null = webinarer.find((w) => w.id === valgtId) ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 md:px-6" data-webinar-motor>
      <HbSection eyebrow="Webinarmotoren" title="Opsætning" hairline className="mt-10 md:mt-12">
        <p className="mb-4 text-sm text-hb-ink-soft">
          Husets egen webinarmotor. Tilmeldingen på topix.dk går stadig gennem eWebinar til efter 13/10 — her sættes webinaret og den INTERNE prøvesession op. Siden står ikke i menuen.
        </p>
        {besked && <p className="mb-4 rounded-hb border border-hb-rust/40 bg-hb-rust/5 p-3 text-sm text-hb-rust" data-motor-besked>{besked}</p>}

        {data.isError ? (
          <p className="text-sm text-hb-rust">Webinarerne kunne ikke hentes. Er migrationerne kørt (docs/webinarmotor.md §7)?</p>
        ) : data.isPending ? (
          <div className="h-16 animate-pulse rounded-hb bg-hb-line/60" />
        ) : webinarer.length === 0 ? (
          <p className="text-sm text-hb-ink-soft">Ingen webinarer endnu.</p>
        ) : (
          <ul data-motor-webinarer={webinarer.length}>
            {webinarer.map((w) => (
              <li key={w.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-hb-line py-3 last:border-b">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-hb-ink">
                    {w.titel} <span className="ml-1 text-xs font-normal uppercase tracking-[0.1em] text-hb-ink-soft">{STATUS_ORD[w.status] ?? w.status}</span>
                  </p>
                  <p className="text-xs text-hb-ink-soft">/{w.slug} · {tidskode(w.varighed_sek)} · tidslinje v{w.tidslinje_version}</p>
                </div>
                <HbButton variant="secondary" onClick={() => setValgtId(w.id === valgtId ? null : w.id)}>{w.id === valgtId ? "Luk" : "Åbn"}</HbButton>
              </li>
            ))}
          </ul>
        )}

        <HbCard className="mt-6 p-5 md:p-6">
          <p className="mb-4 text-sm font-medium text-hb-ink">Opret et webinar</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <HbField label="Titel" htmlFor="mw-titel" error={wFejl.titel}>
              <HbInput id="mw-titel" value={wForm.titel} maxLength={200} onChange={(e) => setWForm({ ...wForm, titel: e.target.value, slug: wForm.slug === slugFraTitel(wForm.titel) ? slugFraTitel(e.target.value) : wForm.slug })} />
            </HbField>
            <HbField label="Slug (adressen /w/…)" htmlFor="mw-slug" error={wFejl.slug} help="Kan ikke ændres, når der er sessioner.">
              <HbInput id="mw-slug" value={wForm.slug} maxLength={60} onChange={(e) => setWForm({ ...wForm, slug: e.target.value })} />
            </HbField>
            <HbField label="Bunny-video (GUID)" htmlFor="mw-guid" error={wFejl.bunnyGuid} help="Fra webinarbiblioteket i Bunny.">
              <HbInput id="mw-guid" value={wForm.bunnyGuid} onChange={(e) => setWForm({ ...wForm, bunnyGuid: e.target.value })} />
            </HbField>
            <HbField label="Varighed" htmlFor="mw-varighed" error={wFejl.varighed} help="Som «52:10» — præcis videoens længde.">
              <HbInput id="mw-varighed" value={wForm.varighed} inputMode="numeric" onChange={(e) => setWForm({ ...wForm, varighed: e.target.value })} />
            </HbField>
            <HbField label="Vært" htmlFor="mw-vaert">
              <HbInput id="mw-vaert" value={wForm.vaertNavn} maxLength={80} onChange={(e) => setWForm({ ...wForm, vaertNavn: e.target.value })} />
            </HbField>
            <div className="grid grid-cols-2 gap-4">
              <HbField label="Venteværelse (min)" htmlFor="mw-lobby" error={wFejl.lobbyMin}>
                <HbInput id="mw-lobby" value={wForm.lobbyMin} inputMode="numeric" onChange={(e) => setWForm({ ...wForm, lobbyMin: e.target.value })} />
              </HbField>
              <HbField label="Exitrum (min)" htmlFor="mw-exit" error={wFejl.exitrumMin}>
                <HbInput id="mw-exit" value={wForm.exitrumMin} inputMode="numeric" onChange={(e) => setWForm({ ...wForm, exitrumMin: e.target.value })} />
              </HbField>
            </div>
            <HbField label="CTA ved tidskode (valgfri)" htmlFor="mw-cta-tid" error={wFejl.ctaTid} help="Fx «41:30». Tom = ingen CTA endnu.">
              <HbInput id="mw-cta-tid" value={wForm.ctaTid} onChange={(e) => setWForm({ ...wForm, ctaTid: e.target.value })} />
            </HbField>
            <HbField label="CTA'ens mål" htmlFor="mw-cta-maal" error={wFejl.ctaMaal}>
              <HbSelect id="mw-cta-maal" value={wForm.ctaMaal} onChange={(e) => setWForm({ ...wForm, ctaMaal: e.target.value })}>
                {EDITOR_CTA_MAAL.map((m) => <option key={m} value={m}>{CTA_MAAL_NAVN[m]}</option>)}
              </HbSelect>
            </HbField>
            <HbField label="CTA-tekst" htmlFor="mw-cta-tekst" error={wFejl.ctaTekst}>
              <HbInput id="mw-cta-tekst" value={wForm.ctaTekst} maxLength={500} onChange={(e) => setWForm({ ...wForm, ctaTekst: e.target.value })} />
            </HbField>
            <HbField label="Knaptekst" htmlFor="mw-cta-knap">
              <HbInput id="mw-cta-knap" value={wForm.ctaKnap} maxLength={80} onChange={(e) => setWForm({ ...wForm, ctaKnap: e.target.value })} />
            </HbField>
          </div>
          <div className="mt-5">
            <HbButton onClick={opretWebinar} disabled={handling.isPending} data-motor-opret>
              {handling.isPending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
              Opret som kladde
            </HbButton>
          </div>
        </HbCard>
      </HbSection>

      {valgt && (
        <WebinarDetaljer
          w={valgt}
          sessioner={(data.data?.sessioner ?? []).filter((s) => s.webinar_id === valgt.id)}
          interaktioner={(data.data?.interaktioner ?? []).filter((i) => i.webinar_id === valgt.id)}
          travl={handling.isPending}
          koer={koer}
          sForm={sForm} setSForm={setSForm} sFejl={sFejl} setSFejl={setSFejl}
          iForm={iForm} setIForm={setIForm} iFejl={iFejl} setIFejl={setIFejl}
          kopier={kopier} kopieret={kopieret}
        />
      )}
    </div>
  );
};

interface DetaljerProps {
  w: MotorWebinar;
  sessioner: MotorSession[];
  interaktioner: MotorInteraktion[];
  travl: boolean;
  koer: (h: MotorHandling, efter?: () => void) => Promise<void>;
  sForm: SessionForm; setSForm: (f: SessionForm) => void; sFejl: Fejl; setSFejl: (f: Fejl) => void;
  iForm: InteraktionForm; setIForm: (f: InteraktionForm) => void; iFejl: Fejl; setIFejl: (f: Fejl) => void;
  kopier: (tekst: string, noegle: string) => Promise<void>;
  kopieret: string | null;
}

/** Det valgte webinar: status, sessioner og tidslinjen. Ingen hooks — al tilstand bor i forælderen. */
function WebinarDetaljer(p: DetaljerProps) {
  const { w } = p;
  const v = versioner(w.tidslinje_version);
  const udgivne = p.interaktioner.filter((i) => i.version === v.udgivet);
  const kladde = p.interaktioner.filter((i) => i.version === v.kladde);

  const opretSession = () => {
    const dom = laesSessionForm(p.sForm, new Date());
    if (dom.ok === false) { p.setSFejl(dom.fejl); return; }
    p.setSFejl({});
    void p.koer({ art: "opret_session", webinarId: w.id, session: dom.vaerdi }, () => p.setSForm(TOM_SESSION));
  };
  const opretInteraktion = () => {
    const dom = laesInteraktionForm(p.iForm, w.varighed_sek);
    if (dom.ok === false) { p.setIFejl(dom.fejl); return; }
    p.setIFejl({});
    void p.koer({ art: "opret_interaktion", webinarId: w.id, kladde: v.kladde, raekke: dom.vaerdi }, () => p.setIForm({ ...TOM_INTERAKTION, art: p.iForm.art, placering: p.iForm.placering }));
  };

  const art = p.iForm.art;
  return (
    <HbSection eyebrow={w.titel} title="Status, sessioner og tidslinje" hairline className="mt-10 md:mt-12" data-motor-webinar={w.id}>
      <HbCard className="p-5 md:p-6">
        <p className="text-sm text-hb-ink">
          Status: <strong>{STATUS_ORD[w.status] ?? w.status}</strong>. Kun et <em>aktivt</em> webinar kan få tilmeldinger.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(STATUS_OVERGANGE[w.status] ?? []).map((til) => (
            <HbButton key={til} variant="secondary" disabled={p.travl} onClick={() => void p.koer({ art: "status", webinarId: w.id, fra: w.status, til })}>
              Sæt til {STATUS_ORD[til]}
            </HbButton>
          ))}
        </div>
      </HbCard>

      <HbCard className="mt-6 p-5 md:p-6">
        <p className="mb-3 text-sm font-medium text-hb-ink">Sessioner</p>
        {p.sessioner.length === 0 ? (
          <p className="text-sm text-hb-ink-soft">Ingen sessioner endnu.</p>
        ) : (
          <ul>
            {p.sessioner.map((s) => {
              const link = `${APP_URL}${tilmeldSti(w.slug, s.id)}`;
              return (
                <li key={s.id} className="border-t border-hb-line py-3 last:border-b" data-motor-session={s.intern ? "intern" : "offentlig"}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm text-hb-ink">
                      <span className="first-letter:uppercase">{sessionTekst(s.starter_at)}</span>
                      <span className="ml-2 text-xs uppercase tracking-[0.1em] text-hb-ink-soft">{s.intern ? "intern prøve" : "offentlig"} · {STATUS_ORD[s.status] ?? s.status} · {s.tilmeldte} tilmeldt{s.kapacitet !== null ? ` af ${s.kapacitet}` : ""}</span>
                    </p>
                    {(s.status === "planlagt" || s.status === "aaben") && (
                      <HbButton variant="secondary" disabled={p.travl} onClick={() => void p.koer({ art: "aflys_session", sessionId: s.id, fra: s.status })}>Aflys</HbButton>
                    )}
                  </div>
                  {s.intern && s.status === "planlagt" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="break-all font-mono text-xs text-hb-ink">{link}</span>
                      <HbButton variant="secondary" onClick={() => void p.kopier(link, s.id)}>
                        <Copy className="h-4 w-4 shrink-0" /> {p.kopieret === s.id ? "Kopieret" : "Kopiér prøvelinket"}
                      </HbButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1fr_8rem_8rem_auto] md:items-end">
          <HbField label="Dato (dansk)" htmlFor="ms-dato" error={p.sFejl.dato}>
            <HbInput id="ms-dato" type="date" value={p.sForm.dato} onChange={(e) => p.setSForm({ ...p.sForm, dato: e.target.value })} />
          </HbField>
          <HbField label="Kl." htmlFor="ms-tid" error={p.sFejl.tid}>
            <HbInput id="ms-tid" type="time" value={p.sForm.tid} onChange={(e) => p.setSForm({ ...p.sForm, tid: e.target.value })} />
          </HbField>
          <HbField label="Pladser" htmlFor="ms-kap" error={p.sFejl.kapacitet} help="Tom = ingen grænse">
            <HbInput id="ms-kap" value={p.sForm.kapacitet} inputMode="numeric" onChange={(e) => p.setSForm({ ...p.sForm, kapacitet: e.target.value })} />
          </HbField>
          <HbButton onClick={opretSession} disabled={p.travl}>Opret session</HbButton>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-hb-ink">
          <input type="checkbox" checked={p.sForm.intern} onChange={(e) => p.setSForm({ ...p.sForm, intern: e.target.checked })} className="h-4 w-4 accent-[hsl(170_46%_14%)]" />
          Intern prøvesession — vises ingen steder offentligt, og kun husets egne adresser (domænerne topix.dk og theboardroom.dk) kan tilmelde sig
        </label>
      </HbCard>

      <HbCard className="mt-6 p-5 md:p-6">
        <p className="text-sm font-medium text-hb-ink">Tidslinjen</p>
        <p className="mt-1 text-xs text-hb-ink-soft">
          Udgivet: version {v.udgivet} ({udgivne.length} interaktioner). Kladden er version {v.kladde}. En session fryser den udgivne version, når venteværelset åbner — en senere udgivelse gælder kun sessioner, der ikke er begyndt.
        </p>

        {udgivne.length > 0 && (
          <ul className="mt-4">
            {udgivne.map((i) => (
              <li key={i.id} className="border-t border-hb-line py-2 text-sm text-hb-ink-soft last:border-b">
                <span className="font-mono">{tidskode(i.vis_fra_sek)}{i.vis_til_sek !== null ? `–${tidskode(i.vis_til_sek)}` : ""}</span> · {ART_NAVN[i.art as keyof typeof ART_NAVN] ?? i.art} · {indholdKort(i)}
              </li>
            ))}
          </ul>
        )}
        {udgivne.length > 0 && kladde.length === 0 && (
          <HbButton variant="secondary" className="mt-3" disabled={p.travl} onClick={() => void p.koer({ art: "kladde_fra_udgivet", webinarId: w.id, udgivne, kladde: v.kladde })}>
            Ret tidslinjen (kopiér til en kladde)
          </HbButton>
        )}

        <p className="mt-6 text-xs font-medium uppercase tracking-[0.14em] text-hb-ink-soft">Kladde · version {v.kladde}</p>
        {kladde.length === 0 ? (
          <p className="mt-2 text-sm text-hb-ink-soft">Kladden er tom.</p>
        ) : (
          <ul className="mt-2">
            {kladde.map((i) => (
              <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-hb-line py-2 last:border-b" data-motor-kladde={i.art}>
                <span className="text-sm text-hb-ink">
                  <span className="font-mono">{tidskode(i.vis_fra_sek)}{i.vis_til_sek !== null ? `–${tidskode(i.vis_til_sek)}` : ""}</span> · {ART_NAVN[i.art as keyof typeof ART_NAVN] ?? i.art} · {PLACERING_ORD[i.placering] ?? i.placering} · {indholdKort(i)}
                </span>
                <HbButton variant="link" disabled={p.travl} onClick={() => void p.koer({ art: "slet_interaktion", id: i.id })}>Slet</HbButton>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
          <HbField label="Type" htmlFor="mi-art" error={p.iFejl.art}>
            <HbSelect id="mi-art" value={art} onChange={(e) => p.setIForm({ ...p.iForm, art: e.target.value })}>
              {EDITOR_ARTER.map((a) => <option key={a} value={a}>{ART_NAVN[a]}</option>)}
            </HbSelect>
          </HbField>
          <HbField label="Fra (tidskode)" htmlFor="mi-fra" error={p.iFejl.fra}>
            <HbInput id="mi-fra" value={p.iForm.fra} placeholder="12:30" onChange={(e) => p.setIForm({ ...p.iForm, fra: e.target.value })} />
          </HbField>
          <HbField label="Til (valgfri)" htmlFor="mi-til" error={p.iFejl.til}>
            <HbInput id="mi-til" value={p.iForm.til} onChange={(e) => p.setIForm({ ...p.iForm, til: e.target.value })} />
          </HbField>
          <HbField label="Hvor" htmlFor="mi-placering" error={p.iFejl.placering}>
            <HbSelect id="mi-placering" value={p.iForm.placering} onChange={(e) => p.setIForm({ ...p.iForm, placering: e.target.value })}>
              {Object.entries(PLACERING_ORD).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </HbSelect>
          </HbField>
          <HbField label={art === "kapitel" ? "Titel" : art === "cta" ? "Tekst" : "Spørgsmål"} htmlFor="mi-tekst" className="md:col-span-2">
            <HbTextarea id="mi-tekst" rows={2} value={p.iForm.tekst} maxLength={500} onChange={(e) => p.setIForm({ ...p.iForm, tekst: e.target.value })} />
          </HbField>
          {art === "cta" && (
            <>
              <HbField label="Knaptekst" htmlFor="mi-knap">
                <HbInput id="mi-knap" value={p.iForm.knap} maxLength={80} onChange={(e) => p.setIForm({ ...p.iForm, knap: e.target.value })} />
              </HbField>
              <HbField label="Mål" htmlFor="mi-maal">
                <HbSelect id="mi-maal" value={p.iForm.maal} onChange={(e) => p.setIForm({ ...p.iForm, maal: e.target.value })}>
                  {EDITOR_CTA_MAAL.map((m) => <option key={m} value={m}>{CTA_MAAL_NAVN[m]}</option>)}
                </HbSelect>
              </HbField>
            </>
          )}
          {(art === "poll" || art === "quiz") && (
            <HbField label="Valg (ét pr. linje, 2–6)" htmlFor="mi-valg" className="md:col-span-2">
              <HbTextarea id="mi-valg" rows={3} value={p.iForm.valg} onChange={(e) => p.setIForm({ ...p.iForm, valg: e.target.value })} />
            </HbField>
          )}
          {art === "quiz" && (
            <HbField label="Rigtigt valg (nr.)" htmlFor="mi-rigtigt">
              <HbInput id="mi-rigtigt" value={p.iForm.rigtigt} inputMode="numeric" onChange={(e) => p.setIForm({ ...p.iForm, rigtigt: e.target.value })} />
            </HbField>
          )}
        </div>
        {p.iFejl.indhold && <p className="mt-2 text-sm text-hb-rust">{p.iFejl.indhold}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <HbButton onClick={opretInteraktion} disabled={p.travl}>Læg i kladden</HbButton>
          <HbButton
            variant="secondary"
            disabled={p.travl || !kanUdgive(kladde.length)}
            onClick={() => void p.koer({ art: "udgiv", webinarId: w.id, udgivet: v.udgivet, kladde: v.kladde })}
            data-motor-udgiv
          >
            Udgiv version {v.kladde}
          </HbButton>
        </div>
      </HbCard>
    </HbSection>
  );
}

export default WebinarMotorOpsaetning;
