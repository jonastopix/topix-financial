import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Kildeværn for «flyt event» (UDKAST 18/9-2026, recon-event-aendring.md §7).
// Målt: en datoændring var en almindelig UPDATE — ingen besked. Fem ting låses
// ved kildelæsning med selvbevis på kopier (dineMaal.guard-mønstret):
//   1. flyt-event: modtagerne er ALLE MED ADGANG (ÆNDRET MED VILJE 21/9,
//      Jonas' beslutning, recon-eventflytning.md): læst FØR opdateringen
//      gennem SQL-funktionen event_svar_grupper (rpc) — aldrig
//      event_registrations direkte, så reglen står ét sted; UPDATE FØR
//      writeNotificationToMany; tekst A (flyttetBesked) til de tilmeldte og
//      tekst B (nytTidspunktBesked) til de andre, begge EFTER UPDATE; en
//      kladde får ingen besked; aflyst afvises. Før 21/9 dømte værnet
//      «attending + cancelled_at null» læst direkte fra event_registrations;
//      den præmis er væk, fordi funktionen ikke længere må have en egen
//      modtagerregel (eventSvar.guard dømmer SQL'ens regel).
//   2. Editoren sender aldrig starts_at/ends_at til updateEvent for et
//      publiceret event: gem-vejen er gemEventEllerFlyt → planlaegGem, hvor
//      tiden går til flytEvent og kun resten til updateEvent. Linjen er
//      siden 21/9 «const flytSvar = plan.flytning ? await flytEvent(…) : null;»
//      — svaret returneres til editoren som kvittering (flytSvarTekst,
//      beviset på skærmen); før var det «if (plan.flytning) await flytEvent(…);».
//   3. event-reminders' dedup-nøgler for A og B bærer dagen; C bærer
//      starttidspunktet (omEnTimeBesked) — rettet 18/9.
//   4. config.toml: flyt-event med verify_jwt = true (Bucket A-reglen).
//   5. flyttetBesked's OG nytTidspunktBesked's dedup_key bærer den nye
//      starttid gennem flytningDedupKey (ellers spærrer den første flytning
//      for den næste) — ÆNDRET 21/9: før lå nøglen som literal i
//      flyttetBesked (`event_flyttet:${e.id}:${nyIso}`); nu deler A og B én
//      funktion, så én person aldrig får begge tekster for samme flytning.

const laes = (sti: string) => readFileSync(resolve(process.cwd(), sti), "utf8");
const udenKommentarer = (k: string) =>
  k.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/^\s*\/\/[^\n]*/gm, "").replace(/\s\/\/\s[^\n]*/g, "");

const FUNKTION = "supabase/functions/flyt-event/index.ts";
const API = "src/lib/hjemmebane/adminContentApi.ts";
const EDITOR = "src/components/hjemmebane/admin/editors/EventEditor.tsx";
const REMINDERS = "supabase/functions/event-reminders/index.ts";
const MAILS = "supabase/functions/_shared/eventMails.ts";

const fn = udenKommentarer(laes(FUNKTION));
const api = udenKommentarer(laes(API));
const editor = udenKommentarer(laes(EDITOR));
const reminders = udenKommentarer(laes(REMINDERS));
const mails = udenKommentarer(laes(MAILS));

/** 1: funktionens rækkefølge og modtagerregel. */
export function funktionDom(k: string): string[] {
  const fejl: string[] = [];
  const auth = k.indexOf("authenticateUser(");
  const client = k.indexOf("createClient(");
  const regs = k.indexOf('admin.rpc("event_svar_grupper", { p_event_id: eventId })');
  const update = k.indexOf('.from("events").update(patch)');
  const besked = k.indexOf("writeNotificationToMany(");
  const beskedB = k.lastIndexOf("writeNotificationToMany(");
  if (auth < 0 || client < 0 || auth > client) fejl.push("authenticateUser står ikke før createClient");
  if (!/_role|user_roles/.test(k) || !k.includes('.in("role", ["advisor", "admin"])')) fejl.push("ingen advisor/admin-gate");
  if (regs < 0 || update < 0 || besked < 0) fejl.push("modtagere, update eller besked mangler");
  if (!(regs < update && update < besked)) fejl.push("rækkefølgen er ikke modtagere → UPDATE → besked");
  if (k.includes('.from("event_registrations")')) fejl.push("læser event_registrations direkte — en egen modtagerregel ved siden af event_svar_grupper");
  if (!k.includes("delModtagere(")) fejl.push("grupperne deles ikke med delModtagere (A/B)");
  if (!k.includes("flyttetBesked(tilMail, event.starts_at)")) fejl.push("tekst A er ikke flyttetBesked");
  if (!k.includes("nytTidspunktBesked(tilMail, event.starts_at)")) fejl.push("tekst B er ikke nytTidspunktBesked");
  if (beskedB === besked || beskedB < update) fejl.push("A og B sendes ikke som to skrivninger efter UPDATE");
  if (!/if \(event\.status !== "published"\) \{[\s\S]{0,300}return json\(/.test(k)) fejl.push("en kladde ville få besked");
  if (!k.includes('event.status === "cancelled"')) fejl.push("aflyst afvises ikke");
  if (!k.includes("erFlytning(event, patch)")) fejl.push("uændret tid er ikke en no-op");
  return fejl;
}

/** 2: editoren og API'et — tiden går aldrig til updateEvent for et publiceret event. */
export function editorDom(editorK: string, apiK: string): string[] {
  const fejl: string[] = [];
  const mut = editorK.slice(editorK.indexOf("const mutation = useMutation({"), editorK.indexOf("const persist = ("));
  if (!mut.includes("gemEvent: () => gemEventEllerFlyt(event, patch),")) fejl.push("mutationFn går ikke gennem gemEventEllerFlyt");
  if (/await updateEvent\(|updateEvent\(event\.id, patch\)/.test(mut)) fejl.push("mutationFn kalder updateEvent direkte");
  const gem = apiK.slice(apiK.indexOf("export async function gemEventEllerFlyt("));
  const krop = gem.slice(0, gem.indexOf("\n}\n") + 3);
  if (!krop.includes("const plan = planlaegGem(event, patch as Record<string, unknown>);")) fejl.push("gemEventEllerFlyt dømmer ikke med planlaegGem");
  if (!krop.includes("await updateEvent(event.id, plan.rest as")) fejl.push("resten går ikke til updateEvent");
  if (!krop.includes("const flytSvar = plan.flytning ? await flytEvent(event.id, plan.flytning) : null;")) fejl.push("flytningen går ikke til flytEvent (eller svaret returneres ikke)");
  if (!krop.includes("return { row, flytSvar };")) fejl.push("flyt-events svar returneres ikke til editoren");
  if (/updateEvent\(event\.id, patch\b/.test(krop)) fejl.push("hele patchen sendes til updateEvent");
  if (krop.indexOf("await updateEvent(") > krop.indexOf("await flytEvent(")) fejl.push("flytningen står før resten (beskeden ville bære den gamle titel)");
  if (!/functions\.invoke\("flyt-event"/.test(apiK)) fejl.push("flytEvent kalder ikke flyt-event");
  return fejl;
}

/** 3: dedup-nøglerne A og B bærer dagen; C bærer starttidspunktet. */
export function remindersDom(k: string, mailsK: string): string[] {
  const fejl: string[] = [];
  if (!k.includes("dedup_key: `event_reminder:${event.id}:a:${eventDay}`,")) fejl.push("A-nøglen bærer ikke dagen");
  if (!k.includes("dedup_key: `event_reminder:${event.id}:b:${eventDay}`,")) fejl.push("B-nøglen bærer ikke dagen");
  if (/event_reminder:\$\{event\.id\}:[ab]`/.test(k)) fejl.push("en gammel nøgle uden dag står stadig");
  const c = mailsK.slice(mailsK.indexOf("export function omEnTimeBesked("));
  if (!c.includes("const startIso = new Date(e.starts_at).toISOString();") || !c.includes("dedup_key: `event_reminder:${e.id}:c:${startIso}`,")) fejl.push("C-nøglen bærer ikke starttidspunktet");
  if (!k.includes("notifiedC += await writeNotificationToMany(admin, recipients, omEnTimeBesked(event));")) fejl.push("C sendes ikke gennem omEnTimeBesked");
  return fejl;
}

/** 5: A's og B's dedup bærer den nye starttid — gennem ÉN funktion (21/9). */
export function beskedDom(k: string): string | null {
  const noegle = k.slice(k.indexOf("export function flytningDedupKey("), k.indexOf("export function flyttetBesked("));
  if (!noegle.includes("return `event_flyttet:${eventId}:${new Date(nyStartsAt).toISOString()}`;")) return "flytningDedupKey bærer ikke den nye starttid som ISO";
  const a = k.slice(k.indexOf("export function flyttetBesked("), k.indexOf("export function nytTidspunktBesked("));
  if (!a.includes('type: "event_flyttet"')) return "A's type er ikke event_flyttet";
  if (!a.includes("dedup_key: flytningDedupKey(e.id, e.starts_at),")) return "A's dedup går ikke gennem flytningDedupKey";
  const b = k.slice(k.indexOf("export function nytTidspunktBesked("));
  if (!b.includes('type: "event_nyt_tidspunkt"')) return "B's type er ikke event_nyt_tidspunkt";
  if (!b.includes("dedup_key: flytningDedupKey(e.id, e.starts_at),")) return "B's dedup går ikke gennem flytningDedupKey";
  return null;
}

describe("flytEvent.guard — flyt-event, editoren, reminders, config og beskeden", () => {
  it("1: funktionen — alle med adgang læses før (event_svar_grupper), UPDATE før A og B, kladde tavs, aflyst afvist, uændret no-op", () => expect(funktionDom(fn)).toEqual([]));
  it("2: editoren sender aldrig tiden til updateEvent for et publiceret event; resten før flytningen", () => expect(editorDom(editor, api)).toEqual([]));
  it("3: reminders' A- og B-nøgler bærer dagen, C bærer starttidspunktet", () => expect(remindersDom(reminders, mails)).toEqual([]));
  it("4: config.toml har flyt-event med verify_jwt = true", () => {
    expect(laes("supabase/config.toml")).toMatch(/\[functions\.flyt-event\]\s*\n\s*verify_jwt = true/);
  });
  it("5: A's og B's dedup bærer den nye starttid gennem flytningDedupKey", () => expect(beskedDom(mails)).toBeNull());
});

describe("selvbevis — hvert prædikat fælder en muteret kopi", () => {
  it("1: besked før UPDATE, modtagere fra event_registrations direkte, kun én tekst, eller en kladde med besked, falder", () => {
    const foer = fn.replace('.from("events").update(patch)', '.from("events").select("id")') + '\nawait admin.from("events").update(patch).eq("id", eventId);\n';
    expect(funktionDom(foer)).not.toEqual([]);
    expect(funktionDom(fn.replace('admin.rpc("event_svar_grupper", { p_event_id: eventId })', 'admin.from("event_registrations").select("user_id").eq("event_id", eventId)'))).not.toEqual([]);
    expect(funktionDom(fn.replace("nytTidspunktBesked(tilMail, event.starts_at)", "flyttetBesked(tilMail, event.starts_at)"))).not.toEqual([]);
    expect(funktionDom(fn.replace('if (event.status !== "published") {', "if (false) {"))).not.toEqual([]);
  });
  it("2: den gamle mutationFn (updateEvent direkte), eller en gemEventEllerFlyt der sender hele patchen, falder", () => {
    expect(editorDom(editor.replace("gemEvent: () => gemEventEllerFlyt(event, patch),", "gemEvent: () => updateEvent(event.id, patch),"), api)).not.toEqual([]);
    expect(editorDom(editor, api.replace("await updateEvent(event.id, plan.rest as Tables[\"events\"][\"Update\"])", "await updateEvent(event.id, patch)"))).not.toEqual([]);
    expect(editorDom(editor, api.replace("const flytSvar = plan.flytning ? await flytEvent(event.id, plan.flytning) : null;", "const flytSvar = null;"))).not.toEqual([]);
    expect(editorDom(editor, api.replace("return { row, flytSvar };", "return { row, flytSvar: null };"))).not.toEqual([]);
  });
  it("3: en nøgle uden dag, eller en C-nøgle uden tid, falder", () => {
    expect(remindersDom(reminders.replace("dedup_key: `event_reminder:${event.id}:b:${eventDay}`,", "dedup_key: `event_reminder:${event.id}:b`,"), mails)).not.toEqual([]);
    expect(remindersDom(reminders, mails.replace("dedup_key: `event_reminder:${e.id}:c:${startIso}`,", "dedup_key: `event_reminder:${e.id}:c`,"))).not.toEqual([]);
  });
  it("5: en nøgle uden starttid, eller en B med egen nøgle (så én person kan få begge), falder", () => {
    expect(beskedDom(mails.replace("return `event_flyttet:${eventId}:${new Date(nyStartsAt).toISOString()}`;", "return `event_flyttet:${eventId}`;"))).not.toBeNull();
    const b = mails.indexOf("export function nytTidspunktBesked(");
    const egenNoegle = mails.slice(0, b) + mails.slice(b).replace("dedup_key: flytningDedupKey(e.id, e.starts_at),", "dedup_key: `event_nyt_tidspunkt:${e.id}`,");
    expect(beskedDom(egenNoegle)).not.toBeNull();
  });
});
