import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for medlemmets forside PR 4b (17/9-2026) — JONAS (ordret): «Ja
// events har vært på. Og vi skal gerne kunne sætte flere værter på. Ofte er
// det både Morten og Jonas. Og somme tider har vi gæster med. Altså
// gæsteværter.» Og «Ja det er i orden» til fotoet først i «Din profil».
// Fem ting låses:
//   1. MIGRATIONEN: event_vaerter med CHECK «præcis én af user_id/gaest_navn»,
//      læsning gennem EXISTS mod events (events' egen RLS gælder), skrivning
//      som events (has_role advisor), service role — og INGEN SECURITY DEFINER.
//   2. DOMMEN ER REN: rækkefølge, opslag og teksten («Morten, Jonas og
//      gæstevært Mette Hansen») afgøres i lib/hjemmebane/vaerter (ingen
//      Supabase); forsiden og eventsiden kalder vaerterForEvent og renderer
//      HbVaerter — de sammensætter ingen egen tekst.
//   3. ADMIN: værterne gemmes SAMMEN med eventet (persist/publicér →
//      saveVaerter), udkastet valideres med samme dom som databasen
//      (validerVaerter), gæstens foto går i content-assets under vaerter/.
//   4. FOTOET FØRST i profil-fanen (ProfilFotoFelt før PROFIL_FELTER) med
//      teksten ordret; /konto bruger SAMME komponent (ingen kopi af uploadet).
//   5. FOTO-KRAVET (17/9, Jonas ordret «C» — omgør 9/9): «færdig» i tjeklisten
//      er ask_me_about OG avatar_url; profilMangler nævner «et foto»;
//      hooken læser profiles.avatar_url; begge citater står i profilUdfyldt.ts'
//      filhoved med datoerne. Community sorterer stadig på teksten alene.
// Kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret).

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");
const udenSqlKommentarer = (k: string) => k.replace(/^\s*--[^\n]*/gm, "");

const MIGRATION = "supabase/migrations/20260918130000_event_vaerter.sql";
const DOM = "src/lib/hjemmebane/vaerter.ts";
const API = "src/lib/hjemmebane/vaerterApi.ts";
const FORSIDE = "src/components/hjemmebane/boardroom/BoardroomView.tsx";
const EVENTSIDE = "src/components/hjemmebane/events/EventDetailView.tsx";
const HBVAERTER = "src/components/hjemmebane/events/HbVaerter.tsx";
const EDITOR = "src/components/hjemmebane/admin/editors/EventEditor.tsx";
const FELT = "src/components/hjemmebane/admin/editors/VaerterFelt.tsx";
const INDSTILLINGER = "src/components/hjemmebane/indstillinger/IndstillingerView.tsx";
const KONTO = "src/components/hjemmebane/konto/KontoView.tsx";
const FOTO = "src/components/hjemmebane/ProfilFotoFelt.tsx";
const PROFIL_DOM = "src/lib/hjemmebane/profilUdfyldt.ts";
const TJEKLISTE = "src/lib/onboardingTjekliste.ts";
const HOOK = "src/hooks/useOnboardingTjekliste.ts";
const SPOR = "src/lib/hjemmebane/communityMedlemmer.ts";

/** Dom 1: migrationen. */
export const migrationenHolder = (sql: string): boolean =>
  sql.includes("create table if not exists public.event_vaerter (") &&
  sql.includes("event_id         uuid not null references public.events(id) on delete cascade") &&
  sql.includes("constraint event_vaerter_en_af check (") &&
  sql.includes("(user_id is not null and gaest_navn is null)") &&
  sql.includes("or (user_id is null and gaest_navn is not null and length(trim(gaest_navn)) > 0)") &&
  sql.includes("using (exists (select 1 from public.events e where e.id = event_vaerter.event_id));") &&
  (sql.match(/public\.has_role\(auth\.uid\(\), 'advisor'\)/g) ?? []).length === 4 &&
  sql.includes("alter table public.event_vaerter enable row level security;") &&
  sql.includes("using (auth.role() = 'service_role')") &&
  !/security definer/i.test(sql);

/** Dom 2: dommen er ren og bruges begge steder. */
export const dommenErRen = (dom: string, forside: string, eventside: string, hb: string): boolean =>
  !/supabase|@tanstack|from "react"/.test(dom) &&
  dom.includes("export function vaerterForEvent(") && dom.includes("export function vaerterTekst(") &&
  dom.includes('export const GAESTEVAERT_PRAEFIKS = "gæstevært";') &&
  dom.includes("return daListe(vaerter.map((v) => (v.gaest ? `${GAESTEVAERT_PRAEFIKS} ${v.navn}` : v.fornavn)));") &&
  forside.includes("vaerter={vaerterForEvent(vaerterQuery.data ?? [], event.id, raadgivere)}") &&
  forside.includes("<HbVaerter kompakt") &&
  eventside.includes("vaerter={vaerterForEvent(vaerterQuery.data ?? [], eventId, raadgivereQuery.data ?? INGEN_RAADGIVERE)}") &&
  hb.includes("{vaerterTekst(vaerter)}") &&
  !/gæstevært|Gæstevært/.test(forside) && !/gæstevært|Gæstevært/.test(eventside);

/** Dom 3: admin gemmer værterne sammen med eventet. */
export const adminHolder = (editor: string, felt: string, api: string): boolean => {
  const mut = editor.slice(editor.indexOf("const mutation = useMutation({"), editor.indexOf("const persist = ("));
  const pub = editor.slice(editor.indexOf("const publishMutation = useMutation({"), editor.indexOf("const publicer = ("));
  return editor.includes("await saveVaerter(event.id, vaerterDraft);") &&
    mut.includes("await gemVaerter();") && pub.includes("await gemVaerter();") &&
    (editor.match(/\(vaerterDraft && validerVaerter\(vaerterDraft\)\)/g) ?? []).length === 2 &&
    editor.includes("<VaerterFelt eventId={event.id} vaerter={vaerter} onChange={setVaerterDraft}") &&
    felt.includes("uploadGaestFoto(eventId, fil)") &&
    api.includes('buildAssetPath("vaerter", eventId, file.name)') &&
    !/from\("event_vaerter"[\s\S]*?\.insert\(/.test(editor) && !/\.insert\(/.test(felt);
};

/** Dom 4: fotoet først i profil-fanen — samme komponent i /konto. */
export const fotoetFoerst = (indst: string, konto: string, foto: string): boolean => {
  const profil = indst.indexOf('{fane === "profil" && (');
  const felt = indst.indexOf('<ProfilFotoFelt variant="profil"', profil);
  const felter = indst.indexOf("{PROFIL_FELTER.map((f) => {", profil);
  return profil > -1 && felt > profil && felter > felt &&
    foto.includes('export const PROFIL_FOTO_TEKST = "Et foto gør det lettere for de andre at genkende dig";') &&
    foto.includes("{variant === \"profil\" && <p className=\"text-sm font-medium text-hb-ink\">{PROFIL_FOTO_TEKST}</p>}") &&
    foto.includes('supabase.storage.from("avatars").upload(sti, fil, { upsert: true, contentType: fil.type })') &&
    konto.includes('<ProfilFotoFelt variant="konto" />') &&
    !/storage\.from\("avatars"\)/.test(konto) && !/storage\.from\("avatars"\)/.test(indst);
};

/** Dom 5: foto-kravet — «færdig» er tekst OG foto; citaterne står i filhovedet. */
export const fotoKravetHolder = (profilDomRaa: string, profilDom: string, tjekliste: string, hook: string, spor: string): boolean =>
  profilDom.includes("return profilHarTekst(p) && profilHarFoto(p);") &&
  profilDom.includes('export const PROFIL_MANGLER_FOTO_TEKST = "et foto";') &&
  profilDom.includes("if (!profilHarFoto(p)) m.push(PROFIL_MANGLER_FOTO_TEKST);") &&
  profilDomRaa.includes("STRAM IKKE kriteriet tilbage til fire felter") && profilDomRaa.includes("Perfektion er fjenden") &&
  profilDomRaa.includes("JONAS 17/9 (ordret: «C»)") && profilDomRaa.includes("24 af 30 medlemmer") &&
  tjekliste.includes("  avatar_url: string | null;") && tjekliste.includes("  foto: PROFIL_MANGLER_FOTO_TEKST,") &&
  tjekliste.includes("const profilMangler = profilManglerDom(input);") &&
  hook.includes('.select("velkomstvideo_set_at, created_at, avatar_url")') && hook.includes("avatar_url: profil?.avatar_url ?? null,") &&
  spor.includes("return profilHarTekst(m);") && !/profilUdfyldt\(/.test(spor);

describe("eventVaerter.guard — PR 4b: migrationen, ren dom, admin gemmer sammen, fotoet først, foto-kravet", () => {
  const sql = udenSqlKommentarer(laes(MIGRATION));
  const dom = udenKommentarer(laes(DOM));
  const api = udenKommentarer(laes(API));
  const forside = udenKommentarer(laes(FORSIDE));
  const eventside = udenKommentarer(laes(EVENTSIDE));
  const hb = udenKommentarer(laes(HBVAERTER));
  const editor = udenKommentarer(laes(EDITOR));
  const felt = udenKommentarer(laes(FELT));
  const indst = udenKommentarer(laes(INDSTILLINGER));
  const konto = udenKommentarer(laes(KONTO));
  const foto = udenKommentarer(laes(FOTO));
  const profilDom = udenKommentarer(laes(PROFIL_DOM));
  const tjekliste = udenKommentarer(laes(TJEKLISTE));
  const profilDomRaa = laes(PROFIL_DOM);
  const hook = udenKommentarer(laes(HOOK));
  const spor = udenKommentarer(laes(SPOR));

  it("dom 1: migrationen — CHECK præcis én, læsning gennem events' RLS, skrivning som events, ingen SECURITY DEFINER", () => {
    expect(existsSync(resolve(process.cwd(), MIGRATION))).toBe(true);
    expect(migrationenHolder(sql)).toBe(true);
  });
  it("dom 2: vaerter.ts er ren; forsiden og eventsiden bruger vaerterForEvent + HbVaerter og skriver ingen egen «gæstevært»-tekst", () => {
    expect(dommenErRen(dom, forside, eventside, hb)).toBe(true);
  });
  it("dom 3: værterne gemmes sammen med eventet (persist og publicér), valideres med validerVaerter, gæstefoto under vaerter/", () => {
    expect(adminHolder(editor, felt, api)).toBe(true);
  });
  it("dom 4: fotoet står først i profil-fanen med teksten ordret; /konto bruger samme komponent; uploadet findes ét sted", () => {
    expect(fotoetFoerst(indst, konto, foto)).toBe(true);
  });
  it("dom 5: fotoet er et krav (17/9, «C») — profilUdfyldt kræver tekst OG foto, tjeklisten og hooken bærer avatar_url, citaterne står i filhovedet, Community sorterer på teksten", () => {
    expect(fotoKravetHolder(profilDomRaa, profilDom, tjekliste, hook, spor)).toBe(true);
  });

  it("selvbevis 1: SET NULL på event_id, en SECURITY DEFINER, eller en læseregel uden EXISTS mod events falder", () => {
    expect(migrationenHolder(sql.replace("references public.events(id) on delete cascade", "references public.events(id) on delete set null"))).toBe(false);
    expect(migrationenHolder(sql + "\ncreate function public.x() returns void language sql security definer as $$ select 1 $$;")).toBe(false);
    expect(migrationenHolder(sql.replace("using (exists (select 1 from public.events e where e.id = event_vaerter.event_id));", "using (true);"))).toBe(false);
  });
  it("selvbevis 2: en egen tekst på forsiden, eller en dom der importerer Supabase, falder", () => {
    expect(dommenErRen(dom, forside + '\n<p>Med Morten og gæstevært Mette</p>', eventside, hb)).toBe(false);
    expect(dommenErRen('import { supabase } from "@/integrations/supabase/client";\n' + dom, forside, eventside, hb)).toBe(false);
  });
  it("selvbevis 3: værter der ikke gemmes ved publicér, eller en direkte insert fra feltet, falder", () => {
    const pubFra = editor.indexOf("const publishMutation = useMutation({");
    const pubTil = editor.indexOf("const publicer = (");
    expect(adminHolder(editor.slice(0, pubFra) + editor.slice(pubFra, pubTil).replace("await gemVaerter();", "") + editor.slice(pubTil), felt, api)).toBe(false);
    expect(adminHolder(editor, felt + '\nawait supabase.from("event_vaerter").insert({});', api)).toBe(false);
  });
  it("selvbevis 4: fotoet efter felterne, eller /konto med sin egen upload, falder", () => {
    expect(fotoetFoerst(indst.replace('<ProfilFotoFelt variant="profil" className="mt-5" />', "").replace("{PROFIL_FELTER.map((f) => {", '<ProfilFotoFelt variant="profil" />{PROFIL_FELTER.map((f) => {').replace('<ProfilFotoFelt variant="profil" />{PROFIL_FELTER', '{PROFIL_FELTER') + '\n<ProfilFotoFelt variant="profil" />', konto, foto)).toBe(false);
    expect(fotoetFoerst(indst, konto + '\nawait supabase.storage.from("avatars").upload(x, y);', foto)).toBe(false);
  });
  it("selvbevis 5: dommen tilbage til teksten alene, hooken uden avatar_url, citaterne væk, eller Community på den fulde dom, falder", () => {
    expect(fotoKravetHolder(profilDomRaa, profilDom.replace("return profilHarTekst(p) && profilHarFoto(p);", "return profilHarTekst(p);"), tjekliste, hook, spor)).toBe(false);
    expect(fotoKravetHolder(profilDomRaa, profilDom, tjekliste, hook.replace('.select("velkomstvideo_set_at, created_at, avatar_url")', '.select("velkomstvideo_set_at, created_at")'), spor)).toBe(false);
    // Sætningen står to gange i filhovedet (9/9-originalen og 17/9-gengivelsen) — alle forekomster væk.
    expect(fotoKravetHolder(profilDomRaa.split("Perfektion er fjenden").join("…"), profilDom, tjekliste, hook, spor)).toBe(false);
    expect(fotoKravetHolder(profilDomRaa, profilDom, tjekliste, hook, spor.replace("return profilHarTekst(m);", "return profilUdfyldt(m);"))).toBe(false);
  });
});
